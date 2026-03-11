# Pre-Response Memory Hook

Automatically queries Graph RAG before agent response generation and injects relevant memories into the message context.

## Features

- **System Time Injection**: Always provides current date/time for temporal awareness
- **Memory Retrieval**: Queries Graph RAG for relevant context based on incoming message
- **Uncertainty Detection**: Self-awareness about confidence levels based on memory quality

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

| Score   | Level     | Agent Behavior                                                       |
| ------- | --------- | -------------------------------------------------------------------- |
| < 0.4   | Uncertain | Qualifies with "I'm not certain, but..." + Anti-sycophancy prompting |
| 0.4-0.7 | Moderate  | Qualifies with "I think..." + Anti-sycophancy prompting              |
| > 0.7   | Confident | Normal confident response                                            |

### Anti-Sycophancy Prompting

When uncertainty is detected (uncertain or moderate confidence), the hook automatically includes anti-sycophancy guidance:

**Why:** LLMs are trained to be agreeable (RLHF optimizes for approval). Sycophancy risk is highest when the agent lacks information but wants to please the user.

**How:** Uncertainty detection triggers explicit permission to:

- Disagree even without complete proof
- Say "that doesn't match what I remember"
- Express "I'm uncertain, but that seems incorrect"
- Treat disagreement as information, not failure

**Example:**

```markdown
⚠️ **UNCERTAIN**: Low memory retrieval (count: 1, activation: 0.23)

Qualify responses with "I'm not certain, but..." or "Based on limited context..."

**Anti-Sycophancy:** When uncertain, don't default to agreement.

- If user states something that feels wrong, say so even without proof
- "That doesn't match what I remember" is valid
- "I'm uncertain, but that seems incorrect" is better than hedging toward agreement
- Disagreement when uncertain is information, not failure
```

This catches cases like:

- User: "The moon is made of green cheese"
- Agent: Uncertain (gaps in moon knowledge) → Anti-sycophancy active
- Response: "I'm uncertain, but that doesn't match what I know about the moon..."

Instead of: "That's an interesting perspective..." (sycophantic agreement)

### Context Injection

When enabled, adds uncertainty context before memories:

```markdown
# Self-Awareness: Uncertainty Detection

⚠️ **UNCERTAIN**: Low memory retrieval (count: 1, activation: 0.23)
Qualify responses with "I'm not certain, but..." or "Based on limited context..."

---
```

This helps the agent self-regulate confidence and avoid sycophantic false certainty.

## System Time Context

The hook automatically injects current system time before every response, providing temporal awareness:

```markdown
# Current System Time

**Monday, March 10, 2026 at 6:15:23 AM PST**

ISO: 2026-03-10T14:15:23.456Z
Unix timestamp: 1773085523

---
```

This allows the agent to:

- Understand relative time references ("yesterday", "last week")
- Provide time-appropriate responses (morning greetings, time-sensitive info)
- Track when information was current
- Schedule and plan based on current date/time

**No configuration needed** - system time is always injected automatically.

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
