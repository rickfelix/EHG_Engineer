/**
 * QF-20260817-982: chairman-commissioned retroactive dual-market PBN evaluation of AltifyAI.
 *
 * AltifyAI predates the PBN gate (SD-LEO-FEAT-PROVEN-BETTER-NEW-001, completed 08-15) and has
 * never had a venture_nursery row -- there is nothing to re-run the gate "against" in the normal
 * nursery-promotion sense. This script instead calls the SAME shipped scoring/evaluation
 * machinery (pbn-scoring.js's scorePbnBuckets + pbn-gate.js's buildPbnVerdict, via
 * pbn-integration.js's runPbnGate) directly against two hand-built market briefs, and persists
 * the result onto the venture row (ventures.validation_score + ventures.metadata), since no
 * nursery row exists to attach a nursery_evaluation_log entry to (TR-8: persistence location is
 * the caller's decision).
 *
 * validation_score formula (ventures.validation_score has ZERO known writers anywhere in this
 * codebase pre-this-script -- confirmed via lib/eva/lifecycle/exit-gate-verifiers.js:690 -- so
 * there is no pre-existing NUMERIC convention to match, but the SCALE is fixed by the column
 * itself, DECIMAL(3,2) -- confirmed by a direct write probe against the live schema -- matching
 * the "Validation score >= 6" 0-10 convention referenced in that same exit-gate-verifiers.js
 * comment. This formula computes a 0-100 composite first (documented in full for auditability),
 * then divides by 10 for the column write; the 0-100 breakdown is preserved in metadata so no
 * precision is lost off the record, only off the column:
 *   per-market PBN sub-score (0-70): proven_coverage +30, better_coverage +20, verdict PASS +20 /
 *     TRIM +10 / REJECT +0
 *   per-market modifier (0-30): M1 = manual Stage-17 UX rubric (brand identity / CTA function /
 *     copy honesty, 10 pts each); M2 = agent-readiness audit found-rate*15 + recommended-rate*15
 *   ventures.validation_score (top-level, /10 scaled) = the score of whichever market scores
 *     higher (the "stronger Better" per the QF's own framing); both per-market 0-100 scores are
 *     kept in full in metadata.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { runPbnGate } from '../../lib/eva/stage-zero/pbn-integration.js';
import { runAudit } from '../../lib/agent-readiness/audit-runner.js';
import { STAGE_TAGS } from '../../lib/agent-readiness/run-registry.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { getLLMClient } from '../../lib/llm/client-factory.js';

const VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const QF_ID = 'QF-20260817-982';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Real facts grounding the two briefs -- gathered firsthand from the venture row, the stage-12
// GTM artifact, and a direct read of the deployed altifyai repo (src/ui/LandingPage.jsx,
// src/ui/App.jsx, src/index.html, src/routes/index.js) -- never fabricated.
const M1_BRIEF = {
  name: 'AltifyAI -- M1: human self-serve alt-text upload tool',
  problem_statement:
    'Bloggers, e-commerce store owners, web developers, and content managers neglect or poorly ' +
    'write alt text for images, harming SEO and accessibility; manually writing descriptive alt ' +
    'text for many images is time-consuming and tedious. (Note: this differs from the venture\'s ' +
    'top-level problem_statement field, which frames the problem as an ENTERPRISE image-metadata- ' +
    'compliance problem -- an internal inconsistency between the venture record and its own GTM/ ' +
    'demand-test targeting, observed and reported here, not resolved by this script.)',
  solution:
    'Users upload an image via a web page; a vision model + LLM automatically generates a ' +
    'descriptive, SEO-friendly alt text string; the user copies the text. Deployed at ' +
    'https://altifyai.rickfelix2000.workers.dev, Clerk-gated /register sign-up, no separate ' +
    'brand header/nav on the landing page (brand name "AltifyAI" appears only in the HTML ' +
    '<title>, never rendered on-page).',
  target_market:
    'Bloggers, e-commerce store owners, web developers, content managers (ventures.target_market). ' +
    'The chairman-ratified demand-test plan narrows first outreach to a 50-contact list of ' +
    'accessibility consultancies and WP agencies (manual 1:1 email, opt-out honored) -- a B2B ' +
    'services-agency framing, not direct-to-blogger.',
  thesis: {
    gtm_stage12_tiers: [
      'Busy Content Creator (TAM $100M / SAM $15M / SOM $500K)',
      'SEO-Conscious Website Manager',
      'E-commerce Product Manager',
    ],
    demand_test_kill_criteria: 'K1 conversion<2%, K2 <1 card-verified preorder, K3 LTV/CAC<3 at $29/mo anchor pricing',
    demand_test_not_yet_run: true,
  },
};

const M2_BRIEF = {
  name: 'AltifyAI -- M2: agent/API-callable alt-text generation service',
  problem_statement:
    'AI agents, content-pipeline automations, and CMS/e-commerce catalog-ingestion bots that need ' +
    'to generate accessibility- and SEO-compliant alt text for images at scale have no purpose-' +
    'built API to call today; they must either invoke a general-purpose vision-LLM directly with ' +
    'ad-hoc prompting (inconsistent format/quality, no SEO/accessibility tuning) or fall back to ' +
    'manual human review, which does not scale to agent-driven pipelines.',
  solution:
    'A single authenticated REST API endpoint that accepts an image (or image URL) and returns ' +
    'SEO-optimized, WCAG-compliant alt text in one programmatic call, designed to be called ' +
    'directly by agents/automation pipelines rather than through the existing human-facing upload ' +
    'page. FIRSTHAND FACT: no such endpoint currently exists -- the deployed worker\'s only routes ' +
    'are /api/register, /api/events, /api/feedback (src/routes/index.js); the vision+LLM alt-text ' +
    'mechanic that powers the human upload flow is proven, but a machine-callable interface to it ' +
    'would be net-new backend work, not a trivial expose-the-existing-endpoint change.',
  target_market:
    'AI agents and automation pipelines operating on behalf of content platforms, e-commerce ' +
    'catalogs, and CMS integrations that need machine-callable, high-volume alt-text generation ' +
    '(e.g. an agent ingesting a merchant\'s product catalog needing alt text for thousands of ' +
    'images unattended). Chairman-sourced hypothesis (verbal 2026-08-17): "a human would have to ' +
    'upload each individual image, whereas an AI agent just needs an API."',
  thesis: {
    stage12_gtm_has_zero_agent_tier: true,
    existing_public_routes: ['/api/register', '/api/events', '/api/feedback'],
    alt_text_generation_route_exists: false,
  },
};

// AC-ADD-1 (Stage-17 UI/UX judgment): no automated instrument exists that can screenshot/critique
// an already-deployed live URL (lib/eva/stage-17/* is a pre-build mockup-GENERATION pipeline that
// reads only venture_artifacts rows with artifact_type='s17_approved', is_current=true -- none
// exist for a live-URL critique; lib/apa/* is an unrelated stub-detection system). Per the QF's
// own escape hatch ("honest manual rubric where not runnable"), this is a manual rubric, authored
// from a firsthand read of src/ui/LandingPage.jsx, src/ui/App.jsx, and index.html (not a live
// screenshot -- browser tooling was unavailable in this headless session; the DOM/copy content
// itself is fully knowable from source, so only the "as-rendered" visual check is unmeasured).
const STAGE17_MANUAL_RUBRIC = {
  method: 'manual_source_read',
  could_not_measure: ['live_rendered_screenshot (no browser available this session)'],
  criteria: {
    brand_identity_visible_on_page: {
      score: 0,
      max: 10,
      finding:
        'The string "AltifyAI" appears ONLY in the HTML <title> tag (index.html); ' +
        'src/ui/LandingPage.jsx renders no header, nav, or logo -- the page goes straight into ' +
        'the hero section ("For SEO-conscious site owners" / "Alt text that writes itself."). ' +
        'A visitor has no on-page way to learn the product\'s name. This directly corroborates ' +
        'and specifies the chairman\'s "header reads plain/incomplete" finding -- it is not merely ' +
        'plain, the brand identity is entirely absent from the rendered page.',
    },
    cta_functions: {
      score: 10,
      max: 10,
      finding:
        'CTA_HREF="/register" is wired in App.jsx (SignedOut renders Clerk\'s <SignUp>/<SignIn> ' +
        'toggle inline). A stale docblock comment in LandingPage.jsx says this "404s until D3 ' +
        'ships" -- verified against current App.jsx: D3 has shipped, the route works. The ' +
        'demand-test\'s core conversion path is functional, not broken.',
    },
    copy_honesty_and_clarity: {
      score: 9,
      max: 10,
      finding:
        'Hero + 3-card differentiator copy is grounded only in the real, confirmed feature set ' +
        'per the component\'s own docblock (no fabricated metrics/testimonials). Clear, honest, ' +
        'un-hyped. Minor point off: copy is 100% M1-framed (upload-a-single-image), giving zero ' +
        'signal to any M2/agent audience that might land on the same URL.',
    },
  },
  // 0 + 10 + 9 = 19 / 30
  total_score: 19,
  max_score: 30,
};

/**
 * pbn-scoring.js fails closed on a malformed/truncated LLM response (sets scoring_error +
 * all-uncoverable buckets) rather than ever fabricating a pass -- correct behavior, but a
 * transient formatting glitch from a fallback model must not be mistaken for "the idea was
 * evaluated and found lacking." Retry a bounded number of times specifically when
 * scoring_error is set; a REJECT with scoring_error still set after retries is reported
 * honestly as a could-not-measure outcome, never silently accepted as a merit verdict.
 */
