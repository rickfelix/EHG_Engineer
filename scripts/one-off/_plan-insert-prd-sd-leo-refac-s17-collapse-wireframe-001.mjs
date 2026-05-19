// PLAN-phase PRD + user_stories insert for SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001
// All 18 LEAD-inherited PRD conditions resolved with explicit ADRs.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
const sdKey = 'SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001';
const sdUUID = '6a8cfcc0-75ef-4d17-9ae1-fdd11bb2fc10';
const prdId = `PRD-${sdKey}`;

const executive_summary = 'Refactor Stage 17 Blueprint Review UI: collapse N per-wireframe upload+approve flows into ONE venture-level artifact capture (file OR GitHub URL via Tabs) + ONE approval Switch. Persist to venture_artifacts (artifact_type=s17_approved, lifecycle_stage=17, metadata-only approval flag). Retire legacy per-screen pathway and sub-flag in same SD.';

const functional_requirements = [
  { id: 'FR-1', requirement: 'Per-wireframe sections render ONLY prompt (CopyableBlock JSON) + copy button + screen_name + role badge inside <Card>.', description: 'Remove upload slot, "Mark as approved" Switch, quality badge, fidelity badge. Keep <Card> structure (no flat <ul>). Add "Prompt N of M" counter at top of section for navigational scent.', priority: 'CRITICAL', acceptance_criteria: ['AC-5'] },
  { id: 'FR-2', requirement: 'Bottom-of-page VentureArtifactCapture component offers two mutually-exclusive input modes via shadcn Tabs: File Upload OR GitHub URL.', description: 'TabsList aria-label="Capture method". File mode accepts HTML/image/video/design_file, 25MB cap (reuse WireframeUploadSlot MIME logic). GitHub URL mode preserves full github_sync semantics (repo URL + branch + webhook subscription + commit-sha tracking).', priority: 'CRITICAL', acceptance_criteria: ['AC-1', 'AC-3'] },
  { id: 'FR-3', requirement: 'Venture-level "Mark as approved" Switch at bottom of S17 with full Radix-Switch a11y wiring.', description: 'Explicit <Label htmlFor> + aria-describedby pointing to helper text. Disabled IFF artifact-readiness state !== "ready". Consider sticky-bottom positioning OR top-of-page aria-live aggregate header for long-scroll skim affordance.', priority: 'CRITICAL', acceptance_criteria: ['AC-4', 'AC-6'] },
  { id: 'FR-4', requirement: 'Continue gate canContinueStage17 simplified — new signature (ventureApprovalFlag, artifactReadyState).', description: 'canContinue=true IFF venture-approval flag set AND (for github_sync) latest_commit_sha != null. Vacuous-true guard: reason="No artifact captured yet" when artifact missing. Disabled-Continue tooltip MUST include actionable guidance ("Capture and approve venture artifact at bottom of page").', priority: 'CRITICAL', acceptance_criteria: ['AC-4'] },
  { id: 'FR-5', requirement: 'Persistence: useVentureArtifactCapture mutation writes ONE row to venture_artifacts per (venture_id, artifact_type=s17_approved) with onConflict UPSERT (idempotent).', description: 'Row shape: venture_id, lifecycle_stage=17, artifact_type=s17_approved, is_current=true, metadata={ lovable_artifact: {...}, approval_status, readiness_state }. No screenId key in metadata (uses __no_screen__ sentinel in unique index). file_url for file mode; content for inline content; lovable_artifact JSONB for github_sync mode shape.', priority: 'CRITICAL', acceptance_criteria: ['AC-1', 'AC-2'] },
  { id: 'FR-6', requirement: 'Venture-level approval flag lives in venture_artifacts.metadata.approval_status (NOT a new column on ventures, NOT a separate table).', description: 'ADR: leverages existing is_current versioning; no schema migration for approval flag itself (only for retiring sub-flag); zero new RLS surface. useVentureApproval hook reads/writes metadata.approval_status.', priority: 'HIGH', acceptance_criteria: ['AC-1'] },
  { id: 'FR-7', requirement: 'Legacy retirement: WireframeArtifactCapture, WireframeUploadSlot, useCaptureArtifact (writer to absent table), sub-flag s17_per_wireframe_sections — all deleted in same SD.', description: 'Grep verification: 0 references in src/ tests/ after deletion. Sub-flag soft-retire via leo_feature_flags row update (is_enabled=false, lifecycle_state=retired). GvosS17Sections strips WireframeArtifactCapture mount.', priority: 'HIGH', acceptance_criteria: ['AC-7', 'AC-8'] },
  { id: 'FR-8', requirement: 'Downstream artifact-resolver cutover: resolveArtifact(ventureId) reads from venture_artifacts (NOT venture_gvos_profile.lovable_artifact).', description: 'Validation + RISK probes confirm zero production callers of resolveArtifact; cutover blast radius contained. TESTING dissented (recommended shadow-write) — PLAN picks cutover. Document in retrospective if any unexpected caller surfaces.', priority: 'HIGH', acceptance_criteria: ['AC-1'] },
  { id: 'FR-9', requirement: 'wireframe-fidelity scorer (src/lib/gvos/wireframe-fidelity.ts) retired in same SD — orphaned after refactor.', description: 'Grep verifies no remaining consumers. Removes computeFidelityScore, FidelityBadge, related types. Future fidelity work would be a new SD.', priority: 'MEDIUM', acceptance_criteria: ['AC-7'] }
];

