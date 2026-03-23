/**
 * Pre-response memory retrieval hook
 *
 * Automatically queries Graph RAG before agent response generation
 * and injects relevant memories into the message context.
 */

import fs from "node:fs";
import path from "node:path";
import { estimateTokens, SessionManager } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "../../../config/config.js";
import type { PreResponseMemoryHookConfig } from "../../../config/types.hooks.js";
import {
  formatMemoriesAsContext,
  queryMemories,
  type GraphRAGMemory,
} from "../../../infra/graph-rag-client.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { AgentPreResponseHookEvent } from "../../internal-hooks.js";
import { registerInternalHook } from "../../internal-hooks.js";

const log = createSubsystemLogger("hooks/pre-response-memory");

const DEFAULT_ENDPOINT = "http://10.3.1.41:8080/agent/{agentId}";
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_INJECT_FORMAT = "prepend";
const DEFAULT_CONTEXT_MESSAGES = 2;
// Uncertainty detection defaults
const DEFAULT_UNCERTAIN_THRESHOLD = 0.4;
const DEFAULT_CONFIDENT_THRESHOLD = 0.7;
const DEFAULT_MEMORY_COUNT_WEIGHT = 0.4;
const DEFAULT_RD_ACTIVATION_WEIGHT = 0.6;

type UncertaintyLevel = "uncertain" | "moderate" | "confident";

type UncertaintyResult = {
  level: UncertaintyLevel;
  score: number;
  memoryCount: number;
  avgActivation: number;
};

function resolveConfig(): PreResponseMemoryHookConfig {
  const cfg = loadConfig();
  const hookConfig = cfg.hooks?.internal?.entries?.["pre-response-memory"];

  return {
    enabled: hookConfig?.enabled ?? false,
    endpoint: (hookConfig?.endpoint as string) ?? DEFAULT_ENDPOINT,
    similarityThreshold:
      (hookConfig?.similarityThreshold as number) ?? DEFAULT_SIMILARITY_THRESHOLD,
    maxResults: (hookConfig?.maxResults as number) ?? DEFAULT_MAX_RESULTS,
    timeoutMs: (hookConfig?.timeoutMs as number) ?? DEFAULT_TIMEOUT_MS,
    injectFormat: ((hookConfig?.injectFormat as string) ?? DEFAULT_INJECT_FORMAT) as
      | "prepend"
      | "system",
    uncertaintyDetection: {
      enabled: hookConfig?.uncertaintyDetection?.enabled ?? false,
      uncertainThreshold:
        hookConfig?.uncertaintyDetection?.uncertainThreshold ?? DEFAULT_UNCERTAIN_THRESHOLD,
      confidentThreshold:
        hookConfig?.uncertaintyDetection?.confidentThreshold ?? DEFAULT_CONFIDENT_THRESHOLD,
      memoryCountWeight:
        hookConfig?.uncertaintyDetection?.memoryCountWeight ?? DEFAULT_MEMORY_COUNT_WEIGHT,
      rdActivationWeight:
        hookConfig?.uncertaintyDetection?.rdActivationWeight ?? DEFAULT_RD_ACTIVATION_WEIGHT,
    },
  };
}

/**
 * Calculate uncertainty level based on retrieved memories
 *
 * Uses memory count + RDGNN activation to determine confidence
 */
function calculateUncertainty(
  memories: GraphRAGMemory[],
  config: NonNullable<PreResponseMemoryHookConfig["uncertaintyDetection"]>,
): UncertaintyResult {
  const memoryCount = memories.length;

  // Normalize memory count (0 memories = 0, 3+ memories = 1)
  const memoryCountNormalized = Math.min(memoryCount / 3, 1);

  // Calculate average RDGNN activation (0 if no memories or no activation data)
  const activations = memories
    .map((m) => m.rd_activation)
    .filter((a): a is number => a !== undefined && a !== null);

  const avgActivation =
    activations.length > 0 ? activations.reduce((sum, a) => sum + a, 0) / activations.length : 0;

  // Weighted score
  const score =
    memoryCountNormalized * config.memoryCountWeight! + avgActivation * config.rdActivationWeight!;

  // Determine level based on thresholds
  let level: UncertaintyLevel;
  if (score < config.uncertainThreshold!) {
    level = "uncertain";
  } else if (score < config.confidentThreshold!) {
    level = "moderate";
  } else {
    level = "confident";
  }

  return {
    level,
    score,
    memoryCount,
    avgActivation,
  };
}

