/**
 * Tests for Graph RAG client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryMemories, formatMemoriesAsContext, type GraphRAGMemory } from "./graph-rag-client.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

describe("queryMemories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should successfully retrieve memories", async () => {
    const mockMemories: GraphRAGMemory[] = [
      {
        memory_id: "mem-1",
        content: "Test memory 1",
        similarity: 0.89,
        metadata: { source: "test" },
        timestamp: "2026-03-07T00:00:00Z",
      },
      {
        memory_id: "mem-2",
        content: "Test memory 2",
        similarity: 0.75,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: mockMemories }),
    });

    const result = await queryMemories({
      agentId: "sarah",
      query: "test query",
      endpoint: "http://localhost:8080/agent/{agentId}",
      similarityThreshold: 0.7,
      maxResults: 5,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(true);
    expect(result.memories).toEqual(mockMemories);
    expect(result.error).toBeUndefined();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/agent/sarah/search",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "test query",
          limit: 5,
          similarity_threshold: 0.7,
        }),
      }),
    );
  });

  it("should handle empty results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    const result = await queryMemories({
      agentId: "sarah",
      query: "nonexistent",
      endpoint: "http://localhost:8080/agent/{agentId}",
      similarityThreshold: 0.7,
      maxResults: 5,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(true);
    expect(result.memories).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it("should handle HTTP errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const result = await queryMemories({
      agentId: "sarah",
      query: "test",
      endpoint: "http://localhost:8080/agent/{agentId}",
      similarityThreshold: 0.7,
      maxResults: 5,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.memories).toEqual([]);
    expect(result.error).toContain("500");
    expect(result.error).toContain("Internal Server Error");
  });

  it("should handle network timeout", async () => {
    const abortError = new Error("AbortError");
    abortError.name = "AbortError";
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await queryMemories({
      agentId: "sarah",
      query: "test",
      endpoint: "http://localhost:8080/agent/{agentId}",
      similarityThreshold: 0.7,
      maxResults: 5,
      timeoutMs: 500,
    });

    expect(result.success).toBe(false);
    expect(result.memories).toEqual([]);
    expect(result.error).toContain("timeout");
  });

  it("should handle connection refused", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

    const result = await queryMemories({
      agentId: "sarah",
      query: "test",
      endpoint: "http://localhost:8080/agent/{agentId}",
      similarityThreshold: 0.7,
      maxResults: 5,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.memories).toEqual([]);
    expect(result.error).toContain("fetch failed");
  });

  it("should replace {agentId} placeholder in endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    await queryMemories({
      agentId: "oracle",
      query: "test",
      endpoint: "http://example.com/agent/{agentId}",
      similarityThreshold: 0.7,
      maxResults: 5,
      timeoutMs: 1000,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://example.com/agent/oracle/search",
      expect.anything(),
    );
  });

  it("should handle missing results field in response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    const result = await queryMemories({
      agentId: "sarah",
      query: "test",
      endpoint: "http://localhost:8080/agent/{agentId}",
      similarityThreshold: 0.7,
      maxResults: 5,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(true);
    expect(result.memories).toEqual([]);
  });
});

describe("formatMemoriesAsContext", () => {
  it("should format single memory", () => {
    const memories: GraphRAGMemory[] = [
      {
        memory_id: "mem-1",
        content: "Test memory content",
        similarity: 0.89,
      },
    ];

    const result = formatMemoriesAsContext(memories);

    expect(result).toContain("# Relevant Context from Memory");
    expect(result).toContain("[Memory - similarity 89.0%]");
    expect(result).toContain("Test memory content");
    expect(result).toContain("---");
  });

  it("should format multiple memories", () => {
    const memories: GraphRAGMemory[] = [
      {
        memory_id: "mem-1",
        content: "First memory",
        similarity: 0.95,
      },
      {
        memory_id: "mem-2",
        content: "Second memory",
        similarity: 0.82,
      },
    ];

    const result = formatMemoriesAsContext(memories);

    expect(result).toContain("First memory");
    expect(result).toContain("Second memory");
    expect(result).toContain("95.0%");
    expect(result).toContain("82.0%");
  });

  it("should return empty string for no memories", () => {
    const result = formatMemoriesAsContext([]);
    expect(result).toBe("");
  });

  it("should format similarity as percentage with one decimal", () => {
    const memories: GraphRAGMemory[] = [
      {
        memory_id: "mem-1",
        content: "Test",
        similarity: 0.877,
      },
    ];

    const result = formatMemoriesAsContext(memories);
    expect(result).toContain("87.7%");
  });
});
