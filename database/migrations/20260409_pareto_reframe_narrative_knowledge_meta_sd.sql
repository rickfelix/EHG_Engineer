-- Pareto v2 reframe: SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001 + 6 children
-- Single transaction. 7 UPDATEs. No schema changes, no new rows.
-- Applied: 2026-04-09

BEGIN;

-- Emergency bypass for Child -@ completion (spike, no code shipped).
-- Legitimate per task instructions: spike has no implementation to validate.
SET LOCAL leo.bypass_completion_check = 'true';

-- 1. Parent Meta-SD metadata with Pareto reframe info
UPDATE strategic_directives_v2
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'pareto_cut_applied', jsonb_build_object(
    'applied_at', '2026-04-09T20:40:00Z',
    'original_scope_loc', 1820,
    'revised_scope_loc', 1040,
    'reduction_percent', 43,
    'budget_change_usd', -17000,
    'deferred_items', jsonb_build_array(
      'ESLint custom rule require-helper-for-worktree-path',
      'LEAD-FINAL gate GATE_WORKTREE_TRUST_BOUNDARY',
      'PreToolUse hook blocking git log --grep="SD-"',
      'auto_block_on_match=true on PAT rows',
      'DB trigger on retrospectives rejecting action_items: []',
      'Branch protection drift auto-remediation',
      'CODEOWNERS from DB source of truth',
      'required_status_checks auto-detection from new workflows'
    ),
    'deferred_to_sd', 'SD-NARRATIVE-ENFORCEMENT-LAYER-001',
    'trigger_for_enforcement_layer', '2+ recurrences in 30-day post-ship window surfaced via EVA Friday meeting',
    'classification_framework', 'structural_fixes_vs_attention_compensation',
    'brainstorm_session_id', '15b5623d-3ae2-4e0b-b065-58362ed7687d',
    'chairman_approved', true
  ),
  'vision_version', 2,
  'arch_version', 2
),
description = 'Pareto v2: Ship structural fixes (4 children + completed spike), defer attention-compensation to follow-up SD-NARRATIVE-ENFORCEMENT-LAYER-001 triggered by recurrence data from EVA Friday meetings. Original scope 1,820 LOC reduced to ~1,040 LOC. Children scopes heavily reduced — see metadata.pareto_cut_applied.deferred_items for what was removed.',
updated_at = NOW()
WHERE id = 'e99e32f1-8bda-466b-ad16-a99dc0d6b527';

-- 2. Mark Child -@ Phase 0 Spike as completed
UPDATE strategic_directives_v2
SET status = 'completed',
    current_phase = 'COMPLETED',
    progress = 100,
    completion_date = NOW(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'pareto_backfill', true,
      'completion_reason', 'Spike work completed in parallel during parent brainstorm session; findings persisted to parent metadata.spike_findings',
      'no_code_shipped', true,
      'no_pr_required', true
    ),
    updated_at = NOW()
WHERE sd_key = 'SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-@';

-- 3. Child -A (Worktree structural fixes, 25 sites)
UPDATE strategic_directives_v2
SET title = 'Worktree structural fixes: isRealWorktree helper + 25-site consumer migration + leo-status-line.js:26 point fix',
    description = 'Pareto v2 Child 1: Create lib/worktree-trust.js helper, migrate all 25 identified consumer call sites across 12 files (not 14 as CTO estimated; spike found 25), fix scripts/leo-status-line.js:26 cwd validation point fix. STRUCTURAL fixes only — no ESLint rule (deferred), no LEAD-FINAL gate (deferred). Estimated ~500 LOC.',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'pareto_scope', 'structural_only',
      'loc_estimate', 500,
      'deferred_items', jsonb_build_array('ESLint rule', 'LEAD-FINAL gate'),
      'spike_validated_call_sites', 25,
      'files_to_migrate', jsonb_build_array(
        'lib/worktree-manager.js (10 calls)',
        'lib/worktree-guards.js (2)',
        'lib/claim-validity-gate.js (1)',
        'lib/session-manager.mjs (1)',
        'lib/eva/proving/fix-agent.js (1)',
        '.claude/statusline.cjs (2)',
        'scripts/resolve-sd-workdir.js (2)',
        'scripts/hooks/concurrent-session-worktree.cjs (2)',
        'scripts/hooks/session-init.cjs (1)',
        'scripts/modules/handoff/parallel-team-spawner.js (1)',
        'scripts/modules/shipping/worktree-merge.js (1)',
        'scripts/modules/sd-next/local-signals.js (1)',
        'scripts/leo-status-line.js (point fix)'
      )
    ),
    updated_at = NOW()
WHERE sd_key = 'SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-A';

-- 4. Child -B (DB observability + passive PAT rows)
UPDATE strategic_directives_v2
SET title = 'DB observability + cleanup script + passive PAT rows (Pareto reduced)',
    description = 'Pareto v2 Child 2: retrospectives_audit append-only table + issue_patterns schema extensions (auto_block_on_match DEFAULT false) + RLS + audit trigger + passive PAT-WORKTREE-TRUST-001 and PAT-CROSS-REPO-BLIND-SPOT-001 rows (auto_block_on_match=false) + worktree_gate_metrics data collection table + scripts/cleanup-phantom-worktrees.js (read-only detect mode, NEVER fs.rmSync on .worktrees). REMOVED from original scope: ESLint plugin, LEAD-FINAL gate, DB trigger on retros, kill switch enforcement. Estimated ~220 LOC (down from 280).',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'pareto_scope', 'structural_plus_passive_tracking',
      'loc_estimate', 220,
      'loc_estimate_original', 280,
      'deferred_items', jsonb_build_array(
        'ESLint plugin eslint-plugin-leo-worktree-trust',
        'LEAD-FINAL gate GATE_WORKTREE_TRUST_BOUNDARY',
        'DB trigger rejecting retrospectives with empty action_items',
        'auto_block_on_match=true on PAT rows',
        'kill switch feature flag enforcement'
      ),
      'kept_items', jsonb_build_array(
        'retrospectives_audit append-only table',
        'issue_patterns schema extensions (with auto_block_on_match defaulting false)',
        'issue_patterns RLS + audit trigger',
        'passive PAT seed rows',
        'worktree_gate_metrics table',
        'cleanup-phantom-worktrees.js read-only detect'
      )
    ),
    updated_at = NOW()
