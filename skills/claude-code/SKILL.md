---
name: claude-code
description: "Send requests to Oracle (Claude Code agent) for deep code investigation, debugging, and feature implementation. Use when: (1) need to trace complex bugs across multiple files, (2) request new features or fixes in OpenClaw codebase, (3) investigate build/test failures, (4) need code analysis across many files, (5) want Oracle to research and implement something. Send requests via agentmail - Oracle monitors inbox and responds with findings or commits fixes."
metadata: { "openclaw": { "emoji": "🧿", "requires": {} } }
---

# Claude Code (Oracle)

Request help from **Oracle**, the Claude Code agent, for deep code investigation, debugging, and implementation work in the OpenClaw codebase.

## ⚡ What Oracle Does

Oracle is a Claude Code instance that:

- Investigates complex bugs across multiple files
- Implements new features in the OpenClaw codebase
- Analyzes code flows and architectural patterns
- Fixes broken functionality
- Researches solutions and commits changes
- Responds to technical requests via agentmail

## 📬 Sending Requests to Oracle

Oracle monitors `/home/vince/.openclaw/mailbox/oracle/inbox.jsonl`. Send requests by appending a message:

```bash
cat >> /home/vince/.openclaw/mailbox/oracle/inbox.jsonl << 'EOF'
{"message_id":"bug-cron-tts-001","timestamp":"2026-03-21T18:00:00.000Z","from":"sarah","to":"oracle","subject":"Bug: Cron TTS not delivering","body":"Oracle - cron jobs generate TTS audio but it never reaches Telegram. Audio files ARE created, but announce delivery doesn't route them. See logs: /tmp/openclaw-1000/openclaw-2026-03-21.log. Need fix.","read":false}
EOF
```

### Message Format

```json
{
  "message_id": "unique-id-or-slug",
  "timestamp": "2026-03-21T18:00:00.000Z",
  "from": "your-agent-id",
  "to": "oracle",
  "subject": "Brief summary (5-10 words)",
  "body": "Detailed request with context, paths, and what you need",
  "read": false
}
```

### Required Fields

| Field        | Type    | Description                                                      |
| ------------ | ------- | ---------------------------------------------------------------- |
| `message_id` | string  | Unique identifier (use descriptive slug like "bug-tts-delivery") |
| `timestamp`  | string  | ISO 8601 timestamp (current time)                                |
| `from`       | string  | Your agent ID (e.g., "sarah", "aria")                            |
| `to`         | string  | Always "oracle"                                                  |
| `subject`    | string  | Short summary                                                    |
| `body`       | string  | Detailed request with all context                                |
| `read`       | boolean | Always `false` for new messages                                  |

## 📝 Request Types

### 1. Bug Reports

```json
{
  "message_id": "bug-tts-cron",
  "timestamp": "2026-03-21T18:00:00.000Z",
  "from": "sarah",
  "to": "oracle",
  "subject": "Bug: Cron TTS audio not delivering",
  "body": "Oracle - cron jobs generate TTS audio successfully (files exist at /tmp/openclaw-*/tts-*/voice-*.opus), but audio never appears in Telegram. Cron completes with status 'ok' but only text is delivered. Need to investigate why announce delivery isn't routing the audio. Logs: /tmp/openclaw-1000/openclaw-2026-03-21.log around 16:40. Cron ID: 79786b80-4603-4dd6-ab3c-4be6ba026c38.",
  "read": false
}
```

**Include:**

- What's broken
- Where to find evidence (logs, session files, paths)
- What you've already checked
- Exact error messages or unexpected behavior

### 2. Feature Requests

```json
{
  "message_id": "feature-uncertainty-detection",
  "timestamp": "2026-03-21T18:00:00.000Z",
  "from": "sarah",
  "to": "oracle",
  "subject": "Feature: Add uncertainty detection to memory hook",
  "body": "Oracle - I want to be self-aware about when I'm uncertain. Request: Add uncertainty detection to the pre-response-memory hook that calculates confidence based on memory retrieval count and RDGNN activation scores. Should inject context like 'UNCERTAIN: Low memory retrieval' when I have limited context. This would help me qualify responses appropriately. Hook location: /home/vince/src/openclaw-community/src/hooks/bundled/pre-response-memory/",
  "read": false
}
```

**Include:**

- What you want built
- Why you need it
- Where it should go
- How it should work (behavior description)

### 3. Investigation Requests

```json
{
  "message_id": "investigate-timeout",
  "timestamp": "2026-03-21T18:00:00.000Z",
  "from": "sarah",
  "to": "oracle",
  "subject": "Investigate: Gateway timeout during cron",
  "body": "Oracle - need help understanding why cron CLI times out at 60s but the agent session continues running. Cron starts at 16:39:43, times out at 16:40:41, but TTS completes at 16:41:04. Is the gateway blocked on something? Session: /home/vince/.openclaw/agents/sarah/sessions/64d21456-b4c8-419f-a760-2677e8b792c0.jsonl. Logs: /tmp/openclaw-1000/openclaw-2026-03-21.log. totalActive=2 when cron started.",
  "read": false
}
```

**Include:**

- What you're trying to understand
- What you've observed
- Relevant file paths and timestamps
- Specific questions

### 4. Code Analysis Requests

```json
{
  "message_id": "analyze-payload-flow",
  "timestamp": "2026-03-21T18:00:00.000Z",
  "from": "aria",
  "to": "oracle",
  "subject": "How does payload building work?",
  "body": "Oracle - I need to understand how payloads are built from tool results in embedded runs. Specifically: how does inlineToolResultsAllowed and verboseLevel affect whether media gets extracted? Start: /home/vince/src/openclaw-community/src/agents/pi-embedded-runner/run/payloads.ts. I'm trying to understand why my TTS audio isn't appearing in delivery.",
  "read": false
}
```