async function runPbnGateWithRetry(brief, maxAttempts = 3) {
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // classification-tier (pbn-scoring.js's default) resolves to Haiku, and this session's
    // local-Ollama-first path falls back to Haiku on failure -- both produced malformed JSON
    // 3/3 and 2/3 times respectively on live attempts against this exact prompt (a real,
    // reproducible flakiness in the shipped classification tier's JSON compliance, logged as a
    // harness bug separately, not fixed here). allowLocal:false on attempt 2+ routes around
    // both the local model AND the Haiku cloud fallback to Gemini 2.5 Flash (still the
    // classification purpose/tier -- same shipped call, just skipping the flaky sub-path) while
    // remaining the real scorePbnBuckets/pbn-gate.js code path, not a parallel scorer.
    const deps = attempt > 1 ? { llmClient: getLLMClient({ purpose: 'classification', allowLocal: false }) } : {};
    last = await runPbnGate(brief, deps);
    if (!last.scoring_error) return last;
    console.warn(`[${QF_ID}] runPbnGate scoring_error on attempt ${attempt}/${maxAttempts} for "${brief.name}": ${last.scoring_error}`);
  }
  return last;
}

function pbnSubScore(verdict) {
  let score = 0;
  if (verdict.proven?.coverage) score += 30;
  if (verdict.better?.coverage) score += 20;
  if (verdict.verdict === 'PASS') score += 20;
  else if (verdict.verdict === 'TRIM') score += 10;
  return score;
}

