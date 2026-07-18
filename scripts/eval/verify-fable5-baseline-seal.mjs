/**
 * CLI: attest the Fable-5 golden-task baseline seal is complete before the Fable
 * window closes (~2026-07-19). SD-LEO-INFRA-TIME-CRITICAL-SEAL-001 FR-1/FR-3.
 *
 * Reads the sealed corpus DB-side (feedback.category='model_capability_baseline'),
 * runs the pure verifier, and prints a machine-readable verdict. Redaction: never
 * prints task_text or answer_key (contamination guard) — only counts/shape/hash.
 *
 * Usage: npm run eval:verify-fable5-seal
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { verifyBaselineSeal, SEAL_SUITE } from '../../lib/eval/verify-baseline-seal.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  const { data, error } = await supabase
    .from('feedback')
    .select('id, metadata')
    .eq('category', 'model_capability_baseline');
  if (error) {
    console.error(`Fatal: baseline corpus read failed: ${error.message}`);
    // Same process.exitCode reasoning as below — a forced process.exit() right after
    // this Supabase query returns is exactly when its HTTP handle is still closing;
    // this branch is even MORE likely to hit the libuv race than the success path.
    process.exitCode = 1;
    return;
  }

  const result = verifyBaselineSeal(data || []);

  console.log(`Fable-5 Baseline Seal Verification (${SEAL_SUITE})`);
  console.log('='.repeat(60));
  console.log(`Verdict: ${result.verdict}`);
  console.log(`Answer keys: ${result.stats.keys} | Sealed runs: ${result.stats.runs} | Tasks: ${result.stats.tasks}`);
  console.log(`Shapes covered: ${result.stats.shapes_covered.sort().join(', ')}`);
  console.log(`Telemetry-complete tiers: ${result.stats.telemetry_complete_tiers.join(', ') || 'none'}`);
  if (result.reasons.length) {
    console.log('\nBLOCKING reasons:');
    for (const r of result.reasons) console.log(`  - ${r}`);
  }
  if (result.warnings.length) {
    console.log('\nWarnings (known limitations, non-blocking):');
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
  console.log(`\nBASELINE_SEAL_VERDICT=${JSON.stringify({ verdict: result.verdict, stats: result.stats })}`);

  // SEALED => the window-critical artifact is secured (exit 0). INCOMPLETE => the
  // answers/keys have a real gap that must be closed while Fable is still live.
  // process.exitCode (not process.exit()) lets the event loop drain naturally —
  // a forced exit() here races the Supabase client's still-closing HTTP handle and
  // crashes with a Windows libuv assertion (UV_HANDLE_CLOSING) AFTER the verdict is
  // printed, corrupting the real exit code to 127. A CI step keying on $? (rather
  // than parsing the BASELINE_SEAL_VERDICT line) would misread a genuine SEALED
  // result as a failure.
  process.exitCode = result.verdict === 'SEALED' ? 0 : 1;
}

main().catch((err) => {
  // Round-2 adversarial /ship review finding: set exitCode BEFORE the console.error
  // call, not after — if the error write itself throws (e.g. EPIPE on a closed pipe),
  // the exit-code assignment must already be in effect, or the process could fall
  // through to the default exit code (0) for what should be a hard failure.
  process.exitCode = 1;
  try {
    console.error(`Fatal: unexpected error: ${err?.message || err}`);
  } catch { /* stderr write failed — exitCode is already set above */ }
});
