import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002';

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('risks, success_criteria, scope')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) { console.error(fetchErr); process.exit(1); }

const newRisks = [
  ...(sd.risks || []),
  {
    risk: 'R1 (RISK sub-agent, LEAD): the DB-driven generator is all-or-nothing fleet-wide — assertSharedSectionsNotCopied() throws and refuses to render ANY charter file (CLAUDE.md, CORE, LEAD, PLAN, EXEC, ADAM, SOLOMON, COORDINATOR) if shared prose (row 610, role_partnership_contract) is duplicated into a new coordinator_manual/coordinator_provenance row.',
    impact: 'high',
    likelihood: 'medium',
    mitigation: 'Reuse scripts/protocol/adam-contract-land.mjs\'s existing preflight (already checks this exact hazard) rather than re-deriving a shared-row detector.'
  },
  {
    risk: 'R2 (RISK sub-agent, LEAD): FR-4 as originally worded ("tripled utilization statements") is measured to be FALSE — the 8 hits in row 605 are textually distinct clauses from 3 different dated operator directives (06-07, 06-10, 07-03) plus a resource-pool duty and an Adam-boundary clause, not duplicates. Deleting them as "dedup" would retire governed directives, which is explicitly OUT OF SCOPE for this SD.',
    impact: 'high',
    likelihood: 'high',
    mitigation: 'FR-4 RE-SCOPED at LEAD: "consolidate without retiring" — PLAN must produce a clause-level KEEP/MERGE/MOVE ledger before touching row 605; only the genuinely duplicated "comms MUST be typed" headers (2 verbatim instances) may be collapsed. Dated directive clauses move to PROVENANCE verbatim, never deleted.'
  },
  {
    risk: 'R3 (RISK sub-agent, LEAD): splitting row 605 (21,853 chars) across charter/manual/provenance is an unverified content migration — check-claude-md-drift.cjs only verifies DB-to-file fidelity, so a clause silently dropped during the split still renders faithfully and reports GREEN.',
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'Add a byte/clause-conservation assertion against a pre-migration snapshot of row 605 (e.g. every distinctive sentence must appear in exactly one of charter/manual/provenance post-split) before the migration is considered complete.'
  },
  {
    risk: 'R10 (RISK sub-agent, LEAD): FR-2 encoding the STANDARD_LOOPS governance (session_arm/gha_backed contract, 08-22 cron ruling) as hand-typed charter prose creates a SECOND, unlinked representation of scripts/coordinator-startup-check.mjs\'s STANDARD_LOOPS array — the next QF that flips a session_arm flag desyncs the charter text, reopening the exact FR-3 drift-class bug this SD exists to close.',
    impact: 'medium',
    likelihood: 'high',
    mitigation: 'Generate the charter\'s loop-governance table FROM the STANDARD_LOOPS array (preferred) or add a drift-check assertion comparing the two (count + the gha_backed+session_arm:false set, with relay-drain/sms-relay-drain carved out) — never hand-typed prose with no linkage.'
  }
];

const newCriteria = [
  ...(sd.success_criteria || []),
  { criterion: 'M1/R1: adam-contract-land.mjs\'s shared-row preflight passes before any coordinator_manual/coordinator_provenance row is created (no shared-row duplication into the new companion rows).', measure: 'Preflight script run + PASS logged in PRD evidence' },
  { criterion: 'M2/R2: a clause-level KEEP/MERGE/MOVE ledger for row 605\'s 8 "utilization" hits exists in the PRD before FR-4 implementation; only genuinely-duplicated headers are collapsed, dated directive clauses move verbatim to PROVENANCE.', measure: 'Ledger present in PRD, reviewed against pre-migration row 605 snapshot' },
  { criterion: 'M3/R3: a pre-migration snapshot of row 605 is diffed against the post-split charter+manual+provenance union — zero distinctive sentences lost.', measure: 'Diff script output: 0 orphaned/dropped sentences' },
  { criterion: 'M9/R10: the charter\'s STANDARD_LOOPS governance table is either generated from the live STANDARD_LOOPS array or has a drift-check assertion comparing table content to the array (count + session_arm:false set).', measure: 'check-claude-md-drift.cjs (or its extension) fails on a deliberately-desynced STANDARD_LOOPS array in a test' },
  { criterion: 'Known incidental fixes required for the migration to be safe: tests/unit/protocol-publication-pipeline.test.js section-count assertion (21 -> 23), tests/unit/decompose-weakest-classify-rule.test.js line-40 grep target moved to manual, .docmon/rules.json root_allowlist updated for the 2 new files, coordinator digest char-budget reviewed (currently 3000 default vs Adam\'s documented 16000 after decapitation).', measure: 'All 4 items addressed or explicitly deferred with a follow-up QF filed' }
];

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({ risks: newRisks, success_criteria: newCriteria })
  .eq('sd_key', SD_KEY);

if (updErr) { console.error(updErr); process.exit(1); }
console.log('SD updated: risks +4, success_criteria +5 (LEAD risk-agent correction, RISK row a97f8821-6fc0-4e62-8d9d-ac0846c4c847)');
