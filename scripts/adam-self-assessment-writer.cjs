#!/usr/bin/env node
/**
 * Adam self-assessment writer — the programmatic per-dimension self-score.
 * SD-LEO-INFRA-ADAM-SELF-ASSESSMENT-001.
 *
 * Flag-gated (ADAM_SELF_SCORE_CADENCE, default OFF — ships INERT; the live-enablement
 * child flips it). On a ~ADAM_SELF_SCORE_EVERY_TURNS cadence it: gathers observable
 * signals, scores the 8 dimensions (numeric where a signal exists, inconclusive
 * otherwise — never fabricated), verifies the prior cycle + validates via the shipped
 * lib/fleet/verify-score-contract.mjs, and persists ONE feedback row
 * (category=adam_self_assessment) with the common score schema, idempotent on review_key.
 * Fail-OPEN on every error so it can never break Adam's tick.
 *
 * Flags: --dry-run (compute + print, write nothing) | --force (ignore flag + cadence gate).
 *
 * ESM note: the pure core (lib/adam/self-assessment.cjs) is required directly (CJS); the
 * only ESM dep (verify-score-contract.mjs) is loaded via a string-LITERAL dynamic import
 * so the WIRE_CHECK static call-graph can trace it.
 */
const path = require('path');
const fs = require('fs');
const core = require('../lib/adam/self-assessment.cjs');

const REPO_ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(REPO_ROOT, '.adam-self-assessment-state.json');

/** on|1|true => enabled; everything else (incl. undefined) => OFF. */
function isFlagEnabled(env = process.env) {
  const v = String(env.ADAM_SELF_SCORE_CADENCE || 'off').toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (parsed && typeof parsed === 'object') return { ...core.freshState(), ...parsed };
  } catch {
    /* missing/corrupt => fresh */
  }
  return core.freshState();
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
  } catch (e) {
    process.stderr.write(`[adam-self-score] state write failed (non-fatal): ${e.message}\n`);
  }
}

