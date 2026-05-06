#!/usr/bin/env node
/**
 * Write design-agent prospective evidence row for SD-LEO-FEAT-STAGE-REJECT-KILL-001
 * PLAN_DESIGN phase. Evaluates UX/A11y feasibility of FR-5 Reject button on Stage 23.
 *
 * Component target: ehg/src/components/chairman-v3/gates/Stage23Renderer.tsx
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SD_ID = '5474573f-3fd9-43e5-8c9e-4584a0cedfdc';
const SD_KEY = 'SD-LEO-FEAT-STAGE-REJECT-KILL-001';

const detailedAnalysis = {
  scope: {
    component_target: 'ehg/src/components/chairman-v3/gates/Stage23Renderer.tsx',
    current_loc: 171,
    estimated_post_change_loc: 380, // adds ~210 LOC: dialog state, role gate, cooldown timer, mutation hook, error inline
    sweet_spot_band: '300-600 LOC OPTIMAL',
    cross_repo: true,
    repo_for_ui: 'rickfelix/ehg',
    repo_for_db_rpc: 'rickfelix/EHG_Engineer (SD home)',
  },
  pattern_match: {
    existing_alert_dialog_in_chairman_v3: false,
    existing_dialog_uses: 0,
    note: 'First AlertDialog introduction in chairman-v3. Sets pattern for future destructive actions (e.g., venture archive, force-promote).',
  },
  shadcn_primitive_audit: {
    alert_dialog_available: true,
    radix_root: true,
    has_focus_trap: 'YES — Radix AlertDialog.Content auto-traps focus and restores on close',
    has_role_alertdialog: 'YES — Radix sets role="alertdialog" intrinsically',
    has_aria_labelledby: 'YES — AlertDialogTitle auto-wires aria-labelledby on Content',
    has_aria_describedby: 'YES — AlertDialogDescription auto-wires aria-describedby',
    has_escape_close: 'YES — Radix default; closes WITHOUT firing Action (does not confirm)',
    cancel_button: 'AlertDialogCancel renders as outline variant by default; can override className',
    action_button: 'AlertDialogAction renders default buttonVariants; we override className to "destructive" + add icon',
    sufficient_for_requirements: true,
  },
  ux_design_assessment: {
    typed_match_pattern: {
      verdict: 'WELL_ESTABLISHED',
      precedent: 'GitHub repo deletion, Stripe production-mode toggles, Vercel env-var purge',
      case_sensitivity: 'REQUIRED per PRD — case-sensitive REJECT match prevents accidental keyboard autocomplete bypass',
      a11y_consideration: 'Input must have visible Label (e.g., "Type REJECT to confirm") wired via htmlFor — NOT placeholder-only',
    },
    cooldown_timer: {
      verdict: 'JUSTIFIED for kill-venture severity',
      ux_risk: 'MEDIUM — 5s reset-on-keystroke can frustrate; risk of user typing rationale, then waiting 5s for button to enable, perceived as "stuck"',
      mitigation_required: [
        'Visible countdown (e.g., "Confirm available in 3s…") with aria-live="polite" so SR users hear remaining time',
        'aria-live region MUST be debounced — announcing every second is hostile to screen readers; announce only at start, halfway (≈3s), and 0s (enabled)',
        'Disabled Confirm button MUST have aria-disabled="true" AND keep tabindex (do not vanish) so SR users discover it exists',
      ],
      alternative_considered: 'Single 5s cooldown after dialog opens (no reset on keystroke). REJECTED because PRD spec says reset-on-keystroke; rationale: prevents "type fast, slam confirm" muscle memory.',
    },
    destructive_styling: {
      red_button_variant: 'shadcn buttonVariants({ variant: "destructive" }) → bg-destructive text-destructive-foreground. WCAG AA contrast verified by shadcn defaults.',
      icon_choice: 'AlertOctagon preferred over AlertTriangle for kill action — octagon = stop semantic; triangle = warning. Both lucide-react. Per PRD either acceptable.',
      decorative_icon: 'aria-hidden="true" on icon, since button text "Reject Venture" carries semantic meaning',
    },
    role_visibility: {
      ux_gap_in_prd: 'PRD says "Reject button visible on Stage 23 for chairman/lead role" but useCurrentUser does NOT return role. NEED a role hook (e.g., useUserRole) OR derive role from a profiles/user_roles table.',
      recommendation: 'Add helper hook or extend useCurrentUser to fetch role from user_roles/profiles in same query. OPTION B: render Reject button always, let RPC return 403 — but THIS LEAKS button visibility to non-chairmen, violating PRD spec FR-5 first bullet. OPTION A required.',
      defense_in_depth: 'Even if button hidden client-side, RPC kill_venture MUST enforce role server-side (RLS or SECURITY DEFINER + role check). Client-side is UX, not security.',
    },
  },
  accessibility_audit: {
    wcag_2_1_aa: {
      role_alertdialog: { status: 'PASS', source: 'Radix intrinsic' },
      aria_labelledby: { status: 'PASS', source: 'AlertDialogTitle auto-wire' },
      aria_describedby: { status: 'PASS', source: 'AlertDialogDescription auto-wire' },
      focus_trap: { status: 'PASS', source: 'Radix intrinsic' },
      escape_closes_without_confirm: { status: 'PASS', source: 'Radix default close fires onOpenChange(false), not onAction' },
      initial_focus: { status: 'NEEDS_DESIGN_DECISION', detail: 'Default = Cancel button. RECOMMEND: explicit autoFocus on Cancel via ref (not REJECT input) — "safe by default". Otherwise SR users land on a dangerous text input first.' },
      contrast_red_button: { status: 'PASS', source: 'shadcn destructive variant ≥4.5:1' },
      label_for_inputs: { status: 'CRITICAL', detail: 'Both REJECT input and rationale Textarea MUST have visible <Label htmlFor>. Placeholder-only inputs FAIL WCAG 2.1 SC 1.3.1, 3.3.2.' },
      cooldown_announcement: { status: 'CRITICAL', detail: 'Cooldown countdown MUST be in aria-live="polite" with debounced announces (start, halfway, ready). Per-second updates = hostile to SR.' },
      disabled_confirm_discoverability: { status: 'CRITICAL', detail: 'Use aria-disabled="true" not disabled attribute; keep button focusable. Otherwise SR Tab order skips it and user cannot discover the cooldown UX.' },
      error_inline_announce: { status: 'REQUIRED', detail: '403 inline error MUST be in role="alert" or aria-live="assertive" so SR users hear "Only chairman or lead can reject a venture" without re-tabbing.' },
      keyboard_only_flow: { status: 'PASS_DESIGN', detail: 'Tab: Cancel → REJECT input → rationale → Confirm. Enter on Confirm submits. Escape cancels.' },
    },
  },
  prd_spec_gaps_identified: [
    {
      gap: 'Role retrieval mechanism unspecified',
      severity: 'HIGH',
      recommendation: 'Amend PRD FR-5 to specify: useUserRole() helper hook OR extension of useCurrentUser to attach role from user_roles/profiles table. Without this, EXEC has to guess.',
    },
    {
      gap: 'Cooldown countdown UX not specified (visible counter? aria-live cadence?)',
      severity: 'MEDIUM',
      recommendation: 'Amend PRD FR-5 to specify: visible "Confirm available in Ns…" counter; aria-live="polite" with debounced announce schedule (e.g., at t=5s, t=3s, t=0s).',
    },
    {
      gap: 'Initial focus target inside dialog not specified',
      severity: 'MEDIUM',
      recommendation: 'Amend PRD FR-5 to specify: initial focus on Cancel button (safe default), NOT REJECT input. Reduces accidental confirm-key-press risk.',
    },
    {
      gap: 'Disabled-button semantics (disabled vs aria-disabled)',
      severity: 'MEDIUM',
      recommendation: 'Amend PRD FR-5: use aria-disabled (not disabled attr) so SR users can Tab to it and hear cooldown countdown.',
    },
    {
      gap: 'Inline 403 error a11y semantics not specified',
      severity: 'MEDIUM',
      recommendation: 'Amend PRD FR-5: 403 message in role="alert" container so it auto-announces.',
    },
    {
      gap: 'Toast on success/failure not specified (consistent with useDecisionMutations sonner pattern)',
      severity: 'LOW',
      recommendation: 'Amend PRD FR-5: on kill_venture success, fire sonner toast.success("Venture rejected"); on RPC error, toast.error(error.message). Aligns with existing useDecisionMutations precedent.',
    },
    {
      gap: 'Button visible only when stage===23 vs always-on for kill_gate stages (3,5,13,23)',
      severity: 'CLARIFICATION',
      recommendation: 'PRD currently scopes to Stage 23 only. CONFIRM intent: should Reject button appear on Stages 3/5/13 KillGateRenderer too, or is this Stage-23-exclusive (post-launch operational kill, distinct from early-cycle pivot decisions)? Currently scoped Stage 23 only — ACCEPTABLE if intentional.',
    },
  ],
  ux_risks: [
    {
      risk: 'Component bloat',
      detail: 'Stage23Renderer goes from 171 → ~380 LOC. Still in optimal band. RECOMMENDATION: extract dialog into separate <RejectVentureDialog> sub-component (~180 LOC) so Stage23Renderer stays presentation-focused. Improves testability (dialog can be unit-tested in isolation).',
      severity: 'LOW',
    },
    {
      risk: 'Cooldown UX frustration',
      detail: 'Reset-on-keystroke means user typing 25-char rationale will keep restarting the 5s timer. By the time they stop typing, they wait 5s for button to enable. Perceived latency = ~5s after final keystroke. ACCEPTABLE for kill-venture severity.',
      severity: 'LOW',
      mitigation: 'Visible countdown surfaces the wait so user understands.',
    },
    {
      risk: 'Mobile touch targets',
      detail: 'AlertDialog on mobile: ensure Confirm button hits ≥44x44px. shadcn default button h-10 = 40px on tight mobile. RECOMMEND: add size="lg" or className="h-12" to Confirm button for touch-friendly tap target.',
      severity: 'LOW',
    },
    {
      risk: 'Race condition: kill_venture RPC slow → user double-clicks',
      detail: 'After cooldown completes and user clicks Confirm, network round-trip. Need optimistic disable on click + spinner inside button.',
      severity: 'MEDIUM',
      mitigation: 'Use TanStack mutation isPending flag; disable button + show <Loader2 className="animate-spin"> while in-flight.',
    },
    {
      risk: 'Dialog dismissal during in-flight RPC',
      detail: 'User hits Escape mid-RPC: dialog closes but mutation continues. Next time dialog reopens, state is stale (REJECT input prefilled? cooldown reset?). RECOMMEND: reset dialog state on each open via useEffect on `open` flag.',
      severity: 'MEDIUM',
    },
  ],
  recommendations: {
    component_architecture: [
      'Extract RejectVentureDialog as separate file: ehg/src/components/chairman-v3/gates/RejectVentureDialog.tsx (~180 LOC)',
      'Keep Stage23Renderer.tsx in 171→~250 LOC band (just adds the trigger button + role-gate + dialog mount)',
      'Add useKillVenture mutation hook in ehg/src/hooks/chairman-v3/useDecisionMutations.ts (or new useVentureMutations.ts) following existing reject pattern',
      'Add useUserRole hook (or extend useCurrentUser) for role retrieval',
    ],
    a11y_must_have: [
      'visible <Label htmlFor> on REJECT input AND rationale textarea',
      'autoFocus on Cancel button (not REJECT input) — safe-by-default focus',
      'aria-disabled (not disabled) on Confirm button during cooldown',
      'aria-live="polite" cooldown countdown with debounced cadence (t=5s, t=3s, t=0s)',
      'role="alert" container for 403 inline error',
      'aria-hidden="true" on AlertOctagon icon (decorative)',
      'min h-12 (48px) Confirm button for mobile touch target',
    ],
    testing_pattern: [
      'data-testid="stage23-reject-button" on trigger button',
      'data-testid="reject-confirmation-dialog" on AlertDialogContent',
      'data-testid="reject-typed-input" on REJECT match input',
      'data-testid="reject-rationale-textarea" on rationale textarea',
      'data-testid="reject-confirm-button" on destructive Confirm button',
      'data-testid="reject-error-inline" on 403 error region',
      'E2E test: type "REJECT", type 20-char rationale, wait 5s, click Confirm → assert kill_venture RPC called',
      'E2E test: type "REJECT", type 19-char rationale → assert Confirm stays aria-disabled',
      'E2E test: type "reject" (lowercase) → assert Confirm stays aria-disabled (case-sensitive)',
      'E2E test: type valid inputs, type extra char during cooldown → assert timer resets to 5s',
      'E2E test: press Escape → assert dialog closes WITHOUT calling RPC',
    ],
    prd_amendment_required: false, // PRD is buildable as-is; gaps are clarifications, not blockers
    prd_amendment_recommended: true,
  },
  verdict_rationale: {
    pass_factors: [
      'shadcn AlertDialog primitive sufficient for all FR-5 requirements (no custom dialog needed)',
      'Radix provides role=alertdialog, focus trap, aria-labelledby, Escape semantics intrinsically',
      'Component sizing remains in optimal band (171→~250 LOC main + ~180 LOC extracted dialog)',
      'Existing useDecisionMutations pattern provides toast/error precedent',
      'Cross-repo concern manageable: UI in EHG repo, RPC in EHG_Engineer side',
    ],
    warning_factors: [
      'PRD spec gaps in 5 areas (role retrieval, cooldown UX, focus, disabled semantics, error a11y) — not blockers but worth amending',
      'No prior AlertDialog precedent in chairman-v3 — first introduction sets pattern, design quality matters',
      'Cooldown UX has medium frustration risk (acceptable for kill severity)',
    ],
    blocked_factors: [],
  },
};

const evidenceRow = {
  sd_id: SD_ID,
  sub_agent_code: 'DESIGN',
  sub_agent_name: 'design-agent',
  phase: 'PLAN_DESIGN',
  verdict: 'WARNING',
  validation_mode: 'prospective',
  confidence: 82,
  detailed_analysis: detailedAnalysis,
};

(async () => {
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .insert(evidenceRow)
    .select('id, sd_id, sub_agent_code, phase, verdict, validation_mode, confidence, created_at')
    .single();

  if (error) {
    console.error('INSERT FAILED:', error.message);
    console.error('Details:', error.details);
    console.error('Hint:', error.hint);
    process.exit(1);
  }

  console.log('✅ Evidence row written:');
  console.log('   ID:', data.id);
  console.log('   SD:', data.sd_id, '(' + SD_KEY + ')');
  console.log('   Sub-agent:', data.sub_agent_code, '/', data.phase);
  console.log('   Verdict:', data.verdict, '| Confidence:', data.confidence);
  console.log('   Mode:', data.validation_mode);
  console.log('   Created:', data.created_at);
})();
