/**
 * Fix EVA Remediation SD Quality Issues — Pass 3
 *
 * 9 fixes from deep quality review:
 *
 * MUST FIX:
 * 1. Remove duplicate Infrastructure CRIT-001 (retry logic) from Error/Logging — keep only in Infra Bugs
 * 2. Add Infrastructure HIGH-001 (failure reason classification) to Infra Bugs SD
 * 3. Reword DB Schema to not assume "25 per-stage tables" — frame as PLAN-phase decision
 *
 * SHOULD FIX:
 * 4. Increase Template Align LOC estimate from ~350 to ~700
 * 5. Remove questionable Tier 2 dependencies (Template Align no longer blocked by Error/Logging or Utils;
 *    Enum/Naming no longer blocked by DB Schema)
 * 6. Replace boilerplate success_criteria with specific measurable criteria per child
 * 7. Populate risks for DB Schema and Error/Logging (the two largest/riskiest children)
 * 8. Add child-specific implementation_guidelines
 * 9. Fix Enum/Naming description — clarify typeof pattern matches Build Loop templates per audit
 *
 * Run: node scripts/one-time/fix-eva-remediation-quality-pass3.cjs
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const AUDIT_SOURCE = 'Source: docs/audits/eva-comprehensive/ (12 completed audit reports from SD-EVA-QA-AUDIT-ORCH-001)';

const fixes = [
  // ── MUST FIX 1: Remove duplicate CRIT-001 from Error/Logging ──────────────
  // Retry logic dead code (event-router.js:215) is an Infrastructure bug, not error standardization.
  // Keep it ONLY in Infra Bugs SD. Remove from Error/Logging description.
  {
    sd_key: 'SD-EVA-FIX-ERROR-LOGGING-001',
    updates: {
      description: `Adopt ServiceError across 119 files, mandatory logger injection in 68 files, fix 12 silent catches.

Actions:
1. Expand ServiceError class from shared-services.js to lib/eva/errors/service-error.js
2. Create error catalog with codes per subsystem
3. Add mandatory logger = console DI parameter to all public functions
4. Add logging to 12 bare catch blocks

Files: 119 EVA files (55 with throw Error, 68 with no logging, 12 with silent catches)

Findings addressed:
- Cross-Cutting CRIT-002: No ServiceError adoption (119 files use throw new Error)
- Cross-Cutting CRIT-003: No logging injection (68 files with no logger)
- Cross-Cutting HIGH-001: Silent catch blocks (12+ files)
- Theme 4: Error Handling
- Theme 5: Logging Gaps

Note: Infrastructure CRIT-001 (retry logic dead code in event-router.js) is addressed by SD-EVA-FIX-INFRA-BUGS-001, not this SD.

${AUDIT_SOURCE}`,
      scope: 'Adopt ServiceError across 119 files, mandatory logger injection in 68 files, fix 12 silent catches',
      success_criteria: [
        { measure: 'ServiceError adoption', criterion: '0 remaining throw new Error() in lib/eva/ (currently 55 files)' },
        { measure: 'Logger injection', criterion: 'All 68 public functions accept logger parameter with console default' },
        { measure: 'Silent catches fixed', criterion: '0 bare catch blocks without error logging (currently 12+)' },
        { measure: 'Error catalog', criterion: 'Error codes defined per subsystem (event-bus, stages, gates)' }
      ],
      risks: [
        { risk: 'Largest scope SD (119 files touched)', mitigation: 'Prioritize critical path files first; use grep to identify exact locations' },
        { risk: 'ServiceError class API may need iteration', mitigation: 'Start with minimal class matching shared-services.js pattern; extend only as needed' },
        { risk: 'DI parameter changes break existing callers', mitigation: 'Use default parameter (logger = console) for backward compatibility' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/cross-cutting/audit-report.md for full finding details',
        'Use existing ServiceError from shared-services.js as starting point',
        'Add logger parameter with console default — no breaking changes to callers',
        'Grep for "catch" + empty blocks to find all 12 silent catches'
      ]
    }
  },

  // ── MUST FIX 2: Add Infrastructure HIGH-001 to Infra Bugs ─────────────────
  // Infrastructure HIGH-001 (failure reason classification) was unaddressed.
  {
    sd_key: 'SD-EVA-FIX-INFRA-BUGS-001',
    updates: {
      description: `Fix retry logic dead code, failure reason classification, CLI arg validation, wrong column ref, string-based error matching.

Actions:
1. Fix retry logic dead code in event-router.js:215 to check error.retryable flag
2. Track original + final errors in retry exhaustion for accurate failure classification (event-router.js:228)
3. Add CLI arg validation to eva-run.js (check next element exists, isn't a flag)
4. Fix stage -> lifecycle_stage column reference in decision-submitted.js
5. Replace string-based error matching with error.code === '23505' in sd-completed.js

Files: lib/eva/event-bus/event-router.js, scripts/eva-run.js, lib/eva/event-bus/handlers/decision-submitted.js, lib/eva/event-bus/handlers/sd-completed.js

Findings addressed:
- Infrastructure CRIT-001: Retry logic dead code in event-router.js
- Infrastructure CRIT-002: CLI argument parsing lacks validation
- Infrastructure CRIT-003: Wrong column reference in decision-submitted.js
- Infrastructure HIGH-001: Incorrect failure reason classification in event-router.js (line 228)
- Infrastructure HIGH-005: String-based error matching
- Theme 13: Infrastructure Bugs

${AUDIT_SOURCE}`,
      scope: 'Fix retry logic dead code, failure reason classification, CLI arg validation, wrong column ref, string-based error matching',
      success_criteria: [
        { measure: 'Retry logic', criterion: 'event-router.js checks error.retryable flag before retry; dead code path eliminated' },
        { measure: 'Failure classification', criterion: 'Retry exhaustion tracks original + final error for accurate audit log classification' },
        { measure: 'CLI validation', criterion: 'eva-run.js validates all args exist and are not flags before processing' },
        { measure: 'Column reference', criterion: 'decision-submitted.js uses lifecycle_stage (not stage) column' },
        { measure: 'Error matching', criterion: 'sd-completed.js uses error.code === "23505" instead of string matching' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/infrastructure/audit-report.md for exact line numbers and context',
        'event-router.js has TWO issues: line 215 (retry dead code) and line 228 (failure classification)',
        'CLI arg validation: check process.argv[i+1] exists and does not start with "-"',
        'Column rename: decision-submitted.js references "stage" but DB column is "lifecycle_stage"'
      ]
    }
  },

  // ── MUST FIX 3: Reword DB Schema — no predetermined architecture ──────────
  // "25 per-stage tables" is an architectural decision that belongs in PLAN phase, not predetermined.
  {
    sd_key: 'SD-EVA-FIX-DB-SCHEMA-001',
    updates: {
      description: `Normalize EVA database schema: replace single JSONB column with structured storage, create PostgreSQL ENUMs, tighten RLS policies, add gate constraints and data contracts.

Actions:
1. Design and implement structured stage data storage (architecture to be determined in PLAN phase — options include per-stage tables, partitioned tables, or typed JSONB with constraints)
2. Create 16 PostgreSQL ENUM types (9 decision + 7 categorization) to replace free-text fields
3. Replace USING (TRUE) RLS with role-based policies
4. Add stage-specific gate constraint columns
5. Add cross-stage data contract tracking (artifact dependency validation)

Files: database/migrations/, RLS policies

Findings addressed:
- DB Schema CRIT-001: Missing structured stage storage (single JSONB column for all stage data)
- DB Schema CRIT-002: Missing 16 PostgreSQL ENUM types
- DB Schema HIGH-001: USING (TRUE) RLS policies
- DB Schema HIGH-002: Missing stage-specific gate constraints
- DB Schema HIGH-003: Missing cross-stage data contracts
- Theme 3: Database Schema
- Theme 17: RLS Policies

${AUDIT_SOURCE}`,
      scope: 'Normalize stage data storage, create 16 PostgreSQL ENUMs, tighten RLS policies, add gate constraints and data contracts',
      success_criteria: [
        { measure: 'Structured storage', criterion: 'Stage data queryable without JSON parsing; architecture decided in PLAN phase' },
        { measure: 'ENUM types', criterion: '16 PostgreSQL ENUM types created matching Architecture v1.6 spec' },
        { measure: 'RLS policies', criterion: '0 USING (TRUE) policies remaining; all use role-based checks' },
        { measure: 'Gate constraints', criterion: 'DB-level constraints enforce stage gate requirements (not just application code)' },
        { measure: 'Data contracts', criterion: 'Cross-stage artifact dependencies tracked and validated' }
      ],
      risks: [
        { risk: 'Schema migration on live data requires careful rollback plan', mitigation: 'Use reversible migrations; test on staging clone first' },
        { risk: 'Storage architecture decision has cascading impact on all stage templates', mitigation: 'Decide architecture in PLAN phase with design agent; prototype before full migration' },
        { risk: 'RLS policy changes could break existing queries', mitigation: 'Audit all current queries before changing policies; add integration tests' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/database-schema/audit-report.md for full finding details',
        'Storage architecture (per-stage tables vs alternatives) is a PLAN-phase decision — do not assume 25 tables',
        'Use database sub-agent for all DDL operations',
        'ENUM types should match Architecture v1.6 Section 8 specifications',
        'Test RLS policy changes against all existing API endpoints'
      ]
    }
  },

  // ── SHOULD FIX 4: Increase Template Align LOC estimate ─────────────────────
  {
    sd_key: 'SD-EVA-FIX-TEMPLATE-ALIGN-001',
    updates: {
      success_criteria: [
        { measure: 'Phase 3 fields', criterion: '10 missing fields added to Identity templates (stages 10-12)' },
        { measure: 'Phase 5 fields', criterion: '5 decision objects + 8 fields added to Build Loop templates (stages 17-22)' },
        { measure: 'Phase 6 fields', criterion: 'launchOutcome, ventureDecision, financialComparison objects added; Stage 23-24 gaps filled' },
        { measure: 'Architecture v2.0', criterion: 'Stages 6-9, 14, 16 updated with Architecture v2.0 required fields' },
        { measure: 'Template-analysis parity', criterion: 'Every field in analysis steps has corresponding template field' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/phase-3-identity/audit-report.md, phase-5-buildloop/audit-report.md, phase-6-launch/audit-report.md',
        'Cross-reference each template against its analysis-steps counterpart to find missing fields',
        'Architecture v2.0 fields: check docs/audits/eva-comprehensive/engine/audit-report.md (HIGH-1/2/5)',
        'This is a high-volume SD (~700 LOC across 17+ template files) — batch by phase'
      ]
    }
  },

  // ── SHOULD FIX 5: Remove questionable Tier 2 dependencies ─────────────────
  // Template Align does NOT need Error/Logging or Utils done first — template fields are independent.
  // Enum/Naming does NOT need DB Schema done first — enum arrays are application-level, not DB-level.
  // Keep: Post-Launch blocked by Infra Bugs (infra bugs must be fixed before writing tests).
  // Keep: Post-Launch blocked by Error/Logging (tests need consistent error patterns).
  {
    sd_key: 'SD-EVA-FIX-TEMPLATE-ALIGN-001',
    updates: {
      dependencies: {
        blocks: [],
        blocked_by: []
      }
    }
  },
  {
    sd_key: 'SD-EVA-FIX-ENUM-NAMING-001',
    updates: {
      dependencies: {
        blocks: [],
        blocked_by: ['SD-EVA-FIX-UTILITY-DEDUP-001']
      }
    }
  },
  // Also update the blocking side: Error/Logging no longer blocks Template Align
  {
    sd_key: 'SD-EVA-FIX-ERROR-LOGGING-001',
    updates: {
      dependencies: {
        blocks: ['SD-EVA-FIX-POST-LAUNCH-001'],
        blocked_by: []
      }
    }
  },
  // Utils no longer blocks Template Align
  {
    sd_key: 'SD-EVA-FIX-UTILITY-DEDUP-001',
    updates: {
      dependencies: {
        blocks: ['SD-EVA-FIX-ENUM-NAMING-001'],
        blocked_by: []
      }
    }
  },
  // DB Schema no longer blocks Enum/Naming
  {
    sd_key: 'SD-EVA-FIX-DB-SCHEMA-001',
    updates: {
      dependencies: {
        blocks: [],
        blocked_by: []
      }
    }
  },

  // ── SHOULD FIX 6+7+8: Remaining children — specific success_criteria, risks, guidelines ──

  // Chairman Gates
  {
    sd_key: 'SD-EVA-FIX-CHAIRMAN-GATES-001',
    updates: {
      success_criteria: [
        { measure: 'Stage 10 gate', criterion: 'createOrReusePendingDecision() + waitForDecision() implemented in stage-10.js' },
        { measure: 'Stage 22 gate', criterion: 'createOrReusePendingDecision() + waitForDecision() implemented in stage-22.js' },
        { measure: 'Stage 25 gate', criterion: 'createOrReusePendingDecision() + waitForDecision() implemented in stage-25.js' },
        { measure: 'Pattern match', criterion: 'All 3 implementations follow Stage 0 pattern exactly' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/vision/audit-report.md for CRIT-001 details',
        'Copy pattern from lib/eva/stage-zero/ — createOrReusePendingDecision() + waitForDecision()',
        'Each stage needs: decision record creation, blocking wait, timeout handling'
      ]
    }
  },

  // Stage 15 Risk
  {
    sd_key: 'SD-EVA-FIX-STAGE15-RISK-001',
    updates: {
      success_criteria: [
        { measure: 'Schema replacement', criterion: 'Stage 15 template uses Risk Register schema (not Resource Planning)' },
        { measure: 'Analysis alignment', criterion: 'Stage 15 analysis steps updated to match Risk Register schema' },
        { measure: 'Spec compliance', criterion: 'Schema matches Architecture Section 8.4 Risk Register specification' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/blueprint/audit-report.md for finding #19 details',
        'Architecture Section 8.4 defines the Risk Register schema — use as gold standard',
        'Both template (stage-15.js) and analysis steps (stage-15-*.js) must be updated'
      ]
    }
  },

  // Utility Dedup
  {
    sd_key: 'SD-EVA-FIX-UTILITY-DEDUP-001',
    updates: {
      success_criteria: [
        { measure: 'parseJSON extracted', criterion: 'Single parseJSON() in lib/eva/utils/parse-json.js' },
        { measure: 'Imports updated', criterion: 'All 25 analysis files import from shared util (0 local copies remain)' },
        { measure: 'No regressions', criterion: 'All parseJSON callers produce identical output' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/cross-cutting/audit-report.md for CRIT-001 details',
        'Grep for "parseJSON" or "function parseJSON" in lib/eva/stage-templates/analysis-steps/',
        'Extract to lib/eva/utils/parse-json.js, update all 25 imports'
      ]
    }
  },

  // Reality Gates
  {
    sd_key: 'SD-EVA-FIX-REALITY-GATES-001',
    updates: {
      success_criteria: [
        { measure: 'Gate 9->10 artifacts', criterion: 'Validates Stage 6-9 artifacts (not Stage 4)' },
        { measure: 'Gate boundary', criterion: 'Gate moved from 20->21 to 22->23 per Vision v4.7' },
        { measure: 'Stage 12 coordination', criterion: 'Local gate integrated with system gate (no dual-gate conflict)' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/engine/audit-report.md (CRITICAL-1) and vision/audit-report.md (HIGH-001)',
        'reality-gates.js contains the gate definitions — update artifact lists and boundary numbers',
        'Stage 12 has both a local gate AND a system gate — merge into one coordinated check'
      ]
    }
  },

  // Kill Gates
  {
    sd_key: 'SD-EVA-FIX-KILL-GATES-001',
    updates: {
      success_criteria: [
        { measure: 'Stage 13 check', criterion: 'Kill gate checks for "now"-priority milestones before allowing passage' },
        { measure: 'Stage 23 prerequisite', criterion: 'Kill gate verifies Stage 22 completion before Stage 23 entry' },
        { measure: 'Risk thresholds', criterion: 'All risk thresholds use Vision v4.7 values: 7=caution, 9=chairman review' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/blueprint/audit-report.md (#8), launch/audit-report.md (CC-3), engine/audit-report.md (CRITICAL-2)',
        'Risk thresholds are currently inconsistent (values 1, 8, 10) — standardize to spec (7, 9)',
        'Stage 6 template and analysis must also use corrected threshold values'
      ]
    }
  },

  // Dossier Rebuild
  {
    sd_key: 'SD-EVA-FIX-DOSSIER-REBUILD-001',
    updates: {
      success_criteria: [
        { measure: 'README accuracy', criterion: 'README reflects actual dossier count (not 100%)' },
        { measure: 'Stage names', criterion: '4 dossiers renamed to Vision v4.7 stage names' },
        { measure: 'Archive', criterion: '14 stale 40-stage era files moved to archive/' },
        { measure: 'Completeness', criterion: '25/25 dossier structures exist (20 new + 5 existing)' },
        { measure: 'Phase grouping', criterion: 'Dossiers organized by 6-phase model' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/dossier/audit-report.md for CRITICAL-1/2/3 details',
        'Existing 5 dossiers: check docs/guides/workflow/dossiers/ for current state',
        'Vision v4.7 defines authoritative stage names — use for all renames',
        'Generate dossier structures matching existing 5 as template'
      ]
    }
  },

  // Post-Launch
  {
    sd_key: 'SD-EVA-FIX-POST-LAUNCH-001',
    updates: {
      success_criteria: [
        { measure: 'Stage 25 routing', criterion: '5 decision outcomes implemented (continue, pivot, expand, sunset, exit)' },
        { measure: 'Template applier', criterion: 'All TODOs in template-applier.js completed' },
        { measure: 'Event bus tests', criterion: 'Unit tests for router + 4 handlers with >80% coverage' },
        { measure: 'CLI tests', criterion: 'eva-run.js argument parsing and execution tested' },
        { measure: 'Chairman tests', criterion: 'Chairman watcher decision flow tested' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/phase-6-launch/audit-report.md and vision/audit-report.md (HIGH-002)',
        'Stage 25 outcomes: continue→24, pivot→new venture, expand→child, sunset, exit',
        'Test files: create in test/eva/ matching existing test structure',
        'template-applier.js: grep for "TODO" to find incomplete sections'
      ]
    }
  },

  // ── SHOULD FIX 9: Fix Enum/Naming description ─────────────────────────────
  // The audit says "templates validate as typeof x === 'string'" for 8 Build Loop fields.
  // This is accurate per the Build Loop audit — it's in template validation, not analysis steps.
  // Clarify the description to match the audit precisely.
  {
    sd_key: 'SD-EVA-FIX-ENUM-NAMING-001',
    updates: {
      description: `Replace typeof x === 'string' template validation with enum arrays for 8 Build Loop fields, fix camelCase/snake_case drift, rename DI params.

Actions:
1. Replace typeof x === 'string' with VALID_ENUMS.includes(x) in Build Loop template validation for 8 fields:
   - Stage 17: bugs[].severity, bugs[].status
   - Stage 18: improvements[].category
   - Stage 19: metricUpdates[].trend
   - Stage 20: roadmapItems[].priority
   - Stage 21: completionItems[].status
   - Stage 22: releaseItems[].category
2. Fix camelCase/snake_case drift across stage templates
3. Rename db -> supabase in 6 DI files
4. Rename LLM client -> llmClient in 25 templates

Files: Build Loop templates (17-22), all stage templates (naming), 6 DI files, 25 LLM client files

Findings addressed:
- Build Loop Finding 2 (HIGH): 8 fields use typeof instead of enum arrays in template validation
- Cross-Cutting HIGH-003: DI parameter naming (db -> supabase)
- Schema field naming drift across templates
- Theme 7: Enum Validation
- Theme 11: Schema Field Naming
- Theme 19: DI Parameter Naming

${AUDIT_SOURCE}`,
      scope: 'Replace typeof checks with enum arrays for 8 Build Loop fields, fix naming drift, rename DI params',
      success_criteria: [
        { measure: 'Enum validation', criterion: '0 typeof string checks for enum fields in Build Loop templates (currently 8)' },
        { measure: 'Naming consistency', criterion: 'All template fields use consistent snake_case matching DB columns' },
        { measure: 'DI naming', criterion: 'db -> supabase renamed in all 6 affected files' },
        { measure: 'LLM client naming', criterion: 'client -> llmClient renamed in all 25 templates' }
      ],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/phase-5-buildloop/audit-report.md Finding 2 for exact field list',
        'The typeof checks are in TEMPLATE validation code, not analysis steps',
        'Enum arrays should match the analysis step enum definitions',
        'DI rename: grep for "function.*\\bdb\\b" in lib/eva/ to find affected files'
      ]
    }
  },

  // ── Update orchestrator dependency graph description ───────────────────────
  {
    sd_key: 'SD-EVA-REMEDIATION-ORCH-001',
    updates: {
      description: `Orchestrator for remediating 157 findings (36 critical, 53 high, 48 medium, 20 low) identified by EVA Comprehensive Audit (SD-EVA-QA-AUDIT-ORCH-001).

Tier 1 (10 SDs, parallel): Chairman Gates, Stage 15 Risk, Error/Logging, Utility Dedup, DB Schema, Reality Gates, Infra Bugs, Kill Gates, Dossier Rebuild, Template Alignment
Tier 2 (2 SDs, sequential): Enum/Naming, Post-Launch/Tests

Dependency graph:
  Tier 1 (parallel): [1-CHAIRMAN] [2-STAGE15] [3-ERR/LOG] [4-UTILS] [5-DB] [6-GATES] [7-INFRA] [8-KILL] [9-DOSSIER] [10-TEMPLATES]
  Tier 2 (after):     [11-ENUMS<-4]  [12-POST-LAUNCH<-3,7]

Coverage: All 20 major audit themes assigned to child SDs. All CRITICAL and HIGH findings explicitly addressed. Some MEDIUM/LOW findings (DB Schema MED-001/002/003, Cross-Cutting MED-001/002/003, Infrastructure MED-001-004) are not explicitly scoped — these may be addressed incidentally during related work or deferred to follow-up SDs.

${AUDIT_SOURCE}`
    }
  }
];

async function main() {
  console.log('=== Fixing EVA Remediation SD Quality Issues — Pass 3 ===\n');
  console.log('9 fixes: 3 must-fix + 6 should-fix\n');

  // Some SDs appear multiple times in fixes (e.g., Template Align for LOC + dependencies).
  // Process them all sequentially — later updates override earlier ones for same fields.
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
