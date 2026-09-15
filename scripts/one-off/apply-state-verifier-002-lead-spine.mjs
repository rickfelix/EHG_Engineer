#!/usr/bin/env node
/**
 * SD-LEO-INFRA-APPLY-STATE-VERIFIER-002 -- LEAD-phase spine population.
 *
 * LEAD-phase Explore measured the premise directly rather than trusting the SD's own text:
 * the "about 124 per Alpha-3's earlier count" figure attached to this SD's scope is a
 * MISCITATION -- Alpha-3's 124 was a fleet-wide census of POTENTIAL false-positive
 * CANDIDATES (a different measurement entirely, sourced in SD-LEO-INFRA-APPLY-STATE-VERIFIER-001's
 * own description), not a count of schema_migrations_applied success rows. Measured live
 * (2026-09-15): 393 success rows / 388 distinct normalized paths, of which 366 resolve to a
 * file that still exists on disk (22 recorded-applied paths no longer resolve -- a separate,
 * out-of-scope data-quality gap). Of the 366 on-disk files, 150 declare a CREATE FUNCTION or
 * CREATE TRIGGER -- the only object classes whose classification actually invokes
 * normalizeSqlBody()/normalizeTriggerWhenClause() (the RC2 normalizer this SD guards). The
 * remaining ~216 are table/column/index/constraint-only DDL, classified purely on live-set
 * membership -- freezing them as corpus fixtures would exercise zero of the code path this SD
 * exists to regression-guard.
 *
 * Confirmed false positives to date: exactly ONE, not a set -- trg_sd_mutation_audit
 * (database/chairman-gated/20260912_sd_mutation_audit_actor_threading.sql, SD-LEO-INFRA-
 * AUDIT-ACTOR-THREADING-001), with its file text and live pg_get_triggerdef() text already
 * captured verbatim in tests/verify-migration-apply-state.test.js:640-665 (TS-1). The two
 * SUSPECT rows named in SD-001's own description (SD-LEO-INFRA-FIX-CLAIM-EVICTION-001,
 * SD-LEO-INFRA-CLAIM-PARENT-CHILD-001) were explicitly never confirmed by either the
 * coordinator or Solomon -- excluded from the corpus as unconfirmed, per that record.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-APPLY-STATE-VERIFIER-002';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const key_changes = [
    {
      change: 'New tests/fixtures/apply-state-verifier-corpus/ directory: one fixture for the sole confirmed false positive (trg_sd_mutation_audit), plus a generated fixture set for the known-applied function/trigger-declaring subset (150 of 366 on-disk applied migration files, drawn from schema_migrations_applied success rows) -- each fixture freezes the migration file DDL text and its live-captured function-prosrc/pg_get_triggerdef() text, so CI needs no live database.',
      impact: 'Pins current, correct verifier behavior (case-folding, implicit-cast-stripping, quote-scoping from both adversarial rounds) against the real population of objects whose classification actually exercises the normalizer -- a regression in normalizeSqlBody()/normalizeTriggerWhenClause() that reintroduces case-sensitivity or cast-sensitivity, or breaks quote-scoping, fails CI immediately instead of silently re-opening the chairman-ceremony false-positive class SD-001 just closed.',
    },
    {
      change: 'A generator script (run once to build/refresh the frozen corpus, never invoked by CI) that queries the live DB for the current prosrc/pg_get_triggerdef() text of each function/trigger-declaring known-applied migration and writes the frozen fixture file plus its own provenance (query timestamp, source table+column).',
      impact: 'The corpus can be regenerated on demand (e.g. after a real schema change legitimately moves a fixture from MATCH to a new frozen MATCH) without hand-editing fixture files, while CI itself stays DB-free per the SD scope.',
    },
    {
      change: 'A CI-runnable Vitest suite that replays classifyFiles()/normalizeSqlBody()/normalizeTriggerWhenClause() over every corpus fixture: the confirmed false positive must classify APPLIED (never BODY_MISMATCH); every known-applied fixture must classify APPLIED; a seeded mutation (one live fixture text deliberately altered) must classify BODY_MISMATCH, proving the test can actually fail.',
      impact: 'Directly satisfies the chairman\'s instruction 2fcd9b0d ("a strong verification step so it catches it all the time") for this specific defect class, without waiting on the rest of Solomon\'s design (A1-A4, B1), which the chairman\'s option 1 explicitly deferred to the harness backlog.',
    },
    {
      change: 'A short README.md in the corpus directory documenting how to add a new confirmed false positive (file text + live text + source SD/PR), so future confirmed specimens grow the corpus instead of living only in a commit message.',
      impact: 'Closes the SD scope\'s explicit third deliverable and gives the next confirmed false positive a durable home from day one.',
    },
  ];

  const strategic_objectives = [
    'Answer chairman instruction 2fcd9b0d ("How can we implement a process that we cannot bypass and that has a strong verification step so it catches it all the time? ... how do we better address the root causes?") for the specific RC2 root cause (hand-normalizer drift) via decision 27bfdde9, option 1: build Solomon\'s step B3 now, defer A1-A4/B1 to the harness backlog.',
    'Prevent the case-folding/implicit-cast/quote-scoping fix shipped by SD-LEO-INFRA-APPLY-STATE-VERIFIER-001 (PR #8973, plus 2 adversarial rounds) from silently regressing -- a CI-enforced, DB-free replay corpus over the confirmed false positive and the real known-applied population that exercises the normalizer.',
  ];

  const risks = [
    {
      risk: 'The SD scope text\'s "about 124" figure for the known-applied set is a miscitation of a different, unrelated fleet-wide census (Alpha-3\'s POTENTIAL false-positive candidate count from SD-001\'s own description) -- the real schema_migrations_applied success-row population is 388 distinct paths (366 on disk), of which only 150 declare a function or trigger and are actually subject to the normalizer this SD guards.',
      severity: 'low',
      mitigation: 'Corrected at LEAD Explore via direct live measurement (this record). PLAN scopes the corpus to the 150 function/trigger-declaring files (the population that exercises normalizeSqlBody()/normalizeTriggerWhenClause()), not a literal reading of "~124" or a blanket 366 -- table/column/index-only migrations classify on live-set membership alone and would contribute zero regression coverage for this SD\'s actual concern.',
    },
    {
      risk: '22 of 388 known-applied paths no longer resolve to a file on disk (renamed, moved, or the ledger row predates a repo reorganization) -- a corpus generator naively iterating the full ledger would throw or silently skip these.',
      severity: 'low',
      mitigation: 'Generator script fails loud (logs and skips, never throws) on an unresolvable path and records the skip count in its own provenance output; retroactively investigating why those 22 paths vanished is explicitly out of scope for this SD (a separate data-quality item if the chairman wants it pursued).',
    },
    {
      risk: 'A frozen fixture corpus can itself go stale if a migration file is legitimately edited post-application (rare, but not impossible) -- the corpus would then assert a false MATCH against text that no longer matches either the file or a genuinely-changed live object.',
      severity: 'low',
      mitigation: 'The corpus fixture freezes BOTH sides (file text AND live text) as they were captured at generation time -- it is a pure regression guard on the normalizer\'s behavior over that frozen pair, not a live-truth check. The generator script exists precisely so the corpus can be regenerated when a real, deliberate change occurs; documented in the corpus README.',
    },
  ];

  const smoke_test_steps = [
    {
      instruction: 'Run the new corpus test suite with no DATABASE_URL/SUPABASE_POOLER_URL set',
      step_number: 1,
      expected_outcome: 'All fixture tests run and pass -- zero live DB calls, confirming the CI-runnable, DB-free requirement',
    },
    {
      instruction: 'Seed a mutation into one frozen known-applied fixture\'s live text (e.g. flip a WHEN-clause column name) and re-run the suite',
      step_number: 2,
      expected_outcome: 'That fixture\'s test fails with BODY_MISMATCH, proving the corpus test is not vacuous',
    },
  ];

  const success_criteria = [
    {
      criterion: 'The corpus contains the sole confirmed false positive (trg_sd_mutation_audit) plus the real known-applied function/trigger-declaring population (150 files, corrected from the SD\'s miscited "~124"), frozen as fixtures requiring no live database.',
      measure: 'tests/fixtures/apply-state-verifier-corpus/ contains the confirmed-false-positive fixture and a generated fixture file covering all 150 function/trigger-declaring known-applied migrations, each with provenance (source path, capture timestamp).',
    },
    {
      criterion: 'CI fails if any known-applied fixture flips away from APPLIED.',
      measure: 'A seeded-mutation test (PR evidence) demonstrates at least one fixture flipping to BODY_MISMATCH and failing the suite.',
    },
    {
      criterion: 'The corpus test suite runs with no live database connection.',
      measure: 'CI run log / local run with DATABASE_URL and SUPABASE_POOLER_URL unset both show the suite passing.',
    },
  ];

  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const mechanism_verifications = [
    { verified_by: 'LEAD-Explore', verified_at: 'scripts/verify-migration-apply-state.mjs:1031-1043' },
    { verified_by: 'LEAD-Explore', verified_at: 'tests/verify-migration-apply-state.test.js:640-665' },
    { verified_by: 'LEAD-Explore', verified_at: 'lib/migration-audit-reader.js:155-166' },
  ];

  const { error: updErr } = await supabase.from('strategic_directives_v2')
    .update({
      key_changes,
      strategic_objectives,
      risks,
      smoke_test_steps,
      success_criteria,
      metadata: {
        ...sdRow.metadata,
        mechanism_verifications,
        needs_enrichment: [],
        lead_premise_correction: {
          claimed: 'known-applied set ~124 per Alpha-3\'s earlier count',
          measured_at: new Date().toISOString(),
          measured: 'schema_migrations_applied success rows: 393 total / 388 distinct normalized paths / 366 resolve to an existing file / 150 of those declare CREATE FUNCTION or CREATE TRIGGER',
          disposition: 'miscitation -- Alpha-3\'s 124 was a different, unrelated fleet-wide potential-false-positive census (see SD-LEO-INFRA-APPLY-STATE-VERIFIER-001 description); corpus scoped to the 150 function/trigger-declaring files, the only population exercising the guarded normalizer',
        },
      },
    })
    .eq('id', sdRow.id);
  if (updErr) throw updErr;

  console.log('SPINE UPDATED:', SD_KEY, 'id=', sdRow.id);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
