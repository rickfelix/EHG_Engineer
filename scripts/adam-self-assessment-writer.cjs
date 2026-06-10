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

  // D1: belt depth = unclaimed workable (draft) SDs
  signals.belt_depth = await safeCount(() =>
    sb.from('strategic_directives_v2').select('id', { count: 'exact', head: true }).eq('status', 'draft').is('claiming_session_id', null)
  );

  // D2: Adam-role sessions holding a non-null sd_key (should be 0 — Adam never claims)
  signals.adam_claim_count = await (async () => {
    try {
      const { data, error } = await sb
        .from('claude_sessions')
        .select('id, sd_key, callsign, metadata')
        .not('sd_key', 'is', null);
      if (error || !Array.isArray(data)) return null;
      return data.filter((r) => {
        const cs = String(r.callsign || '').toLowerCase();
        const role = String((r.metadata && r.metadata.role) || '').toLowerCase();
        return cs === 'adam' || role === 'adam';
      }).length;
    } catch {
      return null;
    }
  })();

  // D8: advisory deliverability = adam_advisory rows read / total (last 7d)
  signals.advisory_deliverability = await (async () => {
    try {
      const { data, error } = await sb
        .from('session_coordination')
        .select('read_at, payload')
        .eq('sender_type', 'adam')
        .limit(500);
      if (error || !Array.isArray(data) || data.length === 0) return null;
      const adv = data.filter((r) => r.payload && r.payload.kind === 'adam_advisory');
      if (adv.length === 0) return null;
      const delivered = adv.filter((r) => r.read_at != null).length;
      return delivered / adv.length;
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
    const { dimensions, provenance } = core.scoreDimensions(signals);
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
      dimensions, cycle: newCycle, session: sessionId, committedActions, priorOutcomes, provenance, belowThreshold, date,
    });

    // validate via the shipped contract (literal dynamic import — WIRE_CHECK-traceable)
    const { validateScoreContract } = await import('../lib/fleet/verify-score-contract.mjs');
    const verdict = validateScoreContract({ current: score, prior: priorScore, priorStreak: state.streak || 0 });
    score.verify_verdict = { valid: verdict.valid, inconclusive: verdict.inconclusive, violations: verdict.violations, escalation: verdict.escalation };

    if (dryRun) {
      printScore(score, verdict);
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

    const description = JSON.stringify({ overall: score.overall, below_threshold: belowThreshold });
    const { error: insErr } = await sb.from('feedback').insert({
      category: 'adam_self_assessment',
      status: 'new',
      description,
      metadata: { score, review_key: score.review_key, sender_session: sessionId },
    });
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