/** Gather observable signals (read-only, defensive: each failure => null = inconclusive). */
async function gatherSignals(sb) {
  const signals = {};
  const safeCount = async (fn) => {
    try {
      const { count, error } = await fn();
      return error ? null : count;
    } catch {
      return null;
    }
  };

  // D1: belt depth = unclaimed CLAIMABLE (draft) SDs.
  // QF-20260725-089: this counted raw draft_unclaimed rows, so D1_proactive_sourcing scored 5/5 on
  // belt_depth=8 at the exact moment the belt held 0 claimable work (7 human-action-held + a test
  // fixture) — rewarding a full belt while it was empty, and making D1's own "belt starved while
  // backlog rich" red-flag unobservable. Now routed through the shared eligibility-gated gauge,
  // the SAME one the coordinator-health audit uses, so the two surfaces cannot drift apart again.
  signals.belt_depth = await (async () => {
    try {
      const { countDispatchableBacklog } = require('../lib/fleet/belt-depth.cjs');
      const { dispatchable } = await countDispatchableBacklog(sb);
      return dispatchable;
    } catch {
      return null; // same fail-soft contract as safeCount: unmeasurable, never a silent 0
    }
  })();

  // D1 consumption discriminator (QF-20260817-735): belt_depth above is SD-lane-only and a
  // point-in-time stock reading, so it cannot distinguish starvation from healthy flow (fast
  // sourcing + fast consumption keeping depth shallow) -- same one-lane-blindness class
  // SD-LEO-INFRA-GATE-SIDE-BELT-001 fixed for the producer-side gates via belt-depth.cjs's
  // countBeltDepth. qf_sourced_window is QFs CREATED in the window regardless of current status
  // -- a QF claimed/completed within the window is the STRONGEST evidence of successful
  // sourcing, not weaker, matching this dimension's own name (a rate, not a stock). This is a
  // proxy for Adam's sourcing activity (quick_fixes carries no per-row authorship column to
  // filter on directly), not a literal author trace.
  const D1_WINDOW_MS = 24 * 60 * 60 * 1000;
  const d1WindowSinceIso = new Date(Date.now() - D1_WINDOW_MS).toISOString();
  signals.qf_sourced_window = await safeCount(() => sb
    .from('quick_fixes')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', d1WindowSinceIso));

  // window_completions: QF + SD completions in the same window -- the consumption side of the
  // discriminator. null only when BOTH sub-counts are unmeasurable (fail-soft: a genuinely zero
  // window and an unmeasurable one both flow through as "no discriminator signal", falling back
  // to the depth-only D1 reading rather than fabricating a 0).
  signals.window_completions = await (async () => {
    const qfCompleted = await safeCount(() => sb
      .from('quick_fixes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', d1WindowSinceIso));
    const sdCompleted = await safeCount(() => sb
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completion_date', d1WindowSinceIso));
    if (qfCompleted == null && sdCompleted == null) return null;
    return (qfCompleted || 0) + (sdCompleted || 0);
  })();

  // D2: Adam-role sessions holding a non-null sd_key (should be 0 — Adam never claims).
  // NOTE: claude_sessions has no `callsign` column (role lives only in metadata.role) — this
  // query used to select it and threw on every call (verified against the live schema; fixed
  // alongside the same latent bug in scripts/solomon-self-assessment-writer.cjs, caught by CI's
  // schema-reference-lint while shipping SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001).
  signals.adam_claim_count = await (async () => {
    try {
      const { data, error } = await sb
        .from('claude_sessions')
        .select('id, sd_key, metadata')
        .not('sd_key', 'is', null);
      if (error || !Array.isArray(data)) return null;
      return data.filter((r) => String((r.metadata && r.metadata.role) || '').toLowerCase() === 'adam').length;
    } catch {
      return null;
    }
  })();

  // D8: advisory deliverability = adam_advisory rows DELIVERED (not dead-lettered) / total, last 7d.
  //
  // QF-20260726-409. This previously counted `read_at != null`, which is a RECIPIENT READ RATE, not
  // deliverability -- it told you how promptly the coordinator drains its inbox and contained no
  // Adam-side signal at all. Two consequences, both measured against live data before this change:
  //
  //  1. IT INVERTED THE SIGNAL ITS OWN PROVENANCE CLAIMS. Of 218 live adam_advisory rows, 27 are
  //     dead-lettered (payload.dead_letter === true, every one reason 'target_dead') -- and ALL 27
  //     carry a non-null read_at. So each genuine delivery FAILURE was being scored as a success.
  //     Real delivery rate 0.876; the read-rate proxy was scoring 0.729.
  //  2. IT COULD NOT BE SATISFIED. Every advisory is created with read_at NULL, so sending more
  //     advisories LOWERED the score whenever the recipient's drain lagged -- penalising exactly the
  //     behaviour D8 exists to encourage, with no action available to Adam that improved it.
  //
  // Dead-lettering IS the Adam-controlled signal, and it is the one D8 already documents: the
  // dimension is defined as 'clear advisories, CORRECT LANE/TARGET, <=1 per tick', and 'target_dead'
  // means the advisory was addressed to a session that was not alive. So the provenance string
  // 'advisories delivered vs dead-lettered' was right all along -- the code simply never implemented
  // it. Fixed by implementing it literally rather than by renaming the dimension to match the broken
  // measurement (the D8 key is load-bearing: leo_protocol_sections id=601, CLAUDE_ADAM.md, the
  // coordinator hourly-review prompt, and every historical adam_self_assessment feedback row).
  //
  // A fresh advisory is not dead-lettered, so recency no longer counts as failure and no settle
  // window is needed.
  signals.advisory_deliverability = await (async () => {
    try {
      // The 'last 7d' the old comment asserted was never implemented -- there was NO date filter,
      // just an unordered .limit(500). It spanned ~7d only because Adam has only been sending for
      // ~7d (293 rows total, under the cap), so the cap was not even binding yet: as volume grows
      // the window would have silently narrowed instead. Filter and ordering are now explicit.
      const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await sb
        .from('session_coordination')
        .select('read_at, payload')
        .eq('sender_type', 'adam')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error || !Array.isArray(data) || data.length === 0) return null;
      // Delegates to the shared pure predicate rather than re-implementing it here — one definition
      // of "delivered", unit-tested against fixtures.
      return core.computeAdvisoryDeliverability(data);
    } catch {
      return null;
    }
  })();

  // The remaining signals (D3 coordinator_autonomy_rate, D4 false_claim_rate,
  // D5 advisory_citation_rate, D6 ack_latency_min, D7 adam_sd_pass_rate) have no
  // reliable live source yet — left undefined so the scorers emit INCONCLUSIVE
  // rather than a fabricated number.
  return signals;
}

function printScore(score, verdict) {
  process.stdout.write(JSON.stringify({ score, verdict }, null, 2) + '\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const force = argv.includes('--force');

  if (!isFlagEnabled() && !force) {
    process.stdout.write('adam-self-assessment: ADAM_SELF_SCORE_CADENCE off — no-op\n');
    process.exit(0);
  }

  try {
    const everyTurns = Number(process.env.ADAM_SELF_SCORE_EVERY_TURNS) || core.DEFAULT_EVERY_TURNS;
    const state = readState();
    const invocations = (Number.isFinite(state.invocations) ? state.invocations : 0) + 1;

    if (!core.shouldFire({ last_fired_turn: state.last_fired_turn }, invocations, everyTurns) && !force) {
      writeState({ ...state, invocations });
      const due = (Number.isFinite(state.last_fired_turn) ? state.last_fired_turn : 0) + everyTurns;
      process.stdout.write(`adam-self-assessment: turn ${invocations}/${due} — not due, skip\n`);
      process.exit(0);
    }

    const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
    const sb = createSupabaseServiceClient('engineer');
    const sessionId = process.env.CLAUDE_SESSION_ID || 'adam';
    const date = new Date().toISOString().slice(0, 10);
    const newCycle = (state.cycle || 0) + 1;

    const signals = await gatherSignals(sb);
    const { dimensions, provenance, inconclusive } = core.scoreDimensions(signals);
    const belowThreshold = core.classifyBelowThreshold(dimensions);

    // prior cycle (most recent self-assessment row)
    let priorScore = null;
    try {
      const { data: priorRows } = await sb
        .from('feedback')
        .select('metadata')
        .eq('category', 'adam_self_assessment')
        .order('created_at', { ascending: false })
        .limit(1);
      priorScore = priorRows && priorRows[0] && priorRows[0].metadata ? priorRows[0].metadata.score : null;
    } catch {
      priorScore = null;
    }

    const priorOutcomes = core.derivePriorOutcomes(priorScore, dimensions);
    const committedActions = core.generateCommittedActions(belowThreshold, provenance);
    const score = core.assembleScore({
      dimensions, cycle: newCycle, session: sessionId, committedActions, priorOutcomes, provenance, belowThreshold, date, inconclusive,
    });

    // validate via the shipped contract (literal dynamic import — WIRE_CHECK-traceable)
    const { validateScoreContract, hasBlockingViolation } = await import('../lib/fleet/verify-score-contract.mjs');
    const verdict = validateScoreContract({ current: score, prior: priorScore, priorStreak: state.streak || 0 });
    score.verify_verdict = { valid: verdict.valid, inconclusive: verdict.inconclusive, violations: verdict.violations, escalation: verdict.escalation };

    if (dryRun) {
      printScore(score, verdict);
      process.exit(0);
    }

    // FR-5: refuse the write ONLY on a scoped Rule-1/Rule-2 ("INVALID:") violation — never on an
    // escalation-only or all-inconclusive cycle (see lib/fleet/verify-score-contract.mjs hasBlockingViolation).
    if (hasBlockingViolation(verdict.violations)) {
      writeState({ ...state, invocations, last_fired_turn: invocations });
      process.stdout.write(`adam-self-assessment: REFUSED cycle ${newCycle} — ${verdict.violations.join('; ')}\n`);
      process.exit(0);
    }

    // idempotent dedup on review_key
    try {
      const { data: existing } = await sb
        .from('feedback')
        .select('id')
        .eq('category', 'adam_self_assessment')
        .filter('metadata->>review_key', 'eq', score.review_key)
        .limit(1);
      if (existing && existing.length) {
        process.stdout.write(`adam-self-assessment: cycle row ${score.review_key} already exists — skip\n`);
        writeState({ ...state, invocations, last_fired_turn: invocations });
        process.exit(0);
      }
    } catch {
      /* dedup check failed — proceed (a duplicate is a tolerable additive row) */
    }

    // buildFeedbackInsertRow() builds the actual insert payload -- these are its own helper
    // parameter names, not literal feedback columns. schema-lint-disable-line
    const { error: insErr } = await sb.from('feedback').insert(core.buildFeedbackInsertRow({ // schema-lint-disable-line
      category: 'adam_self_assessment',
      score,
      belowThreshold,
      sessionId,
      title: `Adam self-assessment — cycle ${newCycle}`,
    }));
    if (insErr) throw new Error(`feedback insert failed: ${insErr.message}`);

    writeState({ invocations, last_fired_turn: invocations, cycle: newCycle, streak: verdict.escalation ? verdict.escalation.streak : 0 });
    process.stdout.write(`adam-self-assessment: wrote cycle ${newCycle} (${score.overall}) review_key=${score.review_key}${verdict.escalation && verdict.escalation.triggered ? ' [ESCALATE]' : ''}\n`);
    process.exit(0);
  } catch (e) {
    // FAIL OPEN — never break Adam's tick.
    process.stderr.write(`[adam-self-score] degraded to no-op: ${e.message}\n`);
    process.exit(0);
  }
}

module.exports = { isFlagEnabled, readState, writeState, gatherSignals, STATE_PATH };

if (require.main === module) {
  main();
}
