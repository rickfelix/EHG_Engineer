#!/usr/bin/env node
// weekly-deepening-report.mjs — Friday cron entry point.
//
// Reads unconsumed architectural_prevention_findings rows, applies Deletion
// Test scoring (vanish/concentrate/real_seam) via lib/deletion-test.mjs, and
// emits ≥3 draft SD-LEO-DEEPEN-* rows with metadata.deletion_score +
// metadata.adapter_count + metadata.source_finding_id populated.
//
// Idempotent: weekly_report_consumed_at is set atomically via
// UPDATE … WHERE consumed_at IS NULL RETURNING id; concurrent runs cannot
// double-emit. Vocabulary discipline: each candidate description must
// reference ≥1 Child A CONTEXT.md glossary term (configurable via
// --skip-vocab for dry-run).
//
// SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-D (Child D, Phase 2).

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { scoreWithAdapterRule } from './lib/deletion-test.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseArgs(argv) {
  const out = { emit: false, dryRun: false, minCandidates: 3, skipVocab: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const [k, v] = a.split('=');
    if (k === '--emit-sds') out.emit = true;
    else if (k === '--dry-run') out.dryRun = true;
    else if (k === '--skip-vocab') out.skipVocab = true;
    else if (k === '--min-candidates') out.minCandidates = parseInt(v ?? argv[i + 1], 10) || 3;
  }
  return out;
}

function loadGlossaryTerms() {
  // Read Child A's CONTEXT.md (if present) and return the set of glossary
  // headings. Fall back to empty set when CONTEXT.md is missing — vocab
  // discipline is then advisory.
  const candidates = ['CONTEXT.md', path.join(__dirname, '..', '..', 'CONTEXT.md')];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const body = fs.readFileSync(p, 'utf8');
      const terms = new Set();
      for (const m of body.matchAll(/^#{2,3}\s+([A-Za-z][\w \-/]{2,60})\s*$/gm)) {
        terms.add(m[1].trim().toLowerCase());
      }
      return { terms, source: p };
    }
  }
  return { terms: new Set(), source: null };
}

function descriptionMatchesGlossary(description, glossaryTerms) {
  if (!glossaryTerms || glossaryTerms.size === 0) return true;
  const low = (description || '').toLowerCase();
  for (const t of glossaryTerms) {
    if (low.includes(t)) return true;
  }
  return false;
}

async function consumeFindingAtomically(findingId) {
  // Atomic single-emission: UPDATE … WHERE consumed_at IS NULL RETURNING id.
  // If the row was already consumed by a concurrent run, returns empty.
  const { data, error } = await supabase
    .from('architectural_prevention_findings')
    .update({ weekly_report_consumed_at: new Date().toISOString() })
    .eq('id', findingId)
    .is('weekly_report_consumed_at', null)
    .select('id, source_rca_id, source_sd_key, finding, suggested_deepening');
  if (error) throw error;
  return (data && data.length > 0) ? data[0] : null;
}

async function emitDraftSD(finding, score, adapterCount, glossaryTerms) {
  const sdKey = `SD-LEO-DEEPEN-${finding.id.slice(0, 8).toUpperCase()}`;
  const description = [
    `Pocock Deletion Test candidate (auto-emitted by weekly-deepening-report).`,
    `Source finding: ${finding.id} (source_sd_key=${finding.source_sd_key || 'unknown'}).`,
    `Suggested deepening: ${finding.suggested_deepening || finding.finding || '(no detail)'}`,
  ].join('\n');
  if (!descriptionMatchesGlossary(description, glossaryTerms)) {
    return { skipped: true, reason: 'vocab-violation', finding_id: finding.id };
  }
  const insert = {
    id: sdKey,
    sd_key: sdKey,
    sd_code_user_facing: sdKey,
    title: `Deepening candidate: ${(finding.suggested_deepening || finding.finding || '').slice(0, 80)}`,
    description,
    scope: `Architectural deepening candidate from RCA-derived finding ${finding.id}. Deletion Test score=${score}, adapter_count=${adapterCount}.`,
    rationale: `Auto-emitted Pocock Deletion Test candidate (score=${score}, adapter_count=${adapterCount}). Originating finding ${finding.id} suggested deepening: ${finding.suggested_deepening || finding.finding || '(no detail)'}. Awaits chairman triage.`,
    category: 'feature',
    status: 'draft',
    priority: 'medium',
    current_phase: 'LEAD',
    created_by: 'pocock-weekly-deepening-cron',
    metadata: {
      deletion_score: score,
      adapter_count: adapterCount,
      source_finding_id: finding.id,
      source_rca_id: finding.source_rca_id,
      parent_sd_key: 'SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001',
      emitted_by_cron: 'pocock-weekly-deepening',
      emitted_at: new Date().toISOString(),
    },
  };
  const { error } = await supabase.from('strategic_directives_v2').upsert(insert, { onConflict: 'id' });
  if (error) return { skipped: true, reason: error.message, finding_id: finding.id };
  return { skipped: false, sd_key: sdKey, finding_id: finding.id };
}