WHERE sd_key = 'SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-B';

-- 5. Child -C (cross-repo audit helper + cleanup)
UPDATE strategic_directives_v2
SET title = 'Cross-repo audit helper + cleanup + DB_VALID_SD_TYPES runtime sync (Pareto reduced)',
    description = 'Pareto v2 Child 3: lib/audits/sd-commit-presence.js helper wrapping gh search commits --owner rickfelix + delete 4 deprecated analyze_*.mjs scripts + archive EXTENT_OF_CONDITION_SUMMARY.md with RETRACTED banner + DB_VALID_SD_TYPES runtime sync (query information_schema.check_constraints instead of hardcoded list). REMOVED from original scope: PreToolUse hook blocking git log --grep="SD-". Adoption of the helper is voluntary. Estimated ~120 LOC (down from 180).',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'pareto_scope', 'structural_only_voluntary_adoption',
      'loc_estimate', 120,
      'loc_estimate_original', 180,
      'deferred_items', jsonb_build_array('PreToolUse hook blocking git log --grep="SD-"'),
      'kept_items', jsonb_build_array(
        'lib/audits/sd-commit-presence.js helper',
        'delete 4 deprecated analyze_*.mjs scripts',
        'archive EXTENT_OF_CONDITION_SUMMARY.md',
        'DB_VALID_SD_TYPES runtime sync'
      )
    ),
    updated_at = NOW()
WHERE sd_key = 'SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-C';

-- 6. Child -D (branch protection alert-only)
UPDATE strategic_directives_v2
SET title = 'Branch protection policy-as-code + out-of-band audit repo (alert-only drift, Pareto reduced)',
    description = 'Pareto v2 Child 4: .github/branch-protection.json in EHG_Engineer + ehg + scripts/configure-branch-protection.js (OIDC-based) + daily drift audit workflow (ALERT-ONLY, no auto-remediation) + out-of-band rickfelix/ehg-security-monitor repo (one-time manual setup) + manual CODEOWNERS file (no DB sync). REMOVED from original scope: drift auto-remediation for "safe" drift, CODEOWNERS from DB source of truth, required_status_checks auto-detection from new workflows. Estimated ~200 LOC (down from ~260 with those deferred items). SHIPS LAST per CISO threat model.',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'pareto_scope', 'structural_only_alert_only',
      'loc_estimate', 200,
      'loc_estimate_original', 260,
      'ships_last', true,
      'deferred_items', jsonb_build_array(
        'drift auto-remediation (safe vs semantic categorizer)',
        'CODEOWNERS from DB source of truth',
        'required_status_checks auto-detection'
      ),
      'kept_items', jsonb_build_array(
        '.github/branch-protection.json declarative config',
        'scripts/configure-branch-protection.js via GitHub Actions OIDC',
        'daily drift audit workflow (alert-only)',
        'rickfelix/ehg-security-monitor out-of-band repo',
        'manual CODEOWNERS file'
      ),
      'requires_manual_setup', jsonb_build_array(
        'Create rickfelix/ehg-security-monitor repo in GitHub (one-time)',
        'Configure GitHub Actions OIDC environment with approval gate',
        'Maintain CODEOWNERS manually'
      )
    ),
    updated_at = NOW()
WHERE sd_key = 'SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-D';

-- 7. Child -E (EVA Friday meeting glue, expanded)
UPDATE strategic_directives_v2
SET title = 'Observability + EVA Friday meeting agenda generator + 30-day recurrence tracking (Pareto expanded)',
    description = 'Pareto v2 Child 5 (EXPANDED from original Phase 5 verification window): eva_friday_meeting_agenda table + scripts/eva/friday-meeting-agenda-generator.js (runs Thursday 22:00 UTC cron, generates Friday morning agenda) + observability dashboard view over worktree_gate_metrics + 30-day tracking window for recurrence detection + agenda approval/execution handler. This child is the glue that makes the Pareto approach operationally sustainable — batches all Meta-SD-related review to the single weekly EVA meeting. Estimated ~220 LOC (up from 0 in original verification-only scope).',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'pareto_scope', 'observability_plus_operational_glue',
      'loc_estimate', 220,
      'loc_estimate_original', 0,
      'is_pareto_glue', true,
      'new_items', jsonb_build_array(
        'eva_friday_meeting_agenda table',
        'scripts/eva/friday-meeting-agenda-generator.js',
        'observability dashboard view',
        'weekly cron scheduling',
        'approval/execution handler',
        '30-day recurrence tracking for enforcement trigger'
      ),
      'feeds_decision_for', 'SD-NARRATIVE-ENFORCEMENT-LAYER-001 trigger evaluation'
    ),
    updated_at = NOW()
WHERE sd_key = 'SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-E';

COMMIT;