const technical_requirements = [
  { id: 'TR-1', requirement: 'artifact_type literal = "s17_approved" (existing value in production venture_artifacts.artifact_type CHECK enum).', rationale: 'design_mockups (original plan candidate) NOT in production enum. s17_approved chosen for naming parity with existing S17 artifact types (s17_design_system, s17_blueprint, etc.). No ALTER CONSTRAINT migration needed.' },
  { id: 'TR-2', requirement: 'Venture-level row keys on (venture_id, lifecycle_stage=17, artifact_type="s17_approved", COALESCE(metadata->>"screenId", "__no_screen__")="__no_screen__") WHERE is_current=true.', rationale: 'Production unique index is wider than original plan claimed. Venture-level row works via __no_screen__ sentinel by NOT setting screenId in metadata. lifecycle_stage=17 is mandatory.' },
  { id: 'TR-3', requirement: 'Artifact-readiness state machine: { empty | pending_webhook | ready | error }. Switch enabled IFF state===ready. No pre-approve path.', rationale: 'github_sync mode has known "captured but not ready" window (webhook not yet fired → ArtifactNotReadyError). Prevents downstream ghost-approved state at Stage 18 boundary.' },
  { id: 'TR-4', requirement: 'Sub-flag retire: UPDATE leo_feature_flags SET is_enabled=false, lifecycle_state="retired" WHERE id="c37fac15-a8c4-4104-a98a-328b30263b6e". Migration applied via Supabase dashboard or direct pg post-merge (exec_sql RPC unavailable to service-role).', rationale: 'Sub-flag s17_per_wireframe_sections lives in leo_feature_flags (NOT feature_flags). Soft-retire preserves audit trail; row not deleted.' },
  { id: 'TR-5', requirement: 'GitHub token policy: Reuse existing GitHub PAT via process.env.GITHUB_TOKEN (server-side webhook subscription). UI does NOT prompt chairmen for tokens. Rate-limit cliff (60/hr unauthenticated → 5000/hr authenticated) avoided.', rationale: 'github_sync flow needs token for webhook subscribe + file-tree fetch. Per-chairman PAT prompts would degrade UX; service token is acceptable security trade-off.' }
];

const system_architecture = {
  overview: 'Single bottom-of-page VentureArtifactCapture component (Tabs: File / GitHub URL) writes one venture_artifacts row per (venture_id, artifact_type=s17_approved) with metadata.approval_status + metadata.readiness_state. WireframeSectionList renders prompt-only per-wireframe sections above; Continue gate reads venture-level approval + readiness states. resolveArtifact migrates to venture_artifacts.',
  components: [
    { name: 'VentureArtifactCapture', responsibility: 'Bottom-of-page UI offering File or GitHub URL capture; manages readiness state; provides approval Switch.', technology: 'React + shadcn (Tabs, Switch, Card) + TanStack Query mutation + Radix Switch with explicit Label htmlFor' },
    { name: 'useVentureArtifactCapture', responsibility: 'TanStack mutation hook; upserts venture_artifacts row keyed by (venture_id, artifact_type, screenId-sentinel); idempotent.', technology: 'TanStack Query useMutation + supabase-js upsert with onConflict' },
    { name: 'useVentureApproval', responsibility: 'Reads + writes venture_artifacts.metadata.approval_status for the current venture\'s s17_approved row.', technology: 'TanStack Query useQuery + useMutation; debounced writes' },
    { name: 'canContinueStage17 (simplified)', responsibility: 'Predicate gating Stage 17 Continue button; new signature (approvalFlag, readinessState).', technology: 'Pure TypeScript function in src/lib/gvos/stage17-gate.ts' },
    { name: 'WireframeSectionList (stripped)', responsibility: 'Renders per-wireframe sections as prompt + copy button + N-of-M counter only. No upload/approve/badges.', technology: 'React + shadcn Card' },
    { name: 'GvosS17Sections (rewired)', responsibility: 'Mounts ArchetypeDisplayPanel + ComposerPreviewPanel + WireframeSectionList + VentureArtifactCapture (NOT legacy WireframeArtifactCapture).', technology: 'React composition' },
    { name: 'artifact-resolver (cutover)', responsibility: 'resolveArtifact(ventureId) reads venture_artifacts (artifact_type=s17_approved, is_current=true) instead of venture_gvos_profile.lovable_artifact.', technology: 'TypeScript + supabase-js client' },
    { name: 'leo_feature_flags soft-retire migration', responsibility: 'UPDATE leo_feature_flags SET is_enabled=false, lifecycle_state=retired WHERE row=c37fac15-a8c4-4104-a98a-328b30263b6e.', technology: 'SQL migration in supabase/migrations/' }
  ],
  data_flow: 'Chairman opens S17 → WireframeSectionList renders prompt-only sections (read from existing wireframes artifact) → Chairman scrolls to bottom VentureArtifactCapture → selects File OR GitHub URL tab → uploads file OR pastes repo URL → useVentureArtifactCapture upserts venture_artifacts row with metadata.lovable_artifact + metadata.readiness_state=empty/pending_webhook → for github_sync, webhook fires asynchronously → updates metadata.latest_commit_sha + readiness_state=ready → Switch enables → Chairman toggles approval → useVentureApproval writes metadata.approval_status=approved → canContinueStage17 returns canContinue=true → Continue advances to S18 → downstream resolveArtifact reads venture_artifacts row for S19 prompt regen if needed.',
  integration_points: [
    'venture_artifacts table (shipped by SD-LEO-FEAT-S11-VENTURE-GVOS-001) — primary persistence',
    'leo_feature_flags table — sub-flag retire row',
    'GitHub API (webhook subscribe + REST file-tree fetch) — github_sync mode side effects',
    'TanStack Query cache — invalidate on mutation',
    'Stage 18 advance hook (canContinueStage17 consumer)',
    'resolveArtifact (downstream; cutover not shadow-write)'
  ]
};

