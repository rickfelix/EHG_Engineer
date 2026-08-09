#!/usr/bin/env node
/**
 * FR-4 — the NAMED READER. (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-002)
 *
 * WHY THIS FILE EXISTS AT ALL. The producer half of this SD emits `repo_path` and
 * `creator_kinds` onto every OPERATOR_CONTRACT verdict. Emitting them and stopping would have
 * shipped a produced output that nothing consumes — the literal verdict that gate emits, and
 * the defect class the whole SD was written to catch. It nearly happened: the PRD's first
 * draft named the gate's own failing `console.log` as the consumer, and TESTING pointed out
 * that line lives INSIDE createOperatorContractGate, the same function that builds `details`.
 * The gate's own remediation text refuses exactly that — producer-side proof that the write
 * HAPPENED is what it exists to reject — so nominating it would have been self-refuting, and
 * a console-spy test would have pinned a source fact rather than a behaviour.
 *
 * WHAT IT DOES. Reads back a recorded verdict and RE-RUNS the gate's own predicate against the
 * tree that verdict named, then reports whether the recorded answer reproduces. That is this
 * SD's headline acceptance criterion made executable rather than asserted.
 *
 * `collect` and `detect` are injectable so the test drives real logic without shelling to git.
 */
import { collectSdDiff } from '../lib/gates/operator-contract/harness-adapter.js';
import { detectCreator } from '../lib/gates/operator-contract/index.js';

/** Same-set comparison — creator_kinds is a set in list clothing; order is not meaning. */
function sameKinds(a, b) {
  const x = [...new Set(a || [])].sort();
  const y = [...new Set(b || [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * @returns {Promise<{reproducible: boolean, why?: string, repo_path?: string,
 *                    recorded?: string[], observed?: string[], reproduced?: boolean}>}
 */
export async function explainOperatorContract(supabase, sdKey, { collect = collectSdDiff, detect = detectCreator } = {}) {
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2').select('id').eq('sd_key', sdKey).maybeSingle();
  // PostgREST resolves query errors as { data: null, error } rather than throwing, so an
  // unchecked read here would degrade into "no such SD" and blame the caller.
  if (sdErr) return { reproducible: false, why: `strategic_directives_v2 read failed: ${sdErr.message}` };
  if (!sd) return { reproducible: false, why: `no SD found with sd_key ${sdKey}` };

  const { data: rows, error } = await supabase
    .from('sd_phase_handoffs').select('created_at, validation_details, metadata')
    .eq('sd_id', sd.id).order('created_at', { ascending: false }).limit(25);
  if (error) return { reproducible: false, why: `sd_phase_handoffs read failed: ${error.message}` };

  const row = (rows || []).find((r) => r?.metadata?.gate_results?.OPERATOR_CONTRACT);
  if (!row) return { reproducible: false, why: 'no recorded OPERATOR_CONTRACT verdict on this SD' };

  const verdict = row.metadata.gate_results.OPERATOR_CONTRACT;
  const details = verdict.details || {};
  const repoPath = details.repo_path;
  const recorded = details.creator_kinds;

  // An OLD row predates the producer fix and legitimately names no tree. Degrading honestly
  // matters more than it looks: throwing here would make "this verdict is too old to check"
  // indistinguishable from "the reader is broken".
  if (!repoPath) {
    return { reproducible: false, why: 'verdict names no tree (recorded before repo_path was emitted)', recorded };
  }

  // GAP-1: re-run against the PINNED base, not the moving default. Without this the reader
  // diffs against wherever origin/main happens to be NOW, so the same recorded verdict changes
  // answer as main advances — measured flipping reproduced:true -> false on a byte-identical
  // tree. `reproduced:false` must mean the tree disagrees, never "time passed".
  const baseSha = details.base_sha;
  let observed;
  try {
    const diff = collect(baseSha ? { appPath: repoPath, baseRef: baseSha } : { appPath: repoPath });
    observed = detect({ changedFiles: diff.changedFiles, migrations: diff.migrations }).creator_kinds;
  } catch (e) {
    return { reproducible: false, why: `cannot read the named tree: ${e?.message || e}`, repo_path: repoPath, recorded };
  }

  return {
    reproducible: true, repo_path: repoPath, recorded: recorded || [], observed,
    reproduced: sameKinds(recorded, observed),
    // Surfaced so a reader can see WHICH endpoints were used. An unpinned verdict (recorded
    // before base_sha shipped) is still explained, but says so rather than implying rigour.
    base_sha: baseSha || null, pinned: Boolean(baseSha),
  };
}

const USAGE = `explain-operator-contract.mjs <SD-KEY>

Re-runs the operator-contract predicate against the tree a recorded verdict NAMED, and reports
whether the recorded creator_kinds reproduces. Read-only: it never writes.

Exit codes: 0 reproduced · 1 did NOT reproduce · 2 bad usage or nothing to check.
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length !== 1 || args[0].startsWith('-')) {
    process.stdout.write(USAGE);
    process.exit(args.includes('--help') ? 0 : 2);
  }
  const { createClient } = await import('@supabase/supabase-js');
  await import('dotenv/config');
  // ANON, NOT SERVICE-ROLE (SECURITY row 4a1d302b). This job is read-only, and SECURITY
  // MEASURED that anon suffices for both tables it touches. It matters more than usual here:
  // this is the one process that runs git tooling against a DATABASE-SUPPLIED path, and a
  // hostile repo's .git/config can execute a command that inherits this process's env. Holding
  // the highest-privilege secret in exactly that process turns a local integrity problem into
  // credential theft. Service-role is available as a fallback only so the tool still works
  // where anon is unavailable.
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(process.env.SUPABASE_URL, key);
  const out = await explainOperatorContract(supabase, args[0]);
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  if (!out.reproducible) process.exit(2);
  process.exit(out.reproduced ? 0 : 1);
}

// Canonical entry guard. A hand-rolled file:// comparison is corpus instances 5, 8 and 10 of
// this SD's own founding set — on Windows the template builds two slashes where import.meta.url
// has three, main() never runs, and the tool exits 0 having done nothing.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { process.stderr.write(`FATAL: ${e?.message || e}\n`); process.exit(2); });
}
