# The anon write contract

**Category**: Reference
**Status**: Approved
**Version**: 1.1.0
**Author**: SD-LEO-INFRA-DEAD-VENTURE-USER-001
**Last Updated**: 2026-08-13
**Tags**: rls, postgres, anon, feedback, ingress

## Read this first

**No live caller is broken.** All five anon-path writers to `public.feedback` use the form that
lands. This document describes a **latent trap**, not an outage — do not "fix" callers that are
already correct, and do not restore the dropped `venture_user_select_feedback` policy (see
[What not to do](#what-not-to-do)).

## The contract

Verdicts below are **measured** by `scripts/anon-write-contract-probe.mjs` against the live
database, not derived from the documentation. Two of them contradict the intuitive reading.

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

## Related: telegram_bot_insert_feedback removal staged

`telegram_bot_insert_feedback` (the fourth writer form implied by "five anon-path writers" above)
has a **staged, not-yet-applied** removal: `database/chairman-gated/20260813_revoke_telegram_bot_insert_feedback.sql`
(SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001). It has `WITH CHECK (source_type = 'telegram')` only — no
`venture_id` predicate, no content/rate bound of its own — the RESTRICTIVE `anon_feedback_ingress_bounds`
policy above is what has always bounded its severity/category/rate, before and after this migration.
The verdicts in [The contract](#the-contract) remain accurate **as measured today** — this table's
policy set is unchanged until a chairman applies the migration. Post-apply, telegram-sourced writes
route through `venture_user_insert_feedback` instead (requires a real `venture_id`) or are refused;
re-run `scripts/anon-write-contract-probe.mjs --table public.feedback` to re-measure. This closes an
unbounded carve-out, not venture-ID spoofing — `venture_user_insert_feedback`'s `venture_exists_and_active()`
check remains existence-only, unchanged by this migration.
