#!/usr/bin/env node
/**
 * Closes QF-20260912-049 ("markRatificationEncoded never refuses an
 * approximate-pin-tier live encode") as investigated-not-a-defect, not a shipped fix.
 *
 * Filed from a LEAD-phase validation-agent finding (evidence row
 * bf346719-5922-4d39-b98b-2f8081e5e4b0) while triaging SD-LEO-INFRA-RATIFICATION-VERIFY-PINNED-COMMIT-001
 * (cancelled as a duplicate of the completed SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001).
 *
 * On investigation, this is the system working as designed, not a gap:
 * - lib/chairman/pinned-contract-read.mjs documents tier 2 (approximate_encoded_at_pin) as a
 *   legitimate, weaker-but-real evidence tier (a reconstruction: "the last commit touching that
 *   file at or before encoded_at"), distinct from tier 3 (no pin at all, which IS refused).
 * - markRatificationEncoded's refusal branch (ratification-writer.mjs:600-613) carries an explicit
 *   doctrine comment: widening refusal beyond reason==='no_commit_pin' to any other "could not
 *   fully check" outcome was considered and REJECTED as ratified doctrine (QF-20260901-107 /
 *   SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A/B), confirmed live against 12 pre-existing tests that
 *   assert the encode PROCEEDS on exactly these outcomes. A tier-2 approximate-but-resolved pin is
 *   not in that exclusion list at all -- it is a case that COULD be checked and WAS verified, just
 *   against weaker evidence, not a "could not check" case.
 * - Nothing is lost or conflated for a downstream reader: chairman_ratification_verifications
 *   already stores pin_tier as its own column on every row (verified or not), so
 *   "WHERE outcome='verified' AND pin_tier='approximate_encoded_at_pin'" already recovers the
 *   distinction this QF worried was silently discarded. Live check: 43 verified|approximate rows,
 *   31 verified|exact rows, both fully queryable today.
 * - lib/chairman/__tests__/ratification-multi-target-verification.test.js already asserts that
 *   approximate-tier evidence is named/distinguishable in refusal messaging ("names the pin tier
 *   in the refusal so approximate evidence is distinguishable"), reinforcing that the intended
 *   design is honest labeling of tier, not blanket refusal of tier 2.
 *
 * Making tier-2-verified marks refuse (as this QF's title proposed) would reopen ratified
 * doctrine on a chairman-facing, freeze-triggered ledger without chairman sign-off, and would
 * contradict the 12 existing tests cited above. Not attempted.
 *
 * The one genuine, narrow, safe finding from the same validation pass (surfacing the already-
 * distinguishable pin_tier split as a standing count in a human-facing report) is tracked
 * separately as QF-20260912-125, which is unaffected by this closure.
 *
 * Run once: node scripts/one-off/close-qf-20260912-049-not-a-defect.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { setQuickFixStatus } = require('../../lib/quick-fix/status-writer.cjs');

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const now = new Date().toISOString();
const notes = [
  'CANCELLED — investigated and found not a defect; the system already works as ratified doctrine intends.',
  '',
  'On code review (lib/chairman/ratification-writer.mjs, lib/chairman/pinned-contract-read.mjs),',
  'a tier-2 approximate pin is documented as legitimate, weaker-but-real evidence, distinct from',
  'tier 3 (no pin at all, which markRatificationEncoded already refuses). The refusal branch',
  '(ratification-writer.mjs:600-613) carries an explicit doctrine comment: widening refusal beyond',
  'reason===\'no_commit_pin\' to other "could not check" outcomes was considered and REJECTED as',
  'ratified doctrine (QF-20260901-107 / SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A/B), confirmed live',
  'against 12 pre-existing tests asserting the encode proceeds on exactly those outcomes. A',
  'tier-2-verified mark is not in that exclusion list -- it is a case that WAS checked, just with',
  'weaker (reconstructed) evidence, not a "could not check" case.',
  '',
  'Nothing is silently lost: chairman_ratification_verifications already stores pin_tier as its',
  'own column on every row, so a reader can already distinguish verified|exact from',
  'verified|approximate. Live check at close time: 43 verified|approximate rows, 31 verified|exact',
  'rows, both fully queryable.',
  '',
  'Making tier-2-verified marks refuse would reopen ratified doctrine on a chairman-facing,',
  'freeze-triggered ledger without chairman sign-off, and would contradict the 12 existing tests',
  'cited above. Not attempted.',
  '',
  'The one genuine, narrow finding from the same validation pass (surfacing the already-',
  'distinguishable pin_tier split as a standing count in a human-facing report) is tracked',
  'separately as QF-20260912-125, unaffected by this closure.',
].join('\n');

const result = await setQuickFixStatus(supabase, 'QF-20260912-049', {
  status: 'cancelled',
  verification_notes: notes,
  completed_at: now,
  disposition: 'premise_unverified_stale',
  disposition_reason_code: 'investigated_working_as_designed; refusal-branch widening would reopen ratified doctrine (QF-20260901-107 / CAPA-CONTRACT-TRUTH-001-A/B) and contradict 12 existing tests; pin_tier already preserves the exact/approximate distinction for any reader',
  disposed_by: 'Alpha-2 (autonomous fleet worker, session 689a1237-33b7-406f-9772-668958b289d6)',
  disposed_at: now,
}, { logger: console, fromStatus: 'open' });

console.log('CLOSED:', JSON.stringify(result));
