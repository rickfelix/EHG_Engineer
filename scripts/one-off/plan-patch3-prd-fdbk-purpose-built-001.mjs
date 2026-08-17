// PLAN-phase patch #3: fold in TESTING sub-agent findings (evidence 25be9f6e, prospective
// PLAN-TO-EXEC review) -- p_page_url added to the RPC signature, distinct per-user/global
// rate-limit error messages, TS-8 fixed to actually isolate the global ceiling, unit test gaps
// closed. CONDITIONAL_PASS conditions resolved before EXEC-TO-PLAN.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const prdId = 'PRD-SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001';

const { data: current, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, metadata')
  .eq('id', prdId)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const functional_requirements = current.functional_requirements.map((fr) => {
  if (fr.id === 'FR-1') {
    return {
      ...fr,
      title: fr.title + ' (5-arg signature: adds p_page_url)',
      description:
        fr.description +
        ' TESTING sub-agent finding (prospective PLAN-TO-EXEC review, evidence 25be9f6e): the widget UI renders "Page: {window.location.pathname}" implying page-context capture, which neither the old payload (source_url, not a real column) nor the RPC\'s first draft (no parameter) actually persisted, despite public.feedback having a real page_url column (varchar(500)). Added p_page_url TEXT DEFAULT NULL (5th parameter) mapped to page_url, left(...,500)-clamped -- added while the signature was not yet live, the cheap moment per the review (adding it post-merge would need a new overload or a signature change plus a PostgREST schema-cache reload). Also: the two RAISE EXCEPTION 53400 branches (per-user vs global) now carry distinct message text ("rate limited (per-user)" / "rate limited (global)") so an operator (or a test) can tell which bound fired -- previously identical text made this undiagnosable.',
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'AC-1.7: p_page_url is optional (DEFAULT NULL), left(...,500)-clamped, and persisted to public.feedback.page_url when supplied.',
        'AC-1.8: the per-user and global rate-limit error messages are textually distinguishable (grep-verified: "(per-user)" vs "(global)").',
      ],
    };
  }
  if (fr.id === 'FR-6') {
    return {
      ...fr,
      description:
        fr.description +
        ' TESTING sub-agent finding (evidence 25be9f6e, HIGH): the originally-shipped TS-8 was a BLIND ASSERTION -- it padded all 200 ceiling rows onto ONE user, so that user\'s own 20/hr per-user limit tripped FIRST with an identical error code/message, and the "global ceiling" assertion passed for the wrong reason (never actually exercising the global bound). Fixed: the pad is now spread across 20 distinct synthetic users (well under each one\'s own per-user cap), and the final call is made as a VIRGIN user with zero rows of their own, so only the global bound can fire -- verified via the now-distinct "(global)" message text, not merely the shared 53400 code.',
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'AC-6.1: TS-8\'s pad is spread across >=20 distinct user_ids, none individually reaching their own per-user cap, and the tripping call is made by a user with zero prior rows.',
      ],
    };
  }
  return fr;
});

const technical_requirements = [
  ...current.technical_requirements,
  {
    id: 'TR-8',
    title: 'Global ceiling is coupled to ALL manual_feedback writers, including automated intake -- accepted, documented',
    rationale: 'TESTING sub-agent finding (evidence 25be9f6e, LOW): the 200/hr global ceiling counts every source_type=manual_feedback row, including automated intake sharing this source_type (harness-bug logger, todoist/youtube/claude_code intake). A spike in automated volume could theoretically lock out real widget users. Measured: 90-day hourly distribution for source_type=manual_feedback peaks at 42/hr -- 5x headroom under the 200/hr cap. Accepted at the current threshold; revisit if automated volume grows materially (the coupling, not the threshold, would be the thing to reconsider first).',
    description: 'Documented coupling, not a defect -- carried in the migration file\'s own comment at the global-ceiling check.',
  },
];

const metadata = {
  ...current.metadata,
  sub_agent_evidence: {
    ...(current.metadata?.sub_agent_evidence || {}),
    testing_prospective: '25be9f6e-cb8e-4380-b6f9-a11d9aa3a486',
  },
  testing_conditions_resolved: [
    'HIGH: TS-8 blind-assertion fixed (pad spread across 20 distinct users, virgin caller, distinct message text)',
    'MEDIUM: p_page_url added to the RPC signature and widget/DAL wiring, mapped to the existing page_url column',
    'MEDIUM: migration header amended to name all 3 original payload defects (source_url, created_by, status=open), not just the RLS policy gap',
    'LOW: global-ceiling automated-writer coupling documented in-migration (TR-8), threshold kept at measured 5x headroom',
    'LOW: unit test gaps closed -- shape-guard test for unexpected RPC response, instanceof tautology replaced with a behavioral (ventureId-absence) check',
  ],
};

const { error } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements, technical_requirements, metadata })
  .eq('id', prdId);

if (error) { console.error('UPDATE_ERR:', error); process.exit(1); }
console.log('PRD_PATCHED_3:', prdId);
