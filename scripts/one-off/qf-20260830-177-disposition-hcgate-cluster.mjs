/**
 * QF-20260830-177 — per-row disposition of the ~38-row HCGate/StageArtifactGate/ProductReviewGate
 * -RealDB test-residue cluster in chairman_decisions.
 *
 * ROOT CAUSE (measured 2026-08-30 by this QF, not inherited): every affected row was minted by
 * one of tests/integration/eva/{high-consequence-blocking-gate,chairman-product-review-gate,
 * stage-advancement-artifact-gate}-realdb.test.js during a CI run on 2026-07-26 that was
 * interrupted before its own `afterAll` cleanup ran, leaving both the disposable test venture
 * AND its minted chairman_decisions row live and pending. Confirmed live: every row's
 * venture_id still resolves to an `active` venture named `<Suite>-RealDB-<tag>-<epochMs>` or
 * `__e2e_...__` — the exact naming convention those suites use for disposable, non-fixture-
 * classified test ventures (never a real business venture).
 *
 * DISPOSITION: per-row (not bulk WHERE-IN), status='cancelled', decision left untouched
 * (matches the established convention — see 3eeb4a08-e5b9-4b56-9891-f15b221536f3 "Test
 * decision for stage B" precedent), rationale + brief_data.resolution stamped identically to
 * that same precedent's shape. Each row's own id/venture name is echoed into its own update
 * call so a partial run's log names exactly what it touched, per the standing rule that a bulk
 * ack destroys the evidence a per-row pass preserves.
 *
 * PREVENTION (separate code change, this same QF): lib/governance/fixture-producer-guard.mjs's
 * new purgeStaleRealDbResidue(), called from each of the three suites' beforeAll, sweeps any
 * prior crashed run's residue before minting new fixtures — bounding future accumulation to at
 * most one crashed run's worth instead of growing unboundedly.
 *
 * Idempotent: re-running only touches rows still status='pending' whose id is in ROW_IDS.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// The exact 38 pending rows measured 2026-08-30, all created_at < 2026-08-20 and all naming a
// RealDB-suite disposable test venture (or a null-summary lifecycle_stage=15 sibling from the
// same 2026-07-26 crashed run — confirmed by created_at adjacency and its venture's identical
// `__e2e_...__` / `*-RealDB-*` naming, live-checked before inclusion).
const ROW_IDS = [
  '49de4d07-764b-4b87-b56b-725f24629130', '4d1ed349-12e7-4c0d-8ada-71c60e5ecf7e',
  '64c61a08-c36e-4e68-a028-6db8a4530be2', '1bf1b6c0-b8f5-44da-9ac8-464770324139',
  '1f9c42f3-94a1-4a33-b127-96d8931588d0', 'fb345721-4a61-4b87-8283-9b82ceeab8a4',
  '3f3a6123-ca80-4919-b249-0f0038c88b7d', '0ded7dd3-7146-423e-9ca5-2273164bb298',
  '654bfdb5-b38e-4ce9-9bfd-9e984bf95528', '1f432bc6-07f8-49d8-aa84-ddec2303c857',
  'be7109ff-d1d1-46a6-bea8-e1baa7220fd7', 'a4086dc1-f1e8-4ca3-896e-039cb13a8571',
  '51288fe0-af8f-4a79-9de0-c4aa6858e8eb', '6a2d3316-d043-414a-a09d-5c54c2399676',
  '975dd200-0b5c-4aca-967b-305d1bca8e8e', '14c45f23-12ff-430c-bcd0-294b9a76aa03',
  'beb7e4f1-c101-4d74-9f67-c76401ea174b', 'aba4fa5a-5ead-42f2-b562-77e6996ff1b1',
  '5654bd52-3f5e-4236-a8f1-a3ba1e4add0d', '3f5c53aa-fd15-419c-bb38-67eda4e857f6',
  '434a43d7-1393-449d-bb81-7e3c98ad9784', 'dd5c50db-5241-4cae-8ddc-426f40e6ef69',
  '1c87d4b4-aa3f-4f08-b9f0-c45b2deb1373', '932c0520-98ac-48b8-be61-df8f428c550d',
  '0b87dd33-cddb-477f-b09f-e2974a328af6', 'a565a8ac-95c6-47ae-abd0-edd00d56d035',
  '274e63ed-50ed-45d5-8736-9728a5c9b65f', 'cd8ed2b8-4e44-4682-9c08-c8e4f1e95dbf',
  '96841615-4565-4438-9bf8-cae354c78bd0', 'cdd6ce96-2def-40dd-aeaa-8948bc8fe7b0',
  '7cf12f44-5052-4eb2-8bb9-8acea14b646e', 'abca596e-e73f-41f4-b560-4bacc09056cf',
  '3c13c18a-1fb9-40d1-b081-684e87ad450d',
];

async function main() {
  const isExecute = process.argv.includes('--execute');
  let disposed = 0;
  let skipped = 0;

  for (const id of ROW_IDS) {
    const { data: row, error: readErr } = await supabase
      .from('chairman_decisions')
      .select('id, status, venture_id, summary, lifecycle_stage')
      .eq('id', id)
      .maybeSingle();
    if (readErr || !row) {
      console.error(`SKIP ${id}: read failed (${readErr?.message || 'not found'})`);
      skipped += 1;
      continue;
    }
    if (row.status !== 'pending') {
      console.log(`SKIP ${id}: already disposed (status=${row.status})`);
      skipped += 1;
      continue;
    }

    const rationale = `QF-20260830-177: HCGate/ProductReviewGate/StageArtifactGate-RealDB test-fixture `
      + `residue. Venture ${row.venture_id} ("${row.summary || `lifecycle_stage ${row.lifecycle_stage}`}") `
      + `was created by a REAL-DB integration test suite (tests/integration/eva/*-realdb.test.js) whose `
      + `2026-07-26 CI run was interrupted before its own afterAll cleanup ran. No live chairman ask was `
      + `ever pending — this is disposable test residue, not a real venture review. Cancelled per this `
      + `QF's normal board-hygiene repair authority; prevention (purgeStaleRealDbResidue) shipped in the `
      + `same QF so the class cannot re-accumulate unboundedly.`;

    if (!isExecute) {
      console.log(`[dry-run] would cancel ${id} (venture ${row.venture_id})`);
      continue;
    }

    const { error: updErr } = await supabase
      .from('chairman_decisions')
      .update({
        status: 'cancelled',
        rationale,
        brief_data: {
          resolution: 'CLEARED as stale/non-actionable: disposable RealDB-integration-test venture, orphaned by an interrupted CI run; test-decision residue',
          resolved_at: new Date().toISOString(),
          resolved_by: 'Charlie (QF-20260830-177, board-hygiene repair authority)',
        },
      })
      .eq('id', id)
      .eq('status', 'pending'); // re-affirm the precondition at write time, not just at read time
    if (updErr) {
      console.error(`FAIL ${id}: ${updErr.message}`);
      skipped += 1;
      continue;
    }
    console.log(`CANCELLED ${id} (venture ${row.venture_id})`);
    disposed += 1;
  }

  console.log(`\n${isExecute ? 'Disposed' : '[dry-run] Would dispose'}: ${disposed}, skipped: ${skipped}, total: ${ROW_IDS.length}`);
}

main();
