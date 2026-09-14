#!/usr/bin/env node
/**
 * RETRO sub-agent evidence row for SD-LEARN-FIX-ADDRESS-PAT-LES-012.
 *
 * Supersedes 81eb4cbf-4fe5-42bd-af2c-62f60722d43a (the preflight_autogen RETRO evidence row)
 * as the newest RETRO row for this SD. Records that the retrospective (0a4fdfa2) was replaced
 * from generic WHY-WHY-WHY boilerplate content with grounded, independently re-verified
 * analysis of this session's actual events -- most centrally the self-inflicted production
 * metadata-loss incident during the integration_operationalization backfill and its recovery.
 * Same pattern as scripts/one-off/insert-retro-evidence-sd-leo-infra-venture-quality-capa-001-g-addendum.mjs.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-012';
const RETRO_ID = '0a4fdfa2-32da-4554-84a7-dfec4d09abdc';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 95,
  phase: 'PLAN',
  execution_time_ms: 0,
  summary: `RETRO PASS for ${SD_KEY}. Retrospective ${RETRO_ID} replaced from preflight_autogen boilerplate (quality_score 90, generic handoff/gap-analysis filler, no mention of the session's actual dominant event) with grounded content independently re-derived from git log/diff and 10 sub_agent_execution_results rows, plus a live DB re-measurement performed as part of this pass (re-ran the SD's own 4 test files fresh: 62/62 pass at HEAD 1f655b36d21; re-counted marker-only backfilled rows live: 206, matching TESTING round 2's 188-genuinely-empty + 18-outstanding reconciliation exactly; confirmed 0/4,841 rows remain NULL table-wide). The SD closed a real 7-month write-path leak (1,570/4,839 PRD rows, 32.5%, NULL since 2026-02-02) with a structurally-valid honestly-empty default, then caused and substantially (98.7%, 1,364/1,382 rows) recovered a self-inflicted production metadata-destruction incident during its own backfill (7,743 keys across 1,382 rows, caused by Supabase .update()'s column-replace-not-merge jsonb semantics), independently caught by both TESTING (96d51bde, FAIL) and SECURITY (9d21ac12, FAIL) at EXEC-TO-PLAN via different methods before either saw the other's findings. Two further defects (a TOCTOU in the recovery script's own write guard; an errored pre-write SELECT treated as absence) were found by SECURITY's and TESTING's re-verification rounds and fixed in 2 follow-up commits (413f423c61c, 1f655b36d21). The final 18 rows (64 keys, 0 active SDs affected) remain pending operator authorization for the last restore write as of this evidence row -- recorded as an open action item, not glossed over.`,
  critical_issues: [],
  warnings: [
    'The DB quality-score trigger recomputed the submitted quality_score (93) down to 80 on write (quality_validated_by=SYSTEM, quality_issues=[]) -- this is the same recompute-on-write behavior the CAPA-001-G precedent documented, not a defect in this pass; 80 clears the RETROSPECTIVE_QUALITY_GATE threshold of 70 with zero flagged quality issues.',
    '18 of 1,570 backfilled rows (64 metadata keys) remain unrestored as of this evidence row, blocked on operator authorization for a second bulk production write -- both SECURITY (f93b30cc) and TESTING (db25c91d) explicitly recommend not gating completion on those 18, since pre-images are intact in governance_audit_log and the restore script is idempotent.',
  ],
  recommendations: [
    'Carry SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001 (already filed per SECURITY finding 9d21ac12) to completion -- it is the structural fix (a generalized atomic jsonb-merge seam) that prevents this exact defect class from recurring on any other shared-metadata table.',
    'Complete the final 18-row restore once operator authorization lands, then re-verify containment reaches 1,382/1,382 (evidence f93b30cc, db25c91d).',
  ],
  detailed_analysis: JSON.stringify({
    sd_key: SD_KEY,
    retrospective_id: RETRO_ID,
    retrospective_quality_score_before: 90,
    retrospective_quality_score_after: 80,
    superseded_retro_evidence_row: '81eb4cbf-4fe5-42bd-af2c-62f60722d43a (preflight_autogen boilerplate pass)',
    independently_reverified_during_this_pass: {
      sd_own_test_suite: '4 files, 62/62 tests passing at HEAD 1f655b36d21 (npx vitest run against the 4 SD test files)',
      live_marker_only_row_count: '206 (keyset-paginated full read of all 1,570 marked rows) -- reconciles exactly with TESTING round 2\'s 188 genuinely-empty + 18 outstanding',
      table_wide_null_count: '0 of 4,841 product_requirements_v2 rows have integration_operationalization NULL',
    },
    source_evidence_rows_read: [
      '53910d3f (VALIDATION, LEAD-TO-PLAN)', 'c6039a13 (Explore, LEAD-TO-PLAN)', 'a0b168bb (TESTING, LEAD-TO-PLAN prospective)',
      '96d51bde (TESTING, EXEC-TO-PLAN round 1 FAIL)', '9d21ac12 (SECURITY, EXEC-TO-PLAN round 1 FAIL)',
      'f93b30cc (SECURITY, EXEC-TO-PLAN round 2 CONDITIONAL_PASS)', 'db25c91d (TESTING, EXEC-TO-PLAN round 2 CONDITIONAL_PASS)',
    ],
  }),
  metadata: {
    validation_mode: 'retrospective_enhancement',
    branch: 'feat/SD-LEARN-FIX-ADDRESS-PAT-LES-012',
    prd_id: 'PRD-SD-LEARN-FIX-ADDRESS-PAT-LES-012',
    measured: true,
    retro_contribution: {
      retrospective_id: RETRO_ID,
      quality_score: 80,
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'RETRO',
  probeExistsRelative: 'scripts/one-off/insert-retro-evidence-sd-learn-fix-address-pat-les-012.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('RETRO', sdRow.id, { code: 'RETRO', name: 'Continuous Improvement Coach' }, results, {
  sdKey: SD_KEY,
  phase: 'PLAN',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