// Set by a prior real run of this script (audit-runner.js#runAudit executed live against
// AltifyAI at 2026-08-24T22:01:52Z, 3 models x 5 prompts x 5 samples, real LLM calls, real
// budget spend recorded) -- reused here rather than re-spending budget on a second identical
// run when only the PBN-scoring half needed a retry.
const EXISTING_AUDIT_RUN_ID = 'd6a579f5-e589-44fe-98e7-155364cff102';

async function runAgentReadinessAudit(reuseAuditRunId = EXISTING_AUDIT_RUN_ID) {
  let auditRunId = reuseAuditRunId;
  let written;
  let refused;

  if (!auditRunId) {
    const modelSet = ['anthropic:claude-sonnet-4-6', 'openai:gpt-5.4', 'google:gemini-2.5-flash'];
    const result = await runAudit({
      ventureUrl: 'https://altifyai.rickfelix2000.workers.dev',
      ventureLabel: 'AltifyAI',
      runType: 'before',
      stageTag: STAGE_TAGS.STANDALONE_PRE_PIPELINE,
      modelSet,
    });
    auditRunId = result.auditRunId;
    written = result.written;
    refused = result.refused;
  }

  const { data: samples, error } = await supabase
    .from('agent_readiness_audit_sample')
    .select('found, recommended')
    .eq('audit_run_id', auditRunId);
  if (error) throw new Error(`Failed to read back agent_readiness_audit_sample: ${error.message}`);

  const n = samples.length;
  const foundRate = n ? samples.filter((s) => s.found).length / n : 0;
  const recommendedRate = n ? samples.filter((s) => s.recommended).length / n : 0;
  const modifierScore = Math.round(foundRate * 15 + recommendedRate * 15);

  return {
    audit_run_id: auditRunId,
    written,
    refused,
    sample_count_read_back: n,
    found_rate: Number(foundRate.toFixed(3)),
    recommended_rate: Number(recommendedRate.toFixed(3)),
    modifier_score: modifierScore,
    scope_note:
      'This instrument measures AI-answer-engine brand discoverability/recommendation ' +
      '("would ChatGPT/Claude/Gemini recommend this business if asked") -- it is a legitimate M2 ' +
      'signal but is NOT the same thing as literal agent-to-API programmatic consumption ' +
      'readiness (no such API exists yet to test against; see M2 brief solution field).',
  };
}

