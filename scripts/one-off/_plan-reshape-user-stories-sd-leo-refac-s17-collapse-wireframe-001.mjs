// Reshape user_stories rows for SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001
// to match the validator's expected schema: given_when_then=[], with GWT
// objects embedded in acceptance_criteria[] entries.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
const sdUUID = '6a8cfcc0-75ef-4d17-9ae1-fdd11bb2fc10';
const prdId = 'PRD-SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001';
const sdKey = 'SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001';

const stories = [
  {
    story_key: `${sdKey}:US-001`,
    title: 'Chairman approves venture wireframes via file upload at S17 bottom',
    user_role: 'chairman (solo entrepreneur)',
    user_want: 'a single bottom-of-page artifact upload + approval Switch on Stage 17',
    user_benefit: 'I can mark the entire venture wireframe set as approved with one decision instead of N',
    given_when_then: [],
    acceptance_criteria: [
      { id: 'AC-1-1', scenario: 'File upload happy path writes one venture_artifacts row',
        given: 'A chairman session on Stage 17 with N>1 wireframes and no existing venture_artifacts row for (venture_id, artifact_type=s17_approved)',
        when: 'Chairman selects File tab in VentureArtifactCapture, picks a valid HTML mockup under 25MB, sees the preview, and toggles the Mark-as-approved Switch',
        then: 'Exactly ONE row exists in venture_artifacts WHERE venture_id=<this> AND artifact_type=s17_approved AND lifecycle_stage=17 AND is_current=true AND metadata->>approval_status=approved AND metadata->>readiness_state=ready; no screenId key present in metadata; Continue button enabled.' },
      { id: 'AC-1-2', scenario: 'File mode rejects files over 25MB',
        given: 'Chairman has a 26MB design_file selected in the file input',
        when: 'Chairman clicks Choose file and the WireframeUploadSlot-extracted MIME logic runs',
        then: 'UI shows error "File too large (26.0 MB > 25 MB limit)"; no venture_artifacts row written; useVentureArtifactCapture mutation never invoked; Switch remains disabled.' },
      { id: 'AC-1-3', scenario: 'File mode rejects unsupported MIME types',
        given: 'Chairman has a .pdf or .exe file selected',
        when: 'Chairman clicks Choose file',
        then: 'UI shows error "Unsupported file type: <mime>"; no venture_artifacts row written; Switch remains disabled.' }
    ],
    implementation_context: { phase: 'Phase 2 and 3', critical_path: 'CP1', sd_key: sdKey }
  },
  {
    story_key: `${sdKey}:US-002`,
    title: 'Chairman approves venture wireframes via GitHub URL with webhook readiness',
    user_role: 'chairman (solo entrepreneur)',
    user_want: 'an alternative GitHub URL capture path that uses my Lovable repo with webhook sync',
    user_benefit: 'My wireframes stay in sync with what I push to Lovable, and approval reflects the live state',
    given_when_then: [],
    acceptance_criteria: [
      { id: 'AC-2-1', scenario: 'GitHub URL capture writes row with pending_webhook readiness state',
        given: 'Chairman on Stage 17; venture has no existing s17_approved row',
        when: 'Chairman switches to GitHub URL tab, pastes https://github.com/owner/repo, leaves branch=main, clicks Save',
        then: 'A venture_artifacts row exists with metadata.lovable_artifact = { type: github_sync, repo_url: <pasted>, branch: main, latest_commit_sha: null, webhook_subscribed_at: <iso> } AND metadata.readiness_state=pending_webhook; Switch is rendered but disabled (aria-disabled=true).' },
      { id: 'AC-2-2', scenario: 'Webhook firing flips readiness to ready and enables Switch',
        given: 'venture_artifacts row exists with type=github_sync and metadata.readiness_state=pending_webhook',
        when: 'A direct supabase service-role UPDATE sets metadata.latest_commit_sha=<sha> AND metadata.readiness_state=ready (mocks the webhook handler in test)',
        then: 'After TanStack Query revalidation, the Switch becomes enabled (aria-disabled=false); chairman can toggle approval; metadata.approval_status updates to approved.' },
      { id: 'AC-2-3', scenario: 'Invalid GitHub URL is rejected before write',
        given: 'Chairman pastes https://gitlab.com/foo/bar (non-github)',
        when: 'Chairman clicks Save',
        then: 'buildArtifact throws "Repo URL must be a github.com URL"; UI shows error inline; no venture_artifacts row written; Switch disabled.' }
    ],
    implementation_context: { phase: 'Phase 2 and 3', critical_path: 'CP2', sd_key: sdKey, side_effects: 'webhook subscribe; GitHub rate limit' }
  },
  {
    story_key: `${sdKey}:US-003`,
    title: 'Chairman cannot advance Stage 17 without venture-level approval',
    user_role: 'chairman (solo entrepreneur)',
    user_want: 'the Continue button to be disabled with a clear reason until I have approved the venture artifact',
    user_benefit: 'I cannot accidentally advance past S17 with an unresolved artifact, and I know what action to take',
    given_when_then: [],
    acceptance_criteria: [
      { id: 'AC-3-1', scenario: 'No artifact captured — Continue disabled with actionable tooltip',
        given: 'Chairman on Stage 17; no venture_artifacts row exists for (venture_id, artifact_type=s17_approved)',
        when: 'Chairman hovers over the disabled Continue button',
        then: 'canContinueStage17(approvalFlag=null, readinessState=empty) returns { canContinue: false, reason: "Capture and approve venture artifact at bottom of page" }; tooltip renders that exact reason string verbatim.' },
      { id: 'AC-3-2', scenario: 'Artifact captured but not ready (pending_webhook) — Continue disabled',
        given: 'venture_artifacts row exists with metadata.readiness_state=pending_webhook AND metadata.approval_status missing',
        when: 'Chairman attempts to click Continue',
        then: 'canContinue=false; reason includes either webhook-pending language or the standard "Capture and approve venture artifact at bottom of page"; Stage 18 not reached; no state changes.' },
      { id: 'AC-3-3', scenario: 'Artifact ready but not approved — Continue disabled',
        given: 'venture_artifacts row exists with readiness_state=ready but approval_status != approved',
        when: 'Chairman hovers Continue',
        then: 'canContinue=false; reason="Capture and approve venture artifact at bottom of page"; click handler short-circuits; no advance.' }
    ],
    implementation_context: { phase: 'Phase 3', critical_path: 'CP3', sd_key: sdKey }
  },
  {
    story_key: `${sdKey}:US-004`,
    title: 'Chairman sees stripped per-wireframe sections (prompt + copy only)',
    user_role: 'chairman (solo entrepreneur)',
    user_want: 'per-wireframe sections to focus on the prompt I can copy to Lovable, without redundant upload/approve controls',
    user_benefit: 'My Stage 17 page is less cluttered and the venture-level approval is the only decision to make',
    given_when_then: [],
    acceptance_criteria: [
      { id: 'AC-4-1', scenario: 'Per-wireframe section renders prompt + copy + name + role + counter only',
        given: 'WireframeSectionList rendered with N=3 wireframes',
        when: 'Snapshot test inspects each section',
        then: 'Each section contains: CardHeader with screen_name (h2), role Badge, "Prompt N of M" counter (where M=3); CardContent with CopyableBlock (pre + button); NOTHING else. No Switch element, no Upload region, no Quality Badge, no Fidelity Badge.' },
      { id: 'AC-4-2', scenario: 'Per-wireframe section data-testids confirm removed controls absent',
        given: 'Rendered WireframeSectionList',
        when: 'Test queries by selector matching /wireframe-(approve|fidelity|status|upload)-/',
        then: 'document.querySelectorAll returns an empty NodeList; no DOM nodes match these patterns.' },
      { id: 'AC-4-3', scenario: 'Sticky aggregate header changes from X/N approved to single venture-level state',
        given: 'WireframeSectionList rendered',
        when: 'Test inspects the sticky header text',
        then: 'Header shows aria-live=polite text reflecting venture-level state (e.g., "Venture not approved" or "Venture approved") NOT the prior per-wireframe "X/N approved" counter.' }
    ],
    implementation_context: { phase: 'Phase 3', critical_path: 'CP4', sd_key: sdKey }
  },
  {
    story_key: `${sdKey}:US-005`,
    title: 'Chairman reloads S17 page and finds their approval persisted',
    user_role: 'chairman (solo entrepreneur)',
    user_want: 'my upload + approval state to survive page reloads',
    user_benefit: 'I do not have to re-do work if I come back to the page later',
    given_when_then: [],
    acceptance_criteria: [
      { id: 'AC-5-1', scenario: 'Reload restores upload preview, Switch state, and Continue enabled',
        given: 'venture_artifacts row exists for the current venture with metadata.approval_status=approved AND metadata.readiness_state=ready',
        when: 'Playwright spec calls page.reload() and waits for hydration (TanStack queries settled)',
        then: 'VentureArtifactCapture shows the artifact preview (filename + size + MIME for file mode OR repo URL for github_sync mode); Switch element has aria-checked=true; Continue button has aria-disabled=false; no visible flash of un-approved state during the hydration window.' },
      { id: 'AC-5-2', scenario: 'Switch render waits for query.isSuccess to prevent race condition',
        given: 'Initial page load with venture_artifacts query pending',
        when: 'Test inspects Switch render during the loading window (first 200ms after mount)',
        then: 'Switch is rendered in a deterministic loading state (skeleton OR not rendered at all) until useVentureApproval.isSuccess===true; the Switch never flickers from aria-checked=false to aria-checked=true after the query settles.' }
    ],
    implementation_context: { phase: 'Phase 5', critical_path: 'CP5', sd_key: sdKey }
  },
  {
    story_key: `${sdKey}:US-006`,
    title: 'Developer can verify legacy components are fully retired',
    user_role: 'developer (or future reviewer)',
    user_want: 'confidence that the sub-flag fork and legacy components are completely removed, not just bypassed',
    user_benefit: 'Future S17 changes do not need to support two parallel UIs; cognitive load drops',
    given_when_then: [],
    acceptance_criteria: [
      { id: 'AC-6-1', scenario: 'grep verification — legacy component identifiers absent from src/ and tests/',
        given: 'Codebase post-implementation at C:/Users/rickf/Projects/_EHG/ehg',
        when: 'CI runs: grep -rn -E "WireframeArtifactCapture|WireframeUploadSlot|useCaptureArtifact|wireframe-fidelity" src/ tests/',
        then: 'grep exits with code 1 (no matches found); a meta-test asserts the exit code is exactly 1, not 0.' },
      { id: 'AC-6-2', scenario: 'grep verification — sub-flag references absent from production code paths',
        given: 'Codebase post-implementation',
        when: 'CI runs: grep -rn "s17_per_wireframe_sections" src/ tests/',
        then: 'Returns ONLY occurrences inside .deprecated/ paths or comments explicitly tagged @retired-s17-per-wireframe; no live useFeatureFlag("s17_per_wireframe_sections", ...) call remains.' },
      { id: 'AC-6-3', scenario: 'leo_feature_flags row soft-retired correctly',
        given: 'Post-migration database state',
        when: 'Query: SELECT is_enabled, lifecycle_state FROM leo_feature_flags WHERE id=c37fac15-a8c4-4104-a98a-328b30263b6e',
        then: 'Returns exactly one row with is_enabled=false AND lifecycle_state=retired; the row is NOT deleted (audit trail preserved).' },
      { id: 'AC-6-4', scenario: 'GvosS17Sections dormancy chain collapses from 5 gates to 4',
        given: 'Post-refactor source of src/components/stage17/gvos/GvosS17Sections.tsx',
        when: 'Test reads the file content and counts the early-return gates (lines matching /^\\s*if \\(.+\\) return null;/)',
        then: 'Exactly 4 early-return gates exist (ventureId null / parent flag disabled / archetype query loading / archetype data missing); the 5th gate (perWireframeEnabled supersession check) is GONE; no useFeatureFlag("s17_per_wireframe_sections") import or call remains.' }
    ],
    implementation_context: { phase: 'Phase 4', critical_path: 'Legacy retirement', sd_key: sdKey }
  }
];

const rows = stories.map(s => ({ ...s, sd_id: sdUUID, prd_id: prdId }));

const { data, error } = await sb
  .from('user_stories')
  .upsert(rows, { onConflict: 'story_key' })
  .select('story_key, title');

if (error) { console.error('UPDATE FAILED:', error); process.exit(1); }

console.log(`Updated: ${data.length} stories`);
data.forEach(s => console.log(`  ${s.story_key}: ${s.title}`));