async function emitFailureFeedback(message) {
  // Read most recent prior failure within 8 days (escalation rule).
  const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const { data: prior } = await supabase
    .from('feedback')
    .select('id, severity, created_at')
    .eq('category', 'pocock_weekly_deepening_failure')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  const severity = (prior && prior.length > 0) ? 'high' : 'medium';
  await supabase.from('feedback').insert({
    title: `pocock-weekly-deepening-cron failed: ${message.slice(0, 80)}`,
    description: message,
    category: 'pocock_weekly_deepening_failure',
    severity,
    type: 'issue',
    source_application: 'pocock-weekly-deepening-cron',
    source_type: 'auto_capture',
    status: 'new',
  });
  process.stderr.write(`[pocock-weekly-deepening] FAILURE (severity=${severity}): ${message}\n`);
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.emit && !opts.dryRun) {
    process.stderr.write('Usage: weekly-deepening-report.mjs --emit-sds | --dry-run  [--min-candidates=N] [--skip-vocab]\n');
    process.exit(2);
  }

  const glossary = opts.skipVocab ? { terms: new Set(), source: null } : loadGlossaryTerms();

  // Read unconsumed findings.
  const { data: findings, error } = await supabase
    .from('architectural_prevention_findings')
    .select('id, source_rca_id, source_sd_key, finding, suggested_deepening')
    .is('weekly_report_consumed_at', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) {
    await emitFailureFeedback(`SELECT findings failed: ${error.message}`);
    process.exit(1);
  }
  if (!findings || findings.length < opts.minCandidates) {
    const msg = `Insufficient unconsumed findings (${(findings || []).length} < ${opts.minCandidates})`;
    if (opts.dryRun) {
      process.stdout.write(JSON.stringify({ dry_run: true, candidates_available: (findings || []).length, message: msg }) + '\n');
      process.exit(0);
    }
    await emitFailureFeedback(msg);
    process.exit(1);
  }

  if (opts.dryRun) {
    process.stdout.write(JSON.stringify({ dry_run: true, candidates_available: findings.length }) + '\n');
    setTimeout(() => process.exit(0), 50);
    return;
  }

  // Emit drafts.
  const emitted = [];
  const skipped = [];
  for (const finding of findings) {
    const consumed = await consumeFindingAtomically(finding.id);
    if (!consumed) { skipped.push({ finding_id: finding.id, reason: 'already-consumed' }); continue; }
    // Heuristic: caller/adapter counts are not yet wired to a real
    // dependency graph; the cron MVP scores from synthetic fields on the
    // finding row (extension hook is finding.metadata if present).
    const callerCount = finding.metadata?.caller_count ?? 4;
    const adapterCount = finding.metadata?.adapter_count ?? 1;
    const score = scoreWithAdapterRule(callerCount, adapterCount);
    const res = await emitDraftSD(consumed, score, adapterCount, glossary.terms);
    if (res.skipped) skipped.push(res);
    else emitted.push(res);
    if (emitted.length >= 10) break; // bound emissions per run
  }

  if (emitted.length < opts.minCandidates) {
    const msg = `Emitted ${emitted.length} < ${opts.minCandidates}; skipped=${skipped.length}; first_skip_reason=${skipped[0]?.reason || 'n/a'}`;
    await emitFailureFeedback(msg);
    process.stderr.write(JSON.stringify({ emitted, skipped, glossary_source: glossary.source }) + '\n');
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({
    emitted_count: emitted.length,
    skipped_count: skipped.length,
    emitted_sd_keys: emitted.map(e => e.sd_key),
    glossary_source: glossary.source,
  }, null, 2) + '\n');
  setTimeout(() => process.exit(0), 50);
}

main().catch(async (err) => {
  try { await emitFailureFeedback(`Uncaught: ${err.message}`); } catch (_) { /* swallow */ }
  process.stderr.write(`[pocock-weekly-deepening] FATAL: ${err.message}\n`);
  process.exit(1);
});
