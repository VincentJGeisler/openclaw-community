# OpenClaw Community Fork

**Maintainer:** VincentJGeisler ([@VincentJGeisler](https://github.com/VincentJGeisler))
**Fork Date:** 2026-02-13
**Upstream:** [openclaw/openclaw](https://github.com/openclaw/openclaw)

---

## 🚨 Why This Fork Exists

**The upstream OpenClaw maintainers are either incompetent or willfully ignorant.**

They rejected [PR #11701](https://github.com/openclaw/openclaw/pull/11701), which fixed a bug so obvious it's embarrassing: Signal group IDs were being lowercased.

Signal group IDs are **base64-encoded**. Base64 is **case-sensitive**. This is not advanced computer science. This is basic shit you learn when you first read about base64 encoding.

The maintainers closed the PR saying "it is no longer needed." Translation: "We didn't test it and we're not going to admit we're wrong."

**The bug is still in the latest release. Signal group messaging is completely broken. They don't care.**

---

## ✅ Applied Patches

### 1. Signal Group ID Case-Sensitivity Fix
- **File:** `src/channels/plugins/normalize/signal.ts` (line 16)
- **Issue:** Signal group IDs are base64-encoded and case-sensitive. Lowercasing them breaks group messaging with "Group not found" errors.
- **Fix:** Remove `.toLowerCase()` from group ID normalization
- **Original PR:** [#11701](https://github.com/openclaw/openclaw/pull/11701) (rejected by upstream)
- **Status:** ✅ Applied

**Before:**
```typescript
return id ? `group:${id}`.toLowerCase() : undefined;
```

**After:**
```typescript
return id ? `group:${id}` : undefined;
```

---

## 🔄 Sync Strategy

This fork automatically syncs with upstream **weekly** via GitHub Actions:

1. Fetch latest changes from upstream `main`
2. Merge into our `community-patches` branch
3. Verify all patches are still applied
4. Run tests (if they exist upstream - they probably don't)
5. Auto-push if clean, otherwise create an issue for manual review

**Manual sync trigger:** You can also trigger syncs via the Actions tab.

---

## 📦 Installation

### Option 1: Install from this fork (Recommended)

```bash
npm install -g github:VincentJGeisler/openclaw-community#community-patches
```

### Option 2: Clone and install locally

```bash
git clone https://github.com/VincentJGeisler/openclaw-community.git
cd openclaw-community
git checkout community-patches
npm install
npm run build
npm install -g .
```

### Option 3: Use as dependency in package.json

```json
{
  "dependencies": {
    "openclaw": "github:VincentJGeisler/openclaw-community#community-patches"
  }
}
```

---

## 🧪 Verification

After installation, verify the Signal fix is applied:

```bash
# Test Signal group messaging with case-sensitive ID
openclaw message send \
  --channel signal \
  --target "group:YourBase64GroupID" \
  --message "Test message"

# Should work without "Group not found" error
```

---

## 🛠️ Contributing

### Report Issues

If you find bugs or have patches to contribute:

1. **Check upstream first** - Maybe they finally fixed it?
2. Open an issue in this repo describing the problem
3. Include:
   - Upstream issue/PR link (if exists)
   - Reproduction steps
   - Your patch (if you have one)

### Submit Patches

1. Fork this repo
2. Create a branch from `community-patches`
3. Apply your fix
4. Add it to this README's "Applied Patches" section
5. Submit a PR

**Patch guidelines:**
- Surgical fixes only - don't refactor unrelated code
- Include clear commit messages explaining the "why"
- Reference upstream issues/PRs if they exist
- Add verification steps

---

## 🔀 Relationship with Upstream

**Look, we'd love for upstream to fix their shit.** This fork exists because:

1. They rejected a working fix for a critical bug
2. They didn't bother to test before closing the PR
3. Users are stuck with broken Signal messaging
4. Someone needs to ship working code

**If upstream ever fixes this:**
- We'll remove our patches
- We'll archive this fork
- We'll be happy to not maintain this anymore

**But right now?** They're shipping broken code and rejecting fixes. So here we are.

This isn't about competing. This is about having a version that actually works while they figure out how base64 encoding works.

---

## 📊 Differences from Upstream

| Component | Upstream Status | Community Fork Status |
|-----------|----------------|----------------------|
| Signal group messaging | ❌ Broken (lowercases IDs) | ✅ Fixed |
| Overall codebase | Latest from main | Latest + community patches |
| Tests | (probably none) | (still probably none) |

---

## 🙏 Credits

- **OpenClaw Team** - For creating the original project
- **PR #11701 Author** - For discovering and documenting the Signal fix
- **VincentJGeisler** - For maintaining this community fork
- **Contributors** - Everyone who reports issues and submits patches

---

## 📝 License

Same as upstream: MIT License

This is a fork, not a replacement. All original work belongs to the OpenClaw authors. We're just applying fixes they won't merge.

---

## 🔗 Links

- **This Fork:** https://github.com/VincentJGeisler/openclaw-community
- **Upstream:** https://github.com/openclaw/openclaw
- **Rejected Signal Fix:** https://github.com/openclaw/openclaw/pull/11701
- **Install Guide:** See "Installation" section above

---

## ⚠️ Disclaimer

This fork is maintained by community members who actually test their code and understand how base64 encoding works.

**Use at your own risk** - though frankly it's less risky than using upstream's broken version.

At least here, Signal group messaging actually works.

---

**Last Updated:** 2026-02-13
**Upstream Sync Status:** Auto-syncs weekly
**Active Patches:** 1
