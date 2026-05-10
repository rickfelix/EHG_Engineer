#!/usr/bin/env node
/**
 * One-off: LEAD-phase scope-lock for SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001.
 *
 * Validation-agent verdict (b74ae6e3-edcf-42e9-93bf-475b90a536ce): WARNING (88%)
 * Risk-agent verdict       (d8f2c253-56e6-4944-a8e2-49b02c26b9b2): PASS    (92%)
 *
 * LEAD decision: lock scope to Option A NARROWED. Reject Option B/C — 52 prod
 * rows have quality_checked=false (5 chairman_approved=true bypass-lineage),
 * trigger reconciliation is high-risk against theoretical Q4=ZERO premise.
 *
 * Idempotent: safe to re-run; only updates fields, no inserts.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const SD_KEY = 'SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001';

const SCOPE = `IN SCOPE (Option A NARROWED, locked at LEAD 2026-05-10):
- scripts/eva/vision-scorer.js scoreSD(): add quality_checked + quality_issues to vision/arch dimension SELECT projection (lines ~58, ~83).
- Emit informational warning [VisionScorer][QC-WARN] (NOT block, NOT skip) at most once per scoreSD() invocation when qc=false rows are observed.
- Extend tests/unit/eva/vision-scorer.test.js (currently 137 LOC, 7 cases) with: (1) projection includes quality_checked + quality_issues, (2) warning emitted on qc=false, (3) warning suppressed on qc=true.
- Estimated total: ~30 LOC source + ~50 LOC test = ~80 LOC PR (Tier 2, well under infra max 150).

OUT OF SCOPE (deferred to separate SD-seed if witnessed):
- Trigger reconciliation between auto_validate_vision_quality (5000-char) and trg_eva_vision_quality_check (500-char). Last-fired wins (alphabetical) means 500-char trigger is current authority — DROPPING the 5000-char trigger may be the simplification but requires full audit.
- Production data migration on the 52 active rows with quality_checked=false (including 5 chairman_approved=true bypass rows from SD-VISION-QUALITY-GATE-BYPASS-ORCH-001).
- Modifications to lib/eva/ consumers (vision-repair-loop.js, stage-17-doc-generation.js, vision-upsert.js, archplan-upsert.js) — they ALREADY consume quality_checked correctly; SD's "structurally incapable" framing applies only to scripts/eva/.
- New audit_log emission. Q4 ZERO check found no historical vision_quality_check_* events; warning surface stays as console-only operator signal (lower friction, easy to tighten later if witnessed).
- 3rd trigger trg_enforce_vision_quality_advancement is the actual enforcement gate; it raises EXCEPTION on status='active' / chairman_approved=true transitions. Already correct — no change needed.

WHY NARROWED (LEAD reasoning):
- Validation-agent confirmed Q4 = ZERO incidents all-time → premise is theoretical, no witnessed warning storm.
- Risk-agent quantified migration risk: 52 prod rows + bypass-lineage = high blast radius for low evidentiary base.
- Option A NARROWED is observation-only (read-side projection + log). Single-commit revert. Zero migration. Closes the witnessed gap (scripts/eva/vision-scorer non-consumer) without touching the 52-row data state.`;

const KEY_CHANGES = [
  {
    change: "Add quality_checked + quality_issues columns to scoreSD() vision/arch SELECT projection in scripts/eva/vision-scorer.js",
    impact: "Scorer pipeline becomes observability-aware of quality flag; no enforcement change, no skip behavior, no audit_log write."
  },
  {
    change: "Emit informational warning '[VisionScorer][QC-WARN] vision_key=<k> qc=false' at most once per scoreSD() invocation when qc=false detected",
    impact: "Operator gains greppable visibility into low-quality rows entering scoring; suppresses log noise via per-invocation dedup."
  },
  {
    change: "Extend tests/unit/eva/vision-scorer.test.js with three cases pinning projection columns + warning behavior + suppression on qc=true",
    impact: "Regression-proof against future SELECT-projection drift; pins the read-only contract."
  },
  {
    change: "Document Option B (trigger reconciliation) and Option C (drop one trigger) as deferred follow-up SD-seeds in SD scope notes",
    impact: "Out-of-scope decision is durable across sessions; future SDs can be seeded from this LEAD analysis without re-litigating Q4."
  }
];

const SUCCESS_METRICS = [
  {
    metric: "vision-scorer SELECT projection includes quality_checked and quality_issues",
    target: "Both columns present in scoreSD() vision and arch dimension queries (verified by test assertion)"
  },
  {
    metric: "Informational warning emitted exactly once per scoreSD() call when qc=false rows observed",
    target: "[VisionScorer][QC-WARN] log line per scoreSD() invocation, suppressed on qc=true"
  },
  {
    metric: "Zero regressions in existing vision-scorer test suite",
    target: "All 7 existing tests/unit/eva/vision-scorer.test.js cases pass"
  },
  {
    metric: "Source LOC under Tier-2 infrastructure max",
    target: "<= 150 LOC total (source + tests), <= 30 LOC source-only"
  },
  {
    metric: "Zero database migrations in PR diff",
    target: "git diff --name-only origin/main...HEAD shows no files under database/migrations/"
  }
];

const RUN_ID = `LEAD-NARROW-SD-FDBK-EVA-VISION-001-${Date.now()}`;

async function main() {
  const { data: before, error: e1 } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, current_phase, sd_type, scope, key_changes, success_metrics')
    .eq('sd_key', SD_KEY)
    .single();
  if (e1 || !before) {
    console.error('SD not found:', e1?.message);
    process.exit(2);
  }
  if (before.current_phase !== 'LEAD' || before.status !== 'draft') {
    console.error(`SD not in LEAD/draft state (phase=${before.current_phase}, status=${before.status}) — refusing to update.`);
    process.exit(3);
  }

  const { data: after, error: e2 } = await supabase
    .from('strategic_directives_v2')
    .update({
      scope: SCOPE,
      key_changes: KEY_CHANGES,
      success_metrics: SUCCESS_METRICS,
      updated_at: new Date().toISOString()
    })
    .eq('sd_key', SD_KEY)
    .eq('status', 'draft')
    .eq('current_phase', 'LEAD')
    .select('sd_key, scope, key_changes, success_metrics')
    .single();
  if (e2 || !after) {
    console.error('Update failed:', e2?.message);
    process.exit(4);
  }

  console.log('SD updated successfully:');
  console.log('  scope length:', after.scope?.length || 0, 'chars');
  console.log('  key_changes:', after.key_changes?.length || 0, 'items');
  console.log('  success_metrics:', after.success_metrics?.length || 0, 'items');
  console.log('  run_id:', RUN_ID);
}

main().catch(err => { console.error('FATAL', err); process.exit(99); });
