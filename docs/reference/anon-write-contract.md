# The anon write contract

**Category**: Reference
**Status**: Approved
**Version**: 1.4.0
**Author**: SD-LEO-INFRA-DEAD-VENTURE-USER-001, SD-LEO-FIX-CLOSE-ANON-VENTURE-001, SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-E1, SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001
**Last Updated**: 2026-08-17
**Tags**: rls, postgres, anon, feedback, ingress

## 2026-08-17 update: the RPC path is ALSO non-functional, plus 4 more affected callers

**This section corrects and extends "Read this first" below rather than replacing it — that
section's facts (both drops, the `ehg` precondition miss) are still accurate.** Filed as
SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001 (a decision package, not yet applied), discovered
incidentally while shipping an unrelated fix and independently verified by 4 sub-agent passes.

**"E1" is `SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-E1`** (answering the open question a ceremony
runbook left as a bare label) — the sprint that shipped `altifyai/lib/feedback/submit.js`'s
RPC cutover. Its code precondition was met; per this doc's own note below, its key-provisioning
gap was correctly treated as inert because altifyai had no live deployment yet.

**New, decision-changing fact: `public.venture_ingest_keys` has ZERO ROWS for every venture,
not only altifyai.** `_verify_venture_ingest_secret()` therefore returns `false` unconditionally,
so `fn_submit_venture_user_feedback` fails closed (`28000`) for **every** caller — including
`ehg`'s `feedbackDataAccess.ts`, which meets the code precondition described above but is
*operationally* non-functional in production for a completely different reason than the RLS gap.
Cutting a caller over to the RPC is necessary but not sufficient; **key provisioning
(`fn_provision_venture_ingest_key`, service_role-only) is an independent, currently-unmet
precondition for every venture, not only the ones still on the raw INSERT path.**
`VITE_FEEDBACK_INGEST_SECRET` (the client-side credential) is also present only in
`ehg/.env.example`, absent from real deployed `.env` files — a second, independent blocker for
`ehg` specifically even once keys exist.

**4 more affected callers, beyond the `ehg`/`feedbackDataAccess.ts` gap already documented:**
- `ehg/src/components/error-capture/ErrorCaptureProvider.tsx:92` — a global error boundary,
  raw `.insert()`, runs for both anon and authenticated visitors. Independent non-RLS bug:
  inserts `created_by`/`source_url`, neither of which is a real column on `public.feedback`
  (the real identity column is `user_id`).
