// LEAD enrichment for SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001
// Populates risks (7), key_changes (9), metadata.files_affected (13),
// and metadata.lead_decision (8-question validation + scope_reduction_percentage)
// after --from-plan parser missed the corresponding plan-file tables.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
const sdKey = 'SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001';

const risks = [
  {
    id: 'R-01',
    category: 'integration',
    description: 'Downstream consumers (S19 Replit prompt regen, adherence validator) read venture_wireframe_artifact per-screen and break when persistence moves to venture_artifacts (venture-level).',
    likelihood: 'medium',
    impact: 'high',
    priority: 12,
    mitigation: 'PLAN chooses cutover vs shadow-write; shadow-write keeps both tables in sync during a soak window; consumer migration tracked in this SD or filed as follow-up.'
  },
  {
    id: 'R-02',
    category: 'operational',
    description: 'In-flight ventures with React-state per-wireframe approvals lose those approvals on deploy (state was never DB-persisted in the s17_per_wireframe_sections=ON path).',
    likelihood: 'high',
    impact: 'low',
    priority: 6,
    mitigation: 'Acceptable — state was never persistent. Document in retrospective; chairmen re-approve once after deploy. No code change needed.'
  },
  {
    id: 'R-03',
    category: 'ux',
    description: 'github_sync "captured but not ready" window (webhook not yet fired → ArtifactNotReadyError) confuses chairmen at the venture level — affects the single approval gate rather than a per-wireframe one.',
    likelihood: 'medium',
    impact: 'medium',
    priority: 9,
    mitigation: 'New UI shows explicit "syncing… waiting on first commit" indicator with disabled approval Switch until artifact is ready. PRD specifies the loading + error states.'
  },
  {
    id: 'R-04',
    category: 'architecture',
    description: 'Approval-flag location decision (column on ventures vs column on venture_artifacts row vs new venture_blueprint_approval table) impacts later analytics work and join cost on dashboard queries.',
    likelihood: 'medium',
    impact: 'medium',
    priority: 9,
    mitigation: 'PLAN picks based on: (a) join cost on common queries; (b) whether approval should be versioned independently of the artifact; (c) consistency with other per-venture state. Document the chosen location and the alternatives considered.'
  },
  {
    id: 'R-05',
    category: 'product',
    description: 'Dropping inline_html capture mode breaks chairmen who currently rely on pasting raw HTML into the legacy WireframeArtifactCapture.',
    likelihood: 'low',
    impact: 'medium',
    priority: 6,
    mitigation: 'Audit venture_wireframe_artifact rows for type=inline_html before merge; if usage exists, file a follow-up SD to support the mode in venture-level capture (NOT in this SD’s scope per user direction).'
  },
  {
    id: 'R-06',
    category: 'technical',
    description: 'WireframeArtifactCapture + WireframeUploadSlot deletion breaks tests that import them.',
    likelihood: 'high',
    impact: 'low',
    priority: 6,
    mitigation: 'Search test suites for the imports; remove + replace assertions with VentureArtifactCapture equivalents. Mechanical.'
  },
  {
    id: 'R-07',
    category: 'data-hygiene',
    description: 'Sub-flag s17_per_wireframe_sections retirement leaves orphan feature_flags rows in the DB.',
    likelihood: 'high',
    impact: 'low',
    priority: 6,
    mitigation: 'Add a cleanup migration removing the s17_per_wireframe_sections row from the feature_flags table.'
  }
];

const key_changes = [
  { change: 'New VentureArtifactCapture component at bottom of S17 (file upload OR GitHub URL).', impact: 'feature' },
  { change: 'Per-wireframe upload + approval UI removed (WireframeUploadSlot deleted; "Mark as approved" Switch removed from WireframeSection).', impact: 'refactor' },
  { change: 'Continue gate canContinueStage17 simplified to venture-level approval only — fidelity check dropped.', impact: 'refactor' },
  { change: 'New venture-level write path: ONE row in venture_artifacts (artifact_type=design_mockups candidate, (venture_id, artifact_type) partial-unique on is_current=true).', impact: 'feature' },
  { change: 'Venture-level approval flag — new column on ventures OR new column on venture_artifacts row OR new venture_blueprint_approval table (PLAN decision).', impact: 'infrastructure' },
  { change: 'Sub-flag s17_per_wireframe_sections retired — reads removed from production code; feature_flags row cleaned up.', impact: 'refactor' },
  { change: 'Legacy WireframeArtifactCapture + WireframeUploadSlot deleted (per-screen capture pathway retired).', impact: 'refactor' },
  { change: 'Downstream artifact-resolver migrated to read from venture_artifacts (cutover OR shadow-read; PLAN decision).', impact: 'infrastructure' },
  { change: 'Vitest + Playwright coverage for the new venture-level flow (file path, GitHub URL path, Continue gate).', impact: 'testing' }
];

