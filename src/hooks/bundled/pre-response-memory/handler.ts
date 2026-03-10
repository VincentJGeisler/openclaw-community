/**
 * Pre-response memory retrieval hook
 *
 * Automatically queries Graph RAG before agent response generation
 * and injects relevant memories into the message context.
 */

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
      lines.push(
        'Qualify responses with "I\'m not certain, but..." or "Based on limited context..."',
      );
      break;
    case "moderate":
      lines.push(
        "⚡ **MODERATE CONFIDENCE**: Some relevant context retrieved (count: " +
          uncertainty.memoryCount +
          ", activation: " +
          uncertainty.avgActivation.toFixed(2) +
          ")",
      );
      lines.push('Consider qualifying with "I think..." or "From what I remember..."');
      break;
    case "confident":
      lines.push(
        "✅ **CONFIDENT**: Strong memory retrieval (count: " +
          uncertainty.memoryCount +
          ", activation: " +
          uncertainty.avgActivation.toFixed(2) +
          ")",
      );
      lines.push("Respond normally with full confidence");
      break;
  }

  lines.push("");
  lines.push("---");
  lines.push("");

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

    const result = await queryMemories({
      agentId: event.context.agentId,
      query: event.context.message,
      endpoint: config.endpoint!,
      similarityThreshold: config.similarityThreshold!,
      maxResults: config.maxResults!,
      timeoutMs: config.timeoutMs!,
    });

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