const test_scenarios = [
  { id: 'TS-1', scenario: 'File upload happy path: chairman uploads HTML file, toggles approval, Continue enables, Stage 18 advances.', test_type: 'e2e', given: 'Venture mid-S17 with N>1 wireframes; sub-flag retired; venture_artifacts has no row for (venture_id, s17_approved)', when: 'Chairman selects File tab, picks valid HTML (<25MB), waits for upload preview, toggles "Mark as approved", clicks Continue', then: 'ONE venture_artifacts row exists with artifact_type=s17_approved, metadata.lovable_artifact.type=zip_upload, metadata.approval_status=approved, metadata.readiness_state=ready, is_current=true, lifecycle_stage=17. Page advances to S18.' },
  { id: 'TS-2', scenario: 'GitHub URL happy path: chairman pastes repo URL, webhook fires, Switch enables, approval succeeds.', test_type: 'e2e', given: 'Venture mid-S17; valid github.com repo URL; chairman session has venture access', when: 'Chairman selects GitHub URL tab, pastes "https://github.com/owner/repo", saves; webhook fires (mocked via direct supabase service-role update of latest_commit_sha)', then: 'Initial state: readiness_state=pending_webhook, Switch disabled. After webhook: readiness_state=ready, Switch enabled. Chairman toggles approval; metadata.approval_status=approved; Continue enables.' },
  { id: 'TS-3', scenario: 'Continue gate disabled tooltip surfaces actionable guidance.', test_type: 'unit', given: 'canContinueStage17 called with approvalFlag=null OR readinessState!==ready', when: 'Predicate evaluates', then: 'Returns { canContinue: false, reason: "Capture and approve venture artifact at bottom of page" (NOT "Venture not approved yet"). Tooltip in WireframeSectionList renders this reason.' },
  { id: 'TS-4', scenario: 'Reload persistence: after approval, refresh restores upload preview + Switch state + Continue enabled.', test_type: 'e2e', given: 'Venture has venture_artifacts row with metadata.approval_status=approved, readiness_state=ready', when: 'Chairman reloads S17 page', then: 'VentureArtifactCapture hydrates with the saved artifact preview; Switch is checked; Continue is enabled. No race condition between hydration and Switch render.' },
  { id: 'TS-5', scenario: 'Legacy components and sub-flag fully retired (compile-time check).', test_type: 'integration', given: 'Codebase post-implementation', when: 'grep -rn "WireframeArtifactCapture\\|WireframeUploadSlot\\|s17_per_wireframe_sections\\|useCaptureArtifact\\|wireframe-fidelity" src/ tests/', then: 'Returns 0 matches in src/. Tests are updated to import VentureArtifactCapture. leo_feature_flags row c37fac15-a8c4-4104-a98a-328b30263b6e has is_enabled=false, lifecycle_state=retired.' },
  { id: 'TS-6', scenario: 'Idempotent mutation: two consecutive captures for same (venture_id, artifact_type) result in ONE row (UPSERT, not INSERT).', test_type: 'integration', given: 'Existing venture_artifacts row for (venture_id, s17_approved, is_current=true)', when: 'useVentureArtifactCapture.mutateAsync invoked with new artifact for same venture_id', then: 'Same row id; metadata.lovable_artifact updated; metadata.approval_status preserved (or reset to pending — PRD-3 ADR documents which). No duplicate row created.' },
  { id: 'TS-7', scenario: 'Per-wireframe section a11y snapshot: prompt + copy button + name + role only, no other affordances.', test_type: 'unit', given: 'WireframeSectionList rendered with N=3 wireframes', when: 'Snapshot test inspects DOM', then: 'Each <Card> contains: CardTitle (screen_name), Badge (role), Pre-element (prompt), Copy Button. NO data-testid matching /wireframe-approve-|wireframe-fidelity-|wireframe-status-|wireframe-upload-/. "Prompt N of M" counter present.' },
  { id: 'TS-8', scenario: 'Switch a11y: htmlFor + aria-describedby properly associated.', test_type: 'unit', given: 'VentureArtifactCapture rendered', when: 'Test inspects Switch + Label DOM', then: '<Label htmlFor="venture-approve-switch"> wraps or precedes <Switch id="venture-approve-switch">; aria-describedby points to id of helper-text element. axe-core a11y check passes (no SR association warnings).' }
];

