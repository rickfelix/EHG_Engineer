// Mark auto-generated boilerplate deliverables complete with evidence.
// SCOPE_AUDIT gate blocker: sd_scope_deliverables was seeded from the PRD's generic
// exec_checklist (fixed 6-item DoD), not from FR-1..FR-5 (RCA-confirmed, extract-deliverables-
// from-prd.js:96 — the FR-derived path is dead code, gated on deliverables.length===0 which is
// never true). Per RCA guidance: do NOT regenerate from FRs post-EXEC (rewrites locked scope);
// resolve the 2 pending generic items with real, verified evidence instead.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const updates = [
  {
    id: '786681e2-12a9-4441-833b-784ea8e9e781', // configuration: Development environment setup
    completion_status: 'completed',
    completion_notes:
      'N/A for this routing/plumbing SD. No new environment variables, dependencies, or config were introduced. The FR-5 executor model slot reuses the EXISTING CLAUDE_MODEL_S17_* env-var pattern (process.env.CLAUDE_MODEL_S17_LEAF_DESIGN_AUDIT, already-established convention). FR-4 activation reuses the already-shipped gate_witness_events observe-only harness (SD-LEO-INFRA-ACTIVATE-DESIGN-FIDELITY-001) with zero new tables/config.',
    completion_evidence: {
      reason: 'no-new-env-or-config-required',
      verification: 'grep for new env vars across the diff: only a read of the pre-existing CLAUDE_MODEL_S17_LEAF_DESIGN_AUDIT var (lib/eva/bridge/design-fidelity-observe.js), no new .env keys added',
      reused_harness: 'gate_witness_events via lib/eva/record-witness-event.js (no new DDL)',
      commits: ['a72cd92ca9', 'c43faa60cc'],
    },
    verified_by: 'EXEC',
    verified_at: new Date().toISOString(),
    verification_notes: 'Confirmed via diff review — zero new config surface introduced by this SD.',
  },
  {
    id: '6767d247-2ebb-41e0-985a-7f5c62bc91c5', // documentation: Documentation updated
    completion_status: 'completed',
    completion_notes:
      'Documentation provided via: (1) module/function-level JSDoc + rationale comments in all 4 touched files — lib/eva/bridge/design-token-resolver.js (TR-1 GVOS-vs-legacy precedence contract), lib/eva/bridge/design-input-instructions.js (FR-3 mechanical-verbatim-wrap rationale + loadSharedDesignPrompts single-source-of-truth note), lib/eva/bridge/design-fidelity-observe.js (dispatchDesignPromptRubricScorer full JSDoc contract), scripts/modules/implementation-fidelity/sections/design-fidelity.js (FR-4 activation rationale: why stage_17_approved_desktop is the evidence source, why observe defaults true); (2) the PRD (product_requirements_v2) documenting FR-1..FR-5/AC-1..AC-8/TR-1..TR-5/TS-1..TS-8; (3) commit messages a72cd92ca9 and c43faa60cc documenting the 4 PLAN_VERIFICATION gap fixes and their rationale; (4) retrospective fd3d6b38-2e41-4041-9b94-3cbbd4e00340 capturing lessons learned. The broader /document skill pass still runs in the post-completion tail for any additional docs/ cross-referencing.',
    completion_evidence: {
      jsdoc_files: [
        'lib/eva/bridge/design-token-resolver.js',
        'lib/eva/bridge/design-input-instructions.js',
        'lib/eva/bridge/design-fidelity-observe.js',
        'scripts/modules/implementation-fidelity/sections/design-fidelity.js',
      ],
      prd_id: 'PRD-SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001',
      commits: ['a72cd92ca9', 'c43faa60cc'],
      retrospective_id: 'fd3d6b38-2e41-4041-9b94-3cbbd4e00340',
    },
    verified_by: 'EXEC',
    verified_at: new Date().toISOString(),
    verification_notes:
      'Verified inline comments exist and explain non-obvious rationale (not restated code) at each touched file; PRD + retrospective + commit messages independently confirmed present in the DB/git history.',
  },
];

for (const u of updates) {
  const { id, ...patch } = u;
  const { error } = await sb.from('sd_scope_deliverables').update(patch).eq('id', id);
  if (error) {
    console.error('FAILED for', id, error.message);
    process.exit(1);
  }
  console.log('completed:', id);
}
console.log('Done.');
