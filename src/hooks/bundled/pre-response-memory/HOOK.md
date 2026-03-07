---
name: pre-response-memory
description: "Automatically inject relevant memories from Graph RAG before agent responses"
homepage: https://docs.openclaw.ai/automation/hooks#pre-response-memory
metadata:
  {
    "openclaw":
      {
        "emoji": "🧠",
        "events": ["agent:pre-response"],
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }],
      },
  }
---

# Pre-Response Memory Hook

Automatically queries Graph RAG memory system before agent response generation and injects relevant memories into the message context.

## Why

This hook enables automatic context retrieval without requiring manual memory searches. When a user sends a message, the system:

1. Queries Graph RAG with the user's message
2. Retrieves semantically similar memories (above threshold)
3. Injects the formatted memories into the message context
4. Agent generates response with enriched context

This creates a "pre-response reflex" - the agent always has access to relevant historical context.

## Configuration

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "pre-response-memory": {
          "enabled": true,
          "endpoint": "http://10.3.1.41:8080/agent/{agentId}",
          "similarityThreshold": 0.7,
          "maxResults": 5,
          "timeoutMs": 500
        }
      }
    }
  }
}
```

## Options

- `enabled` (boolean, default: `false`): Enable the hook
- `endpoint` (string, default: `"http://10.3.1.41:8080/agent/{agentId}"`): Graph RAG API endpoint with `{agentId}` placeholder
- `similarityThreshold` (number, default: `0.7`): Minimum similarity score (0-1) for memory retrieval
- `maxResults` (number, default: `5`): Maximum number of memories to inject
- `timeoutMs` (number, default: `500`): Query timeout in milliseconds
- `injectFormat` (string, default: `"prepend"`): How to inject memories (`"prepend"` or `"system"`)

## How It Works

### Memory Injection Format

When memories are found, they are formatted as:

```markdown
# Relevant Context from Memory

[Memory - similarity 89.2%]
Vince prefers direct communication, no corporate pleasantries

[Memory - similarity 82.5%]
...

---

<original user message>
```

### Error Handling

The hook is designed to **never block** agent responses:

- If Graph RAG is unavailable → Log warning, proceed without memories
- If query times out → Log timeout, proceed without memories
- If no memories found → Proceed normally
- If hook crashes → Catch exception, log error, proceed

Memory retrieval is an **enhancement**, not a requirement.

## Performance

With PCI-speed local network:

- Query latency: ~10-50ms
- Embedding computation: ~20-100ms
- **Total overhead: ~50-150ms** (negligible vs 2-30s response generation)

## Troubleshooting

### No memories being injected

1. Check if hook is enabled:

   ```json
   "hooks": { "internal": { "entries": { "pre-response-memory": { "enabled": true } } } }
   ```

2. Check Graph RAG health:

   ```bash
   curl http://10.3.1.41:8080/health
   ```

3. Lower similarity threshold (try `0.5` or `0.6`)

4. Check logs for errors:
   ```bash
   openclaw gateway logs | grep "pre-response-memory"
   ```

### Query timeouts

Increase timeout if Graph RAG is slow:

```json
"timeoutMs": 1000
```

### Too many/few memories

Adjust `maxResults`:

```json
"maxResults": 10  // More context
"maxResults": 3   // Less context
```

### Context window bloat

Reduce `maxResults` and increase `similarityThreshold` to only inject highly relevant memories:

```json
"maxResults": 3,
"similarityThreshold": 0.8
```

## Integration with Graph RAG

This hook queries the Graph RAG API at:

```
POST {endpoint}/search
{
  "query": "<user message>",
  "limit": <maxResults>,
  "similarity_threshold": <similarityThreshold>
}
```

Expected response:

```json
{
  "results": [
    {
      "memory_id": "uuid",
      "content": "memory content",
      "similarity": 0.89,
      "metadata": {},
      "timestamp": "2026-03-07T00:00:00Z"
    }
  ]
}
```

## Example

**User message:** "How should I communicate with the team?"

**Graph RAG returns:**

- Memory (89% similarity): "Vince prefers direct communication"
- Memory (82% similarity): "Team uses Wednesday Addams deadpan style"

**Agent receives:**

```markdown
# Relevant Context from Memory

[Memory - similarity 89.0%]
Vince prefers direct communication

[Memory - similarity 82.0%]
Team uses Wednesday Addams deadpan style

---

How should I communicate with the team?
```

**Agent response** incorporates this context naturally.