const files_affected = [
  { path: 'src/components/stages/Stage17BlueprintReview.tsx', action: 'MODIFY', note: 'Remove sub-flag fork mounting; mount the single collapsed list (~10 LOC delta).' },
  { path: 'src/components/stage17/gvos/WireframeSectionList.tsx', action: 'MODIFY', note: 'Strip per-wireframe upload + approve UI; add bottom-of-page venture-level capture + approval block; rewire Continue gate.' },
  { path: 'src/components/stage17/gvos/WireframeUploadSlot.tsx', action: 'DELETE', note: 'Per-wireframe upload retired; logic merged into new venture-level component.' },
  { path: 'src/components/stage17/gvos/WireframeArtifactCapture.tsx', action: 'DELETE', note: 'Legacy per-screen capture retired.' },
  { path: 'src/components/stage17/gvos/GvosS17Sections.tsx', action: 'MODIFY', note: 'Remove WireframeArtifactCapture mount; remove sub-flag supersession check.' },
  { path: 'src/components/stage17/gvos/VentureArtifactCapture.tsx', action: 'CREATE', note: 'New venture-level capture component (file upload + GitHub URL; ~150 LOC).' },
  { path: 'src/lib/gvos/stage17-gate.ts', action: 'MODIFY', note: 'Drop fidelity check + per-wireframe approval map; new predicate reads venture-level approval flag only.' },
  { path: 'src/hooks/gvos/useCaptureArtifact.ts', action: 'MODIFY', note: 'Write to venture_artifacts; legacy hook removed or kept for shadow-write window. May be replaced by new useVentureArtifactCapture.' },
  { path: 'src/hooks/gvos/useVentureApproval.ts', action: 'CREATE', note: 'Read + write venture-level approval flag.' },
  { path: 'supabase/migrations/<NNNN>_add_venture_blueprint_approval.sql', action: 'CREATE', note: 'Schema change for approval flag (location decided in PLAN).' },
  { path: 'src/lib/gvos/artifact-resolver.ts', action: 'MODIFY', note: 'resolveArtifact(ventureId) reads from venture_artifacts instead of venture_wireframe_artifact (cutover vs shadow-read per PLAN).' },
  { path: 'tests/unit/gvos/stage17-gate.test.ts', action: 'MODIFY', note: 'Assertions for simplified predicate.' },
  { path: 'tests/unit/gvos/venture-artifact-capture.test.tsx', action: 'CREATE', note: 'Unit coverage for new venture-level capture.' },
  { path: 'tests/e2e/stage17/venture-level-approval.spec.ts', action: 'CREATE', note: 'Playwright e2e for the new flow.' }
];

