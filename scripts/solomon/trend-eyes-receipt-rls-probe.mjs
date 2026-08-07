#!/usr/bin/env node
/**
 * Trend-Eyes receipt RLS probe — the BEHAVIOURAL arm of the amended merge gate.
 * SD-LEO-INFRA-TREND-EYES-OFF-001, coordinator ruling eea1b080, chairman decision 74f2a2c9.
 *
 * WHY THIS SCRIPT EXISTS, which is the whole point. The obvious post-apply check — "as a client,
 * count receipt rows; expect 0" — CANNOT FAIL, for two independent reasons measured on 2026-08-07:
 *   1. There are ZERO real receipt rows, so "0 visible" is true before and after the apply.
 *   2. anon already sees 0 of all 3,949 snapshot rows, because the exposure was never the anon
 *      lane — it is the AUTHENTICATED lane.
 * A check that returns PASS while being incapable of returning FAIL is not verification, and it
 * would have been the LAST gate before merge. This probe removes both defects: it uses a MINTED
 * AUTHENTICATED JWT (the real exposure lane) against a TEMPORARILY SEEDED receipt row (so there is
 * something that COULD be visible), and it is run in two modes so the two readings bracket the apply.
 *
 * TWO MODES, and the order is not optional:
 *   --baseline   BEFORE the apply. Seeds a synthetic receipt and asserts the authenticated role CAN
 *                see it. THIS IS THE POSITIVE CONTROL: it proves the probe detects exactly what the
 *                policy is supposed to hide. Without it, a post-apply "0 visible" is unfalsifiable.
 *                Also records the authenticated-visible count of NON-receipt rows.
 *   --verify     AFTER the apply. Seeds the same synthetic receipt and asserts it is NOT visible,
 *                AND that the non-receipt count is UNCHANGED from the baseline. The second arm is
 *                what catches an over-broad policy that closes the whole table rather than the one
 *                dimension — a failure mode that would otherwise read as a resounding success.
 *
 * THE SEED IS ALWAYS DELETED, in a finally, and is marked synthetic in three places so it can never
 * be mistaken for a real run-receipt by a later reader or by the liveness predicate.
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';

const BASELINE_FILE = '.artifacts/receipt-rls-baseline.json';
const RECEIPT_DIMENSION = 'trend_eyes_sweep_receipt';
const SYNTHETIC_MARKER = 'RLS_PROBE_SYNTHETIC_DELETE_ME';

// MODULE-SCOPED so the exit happens AFTER `finally` has deleted the seed, and outside main().
// A `return` inside the try runs finally and then leaves main() entirely — so a trailing
// `process.exit(exitCode)` at the end of main() is unreachable on exactly the failure paths that
// need it. Observed live: a FAILED verify exited 0. A gate whose failure exits 0 is worse than no
// gate, because every caller reads it as a pass.
let exitCode = 0;

/** Mint an HS256 `authenticated` JWT. No dependency — jsonwebtoken is not installed here. */
function mintAuthenticatedJwt(secret, ttlSeconds = 300) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ role: 'authenticated', aud: 'authenticated', iat: now, exp: now + ttlSeconds });
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function seedSyntheticReceipt(svc) {
  const { data, error } = await svc.from('codebase_health_snapshots').insert({
    dimension: RECEIPT_DIMENSION,
    target_application: 'EHG_Engineer',
    score: 0,
    findings: [{ synthetic: true, marker: SYNTHETIC_MARKER, note: 'RLS probe seed — delete on sight' }],
    trend_direction: 'stable',
    metadata: { source: 'trend-eyes-receipt-rls-probe.mjs', synthetic: true, marker: SYNTHETIC_MARKER },
  }).select('id').single();
  if (error) throw new Error(`seed failed: ${error.message}`);
  return data.id;
}