const acceptance_criteria = [
  'AC-1: Two mutually-exclusive input modes (File / GitHub URL); useVentureArtifactCapture writes exactly ONE venture_artifacts row per (venture_id, artifact_type=s17_approved) with lifecycle_stage=17 and no screenId in metadata.',
  'AC-2: useVentureArtifactCapture mutation is IDEMPOTENT — repeat calls UPSERT (no duplicates) with onConflict on the wider partial-unique index.',
  'AC-3: GitHub URL mode writes { type: github_sync, repo_url, branch: main, latest_commit_sha: null, webhook_subscribed_at: <iso> }; Continue disabled until latest_commit_sha is non-null (readiness_state=ready).',
  'AC-4: canContinueStage17 new signature (ventureApprovalFlag, artifactReadyState); canContinue=true IFF approvalFlag set AND readinessState===ready; vacuous-true guard returns reason="No artifact captured yet"; disabled tooltip = "Capture and approve venture artifact at bottom of page".',
  'AC-5: WireframeSectionList renders ONLY { prompt + CopyableBlock + screen_name + role Badge + "Prompt N of M" counter } inside <Card>. data-testids matching /wireframe-approve-|wireframe-fidelity-|wireframe-status-|wireframe-upload-/ are ABSENT (snapshot assertion).',
  'AC-6: Reload persistence — Playwright spec: upload → toggle approve → page.reload() → assert preview, Switch=checked, Continue=enabled.',
  'AC-7: Legacy deletion verified — WireframeArtifactCapture.tsx, WireframeUploadSlot.tsx, useCaptureArtifact.ts, wireframe-fidelity.ts git-removed; grep -rn returns 0 references in src/ tests/.',
  'AC-8: Sub-flag soft-retired via leo_feature_flags row update; no useFeatureFlag("s17_per_wireframe_sections", ...) call remains in src/; dormancy chain in GvosS17Sections collapses from 5 gates to 4.'
];

const risks = [
  { risk: 'artifact_type=s17_approved conflicts with existing usage of that enum value for a different artifact shape.', probability: 'MEDIUM', impact: 'HIGH', mitigation: 'Pre-EXEC: probe venture_artifacts WHERE artifact_type=s17_approved to confirm zero existing rows (or rows with compatible metadata shape). If rows exist, choose alternative like s17_blueprint_review or s17_design_capture.', rollback_plan: 'Update artifact_type literal and re-run idempotent UPSERT migration to relabel any test rows.' },
  { risk: 'github_sync webhook never fires (e.g., chairman pastes a private repo URL); chairman cannot approve.', probability: 'MEDIUM', impact: 'MEDIUM', mitigation: 'UI shows explicit "waiting on first commit / check repo permissions" state when readinessState=pending_webhook >5 minutes. Documented "switch to file upload" fallback path in tooltip.', rollback_plan: 'Chairman switches to File tab and uploads a ZIP/HTML directly. Switch enables. github_sync row remains as historical entry; new file-mode row supersedes (is_current=true).' },
  { risk: 'Cutover (not shadow-write) for resolveArtifact breaks an unexpected consumer that VALIDATION + RISK probes missed.', probability: 'LOW', impact: 'HIGH', mitigation: 'EXEC pre-flight: re-grep for resolveArtifact callers across both repos (EHG + EHG_Engineer). Document any new caller and migrate it in same PR. Capture baseline test snapshot before edits.', rollback_plan: 'Revert resolver to read venture_gvos_profile.lovable_artifact. Already-captured venture_artifacts rows remain; consumer reads fall through to legacy path until resolver re-fixed.' },
  { risk: 'Radix Switch a11y misconfiguration ships despite test — axe-core might miss it in CI.', probability: 'LOW', impact: 'MEDIUM', mitigation: 'Manual SR test in EXEC: VoiceOver / NVDA hits the Switch and announces label + state. axe-core unit test asserts the htmlFor + aria-describedby relationship.', rollback_plan: 'Post-merge: hot-fix PR adding the explicit Label htmlFor. Issue is presentational, not data-breaking.' },
  { risk: 'Sub-flag soft-retire migration requires Supabase dashboard apply (exec_sql RPC unavailable); ops step easily forgotten.', probability: 'MEDIUM', impact: 'LOW', mitigation: 'PR description includes explicit "post-merge step: apply migration via Supabase dashboard" checklist. Retrospective documents this for future sub-flag retires.', rollback_plan: 'Re-apply migration; sub-flag stays enabled until applied (legacy code path remains live, which is non-broken though deprecated).' }
];

