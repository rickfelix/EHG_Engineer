#!/usr/bin/env node
// One-off LEAD-phase enrichment for SD-LEO-REFAC-GATE-DECISION-CREATION-001.
// Replaces leo-create-sd.js's generic boilerplate with plan-specific content.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-REFAC-GATE-DECISION-CREATION-001';

const update = {
  intensity_level: 'structural',
  scope_reduction_percentage: 30,
  rationale:
    'Worker silently skips chairman_decisions row creation for S16 (gate_type=promotion in stage_config) and may emit spurious rows for S20 (gate_type=none). 6th writer-consumer asymmetry witness in 24h. Empirical incident: NameSignal venture stuck at S16 on 2026-05-12 until manual band-aid INSERT. Architectural seam: hand-maintained DECISION_CREATING_STAGES Set mirrors stage_config and drifts. Derive from stage_config SoT; mirror the pentalogy fix pattern.',
  scope:
    'IN SCOPE: ' +
    '(1) Replace DECISION_CREATING_STAGES Set in lib/eva/chairman-decision-watcher.js with runtime-resolved lookup derived from stage_config.gate_type/review_mode (FR-1). ' +
    '(2) Swap createOrReusePendingDecision call site at chairman-decision-watcher.js:188 to use new lookup; preserve [Decision] log line (FR-2). ' +
    '(3) Backfill missing chairman_decisions rows for gate-stage ventures not in terminal state (FR-3, dry-run + chairman approval). ' +
    '(4) Audit other hand-maintained stage-classifier sets/arrays across lib/eva, lib/governance, scripts, src (FR-4). ' +
    '(5) Tests: 26 unit (one per stage) + 1 regression (S16 advance creates decision row) + 4 audit + 1 Playwright e2e (FR-5). ' +
    'OUT OF SCOPE: removing chairman-decision-watcher.js module; refactoring S20 entry handling separately; chairman_decisions schema changes; modifying stage_config rows.',
  key_changes: [
    {
      change:
        'FR-1: Replace DECISION_CREATING_STAGES Set with runtime stage_config-derived lookup (prefer SECURITY DEFINER RPC stage_creates_decision; fallback inline-query with 60s TTL cache mirroring stage-governance.js)',
      type: 'refactor'
    },
    {
      change:
        'FR-2: Worker createOrReusePendingDecision swaps Set.has(stageNumber) to new lookup at chairman-decision-watcher.js:188',
      type: 'fix'
    },
    {
      change:
        'FR-3: Backfill chairman_decisions rows for ventures currently on gate stages with no decision row (dry-run + review gate)',
      type: 'data'
    },
    {
      change:
        'FR-4: Audit and document any other hand-maintained stage-classifier sets/arrays in lib/eva, lib/governance, scripts, src',
      type: 'audit'
    },
    {
      change:
        'FR-5: 26 unit + 1 regression (S16) + 4 audit + 1 Playwright e2e (decision row created within 60s of advance to gate stage)',
      type: 'test'
    }
  ],
  key_principles: [
    'stage_config is the single source of truth for gate classification; no hand-maintained mirrors',
    'Preserve existing observability log line "[Decision] Skipping decision creation for non-gate stage N"',
    'Backfill is reversible and gated on dry-run review',
    'Backward compatible: existing chairman_decisions rows untouched; only future creates affected'
  ],
  strategic_objectives: [
    'Close 6th writer-consumer asymmetry seam in 24h (pentalogy completion + 1) by unifying chairman-decision-watcher with stage_config SoT',
    'Unblock NameSignal-class ventures stuck at S16 promotion stage without requiring manual chairman INSERT band-aids',
    'Surface (FR-4) any remaining hand-maintained stage-classifier mirrors as a campaign-sweep audit, preventing future asymmetry recurrence'
  ],
  risks: [
    {
      risk: 'Backfill creates phantom pending decisions for ventures already completed or off-gate',
      impact: 'medium',
      likelihood: 'low',
      mitigation:
        'FR-3 filters by venture.status != completed AND current_lifecycle_stage IS a gate; dry-run output + chairman review BEFORE apply'
    },
    {
      risk: 'FR-4 audit surfaces more drift than expected, bloating SD scope',
      impact: 'low',
      likelihood: 'medium',
      mitigation:
        'If N>2 additional hand-maintained sets surface, scope FR-4 to follow-up SD and document as "deferred-for-sweep"'
    },
    {
      risk: 'Cache invalidation lag for FR-1(a) inline-query path (60s TTL means stage_config UPDATE takes up to 60s to propagate)',
      impact: 'low',
      likelihood: 'low',
      mitigation:
        'chairman_dashboard_config is rarely modified; if concerning, prefer FR-1(b) RPC path which has no caching'
    },
    {
      risk: 'New RPC stage_creates_decision conflicts with existing RPC namespace or SECURITY DEFINER role grants',
      impact: 'medium',
      likelihood: 'low',
      mitigation:
        'PLAN phase verifies via DATABASE sub-agent; reuse can_auto_advance RPC pattern from SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 (template)'
    }
  ],
  success_criteria: [
    {
      criterion: 'NameSignal-class venture advances past S16 without manual band-aid INSERT in follow-up cascade test',
      measure: 'On a fresh fixture venture, advance to S16 → chairman_decisions row exists within 60s; no [Decision] Skipping log line for S16'
    },
    {
      criterion: 'Worker decision-creation path derives from stage_config SoT (no hand-maintained Set lookups)',
      measure: 'grep DECISION_CREATING_STAGES across lib/eva → 0 occurrences post-fix'
    },
    {
      criterion: 'FR-3 backfill identifies and unblocks any other silently-stuck ventures',
      measure: 'Backfill dry-run output committed to PR description; chairman approval recorded before apply'
    },
    {
      criterion: 'FR-4 audit produces a no-other-drift certification OR a documented follow-up SD',
      measure: 'audit script output (JSON or markdown) attached to PR; if drift found, follow-up SD key referenced'
    },
    {
      criterion: '≥32 tests passing (26 unit + 1 regression + 4 audit + 1 e2e)',
      measure: 'CI gate green; vitest + Playwright reports show all 32 PASS'
    },
    {
      criterion: 'Sub-agent confidence ≥85% on DATABASE + REGRESSION + TESTING',
      measure: 'sub_agent_execution_results rows for SD show DATABASE/REGRESSION/TESTING all ≥0.85'
    }
  ],
  success_metrics: [
    {
      metric: 'Hand-maintained stage-classifier sets remaining in lib/eva',
      target: '0 (down from 1)',
      actual: 'TBD'
    },
    {
      metric: 'NameSignal-class S16-stuck incidents post-ship',
      target: '0 in 14d',
      actual: 'TBD'
    },
    {
      metric: 'Tests passing (unit + regression + audit + e2e)',
      target: '≥32',
      actual: 'TBD'
    },
    {
      metric: 'Sub-agent confidence on DATABASE + REGRESSION + TESTING',
      target: '≥85%',
      actual: 'TBD'
    }
  ],
  smoke_test_steps: [
    {
      step_number: 1,
      instruction:
        'Verify production state on origin/main: `grep -n DECISION_CREATING_STAGES lib/eva/chairman-decision-watcher.js` → 0 matches expected post-ship',
      expected_outcome: 'No hand-maintained Set references in worker'
    },
    {
      step_number: 2,
      instruction:
        'Trigger fixture venture advance to a gate stage (e.g., S16 via cascade) and observe worker logs for ~60s',
      expected_outcome: 'No "[Decision] Skipping decision creation for non-gate stage 16" log line; chairman_decisions row inserted with stage_number=16'
    },
    {
      step_number: 3,
      instruction:
        'Query: SELECT 1 FROM chairman_decisions WHERE venture_id = <fixture> AND stage_number = 16 AND status = pending',
      expected_outcome: 'Exactly 1 row returned within 60s of advance event'
    }
  ]
};

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update(update)
  .eq('sd_key', SD_KEY)
  .select('sd_key,intensity_level,scope_reduction_percentage')
  .single();

if (error) {
  console.error('Update failed:', error);
  process.exit(1);
}
console.log('Enriched:', JSON.stringify(data, null, 2));
console.log(`Updated ${Object.keys(update).length} fields on ${SD_KEY}`);
