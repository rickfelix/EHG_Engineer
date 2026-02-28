---
category: architecture
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [architecture, auto-generated]
---
<!-- Archived from: brainstorm/2026-02-22-continuous-autonomous-processing-pipeline.md -->
<!-- SD Key: SD-LEO-FIX-BRAINSTORM-CONTINUOUS-AUTONOMOUS-001 -->
<!-- Archived at: 2026-02-23T03:01:50.089Z -->

# Brainstorm: Continuous Autonomous Processing Pipeline

## Metadata
- **Date**: 2026-02-22
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Interrupted (user identified existing infrastructure)
- **Related Ventures**: EHG (core platform)

---

## Problem Statement
How to connect the Telegram inbox capture → autonomous SD processing → continuous execution pipeline into a fully autonomous end-to-end system.

## Discovery Summary

### Existing Infrastructure (Already Built)

| Component | File/System | Status |
|-----------|-------------|--------|
| Telegram Bot | `ehg/supabase/functions/telegram-chairman-bot/` | Working (fixed this session) |
| Inbox Capture | `capture_brainstorm` tool → `chairman_feedback` table | Built |
| Assist Engine | `lib/quality/assist-engine.js` → reads `feedback` table | Built |
| SD Creation | `/leo assist` → creates SDs from inbox items | Built |
| Continuous Orchestrator | `scripts/leo-continuous.js` (`npm run leo:continuous`) | Built |
| Continuous Prompt | `scripts/leo-continuous-prompt.js` (`npm run leo:prompt`) | Built |
| Protocol Watcher | `scripts/leo-watcher.js` | Built |

### Key SDs That Built This
- `SD-LEO-INFRA-IDLE-POLLING-ENHANCEMENT-001` — Idle-Polling Enhancement for LEO Continuous Loop
- `SD-LEO-FEAT-AUTOMATED-CLAUDE-CODE-001` — Automated Claude Code Release Monitor Pipeline
- `SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001` — Programmatic Tool Calling

### The One Gap: Table Mismatch

**Telegram writes to `chairman_feedback`**, but **`/leo assist` reads from `feedback`**. These are two different tables with different schemas. No trigger, sync, or bridge exists between them.

- `chairman_feedback`: 0 rows (empty — bot just fixed today)
- `feedback`: 27 rows (from Todoist intake and other sources)

## Analysis

### End-to-End Flow (Current State)

```
TELEGRAM → chairman_feedback (table A) ❌ GAP ❌ feedback (table B) → /leo assist → SDs → leo-continuous.js
```

### Arguments For (Fixing the Gap)
- All major components exist — only a table bridge is missing
- Fix is minimal: either a DB trigger or changing the bot to write directly to `feedback`
- Enables fully autonomous: idea → code → shipped, triggered from mobile
- `leo-continuous.js` already handles hierarchy mapping, checkpoints, RCA, post-completion

### Arguments Against
- `chairman_feedback` may have been intentionally separate for chairman-specific metadata
- Direct `feedback` writes from Telegram could mix chairman strategic input with engineering feedback
- No automatic trigger for `/leo assist` after new feedback arrives (still manual)
- No automatic trigger for `leo-continuous.js` after new SDs are created (still manual)

## Recommended Fix

### Option A: Change `capture_brainstorm` to Write to `feedback` (Simplest)
Modify `tool-executors.ts` to insert into `feedback` with:
- `source_type: 'telegram'`
- `source_application: 'chairman_bot'`
- `type: 'enhancement'` or `'feature_idea'`
- Map `content` → `description`, auto-generate `title`

### Option B: Database Trigger (More Reliable)
`AFTER INSERT ON chairman_feedback` → auto-insert into `feedback` with field mapping.
Preserves chairman_feedback as audit trail.

### Remaining Manual Triggers
Even with the table bridge fixed, two things still require manual invocation:
1. `/leo assist` — needs to be run to process new feedback into SDs
2. `npm run leo:continuous` (or paste prompt from `npm run leo:prompt`) — needs to be started

For full autonomy, these would need:
- A Supabase cron/Edge Function that runs assist processing on new feedback inserts
- Or: `leo-continuous.js` extended to also run assist processing before checking SD queue

## Out of Scope
- Building a new continuous execution engine (already exists)
- Redesigning the LEO Protocol phases (already working)
- Adding new Telegram bot capabilities (already comprehensive)

## Open Questions
- Should `chairman_feedback` be kept as a separate audit table, or can `feedback` serve both purposes?
- Should assist processing be triggered automatically on new feedback inserts, or remain manual?
- Should `leo-continuous.js` integrate assist processing into its loop?

## Suggested Next Steps
1. **Fix the table bridge** — Either Option A or B above (minimal SD, likely a quick-fix)
2. **Test end-to-end** — Send idea via Telegram Inbox → verify it appears in `feedback` → run `/leo assist` → verify SD created → run `npm run leo:continuous`
3. **Optional**: Add Supabase cron to auto-run assist processing periodically