const implementation_approach = {
  phases: [
    { phase: 'Phase 1: Persistence wiring', description: 'Author useVentureArtifactCapture mutation hook + useVentureApproval hook. UPSERT venture_artifacts with correct row shape (artifact_type=s17_approved, lifecycle_stage=17, no screenId). Vitest covers both hooks against a Supabase mock.', deliverables: ['src/hooks/gvos/useVentureArtifactCapture.ts', 'src/hooks/gvos/useVentureApproval.ts', 'tests/unit/hooks/useVentureArtifactCapture.test.ts'] },
    { phase: 'Phase 2: VentureArtifactCapture component', description: 'Build the bottom-of-page Tabs UI. File mode reuses WireframeUploadSlot MIME logic (extracted into shared util before deletion). GitHub URL mode reuses WireframeArtifactCapture buildArtifact logic. Implements artifact-readiness state machine.', deliverables: ['src/components/stage17/gvos/VentureArtifactCapture.tsx', 'src/lib/gvos/artifact-readiness.ts', 'tests/unit/components/VentureArtifactCapture.test.tsx'] },
    { phase: 'Phase 3: Wire into S17 + simplify gate', description: 'Strip WireframeSectionList to prompt-only sections. Update canContinueStage17 to new signature. Mount VentureArtifactCapture in GvosS17Sections. Update Stage17BlueprintReview composition.', deliverables: ['Updated WireframeSectionList.tsx', 'Updated stage17-gate.ts', 'Updated GvosS17Sections.tsx', 'Updated Stage17BlueprintReview.tsx'] },
    { phase: 'Phase 4: Legacy retirement', description: 'Delete WireframeArtifactCapture.tsx, WireframeUploadSlot.tsx, useCaptureArtifact.ts, wireframe-fidelity.ts. Update all importing tests. Cutover artifact-resolver to read venture_artifacts. Migration: soft-retire leo_feature_flags sub-flag row.', deliverables: ['Deleted: 4 components/hooks/utils', 'Updated: artifact-resolver.ts', 'supabase/migrations/<NNNN>_retire_s17_per_wireframe_sub_flag.sql'] },
    { phase: 'Phase 5: E2E + activation invariant + docs', description: 'Playwright e2e for file path + GitHub URL path. Replace activation_test_id (currently per-wireframe-activation-invariant.spec.ts → new venture-level spec). Capture baseline test snapshot before edits per PAT-RECURSION-001.', deliverables: ['tests/e2e/stage17/venture-level-approval.spec.ts', 'docs/baselines/SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001/baseline.json', 'Updated PRD.activation_test_id'] }
  ],
  technical_decisions: [
    'ADR PRD-1: artifact_type literal = s17_approved (existing CHECK enum value; no ALTER CONSTRAINT migration needed).',
    'ADR PRD-3: Venture-level approval flag lives in venture_artifacts.metadata.approval_status — no new column on ventures, no new table.',
    'ADR PRD-8: Cutover (not shadow-write) for artifact-resolver — empirically zero production callers; blast radius contained.',
    'ADR PRD-15: shadcn Tabs (not RadioGroup, not smart-detect input) for File / GitHub URL mutual exclusion.',
    'ADR PRD-14: Artifact-readiness state machine { empty | pending_webhook | ready | error } — Switch gated on state===ready. No pre-approve path.',
    'ADR PRD-9: WireframeArtifactCapture deletion removes inline_html mode entirely (LEAD scope-lock cut; venture_wireframe_artifact table absent on prod = no historical data to preserve).',
    'PR scope strategy: phases 1-5 ship as ONE PR (estimated net -100 to +200 LOC); per CONST-014 monolithic for now, re-evaluate decomposition only if LOC exceeds 400.'
  ]
};

