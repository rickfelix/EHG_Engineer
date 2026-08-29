#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STATIC-PREFIX-DIET-001';

const exec_progress = {
  phase_1_audit: {
    status: 'complete',
    commit: 'a8edeaf39de',
    branch: 'feat/SD-LEO-INFRA-STATIC-PREFIX-DIET-001',
    deliverables: [
      'lib/protocol/static-prefix-audit.mjs',
      'scripts/audit-static-prefix.mjs',
      'tests/unit/protocol/static-prefix-audit.test.js (11 passing)',
    ],
    measured_totals: {
      worker_seat: {
        total_bytes: 131761,
        total_harness_tokens: 54498,
        components: { 'CLAUDE.md': 8149, 'CLAUDE_CORE.md': 39051, 'MEMORY.md': 7298 },
      },
      adam_seat: {
        total_bytes: 115629,
        total_harness_tokens: 47825,
        components: { 'CLAUDE.md': 8149, 'CLAUDE_ADAM.md': 24916, 'CLAUDE_ADAM_DIGEST.md': 7462, 'MEMORY.md': 7298 },
      },
    },
    note: "MEMORY.md is fixed/out-of-scope (chairman's memory) and cannot be reduced, so the >=15% total-reduction target must come entirely from the reducible components: worker needs ~17.3% reduction across CLAUDE.md+CLAUDE_CORE.md (47200 tokens); adam needs ~17.7% across CLAUDE.md+CLAUDE_ADAM.md+CLAUDE_ADAM_DIGEST.md (40527 tokens).",
  },
  phase_2_diet_key_finding: {
    status: 'not_started — research only',
    finding: "leo_protocol_sections already has a context_tier column with real live values (CORE, REFERENCE, null on 36 CLAUDE_CORE.md-mapped sections) — but scripts/modules/claude-md-generator/index.js:710-714 explicitly EXCLUDES context_tier from rendering: placement is keyed off section_type via the section-file-mapping, and context_tier is documented as unused (excluded from the digest hash specifically because it is not rendered). This is very likely the intended activation hook for A4: wire context_tier=REFERENCE sections to render as a short on-demand pointer inline in the FULL file (CLAUDE_CORE.md/CLAUDE_ADAM.md) while their full content moves to that file's existing companion/digest file, with context_tier=CORE staying fully inline. Top REFERENCE-tier candidates by size in CLAUDE_CORE.md (title: content-char-length): Migration Execution Protocol (5434), SD Type-Specific Validation Requirements (3490), Parent-Child SD Hierarchy (2879), RCA Multi-Expert Collaboration Protocol (2840), Sub-Agent Model Routing (2094), Strunkian Writing Standards (2090), Lesson Learned Capture MANDATORY (1949).",
    risk_note: 'Wiring context_tier into the generator\'s render path is a change to production-critical code every fleet session depends on (CLAUDE_CORE.md is read by every worker). Needs its own careful pass: section-file-mapping logic change, new on-demand-pointer rendering, and full regression against tests/unit/claude-md-single-read-cap.test.js + scripts/check-claude-md-drift.cjs before touching real content. Deliberately NOT rushed in the same sitting as phase 1 given the safety-criticality (a broken CLAUDE_CORE.md render degrades guidance for every active fleet worker).',
    next_step: 'Design the on-demand-pointer render path for context_tier=REFERENCE sections (likely: emit a short pointer line to the section anchor in the digest companion file, full content in the digest file only), verify against the single-read-cap + drift-check test suites, THEN select/move the top REFERENCE-tier candidates listed above (rough char-based arithmetic already exceeds the target: the top 4 alone sum to 14643 chars against the ~8175-harness-token worker cut needed — actual cut must be re-verified via harnessTokensFromBytes on the real regenerated file, not char counts).',
  },
};

async function main() {
  const { data: row, error: e0 } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (e0) throw e0;
  const md = { ...row.metadata, exec_progress };
  const { error: e1 } = await supabase.from('strategic_directives_v2').update({ metadata: md }).eq('sd_key', SD_KEY);
  if (e1) throw e1;
  console.log('exec_progress breadcrumb recorded');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