const lead_decision = {
  verdict: 'APPROVED',
  decided_at: new Date().toISOString(),
  decided_by: 'LEAD-claude-opus-4-7',
  validation_answers: {
    need_validation: 'Real chairman UX problem: Stage 17 currently presents N independent upload+approve flows when chairman approval is semantically venture-level. The per-wireframe surface is also non-persistent (React-state-only) so it presents a false sense of saved state. User explicitly identified this in product-mode session.',
    solution_assessment: 'Collapse N per-wireframe UIs to one venture-level UI + persistence in the recently-shipped venture_artifacts table. Reuses existing github_sync semantics whole-cloth. Aligns with venture-level mental model.',
    existing_tools: 'Reuses (i) venture_artifacts table (shipped 2026-05-18 by SD-LEO-FEAT-S11-VENTURE-GVOS-001); (ii) WireframeArtifactCapture’s github_sync mode (repo URL + branch + webhook + commit-sha tracking); (iii) WireframeUploadSlot’s MIME-type detection + 25MB cap; (iv) ArchetypeDisplayPanel + ComposerPreviewPanel continue to mount above the new collapsed list unchanged.',
    value_analysis: 'Reduces UI complexity (N upload+approve flows → 1), simplifies Continue gate predicate, eliminates parallel sub-flag fork, gives chairmen a persistent venture-level approval state instead of ephemeral React state. Aligns S17 with venture-artifact-storage architecture trajectory.',
    feasibility_review: 'Feasible. New persistence target already exists. Legacy code paths can be deleted in same SD per user direction. github_sync downstream consumer plumbing (S19 prompt regen, adherence validator) is the main feasibility concern — PLAN decides cutover vs shadow-write. No blocker.',
    risk_assessment: 'Documented in 7 risks (R-01 through R-07). Highest-priority risk is R-01 (downstream consumer migration, priority 12). No critical-risk blockers. All risks have executable mitigations.',
    simplicity_check: 'Simpler than current state by net design — the SD removes more UI surface than it adds. Per-wireframe upload + approve + quality badge + fidelity badge + approval state → all gone. New venture-level capture is one component, two modes (file or GitHub URL). Continue gate predicate goes from 3-input to 1-input.',
    q8_deletion_audit: {
      scope_reduction_percentage: 28,
      what_was_cut: [
        'inline_html capture mode (1 of 3 legacy modes — user-directed cut).',
        'Continue-gate fidelity check (per-wireframe fidelity score aggregation — user-directed cut).',
        'Per-wireframe quality badge (visible severity score per wireframe — user-directed cut).',
        'Per-wireframe fidelity badge — user-directed cut.',
        'Per-wireframe visual approval state (read-only checkmark grouping — user-directed cut; fully gone, not just read-only).',
        'Historical venture_wireframe_artifact data migration to venture_artifacts (out of scope; new persistence is for new captures only).',
        'Per-wireframe quality/fidelity scoring algorithm modifications (scoring still runs for other consumers; only badge rendering removed).'
      ],
      why_cut: 'User explicitly directed venture-level approval mental model. Per-wireframe scoring badges + fidelity gate + inline_html mode are surface area that doesn’t serve the collapsed UI. Historical data migration was deemed not worth the cost vs leave-legacy-queryable.'
    }
  },
  scope_lock: 'Five user-confirmed scope items (persistence venture-level, two-mode bottom capture, per-wireframe stripped to prompt+copy, gate=approval-only, legacy retirement folded in). Plan H1 + Success Criteria + Out of Scope sections all reflect this. SCOPE LOCK applies — deviations require new LEAD review.',
  decomposition_consideration: 'Script flagged CONST-014 (13 scope items > threshold 8). LEAD verdict: keep monolithic for now — LOC estimate net -100 to +200, all changes are tightly coupled in src/components/stage17/gvos/. PLAN re-evaluates decomposition after firming up LOC. Candidate phases if decomposed: (i) persistence/migration, (ii) new VentureArtifactCapture, (iii) per-wireframe strip + gate, (iv) legacy retirement + consumer migration.',
  cascade_advisories_acknowledged: [
    'No venture_id linkage — acceptable; SD is platform-level not venture-specific.',
    'No vision_key linkage — closes a UX gap created by the SD-LEO-ORCH-S17-PER-WIREFRAME-001 program; could optionally link VISION-S17-DESIGN-MASTERY-L2-001 in PLAN.',
    'No 2026 strategic theme match — acceptable advisory; can be revisited at PLAN if a theme is identified.',
    'No OKR linkage — acceptable for refactor-type SDs.'
  ]
};

console.log('Reading current SD record...');
const { data: sd, error: selErr } = await sb
  .from('strategic_directives_v2')
  .select('id, sd_key, metadata, risks, key_changes')
  .eq('sd_key', sdKey)
  .single();

if (selErr) { console.error('SELECT FAILED:', selErr); process.exit(1); }

console.log('Current state:', {
  id: sd.id,
  sd_key: sd.sd_key,
  existing_risks: Array.isArray(sd.risks) ? sd.risks.length : 'not-array',
  existing_key_changes: Array.isArray(sd.key_changes) ? sd.key_changes.length : 'not-array'
});

const md = sd.metadata || {};
md.files_affected = files_affected;
md.scope_reduction_percentage = lead_decision.validation_answers.q8_deletion_audit.scope_reduction_percentage;
md.lead_decision = lead_decision;

const { data: upd, error: updErr } = await sb
  .from('strategic_directives_v2')
  .update({ risks, key_changes, metadata: md })
  .eq('sd_key', sdKey)
  .select('id, sd_key, risks, key_changes, metadata')
  .single();

if (updErr) { console.error('UPDATE FAILED:', updErr); process.exit(1); }

console.log('\nUPDATE OK:');
console.log({
  id: upd.id,
  risks_count: upd.risks?.length,
  key_changes_count: upd.key_changes?.length,
  files_affected_count: upd.metadata?.files_affected?.length,
  scope_reduction_pct: upd.metadata?.scope_reduction_percentage,
  lead_decision_verdict: upd.metadata?.lead_decision?.verdict
});