async function main() {
  const mode = process.argv.includes('--verify') ? 'verify'
    : process.argv.includes('--baseline') ? 'baseline' : null;
  if (!mode) { console.error('usage: trend-eyes-receipt-rls-probe.mjs --baseline | --verify'); process.exit(2); }

  const url = process.env.SUPABASE_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !svcKey || !jwtSecret || !anonKey) {
    console.error('need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, SUPABASE_ANON_KEY');
    process.exit(2);
  }

  const svc = createClient(url, svcKey);
  const token = mintAuthenticatedJwt(jwtSecret);
  // apikey stays the anon key; the Authorization bearer is what selects the `authenticated` role.
  const authed = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });

  // EXIT CODE IS SET, NEVER CALLED, inside the try.
  //
  // The first version called process.exit() directly on the failure paths. process.exit terminates
  // immediately and the `finally` NEVER RUNS — so the probe leaked its synthetic receipt row
  // precisely when it FAILED, which is the worst possible time. Observed live: two orphaned seeds
  // accumulated across two failing runs, and the second run then read "2 receipt rows visible" and
  // partly measured its own litter. A leaked synthetic receipt is not merely untidy either: the
  // liveness predicate keys on the presence and age of a receipt row, so a stray seed makes a sweep
  // that has never run look alive. Set the code, let finally delete the seed, exit afterwards.
  let seedId = null;
  try {
    seedId = await seedSyntheticReceipt(svc);

    const seen = await authed.from('codebase_health_snapshots')
      .select('id', { count: 'exact', head: true }).eq('dimension', RECEIPT_DIMENSION);
    const others = await authed.from('codebase_health_snapshots')
      .select('id', { count: 'exact', head: true }).neq('dimension', RECEIPT_DIMENSION);
    // SAME-INSTANT CONTROL, taken as close in time to the authenticated read as possible.
    // See the note on the over-broad arm below for why this replaced a baseline comparison.
    const othersSvc = await svc.from('codebase_health_snapshots')
      .select('id', { count: 'exact', head: true }).neq('dimension', RECEIPT_DIMENSION);
    if (seen.error) throw new Error(`authenticated receipt read failed: ${seen.error.message}`);
    if (others.error) throw new Error(`authenticated non-receipt read failed: ${others.error.message}`);
    if (othersSvc.error) throw new Error(`service-role non-receipt read failed: ${othersSvc.error.message}`);

    const receiptVisible = seen.count ?? 0;
    const nonReceiptVisible = others.count ?? 0;
    const nonReceiptTruth = othersSvc.count ?? 0;
    console.log(`mode=${mode} seeded=${seedId}`);
    console.log(`  receipt rows visible to AUTHENTICATED: ${receiptVisible}`);
    console.log(`  non-receipt rows visible to AUTHENTICATED: ${nonReceiptVisible}`);
    console.log(`  non-receipt rows by SERVICE-ROLE at the same instant: ${nonReceiptTruth}`);

    if (mode === 'baseline') {
      // POSITIVE CONTROL. If the seeded row is NOT visible pre-apply, the probe cannot see its own
      // subject and every later "0 visible" would be meaningless — so this is a hard failure, not a
      // curiosity. It is the difference between a control and a decoration.
      if (receiptVisible < 1) {
        console.error('\nBASELINE FAILED: the authenticated role cannot see the seeded receipt even BEFORE the policy.');
        console.error('The probe cannot detect its own subject, so a post-apply 0 would prove nothing. Fix the probe, not the gate.');
        exitCode = 3;
        return;
      }
      fs.mkdirSync('.artifacts', { recursive: true });
      fs.writeFileSync(BASELINE_FILE, JSON.stringify({
        captured_at: new Date().toISOString(),
        receipt_visible_pre_apply: receiptVisible,
        non_receipt_visible_pre_apply: nonReceiptVisible,
        note: 'Captured BEFORE the RLS policy was applied. Only obtainable in this window.',
      }, null, 2));
      console.log(`\nBASELINE PASS — positive control holds: the seeded receipt IS visible pre-apply.`);
      console.log(`Recorded to ${BASELINE_FILE}. Run --verify after the apply.`);
      return;
    }

    // verify
    if (!fs.existsSync(BASELINE_FILE)) {
      console.error(`\nVERIFY REFUSED: ${BASELINE_FILE} is missing. Without the pre-apply baseline the`);
      console.error('non-receipt arm has nothing to compare against and the receipt arm has no positive control.');
      exitCode = 3;
      return;
    }
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
    const failures = [];
    if (receiptVisible !== 0) {
      failures.push(`receipt rows STILL VISIBLE to authenticated (${receiptVisible}) — the policy is not in effect`);
    }
    // OVER-BROAD ARM — compared SAME-INSTANT against service-role, NOT against the pre-apply
    // baseline count.
    //
    // The first version of this arm compared nonReceiptVisible to the baseline number and failed
    // the moment they differed. That was wrong twice over, and it fired on its first real run:
    // codebase_health_snapshots is a LIVE table that other processes write to, so it had grown
    // 3965 -> 3966 between the two readings — a spurious FAIL caused by an unrelated insert. Worse,
    // it reported that INCREASE as "the policy is OVER-BROAD and closed rows it should not have",
    // when over-broad means visibility goes DOWN. A confidently-wrong diagnosis at the final gate.
    //
    // Comparing the two ROLES at the same instant removes the time axis entirely: whatever the
    // table's size right now, an authenticated client must see exactly the same NON-receipt rows a
    // service-role client sees. Any shortfall is the policy reaching beyond its dimension.
    if (nonReceiptVisible !== nonReceiptTruth) {
      const verb = nonReceiptVisible < nonReceiptTruth ? 'OVER-BROAD — it hid rows outside its dimension' : 'INCOHERENT — authenticated sees MORE than service-role, which should be impossible';
      failures.push(`non-receipt visibility differs from ground truth at the same instant (authenticated ${nonReceiptVisible} vs service-role ${nonReceiptTruth}) — the policy is ${verb}`);
    }
    console.log(`  (baseline receipt-visible pre-apply was ${baseline.receipt_visible_pre_apply} — the positive control)`);
    if (failures.length) {
      console.error('\nVERIFY FAILED:');
      for (const f of failures) console.error(`  - ${f}`);
      exitCode = 1;
      return;
    }
    console.log('\nVERIFY PASS — both arms green:');
    console.log('  receipt dimension hidden from authenticated (and the baseline proved it was visible before)');
    console.log('  every other dimension unchanged (policy is scoped, not over-broad)');
  } finally {
    if (seedId) {
      const { error } = await svc.from('codebase_health_snapshots').delete().eq('id', seedId);
      console.log(error ? `  WARNING: seed ${seedId} NOT deleted: ${error.message}` : `  seed ${seedId} deleted`);
      if (error) exitCode = Math.max(exitCode, 2); // a leaked seed is itself a failure to report
    }
  }
}

main()
  .then(() => { if (exitCode) process.exit(exitCode); })
  .catch((e) => { console.error(`probe failed: ${e.message}`); process.exit(2); });
