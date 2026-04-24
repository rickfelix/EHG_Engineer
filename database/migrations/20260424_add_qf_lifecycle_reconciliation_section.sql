-- Migration: Add QF Lifecycle Reconciliation section to CLAUDE_CORE.md
-- Purpose: FR5 of SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001 — documents
-- the two-layer reconciliation approach (pre-merge filter + post-merge sweep)
-- so future sessions understand why quick_fixes rows can't go stale after
-- a direct `gh pr merge` bypass.
-- Created: 2026-04-24
-- Applied to active protocol: leo-v4-3-3-ui-parity

INSERT INTO leo_protocol_sections (
  protocol_id,
  section_type,
  title,
  content,
  order_index,
  metadata,
  context_tier,
  target_file
) VALUES (
  'leo-v4-3-3-ui-parity',
  'qf_lifecycle_reconciliation',
  'QF Lifecycle Reconciliation',
  E'## QF Lifecycle Reconciliation\n\n**Problem**: quick_fixes rows stay ``status=open`` after a PR is merged via direct ``gh pr merge`` (any path that skips complete-quick-fix.js). sd:next then recommends phantom work. Root cause documented in feedback memory ``feedback_qf_db_stale_after_merge.md``.\n\n**Solution**: Two complementary reconciliation layers — pre-merge filter + post-merge sweep. Both are idempotent and safe to run on any schedule.\n\n### Layer 1 — Pre-Merge Filter (sd:next data loader)\n``scripts/modules/sd-next/data-loaders.js`` exposes two functions:\n- ``loadOpenQuickFixes()`` — returns rows where ``pr_url IS NULL`` AND ``commit_sha IS NULL``. Filters out QFs with in-flight PRs so sd:next does not restart work a parallel session is already merging (QF-380 merge-race fix).\n- ``loadReadyToMergeQuickFixes()`` — queries the inverse pool (``pr_url IS NOT NULL``), cross-checks each PR state via ``gh api`` with a 60-second in-memory cache, returns only OPEN + all-checks-green rows tagged ``ready_to_merge=true``. Lets the sd:next dispatcher emit a ``qf_merge`` action for adoption-ready work instead of ``qf_start``.\n\n> Why the cache: sd:next runs many times per session. Without the 60s dedup, each invocation hits the GitHub API for every open QF — rate limits bite within minutes.\n\n### Layer 2 — Post-Merge Sweep (orphan-qf-reaper)\n``scripts/orphan-qf-reaper.mjs`` sweeps rows where ``status IN (open, in_progress)`` AND ``pr_url`` points to a MERGED PR, and flips them to ``status=completed``. Protections:\n- **Idempotency**: ``.eq(status, current)`` guard on the update — a concurrent complete-quick-fix.js flip wins without erroring.\n- **5-minute safety window**: skips rows whose ``pr_url`` was set within the last 5 minutes, giving complete-quick-fix.js time to finish its own flip.\n- **Structured JSON logging**: one line per row evaluated, durable artifact for debugging races.\n\n### Scheduled Execution\n``.github/workflows/orphan-qf-reaper.yml`` runs Layer 2 every 15 minutes on cron plus ``workflow_dispatch``, with a ``dry-run`` input, a concurrency group to prevent overlap, and a per-run ``reaper.log`` artifact.\n\n### When to Reach For This\n- **``sd:next`` recommends a QF you know was merged**: check ``loadOpenQuickFixes`` is filtering on ``pr_url IS NULL``; inspect that QF''s ``pr_url`` / ``commit_sha`` columns. If they''re set, the reaper will close it on its next cron; for immediate cleanup, run ``node scripts/orphan-qf-reaper.mjs``.\n- **Two sessions on the same QF**: verify ``loadReadyToMergeQuickFixes`` is wired into the dispatcher and emitting ``qf_merge`` for rows with open PRs.\n- **QF with open PR but sd:next ignores it**: the PR''s checks are not all green — expected. Layer 1 only surfaces merge-ready work.\n\n### Anti-Pattern\nDo **not** replace these layers with a blanket "close all QFs with any pr_url set". The 5-minute window and merged-state check prevent closing a QF whose PR is still under review.\n\n> Background: This section is FR5 of SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001. Layer 1 first shipped as QF-20260423-380; Layer 2 + scheduled sweep ship with this SD.',
  7,
  '{"source":"SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001","fr":"FR5","related_files":["scripts/orphan-qf-reaper.mjs","scripts/modules/sd-next/data-loaders.js",".github/workflows/orphan-qf-reaper.yml"],"related_memories":["feedback_qf_db_stale_after_merge","feedback_orphan_qf_witnessed_live","project_qf_380_completed_via_adoption"]}'::jsonb,
  'CORE',
  'CLAUDE_CORE.md'
)
ON CONFLICT (protocol_id, section_type) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  order_index = EXCLUDED.order_index,
  metadata = EXCLUDED.metadata,
  context_tier = EXCLUDED.context_tier,
  target_file = EXCLUDED.target_file;