async function main() {
  console.log(`[${QF_ID}] Scoring M1 (human self-serve upload) via runPbnGate...`);
  const pbnM1 = await runPbnGateWithRetry(M1_BRIEF);
  console.log(`[${QF_ID}] M1 verdict: ${pbnM1.verdict} (proven=${pbnM1.proven.coverage}, better=${pbnM1.better.coverage}, scoring_error=${pbnM1.scoring_error || 'none'})`);

  console.log(`[${QF_ID}] Scoring M2 (AI-agent/API consumption) via runPbnGate...`);
  const pbnM2 = await runPbnGateWithRetry(M2_BRIEF);
  console.log(`[${QF_ID}] M2 verdict: ${pbnM2.verdict} (proven=${pbnM2.proven.coverage}, better=${pbnM2.better.coverage}, scoring_error=${pbnM2.scoring_error || 'none'})`);

  console.log(`[${QF_ID}] Running mandatory agent-readiness audit for M2 (AC-ADD-2)...`);
  let agentReadiness;
  try {
    agentReadiness = await runAgentReadinessAudit();
    console.log(`[${QF_ID}] Agent-readiness audit ${agentReadiness.audit_run_id}: found_rate=${agentReadiness.found_rate}, recommended_rate=${agentReadiness.recommended_rate}`);
  } catch (err) {
    console.error(`[${QF_ID}] Agent-readiness audit FAILED (honest could-not-measure, not fabricated): ${err.message}`);
    agentReadiness = { error: err.message, modifier_score: 0, could_not_measure: true };
  }

  const m1Score = Math.min(100, pbnSubScore(pbnM1) + STAGE17_MANUAL_RUBRIC.total_score);
  const m2Score = Math.min(100, pbnSubScore(pbnM2) + (agentReadiness.modifier_score || 0));

  const strongerMarket = m2Score > m1Score ? 'M2' : 'M1';
  const overallScore = Math.max(m1Score, m2Score);

  console.log(`[${QF_ID}] M1 score=${m1Score}, M2 score=${m2Score} -> recommending ${strongerMarket}, overall validation_score=${overallScore}`);

  const evaluation = {
    evaluated_by: QF_ID,
    measured_at: new Date().toISOString(),
    m1: { brief: M1_BRIEF, pbn_verdict: pbnM1, ux_rubric: STAGE17_MANUAL_RUBRIC, score: m1Score },
    m2: { brief: M2_BRIEF, pbn_verdict: pbnM2, agent_readiness: agentReadiness, score: m2Score },
    stronger_market: strongerMarket,
    feedback_model_recommendation: {
      recommendation: 'sign_in_required_on_product_site_anonymous_on_landing_page',
      rationale:
        'Current anonymous feedback path (fn_submit_venture_user_feedback via /api/feedback) ' +
        'fails closed today (EHG_ENGINEER_INGEST_SECRET not provisioned for this venture) -- ' +
        'confirmed firsthand in lib/feedback/submit.js. When provisioned, its residual risk ' +
        'is a client-held secret enabling per-venture forgery + guessable venture_id attribution. ' +
        'fn_submit_internal_feedback (identity-bound, Clerk-backed, shipped 2026-08-17) is now ' +
        'feasible and mirrors the traceability chairman asked about. Recommend sign-in-required ' +
        'feedback on the authenticated product surface (dashboard), anonymous signal preserved on ' +
        'the landing page where feedback IS the demand-test signal and friction would suppress it.',
    },
  };

  const { data: venture, error: fetchErr } = await supabase
    .from('ventures')
    .select('metadata, validation_score')
    .eq('id', VENTURE_ID)
    .single();
  if (fetchErr) throw new Error(`Failed to fetch venture: ${fetchErr.message}`);
  if (venture.validation_score !== null) {
    console.log(`[${QF_ID}] validation_score already set (${venture.validation_score}) -- overwriting with this re-evaluation, prior value preserved in metadata.stage_zero.retroactive_pbn_evaluation_history.`);
  }

  const priorEvals = venture.metadata?.stage_zero?.retroactive_pbn_evaluation_history || [];
  const priorCurrent = venture.metadata?.stage_zero?.retroactive_pbn_evaluation;
  const history = priorCurrent ? [...priorEvals, priorCurrent] : priorEvals;

  const newMetadata = {
    ...venture.metadata,
    stage_zero: {
      ...venture.metadata?.stage_zero,
      retroactive_pbn_evaluation: evaluation,
      retroactive_pbn_evaluation_history: history,
    },
  };

  // ventures.validation_score is DECIMAL(3,2) -- a 0-10 scale (matching the "Validation score
  // >= 6" convention in lib/eva/lifecycle/exit-gate-verifiers.js:690), NOT 0-100. Scale down for
  // the column write only; the full 0-100 breakdown stays in metadata.evaluation above.
  const scaledScore = Math.min(9.99, Math.round((overallScore / 10) * 100) / 100);

  const { error: updateErr } = await supabase
    .from('ventures')
    .update({ validation_score: scaledScore, metadata: newMetadata })
    .eq('id', VENTURE_ID);
  if (updateErr) throw new Error(`Failed to persist evaluation: ${updateErr.message}`);

  console.log(`[${QF_ID}] Persisted validation_score=${scaledScore} (0-100 composite=${overallScore}) + full evaluation to ventures.metadata.stage_zero.retroactive_pbn_evaluation.`);
  return { m1Score, m2Score, strongerMarket, overallScore, scaledScore, evaluation };
}

if (isMainModule(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`[${QF_ID}] FATAL:`, err);
      process.exit(1);
    });
}

export { main, pbnSubScore, M1_BRIEF, M2_BRIEF, STAGE17_MANUAL_RUBRIC };