const integration_operationalization = {
  consumers: [
    { name: 'Chairman (Solo Entrepreneur)', interaction: 'Uses S17 UI to upload OR paste GitHub URL, then approve venture wireframes as a whole.', frequency: 'Once per venture at Stage 17 (re-approval rare; only if wireframes regenerated).' },
    { name: 'Stage 18 advance hook (canContinueStage17 caller)', interaction: 'Reads predicate verdict; gates Continue button.', frequency: 'Reactive on every S17 render.' },
    { name: 'resolveArtifact (downstream — S19 if it materializes)', interaction: 'Reads venture_artifacts (artifact_type=s17_approved, is_current=true) for prompt regeneration or audit replay.', frequency: 'On-demand (zero current production callers; defensive interface only).' }
  ],
  dependencies: [
    { name: 'venture_artifacts table', type: 'upstream', contract: 'Shipped 2026-05-18 by SD-LEO-FEAT-S11-VENTURE-GVOS-001. Generic per-stage artifact store with partial-unique on (venture_id, lifecycle_stage, artifact_type, screenId-sentinel) WHERE is_current=true.', failure_handling: 'If RLS denies INSERT/UPDATE, fall through to error state in UI; chairman sees red-band error with retry button.' },
    { name: 'leo_feature_flags table', type: 'upstream', contract: 'Sub-flag s17_per_wireframe_sections row id c37fac15-a8c4-4104-a98a-328b30263b6e gets soft-retired (is_enabled=false, lifecycle_state=retired).', failure_handling: 'If migration apply fails, legacy code path remains live but unused (new code does not call useFeatureFlag for this flag); no runtime breakage.' },
    { name: 'GitHub API (REST + webhook)', type: 'downstream', contract: 'github_sync mode subscribes a webhook on push events and fetches file tree at latest_commit_sha. PAT via process.env.GITHUB_TOKEN (rate limit 5000/hr).', failure_handling: 'If webhook never fires (private repo, missing perms), UI surfaces "waiting on first commit" state >5 min with documented fallback to File mode. If GitHub API rate-limits, capture mutation succeeds but resolveArtifact fails with explicit "rate-limited" error.' }
  ],
  data_contracts: [
    { contract_name: 'venture_artifacts row shape (S17 venture-level)', schema: '{ venture_id: uuid, lifecycle_stage: 17, artifact_type: "s17_approved", title: string, is_current: true, metadata: { lovable_artifact: LovableArtifact, approval_status: "approved"|"pending", readiness_state: "empty"|"pending_webhook"|"ready"|"error", captured_at: iso, approved_at?: iso } }. NO screenId key in metadata.', validation: 'Zod schema in src/lib/gvos/venture-artifact-schema.ts (new); useVentureArtifactCapture validates input shape before upsert; DB CHECK constraint enforces artifact_type membership.', versioning: 'metadata schema versioned via metadata.schema_version (string semver). Migration to v2 = add new field with default; no breaking changes anticipated.' },
    { contract_name: 'LovableArtifact union (preserved from legacy)', schema: 'Existing TypeScript discriminated union: github_sync | zip_upload (file mode in new world; inline_html DROPPED). Shape matches src/lib/gvos/types.ts.', validation: 'Reuse resolveLovableArtifact validator; the file-mode discriminator handles HTML/image/video/design_file MIME categories via category field.', versioning: 'inline_html removal is breaking for any historical reader; production has 0 rows of that shape; safe.' }
  ],
  runtime_config: {
    environment_variables: ['GITHUB_TOKEN (server-side; reused for webhook subscribe + REST file-tree fetch)', 'SUPABASE_URL', 'SUPABASE_ANON_KEY (chairman session)'],
    feature_flags: ['s17_per_wireframe_sections (RETIRED in this SD; lifecycle_state=retired post-merge)', 's17_use_gvos_composer (UNCHANGED; gates the entire GVOS S17 surface — remains ON)'],
    deployment_considerations: 'Migration applied via Supabase dashboard SQL editor or direct pg post-merge (exec_sql RPC unavailable to service-role). PR description includes explicit post-merge checklist.'
  },
  observability_rollout: {
    monitoring: ['venture_artifacts upsert rate by artifact_type=s17_approved', 'Distribution of metadata.readiness_state (empty / pending_webhook / ready / error)', 'Time-to-ready for github_sync captures (webhook-fire latency)', 'Continue gate disabled-rate'],
    alerts: ['Alert if readiness_state=pending_webhook >15min on >5% of new captures (signals broken webhook plumbing)', 'Alert if RLS denies on useVentureArtifactCapture (signals chairman permission misconfiguration)', 'Alert on artifact_type=s17_approved row count drift vs Stage 17 advancement rate'],
    rollout_strategy: 'Single-PR deploy; sub-flag s17_per_wireframe_sections retired in same migration (no flag-flip period needed; legacy code paths removed in same PR).',
    rollback_trigger: 'Chairmen reporting inability to advance past S17 within first 24h post-deploy; resolveArtifact errors in S18/downstream observed.',
    rollback_procedure: 'Revert PR. Re-enable leo_feature_flags sub-flag row (set is_enabled=true, lifecycle_state=enabled). Pre-existing per-wireframe React-state UI returns. No data corruption: venture_artifacts rows remain queryable.'
  }
};

