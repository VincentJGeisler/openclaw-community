# Pre-Response Memory Hook

Automatically queries Graph RAG before agent response generation and injects relevant memories into the message context.

## Configuration

Add to `~/.openclaw/openclaw.json`:

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
          "timeoutMs": 500,
          "injectFormat": "prepend"
        }
      }
    }
  }
}
```

## Uncertainty Detection

Enable self-awareness about confidence levels based on memory retrieval quality.

### How It Works

Calculates uncertainty score from:

1. **Memory count**: 0 = unknown, 1-2 = low confidence, 3+ = confident
2. **RDGNN activation**: Average activation score of retrieved memories

**Combined score** = (memory_count_normalized × 0.4) + (avg_activation × 0.6)

### Configuration

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "pre-response-memory": {
          "enabled": true,
          "uncertaintyDetection": {
            "enabled": true,
            "uncertainThreshold": 0.4,
            "confidentThreshold": 0.7,
            "memoryCountWeight": 0.4,
            "rdActivationWeight": 0.6
          }
        }
      }
    }
  }
}
```

### Thresholds

| Score   | Level     | Agent Behavior                           |
| ------- | --------- | ---------------------------------------- |
| < 0.4   | Uncertain | Qualifies with "I'm not certain, but..." |
| 0.4-0.7 | Moderate  | Qualifies with "I think..."              |
| > 0.7   | Confident | Normal confident response                |

### Context Injection

When enabled, adds uncertainty context before memories:

```markdown
# Self-Awareness: Uncertainty Detection

⚠️ **UNCERTAIN**: Low memory retrieval (count: 1, activation: 0.23)
Qualify responses with "I'm not certain, but..." or "Based on limited context..."

---
```

This helps the agent self-regulate confidence and avoid sycophantic false certainty.

## Options

### `enabled` (boolean)

Enable/disable the hook. Default: `false`

### `endpoint` (string)

Graph RAG API endpoint with `{agentId}` placeholder.
Default: `"http://10.3.1.41:8080/agent/{agentId}"`

### `similarityThreshold` (number, 0-1)

Minimum similarity score for memory retrieval.
Default: `0.7`

### `maxResults` (number)

Maximum number of memories to retrieve.
Default: `5`

### `timeoutMs` (number)

Query timeout in milliseconds.
Default: `500`

### `injectFormat` ("prepend" | "system")

How to inject memories into context:

- `"prepend"`: Add before user message
- `"system"`: Add to system prompt

Default: `"prepend"`

### `uncertaintyDetection.enabled` (boolean)

Enable uncertainty detection and self-awareness.
Default: `false`

### `uncertaintyDetection.uncertainThreshold` (number, 0-1)

Score below which agent is "uncertain".
Default: `0.4`

### `uncertaintyDetection.confidentThreshold` (number, 0-1)

Score above which agent is "confident".
Default: `0.7`

### `uncertaintyDetection.memoryCountWeight` (number, 0-1)

Weight for memory count in uncertainty calculation.
Default: `0.4`

### `uncertaintyDetection.rdActivationWeight` (number, 0-1)

Weight for RDGNN activation in uncertainty calculation.
Default: `0.6`

## Related

- Empirica epistemic vectors: Inspiration for uncertainty tracking
- Sarah's request: `/home/vince/.openclaw/workspace-sarah/docs/oracle-uncertainty-flag.md`
