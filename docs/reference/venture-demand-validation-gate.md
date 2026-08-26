# Venture demand-validation gate

**SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001.** How a marketing channel earns the right to go
autonomous, and why it usually cannot.

## The problem this closes

A channel graduated to `autonomy_state='autonomous'` on a **clean-streak counter alone**
(`lib/marketing/autonomy-gate.js`: five consecutive `accepted` + `shipped_clean` outcomes). A clean
streak proves the channel *publishes well*. It proves nothing about whether anyone *wants* what it
publishes. Those were the same question; now they are two.

## The load-bearing property: unfakeability at the data layer

A gate is only as honest as the data it trusts. A settable verdict or a fabricable consent record
defeats it regardless of how correct the gate logic is. So every store here is **append-only** and
every permission is **derived**, never stored as a flag.

## Components

| Path | What it does |
|---|---|
| `lib/marketing/venture-activation-gate.js` | Computes the three-value demand verdict. **Consumes** `lib/telemetry/funnel-gauge.mjs` — never re-derives the ladder. |
| `lib/marketing/venture-consent.js` | Records consent events; derives send permission at send time. |
| `lib/marketing/venture-honesty-audit.js` | Chairman-readable per-venture audit: sent / blocked / why. |
| `scripts/venture-honesty-audit.js` | CLI: `node scripts/venture-honesty-audit.js <venture-id> [--json]` |
| `database/migrations/20260809_venture_demand_verdicts.sql` | Append-only verdict store. |
| `database/migrations/20260809_autonomy_requires_demand_verdict.sql` | The trigger that binds the writer. |
| `database/migrations/20260809_venture_consent_events.sql` | Append-only consent log + enrollment FK. |

## The verdict vocabulary — three values, never two

`PASS` · `BLOCKED` · `NO_DATA`

**`NO_DATA` is first-class and is never folded.** Folded into `PASS` it fabricates demand nobody
measured; folded into `BLOCKED` it becomes indistinguishable from a venture that *was* measured and
fell short — which hides the fact that nobody is measuring. A venture nobody can measure is not a
venture with no demand. (Precedent: `lib/governance/demand-gate.js:47-50`.)

There is deliberately **no boolean, no numeric score, and no negatively-phrased flag** on the
verdict table, and the migration's verify block *asserts their absence*. A `NOT NULL` score would
force every unmeasurable row to invent a number. Polarity is the safety property: `.maybeSingle()`
returns `{data:null,error:null}`, so `verdict === 'PASS'` blocks on absence while `!row?.blocked`
would pass on absence — fail-open, and invisible.

## The rung ladder, and measurability

Rungs are `visitors → signups → activated → paid`. Each resolves to exactly `MEASURED{value}` or
`UNMEASURABLE{reason}`.

- **`visitors` and `signups` are `DECLARED_UNFILTERED`** and can never *alone* produce a `PASS`. No
  bot filtering exists anywhere in this repository; Cloudflare visitor counts are aggregate by
  design (nothing to filter downstream) and signups are a venture self-report. Describing either as
  "bot-filtered" would assert a filtering that never happened.
- **The `paid` rung has a trap.** `computePaidGaugeState` returns `state:'live'` with
  `paid_amount_cents: 0` for a venture with no payments, because its readiness probe is
  **fleet-wide**. `live` is a claim about *the machinery having run somewhere*, not about *this
  venture being measured*. The gate therefore requires a per-venture `attribution_status='resolved'`,
  `livemode=true` event before treating the paid rung as measured.

## `cpa` — an additive citation, never a fifth rung

**SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001.** `resolveCpaRung()` (same file) computes an honest
cost-per-acquisition number from `daily_rollups.spend_cents`/`conversions`
(`lib/telemetry/cpa-gauge.mjs`) and attaches it to the persisted `rungs` object as `rungs.cpa`, but
strictly *after* `decideActivationVerdict()`/`buildPathToPass()` have already run on the original
4-rung array — it is never passed into either function. `cpa` is not in `ACTIVATION_RUNGS`, has no
entry in `RATIFIED_FLOORS`, and cannot affect `PASS`/`BLOCKED`/`NO_DATA` or the citation text; it
uses its own two-state vocabulary (`no_writer_yet`/`live`, deliberately no `stale` — no ratified
cadence contract exists for `daily_rollups`) rather than `RUNG_STATE`'s `MEASURED`/`UNMEASURABLE`,
so it can never be mistaken for a fifth gated rung by shape alone. Per-channel breakdown is
available independently via `node scripts/cpa-gauge-cli.mjs <venture-id> <platform>`.

## Floors ship EMPTY, on purpose

`RATIFIED_FLOORS` is empty. A rung with no ratified floor resolves `UNMEASURABLE` and **fails
closed** — it never falls back to a default.

**Consequence: no venture can reach `PASS` until a chairman/Adam decision names a floor.** That is
intended. The circulating "300 visitors" figure is codified nowhere (repo-wide grep: zero) and
contradicts Image Alt Text Generator's own stored metadata (100 / 5% / 10, self-declared
auto-generated), so it is not usable as one. Each entry added must cite the decision that ratified
it. Governance: `docs/03_protocols_and_standards/venture-metrics-standard.md:75`.

## Enforcement: two writers, two denial shapes

1. **The trigger is the binding half.** `autonomy-gate.js` runs as `service_role`, and
   **`service_role` bypasses RLS entirely** — no policy edit in either direction constrains it. A
   direct write setting `autonomy_state='autonomous'` without a `PASS` verdict raises a
   **check/trigger violation** (not `42501`; it is denied by the *rule*, not by permission).
2. **The REVOKE is an independent belt.** `anon`/`authenticated` held table-level INSERT/UPDATE
   grants blocked only by RLS default-deny — the *absence of a write policy* rather than the absence
   of a grant. Their refusal is a permission denial (`42501` / a named policy). When testing this,
   use **schema-valid real column names**: a wrong-column anon INSERT returns `PGRST204`, and a naive
   "assert it was refused" control would mistake a column typo for a passing REVOKE.

`vca_venture_access` stays `FOR SELECT`. Widening it to `FOR ALL` would grant every authenticated
user in the venture's company a direct write to `autonomy_state` — that is the hazard, not the fix.
The verify block pins its `polcmd`.

## Consent

Consent is an append-only **event log**; permission is derived as *"the latest event for this
recipient is an `opt_in`"*. `campaign_enrollments.status` is no longer a source of permission — it
is a mutable field any writer can flip back, and `processStep` read it off a record the *caller* had
already loaded, so an opt-out arriving between load and send was invisible. `resolveSendPermission`
re-reads at send time, every time.

Pre-existing `campaign_enrollments` rows are **grandfathered as un-sendable** rather than
back-filled. Back-filling would mean creating consent events for people who never consented.

## Operating it

```bash
node scripts/venture-honesty-audit.js <venture-id>
```

`NO_DATA` and `BLOCKED` render as different sentences and are never merged: one is an
instrumentation problem, the other a product problem, and they call for opposite responses. An
unreadable store reports `VERDICT_UNREADABLE` rather than silence.

**Known gap, declared by the audit itself:** per-attempt blocked-send records are not persisted —
`processStep` returns the suppression to its caller and nothing stores it. The audit therefore
reports the *suppressed population*, and says so rather than presenting one number as the other.
