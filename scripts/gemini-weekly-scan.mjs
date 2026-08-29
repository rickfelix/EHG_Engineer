#!/usr/bin/env node
/**
 * Weekly Gemini model scan (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-I).
 *
 * I/O shell: fetches the Gemini model catalog, diffs against the committed
 * known-models store, classifies lifecycle, smoke-evaluates GA (or explicitly
 * cited-terms-excepted) survivors under the $5/cycle + $1/candidate cost caps, and
 * writes AT MOST one feedback-table recommendation per surviving candidate. Silent
 * when nothing changed. All decision logic lives in lib/gemini-scan/* as pure,
 * injectable functions -- this file is the ONLY place that touches network/DB/fs.
 *
 * The known-models JSON write and the feedback insert are the ONLY two writes this
 * script performs (TR-2) -- it never touches .env or lib/config/model-config.js
 * (see tests/unit/gemini-scan/write-path-separation.test.js).
 *
 * Usage:
 *   node scripts/gemini-weekly-scan.mjs --dry-run   (fixture-driven, zero network/spend/DB writes)
 *   node scripts/gemini-weekly-scan.mjs             (live: fetches, evaluates, writes)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { fetchGeminiModels } from '../lib/gemini-scan/models-api-client.js';
import { classifyLifecycle } from '../lib/gemini-scan/lifecycle-classifier.js';
import { diffModels } from '../lib/gemini-scan/diff-known-models.js';
import { withinCycleCap, withinPerCandidateCap } from '../lib/gemini-scan/cost-cap.js';
import { evaluateCandidate } from '../lib/gemini-scan/candidate-eval.js';
import { buildRecommendation } from '../lib/gemini-scan/recommendation-builder.js';
import { emitFeedback } from '../lib/governance/emit-feedback.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWN_MODELS_PATH = path.join(__dirname, '..', 'docs', 'reference', 'gemini-known-models.json');

function readKnownModels(readFile = fs.readFileSync) {
  const raw = readFile(KNOWN_MODELS_PATH, 'utf8');
  return JSON.parse(raw).models;
}

function writeKnownModels(models, writeFile = fs.writeFileSync) {
  const payload = {
    _comment: 'SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-I: committed known-models store diffed against by the weekly scan.',
    seeded_at: new Date().toISOString().slice(0, 10),
    models,
  };
  writeFile(KNOWN_MODELS_PATH, JSON.stringify(payload, null, 2) + '\n');
}

/** Fixture-driven executor for --dry-run and tests -- zero network calls. */
function dryRunExecutor() {
  return { ok: true, costUsd: 0.01, latencyMs: 50 };
}

/**
 * Pure(ish) orchestration core -- takes every I/O dependency injected so it is fully
 * unit-testable. Returns the write intents rather than performing them, so the caller
 * (main()) is the only place an actual write happens.
 */
export async function runScan({ fetched, known, executor, ctExceptions = new Set(), now = () => new Date().toISOString() }) {
  const { newModels, changedModels } = diffModels(fetched, known);
  const candidates = [...newModels, ...changedModels];
  const recommendations = [];
  const filtered = [];
  let cycleSpentUsd = 0;

  for (const candidate of candidates) {
    const lifecycle = classifyLifecycle(candidate.id);
    if (lifecycle !== 'GA' && !ctExceptions.has(candidate.id)) {
      filtered.push({ modelId: candidate.id, reason: `non-GA (${lifecycle}) with no cited-terms exception` });
      continue;
    }
    // Evaluate against the estimated per-candidate cost BEFORE spending, then true-up after.
    const evalResult = await evaluateCandidate(candidate.id, executor);
    if (!withinPerCandidateCap(evalResult.costUsd)) {
      filtered.push({ modelId: candidate.id, reason: `per-candidate cost $${evalResult.costUsd.toFixed(4)} exceeds cap` });
      continue;
    }
    if (!withinCycleCap(cycleSpentUsd, evalResult.costUsd)) {
      filtered.push({ modelId: candidate.id, reason: 'cycle cost cap reached' });
      continue;
    }
    cycleSpentUsd += evalResult.costUsd;
    recommendations.push(buildRecommendation({
      modelId: candidate.id,
      lifecycle,
      evalResult,
      retrievedAt: now().slice(0, 10),
    }));
  }

  return { recommendations, filtered, updatedKnownModels: [...known, ...newModels] };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const known = readKnownModels();

  const fetched = dryRun
    ? [...known, { id: 'gemini-dry-run-fixture', displayName: 'Dry Run Fixture', description: 'fixture' }]
    : await fetchGeminiModels();

  const executor = dryRun ? dryRunExecutor : async () => {
    throw new Error('gemini-weekly-scan: live candidate executor not wired in this cut -- run with --dry-run, or wire a real Gemini-call executor before scheduling live runs.');
  };

  const { recommendations, filtered, updatedKnownModels } = await runScan({ fetched, known, executor, ctExceptions: new Set() });

  if (filtered.length) {
    console.log(`[gemini-weekly-scan] filtered ${filtered.length} candidate(s):`, filtered);
  }

  if (!recommendations.length) {
    console.log('[gemini-weekly-scan] no delta -- nothing to recommend.');
    return;
  }

  if (dryRun) {
    console.log(`[gemini-weekly-scan] (dry-run) would write ${recommendations.length} recommendation(s):`, recommendations);
    return;
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  for (const rec of recommendations) {
    await emitFeedback({
      supabase,
      title: `Gemini model candidate: ${rec.metadata.model_id}`,
      description: rec.description,
      category: rec.category,
      metadata: rec.metadata,
    });
  }
  writeKnownModels(updatedKnownModels);
  console.log(`[gemini-weekly-scan] wrote ${recommendations.length} recommendation(s), updated known-models store.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('[gemini-weekly-scan] failed:', err.message);
    process.exit(1);
  });
}
