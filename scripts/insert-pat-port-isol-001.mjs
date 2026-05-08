#!/usr/bin/env node
/**
 * scripts/insert-pat-port-isol-001.mjs
 *
 * Persists the canonical issue_patterns row for PAT-PORT-ISOL-001 — Tier-3
 * portfolio-isolation security invariant declared by security-agent during
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B PLAN review (2026-05-05). Was
 * declared but never persisted; SD-LEO-INFRA-AUDIT-SHARED-TABLES-001 (this SD)
 * lands the row.
 *
 * SD-LEO-INFRA-AUDIT-SHARED-TABLES-001 (FR-2)
 *
 * Mirrors scripts/insert-stage17-issue-pattern.mjs:
 *   - Idempotent upsert on (pattern_id)
 *   - Resolves SD text keys -> UUIDs for first_seen_sd_id / last_seen_sd_id FK
 *   - Preserves 9-item prevention_checklist verbatim from MEMORY.md
 *
 * Run:
 *   node scripts/insert-pat-port-isol-001.mjs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

export const PATTERN_ID = 'PAT-PORT-ISOL-001'; // 16 chars (issue_patterns.pattern_id is VARCHAR(20))
export const DEDUP_FINGERPRINT = 'portfolio-isolation-tier3-2026-05-05';

// FK targets — resolved at runtime to UUIDs.
export const FIRST_SEEN_SD_KEY = 'SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B';
export const LAST_SEEN_SD_KEY = 'SD-LEO-INFRA-AUDIT-SHARED-TABLES-001';

export const ROW = {
  pattern_id: PATTERN_ID,
  category: 'security',
  severity: 'high',
  issue_summary:
    'Tier-3 portfolio-isolation invariant: unrelated portfolio ventures sharing the EHG host repo creates blast-radius for vulnerabilities, IP-boundary erosion, dependency-confusion, host-credential leakage, and audit-lineage breaks. Confused-deputy / fail-open routing defect class.',
  occurrence_count: 1,
  first_seen_sd_id: '<resolved-at-runtime>',
  last_seen_sd_id: '<resolved-at-runtime>',
  prevention_checklist: [
    'Verify ventures.repo_url IS NOT NULL before Stage 19 advance',
    'Verify resolver returns non-null entry OR throws (not silent fallback)',
    'Verify exit-gate-enforcer wired into advance_venture_stage RPC gateway',
    'Verify lookup applies NFKD + combining-mark + lowercase + alphanumeric normalization',
    'Verify sd-router throw distinguishes registry-miss (permanent) from registry-query-error (transient) per C-SEC-4',
    'Verify intake validator (PA-4) composes with — does NOT replace — existing target-application-crosscheck.js',
    'Verify capability suppression emits warning to feedback when target_application != venture name',
    'Verify weekly drift sentinel returns 0 unmatched SDs',
    'Verify legitimate target_application=EHG SDs (venture_id IS NULL with allowlisted sd_type or metadata.engineering_only=true) flow unchanged',
  ],
  proven_solutions: [
    {
      title: 'Fail-closed venture routing taxonomy split',
      pr: 'rickfelix/EHG_Engineer SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B',
      description:
        'PA-1 split error taxonomy (NotRegistered permanent vs Unavailable transient); PA-4 intake validator composition; PA-5 capability suppression warning; PA-6 weekly drift sentinel; PA-7 PAT-PORT-ISOL-001.',
    },
    {
      title: 'Cross-venture revert + dual-table audit',
      pr: 'rickfelix/EHG_Engineer SD-LEO-FIX-REVERT-CROSS-VENTURE-001 (PR rickfelix/ehg#570)',
      description:
        '53 files reverted, 2 tables dropped, 10 leaves cancelled, venture killed. Established kill-not-delete state for PrivacyPatrol.',
    },
    {
      title: 'Shared-tables row-level audit',
      pr: 'rickfelix/EHG_Engineer SD-LEO-INFRA-AUDIT-SHARED-TABLES-001',
      description:
        'Two-pass audit (FK-authoritative + text/jsonb opportunistic) across 6 shared tables; persists this PAT row; centralizes killed-initiative constants in scripts/lib/killed-initiatives.js.',
    },
  ],
  related_sub_agents: ['SECURITY', 'VALIDATION', 'DATABASE'],
  trend: 'stable',
  status: 'active', // Active prevention checklist; mark resolved only when sentinel runs green for 4 weeks
  resolution_date: null,
  resolution_notes: null,
  source: 'manual',
  source_feedback_ids: [],
  metadata: {
    sd_origin: 'SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B',
    declared_by: 'SECURITY sub-agent',
    declared_review_id: '93ba24db-e1a2-4bc7-b395-cdac3f15f879',
    persisted_by: 'SD-LEO-INFRA-AUDIT-SHARED-TABLES-001',
    persisted_at: new Date().toISOString(),
    fingerprint: DEDUP_FINGERPRINT,
    tier: 3,
    classification: 'security_invariant',
    auto_captured: false,
    blast_radius_observed: '70-SD (2026-05-05 portfolio-isolation campaign)',
  },
  dedup_fingerprint: DEDUP_FINGERPRINT,
  auto_block_on_match: false,
};

export async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Resolve text keys -> UUIDs for FK columns.
  const { data: sdRows, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .in('sd_key', [FIRST_SEEN_SD_KEY, LAST_SEEN_SD_KEY]);

  if (sdErr || !sdRows || sdRows.length !== 2) {
    console.error('insert-pat-port-isol-001: source SD UUID lookup FAILED');
    console.error('  expected 2 rows, got:', sdRows?.length, sdErr?.message);
    return 1;
  }
  ROW.first_seen_sd_id = sdRows.find((s) => s.sd_key === FIRST_SEEN_SD_KEY).id;
  ROW.last_seen_sd_id = sdRows.find((s) => s.sd_key === LAST_SEEN_SD_KEY).id;

  const { data, error } = await supabase
    .from('issue_patterns')
    .upsert([ROW], { onConflict: 'pattern_id', ignoreDuplicates: false })
    .select('id, pattern_id, issue_summary, occurrence_count, status');

  if (error) {
    console.error('insert-pat-port-isol-001: FAILED');
    console.error('  code:', error.code);
    console.error('  message:', error.message);
    console.error('  details:', error.details);
    return 1;
  }

  console.log(`insert-pat-port-isol-001: OK — ${data.length} row(s) upserted`);
  console.log(JSON.stringify(data, null, 2));

  // Verification: re-fetch and assert prevention_checklist length
  const { data: verify, error: vErr } = await supabase
    .from('issue_patterns')
    .select('pattern_id, category, severity, prevention_checklist')
    .eq('pattern_id', PATTERN_ID)
    .single();
  if (vErr || !verify) {
    console.error('insert-pat-port-isol-001: post-insert VERIFY failed:', vErr?.message);
    return 1;
  }
  console.log(
    `insert-pat-port-isol-001: VERIFY pattern_id=${verify.pattern_id} category=${verify.category} severity=${verify.severity} prevention_checklist.length=${verify.prevention_checklist.length}`
  );
  if (verify.prevention_checklist.length !== 9) {
    console.error(
      'insert-pat-port-isol-001: FAIL — expected 9 checklist items, got',
      verify.prevention_checklist.length
    );
    return 1;
  }
  console.log('insert-pat-port-isol-001: PASS');
  return 0;
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('insert-pat-port-isol-001: FATAL:', err.message);
      process.exit(1);
    });
}
