<!-- reasoning_effort: low -->

---
description: Prepare durable state, hand off to the harness's real compaction mechanism, and verify afterward
argument-hint: [focus area or leave empty for full compaction]
---

# 🗜️ Context Compaction — Prepare, Hand Off, Verify

**Focus Area**: $ARGUMENTS

## Why this skill does not summarize by hand

A slash-command skill injects a prompt into the conversation; it cannot itself truncate or
rewrite conversation history — that is a harness-only operation. A version of this skill that
asked the model to hand-summarize could never actually compact anything; it was theatre that
spent real model turns duplicating state the seat had usually already written to disk. This
skill instead does the three things a skill honestly can do: **prepare** durable state, **hand
off** to the harness's real mechanism, and **verify** afterward.

## Step 1 — PREPARE (do this now)

Identify what must survive compaction: current SD/phase, unresolved bugs, pending decisions,
active blockers, in-flight PR/handoff status. If a focus area was given above, prioritize it.

Write it via the **verified** path — a write that reports success without landing is worse than
no write at all, because it looks safe right up until the state is gone:

```bash
node -e "
import('./lib/context/memory-manager.js').then(async ({ default: MemoryManager }) => {
  const memory = new MemoryManager();
  await memory.updateSectionVerified('Pre-Compaction Snapshot', \`<durable state text here>\`);
  console.log('PREPARE: write verified');
});
"
```

`updateSectionVerified` re-reads the file after writing and **throws** if the content did not
actually land. If it throws: STOP and fix the write before continuing — a failed prepare means
compaction would lose state, not preserve it.

## Step 2 — HAND OFF (name the mechanism, never simulate it)

This skill cannot compact context itself. Compaction is a harness operation, so hand off to it:

- Type `/compact` (Claude Code's built-in manual compaction), or
- Let the harness auto-compact on its own as context grows — no action needed.

Anthropic's own context-engineering guidance (web-sourced; not measured in this repo) notes that
**tool-result clearing** — dropping or truncating old, already-captured tool outputs — is one of
the safest, lightest-touch forms of compaction, and the harness's native compaction already does
this ahead of any summarization. Handing off to `/compact` or auto-compaction gets that benefit
for free; there is nothing further for this skill to do to earn it.

There is no hand-summarization step here anymore. That instruction is retired: it could not make
the harness do anything, and it charged model turns re-deriving state Step 1 just verified was
already durable.

## Step 3 — VERIFY (run this on the next turn, after compaction happens)

- Re-read the standing protocol contract **in full** — CLAUDE.md, CLAUDE_CORE.md, and the current
  phase file. A hash matching what you last saw is not an exemption from reading it again; read
  the actual content every time, then assert the hash rather than asserting your memory of it:

```bash
node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('CLAUDE.md')).digest('hex'))"
```

- Record the compaction event so downstream gates know a re-read is required:

```bash
node scripts/hooks/protocol-compaction-hook.cjs record
```

- Confirm the Pre-Compaction Snapshot from Step 1 is still readable in `.claude/session-state.md`
  (or the active seat-state file) and resume from it.

**Out of scope, deliberately**: mechanically *enforcing* that this re-read happens (a gate that
blocks work until the hash is asserted) is a separate, structural fix tracked under
SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G. This skill carries the instruction; it does not gate on it.

## Compaction Levels (guidance for how urgently to hand off)

- **HEALTHY (< 150K tokens)**: no action needed.
- **WARNING (150K-170K tokens)**: run Steps 1-2 now, on your own initiative.
- **CRITICAL (170K-190K tokens)**: run Steps 1-2 immediately; do not start new work first.
- **EMERGENCY (> 190K tokens)**: finish the current atomic step, then run Steps 1-2 before anything else.

## Command Ecosystem Integration

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** — Complete inter-command flow diagram and relationships

**Note**: `/context-compact` is typically suggested by other commands when context exceeds 70% usage.
