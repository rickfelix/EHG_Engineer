# Per-account quota usage strip

**SD-LEO-FEAT-ACCOUNT-USAGE-STRIP-001**, extended by **SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001** · backend `lib/fleet/account-usage-reader.cjs`, `lib/fleet/account-usage-snapshot-writer.cjs` · UI `ehg:src/components/chairman-v3/AccountUsageStrip.tsx`

<!--
Category: Feature
Status: Approved
Version: 2.0.0
Author: EXEC (Alpha-2)
Last Updated: 2026-07-28
Tags: fleet, quota, accounts, observability
-->


Renders each Max account's **weekly** quota use at the top of `/builder/sessions`.

## Why it exists

Quota is the cost currency on this plan. On **2026-07-25 the fleet went down** because one account (Deep Soul Sessions) hit its weekly limit and nothing anywhere rendered it. The pre-existing gauge (`lib/fleet/account-capacity-gauge.cjs`) is fed by hand from the chairman's pasted `/usage` dashboard; this reads the meters directly.

## The upstream contract

```
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer <accessToken from THAT account's .credentials.json>
anthropic-beta: oauth-2025-04-20        <-- REQUIRED; omitting it fails the call
```

Response fields consumed: `seven_day.utilization`, `five_hour.utilization`, and each one's `resets_at`. Values are **percent-scaled** (measured 54.0 / 11.0 / 37.0).

**Dollar amounts and per-model buckets come back `null`** — verified. No code may depend on them.

**The endpoint is undocumented.** Treat it as unstable: it may change shape or disappear without notice. That is the entire reason for the fail-visible rule below.

## Fail visibly — the load-bearing rule

Every failure resolves to `{state:'unavailable', reason}` where `reason` is a **closed** enum: `not_configured | unauthorized | unexpected_shape | timeout | unreachable | exhausted | duplicate_identity`.

### `exhausted` is not `unreachable` (SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001)

An account that is **out of quota answered** — it is the fact that explains why the fleet stopped. An unreachable one told us nothing. Until this SD a 429 fell through the `!res.ok` branch into `unreachable`, so "exhausted" was not merely un-rendered, it was **unrepresentable**: the reader had no way to say it and the strip had no way to show it. The 429 check therefore sits **before** the catch-all, and the strip renders *"Quota spent"* (rose) distinctly from *"Unavailable"* (amber).

### `duplicate_identity` — refusing to attribute

A duplicate is only visible **across** slots: one account read in isolation looks perfectly healthy, which is exactly why the defect reached the chairman's screen instead of a log. When two registry slots resolve to the same account we cannot say whose usage a number belongs to, so the honest output is **no figure at all** — never a number under a label we cannot vouch for. That refusal is enforced in three places (reader, `withLastKnown`, and the component), because the number could otherwise re-enter through the retained-value path.

**This fires on the live fleet today**: `Code Street Labs` and `Rick Felix 2000` currently resolve to the same account, and `Deep Soul Sessions` is `not_configured` — so the strip has **zero** readable accounts. That is the detector working, not failing; it is a provisioning fault, routed to the coordinator.

On `unavailable` the percentage **key is absent, not null**. A nullable percentage is what produces the forbidden dash — see `buildNamedAccountChips` → `{wkPct: null}` → `fleet-panel-format.js` rendering `wk --% used`.

This is deliberately the **opposite** of `rankAccountsByHeadroom`'s documented *"unknown meters read as 0% used"*. A stale number, a zero and a dash all read as **headroom**, and that misreading is what let the fleet die. A gauge showing yesterday's figure is worse than no gauge.

## The three accounts, and where their credentials live

The registry is an **explicit map** (display name → credential directory). Identity comes from *which directory supplied the token*, so it cannot drift from the credentials.

| Account | Credential directory | State on this host |
|---|---|---|
| Deep Soul Sessions | `~/.claude-fleet-profiles/deepsoul` | **not provisioned** |
| Code Street Labs | `~/.claude` (host default) | readable |
| Rick Felix 2000 | `~/.claude-fleet-profiles/canary` | readable |

Two things that are easy to get wrong here:

- **The host default is a first-class entry, not a fallback.** `resolveProfileDir` (`lib/fleet/spawn-control.js`) structurally cannot express it — it only joins under the profiles dir. The host default also *splits* its files: credentials at `~/.claude/.credentials.json` but config at `~/.claude.json`, one level **up**. So pointing `CLAUDE_CONFIG_DIR` at `~/.claude` does **not** work for it.
- **Do not match on `orgName`.** `NAMED_ACCOUNT_REGISTRY` in `account-capacity-gauge.cjs` uses `/rick\s*felix/i`, which **misses** the canary profile's real orgName — `Richard Felix`. An honest value answering the wrong question.

`FLEET_ACCOUNT_PROFILES_DIR` is **unset** on the fleet host, so the profiles base dir defaults to `~/.claude-fleet-profiles`. `resolveProfileDir` *throws* when it is unset; doing that here would render a genuinely readable account as `not_configured`, which is precisely the misleading gauge this SD forbids.

### Provisioning Deep Soul Sessions

It has no credentials anywhere on this host, so it renders `not_configured` — deliberately shown as unreadable rather than omitted, because it is the account whose exhaustion caused the outage. Because each account is read independently, provisioning it needs **no code change**: authenticate a profile into `~/.claude-fleet-profiles/deepsoul`. A different directory name needs exactly one line in `ACCOUNT_REGISTRY`.

## Gotcha: an expired token is invisible to identity checks

Observed 2026-07-26 — the canary profile returned `unauthorized` while `claude auth status --json` still cheerfully reported `rickfelix2000@gmail.com / max`. Its `claudeAiOauth.expiresAt` had lapsed ~7h earlier.

