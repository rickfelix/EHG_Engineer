import fs from 'fs';

const path = 'docs/06_deployment/chairman-held-sends-release-runbook.md';
let content = fs.readFileSync(path, 'utf8');

const oldAfterSection = "## After the chairman applies the migration\n\n1. Apply: `node scripts/apply-migration.js database/migrations/20260824_chairman_held_sends.sql --prod-deploy` (requires an `@approved-by` line added by the chairman first).\n2. Remove `chairman_held_sends` from `scripts/lint/schema-reference-allowlist.json`'s `tables` array and its `_chairman_held_sends_note`, then re-run `npm run schema:snapshot:lint`.\n3. Confirm the sweep reports `summary.tableApplied: true` on its next run (`gh run list --workflow=chairman-held-sends-release-cron.yml`).";

if (!content.includes(oldAfterSection)) throw new Error('after section not found');

const lines = [];
lines.push("## Post-migration checklist (completed)");
lines.push("");
lines.push("1. ~~Apply the base migration~~ — done, chairman-applied 2026-08-25.");
lines.push("2. ~~Remove `chairman_held_sends` from the schema-reference-lint allowlist~~ — done at FR-7");
lines.push("   (SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002), after re-running `npm run schema:snapshot:lint`.");
lines.push("3. Confirm the sweep reports `summary.tableApplied: true` on its next run:");
lines.push("   `gh run list --workflow=chairman-held-sends-release-cron.yml`.");
lines.push("");
lines.push("## SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 — 7 defects fixed post-migration");
lines.push("");
lines.push("Once the base table was live, five defects surfaced that the pre-migration fail-soft paths had");
lines.push("been masking, plus two operational gaps. All seven were fixed in one SD, each independently");
lines.push("verified by at least one sub-agent pass (Explore + VALIDATION at LEAD; TESTING + SECURITY at");
lines.push("EXEC; VALIDATION + REGRESSION at PLAN_VERIFICATION — 8 findings total across those passes, all");
lines.push("closed, two confirmed via self-administered mutation tests):");
lines.push("");
lines.push("1. **Consult insert never readback-verified (FR-1)** — `lib/adam/presend-consult-lane.cjs` now");
lines.push("   requests `{select:'id', single:true}` on the pre-send consult insert and forwards the row id");
lines.push("   as `consultRowId` through `performBoundedConsult`'s hold-and-surface arm into");
lines.push("   `chairman_held_sends.consult_row_id` — the column existed since the base migration but was");
lines.push("   never written.");
lines.push("2. **Release sweep never supplied a clock (FR-2)** — `scripts/cron/chairman-held-sends-release-sweep.mjs`");
lines.push("   now defaults `context.now = Date.now()`, MERGED (not default-only) into `releaseDeps.context`,");
lines.push("   so the rubric's quiet-hours check evaluates instead of throwing `gate_unavailable` on every");
lines.push("   release attempt.");
lines.push("3. **Schema missing the rubric-required reply fields (FR-3)** — new migration");
lines.push("   `database/migrations/20260826_chairman_held_sends_reply_fields.sql` adds `reply_instruction`,");
lines.push("   `reply_id` (singular — the rubric reads `message.replyId`, one string, never an array), and");
lines.push("   `no_reply_consequence` (all nullable, no CHECK). Hold-time insert persists them; release-path");
lines.push("   reconstruction restores them.");
lines.push("4. **Double-composed SMS body on release (FR-4, CRITICAL)** — `sendChairmanSMS` unconditionally");
lines.push("   re-composes the body from `options`/`replyInstruction`/`noReplyConsequence` on every call. A");
lines.push("   held row's body is ALREADY composed at hold time, so re-dispatching it through the same gate on");
lines.push("   release without a guard would fold those fields in a SECOND time — a visibly duplicated message");
lines.push("   to the chairman. Caught at LEAD by VALIDATION before any code existed; fixed with");
lines.push("   `opts.skipCompose`, which `releaseHeldSend()` always sets and no other caller can reach.");
lines.push("5. **Non-UUID `--decision-id` silently dropped a hold (FR-5)** — `scripts/adam-chairman-decision.mjs`");
lines.push("   now UUID-validates `--decision-id` before any write (a mistyped id previously failed the insert");
lines.push("   with Postgres 22P02, caught-but-silent). Live execution is gated behind `isMainModule()` so the");
lines.push("   validator (`parseDecisionArgs`) is unit-testable without side effects.");
lines.push("6. **No detection for a stranded hold (FR-6)** — the existing `v_chairman_held_sends_unreconcilable`");
lines.push("   view is db-tier-only and blind for a row's first 24h. A new, unit-testable JS function");
lines.push("   (`detectOrphanedHeldSends`, in the sweep script) additionally flags `consult_row_id IS NULL`");
lines.push("   (with a correlation id present), `attempts > 0`, and rows stuck in `status='releasing'` past one");
lines.push("   sweep cadence. Two confirmed-dead historical rows (their underlying `chairman_decisions` row no");
lines.push("   longer existed) were voided to `status='abandoned'` with documented provenance");
lines.push("   (`scripts/one-off/void-stranded-chairman-held-sends-decision-002.mjs`).");
lines.push("7. **Stale lint allowlist (FR-7)** — see \"Migration status\" above.");
lines.push("");
lines.push("Full detail, including the 8 sub-agent findings and how each was verified (not just re-read), is");
lines.push("in the SD's retrospective: `retrospectives.id = cfbcd122-0ed6-406e-9819-fe9cfbf26d27`.");

const newAfterSection = lines.join("\n");
content = content.replace(oldAfterSection, newAfterSection);

fs.writeFileSync(path, content);
console.log('PART2_DONE');
