# Canonical Write Paths Registry

**Owner:** SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001 / FR-4
**Purpose:** Map each Supabase table to its single canonical write helper. The
`tests/unit/governance/canonical-helper-bypass-guard.test.js` reads this registry
(via the auto-generated `canonical-write-paths.json` sidecar) and fails CI when
any direct `.from('<table>').insert/upsert/update(...)` call site exists outside
the listed `exempt_writers`.

The companion `tests/unit/governance/canonical-helper-registry-freshness.test.js`
independently re-discovers writers via grep and asserts (a) every registered
helper exists on disk, (b) every registered helper either writes directly OR
carries a `@canonical-writer-for: <table>` docstring tag, AND (c) emits an
informative warning for orphan tables (canonical-helper-path files writing
to tables not yet in the registry).

## Why this exists

PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 has 17 documented witnesses across
12+ months: a writer-side helper exists but consumers (sub-agents, gates, sweeps)
bypass it. Each prior remediation was a one-off CAPA scoped to one writer/consumer
pair; this registry makes the bypass surface visible at PR time, not 17 witnesses
later.

The registry is the source of truth. The JSON sidecar is regenerated from this
file via `node scripts/lib/registry-parser.js`. Pre-commit / CI ensures the
sidecar stays in sync.

## Disabling the guard temporarily

If a legitimate bypass-without-exemption surfaces in a hot fix, set
`LEAD_PRECHECK_GUARD_DISABLE=1` in CI for ONE PR only — the test downgrades to
warn-only. The CI run logs an `audit_log` entry (category=`lead_precheck_guard_disabled`).
Use this once per fix; the next PR must add the bypass site to `exempt_writers`
or refactor to use the canonical helper.

## How to add a new entry

1. Identify the canonical helper for a table.
2. Annotate the helper file with `@canonical-writer-for: <table>` in its
   leading docblock (so the freshness test can verify the helper still claims
   that table).
3. Grep for direct `.from('<table>').insert/upsert/update(...)` sites outside the helper.
4. Decide each site: refactor to use the helper, OR list it here under `exempt_writers`
   with a one-line rationale of why the bypass is acceptable.
5. Run `node scripts/lib/registry-parser.js` to regenerate the JSON sidecar.
6. Run `npm test -- canonical-helper-bypass-guard.test.js canonical-helper-registry-freshness.test.js`
   — both must pass.

## Initial registry (forward-only ship)

Only entries with a real, present canonical helper are listed at SD ship time.
The orphan-detection signal in `canonical-helper-registry-freshness.test.js`
surfaces additional candidate tables for future registry coverage (long-tail
work tracked separately).

| table | canonical_helper | exempt_writers | rationale |
|-------|------------------|----------------|-----------|
| feedback | lib/governance/emit-feedback.js | scripts/log-harness-bug.js, scripts/lib/lead-precheck-helpers.js, lib/eva/lifecycle-sd-bridge.js, lib/eva/bridge/replit-format-strategies.js, lib/eva/bridge/replit-prompt-formatter.js, lib/quality/assist-engine.js, lib/sub-agents/retro/db-operations.js, lib/uat/result-recorder.js, scripts/audit-completed-sd-db-content-parity.js, scripts/modules/inbox/auto-resolve-recovered.js, scripts/one-off | log-harness-bug + lifecycle-sd-bridge are co-canonical PA-5 emitters; auto-resolve-recovered.js (CAPA-7 lifecycle bot) sets status=resolved on its own ci_failure rows after k-consecutive-pass detection — same "lifecycle bot updating self-emitted rows" pattern as log-harness-bug, not user-facing feedback content (QF-20260511-192 / feedback 720b0f6f); replit/* (replit-format-strategies.js:570, replit-prompt-formatter.js:179) are **templated emitters** — the `supabase.from('feedback').insert(...)` strings are literal source text embedded in lines.push()/template-literal blocks that get rendered into user-facing Replit project code; they are NOT runtime callers and cannot be migrated to emitFeedback. Permanent exemption (QF-20260511-088 / feedback 7922a332, auxiliary disposition for SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 C3). quality/retro/uat writers ARE runtime bypass sites surfaced by the registry (refactor to emitFeedback tracked in follow-up SD); scripts/one-off prefix exempts SD-specific one-off scripts (each carries its own SD-key in filename). |
| security_audit_events | lib/security/audit-events-emitter.js |  | Direct writer at line 116; @canonical-writer-for tag carries authority. |
| strategic_directives_v2 | scripts/handoff.js | scripts/sd-start.js, scripts/modules/handoff, lib/sd/revert.js, lib/claim-validity-gate.js, lib/claim-lifecycle-release.mjs, lib/drain-orchestrator.mjs, scripts/leo-create-sd.js, scripts/add-prd-to-database.js, scripts/one-off, scripts/archive, lib/eva/bridge/verification-sd-generator.js, lib/gap-detection/creators/corrective-sd-creator.js | SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 governance hygiene. handoff.js carries `@canonical-writer-for: strategic_directives_v2` and is the canonical writer for phase transitions + handoff state. exempt_writers: sd-start.js (claim takeover via claim_sd RPC), scripts/modules/handoff (gate executors invoked by handoff.js), lib/sd/revert.js (atomic single-UPDATE precedent for revert), lib/claim-validity-gate.js (orphan auto-release sets worktree_path=null), lib/claim-lifecycle-release.mjs (CAS release pattern), lib/drain-orchestrator.mjs (drain path UPDATEs), scripts/leo-create-sd.js (initial INSERT), scripts/add-prd-to-database.js (sub-agent orchestration metadata), scripts/one-off (per-SD enrichment), scripts/archive (legacy one-off scripts), lib/eva/bridge/verification-sd-generator.js (EVA pipeline INSERT for verification SDs — refactor tracked separately), lib/gap-detection/creators/corrective-sd-creator.js (gap-detection auto-creates corrective SDs — refactor tracked separately). NEW raw .update() callers must add to this list OR use handoff.js. Note: PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 18th-witness root cause was sync_is_working_on_with_session trigger overreach (FR-2 trigger fix) — NOT writer-side; canonical writer here is governance hygiene + future-call discoverability. |
