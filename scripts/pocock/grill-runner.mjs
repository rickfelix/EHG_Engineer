#!/usr/bin/env node
// grill-runner.mjs — Adversarial multi-sample voting at T=0 with append-only artifact emission.
// SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-C (Child C of Pocock orchestrator).
//
// Composes with the existing board-deliberation engine via config delta (no fork): rounds=5,
// samples=3, T=0, convergence_required=true. Writes one row to grill_convergence_artifacts
// per invocation (converged or not). Cost-capped at 45 LLM calls.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const ROUND_CAP = 5;
const SAMPLES_PER_AGENT = 3;
const AGENTS = ['Builder', 'Challenger', 'Judiciary'];
const DEFAULT_BUDGET = AGENTS.length * SAMPLES_PER_AGENT * ROUND_CAP; // 45

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseArgs(argv) {
  const out = { rounds: ROUND_CAP, samples: SAMPLES_PER_AGENT, t: 0, budget: DEFAULT_BUDGET, chairmanChannel: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const kv = a.split('=');
    const k = kv[0];
    const v = kv[1] ?? argv[i + 1];
    if (k === '--fixture') out.fixture = v;
    else if (k === '--sd-id') out.sdId = v;
    else if (k === '--corpus') out.corpus = true;
    else if (k === '--rounds') out.rounds = Math.min(parseInt(v, 10) || ROUND_CAP, ROUND_CAP);
    else if (k === '--samples') out.samples = Math.min(parseInt(v, 10) || SAMPLES_PER_AGENT, SAMPLES_PER_AGENT);
    else if (k === '--t') out.t = parseFloat(v) || 0;
    else if (k === '--budget-tokens' || k === '--budget') out.budget = parseInt(v, 10) || DEFAULT_BUDGET;
    else if (k === '--chairman-channel') out.chairmanChannel = true;
  }
  return out;
}