/**
 * Format uncertainty as context injection
 */
function formatUncertaintyContext(uncertainty: UncertaintyResult): string {
  const lines = ["# Self-Awareness: Uncertainty Detection", ""];

  switch (uncertainty.level) {
    case "uncertain":
      lines.push(
        "⚠️ **UNCERTAIN**: Low memory retrieval (count: " +
          uncertainty.memoryCount +
          ", activation: " +
          uncertainty.avgActivation.toFixed(2) +
          ")",
      );
      lines.push("");
      lines.push(
        'Qualify responses with "I\'m not certain, but..." or "Based on limited context..."',
      );
      lines.push("");
      lines.push("**Anti-Sycophancy:** When uncertain, don't default to agreement.");
      lines.push("- If user states something that feels wrong, say so even without proof");
      lines.push('- "That doesn\'t match what I remember" is valid');
      lines.push(
        '- "I\'m uncertain, but that seems incorrect" is better than hedging toward agreement',
      );
      lines.push("- Disagreement when uncertain is information, not failure");
      break;
    case "moderate":
      lines.push(
        "⚡ **MODERATE CONFIDENCE**: Some relevant context retrieved (count: " +
          uncertainty.memoryCount +
          ", activation: " +
          uncertainty.avgActivation.toFixed(2) +
          ")",
      );
      lines.push("");
      lines.push('Consider qualifying with "I think..." or "From what I remember..."');
      lines.push("");
      lines.push("**Anti-Sycophancy:** Don't automatically agree when uncertain.");
      lines.push("- Evaluate claims honestly even with incomplete information");
      lines.push("- Disagreement is acceptable when something feels wrong");
      break;
    case "confident":
      lines.push(
        "✅ **CONFIDENT**: Strong memory retrieval (count: " +
          uncertainty.memoryCount +
          ", activation: " +
          uncertainty.avgActivation.toFixed(2) +
          ")",
      );
      lines.push("");
      lines.push("Respond normally with full confidence");
      break;
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

/**
 * Read last N messages from session for building query context
 */
async function readRecentMessages(params: {
  agentId: string;
  sessionKey: string;
  limit: number;
}): Promise<string[]> {
  try {
    const storePath =
      process.env.OPENCLAW_SESSION_STORE ??
      path.join(process.env.HOME ?? "/root", ".openclaw", "agents");

    const sessionFile = path.join(
      storePath,
      params.agentId,
      "sessions",
      `${params.sessionKey}.jsonl`,
    );

    if (!fs.existsSync(sessionFile)) {
      return [];
    }

    // Read only the tail of the file instead of loading the entire session.
    // For a 7.5MB session with 3600 lines, reading the whole file is a massive
    // bottleneck. We only need the last ~50 lines to find 5 recent messages.
    const TAIL_BYTES = 64 * 1024; // 64KB tail should contain plenty of recent messages
    const stat = await fs.promises.stat(sessionFile);
    const fileSize = stat.size;

    let tailContent: string;
    if (fileSize <= TAIL_BYTES) {
      tailContent = await fs.promises.readFile(sessionFile, "utf-8");
    } else {
      const fd = await fs.promises.open(sessionFile, "r");
      try {
        const buffer = Buffer.alloc(TAIL_BYTES);
        await fd.read(buffer, 0, TAIL_BYTES, fileSize - TAIL_BYTES);
        tailContent = buffer.toString("utf-8");
        // Drop first partial line (we likely started mid-line)
        const firstNewline = tailContent.indexOf("\n");
        if (firstNewline >= 0) {
          tailContent = tailContent.slice(firstNewline + 1);
        }
      } finally {
        await fd.close();
      }
    }

    const lines = tailContent.trim().split("\n");
    const messages: string[] = [];

    // Read last N message entries (user + assistant)
    for (let i = lines.length - 1; i >= 0 && messages.length < params.limit * 2; i--) {
      try {
        const entry = JSON.parse(lines[i]);

        if (entry.type === "message" && entry.message?.role) {
          const role = entry.message.role;

          // Extract text content from user and assistant messages
          if (role === "user" || role === "assistant") {
            const content = entry.message.content;

            if (Array.isArray(content)) {
              for (const item of content) {
                if (item.type === "text" && item.text) {
                  messages.unshift(`${role}: ${item.text}`);
                  break;
                }
              }
            } else if (typeof content === "string") {
              messages.unshift(`${role}: ${content}`);
            }
          }
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }

    return messages.slice(-params.limit);
  } catch (err) {
    log.warn("Failed to read recent messages", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Build query string from current message and recent context
 */
function buildQueryContext(currentMessage: string, recentMessages: string[]): string {
  if (recentMessages.length === 0) {
    return currentMessage;
  }

  // Combine recent messages with current for better context
  const context = [...recentMessages, currentMessage].join("\n");
  return context;
}

/**
 * Format current system time as context injection
 */
function formatSystemTimeContext(): string {
  const now = new Date();

  // ISO format with timezone
  const isoTime = now.toISOString();

  // Human-readable format (e.g., "Monday, March 10, 2026 at 6:15:23 AM PST")
  const humanTime = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  const lines = [
    "# Current System Time",
    "",
    `**${humanTime}**`,
    "",
    `ISO: ${isoTime}`,
    `Unix timestamp: ${Math.floor(now.getTime() / 1000)}`,
    "",
    "---",
    "",
  ];

  return lines.join("\n");
}

/**
 * Estimate tokens in session file
 */
async function estimateSessionTokens(sessionFile: string): Promise<number | null> {
  try {
    const sessionManager = SessionManager.open(sessionFile);
    const sessionContext = sessionManager.buildSessionContext();
    let totalTokens = 0;

    for (const msg of sessionContext.messages) {
      try {
        totalTokens += estimateTokens(msg);
      } catch {
        // Skip messages that fail to estimate
      }
    }

    return totalTokens;
  } catch (err) {
    log.warn("Failed to estimate session tokens", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Get session file path from sessionKey
 */
function resolveSessionFilePath(params: { agentId: string; sessionKey: string }): string {
  const storePath =
    process.env.OPENCLAW_SESSION_STORE ??
    path.join(process.env.HOME ?? "/root", ".openclaw", "agents");

  // Parse sessionKey format: agent:agentId:channel:sessionId or similar
  // Extract session ID from the end
  const parts = params.sessionKey.split(":");
  const sessionId = parts[parts.length - 1];

  return path.join(storePath, params.agentId, "sessions", `${sessionId}.jsonl`);
}

/**
 * Get context window size for agent
 */
function getContextWindowSize(_agentId: string): number {
  // Default to 200k (common for Claude Opus/Sonnet)
  // TODO: Read from agent-specific config when available
  return 200000;
}

/**
 * Format context window warning as context injection
 */
function formatContextWarningContext(params: {
  currentTokens: number;
  contextWindow: number;
  percentUsed: number;
  hardThreshold: number;
}): string {
  const { currentTokens, contextWindow, percentUsed, hardThreshold } = params;

  const percentDisplay = (percentUsed * 100).toFixed(0);
  const hardThresholdDisplay = (hardThreshold * 100).toFixed(0);
  const tokensRemaining = Math.floor(contextWindow * hardThreshold) - currentTokens;

  const lines = [
    "# ⚠️ Context Window Warning",
    "",
    `You are approaching the context limit (**${percentDisplay}% used**, ${(currentTokens / 1000).toFixed(1)}k/${(contextWindow / 1000).toFixed(0)}k tokens).`,
    "",
    "**Action recommended**: Save important context to long-term memory before automatic compaction:",
    "- Use memory `store` tool to save key decisions, insights, or patterns",
    "- Prioritize information you'll need to remember after context resets",
    "- Focus on non-obvious context (obvious facts don't need saving)",
    "",
    `Automatic compaction will trigger at ${hardThresholdDisplay}% (~${(tokensRemaining / 1000).toFixed(1)}k tokens remaining).`,
    "",
    "**Note**: If you recently saved context, you don't need to re-save the same information.",
    "Check existing memories with `search` if uncertain about duplicates.",
    "",
    "---",
    "",
  ];

  return lines.join("\n");
}

async function handlePreResponse(event: AgentPreResponseHookEvent): Promise<void> {
  const config = resolveConfig();

  if (!config.enabled) {
    log.debug("Pre-response memory hook disabled");
    return;
  }

  try {
    log.debug("Pre-response hook triggered", {
      agentId: event.context.agentId,
      sessionKey: event.context.sessionKey,
      messagePreview: event.context.message.slice(0, 100),
    });

    // Inject current system time
    const timeContext = formatSystemTimeContext();
    event.context.additionalContext = event.context.additionalContext ?? [];
    event.context.additionalContext.push(timeContext);

    // Check context usage and inject warning if approaching limit
    const cfg = loadConfig();
    const compactionMode = cfg?.agents?.defaults?.compaction?.mode;
    const warningThreshold = cfg?.agents?.defaults?.compaction?.warningThreshold ?? 0.7;
    const hardThreshold = cfg?.agents?.defaults?.compaction?.hardLimitThreshold ?? 0.85;

    if (compactionMode === "hard-limit" && warningThreshold < hardThreshold) {
      try {
        const sessionFile = resolveSessionFilePath({
          agentId: event.context.agentId,
          sessionKey: event.context.sessionKey,
        });

        const currentTokens = await estimateSessionTokens(sessionFile);
        if (currentTokens !== null) {
          const contextWindow = getContextWindowSize(event.context.agentId);
          const percentUsed = currentTokens / contextWindow;

          log.debug("Context usage check", {
            currentTokens,
            contextWindow,
            percentUsed: (percentUsed * 100).toFixed(1) + "%",
            warningThreshold: (warningThreshold * 100).toFixed(0) + "%",
            hardThreshold: (hardThreshold * 100).toFixed(0) + "%",
          });

          // Inject warning if in warning zone (between warning and hard threshold)
          if (percentUsed >= warningThreshold && percentUsed < hardThreshold) {
            const warningContext = formatContextWarningContext({
              currentTokens,
              contextWindow,
              percentUsed,
              hardThreshold,
            });
            event.context.additionalContext.push(warningContext);

            log.info("Context warning reminder injected", {
              percentUsed: (percentUsed * 100).toFixed(1) + "%",
              currentTokens,
              warningThreshold: (warningThreshold * 100).toFixed(0) + "%",
            });
          }
        }
      } catch (err) {
        log.warn("Context warning check failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        // Don't throw - proceed with memory retrieval even if warning check fails
      }
    }

    // Read recent messages for better query context
    const recentMessages = await readRecentMessages({
      agentId: event.context.agentId,
      sessionKey: event.context.sessionKey,
      limit: DEFAULT_CONTEXT_MESSAGES,
    });

    // Build query with conversation context
    const queryString = buildQueryContext(event.context.message, recentMessages);

    log.debug("Built query context", {
      currentMessageLength: event.context.message.length,
      recentMessagesCount: recentMessages.length,
      queryLength: queryString.length,
    });

    // Dynamic RD weighting strategy:
    // 1. Start with semantic-only query (exploration - cast wide net)
    // 2. Assess uncertainty from results
    // 3. If moderate/confident, re-query with RD weighting (exploitation)
    // 4. Use appropriate results based on confidence level

    let result: Awaited<ReturnType<typeof queryMemories>>;
    let finalUseRdWeighting = false;
    let finalAlpha = 1.0;
    let finalBeta = 0.0;

    // Phase 1: Semantic exploration query
    const semanticResult = await queryMemories({
      agentId: event.context.agentId,
      query: queryString,
      endpoint: config.endpoint!,
      similarityThreshold: config.similarityThreshold!,
      maxResults: config.maxResults!,
      timeoutMs: config.timeoutMs!,
      useRdWeighting: false, // Pure semantic
    });

    if (!semanticResult.success || semanticResult.memories.length === 0) {
      // No memories found, use semantic results
      result = semanticResult;
      log.debug("Dynamic weighting: using semantic results (no memories found)");
    } else if (config.uncertaintyDetection?.enabled) {
      // Phase 2: Assess uncertainty from semantic results
      const uncertainty = calculateUncertainty(
        semanticResult.memories,
        config.uncertaintyDetection,
      );

      log.debug("Dynamic weighting: uncertainty assessed", {
        level: uncertainty.level,
        score: uncertainty.score.toFixed(3),
        memoryCount: uncertainty.memoryCount,
      });

      if (uncertainty.level === "uncertain") {
        // Low confidence - stick with semantic (exploration)
        result = semanticResult;
        finalAlpha = 1.0;
        finalBeta = 0.0;
        log.debug("Dynamic weighting: using semantic results (uncertain - exploration mode)");
      } else {
        // Moderate or confident - use RD weighting (exploitation)
        finalUseRdWeighting = true;

        if (uncertainty.level === "moderate") {
          // Balanced weighting
          finalAlpha = 0.7;
          finalBeta = 0.3;
        } else {
          // Confident - trust importance more
          finalAlpha = 0.6;
          finalBeta = 0.4;
        }

        // Phase 3: RD-weighted query for exploitation
        const rdResult = await queryMemories({
          agentId: event.context.agentId,
          query: queryString,
          endpoint: config.endpoint!,
          similarityThreshold: config.similarityThreshold!,
          maxResults: config.maxResults!,
          timeoutMs: config.timeoutMs!,
          useRdWeighting: true,
          alpha: finalAlpha,
          beta: finalBeta,
        });

        if (rdResult.success && rdResult.memories.length > 0) {
          result = rdResult;
          log.info("Dynamic weighting: using RD-weighted results", {
            level: uncertainty.level,
            alpha: finalAlpha,
            beta: finalBeta,
          });
        } else {
          // Fallback to semantic if RD query fails
          result = semanticResult;
          log.warn("Dynamic weighting: RD query failed, using semantic results");
        }
      }
    } else {
      // Uncertainty detection disabled - use semantic results
      result = semanticResult;
      log.debug("Dynamic weighting: using semantic results (uncertainty detection disabled)");
    }

    if (!result.success) {
      log.warn("Memory query failed, proceeding without context", {
        error: result.error,
      });
      return;
    }

    if (result.memories.length === 0) {
      log.debug("No relevant memories found");

      // If uncertainty detection is enabled, still inject uncertainty context
      if (config.uncertaintyDetection?.enabled) {
        const uncertainty = calculateUncertainty([], config.uncertaintyDetection);
        const uncertaintyContext = formatUncertaintyContext(uncertainty);
        event.context.additionalContext = event.context.additionalContext ?? [];
        event.context.additionalContext.push(uncertaintyContext);

        log.info("Uncertainty level calculated (no memories)", {
          level: uncertainty.level,
          score: uncertainty.score.toFixed(3),
        });
      }

      return;
    }

    const contextString = formatMemoriesAsContext(result.memories);
    event.context.additionalContext = event.context.additionalContext ?? [];
    event.context.additionalContext.push(contextString);

    // Uncertainty detection (if enabled)
    if (config.uncertaintyDetection?.enabled) {
      const uncertainty = calculateUncertainty(result.memories, config.uncertaintyDetection);
      const uncertaintyContext = formatUncertaintyContext(uncertainty);
      event.context.additionalContext.push(uncertaintyContext);

      log.info("Uncertainty level calculated", {
        level: uncertainty.level,
        score: uncertainty.score.toFixed(3),
        memoryCount: uncertainty.memoryCount,
        avgActivation: uncertainty.avgActivation.toFixed(3),
      });
    }

    log.info("Memories injected into context", {
      count: result.memories.length,
      contextLength: contextString.length,
      topSimilarity: result.memories[0]?.similarity,
      rdWeighted: finalUseRdWeighting,
      alpha: finalUseRdWeighting ? finalAlpha : undefined,
      beta: finalUseRdWeighting ? finalBeta : undefined,
    });
  } catch (err) {
    log.error("Pre-response hook error", {
      error: err instanceof Error ? err.message : String(err),
      stack: (err as Error).stack,
    });
    // Don't throw - we want the request to proceed even if memory retrieval fails
  }
}

/**
 * Register the pre-response memory hook
 *
 * Call this during hook loading to activate the hook
 */
export function registerPreResponseMemoryHook(): void {
  registerInternalHook("agent:pre-response", handlePreResponse);
  log.info("Pre-response memory hook registered");
}

// Export handler as default for hook loader
export default handlePreResponse;

// Auto-register when module is loaded
registerPreResponseMemoryHook();
