#!/usr/bin/env node
/**
 * Write DOCMON sub-agent verdict for SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001 EXEC phase.
 * Assesses whether FR-3 audit_log event vocabulary is sufficiently documented.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001';

const detailedAnalysis = `DOCMON ASSESSMENT — FR-3 audit_log observability documentation

SCOPE: Reviewed lib/eva/quality-findings/sd-generator.js Family B section + writeAuditLog (lines 274-303) and 6 call sites for sufficiency of inline documentation against the FR-3 spec note "dedup decisions must be observable".

INVENTORY:
- writeAuditLog JSDoc names all 6 event_types in the eventType param description: 'dedup_hit', 'dedup_miss', 'rate_limit_triggered', 'sd_filed', 'lock_held', 'generator_failed'.
- Each call site has the full payload object visible inline (sd-generator.js:592, 608, 627, 636 + cron driver).
- Module-level JSDoc (line 21) calls out "Every dedup decision and rate-limit hit emits an audit_log row".
- audit_log row shape: {event_type, entity_type, entity_id, metadata (JSONB w/ payload + generator tag + ts), severity, created_by='fr-c-generator'}.
- created_by='fr-c-generator' tag makes all FR-C′ rows uniquely filterable from other audit_log writers.

GAP ANALYSIS:
- No separate audit-events.md / README enumerates payload schemas in one place.
- A LEAD reviewer querying audit_log cold would have to grep 5 call sites in sd-generator.js + 1 in cron driver to interpret which payload keys are guaranteed per event_type.
- Severity levels (info/warning/error) are not explicitly tabulated by event_type.
- entity_type/entity_id pairing varies (venture_quality_findings vs strategic_directives_v2) and is not documented in one place.

VERDICT: CONDITIONAL_PASS

RATIONALE FOR PASS:
- Event vocabulary IS named in JSDoc; LEAD can grep for event_type values.
- All call sites concentrated in two files (sd-generator.js + scripts/cron/fr-c-generator.mjs); discovery cost is bounded.
- created_by='fr-c-generator' tag enables clean filter; SELECT * FROM audit_log WHERE created_by='fr-c-generator' returns the complete event stream with payloads for self-documenting interpretation.
- FR-3 "observable" requirement is mechanically satisfied — every dedup decision writes a row.

CONDITION (non-blocking for EXEC handoff):
1. Author docs/audit-events-fr-c.md (or extend module JSDoc with @event blocks) tabulating: event_type | severity | entity_type | entity_id source | required payload keys | optional payload keys. Estimated 30 LOC. Recommend filing as a follow-up Tier-1 QF post-merge rather than blocking this handoff — the inline source IS the source of truth and the population of audit_log rows is self-explanatory once filtered by created_by tag.

RECOMMENDATION: Proceed with EXEC-TO-PLAN handoff. File a follow-up QF (estimated 1-line entry per event in a new docs/audit-events-fr-c.md, ~30 LOC) AFTER merge if LEAD reviewer flags discoverability friction during PLAN-TO-LEAD review. Do NOT block this SD on the docs file — inline JSDoc + call-site visibility + created_by tag meet the FR-3 observability bar.`;

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert({
    sub_agent_code: 'DOCMON',
    sub_agent_name: 'Information Architecture Lead',
    sd_id: SD_KEY,
    phase: 'EXEC',
    verdict: 'conditional_pass',
    confidence: 88,
    summary: 'CONDITIONAL_PASS — inline JSDoc enumerates event vocabulary; follow-up docs/audit-events-fr-c.md recommended post-merge but not blocking',
    detailed_analysis: detailedAnalysis,
    critical_issues: [],
    warnings: [
      'No consolidated docs/audit-events-fr-c.md',
      'Severity levels per event not tabulated',
      'entity_type/entity_id pairing per event not documented',
      'Payload keys (required vs optional) not enumerated'
    ],
    recommendations: [
      'Proceed with EXEC-TO-PLAN handoff — inline JSDoc + created_by tag meet FR-3 observability bar',
      'File Tier-1 follow-up QF post-merge for docs/audit-events-fr-c.md (~30 LOC) tabulating event_type | severity | entity_type | payload keys',
      'Consider extending writeAuditLog JSDoc with @event blocks per event_type as alternative to a separate doc'
    ],
    conditions: [
      {
        severity: 'low',
        description: 'File a follow-up Tier-1 QF for docs/audit-events-fr-c.md (~30 LOC) post-merge if discoverability friction surfaces during LEAD review.',
        blocking: false
      }
    ],
    source: 'manual',
    validation_mode: 'standard',
    justification: 'FR-3 spec note: "dedup decisions must be observable". Inline JSDoc + 6 call-site payload visibility + created_by="fr-c-generator" filter tag mechanically satisfy observability. Separate docs file is best-practice polish, not a blocking requirement.',
    metadata: {
      module_under_review: 'lib/eva/quality-findings/sd-generator.js',
      sections_reviewed: ['writeAuditLog (274-303)', 'Family B (235-end)', 'cron driver call site'],
      events_reviewed: ['dedup_hit', 'dedup_miss', 'sd_filed', 'rate_limit_triggered', 'lock_held', 'generator_failed'],
      documentation_surfaces_present: [
        'writeAuditLog JSDoc lines 274-303 (names all event_types)',
        'Module-level JSDoc line 21 (high-level commitment)',
        'Inline call-site payload visibility (sd-generator.js:592,608,627,636 + cron driver)',
        "created_by='fr-c-generator' tag for clean audit_log filtering"
      ],
      reviewer: 'docmon-agent',
      assessment_basis: 'FR-3 spec note: dedup decisions must be observable'
    }
  })
  .select('id')
  .single();

if (error) {
  console.error('FAILED:', error.message);
  process.exit(1);
}

console.log(JSON.stringify({ row_id: data.id, verdict: 'CONDITIONAL_PASS' }, null, 2));
