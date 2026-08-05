#!/usr/bin/env node
/**
 * SD-EHG-IDEATION-PIPELINE-SEAMS-001 (FR-5, AC-10) — provision the headless enqueue identity.
 *
 * WHY THIS EXISTS. stage_zero_requests.requested_by is `uuid NOT NULL REFERENCES auth.users(id)`
 * with an RLS policy `auth.uid() = requested_by`, so a scheduled invoker has no identity of its
 * own. AC-10 forbids attributing a Stage-0 witness row to a human account. Measured before
 * writing anything: auth.users held THREE rows and none was a service account —
 * rickfelix2000@gmail.com (the chairman, role=admin), test@ehg.dev, test-impersonation@test.com —
 * and all four stage_zero_requests rows that have ever existed carry the chairman's id
 * (69c8aa7a) as requested_by. So there was no existing non-human principal to register.
 *
 * ROUTE CHOSEN, AND IT WAS NOT MINE TO PICK. FR-5 offers two: "a service identity OR a
 * service-role write path". Coordinator ruling a59441f4 (2026-07-26T18:07Z) authorised part (1)
 * as "dedicated service principal, NOT the service-role bypass". The bypass would have satisfied
 * the write while leaving requested_by pointing at a human, which is the thing AC-10 exists to
 * prevent — it fixes the mechanism and keeps the defect.
 *
 * SCOPE FENCE: this provisions the IDENTITY only. It does NOT enqueue a request and does NOT run
 * the traversal. Part (2) of the ask — the credentialed run that promotes a nursery row into a
 * live venture — remains with the chairman and is explicitly NOT authorised.
 *
 * ⚠ THE FENCE WAS TESTED AGAINST CHAIRMAN RULING C AND SURVIVED — RULED 2026-08-05, coordinator
 * 0ab6a99c. Recorded here because a fence that has been CHALLENGED AND UPHELD is stronger evidence
 * than one nobody ever questioned, and the next reader should not have to re-run the argument.
 *
 * THE CHALLENGE: the chairman ruled "C" (capture d46b090e, SMS 989d2a6e) raising stage0.wip_limit
 * 2 -> 3, and the stated purpose was to admit FR-3's traversal venture as the third live venture.
 * The argument for supersession was that you do not raise a WIP ceiling to make room for a venture
 * you do not intend to create.
 *
 * THE RULING: THE FENCE STANDS. Ruling C amended EXACTLY ONE THING — the WIP ceiling. It says
 * nothing about this scope fence. A RULING IS NOT A GENERAL LICENCE; IT IS THE NARROWEST THING THE
 * QUESTION ASKED FOR, and the question that produced C was about the limit. Reading a WIP-ceiling
 * amendment as dissolving a separate fence would be widening the chairman's ruling on his behalf —
 * the identical act this SD refused twice when it declined to shave the WIP count. Refusing to
 * shave the count and then inferring authorisation from an adjacent answer would have been the
 * same shortcut wearing a different hat, one gate later.
 *
 * CONSEQUENCE: part (2) — the credentialed run that promotes a nursery row into a live venture —
 * REMAINS WITH THE CHAIRMAN. This script still provisions the IDENTITY ONLY. FR-3 closes
 * OPEN-BY-DESIGN, not blocked. If the fence should fall, that is a NEW question to put to him
 * explicitly, never an inference from an adjacent ruling.
 *
 * IDEMPOTENT: re-running finds the existing principal by email and re-prints its id rather than
 * creating a second one. A duplicate service identity would make attribution ambiguous, which
 * defeats the point of naming one.
 *
 * Run: node scripts/one-off/provision-stage-zero-service-principal.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// DOMAIN CORRECTED 2026-08-04. This read @ehg.dev — a domain the chairman does not own, which is
// precisely what his 07-29 HOLD (9d63afe5) was raised against. He confirmed ownership of
// execholdings.ai by SMS ("Yes", inbound 846f1cff, capture 0854e73a), so the identity is re-homed
// to a domain that is actually ours. An attribution guard whose own principal lives on a domain we
// do not control cannot vouch for the name it attributes to.
const SERVICE_EMAIL = 'svc-stage-zero-invoker@execholdings.ai';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Idempotency: listUsers is paginated; the fleet's auth.users is tiny (3 rows), but page
// explicitly rather than assuming one page holds everything — a silent second principal is
// exactly the ambiguity this script exists to avoid.
async function findExisting(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = (data.users || []).find((u) => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (!data.users || data.users.length < 200) return null;
  }
  return null;
}

const existing = await findExisting(SERVICE_EMAIL);
if (existing) {
  console.log('ALREADY PROVISIONED (no-op):');
  console.log(`  id:    ${existing.id}`);
  console.log(`  email: ${existing.email}`);
  process.exit(0);
}

const { data, error } = await supabase.auth.admin.createUser({
  email: SERVICE_EMAIL,
  email_confirm: true, // no confirmation mail to a non-existent mailbox
  user_metadata: {
    service_principal: true,
    human: false,
    purpose: 'headless Stage-0 nursery re-evaluation enqueue',
    sd: 'SD-EHG-IDEATION-PIPELINE-SEAMS-001',
    authorised_by: 'coordinator a59441f4 ruling 2026-07-26T18:07Z (part 1)',
  },
});

if (error) {
  console.error('CREATE FAILED:', error.message);
  process.exit(1);
}

console.log('PROVISIONED:');
console.log(`  id:    ${data.user.id}`);
console.log(`  email: ${data.user.email}`);
console.log('');
console.log('NEXT: register this id in REGISTERED_SERVICE_PRINCIPALS');
console.log('      (lib/eva/stage-zero/nursery-reeval-request.js). Deliberately NOT automatic —');
console.log('      the allowlist is source-controlled and reviewable, not runtime-mutable.');
