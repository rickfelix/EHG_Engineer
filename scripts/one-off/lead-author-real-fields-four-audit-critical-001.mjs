#!/usr/bin/env node
// LEAD-phase: replace the auto-generated boilerplate strategic_objectives/success_criteria/
// key_changes/risks (leo-create-sd's generic template) with real, SD-specific content, matching
// this SD's own rich description (sourced from coordinator advisory 170c2a9c). Per CLAUDE_PLAN.md
// NC-PLAN-003/NC-PLAN-005 (no boilerplate, no placeholders) -- applying the same discipline at
// LEAD before PRD authoring inherits it.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001';

const strategic_objectives = [
  'Eliminate the JS local-timezone misparse of tz-naive audit-critical timestamps (sd_phase_handoffs, strategic_directives_v2, quick_fixes, user_stories) by converting their timestamp columns to timestamptz, so every age/staleness/ordering computation over these tables is correct in every runtime timezone, not just UTC-run CI.',
  'Close the JS-consumer half (folded from SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001): audit and fix high-traffic readers that currently compensate for tz-naive timestamps, so the column-type migration does not trade a silent under-conversion bug for a silent double-conversion one.',
];

const success_criteria = [
  { criterion: 'Migration is staged, never applied inline', measure: 'database/chairman-gated/<date>_*.sql exists with a blank @approved-by header; grep confirms no inline-apply caller across scripts/' },
  { criterion: 'Pre/post verification is authoritative, not sampled', measure: 'information_schema.columns query over SUPABASE_POOLER_URL (pg_catalog is not exposed via PostgREST) confirms data_type=\'timestamp with time zone\' for the audit-critical timestamp column(s) on all 4 tables post-apply; pre-apply baseline confirms \'timestamp without time zone\'' },
  { criterion: 'High-traffic JS readers of the 4 tables\' timestamp columns are audited for double-conversion risk and fixed where found', measure: 'grep sweep across ehg/src and EHG_Engineer/{scripts,lib} for readers computing age/staleness from these 4 tables\' created_at columns; each finding documented as safe-as-is or fixed' },
  { criterion: 'Reversible', measure: 'paired _DOWN.sql reverts timestamptz -> timestamp, re-verified via the same information_schema check restoring the pre-apply baseline exactly' },
  { criterion: 'Chairman ceremony packet is complete', measure: 'migration + blank @approved-by + apply command documented in database/chairman-gated/README.md, matching house convention; quiet-window scheduling note included since these are continuously-written tables' },
];

const key_changes = [
  { change: 'Stage ALTER COLUMN TYPE timestamp -> timestamptz for the audit-critical timestamp column(s) on sd_phase_handoffs, strategic_directives_v2, quick_fixes, user_stories (chairman-gated, never applied inline)', impact: 'Closes the JS local-timezone misparse bug at its root -- every existing and future reader is fixed at once, no per-reader compensation needed.' },
  { change: 'Author an information_schema.columns-based pre/post verification script run over the pooler (pg_catalog is not exposed through PostgREST -- the established pattern per 4 existing scripts that read pg_policies the same way)', impact: 'Authoritative, column-property-level proof of the migration state, not a sampled row-level inference.' },
  { change: 'Audit and fix high-traffic JS readers (folded scope from SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001) for double-conversion risk once these columns become timezone-aware', impact: 'Prevents trading a silent under-conversion bug (today) for a silent over-conversion bug (post-migration).' },
  { change: 'Author paired DOWN migration + chairman ceremony packet (README entry, blank approval header)', impact: 'Reversible, matches house chairman-gated DDL convention exactly.' },
];

const risks = [
  {
    risk: 'ALTER COLUMN TYPE on 4 continuously-written core tables is a table rewrite (ACCESS EXCLUSIVE lock for the duration), not a metadata-only change -- applying it against live fleet writes without a quiet window risks lock contention or writer errors.',
    impact: 'high', likelihood: 'medium',
    mitigation: 'Staged only, never applied by EXEC. Ceremony packet documents a quiet-window scheduling requirement for the chairman/coordinator to honor at apply time -- this is an apply-time coordination concern, not a build-time one.',
  },
  {
    risk: 'Rows may carry MIXED tz-naive and tz-aware representations during the transition window (application code writing new rows before the migration applies, or partial-apply states) -- a reader assuming a single representation could misparse either direction.',
    impact: 'medium', likelihood: 'medium',
    mitigation: 'Per-column normalize-on-read guidance documented explicitly in the PRD, per the coordinator\'s own review disposition -- readers should tolerate both forms during any transition period, not assume the migration is atomic across every writer.',
  },
  {
    risk: 'High-traffic JS readers that currently compensate for tz-naive timestamps (e.g. manually appending Z or assuming UTC) could silently double-convert once the column returns a properly tz-aware value from Postgres, producing a NEW timezone-skew bug in the opposite direction.',
    impact: 'high', likelihood: 'medium',
    mitigation: 'Explicit audit sweep (key_changes #3) of high-traffic readers across both repos before merge; each finding classified and fixed or documented as already-safe.',
  },
  {
    risk: 'Implementation may not fully address root cause',
    impact: 'low', likelihood: 'low',
    mitigation: 'Verify against original evidence; re-queue via /learn if pattern recurs.',
  },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error('READ ERR:', readErr.message); process.exit(1); }

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({ strategic_objectives, success_criteria, key_changes, risks })
  .eq('id', sd.id);
if (updErr) { console.error('UPDATE ERR:', updErr.message); process.exit(1); }
console.log('SD fields authored with real, SD-specific content (boilerplate replaced).');
