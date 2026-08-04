# The anon write contract

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-DEAD-VENTURE-USER-001
**Last Updated**: 2026-08-04
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

Use the bare insert with a **client-side id**. This is not a new invention — it is already proven in
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

## This is a class, not a table

The probe discovers its own targets: any table where anon can INSERT but has no unconditional anon
SELECT coverage. Two members today — `feedback` and **`marketing_attribution`**, whose only live
writer (`ehg/src/integrations/marketing/landingDataAccess.ts:85`) uses the bare form and carries the
identical latent trap.

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
