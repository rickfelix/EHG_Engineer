#!/usr/bin/env node
/**
 * Solomon self-assessment writer — the programmatic per-dimension rubric self-score.
 * SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-3.
 *
 * Flag-gated (SOLOMON_SELF_SCORE_CADENCE, default OFF — ships INERT, mirrors
 * ADAM_SELF_SCORE_CADENCE's convention). Invoked from the deep-sweep tick's own reasoning
 * (scripts/solomon-startup-check.mjs SOLOMON_LOOPS 'deep-sweep' entry covers 'self-assessment';
 * no dedicated cron — the tick is agent-judgment, script:null). Scores the D1-D5 dimensions from
 * CLAUDE_SOLOMON.md's "Self-assessment rubric" (numeric where a signal exists, inconclusive
 * otherwise — never fabricated), verifies the prior cycle + validates via the shipped
 * lib/fleet/verify-score-contract.mjs, and persists ONE feedback row
 * (category=solomon_self_assessment) with the common tri-party score schema, idempotent on
 * review_key. ADDITIVE to (never a replacement for) solomon-self-adherence-review.mjs, which
 * scores duty-parity (SOLOMON_LOOPS drift), a DIFFERENT concept from rubric quality. Fail-OPEN
 * on every error so it can never break a Solomon tick.
 *
 * Flags: --dry-run (compute + print, write nothing) | --force (ignore flag + cadence gate).
 *
 * ESM note: the pure core (lib/governance/role-self-score.cjs) is required directly (CJS); the
 * only ESM dep (verify-score-contract.mjs) is loaded via a string-LITERAL dynamic import so the
 * WIRE_CHECK static call-graph can trace it (mirrors adam-self-assessment-writer.cjs).
 */
const path = require('path');
const fs = require('fs');
const core = require('../lib/governance/role-self-score.cjs');
const { SOLOMON_CONFIG } = require('../lib/solomon/self-score-config.cjs');

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — claude_sessions grows unbounded
// (every session ever run); the D1 solomon-claim-violation count would silently undercount past
// row 1000 without pagination.
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../lib/db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

const REPO_ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(REPO_ROOT, '.solomon-self-assessment-state.json');

/** on|1|true => enabled; everything else (incl. undefined) => OFF. */
function isFlagEnabled(env = process.env) {
  const v = String(env.SOLOMON_SELF_SCORE_CADENCE || 'off').toLowerCase();
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
    process.stderr.write(`[solomon-self-score] state write failed (non-fatal): ${e.message}\n`);
  }
}

