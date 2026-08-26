import fs from 'fs';

const path = 'docs/06_deployment/chairman-held-sends-release-runbook.md';
let content = fs.readFileSync(path, 'utf8');

const oldArchRow = "| Migration gate | **`@chairman-gated`** — deliberately has no `@approved-by` line. Requires the chairman to add one matching their git config email and run `node scripts/apply-migration.js database/migrations/20260824_chairman_held_sends.sql --prod-deploy` with a single-use token. **Not yet applied as of this writing.** |";
const newArchRow = "| Migration gate | Base table (`20260824_chairman_held_sends.sql`) is `@chairman-gated` and has been chairman-applied and live since 2026-08-25. The FR-3 reply-field columns (`database/migrations/20260826_chairman_held_sends_reply_fields.sql`) are a NEW, separate, self-applicable migration — bare nullable `ADD COLUMN`/`COMMENT ON COLUMN` only, no `@chairman-gated` header needed, applied directly at EXEC. |";
if (!content.includes(oldArchRow)) throw new Error('arch row not found');
content = content.replace(oldArchRow, newArchRow);

const oldPreMigSection = "## Pre-migration behavior (current state)\n\nEvery call site that reads or writes `chairman_held_sends` is fail-soft or unreachable while the\ntable does not exist, verified by direct source read (not assumed):\n\n- The hold-persist INSERT (`chairman-sms-gate/index.js`) is wrapped in a try/catch that never\n  re-throws — a missing-table error is loud-logged only; the SMS send is correctly held either\n  way.\n- The sweep's held-rows read pattern-matches PostgREST's `schema cache`/`does not exist` wording\n  and returns `exitCode: EXIT_OK` with `summary.tableApplied: false` **before** the per-row loop\n  ever runs. This means the sweep does not go CI-red every 15 minutes pre-migration.\n- Because of that short-circuit, `releaseHeldSend()`'s three `chairman_held_sends` call sites\n  (claim, unclaim, release-write) are **unreachable**, not merely fail-soft, until the migration\n  lands — they are only invoked from the sweep's per-row loop.\n\n`scripts/lint/schema-reference-allowlist.json`'s `_chairman_held_sends_note` documents this in\ndetail and names the removal condition.";

const newPreMigSection = "## Migration status (as of SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002)\n\nBoth migrations are now live. The base table has been chairman-applied since 2026-08-25; the\nFR-3 reply-field columns landed 2026-08-26. The fail-soft/unreachable behavior described in the\noriginal (v1.0.0) version of this runbook was real for the pre-migration window but no longer\napplies — the sweep's held-rows read no longer short-circuits on `table_not_yet_applied`, and\nevery `chairman_held_sends` call site in `releaseHeldSend()` (claim, unclaim, release-write) is\nnow genuinely reachable in production. `scripts/lint/schema-reference-allowlist.json`'s\n`chairman_held_sends` entry (and its `_chairman_held_sends_note`) were removed as part of FR-7,\nafter `npm run schema:snapshot:lint` was re-run to pick up the new columns.";

if (!content.includes(oldPreMigSection)) throw new Error('pre-mig section not found');
content = content.replace(oldPreMigSection, newPreMigSection);

fs.writeFileSync(path, content);
console.log('PART1_DONE');
