#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STATIC-PREFIX-DIET-001';

const phase_2_first_cut = {
  status: 'shipped — conservative first cut, 15% target NOT yet reached',
  commit: '6018bead980',
  branch: 'feat/SD-LEO-INFRA-STATIC-PREFIX-DIET-001',
  mechanism_used: 'CLAUDE_CORE_MANUAL.md companion, via the EXISTING, already-proven pattern (generateAdamCompanion + scripts/section-file-mapping.json) shipped for LEAD/PLAN/ADAM/COORDINATOR/SOLOMON by SD-FDBK-INFRA-CLAUDE-LEAD-EXCEEDS-001 and successors. No new generator architecture was built — the context_tier column remains unused/dormant as originally found; the section-file-mapping.json + companion-generator pattern turned out to be the correct, already-built activation mechanism.',
  sections_moved: ['governance_strategic_hierarchy', 'builtin_agent_integration', 'pattern_search_guide', 'ai_quality_russian_judge', 'pr_size_guidelines', 'governance_chairman_ceo_roles', 'database_column_reference'],
  review_discipline: 'Every REFERENCE-tier candidate was screened by keyword scan (MUST/MANDATORY/GATE/NEVER/ALWAYS/CRITICAL/OVERRIDE/IGNORE) AND individual manual content read. Several tier-tagged-REFERENCE sections were EXCLUDED after manual review despite looking safe on the tier label: model_routing_guidance (live Haiku-ban rule), supabase_operations (raw-psql prohibition), application_architecture (EXEC-phase navigation steps), genesis_codebase (dual-codebase fact), script_anti_patterns (one-off-script prohibition), migration_execution_protocol (DATABASE-sub-agent invocation rule, though its TAIL — the Tiered Auto-Apply Policy mechanics — is genuinely reference and a good SPLIT candidate for a follow-up), parent_child_overview (full-LEAD-PLAN-EXEC-per-child rule), execution_philosophy (testing/database-first rules), git_commit_guidelines (commit-format rule), session_verification (anti-hallucination protocol), database_first_enforcement_expanded (never-create-files rule), stage_7_hard_block (a literal hard block despite carrying "REFERENCE" tier metadata — the tier column is NOT a reliable ground truth on its own).',
  measured_before_after: {
    'CLAUDE_CORE.md': { before_bytes: 94414, after_bytes: 85323, before_harness_tokens: 39051, after_harness_tokens: 35291 },
    worker_seat_total: { before_harness_tokens: 54498, after_harness_tokens: 50738, reduction_pct: 6.9 },
    adam_seat_total: { unaffected: true, reason: 'Adam seat profile (CLAUDE.md + CLAUDE_ADAM.md + CLAUDE_ADAM_DIGEST.md) does not read CLAUDE_CORE.md at all, so this move contributes 0% to the Adam seat target — CLAUDE_ADAM.md needs its own companion review to move the Adam-seat needle.' },
  },
  regression_verification: 'tests/unit/claude-md-single-read-cap.test.js (9/9, MUST_FIT_SINGLE_READ + 2.4177 constant untouched), scripts/check-claude-md-drift.cjs (clean), full claude-md-generator + protocol test suites (249/249), tests/unit/protocol-publication-pipeline.test.js updated (KNOWN_GENERATED_FILES 25->26, documented in the same style as every prior companion addition).',
  next_steps: [
    'migration_execution_protocol SPLIT: keep the opening CRITICAL rule paragraph (~600 chars, "invoke the DATABASE sub-agent") inline in CLAUDE_CORE.md; move the Tiered Auto-Apply Policy mechanics (~4800 chars: TIER-1/TIER-2 definitions, feature-flag polarity detail, Adam-delegated-apply nuance) to CLAUDE_CORE_MANUAL.md. Requires an actual leo_protocol_sections content edit (split one row into two), not a pure section move — higher risk, needs its own careful pass with a read-modify-write against the live DB row plus a fresh drift-check.',
    'Adam-seat contribution: review CLAUDE_ADAM.md (24916 harness-tokens, the single largest seat-specific component) for REFERENCE-tier candidates using the same keyword-scan + manual-review discipline; CLAUDE_ADAM_MANUAL.md already exists as the target companion, so this may be as simple as moving section_type entries within the existing mapping (verify with the same process used here).',
    'CLAUDE.md why-block extraction (29.5% of file, 5780 chars) is a SEPARATE, higher-risk mechanism (in-row content splitting across ~21 locations rather than whole-section moves) — deferred; benefits both seats since CLAUDE.md is shared, but should only be attempted after the lower-risk whole-section moves above are exhausted.',
    'Once the >=15% target is reached on both seats (measured via harnessTokensFromBytes, never the generator printed line), proceed to PRD FR-7 (7-day lost-rule incident watch) and FR-8 (record post-diet size for B1).',
  ],
};

async function main() {
  const { data: row, error: e0 } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (e0) throw e0;
  const md = { ...row.metadata };
  md.exec_progress = { ...md.exec_progress, phase_2_first_cut };
  const { error: e1 } = await supabase.from('strategic_directives_v2').update({ metadata: md }).eq('sd_key', SD_KEY);
  if (e1) throw e1;
  console.log('phase_2_first_cut breadcrumb recorded');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