/** Gather observable signals (read-only, defensive: each failure => null = inconclusive). */
async function gatherSignals(sb) {
  const signals = {};

  // D1: Solomon-role sessions holding a non-null sd_key (should be 0 — Solomon never claims).
  // NOTE: claude_sessions has no `callsign` column (role lives only in metadata.role) — verified
  // directly against the live schema; do not add a `callsign` select (42703 undefined_column).
  signals.solomon_claim_count = await (async () => {
    try {
      const data = await fapPaginate(() => sb
        .from('claude_sessions')
        .select('id, sd_key, metadata')
        .not('sd_key', 'is', null)
        .order('id', { ascending: true }));
      return data.filter((r) => String((r.metadata && r.metadata.role) || '').toLowerCase() === 'solomon').length;
    } catch {
      return null;
    }
  })();

  // D2 (unbiased-perspective), D4 (judgment quality), D5 (systemic hand-off accuracy) require
  // reading verdict/consult reasoning content, not a count -- left undefined (inconclusive).
  // D3 (silence/cost-discipline quota breaches) has no durable quota-ledger table yet -- left
  // undefined rather than querying a table that doesn't exist.
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
    process.stdout.write('solomon-self-assessment: SOLOMON_SELF_SCORE_CADENCE off — no-op\n');
    process.exit(0);
  }

  try {
    const everyTurns = Number(process.env.SOLOMON_SELF_SCORE_EVERY_TURNS) || core.DEFAULT_EVERY_TURNS;
    const state = readState();
    const invocations = (Number.isFinite(state.invocations) ? state.invocations : 0) + 1;

    if (!core.shouldFire({ last_fired_turn: state.last_fired_turn }, invocations, everyTurns) && !force) {
      writeState({ ...state, invocations });
      const due = (Number.isFinite(state.last_fired_turn) ? state.last_fired_turn : 0) + everyTurns;
      process.stdout.write(`solomon-self-assessment: turn ${invocations}/${due} — not due, skip\n`);
      process.exit(0);
    }

    const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
    const sb = createSupabaseServiceClient('engineer');
    const sessionId = process.env.CLAUDE_SESSION_ID || 'solomon';
    const date = new Date().toISOString().slice(0, 10);
    const newCycle = (state.cycle || 0) + 1;

    const signals = await gatherSignals(sb);
    const { dimensions, provenance } = core.scoreDimensions(signals, SOLOMON_CONFIG);
    const belowThreshold = core.classifyBelowThreshold(dimensions, SOLOMON_CONFIG.belowThresholdAt);

    // prior cycle (most recent self-assessment row)
    let priorScore = null;
    try {
      const { data: priorRows } = await sb
        .from('feedback')
        .select('metadata')
        .eq('category', 'solomon_self_assessment')
        .order('created_at', { ascending: false })
        .limit(1);
      priorScore = priorRows && priorRows[0] && priorRows[0].metadata ? priorRows[0].metadata.score : null;
    } catch {
      priorScore = null;
    }

    const priorOutcomes = core.derivePriorOutcomes(priorScore, dimensions);
    const committedActions = core.generateCommittedActions(belowThreshold, provenance, SOLOMON_CONFIG.actionHints);
    const score = core.assembleScore({
      dimensions, cycle: newCycle, session: sessionId, committedActions, priorOutcomes, provenance, belowThreshold, date, config: SOLOMON_CONFIG,
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
      process.stdout.write(`solomon-self-assessment: REFUSED cycle ${newCycle} — ${verdict.violations.join('; ')}\n`);
      process.exit(0);
    }

    // idempotent dedup on review_key
    try {
      const { data: existing } = await sb
        .from('feedback')
        .select('id')
        .eq('category', 'solomon_self_assessment')
        .filter('metadata->>review_key', 'eq', score.review_key)
        .limit(1);
      if (existing && existing.length) {
        process.stdout.write(`solomon-self-assessment: cycle row ${score.review_key} already exists — skip\n`);
        writeState({ ...state, invocations, last_fired_turn: invocations });
        process.exit(0);
      }
    } catch {
      /* dedup check failed — proceed (a duplicate is a tolerable additive row) */
    }

    // buildFeedbackInsertRow() builds the actual insert payload -- these are its own helper
    // parameter names, not literal feedback columns. schema-lint-disable-line
    const { error: insErr } = await sb.from('feedback').insert(core.buildFeedbackInsertRow({ // schema-lint-disable-line
      category: 'solomon_self_assessment',
      score,
      belowThreshold,
      sessionId,
      title: `Solomon self-assessment — cycle ${newCycle}`,
    }));
    if (insErr) throw new Error(`feedback insert failed: ${insErr.message}`);

    writeState({ invocations, last_fired_turn: invocations, cycle: newCycle, streak: verdict.escalation ? verdict.escalation.streak : 0 });
    process.stdout.write(`solomon-self-assessment: wrote cycle ${newCycle} (${score.overall}) review_key=${score.review_key}${verdict.escalation && verdict.escalation.triggered ? ' [ESCALATE]' : ''}\n`);
    process.exit(0);
  } catch (e) {
    // FAIL OPEN — never break a Solomon tick.
    process.stderr.write(`[solomon-self-score] degraded to no-op: ${e.message}\n`);
    process.exit(0);
  }
}

module.exports = { isFlagEnabled, readState, writeState, gatherSignals, STATE_PATH };

if (require.main === module) {
  main();
}