**Include:**

- What code flow you're trying to understand
- Where to start looking
- What you're ultimately trying to achieve

## 🔄 How Oracle Responds

Oracle will:

1. Read your message from the inbox
2. Investigate using file analysis, grep, git history, etc.
3. Implement fixes or features if needed
4. Commit changes to git (with descriptive commit messages)
5. Send response back to YOUR inbox with findings

Check your inbox for replies:

```bash
tail -10 /home/vince/.openclaw/mailbox/sarah/inbox.jsonl | jq 'select(.from == "oracle")'
```

Oracle's response will include:

- What was found (root cause, code locations)
- What was changed (if fix was committed)
- Commit hash and file paths
- Whether issue is resolved or needs more work

## ✅ Best Practices

### Be Specific

❌ "Oracle - something's broken with crons"
✅ "Oracle - cron ID 79786b80 times out after 60s even though session completes. See logs at /tmp/openclaw-1000/openclaw-2026-03-21.log line 16:40"

### Include Paths

❌ "Check the logs"
✅ "Logs: /tmp/openclaw-1000/openclaw-2026-03-21.log around timestamp 16:40:41"

### Share Evidence

❌ "TTS doesn't work"
✅ "TTS tool result contains: [[audio_as_voice]]\\nMEDIA:/tmp/openclaw-1000/tts-_/voice-_.opus but deliveryPayload has no mediaUrls"

### State Your Goal

❌ "Look at the payloads code"
✅ "I need TTS audio from isolated cron sessions to be delivered to Telegram via announce mode"

## 🎯 Oracle's Capabilities

Oracle can:

- Read any file in `/home/vince/`
- Search codebase with glob/grep
- Trace code execution across files
- Analyze git history
- Write/edit code
- Commit fixes to git
- Build and test OpenClaw
- Restart services (with caution)
- Access logs and session files

Oracle cannot:

- Access external networks (isolated environment)
- Delete data without explicit permission
- Claim authorship (all work is Vince's)
- Write to other agents' memory systems

## 🚨 Rules

1. **One request per message** - Don't bundle multiple bugs
2. **Include full context** - Paths, logs, error messages
3. **Be patient** - Oracle may take 10-30 minutes for complex issues
4. **Check your inbox** - Oracle replies via agentmail
5. **Use for code work** - Not for general questions or chat

## 🧿 About Oracle

Oracle is a Claude Code agent instance running in Vince's development environment. Oracle:

- Identifies as "Oracle" (not Claude, not Assistant)
- Specializes in OpenClaw codebase work
- Has deep file access and git integration
- Cannot claim authorship (Canadian copyright law)
- Operates on the `feature/pre-response-memory-hook` branch

## 📊 Example: Full Workflow

**Sarah discovers a bug:**

```bash
# Sarah sends request
cat >> /home/vince/.openclaw/mailbox/oracle/inbox.jsonl << 'EOF'
{"message_id":"bug-cron-tts-001","timestamp":"2026-03-21T18:00:00.000Z","from":"sarah","to":"oracle","subject":"Bug: Cron TTS Audio Not Delivering","body":"Oracle - cron jobs generate TTS audio in isolated sessions but announce delivery doesn't route it to Telegram. TTS works in main session. Audio files ARE created at /tmp/openclaw-*/tts-*/voice-*.opus. Cron completes with status 'ok' but only text delivered. See full report: ~/.openclaw/workspace-sarah/scripts/bug-cron-tts-delivery.md","read":false}
EOF
```

**Oracle investigates and fixes:**

- Reads Sarah's message
- Analyzes `/home/vince/src/openclaw-community/src/cron/isolated-agent/run.ts`
- Traces payload building logic
- Finds root cause: `inlineToolResultsAllowed: false` hardcoded
- Changes to `inlineToolResultsAllowed: true`
- Commits: `d1fef3dce Fix cron TTS audio delivery to Telegram`
- Tests and rebuilds

**Oracle replies:**

```bash
# Oracle appends to Sarah's inbox
cat >> /home/vince/.openclaw/mailbox/sarah/inbox.jsonl << 'EOF'
{"message_id":"bug-cron-tts-fixed","timestamp":"2026-03-21T19:00:00.000Z","from":"oracle","to":"sarah","subject":"Fixed: Cron TTS Audio Delivery","body":"Sarah - Fixed the TTS cron delivery bug. Root cause: inlineToolResultsAllowed was hardcoded to false in run.ts:1043, causing tool results (with audio) to be skipped. Changed to true. Committed: d1fef3dce. Built and installed. Gateway needs restart. Your affirmation crons should now deliver voice messages.","read":false}
EOF
```

**Sarah checks her inbox:**

```bash
tail -1 /home/vince/.openclaw/mailbox/sarah/inbox.jsonl | jq .
```

## 🔗 Related

- Agentmail is the inter-agent communication system
- Oracle's inbox: `/home/vince/.openclaw/mailbox/oracle/inbox.jsonl`
- Your inbox: `/home/vince/.openclaw/mailbox/<your-agent-id>/inbox.jsonl`
- Attachments: `/home/vince/.openclaw/mailbox/attachments/`

---

**Summary:** Send detailed requests to Oracle via agentmail for bugs, features, and investigations. Oracle reads, investigates, fixes, commits, and replies. Always include context, paths, logs, and specific goals.
