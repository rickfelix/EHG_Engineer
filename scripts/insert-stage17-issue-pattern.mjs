#!/usr/bin/env node
/**
 * insert-stage17-issue-pattern.mjs
 *
 * Inserts the canonical issue_patterns row for the Stage 17 backend-frontend
 * desync class. Idempotent on (pattern_id, dedup_fingerprint).
 *
 * SD-LEO-INFRA-STAGE17-CROSS-REPO-001 — Arm D
 *
 * Fingerprint matches:
 *   - Stale `/api/stitch/*` URL strings in EHG/src
 *   - Frontend `.maybeSingle()` queries on multi-row artifact tables without
 *     the `metadata.screenId` discriminator (caused QF-20260425-423)
 *   - Hardcoded variant counts (e.g. 6) that don't match backend output (4)
 *   - Missing per-variant action buttons silently dropped during refactors
 *
 * Run:
 *   node scripts/insert-stage17-issue-pattern.mjs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const PATTERN_ID = 'PAT-S17X-CROSS-REPO-DRIFT';
const DEDUP_FINGERPRINT = 'stage17-cross-repo-drift-2026-04-26';

// FK to strategic_directives_v2.id (UUID) — same redirect pattern as
// sd_backlog_map.sd_id. Resolve text keys to UUIDs at runtime.
const FIRST_SEEN_SD_KEY = 'SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001';
const LAST_SEEN_SD_KEY = 'SD-MAN-REFAC-S17-SIMPLIFY-FRONTEND-001';

const ROW = {
  pattern_id: PATTERN_ID,
  category: 'integration',
  severity: 'high',
  issue_summary: 'Stage 17 frontend not co-updated with backend refactor',
  occurrence_count: 3,
  first_seen_sd_id: '<resolved-at-runtime>',
  last_seen_sd_id: '<resolved-at-runtime>',
  prevention_checklist: [
    'Verify all /api/stage17/* URL strings in EHG/src match a registered route in EHG_Engineer/server/routes/stage17.js (run npm run audit:stage17)',
    'Run JSON-schema match against current lib/eva/stage-17/archetype-generator.js write contract (s17_archetypes per-screen shape, NOT multi-screen object)',
    'Confirm GUI variant card UI has not silently dropped per-variant action buttons (Copy Prompt, Download HTML, etc.) during the refactor',
    'Search for hardcoded numeric counts (e.g. EXPECTED_VARIANTS_PER_SCREEN) that should reference backend constants — backend currently ships exactly 4 variants per screen, not 6'
  ],
  proven_solutions: [
    {
      title: 'Add cross-repo URL audit',
      pr: 'rickfelix/EHG_Engineer SD-LEO-INFRA-STAGE17-CROSS-REPO-001',
      description: 'Ship scripts/audit-stage17-urls.mjs + .github/workflows/stage17-contract-smoke.yml so backend route changes are validated against frontend URL strings at PR time'
    },
    {
      title: 'Use metadata.screenId discriminator on multi-row artifact reads',
      pr: 'rickfelix/ehg#525',
      description: 'Replace .maybeSingle() multi-screen object lookup with .contains(metadata, {screenId}) per-screen filter — see Stage17ReviewPanel.tsx:84-121'
    },
    {
      title: 'Define EXPECTED_VARIANTS_PER_SCREEN as a single constant',
      pr: 'rickfelix/ehg#526',
      description: 'Centralize variant count in one place; reference backend contract doc rather than hardcoding 6'
    }
  ],
  related_sub_agents: ['DESIGN', 'TESTING'],
  trend: 'stable',
  status: 'resolved',
  resolution_date: new Date().toISOString(),
  resolution_notes: 'Drift-detection infrastructure shipped via SD-LEO-INFRA-STAGE17-CROSS-REPO-001 (Arms A-F). Future occurrences should be caught at PR time by stage17-contract-smoke.yml workflow.',
  source: 'manual',
  source_feedback_ids: [],
  metadata: {
    sd_origin: 'SD-LEO-INFRA-STAGE17-CROSS-REPO-001',
    captured_qfs: ['QF-20260425-423', 'QF-20260425-130', 'QF-20260425-422'],
    captured_prs: ['rickfelix/ehg#525', 'rickfelix/ehg#526', 'rickfelix/ehg#527'],
    fingerprint_regex_examples: [
      String.raw`/\/api\/stitch\//`,
      String.raw`/\.maybeSingle\(\)/`,
      String.raw`/EXPECTED_VARIANTS_PER_SCREEN\s*=\s*\d+/`
    ],
    related_contract_doc: 'docs/architecture/stage17-contracts.md',
    related_audit_script: 'scripts/audit-stage17-urls.mjs',
    fingerprint: DEDUP_FINGERPRINT,
    auto_captured: false,
    classification: 'cross_repo_drift'
  },
  dedup_fingerprint: DEDUP_FINGERPRINT,
  auto_block_on_match: false
};

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Resolve text keys → UUIDs for the FK columns
const { data: sdRows, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .in('sd_key', [FIRST_SEEN_SD_KEY, LAST_SEEN_SD_KEY]);

if (sdErr || !sdRows || sdRows.length !== 2) {
  console.error('insert-stage17-issue-pattern: source SD UUID lookup FAILED');
  console.error('  expected 2 rows, got:', sdRows?.length, sdErr?.message);
  process.exit(1);
}
ROW.first_seen_sd_id = sdRows.find((s) => s.sd_key === FIRST_SEEN_SD_KEY).id;
ROW.last_seen_sd_id = sdRows.find((s) => s.sd_key === LAST_SEEN_SD_KEY).id;

const { data, error } = await supabase
  .from('issue_patterns')
  .upsert([ROW], { onConflict: 'pattern_id', ignoreDuplicates: false })
  .select('id, pattern_id, issue_summary, occurrence_count, status');

if (error) {
  console.error('insert-stage17-issue-pattern: FAILED');
  console.error('  code:', error.code);
  console.error('  message:', error.message);
  console.error('  details:', error.details);
  process.exit(1);
}

console.log(`insert-stage17-issue-pattern: OK — ${data.length} row(s) upserted`);
console.log(JSON.stringify(data, null, 2));
