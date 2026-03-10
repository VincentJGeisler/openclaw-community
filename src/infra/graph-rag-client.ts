/**
 * Graph RAG client for memory retrieval
 *
 * Provides utilities for querying the Graph RAG memory system
 * and formatting results for context injection.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("infra/graph-rag-client");

export type GraphRAGMemory = {
  memory_id: string;
  content: string;
  similarity: number;
  rd_activation?: number;
  rd_importance?: number;
  metadata?: Record<string, unknown>;
  timestamp?: string;
};

export type GraphRAGQueryOptions = {
  agentId: string;
  query: string;
  endpoint: string;
  similarityThreshold: number;
  maxResults: number;
  timeoutMs: number;
};

export type GraphRAGQueryResult = {
  success: boolean;
  memories: GraphRAGMemory[];
  error?: string;
};

/**
 * Query Graph RAG for relevant memories
 *
 * @param options - Query configuration
 * @returns Query result with memories or error
 */
export async function queryMemories(options: GraphRAGQueryOptions): Promise<GraphRAGQueryResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const url = options.endpoint.replace("{agentId}", options.agentId);
    const searchUrl = `${url}/search`;

    log.debug("Querying Graph RAG", {
      url: searchUrl,
      agentId: options.agentId,
      threshold: options.similarityThreshold,
      limit: options.maxResults,
      queryPreview: options.query.slice(0, 100),
    });

    const startTime = Date.now();
    const response = await fetch(searchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: options.query,
        limit: options.maxResults,
        similarity_threshold: options.similarityThreshold,
      }),
      signal: controller.signal,
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const error = `Graph RAG query failed: ${response.status} ${response.statusText}`;
      log.warn(error, { duration, status: response.status });
      return { success: false, memories: [], error };
    }

    const data = (await response.json()) as { results?: GraphRAGMemory[] };
    const memories = data.results ?? [];

    log.info("Graph RAG query completed", {
      duration,
      count: memories.length,
      topSimilarity: memories[0]?.similarity,
    });

    return { success: true, memories };
  } catch (err) {
    clearTimeout(timeout);

    if ((err as Error).name === "AbortError") {
      const error = `Graph RAG query timeout after ${options.timeoutMs}ms`;
      log.warn(error);
      return { success: false, memories: [], error };
    }

    const error = err instanceof Error ? err.message : String(err);
    log.error("Graph RAG query error", { error, stack: (err as Error).stack });
    return { success: false, memories: [], error };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Format memories as context string for injection
 *
 * @param memories - Memories to format
 * @returns Formatted markdown string
 */
export function formatMemoriesAsContext(memories: GraphRAGMemory[]): string {
  if (memories.length === 0) {
    return "";
  }

  const lines = ["# Relevant Context from Memory", ""];

  for (const memory of memories) {
    const similarity = (memory.similarity * 100).toFixed(1);
    lines.push(`[Memory - similarity ${similarity}%]`);
    lines.push(memory.content);
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  return lines.join("\n");
}