- `ehg/src/components/quality/FeedbackWidget.tsx:78` — the internal quality-feedback FAB. Runs
  as `authenticated` (gated `if (!user) return null;`), not `anon` — relevant because
  `select_feedback_policy`/`anon_feedback_ingress_bounds`'s current live scope was reasoned about
  in anon-only terms in earlier investigation; `authenticated` is equally blocked. Same
  non-existent-column bug as above (`created_by` — the real column is `user_id`), plus previously
  omitted the NOT-NULL `source_type` (fixed separately, QF-20260817-434, 2026-08-17 — the column
  bug remains). Two more non-RLS bugs, confirmed live against the current `origin/main` payload
  (adversarial ship-gate review, PR #7199, so not affected by this SD's own stale local `ehg`
  checkout): `source_url` is ALSO not a real column (same class as `created_by`, previously
  unflagged for this specific caller); and `status: "open"` is not in `feedback_status_check`'s
  allowed set (`new`/`triaged`/`in_progress`/`resolved`/`wont_fix`/`duplicate`/`invalid`/
  `backlog`/`shipped`), so the insert would 23514 even after every other bug here is fixed. None of
  this affects Remedy B's migration (FR-4's drafted RPC signature takes no `status` parameter and
  would set it server-side) — it belongs in this SD's FR-6/FR-1 caller census, not the RLS fix.
  Structurally **cannot** use the RPC even once keys are provisioned: it never sets `venture_id`
  (it isn't a venture-scoped submission) and `authenticated` does not hold EXECUTE on
  `fn_submit_venture_user_feedback`. The same missing-`venture_id` gap also rules out Remedy B's
  restored policy at ANY role scope (its `WITH CHECK` requires `venture_id IS NOT NULL`) — an
  earlier draft of that migration widened `TO authenticated` on the mistaken theory that role
  scope alone would admit this caller; corrected during EXEC-TO-PLAN (TESTING/SECURITY sub-agent
  evidence 731d79a4 / 241fb047, confirmed by reading this exact payload directly). Needs a fourth
  mechanism, designed below (see "FR-4 design" section) — an `auth.uid()`-bound authenticated
  path — tracked as SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001 FR-4; not yet implemented as code.
- `apexniche-ai/src/ui/api/feedbackClient.ts:121` — a raw `fetch()` POST to `/rest/v1/feedback`
  using the anon key (functionally identical to a PostgREST `.insert()`). Unlike the two `ehg`
  callers above, this one DOES set both `venture_id` and `feedback_type` correctly (verified by
  direct read) — a genuine candidate beneficiary of Remedy B's anon-scoped restore, or of the RPC
  path once keys are provisioned. Has its own independent, non-RLS schema bug: omits the NOT-NULL
  `type` column (distinct from `feedback_type`, which it does set) — tracked under this SD's FR-6,
  not fixed by this SD's own work.
- `marketlens/src/services/feedback.js:36` (and its byte-identical fixture copy,
  `marketlens-fixtures/src/services/feedback.js:36`) — a **sixth writer**, previously
  unenumerated by this contract or any SD in this family. `forwardToVentureChannel()` is
  fire-and-forget with swallowed errors, so marketlens's own local store still reports success to
  its caller — the failure is invisible to marketlens users, but every forward to
  EHG_Engineer's venture-wide feedback aggregation silently `401`s. Blocked solely by the RLS
  gap (no independent schema bug, unlike the two `ehg` callers above).
- Not a caller, but a **defect multiplier**: `EHG_Engineer/lib/eva/config/venture-default-capabilities.js:37`
  is the venture-factory template — it instructs every newly-generated venture to write code
  against the now-dropped `venture_user_insert_feedback` policy. Every future venture inherits
  this contract's stale guidance by construction until the template is corrected.

**Correction to "Related: a rate limit that cannot bind" below: that section is now stale/resolved.**
The inline-subquery rate limit it describes was superseded by
`database/chairman-gated/20260803_bound_anon_ingress_source_type_qualifier_STAGED.sql` and
`database/chairman-gated/20260804_ingress_bound_definer_basis.sql` — the live `WITH CHECK` today
calls `fn_anon_ingress_prior_hour_count(source_type)`, a `SECURITY DEFINER` function, so the
count no longer runs as the inserting role and is no longer coupled to the telegram-only SELECT
policy. Independently confirmed 3 times this SD (security-feedback-insert sub-agent, live catalog
read; two prior artifacts, `.artifacts/sec-write-evidence.mjs` and this SD's own investigation).
Left in place below for history; do not action it.

**A staged, decision-ready alternative now exists that this contract's "What not to do" section
should be read alongside, not overridden by:**
`database/chairman-gated/20260817_restore_feedback_permissive_insert.sql` (+ `_DOWN.sql` +
`_acceptance.mjs`) stages — NOT applies — a permissive INSERT policy restore, presented to the
chairman explicitly as reverting **two** parts of `SD-LEO-FIX-CLOSE-ANON-VENTURE-001`'s protection,
not one: (1) the policy itself, restoring an anon-reachable INSERT path, and (2) anon's direct
`EXECUTE` on `venture_exists_and_active`/`check_feedback_rate_limit`, which that SD's own migration
revoked as a named "MEDIUM-1" finding (an unauthenticated existence/rate-limit oracle) — restoring
(1) without (2) leaves the policy inert (TESTING sub-agent finding, evidence
731d79a4-5498-4bd7-8628-427dbc31d3dc), so applying this file necessarily means both. Scoped `TO
anon` only — byte-identical to the historical policy shape and role scope, and it restores anon's
`EXECUTE` on both supporting functions (without them the policy would be inert), though NOT
identical to the full historical grant picture: `check_feedback_rate_limit` had also historically
been granted to `authenticated` for some other, unrelated caller, which this migration deliberately
does not restore (adversarial ship-gate review, PR #7199, corrected an earlier overclaim here) — and
re-pinning `anon_feedback_ingress_bounds`'s role scope explicitly rather than relying on its current
accidental `TO PUBLIC` drift. (An earlier draft widened this `TO authenticated`,
reasoning `FeedbackWidget.tsx` runs as `authenticated`; corrected during EXEC-TO-PLAN once that
caller's payload was confirmed — by direct read, independently by two sub-agents — to set neither
`venture_id` nor `feedback_type`, so it cannot satisfy this policy's `WITH CHECK` at any role scope.
`apexniche-ai/src/ui/api/feedbackClient.ts:121`, the one caller confirmed to set both fields
correctly, calls as `anon`. No caller identified in this SD needs `authenticated` under this
predicate, so the widening — which would also have meant granting the two supporting functions'
`EXECUTE` to `authenticated`, beyond any historical baseline — was removed rather than kept and
re-justified.) This does not contradict "do not widen anon's SELECT surface" above — that guidance
is about the SELECT policy specifically, which this file does not touch — but it is a live
counter-option to this contract's general "use the RPC, not a restored policy" philosophy, offered
because the RPC path (per the finding above) is not currently functional for anyone regardless of
which philosophy wins. The coordinator has designated completing the RPC cutover (+ key
provisioning) as the primary remedy; this migration exists so the alternative is equally
decision-ready, not because it is recommended over the primary.

## Read this first

**As of 2026-08-16T15:15Z, this section's original claim is FALSE for two of the five writers.**
Both `database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql` (drops
`venture_user_insert_feedback`) and `database/chairman-gated/20260813_revoke_telegram_bot_insert_feedback.sql`
(drops `telegram_bot_insert_feedback`) have **APPLIED** — live-confirmed via `pg_policies` on
`public.feedback`: zero PERMISSIVE anon INSERT policies remain (only `service_role`-only
`insert_feedback_policy` and the RESTRICTIVE `anon_feedback_ingress_bounds` survive). The only
anon-reachable write path now is the `SECURITY DEFINER` RPC, `fn_submit_venture_user_feedback`.

Both ownership migrations shipped with an explicit precondition — every caller still on the raw
`venture_user_insert_feedback` INSERT path must cut over to the RPC *before* the migration applies
(see [Related: venture_user_insert_feedback's existence-only gap closed](#related-venture_user_insert_feedbacks-existence-only-gap-closed-staged-sd-leo-fix-close-anon-venture-001)).
That precondition was met for `altifyai` (`lib/feedback/submit.js`, PR
`rickfelix/altifyai#24`, SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-E1) but **was NOT met for `ehg`** —
`ehg/src/integrations/feedback/feedbackDataAccess.ts`'s `submitFeedback()` still does a raw
`.from('feedback').insert(...)` whose own doc-comment names the now-dead policy. **Every anon
feedback submission from the `ehg` app is broken in production as of the apply timestamp above.**
Flagged to the coordinator 2026-08-16 (signal 4b2f29cb, severity critical); not yet fixed as of
this writing. Do not restore the dropped `venture_user_select_feedback` policy as a workaround for
this or any other symptom (see [What not to do](#what-not-to-do)) — the fix is cutting `ehg` over
to the RPC, the same swap `altifyai` already made.

## The contract

**Historical, for `venture_user_insert_feedback` specifically — that policy no longer exists (see
[Read this first](#read-this-first)).** Verdicts below were **measured** by
`scripts/anon-write-contract-probe.mjs` against the live database prior to 2026-08-16T15:15Z. They
remain accurate as a description of *how Postgres RLS INSERT/RETURNING/ON CONFLICT semantics
interact*, and apply again to any future permissive anon INSERT policy on this table shape — but
today there is no such policy to probe. Re-run the probe once a new anon-writable policy exists to
re-measure against it specifically.

| Write form | Verdict | Cause |
|---|---|---|
| `INSERT` (bare, `Prefer: return=minimal`) | **LANDS** | — |
| `INSERT ... RETURNING <target columns>` | **REFUSED** 42501 | the SELECT policy, applied to the readback |
| `INSERT ... RETURNING 1` | **LANDS** | references no target column, so no readback |
| `INSERT ... ON CONFLICT DO NOTHING` | **REFUSED** 42501 | the SELECT policy, on the arbiter check |
| `INSERT ... ON CONFLICT DO UPDATE` | **REFUSED** 42501 | *additionally*, the absent anon UPDATE policy |

Two findings here cost real time and are easy to get backwards:

1. **`ON CONFLICT DO NOTHING` is refused even when no conflict occurs.** Measured with a freshly
   generated `id`, so nothing could collide. The arbiter check is planned whether or not it fires,
   so the refusal is a property of the *clause*, not of a collision. The probe originally shipped
   expecting this to LAND; the first live run corrected it.
2. **The two upsert forms are refused by different policies.** Establised by control, not argument:
   granting anon a covering SELECT policy flips `RETURNING <cols>` and `DO NOTHING` to LANDS while
   `DO UPDATE` stays refused; granting SELECT *and* UPDATE flips all three. So `DO UPDATE` is closed
   by the absent anon UPDATE policy, applied to the conflicting row as a `WithCheckOption`. Note
   that anon **holds** the UPDATE grant — this is a policy denial, not an ACL denial.

### Why the error message misleads

A single `42501` cannot distinguish *"the write was refused"* from *"the write succeeded and the
readback was refused"*, and the wording favours the wrong reading. Four rounds of investigation on
this SD went to the wrong hypothesis for exactly that reason. `42501` collapses at least five
mechanisms; the probe therefore reports an **attributed cause** and never the bare code.

## What to do instead

Use the bare insert with a **client-side id** — generate it with `crypto.randomUUID()`, not a
counter or a hash of user input. A landed-vs-23505 response is a blind existence oracle, harmless
while ids are unguessable and not harmless if they become predictable. This is not a new invention — it is already proven in
production, and was written down a month before this document existed:

> `ehg/src/integrations/feedback/feedbackDataAccess.ts:143-150` (landed 2026-07-12):
> *"Postgres RLS requires a qualifying SELECT policy for INSERT...RETURNING to succeed — the
> insert's own WITH CHECK policy is not sufficient on its own. […] generating the id client-side
> means this insert path has zero runtime dependency on that policy."*

If a caller genuinely needs server-generated state back, the existing escape hatch is a
`SECURITY DEFINER` RPC — `apexniche-ai/src/lib/error-capture.ts:151` and
`marketlens/src/lib/errorCapture.js:65` both POST to `/rest/v1/rpc/record_venture_error`.

## What not to do

**Do not widen anon's SELECT surface.** The `venture_user_select_feedback` policy that would have
covered the readback was **deliberately dropped** — applied 2026-07-13T22:23:39Z, `prod_deploy=true`
— as the closing step of a cross-tenant security fix whose earlier steps existed specifically to
remove that policy's legitimate callers first. `SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001` is
tightening this same surface. Restoring the policy re-opens what two SDs closed.

## Enforcement

`scripts/anon-write-contract-probe.mjs`, run in CI and on a schedule.

```bash
node scripts/anon-write-contract-probe.mjs                     # discover the class, probe each
node scripts/anon-write-contract-probe.mjs --table public.feedback
node scripts/anon-write-contract-probe.mjs --table public.feedback --control-grant-select
```

**Why a probe and not a lint.** All five live callers are in *other* repos (apexniche-ai, marketlens,
ehg); EHG_Engineer has no anon feedback writer at all. A source lint shipped here would see **zero**
of them. The database is the only layer all five share.

It is safe against production — the only database there is — because the guarantee is
**COMMIT-never-issued**: every statement runs inside a transaction that ends in `ROLLBACK`, and the
query wrapper throws on any commit-family statement. That framing matters: a connection drop, a
throw inside a catch, and an early return are all *already* safe.

Two things that guarantee needed before it was true as written, both found by adversarial review
rather than by reasoning about the code:

- The guard originally anchored on the **start of the string**, and node-postgres sends a
  param-less query over the simple protocol — which executes semicolon-separated statements. So
  `select 1; commit` committed while the guard reported clean. It now inspects every statement.
- `--table` is interpolated into `CREATE POLICY` and `::regclass`, which cannot take a bind
  parameter, so the name is validated against a strict pattern. The operator already holds the DB
  password, so this was never privilege escalation — it was the difference between safe by
  construction and safe because nobody typed that.

> **Control modes take an `AccessExclusiveLock`** on the target for the life of the transaction,
> which blocks live ingress on a production table for as long as the run takes. A `lock_timeout` of
> 1s bounds the acquisition, but do not run a control mode casually against a busy table. CI runs
> the probe bare and never takes this lock.

## This is a class, not a table

The probe discovers its own targets: any table where anon holds a permissive INSERT policy and has
no *unconditional* anon SELECT policy. **Live, that is 59 candidates, not the 2 an earlier estimate
claimed.** The estimate was wrong because a qual that is always-false *for anon* via a function call
(`fn_is_chairman()`) is not statically distinguishable from one that is always-true, so the candidate
set contains false positives.

The probe asserts the contract only for tables it has a hand-written row builder for — today, just
`public.feedback`. Every other candidate is reported **UNPROBED** on every run, loudly and by count.
That is deliberate: a discovery step that quietly probes the one table it can and prints a clean
pass reads exactly like a class that is covered. `marketing_attribution` is among the unprobed; its
only live writer (`ehg/src/integrations/marketing/landingDataAccess.ts:85`) uses the bare form, so it
carries the same latent trap and is a good candidate for the next builder.

## FR-4 design: a fourth mechanism for FeedbackWidget.tsx (SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001)

`FeedbackWidget.tsx` fits neither existing pattern: it is not venture-scoped (no `venture_id`, not
a candidate for `fn_submit_venture_user_feedback`) and it is not anonymous (it renders only for a
signed-in Supabase Auth user, `if (!user) return null;`, so the client already holds a verified
JWT). Using the venture RPC's shared-secret pattern here would be solving an authentication problem
this caller does not have with a mechanism designed for one it does not have either.

**Proposed design**: a new `SECURITY DEFINER` RPC, `fn_submit_internal_feedback(p_title text,
p_description text, p_type text, p_severity text)`, `TO authenticated` only (no anon grant — this
caller is never anonymous by construction), that reads the caller's identity via the built-in
`auth.uid()` inside the function body rather than trusting a client-supplied value — the same
"never accept as a parameter what the caller could forge" discipline `fn_submit_venture_user_feedback`
already uses for `severity`/`category`. No external secret is needed: Supabase Auth's own JWT
verification (already enforced before the function body ever runs) **is** the authentication,
which is a strictly stronger guarantee than a client-bundled shared secret and avoids FR-2/FR-3's
public-bundle-secret residual risk entirely for this specific caller. Server-side, the function
sets `source_application='EHG'`, `source_type='manual_feedback'`, `user_id=auth.uid()`,
`feedback_type` derived from `p_type` (mirroring `FeedbackWidget.tsx`'s own existing
`calculatePriority` mapping), and — critically — never accepts `venture_id` as a parameter at all
(this caller has none; a NULL/absent parameter, not a client-suppliable NULL that could be
overloaded later). Not yet implemented — this is the decision-ready design; EXEC on the chosen
remedy authors the actual `CREATE FUNCTION` migration once the chairman confirms this is the
direction (it is compatible with either Remedy A or Remedy B being chosen for the other 3 callers,
since it does not touch `anon_feedback_ingress_bounds` or any venture-scoped policy at all).

**Open gaps in this design, flagged by SECURITY sub-agent review (evidence
241fb047-1b4a-4795-b73b-8fa4c8ab2778) — close before implementation, not before this decision
package:**
- **`p_severity` as drafted contradicts the design's own stated discipline.** The signature above
  takes `p_severity` as a caller-supplied parameter with no described server-side clamp — but the
  paragraph above justifies this design by citing `fn_submit_venture_user_feedback`'s discipline of
  *never* accepting severity/category as trusted parameters. As drafted, an authenticated caller
  could set `p_severity='critical'`, which `feedback_severity_check` permits with no column
  default preventing it. Before implementation, either drop `p_severity` as a parameter (hardcode a
  safe default for this internal-feedback path) or clamp it server-side to exclude
  `critical`/`high` — mirroring the bound `anon_feedback_ingress_bounds` already applies to the
  RLS-gated paths.
- **This path structurally bypasses `anon_feedback_ingress_bounds` entirely, at any severity.** A
  `SECURITY DEFINER` function that writes directly to the table never evaluates that table's RLS
  policies for its own internal write — the same structural class of gap `record_venture_error()`
  already has (pre-existing, out of scope, gap G1). Fixing the identity half of that failure mode
  (this design does, via `auth.uid()`) does not fix the structural half; both need independent
  server-side constraints inside the new function body, not inherited from RLS.
- **No rate limit is specified.** `check_feedback_rate_limit(venture_id)` cannot be reused as-is
  (this design has no `venture_id` by construction); a `user_id`-scoped equivalent needs designing
  before implementation, not assumed to already exist.

## FR-2/FR-3 provisioning runbook (SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001, Remedy A blocking work)

Documentation only — no key material or secret is written by this SD's own authoring work. Numbered,
exact-keystrokes steps for the chairman/operator who actually runs this.

**Function signature** (live, confirmed 2026-08-17): `fn_provision_venture_ingest_key(p_venture_id uuid) RETURNS text`
— `service_role`-only (correct; not anon/authenticated-executable). Returns the **raw secret once**;
only its SHA-256 hash is stored in `venture_ingest_keys`. Re-calling it for the same venture
**rotates** the key (the old secret stops working immediately) — do not run it speculatively.

### Step A — Provision a key for one venture (repeat per venture that has a live caller)

1. Identify the venture's UUID: `SELECT id, name FROM ventures WHERE name = '<venture name>';`
2. Confirm no key already exists (avoid an accidental rotation that breaks a working deployment):
   `SELECT venture_id, created_at, rotated_at FROM venture_ingest_keys WHERE venture_id = '<uuid>';`
   — if a row exists and the venture has a live deployment already depending on it, STOP; do not
   re-run step 3 without coordinating the rotation with whoever holds the current secret.
3. Using a `service_role`-authenticated client (never `anon`/`authenticated`), call:
   `SELECT fn_provision_venture_ingest_key('<uuid>');`
4. **Copy the returned value immediately** — it is shown exactly once and cannot be retrieved
   again (only re-rotated, which invalidates it).
5. Hand the secret to whoever deploys Step B below for that venture, over a channel that is not
   this repository (never commit it, never paste it into a chat log this session can read back).

### Step B — Deploy the secret to the calling application (per venture, exact keystrokes)

For `ehg` specifically (the caller confirmed broken in production, per "2026-08-17 update" above):

1. Open the deployment's environment configuration for the **production** environment (not
   `.env.example`, which is a committed template, not a real deployed value).
2. Add: `VITE_FEEDBACK_INGEST_SECRET=<the value from Step A.4>`
3. Redeploy `ehg` so the new build picks up the env var (a Vite client var is baked in at build
   time, not read at runtime — restarting the process alone is not sufficient).
4. Verify: submit a real feedback item through the app, then confirm via a `service_role` query
   that the row landed in `public.feedback` (not just that the client reported no error —
   see "Why the error message misleads" above for why a client-reported success is not sufficient
   evidence on its own).

For `altifyai`: per "2026-08-17 update" above, this venture has no live deployment yet — Step A/B
should be run when that deployment actually goes live, not speculatively ahead of it (the ceremony
runbook's own "when E1 ships its widget" note already established this timing; E1's *code* has
shipped, its *deployment* is the actual trigger condition, confirm which has happened before
provisioning).

### Residual risk, disclosed not hidden

`VITE_FEEDBACK_INGEST_SECRET` ships inside a public browser bundle — no client-held credential
stays secret from whoever loads the page. This narrows cross-venture forgery (any venture, using
one shared exposure) to per-venture forgery (only the venture whose secret was extracted) — a real
reduction, not elimination. Full ownership closure requires a server-side secret holder, which none
of `ehg`/`apexniche-ai`/`marketlens` currently have (all are client-only SPAs).

## FR-7 drift guard design (SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001)

`scripts/anon-write-contract-probe.mjs` (see [Enforcement](#enforcement) above) already detects
one half of this incident's failure class: a table with a permissive anon INSERT policy and no
covering SELECT. It does **not** detect the half that actually caused this incident — a table
that had a working permissive INSERT policy and now has **none** (the G4 policy-count-goes-to-zero
case), nor the RPC-side failure mode found 2026-08-17 — a `SECURITY DEFINER` write path whose
authorization table (`venture_ingest_keys`) is empty. Neither of the two prior chairman-gated
migrations' own in-transaction `DO $verify$` blocks catch this either: each only asserts its own
narrow post-condition at apply time, not an ongoing invariant, and neither checks the other's
dependency.

**Design for a two-sided extension** (not yet implemented — this SD's deliverable is the design,
per its decision-package scope):
1. **Policy-count guard**: for any table this probe already knows how to write to (today, just
   `public.feedback`), assert at least one permissive INSERT policy remains reachable by
   `anon` or `authenticated` — paired with the probe's *existing* check (a bounded legitimate
   insert must still succeed), so the guard is two-sided: it fails on zero-policies-remain AND on
   a legitimate-insert-wrongly-refused, never only one direction.
2. **RPC-authorization guard**: for each `SECURITY DEFINER` write RPC this probe knows about
   (`fn_submit_venture_user_feedback`, `fn_submit_venture_feedback`, `fn_submit_venture_error`),
   assert `venture_ingest_keys` has at least one row for every venture with a live, deployed
   caller of that RPC (cross-referencing a caller census, not just counting rows generically —
   a nonzero row count for the wrong venture would false-pass this exact incident's altifyai case).
3. Run on the same CI/schedule cadence as the existing probe; both checks are read-only
   (COMMIT-never-issued, matching the existing probe's own safety guarantee) except the
   legitimate-insert-succeeds leg of (1), which needs a real, cleaned-up write the way
   `20260817_restore_feedback_permissive_insert_acceptance.mjs`'s own probes do.

## Related: a rate limit that cannot bind

Distinct from the above, and easy to conflate — there are **two** rate limits on this path:

- `check_feedback_rate_limit(venture_id)`, called from `venture_user_insert_feedback`'s WITH CHECK,
  is `SECURITY DEFINER` and **does** bind. Not a defect.
- The RESTRICTIVE `anon_feedback_ingress_bounds` policy counts with an **inline subquery that runs
  as the inserting role**, so it is itself subject to the telegram-only SELECT policy. Its basis is
  n=1 for every non-telegram source: the bound is arithmetically incapable of binding. Widened in a
  rolled-back transaction the same basis saw auto_capture 10731, manual_feedback 6593. `SECURITY
  DEFINER` is what that basis lacks.

The remedy is filed as a separate chairman-gated SD rather than applied here: making a dormant limit
suddenly bind would begin rejecting live traffic across four source types with existing volume.

## Related: venture_user_insert_feedback's existence-only gap closed, APPLIED (SD-LEO-FIX-CLOSE-ANON-VENTURE-001)

The sentence below, in the telegram section, was accurate about that migration in isolation but is
now superseded by a second migration: `venture_user_insert_feedback`'s `venture_exists_and_active()`
check (existence of a real, active venture_id — no correlation to caller identity) is replaced, not
merely narrowed, by `database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql`
(`fn_submit_venture_user_feedback`, a new `SECURITY DEFINER` RPC requiring a per-venture ingest
secret, reusing `database/chairman-gated/20260812_venture_ingest_key_binding.sql`'s
`_verify_venture_ingest_secret` unmodified). **APPLIED 2026-08-16T15:15Z** (chairman-gated, same
convention as the telegram removal below) — `venture_user_insert_feedback` is gone; the contract
verdicts above are historical (see [The contract](#the-contract)).

Sequencing was strict and security-load-bearing, not apply-order hygiene: this migration had to apply
AFTER `20260813_revoke_telegram_bot_insert_feedback.sql` (below), or `telegram_bot_insert_feedback`'s
zero-constraint bypass would have survived as a live alternate anon-INSERT path for the same
feedback_type LIKE 'user_%' shape this migration targets — live-confirmed both applied together.
There was also an APPLICATION precondition, found by adversarial review during EXEC, not by the
migration's own logic: `ehg/src/integrations/feedback/feedbackDataAccess.ts` (the same file cited
above under [What to do instead](#what-to-do-instead)) still inserts through the raw
`venture_user_insert_feedback` policy this migration drops — it needed to switch to calling
`fn_submit_venture_user_feedback` (with the venture ingest secret) and ship BEFORE this migration
applied, or that app's own feedback submissions would break the moment the policy is gone.
**That precondition was NOT met.** `ehg`'s `submitFeedback()` was not cut over before this migration
applied, and is confirmed broken in production as of the apply timestamp (see
[Read this first](#read-this-first)). `altifyai` DID meet the precondition (`lib/feedback/submit.js`,
PR `rickfelix/altifyai#24`) — its ingest key is not yet provisioned either (0 rows in
`venture_ingest_keys` for that venture), but that is an inert, fails-closed deploy-time gap, not a
broken-in-production one: `altifyai` has no live Cloudflare Workers deployment yet, so nothing is
actually calling this path for that venture today.

Residual, documented rather than silently accepted: for a BROWSER-exposed ingest secret (shipped in
a public client bundle, as `feedbackDataAccess.ts` is), no client-held credential can stay secret
from whoever loads that page — this narrows cross-venture forgery to per-venture forgery for such
callers, it does not eliminate targeted forgery against one specific venture. Full ownership closure
holds only for a server-side secret holder.

## Related: telegram_bot_insert_feedback removal, APPLIED

`telegram_bot_insert_feedback` (the fourth writer form implied by "five anon-path writers" above)
has **APPLIED**: `database/chairman-gated/20260813_revoke_telegram_bot_insert_feedback.sql`
(SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001), live-confirmed alongside the ownership RPC migration
2026-08-16T15:15Z. It had `WITH CHECK (source_type = 'telegram')` only — no `venture_id` predicate,
no content/rate bound of its own — the RESTRICTIVE `anon_feedback_ingress_bounds` policy above is
what has always bounded its severity/category/rate, before and after this migration. Telegram-sourced
writes now route through `fn_submit_venture_user_feedback` (requires a valid per-venture ingest
secret, per the ownership migration above) or are refused; re-run
`scripts/anon-write-contract-probe.mjs --table public.feedback` to re-measure against the current
policy set (see [The contract](#the-contract) for why that probe will now find nothing to measure).
This closed an unbounded carve-out, not venture-ID spoofing on its own — but combined with the
ownership migration above, ownership is now enforced for every remaining anon path.
