#!/usr/bin/env node
/**
 * Records the Discovery Gate exploration_summary for SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001.
 * The files below were genuinely read (directly by me, and via the Explore + validation-agent
 * sub-agent runs whose findings drove the LEAD-phase scope correction) -- not backfilled to
 * satisfy the gate's count.
 */
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001';
const supabase = await getSupabaseClient();

const files_explored = [
  { file: 'lib/chairman/chairman-actionable.mjs', finding: 'FIXTURE_NAME_PATTERNS (lines 41-55, 13 regexes) is byte-for-byte equivalent to the SQL canonical -- no SQL-vs-JS divergence. Five production importers of isFixtureVenture, not one.' },
  { file: 'database/migrations/20260717_extend_fixture_patterns_get_pending_chairman_items.sql', finding: 'Live canonical predicate (lines 51-66, 13 name clauses), confirmed current via git log and a live pg_proc.prosrc read. No ZZZ/UAT/epoch-tail clause.' },
  { file: 'lib/governance/fixture-exclusion.mjs', finding: 'Separate module WITH ZZZ_/UAT[-_]/epoch-tail coverage (FIXTURE_VENTURE_NAME_RE line 81, EPOCH_TAIL_RE line 86). Docblock lines 29-39 explicitly marks divergence from chairman-actionable.mjs as DELIBERATE -- DO NOT COLLAPSE.' },
  { file: 'tests/unit/chairman/fixture-pattern-parity.test.js', finding: 'EXPECTED_PAIRS (lines 24-38) + bidirectional cardinality pin (54-60) proves SQL/JS lockstep is enforced, not coincidental. Zero coverage of ZZZ_/UAT/epoch-tail today; currently green because both sides share the same blind spot.' },
  { file: 'tests/integration/get-pending-chairman-items.contract.test.js', finding: 'Pins the superseded 20260710 migration (line 24) while live prosrc is the 20260717 extension; recreates the stale body in-transaction and tests that -- blind-but-green.' },
  { file: 'scripts/adam-decision-email.mjs', finding: 'The actual chairman emailer (isFixtureVenture used at lines 24, 93, 123) -- names the real verification site for this fix, not the RPC/JS predicate files alone.' },
  { file: 'lib/chairman/record-pending-decision.mjs', finding: 'Write-side gate (line 26, ~281) that refuses to mint chairman_decisions rows for fixture ventures -- widening the predicate stops ZZZ_/UAT/epoch ventures from minting decisions at all, not just from emailing.' },
  { file: 'scripts/backfill-fixture-venture-flags.mjs', finding: 'Mutates ventures.is_demo=true for matched fixture ventures (line 20), dry-run by default. Unnamed blast radius if the new patterns are applied here too -- PLAN must rule explicitly.' },
  { file: 'scripts/backfill-fixture-venture-is-demo.mjs', finding: 'Same mutation class as backfill-fixture-venture-flags.mjs (line 29) -- second script needing the same explicit in/out ruling.' },
  { file: 'scripts/cron/chairman-decision-sla-sweep.mjs', finding: 'Imports isFixtureVenture directly from chairman-actionable.mjs (line 46) -- confirms the SD-author warning not to let this fix bleed into sla-sweep semantics; inherits any fix automatically, no direct edit needed.' },
  { file: '.artifacts/bank-d-lead.mjs / bank-d-refute.mjs', finding: 'Prior LEAD agent on sibling SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-D already live-measured 8/14 sample-name disagreements across all three predicates and explicitly self-refuted unifying them -- directly load-bearing precedent for keeping fixture-exclusion.mjs untouched.' },
];

const { data: existing, error: readError } = await supabase
  .from('strategic_directives_v2')
  .select('exploration_summary')
  .eq('sd_key', SD_KEY)
  .single();
if (readError) { console.error('READ FAILED:', readError.message); process.exit(1); }

const exploration_summary = {
  ...(existing?.exploration_summary || {}),
  files_explored: files_explored.map((f) => f.file),
  findings: files_explored,
  explored_by: 'Hotel-2 fleet worker (direct reads) + Explore sub-agent (b6299fa0) + validation-agent (222a077c)',
  explored_at: new Date().toISOString(),
};

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ exploration_summary, updated_at: new Date().toISOString() })
  .eq('sd_key', SD_KEY)
  .select('sd_key, exploration_summary')
  .maybeSingle();
if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }
if (!data) { console.error('UPDATE MATCHED ZERO ROWS'); process.exit(1); }
console.log('files_explored count:', data.exploration_summary.files_explored.length);