const exploration_summary = {
  files_read: [
    'src/components/stages/Stage17BlueprintReview.tsx (lines 450-590)',
    'src/components/stage17/gvos/WireframeSectionList.tsx (full)',
    'src/components/stage17/gvos/WireframeUploadSlot.tsx (full)',
    'src/components/stage17/gvos/WireframeArtifactCapture.tsx (full)',
    'src/components/stage17/gvos/GvosS17Sections.tsx (full)',
    'src/lib/gvos/stage17-gate.ts (full)',
    'src/lib/gvos/artifact-resolver.ts (partial — github_sync block + resolveArtifact + ArtifactNotReadyError)',
    'src/hooks/gvos/useCaptureArtifact.ts (full)',
    'supabase/migrations/20251210000001_create_venture_artifacts.sql (full — production CHECK enum probed separately by VALIDATION sub-agent)',
    'supabase/migrations/20260513_008_venture_wireframe_artifact_a_schema.sql (full — table not present on prod per VALIDATION probe)'
  ],
  patterns_identified: [
    'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001: pre-existing — useCaptureArtifact writes to absent venture_wireframe_artifact; resolveArtifact reads venture_gvos_profile.lovable_artifact (different table). This SD eliminates both legacy paths by collapsing onto venture_artifacts.',
    'shadcn Card + Tabs + Switch patterns established in EHG; reuse without designing new components.',
    'TanStack Query mutation + invalidateQueries pattern from useCaptureArtifact preserved (just changes target table).',
    'Idempotent UPSERT with onConflict-clause + partial-unique-index sentinel pattern from venture_artifacts shipping (SD-LEO-FEAT-S11-VENTURE-GVOS-001).',
    'Sub-flag dormancy-chain pattern in WireframeSectionList (5 gates) collapses to 4 after sub-flag retirement.',
    'github_sync webhook + commit-sha tracking + ArtifactNotReadyError state machine preserved whole-cloth.'
  ],
  key_decisions: [
    'Persistence target: venture_artifacts (venture-level, option B) over fan-out to per-screen rows. Reuses generic store; semantics match chairman mental model.',
    'artifact_type=s17_approved (existing production CHECK enum value) — avoids ALTER CONSTRAINT migration.',
    'Approval flag location: venture_artifacts.metadata.approval_status — no new column, no new table, no new RLS surface.',
    'Resolver migration: cutover (not shadow-write) — empirically zero production callers per VALIDATION + RISK probes.',
    'Sub-flag retire + legacy components delete in same SD — single-PR deploy minimizes risk window.',
    'Tabs UI for file/URL (per DESIGN agent COND-3) — not RadioGroup, not smart-detect.',
    'Artifact-readiness state machine gates Switch (per DESIGN agent COND-2) — no pre-approve path; prevents downstream ghost-approved state.',
    'Drop inline_html capture mode entirely — production venture_wireframe_artifact table absent; zero rows of that shape to preserve.'
  ],
  exploration_date: '2026-05-19T00:00:00.000Z'
};

const prdRow = {
  id: prdId,
  sd_id: sdUUID,
  title: 'PRD — S17 collapse wireframe approval to venture level',
  status: 'approved',
  executive_summary,
  functional_requirements,
  technical_requirements,
  system_architecture,
  acceptance_criteria,
  test_scenarios,
  risks,
  implementation_approach,
  metadata: {
    sd_key: sdKey,
    integration_operationalization,
    exploration_summary,
    activation_test_id: 'tests/e2e/stage17/venture-level-approval.spec.ts',
    smoke_test_cmd: 'cd C:/Users/rickf/Projects/_EHG/ehg && pnpm test -- tests/e2e/stage17/venture-level-approval.spec.ts',
    lead_prd_conditions_resolved: 18,
    plan_phase_completed_at: new Date().toISOString()
  }
};

console.log('Inserting PRD row...');
const { data: prdData, error: prdErr } = await sb
  .from('product_requirements_v2')
  .upsert(prdRow, { onConflict: 'id' })
  .select('id, sd_id, status, title')
  .single();

if (prdErr) { console.error('PRD INSERT FAILED:', prdErr); process.exit(1); }
console.log('PRD INSERT OK:', prdData);

