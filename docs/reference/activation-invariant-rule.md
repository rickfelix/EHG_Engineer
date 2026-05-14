# Activation Invariant Rule

**SD**: SD-LEO-INFRA-REQUIRE-END-END-001 / FR-5
**Status**: Active
**Source-of-truth**: `scripts/modules/handoff/executors/lead-final-approval/gates/activation-invariant-gate.js`

## What

A LEAD-FINAL-APPROVAL gate that blocks SD completion when an SD ships a **schema + UI + worker chain** but lacks an end-to-end test asserting the chain works against real data.

Closes 26th writer-consumer asymmetry witness at SD-orchestration scale (`PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001`).

## When does it trigger

A DUAL-SCAN trigger evaluator (`scripts/modules/activation-invariant/trigger-evaluator.js`) fires when EITHER:

- **Lane 1 (structured)**: `key_changes[*].type` contains `schema|database|migration` AND (`feature|ui|component|route` OR `worker|consumer|api|service|job`).
- **Lane 2 (free-text)**: aggregated text across `key_changes`, `description`, `scope`, `title` matches schema-evidence regex AND consumer-evidence regex with word-boundary anchors.

Each lane internally requires the schema+consumer pair, so pure migrations and pure UI tweaks do not match. Either lane alone is sufficient — this is necessary because some SDs (e.g., `SD-GVOS-S17-*`) use `{title, detail}` shape with no `type` field; Lane 1 would miss them.

False-positive rate target: <10% (tuneable via constants at the top of `trigger-evaluator.js`).

## What does PLAN need to do

For SDs that will trigger the gate:

1. Populate `product_requirements_v2.activation_test_id` with the relative path to the activation invariant test spec (e.g., `tests/e2e/activation-invariant/my-chain.spec.ts`).
2. Write the test before EXEC ships. The test must:
   - Operate against a real (or migration-applied test) database.
   - Execute the schema → worker → UI path end-to-end.
   - Assert a non-trivial DOM/state outcome that depends on both the data layer being populated AND the consumer being wired.

For SDs that introduce catalog/registry tables expected to be seeded post-migration:

3. INSERT one row per (table_name, seed_migration_path) into `activation_catalog_expectations`. The CI guard `scripts/check-activation-catalog.mjs <SD-ID>` will assert `COUNT(*) > 0` for each declared table.

## What does EXEC need to do

For SDs that triggered the gate:

1. Write the activation invariant test at the path declared in `product_requirements_v2.activation_test_id`.
2. Run it. All assertions must pass against real data.
3. Invoke `testing-agent` — it will write a `sub_agent_execution_results` row with `verdict='PASS'` and `metadata.activation_invariant_verified=true` (within 24h of the LEAD-FINAL-APPROVAL handoff).

## Bypass channel

Rate-limited 3 per SD, 10 per day. Logged to `audit_log`.

```bash
node scripts/handoff.js execute LEAD-FINAL-APPROVAL <SD-ID> \
  --bypass-validation \
  --bypass-reason "ACTIV-CHAIN-DEFERRED:<ticket-ref>"
```

The gate scans `sd.metadata.governance_metadata.bypass_reason` for the `ACTIV-CHAIN-DEFERRED` token. No new bypass flag — reuses the existing handoff.js bypass infrastructure.

## Helper utilities

| Script | Purpose | Exit codes |
|--------|---------|------------|
| `node scripts/audit-activation-chain.mjs <SD>` | Reports 0-5 coverage score across registry/route/menu/flag/E2E dimensions for any SD | 0 if ≥4/5, 1 otherwise, 2 on error |
| `node scripts/check-activation-catalog.mjs <SD>` | Asserts COUNT(*) > 0 for each declared catalog table | 0 if all non-empty, 1 if any empty, 2 on error |
| `node scripts/one-off/scan-completed-sds-for-activation-gap.mjs` | Retroactive scan of completed SDs; emits idempotent feedback rows for suspected gaps. Dry-run by default; pass `--commit` to write. | 0 always (errors logged) |

## Trigger heuristic tuning

The Stage-1 implementation uses path heuristics + free-text regexes. False positives are anticipated (PRD risk R1) and will be tuned by:

- Running `audit-activation-chain.mjs` against 50+ recent completed SDs (FR-4 follow-up work).
- Adjusting the `SCHEMA_TYPES`, `SURFACE_TYPES`, `WORKER_TYPES` sets and the `SCHEMA_TEXT_REGEX`, `SURFACE_TEXT_REGEX`, `WORKER_TEXT_REGEX` patterns at the top of `trigger-evaluator.js`.
- Documenting tuning decisions in this file and the SD's retrospective.

Future Stage-2 tuning may add acorn-based AST call-graph analysis for more precise touched-file classification.

## Anti-patterns

- ❌ Skipping the activation invariant test because "the unit tests cover it" — unit tests with mocks do NOT close the writer-consumer asymmetry. The whole point is testing against real data.
- ❌ Adding a new `--bypass-activation-invariant` flag — use the existing reason-text discriminator (`ACTIV-CHAIN-DEFERRED:`) so the existing quota infrastructure applies.
- ❌ Creating a new sub-agent code — extend `TESTING` agent. Per DATABASE sub-agent decision (evidence row `6d7eaf00-eacb-498a-8256-1f369c82ed6b`): adding a new code forces gate-pipeline rewiring at every handoff.
- ❌ Storing `expects_seed` declarations on `strategic_directives_v2.metadata` JSONB — use the side table `activation_catalog_expectations` for FK integrity and queryability.

## Reference

- Strategic Directive: SD-LEO-INFRA-REQUIRE-END-END-001
- PRD: `product_requirements_v2` row for this SD
- Pattern: PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (26th witness; closes Layer B; Layer A closed by SD-FDBK-REFAC-LEO-CREATE-003-001 PR #3758)
- Migrations: `database/migrations/20260513_add_activation_test_id_to_prd.sql`, `database/migrations/20260513_create_activation_catalog_expectations.sql`
