/**
 * Pre-response memory retrieval hook
 *
 * Automatically queries Graph RAG before agent response generation
 * and injects relevant memories into the message context.
 */

import { loadConfig } from "../../../config/config.js";
import type { PreResponseMemoryHookConfig } from "../../../config/types.hooks.js";
import { formatMemoriesAsContext, queryMemories } from "../../../infra/graph-rag-client.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { AgentPreResponseHookEvent } from "../../internal-hooks.js";
import { registerInternalHook } from "../../internal-hooks.js";

const log = createSubsystemLogger("hooks/pre-response-memory");

const DEFAULT_ENDPOINT = "http://10.3.1.41:8080/agent/{agentId}";
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_INJECT_FORMAT = "prepend";

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
  };
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
      return;
    }

    const contextString = formatMemoriesAsContext(result.memories);
    event.context.additionalContext = event.context.additionalContext ?? [];
    event.context.additionalContext.push(contextString);

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

// Auto-register when module is loaded
registerPreResponseMemoryHook();
