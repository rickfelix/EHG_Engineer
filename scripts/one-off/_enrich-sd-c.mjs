// One-off: Enrich SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C with concrete content
// Replaces auto-generated boilerplate, grounded in validation-agent + risk-agent evidence.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '6696db72-d1b1-4a07-8281-3bd7eb922251';
const SD_KEY = 'SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C';

const enrichment = {
  rationale: 'Phase 1 (CLI Skill + Todoist 6-flow routing) and Phase 2 (Decision Log DB + Friday two-way integration) both shipped 2026-05-11 and are delivering ongoing chairman value (confirmed 2026-05-27, reopening Phase 3 from indefinite deferral). Phase 3 closes the loop on EVA Support\'s "chairman work surface" thesis: today EVA only sees Todoist tasks, so any chairman work routed through strategic_directives_v2 is invisible to the assistant. That partition forces the chairman to manually correlate Todoist subtasks (e.g., "Tier 1 Launch Infra") with the SDs that actually implement them. Phase 3 lets EVA cross-reference both surfaces while remaining strictly emit-only — EVA never authors an SD, only recommends one for chairman-approved manual execution via `/leo create`. CRO board 2026-04-27 flagged this expansion as materially higher blast radius than Phase 1/2 because EVA recommendations indirectly influence production code; that concern is the entire reason this SD ships behind testable invariants (no-write CI tests + feature-flag killswitch) rather than as best-effort guidance.',

  scope: [
    'IN-SCOPE:',
    '- New read-only reader for strategic_directives_v2 (lib/eva-support/sd-reader.js) with explicit column allowlist and status filter (draft, in_progress, active).',
    '- SD↔Todoist cross-reference via column extension of eva_todoist_intake.target_aspects to include sd_refs[] (no new join table).',
    '- SD blocker surfacing via lib/eva-support/sd-blocker-surface.js joining strategic_directives_v2 to sd_phase_handoffs.',
    '- Reply-envelope extension in .claude/commands/eva-support.md to surface "Related SDs:" prefix inside existing 6-flow output (no new 7th flow).',
    '- SD recommendation emitter (lib/eva-support/sd-recommendation-emitter.js) that outputs a copy-pasteable `/leo create …` command plus confidence score + counterfactual ("Why NOT to create"); writes decision-log row BEFORE rendering.',
    '- Shared lib/sd/active-sd-predicate.js consumed by EVA reader AND ≥1 existing consumer (mitigates 8th writer/consumer asymmetry witness).',
    '- Feature flag EVA_SD_READER_ENABLED (env var) with reader_disabled decision-log kind for fast blast-cut.',
    '- 3 CI tests enforcing emit-only contract: T1 static-import ban on child_process/execa/spawn in eva-support/**, T2 Supabase-write allowlist (only eva_support_decision_log + eva_todoist_intake + eva_support_research_cache), T3 ESLint no-restricted-imports.',
    '',
    'OUT-OF-SCOPE (explicit deletions — recorded in scope_reduction_percentage):',
    '- ANY write to strategic_directives_v2 from EVA Support code paths (auto-creation banned).',
    '- child_process / execa / spawn invocation of leo-create-sd.js (chairman runs the emitted command manually).',
    '- New SD↔subtask join table (column-extension only; revisit if usage demands).',
    '- New 7th EVA sub-flow (extend existing 6-flow reply envelope).',
    '- Re-implementation of leo-create-sd preflight scoring (reuse via dup-candidate links).',
    '- Real-time push notifications of SD changes (chairman-pull via EVA invocation only).',
    '- Dynamic RLS policy retrofit (single-reader-module design + write-allowlist test cover the same ground at lower cost).',
  ].join('\n'),

  strategic_objectives: [
    'Unify chairman work surface: EVA Support sees open strategic_directives_v2 SDs alongside Todoist tasks in the same conversational context.',
    'Surface SD blockers proactively so chairman can act on the most impactful unblocking work without manual dependency-chain inspection.',
    'Enable EVA to recommend SD creation with an explicit chairman-approval gate — no auto-actioning, no fire-and-forget, every recommendation logged whether approved or declined.',
    'Establish CI-enforced invariants that prevent EVA from gaining a production-code write path through future drift (3 hard tests + CODEOWNERS).',
    'Validate that Phase 2 (decision log + Friday integration) value-proof is sustained by tracking how often chairman engages with EVA SD recommendations.',
  ],

  success_criteria: [
    { criterion: 'Chairman invokes EVA Support in a Todoist-task context and sees a "Related SDs:" prefix listing draft/in-progress SDs matching the task subject (no new flow). At least one positive match observed in first chairman use after ship.', measure: 'Manual smoke test step 1 (chairman + 1 EVA invocation) + decision-log query showing kind=sd_recommendation row.' },
    { criterion: 'Chairman queries EVA "anything blocked?" and EVA returns ≥1 SD with open dependency chain context (SD ID + blocker reason + parent SD if applicable).', measure: 'Manual smoke test step 2 + sd_phase_handoffs join verified in sd-blocker-surface.js unit test.' },
    { criterion: 'EVA SD recommendation emits a `/leo create …` command preview, confidence score (0-100), and counterfactual reason NOT to create. Chairman must type Override: <reason ≥12 chars> to approve; declining (or no override) writes a decline row to eva_support_decision_log.', measure: 'Smoke test step 3 + decision-log row count check (1 row per approve OR decline).' },
    { criterion: 'Every SD-related recommendation outcome (approve, decline, declined-by-default) appears in eva_support_decision_log with kind=sd_recommendation. Zero recommendations missing from log.', measure: 'CI test asserts log-row count == emitter invocation count over a fixture window.' },
    { criterion: 'Setting EVA_SD_READER_ENABLED=false silently disables SD reader. Reply envelope contains no SD content; one decision-log row with kind=reader_disabled is written.', measure: 'Smoke test step 4 + env-flag CI test.' },
    { criterion: 'CI tests T1 (no child_process import in eva-support/**), T2 (Supabase write allowlist), T3 (ESLint no-restricted-imports) all pass on every PR touching eva-support code. PR is blocked if any of T1/T2/T3 fails.', measure: 'GitHub Actions status check; tests live under test/eva-support/invariants/*.test.ts.' },
  ],

  success_metrics: [
    { metric: 'Recommendation precision (Phase 3 OKR proxy)', target: '≥70% chairman approval rate on EVA SD recommendations within first 30 days post-launch.' },
    { metric: 'Zero unauthorized writes', target: '0 inserts to strategic_directives_v2 from any eva-support code path (CI-enforced; measured by T2 supabase-write-allowlist test on every PR).' },
    { metric: 'Decision-log coverage', target: '100% of SD-recommendation outcomes (approve + decline + reader_disabled) logged to eva_support_decision_log.' },
    { metric: 'Cross-ref accuracy (chairman-sampled)', target: '≥80% of subtask→SD cross-references confirmed by chairman during first 50 EVA-Support invocations involving SD cross-ref.' },
    { metric: 'Time-to-blast-cut', target: '≤60 seconds from chairman decision to disable feature (set EVA_SD_READER_ENABLED=false, reload session).' },
  ],

  key_changes: [
    { change: 'Add lib/eva-support/sd-reader.js — read-only strategic_directives_v2 access with column allowlist (sd_key, title, status, current_phase, target_application, priority, progress) and status filter (draft, in_progress, active).', impact: 'Single reader module = 1-file RLS retrofit if needed later.' },
    { change: 'Extend eva_todoist_intake.target_aspects JSONB to include sd_refs[] (column-extension, no new table); each entry shape: { sd_id, source, confidence, evidence_substring, status? }.', impact: 'Mitigates R5 false-correlation by surfacing the evidence chairman can verify; no schema migration required because column is already JSONB.' },
    { change: 'Add lib/eva-support/sd-blocker-surface.js — joins strategic_directives_v2 to sd_phase_handoffs to detect SDs whose handoff status indicates blockage; surfaces "blocker reason" string for the reply envelope.', impact: 'Chairman gets actionable blocker context without manual dependency-tree traversal.' },
    { change: 'Extend .claude/commands/eva-support.md reply-envelope to prefix "Related SDs:" with cross-ref + blocker context; no new sub-flow added (reuses 6-flow dispatcher).', impact: 'Zero new UI surface to learn; chairman sees SDs in the same conversational frame as Todoist tasks.' },
    { change: 'Add lib/eva-support/sd-recommendation-emitter.js — outputs copy-pasteable `/leo create …` command + confidence score + counterfactual; writes eva_support_decision_log row BEFORE render; tags recommendation_metadata so resulting SD can be linked back via metadata.eva_recommended_at + eva_invocation_id + eva_confidence.', impact: 'Chairman must take an explicit copy-paste action; EVA never invokes /leo create directly. Approve/decline both logged.' },
    { change: 'Add lib/sd/active-sd-predicate.js — shared "active SD" filter; consumed by EVA reader AND retrofitted into ≥1 existing consumer (resolve-feedback.js OR generate-retrospective.js); parity test asserts identical row sets.', impact: 'Mitigates R6 — prevents 8th witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (shared predicate = no asymmetry by construction).' },
    { change: 'Add EVA_SD_READER_ENABLED env-var feature flag; when false, sd-reader returns [] and writes one decision-log row kind=reader_disabled per invocation; runbook documents 1-line revert.', impact: 'Chairman can cut blast in <60s without code change or deploy.' },
    { change: 'Add 3 invariant CI tests under test/eva-support/invariants/: T1 static-import ban (child_process, execa, spawn, exec) in scripts/eva-support/** and lib/eva-support/**; T2 supabase-write allowlist (only eva_support_decision_log, eva_todoist_intake, eva_support_research_cache); T3 ESLint no-restricted-imports rule + CODEOWNERS for eva-support paths.', impact: 'Mitigates R4 (drift to write path, highest score 9). Tests MUST pass before EXEC handoff.' },
  ],

  key_principles: [
    'Emit-only contract: EVA Support never writes to strategic_directives_v2 and never invokes leo-create-sd.js via child_process. Chairman runs the emitted command manually.',
    'Test-enforced invariants over best-effort guidance: 3 CI tests + CODEOWNERS + ESLint rule make the emit-only contract literally unfailable via accidental drift.',
    'Chairman approval mandatory: every SD recommendation requires override_reason ≥12 chars (high-friction approval); decline is at least as prominent as approve in the recommendation UI.',
    'Audit trail by default: every recommendation outcome (approve/decline/reader_disabled) is logged to eva_support_decision_log BEFORE rendering to the chairman.',
    'Reuse Phase 2 envelope and schemas: decision-log + Override-token contract carry forward; cross-ref uses column-extension (no new tables) until usage warrants.',
  ],

  risks: [
    { risk: 'R1: EVA recommends an SD that should NOT be created (false positive recommendation).', likelihood: 'medium', impact: 'medium', mitigation: 'Confidence score 0-100 surfaced on every recommendation; top-3 dup-candidate links from leo-create-sd preflight; "REVIEW" label when confidence<70 or dup≥1; Decline action ≥ Approve action in UI prominence.' },
    { risk: 'R2: Chairman rubber-stamps a bad recommendation due to framing bias.', likelihood: 'medium', impact: 'high', mitigation: '"Why NOT to create" counterfactual surfaced equally with approve path; chairman must type override_reason ≥12 chars (friction); resulting SD tagged metadata.eva_recommended_at + eva_invocation_id + eva_confidence; decision-log row written BEFORE render capturing approve AND decline outcomes.' },
    { risk: 'R3: RLS leak on the new strategic_directives_v2 reader (EVA sees data chairman should not see).', likelihood: 'low', impact: 'medium', mitigation: 'Explicit SELECT column allowlist (never SELECT *); filter status IN (draft, in_progress, active) AND target_application matches chairman context; single reader module (lib/eva-support/sd-reader.js) = 1-file RLS retrofit point. DATABASE sub-agent reviews at PLAN per validation warning NEW_SD_READER_PATH.' },
    { risk: 'R4: EVA accidentally gains a write path in a future change (emit-only drift).', likelihood: 'medium', impact: 'critical', mitigation: '3 CI tests (T1 static-import ban, T2 supabase-write allowlist, T3 ESLint no-restricted-imports) + CODEOWNERS gating PRs touching scripts/eva-support/** + lib/eva-support/**. All 3 tests must pass before EXEC handoff.' },
    { risk: 'R5: Cross-ref maps a subtask to the wrong SD (false correlation); chairman acts on wrong context.', likelihood: 'medium', impact: 'medium', mitigation: 'sd_refs[] entries carry evidence_substring; UI shows evidence to chairman; chairman can set status=rejected (decision-log row); NEVER auto-collapse multi-ref to a primary; e2e test asserts no-auto-primary behavior.' },
    { risk: 'R6: 8th writer/consumer asymmetry witness — new SD reader diverges from existing active-SD readers.', likelihood: 'low', impact: 'medium', mitigation: 'Mandate lib/sd/active-sd-predicate.js shared by EVA reader AND ≥1 existing consumer (resolve-feedback.js or generate-retrospective.js); parity test asserts identical row sets across both call sites.' },
    { risk: 'R7: No kill-switch — cannot cut blast quickly if a defect surfaces in production.', likelihood: 'low', impact: 'high', mitigation: 'Feature flag EVA_SD_READER_ENABLED; when false, reader returns [] + writes decision-log kind=reader_disabled. Runbook documents 1-line revert (env var flip). Time-to-blast-cut ≤60s.' },
  ],

  smoke_test_steps: [
    {
      step_number: 1,
      instruction: 'In a chairman session with EVA_SD_READER_ENABLED=true, invoke EVA Support in the context of a Todoist task whose subject matches a draft/in-progress SD (e.g., a "Tier 1 Launch Infra" task and an in-progress Stripe-integration SD).',
      expected_outcome: 'Reply envelope shows existing 6-flow content PLUS a "Related SDs:" prefix listing the matching SD with sd_key, title, status badge, and progress %. One eva_support_decision_log row with kind=sd_recommendation is written.',
    },
    {
      step_number: 2,
      instruction: 'Ask EVA Support "anything blocked?" within the same chairman session.',
      expected_outcome: 'EVA responds with ≥1 SD that has open dependency chain context (SD ID + blocker reason + parent SD if applicable). Decision-log entry references which sd-blocker-surface query produced the result.',
    },
    {
      step_number: 3,
      instruction: 'Ask EVA "what should I build to unblock X?" where X is one of the surfaced SDs. EVA emits a `/leo create …` command preview with confidence + counterfactual. Type `Override: <reason at least 12 chars>` to approve.',
      expected_outcome: 'Decision-log row kind=sd_recommendation with outcome=approved + override_reason captured. Chairman copies the emitted command and runs it manually in a separate prompt. NO child_process invocation or DB write happens inside EVA Support during this step.',
    },
    {
      step_number: 4,
      instruction: 'Set EVA_SD_READER_ENABLED=false in the environment; invoke EVA Support in the same Todoist context.',
      expected_outcome: 'Reply envelope contains the standard 6-flow content with NO "Related SDs:" prefix. Exactly one eva_support_decision_log row with kind=reader_disabled is written for the invocation. Reverting the env flag restores SD surfacing.',
    },
  ],

  scope_reduction_percentage: 28,
};

// Update SD
const { error } = await supabase
  .from('strategic_directives_v2')
  .update(enrichment)
  .eq('id', SD_ID);

if (error) {
  console.error('UPDATE FAILED:', error.message);
  process.exit(1);
}

// Verify by selecting back
const { data: verify } = await supabase
  .from('strategic_directives_v2')
  .select('sd_key, scope_reduction_percentage, strategic_objectives, success_criteria, key_changes, risks, smoke_test_steps')
  .eq('id', SD_ID).single();

console.log('=== ENRICHMENT APPLIED ===');
console.log('sd_key:', verify.sd_key);
console.log('scope_reduction_percentage:', verify.scope_reduction_percentage);
console.log('strategic_objectives count:', verify.strategic_objectives.length);
console.log('success_criteria count:', verify.success_criteria.length);
console.log('key_changes count:', verify.key_changes.length);
console.log('risks count:', verify.risks.length);
console.log('smoke_test_steps count:', verify.smoke_test_steps.length);
console.log('first risk:', verify.risks[0]?.risk?.slice(0, 80));
console.log('first smoke step instruction:', verify.smoke_test_steps[0]?.instruction?.slice(0, 80));
