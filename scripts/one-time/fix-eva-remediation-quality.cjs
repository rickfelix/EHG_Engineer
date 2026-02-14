/**
 * Fix quality issues in EVA Audit Remediation SDs
 * Issues found during deep quality review:
 * 1. CHAIRMAN-GATES: Wrong file paths
 * 2. INFRA-BUGS: Wrong finding IDs (HIGH → CRIT)
 * 3. KILL-GATES: Priority should be critical
 * 4. TEMPLATE-ALIGN: Missing Stage 6 and Stage 23-24 gaps
 * 5. ORCHESTRATOR: Inaccurate coverage claim
 * 6. UTILITY-DEDUP: Inconsistent finding ID
 * 7. DOSSIER: Inconsistent finding IDs
 * 8. DB-SCHEMA: Missing HIGH-002/003 findings
 *
 * Run: node scripts/one-time/fix-eva-remediation-quality.cjs
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const AUDIT_SOURCE = 'Source: docs/audits/eva-comprehensive/ (12 completed audit reports from SD-EVA-QA-AUDIT-ORCH-001)';

const fixes = [
  // FIX 1: CHAIRMAN-GATES — wrong file paths (lib/eva/stages/stage-X/ → lib/eva/stage-templates/stage-X.js)
  {
    sd_key: 'SD-EVA-FIX-CHAIRMAN-GATES-001',
    updates: {
      description: `Add blocking Chairman decisions at stages 10, 22, and 25 following the Stage 0 pattern.

Pattern to follow: lib/eva/stage-zero/ — createOrReusePendingDecision() + waitForDecision()
Files: lib/eva/stage-templates/stage-10.js, lib/eva/stage-templates/stage-22.js, lib/eva/stage-templates/stage-25.js

Findings addressed:
- Vision CRIT-001: 3 missing Chairman blocking points (stages 10, 22, 25)
- Theme 2: Chairman Governance

${AUDIT_SOURCE}`
    }
  },

  // FIX 2: INFRA-BUGS — wrong finding IDs (said HIGH-001/002/003, should be CRIT-001/002/003)
  {
    sd_key: 'SD-EVA-FIX-INFRA-BUGS-001',
    updates: {
      description: `CLI arg validation, wrong column ref (decision-submitted.js), string-based error matching.

Actions:
1. Fix retry logic dead code in event-router.js:215 to check error.retryable flag
2. Add CLI arg validation to eva-run.js (check next element exists, isn't a flag)
3. Fix stage → lifecycle_stage column reference in decision-submitted.js
4. Replace string-based error matching with error.code === '23505' in sd-completed.js

Files: lib/eva/event-bus/event-router.js, scripts/eva-run.js, lib/eva/event-bus/handlers/decision-submitted.js, lib/eva/event-bus/handlers/sd-completed.js

Findings addressed:
- Infrastructure CRIT-001: Retry logic dead code in event-router.js
- Infrastructure CRIT-002: CLI argument parsing lacks validation
- Infrastructure CRIT-003: Wrong column reference in decision-submitted.js
- Infrastructure HIGH-005: String-based error matching
- Theme 13: Infrastructure Bugs

${AUDIT_SOURCE}`
    }
  },

  // FIX 3: KILL-GATES — priority high → critical (addresses Engine CRITICAL-2)
  {
    sd_key: 'SD-EVA-FIX-KILL-GATES-001',
    updates: {
      priority: 'critical',
      description: `Stage 13 priority check, Stage 23 upstream prerequisite, risk threshold standardization (Vision v4.7: 7/9).

Actions:
1. Add 'now'-priority milestone check to Stage 13 kill gate
2. Add Stage 22 prerequisite check to Stage 23 kill gate
3. Standardize risk thresholds to Vision v4.7 values (7=caution, 9=chairman)

Files: Stage 13 kill gate, Stage 23 kill gate, Stage 6 template/analysis

Findings addressed:
- Engine CRITICAL-2: Risk threshold triple-inconsistency (values 1, 8, 10 vs spec 7, 9)
- Blueprint #8: Stage 13 kill gate missing 'now'-priority check
- Launch CC-3: Stage 23 kill gate missing Stage 22 prerequisite
- Theme 10: Kill Gate Logic
- Theme 20: Risk Threshold

${AUDIT_SOURCE}`
    }
  },

  // FIX 4: TEMPLATE-ALIGN — add Stage 6 and Stage 23-24 gaps
  {
    sd_key: 'SD-EVA-FIX-TEMPLATE-ALIGN-001',
    updates: {
      description: `Add missing fields/decision objects across Phases 3 (10 fields), 5 (13 fields), 6 (12+ fields); fix Stages 6-9, 14, 16 missing Architecture v2.0 fields.

Actions:
1. Phase 3 (Identity): Add 10 missing fields (narrativeExtension, namingStrategy, decision objects, etc.)
2. Phase 5 (Build Loop): Add 5 decision objects + 8 fields
3. Phase 6 (Launch): Add launchOutcome, ventureDecision, financialComparison objects; Stage 23 (launchType, successCriteria, rollbackTriggers); Stage 24 (AARRR trend fields)
4. Stage 6: Add aggregate risk metrics, risk_source enum alignment, 3-factor scoring fields (Engine HIGH-1/2/5)
5. Stages 7-9, 14, 16: Add Architecture v2.0 missing fields

Files: Stage templates for 6, 7, 8, 9, 10, 11, 12, 14, 16, 17, 19, 20, 21, 22, 23, 24, 25

Findings addressed:
- Template-Analysis divergence (systemic across all phases)
- Architecture v2.0 gaps (Engine HIGH-1/2/5 for Stage 6)
- Launch template gaps (Stage 23-24 missing fields)
- Theme 1: Template-Analysis Divergence
- Theme 12: Missing Arch v2.0 Fields

${AUDIT_SOURCE}`,
      scope: 'Add missing fields/decision objects across Phases 3, 5, 6; fix Stages 6-9, 14, 16 Architecture v2.0 fields; add Stage 23-24 Launch gaps'
    }
  },

  // FIX 5: ORCHESTRATOR — accurate coverage claim (drop "no findings unaddressed")
  {
    sd_key: 'SD-EVA-REMEDIATION-ORCH-001',
    updates: {
      description: `Orchestrator for remediating 157 findings (36 critical, 53 high, 48 medium, 20 low) identified by EVA Comprehensive Audit (SD-EVA-QA-AUDIT-ORCH-001).

Tier 1 (9 SDs, parallel): Chairman Gates, Stage 15 Risk, Error/Logging, Utility Dedup, DB Schema, Reality Gates, Infra Bugs, Kill Gates, Dossier Rebuild
Tier 2 (3 SDs, sequential): Template Alignment, Enum/Naming, Post-Launch/Tests

Dependency graph:
  Tier 1 (parallel): [1-CHAIRMAN] [2-STAGE15] [3-ERR/LOG] [4-UTILS] [5-DB] [6-GATES] [7-INFRA] [8-KILL] [9-DOSSIER]
  Tier 2 (after):     [10-TEMPLATES<-3,4]  [11-ENUMS<-4,5]  [12-POST-LAUNCH<-3,7]

Coverage: All 20 major audit themes assigned to child SDs. All CRITICAL and HIGH findings explicitly addressed. Some MEDIUM/LOW findings (DB Schema MED-001/002/003, Cross-Cutting MED-001/002/003, Infrastructure MED-001-004) are not explicitly scoped — these may be addressed incidentally during related work or deferred to follow-up SDs.

${AUDIT_SOURCE}`
    }
  },

  // FIX 6: UTILITY-DEDUP — consistent finding ID format
  {
    sd_key: 'SD-EVA-FIX-UTILITY-DEDUP-001',
    updates: {
      description: `Extract parseJSON (25 copies) and other shared utils to lib/eva/utils/.

Files: 25 stage analysis files in lib/eva/stage-templates/analysis-steps/
Actions: Extract parseJSON() to lib/eva/utils/parse-json.js, update 25 imports

Findings addressed:
- Cross-Cutting CRIT-001: 25 identical copies of parseJSON utility
- Theme 6: Utility Duplication

${AUDIT_SOURCE}`
    }
  },

  // FIX 7: DOSSIER — use actual finding IDs from dossier audit (CRITICAL-1/2/3 not CRIT-001/002/003)
  {
    sd_key: 'SD-EVA-FIX-DOSSIER-REBUILD-001',
    updates: {
      description: `Regenerate 20 missing dossiers, fix 4 stale stage names, archive 14 old-era files, fix README.

Actions:
1. Update README to correct status (5/25, not 100%)
2. Rename 4 dossiers to Vision v4.7 stage names
3. Archive 14 stale 40-stage era files
4. Generate 20 missing dossier structures
5. Align phase grouping to 6-phase model

Files: docs/guides/workflow/dossiers/

Findings addressed:
- Dossier CRITICAL-1: 20 missing dossier structures
- Dossier CRITICAL-2: 4 stale stage names
- Dossier CRITICAL-3: README claims 100% but only 5/25 exist
- Dossier HIGH-1/2: Phase grouping and archive issues
- Theme 14: Dossier System

${AUDIT_SOURCE}`
    }
  },

  // FIX 8: DB-SCHEMA — add missing HIGH-002/003 to scope
  {
    sd_key: 'SD-EVA-FIX-DB-SCHEMA-001',
    updates: {
      description: `Create 25 per-stage tables, 16 PostgreSQL ENUMs, tighten RLS policies, add gate constraints and data contracts.

Actions:
1. Create 25 per-stage tables (e.g., eva_stage_1_draft_ideas through eva_stage_25_optimization)
2. Create 16 PostgreSQL ENUM types (9 decision + 7 categorization)
3. Replace USING (TRUE) RLS with role-based policies
4. Add stage-specific gate constraint columns
5. Add cross-stage data contract tracking (artifact dependency validation)

Files: database/migrations/, RLS policies

Findings addressed:
- DB Schema CRIT-001: Missing per-stage tables (single JSONB column)
- DB Schema CRIT-002: Missing 16 PostgreSQL ENUM types
- DB Schema HIGH-001: USING (TRUE) RLS policies
- DB Schema HIGH-002: Missing stage-specific gate constraints
- DB Schema HIGH-003: Missing cross-stage data contracts
- Theme 3: Database Schema
- Theme 17: RLS Policies

${AUDIT_SOURCE}`,
      scope: 'Create 25 per-stage tables, 16 PostgreSQL ENUMs, tighten RLS policies, add gate constraints and data contracts'
    }
  }
];

async function main() {
  console.log('=== Fixing EVA Remediation SD Quality Issues ===\n');

  let ok = 0;
  let fail = 0;

  for (const fix of fixes) {
    const { data, error } = await db
      .from('strategic_directives_v2')
      .update(fix.updates)
      .eq('sd_key', fix.sd_key)
      .select('sd_key')
      .single();

    if (error) {
      console.error(`FAIL ${fix.sd_key}: ${error.message}`);
      fail++;
    } else {
      const changes = Object.keys(fix.updates).join(', ');
      console.log(`OK ${data.sd_key}: updated ${changes}`);
      ok++;
    }
  }

  console.log(`\n=== Done: ${ok} fixed, ${fail} failed ===`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
