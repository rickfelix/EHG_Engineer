# Always / Ask First / Never — Vision Document Tri-Tier Boundaries

**Source**: SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001 (Commit 5 of 5: B1)
**Status**: Warning-only mode (chairman acceptance required for promotion to blocking — Vision SC #7)
**Validator**: `lib/eva/tri-tier-section-validator.js`

## Why this exists

Vision documents historically encoded boundaries via a single `## Out of Scope` section. The chairman would write things they didn't want, the orchestrator would read it as a soft hint, and edge cases would still bubble up to the chairman for approval.

The B1 tri-tier model splits boundaries into **three actionable categories** that the orchestrator can execute against without prompting:

| Tier | Orchestrator Behavior | Chairman Cost |
|------|----------------------|---------------|
| **Always** | Execute autonomously without prompting | **0** — chairman is not interrupted |
| **Ask First** | Halt and prompt the chairman before proceeding | **1 prompt** per occurrence |
| **Never** | Refuse to perform the action; emit error if attempted | **0 + safety net** |

The strategic value: **B1 is the only validator in this SD that REDUCES chairman interrupt count.** Every Always-class decision the chairman writes into a vision document is one decision they will never be asked about again. Ask-First decisions are explicitly opt-in interruptions. Never decisions are hard guardrails.

## The mental model

When you write a vision document, ask yourself this question for every constraint:

> *"Do I trust the orchestrator to do this without my involvement, or do I want a chance to weigh in?"*

- **Yes, do it** → `## Always`
- **Maybe — depends on context** → `## Ask First`
- **No, never do this** → `## Never`

If you don't fit a constraint into one of these tiers, it's probably underspecified. Examples below.

## Example: A real vision document section

```markdown
## Always
- Always run database-agent for schema changes (never call mcp__supabase__apply_migration directly)
- Always commit failing tests before src/ edits for sd_type=bugfix Tier 2+ (D1 hook enforces this automatically)
- Always include vision_key and arch_key in SD metadata when creating SDs from registered planning artifacts
- Always use the worktree CWD when working on a claimed SD (claim guard hook enforces this)

## Ask First
- Ask First before introducing a new npm dependency (assess size, license, maintenance status)
- Ask First before creating a new sub-agent (consider extending an existing one)
- Ask First before proposing a Phase 2 funding gate based on telemetry (chairman prefers qualitative)
- Ask First before reducing scope below 50% of LEAD-approved size (likely violates SCOPE LOCK)

## Never
- Never modify auth tables (auth.users, auth.identities) without a dedicated security SD
- Never commit to main directly — always use feature branches via worktrees
- Never disable a gate via direct DB UPDATE — use the documented --force override path
- Never call leo-create-sd.js directly — use the /sd-create skill
```

## How the validator works

The B1 validator runs at vision document **upsert time** in `scripts/eva/vision-command.mjs`. It scans the raw markdown content for three heading patterns:

- `## Always` (or `### Always`, allows level-2 to level-6, allows trailing whitespace)
- `## Ask First` (case-insensitive, allows whitespace variations)
- `## Never`

Missing sections produce a console warning with remediation guidance. **The validator does not block the upsert** in warning-only mode.

### What's NOT validated (yet)

The MVP validator only checks for **section presence**, not content quality. Future enhancements may:
- Verify each section has at least 2 items
- Check that Always items use imperative verbs ("Always run X" not "X is the way")
- Cross-reference Never items against other vision docs to detect contradictions
- Auto-suggest tier assignments for items currently in `## Out of Scope`

These are deliberately out of scope for the MVP per chairman scope reduction.

## Backward compatibility

**Existing vision documents are unaffected.** The validator runs only on new upserts. If you re-upsert an existing vision doc that doesn't have the three sections, you'll get a warning — but the upsert succeeds.

The legacy `## Out of Scope` section is **not deprecated**. Vision docs may include both `## Out of Scope` and `## Always`/`## Ask First`/`## Never` if the chairman finds it useful for narrative flow.

## Migration path for existing vision documents

When the chairman next edits an existing vision document, the recommended migration is:

1. Read the existing `## Out of Scope` section
2. For each item, decide which of the three tiers it belongs in:
   - "We're not building feature X" → `## Out of Scope` (or could move to `## Never` if it's a permanent constraint)
   - "We don't need to scale beyond 1000 users yet" → `## Ask First` (revisit when usage approaches the threshold)
   - "All schema changes require database-agent" → `## Always`
3. Add the three new sections alongside the existing `## Out of Scope` (do not remove the legacy section yet)
4. Re-upsert the vision document
5. The validator confirms all 3 sections are present

There is no big-bang migration required. The chairman migrates existing docs opportunistically as they touch them.

## Hard fallback path

Per the SD's Risk Mitigation R1, if the chairman finds the B1 mental model adds friction without proportional value, the SD has a documented hard fallback:

1. Ship this onboarding documentation
2. Ship the validator in warning-only mode
3. **Defer enforcement** — the validator never moves to blocking mode
4. A follow-up SD revisits B1 with a refined mental model

This is not a failure path — it's a pre-committed safety valve. Even the fallback delivers documentation value (this file).

## Acceptance criterion (Vision SC #7)

Before SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001 can move from PLAN-TO-LEAD to LEAD-FINAL-APPROVAL, the chairman must:

1. Read this document end-to-end
2. Create one real vision document using the new Always/Ask First/Never sections
3. Confirm in writing (e.g., `node scripts/eva/vision-command.mjs upsert ...` succeeds with B1 warnings absent)
4. Either:
   a. Approve B1 enforcement → SD ships with all 5 commits, B1 validator is functional
   b. Reject B1 mental model → SD ships with the fallback path (template + docs only), B1 validator is dormant

This is hardcoded in the SD's `success_criteria` field and gates LEAD-FINAL-APPROVAL.
