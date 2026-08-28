# Per-account quota usage strip

**SD-LEO-FEAT-ACCOUNT-USAGE-STRIP-001** · backend `lib/fleet/account-usage-reader.cjs` · UI `ehg:src/components/chairman-v3/AccountUsageStrip.tsx`

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

Every failure resolves to `{state:'unavailable', reason}` where `reason` is a **closed** enum: `not_configured | unauthorized | unexpected_shape | timeout | unreachable`.

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

## Boundary

The bearer token is **request-local**: never returned, cached, logged or persisted. No config directory, profile name or file path appears in any browser-bound field. Only the closed enum values reach the client, so a raw upstream body or transport error cannot escape through `reason`.

The containing control on `/api/fleet-panel` is the **loopback bind** in `server/index.js`, *not* the operator JWT — the route uses `optionalAuth`, and `requireAuth` accepts any valid JWT from the shared Supabase project with no role check. The payload is therefore safe on its own terms rather than relying on who can call it.

Exposed additively as `accountUsage`; the legacy `accountChips` field keeps its `{name, wkPct}` shape because the standalone vanilla panel (`server/public/fleet-ui/`) parses it.

## Usage-paste ledger + burn-projection gauge (SD-LEO-INFRA-USAGE-PASTE-LEDGER-001)

The programmatic reader above is confirmed non-functional for 2 of the 3 accounts (`not_configured` / `duplicate_identity` / `unauthorized`), leaving the chairman's pasted `/usage` output as the only reliable source for those accounts. `lib/fleet/account-capacity-gauge.cjs`'s existing `recordCapacityReading()` (a last-write-wins JSON overwrite) is fine for its own headroom-routing purpose but structurally cannot support multi-reading burn-slope history — two same-day pastes for the same account already silently collapse into one.

A new, dedicated table — `account_usage_pastes` (migration `database/migrations/20260828_account_usage_paste_ledger.sql`, chairman-gated, **not yet applied** — degrades gracefully until applied, same posture as `account_usage_snapshots`) — stores one row per paste, written only by `lib/fleet/account-usage-paste-writer.cjs` and additive to (never replacing) the JSON gauge above; `scripts/record-account-capacity.mjs` now calls both on every paste.

`lib/fleet/account-usage-burn-projection.cjs` derives a daily-slope exhaustion-vs-reset verdict from the 2 most recent rows per account/meter, or an explicit `INSUFFICIENT_DATA` verdict with fewer than 2 — it never fabricates a slope. `lib/fleet/account-usage-exhaustion-advisory.cjs` emits one idempotent `adam_action_required` tick-lane advisory (keyed on account + meter + reset-epoch, so it re-arms only when the reset date actually advances) when a projection crosses exhaustion-before-reset; `lib/fleet/exec-email-capacity-line.mjs` renders that same verdict for both the 6 AM ET morning brief (`scripts/adam-exec-summary.mjs`, a conditional action-list line, silent when there's no risk) and the manual 21:30 ET presleep-duty CLI (`scripts/account-usage-paste-projection.mjs`).

**Table does not store an email address**, unlike its own literal success criteria — a security review found `account_usage_snapshots`' data is already re-emitted by the unauthenticated `/api/fleet-panel` route above, so a plaintext-email column on a sibling table would be one naive extension away from the same exposure. `account_uuid8` + `account_org_name` fully identify the account without it.
