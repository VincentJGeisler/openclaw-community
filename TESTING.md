# Manual Testing: Pre-Response Memory Hook

## Prerequisites

1. Graph RAG API running at `http://10.3.1.41:8080`
2. Sarah agent with memories stored in Graph RAG
3. OpenClaw gateway built and ready

## Configuration

Add to your `openclaw.json`:

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

## Test Scenarios

### 1. Query that should match memories

**Setup:** Ensure Sarah has memories about communication preferences

**Test:**

```bash
# Send message via gateway
openclaw agent --agent sarah --message "How should I communicate with the team?"
```

**Expected:**

- Gateway logs show hook triggered
- Graph RAG query sent with message
- Memories retrieved (similarity > 0.7)
- Agent response incorporates memory context

**Verify logs:**

```bash
openclaw gateway logs | grep "pre-response"
```

### 2. Query with no matches

**Test:**

```bash
openclaw agent --agent sarah --message "asdfghjkl random nonsense"
```

**Expected:**

- Hook triggers normally
- No memories found (or very low similarity)
- Request proceeds without injected context
- No errors

### 3. Graph RAG unavailable

**Setup:** Stop Graph RAG service temporarily

```bash
ssh vince@10.3.1.41 "docker stop graph-api"
```

**Test:**

```bash
openclaw agent --agent sarah --message "test message"
```

**Expected:**

- Hook attempts query
- Connection fails or times out
- Warning logged
- **Agent request still succeeds** (graceful degradation)

**Cleanup:**

```bash
ssh vince@10.3.1.41 "docker start graph-api"
```

### 4. Various similarity thresholds

Test with different thresholds in config:

**High threshold (0.9):**

```json
"similarityThreshold": 0.9
```

- Only very close matches retrieved

**Low threshold (0.5):**

```json
"similarityThreshold": 0.5
```

- More memories retrieved (may include less relevant)

### 5. Different result limits

**Fewer results:**

```json
"maxResults": 2
```

**More results:**

```json
"maxResults": 10
```

Check impact on context size and relevance.

### 6. Performance under load

**Test:** Send multiple concurrent requests

```bash
for i in {1..5}; do
  openclaw agent --agent sarah --message "Test message $i" &
done
wait
```

**Expected:**

- All requests complete successfully
- Minimal latency impact (<150ms per request)
- No timeout errors
- Logs show concurrent hook executions

## Verification Checklist

- [ ] Hook loads on gateway startup
- [ ] Hook triggers before agent responses
- [ ] Memories retrieved from Graph RAG
- [ ] Context properly formatted and injected
- [ ] Graceful degradation when Graph RAG unavailable
- [ ] No blocking or errors
- [ ] Logs helpful for debugging
- [ ] Performance acceptable (<150ms overhead)

## Debugging

### Check if hook is loaded

```bash
openclaw gateway logs | grep "Pre-response memory hook registered"
```

### Check hook execution

```bash
openclaw gateway logs | grep "Pre-response hook triggered"
```

### Check Graph RAG queries

```bash
openclaw gateway logs | grep "Querying Graph RAG"
```

### Check memory injection

```bash
openclaw gateway logs | grep "Memories injected"
```

## Manual Testing Status

**Hook Loading:** ✅ Verified

- Gateway logs show: "Registered hook: pre-response-memory -> agent:pre-response"
- Hook system reports 5 handlers loaded (up from 4)
- Configuration properly loaded from openclaw.json

**Next Steps for Full Testing:**

- Need proper agent invocation method (gateway RPC or message channel)
- Test with actual Sarah agent receiving messages
- Verify memory injection in agent context
- Monitor Graph RAG queries in logs

## Known Issues

None at this time.