`claude auth status` reads identity from `.claude.json` and **never validates the access token**. So identity-based checks (including `assertCanaryTarget`-style guards) will look healthy while every API call from that profile 401s. If an account reads `unauthorized`, check `expiresAt` before suspecting the reader.

## Caching and refresh

The reader caches for **60s** so the page's 15s poll cannot hammer an undocumented endpoint. `fetchedAt` always reports the true read time, and a reading older than **15 minutes** is marked stale by the UI. A stale *success* is never re-served: once the cache expires, a dead upstream becomes `unavailable`.

`GET /api/fleet-panel?refreshUsage=1` bypasses the cache. That backs the strip's **Refresh** control — the cache is there to stop polling pressure, not to block a deliberate re-read after an operator fixes an account.

## Retained history — the last known reading

*(SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 · `lib/fleet/account-usage-snapshot-writer.cjs`)*

When an account stops being readable, its **final** reading — the number that explains why the fleet stopped — used to vanish with it. Successful reads are now appended to `account_usage_snapshots`, and an unavailable account renders `Last known 92% · 3h ago` beneath its state.

Three rules make this safe rather than dangerous:

- **History is added, never substituted.** The live `state`/`reason` are preserved exactly and history arrives under separate `lastKnown*` keys. Overwriting the live state with a stored one would make a stale value indistinguishable from a current reading — the failure this feature exists to *end*, not relocate.
- **The age is relative, never a bare clock.** `formatClock` renders hour:minute with no date, so a value retained three days ago read exactly like one from this morning. `formatAge` carries its own staleness (`3d ago`) and cannot be misread.
- **"Last KNOWN" means the last row that actually carried a number.** The lookup filters on `weekly_pct`/`five_hour_pct` being non-null and runs **one query per account**. Both are load-bearing: the route persists the current reading *before* reading history back, so an exhausted account's just-written NULL row would otherwise shadow the very number being recovered; and a row budget shared across accounts let the busy accounts crowd an exhausted one out of the window within about half an hour, while exhaustion lasts *hours*.

Persistence is **wholly fail-soft** — no client, no table, transport error and malformed reading all resolve to a counted skip. It is a side effect of rendering the strip and must never break it.

> **The migration is TIER-2 chairman-gated, so this makes history *possible*, not *present*.** Nothing is retained until `database/migrations/20260728_account_usage_snapshots.sql` is applied. Until then `pending_migration: true` appears in the write log — an expected state, not an alarm.

### Operating it

| Concern | Where |
|---|---|
| Cadence | `scripts/cron/account-usage-sample.mjs`, every 15 min, registered `standard_loop:account-usage-sample` |
| Retention | `lib/retention/policies.js` → `account_usage_snapshots`, 90-day archive on `created_at` |
| Table | `account_usage_snapshots` — name, percentages, reset times, `fetched_at`, state, `account_uuid8` |

**Why a cron and not the page.** Snapshot writes began as a side effect of rendering the panel, which meant history existed only while somebody was watching — and the fleet going down is precisely when nobody is. The record would have been thinnest in exactly the window that needed it. It is hosted locally rather than in GitHub Actions because the meters need credentials that live in this host's config directories; a GHA runner would report the whole fleet `not_configured` — a green cron manufacturing a false record.

## `FLEET_ACCOUNT_IDENTITY_MAP` (optional, currently unset)

JSON mapping `accountUuid8 → display name`, letting a slot be labelled from its **credentials** rather than its directory. Malformed config never breaks the strip (it falls back to registry names), and control characters are stripped — the value reaches both the API response and a log line.

Two collision rules, because a display name is not merely cosmetic: it is the key `account_usage_snapshots` stores under, so two slots sharing a name would share a history row-space and could show each other's numbers.

- Two accounts mapped to the **same** label → the label is not applied; both slots keep their own names and fail as `duplicate_identity`.
- A label equal to a **different** slot's own registry name → same treatment. Self-mapping (a slot's own account mapped to its own name) is legitimate and contests nothing.

## Boundary

The bearer token is **request-local**: never returned, cached, logged or persisted. No config directory, profile name or file path appears in any browser-bound field. Only the closed enum values reach the client, so a raw upstream body or transport error cannot escape through `reason`. The credentialed request sets `redirect: 'error'` — undici happens to strip `Authorization` cross-origin, but a same-origin 302 *does* forward it, so refusing outright keeps the guarantee local to the code holding the token.

**The email is a resolution input only.** It is never a stored column, log line, error message or API field — `toSnapshotRow` is a fixed 8-key literal with no spread, and a unit test asserts the exact key set as a whitelist so a future field cannot slip in. `account_usage_snapshots` has RLS enabled with a service-role-only policy plus `REVOKE ALL FROM anon, authenticated`; the REVOKE is load-bearing, since `pg_default_acl` auto-grants public-schema tables to anon and authenticated.

> Note: `/api/fleet-panel` already emits `account_email` from `claude_sessions.metadata` via a **different, pre-existing** field (QF-20260726-642). This SD's table stays email-free; if "no email in fleet surfaces" is meant to be a global invariant, that field is where to look next.

The containing control on `/api/fleet-panel` is the **loopback bind** in `server/index.js`, *not* the operator JWT — the route uses `optionalAuth`, and `requireAuth` accepts any valid JWT from the shared Supabase project with no role check. The payload is therefore safe on its own terms rather than relying on who can call it.

Exposed additively as `accountUsage`; the legacy `accountChips` field keeps its `{name, wkPct}` shape because the standalone vanilla panel (`server/public/fleet-ui/`) parses it.