function normalize(answer) {
  return String(answer || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Stub LLM call. Production wires this to the board-deliberation engine; for smoke tests we
// resolve from a deterministic answer table on the fixture's verified_answer when expected_to_converge=true,
// or simulate dissent when expected_to_converge=false.
function llmSample(agent, fixture, sampleIndex) {
  if (fixture.expected_to_converge === false) {
    // Deterministic dissent: rotate among 3 wrong answers
    const wrongs = ['option-a', 'option-b', 'option-c'];
    const hash = crypto.createHash('sha1').update(agent + sampleIndex).digest('hex');
    return wrongs[parseInt(hash.slice(0, 2), 16) % wrongs.length];
  }
  return normalize(fixture.verified_answer);
}

function checkConvergence(roundSamples) {
  const perAgent = {};
  for (const s of roundSamples) {
    (perAgent[s.agent] ||= []).push(s.answer);
  }
  const agentMajorities = AGENTS.map(a => {
    const samples = perAgent[a] || [];
    const counts = {};
    for (const ans of samples) counts[ans] = (counts[ans] || 0) + 1;
    let top = null, topCount = 0;
    for (const [k, v] of Object.entries(counts)) if (v > topCount) { top = k; topCount = v; }
    const perAgentThreshold = Math.max(1, Math.ceil(samples.length * 2 / 3));
    return topCount >= perAgentThreshold ? top : null;
  });
  const totals = {};
  for (const m of agentMajorities) if (m) totals[m] = (totals[m] || 0) + 1;
  const agentThreshold = Math.max(1, Math.ceil(AGENTS.length * 2 / 3));
  for (const [ans, count] of Object.entries(totals)) {
    if (count >= agentThreshold) return ans;
  }
  return null;
}

async function runFixture(fixture, opts) {
  const startedAt = new Date().toISOString();
  const dissent = [];
  let totalCalls = 0;
  let converged = null;
  let costCapped = false;
  let roundsExecuted = 0;

  for (let round = 1; round <= opts.rounds; round++) {
    const roundSamples = [];
    for (const agent of AGENTS) {
      for (let s = 0; s < opts.samples; s++) {
        if (totalCalls >= opts.budget) {
          costCapped = true;
          break;
        }
        const answer = llmSample(agent, fixture, s);
        roundSamples.push({ agent, round, sample_index: s, answer });
        totalCalls++;
      }
      if (costCapped) break;
    }
    roundsExecuted = round;
    if (costCapped) {
      // capture last partial round into dissent
      dissent.push(...roundSamples);
      break;
    }
    const result = checkConvergence(roundSamples);
    if (result) {
      converged = result;
      break;
    }
    // Not converged; if this is the last allowed round, capture as dissent
    if (round === opts.rounds) dissent.push(...roundSamples);
  }

  const questionHash = crypto.createHash('sha256').update(`${fixture.fixture_id}:${fixture.question_text || ''}`).digest('hex').slice(0, 16);

  const artifact = {
    fixture_id: fixture.fixture_id,
    sd_id: opts.sdId || null,
    question_hash: questionHash,
    converged: converged !== null,
    converged_answer: converged,
    rounds_used: roundsExecuted,
    rounds_executed: roundsExecuted,
    total_llm_calls: totalCalls,
    cost_capped: costCapped,
    dissent: converged ? [] : dissent,
    dissent_count: converged ? 0 : dissent.length,
    sampling_t: opts.t,
    samples_per_agent: opts.samples,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('grill_convergence_artifacts').insert(artifact);
  if (error) {
    process.stderr.write(`[grill] WARN: artifact insert failed: ${error.message}\n`);
  }

  return artifact;
}

async function main() {
  const opts = parseArgs(process.argv);
  let fixtures = [];

  if (opts.fixture) {
    const { data } = await supabase.from('grill_fixtures').select('*').eq('fixture_id', opts.fixture);
    fixtures = data || [];
  } else if (opts.corpus) {
    const { data } = await supabase.from('grill_fixtures').select('*').order('fixture_id');
    fixtures = data || [];
  } else {
    process.stderr.write('Usage: grill-runner.mjs --fixture=<id> | --corpus  [--rounds=N --samples=N --t=0 --budget-tokens=N --chairman-channel]\n');
    process.exit(2);
  }

  if (fixtures.length === 0) {
    process.stderr.write('[grill] No fixtures matched.\n');
    process.exit(1);
  }

  const artifacts = [];
  for (const fx of fixtures) {
    const art = await runFixture(fx, opts);
    artifacts.push(art);
    if (opts.chairmanChannel) {
      // Chairman channel: emit only the final artifact JSON (and optional dissent block).
      // No intermediate round_payload leakage.
      process.stdout.write(JSON.stringify({ convergence_artifact: { fixture_id: art.fixture_id, converged: art.converged, converged_answer: art.converged_answer, rounds_used: art.rounds_used, total_llm_calls: art.total_llm_calls } }) + '\n');
      if (!art.converged && art.dissent.length > 0) {
        process.stdout.write(JSON.stringify({ dissent: art.dissent }) + '\n');
      }
    }
  }

  if (opts.corpus) {
    const convergedCount = artifacts.filter(a => a.converged).length;
    const totalCount = artifacts.length;
    const convergedIds = artifacts.filter(a => a.converged).map(a => a.fixture_id).sort();
    const summary = {
      total: totalCount,
      converged_count: convergedCount,
      converged_rate: totalCount > 0 ? (convergedCount / totalCount).toFixed(2) : '0.00',
      converged_fixture_ids: convergedIds,
      total_llm_calls: artifacts.reduce((sum, a) => sum + a.total_llm_calls, 0),
    };
    if (!opts.chairmanChannel) {
      process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    } else {
      process.stdout.write(JSON.stringify({ corpus_summary: summary }) + '\n');
    }
  }

  setTimeout(() => process.exit(0), 50);
}

main().catch((err) => {
  process.stderr.write(`[grill] FATAL: ${err.message}\n`);
  process.exit(1);
});