// User stories — must include user_role/user_want/user_benefit triple + given_when_then
const userStories = [
  {
    sd_id: sdUUID,
    prd_id: prdId,
    story_key: `US-${sdKey}-001`,
    title: 'Chairman approves venture wireframes via file upload at S17 bottom',
    user_role: 'chairman (solo entrepreneur)',
    user_want: 'a single bottom-of-page artifact upload + approval Switch on Stage 17',
    user_benefit: 'I can mark the entire venture\'s wireframe set as approved with one decision instead of N',
    given_when_then: { given: 'I am viewing Stage 17 for my venture with multiple wireframes generated', when: 'I scroll to the bottom, switch to File tab, upload an HTML mockup, and toggle "Mark as approved"', then: 'My venture\'s wireframes are marked as approved (one row in venture_artifacts) and Continue advances me to Stage 18' },
    acceptance_criteria: ['File upload accepts HTML/image/video/design_file up to 25MB', 'Switch enables only when artifact-readiness state===ready', 'One venture_artifacts row written with artifact_type=s17_approved'],
    implementation_context: { phase: 'Phase 2 + 3', critical_path: 'CP1 — File upload', estimated_loc: 80, sd_key: sdKey }
  },
  {
    sd_id: sdUUID,
    prd_id: prdId,
    story_key: `US-${sdKey}-002`,
    title: 'Chairman approves venture wireframes via GitHub URL with webhook readiness',
    user_role: 'chairman (solo entrepreneur)',
    user_want: 'an alternative GitHub URL capture path that uses my Lovable repo with webhook sync',
    user_benefit: 'My wireframes stay in sync with what I push to Lovable, and approval reflects the live state',
    given_when_then: { given: 'I am viewing Stage 17; I have a Lovable github.com repo', when: 'I paste the repo URL in the GitHub URL tab and save', then: 'A row is captured with type=github_sync and webhook_subscribed_at; the Switch stays disabled until my first webhook push lands; then I can approve' },
    acceptance_criteria: ['GitHub URL validates github.com origin', 'Webhook subscription registered (webhook_subscribed_at set)', 'Switch disabled until latest_commit_sha non-null', 'UI surfaces "waiting on first commit" when readinessState=pending_webhook'],
    implementation_context: { phase: 'Phase 2 + 3', critical_path: 'CP2 — GitHub URL', estimated_loc: 60, sd_key: sdKey, side_effects: 'webhook subscribe; GitHub API rate limit' }
  },
  {
    sd_id: sdUUID,
    prd_id: prdId,
    story_key: `US-${sdKey}-003`,
    title: 'Chairman cannot advance Stage 17 without venture-level approval',
    user_role: 'chairman (solo entrepreneur)',
    user_want: 'the Continue button to be disabled with a clear reason until I have approved the venture artifact',
    user_benefit: 'I cannot accidentally advance past S17 with an unresolved artifact, and I know what action to take',
    given_when_then: { given: 'I am viewing Stage 17; no venture_artifacts row exists for my venture OR readinessState!==ready OR approvalFlag not set', when: 'I hover the disabled Continue button', then: 'Tooltip shows "Capture and approve venture artifact at bottom of page" (actionable guidance, not state-only)' },
    acceptance_criteria: ['canContinueStage17 returns canContinue=false in all 3 cases (no artifact / not ready / not approved)', 'reason field is the actionable guidance string', 'Tooltip renders this reason'],
    implementation_context: { phase: 'Phase 3', critical_path: 'CP3 — Continue gate', estimated_loc: 30, sd_key: sdKey }
  },
  {
    sd_id: sdUUID,
    prd_id: prdId,
    story_key: `US-${sdKey}-004`,
    title: 'Chairman sees stripped per-wireframe sections (prompt + copy only)',
    user_role: 'chairman (solo entrepreneur)',
    user_want: 'per-wireframe sections to focus on the prompt I can copy to Lovable, without redundant upload/approve controls',
    user_benefit: 'My Stage 17 page is less cluttered and the venture-level approval is the only decision to make',
    given_when_then: { given: 'I am viewing Stage 17 with N>1 wireframes', when: 'I inspect each per-wireframe section', then: 'Each section shows ONLY screen_name, role badge, prompt JSON (CopyableBlock), copy button, and "Prompt N of M" counter. No upload control, no Switch, no quality badge, no fidelity badge.' },
    acceptance_criteria: ['Snapshot test confirms section contents', 'data-testids matching /wireframe-approve-|wireframe-fidelity-|wireframe-status-|wireframe-upload-/ are ABSENT', 'Card structure preserved (no flat ul)', 'N-of-M counter visible'],
    implementation_context: { phase: 'Phase 3', critical_path: 'CP4 — Per-wireframe section', estimated_loc: 40, sd_key: sdKey }
  },
  {
    sd_id: sdUUID,
    prd_id: prdId,
    story_key: `US-${sdKey}-005`,
    title: 'Chairman reloads S17 page and finds their approval persisted',
    user_role: 'chairman (solo entrepreneur)',
    user_want: 'my upload + approval state to survive page reloads',
    user_benefit: 'I do not have to re-do work if I come back to the page later',
    given_when_then: { given: 'I uploaded an artifact and toggled approve; venture_artifacts row exists with metadata.approval_status=approved and readiness_state=ready', when: 'I refresh the S17 page', then: 'VentureArtifactCapture hydrates with the previous upload preview; Switch is checked; Continue is enabled' },
    acceptance_criteria: ['Playwright e2e: upload + approve + reload → UI restored', 'No race condition between hydration and Switch render (Switch waits for query.isSuccess before rendering)', 'No flash of un-approved state'],
    implementation_context: { phase: 'Phase 5', critical_path: 'CP5 — Reload persistence', estimated_loc: 20, sd_key: sdKey }
  },
  {
    sd_id: sdUUID,
    prd_id: prdId,
    story_key: `US-${sdKey}-006`,
    title: 'Developer can verify legacy components are fully retired',
    user_role: 'developer (or future reviewer)',
    user_want: 'confidence that the sub-flag fork and legacy components are completely removed, not just bypassed',
    user_benefit: 'Future S17 changes do not need to support two parallel UIs; cognitive load drops',
    given_when_then: { given: 'Codebase post-implementation', when: 'I grep for WireframeArtifactCapture, WireframeUploadSlot, useCaptureArtifact, s17_per_wireframe_sections, useFeatureFlag("s17_per_wireframe_sections")', then: 'Zero matches in src/ tests/. leo_feature_flags row c37fac15-a8c4-4104-a98a-328b30263b6e has is_enabled=false and lifecycle_state=retired.' },
    acceptance_criteria: ['grep verification', 'leo_feature_flags row state', 'GvosS17Sections dormancy chain has 4 gates (not 5)'],
    implementation_context: { phase: 'Phase 4', critical_path: 'Legacy retirement', estimated_loc: -300, sd_key: sdKey, note: 'NEGATIVE LOC — net deletion phase' }
  }
];

console.log(`Inserting ${userStories.length} user stories...`);
const { data: usData, error: usErr } = await sb
  .from('user_stories')
  .upsert(userStories, { onConflict: 'story_key' })
  .select('story_key, title');

if (usErr) { console.error('USER STORIES INSERT FAILED:', usErr); process.exit(1); }
console.log(`User stories INSERT OK: ${usData.length} rows`);
usData.forEach(s => console.log(`  ${s.story_key}: ${s.title}`));
