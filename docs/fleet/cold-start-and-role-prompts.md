# Fleet cold start: the role → startup-prompt contract

Landed by **SD-LEO-FEAT-FLEET-COLD-START-UX-001** (PRs EHG_Engineer #6530/#6532, ehg #779).

This exists because the contract it describes is easy to get wrong in ways that *look* correct, and two of those ways were shipped and caught during this SD's own review.

## What changed, in one sentence

`role` on `POST /api/fleet-actions/add-session` went from **decorative to privilege-bearing**: it now selects the startup prompt the spawned session receives.

## The cold-start sequence

1. **Coordinator first** — nothing else has anyone to check in with.
2. **Workers** — they arrive, `/checkin`, and are assigned identities.
3. **Solomon and Adam** — any time after the coordinator; they are singleton role-sessions and do not gate worker capacity.

A worker started with no live coordinator **does not fail**. It still runs `sd:next` and self-claims. What it lacks is identity, direction and an inbox — so the UI expresses this ordering as *guidance with a stated reason*, never as a hard block.

## Where the map lives, and why that placement is load-bearing

`lib/fleet/role-startup-prompt.js`, consumed at the **route** (`server/routes/fleet-actions.js` `addSession`) — **never inside `spawn()`**.

Three existing consumers already pass a `role` and must keep resolving through callsign-namespace selection:

| Consumer | Would break if the map moved into `spawn()` |
|---|---|
| `spawnReplacement` (behind `restart` / `relaunchUnderProfile`) | role comes from the *existing* session, so restarting a coordinator would start re-delivering `/coordinator start` to it |
| `canary-provision.js` | spawns `role='worker'` with a `Canary-` callsign and relies on namespace selection resolving to **no** prompt |
| `respawnFleet` | roles come from `fleet_desired_slots` and are deliberately **not** allowlisted |

## Trap 1 — the `startupPrompt` key is checked for PRESENCE, not value

`lib/fleet/spawn-control.js`:

```js
const startupPrompt = ('startupPrompt' in opts) ? opts.startupPrompt : await defaultStartupPrompt(callsign, log);
```

Documented contract: **absent ⇒ canonical prompt, explicit `null` ⇒ deliberately none.**

So this is a live defect, not a style nit:

```js
return { startupPrompt: MAP[role] };   // WRONG — key PRESENT even when undefined
```

For `role='worker'`, `MAP['worker']` is `undefined`, the key is present, `defaultStartupPrompt` never runs, no pointer positional is emitted, and **every worker started from the page comes up with nothing to do and ghosts.**

Correct form, and the assertion that catches it:

```js
return prompt === undefined ? {} : { startupPrompt: prompt };
// test: expect(Object.hasOwn(opts, 'startupPrompt')).toBe(false)
//       — toBeUndefined() PASSES on the broken version
```

## Trap 2 — deny decisions need the BROAD canary predicate

Two predicates exist and they answer different questions:

| Predicate | Question | Use for |
|---|---|---|
| `classifySessionByCallsign` | "**is** this exactly a canary?" (exact `Canary-` prefix) | **targeting** — over-matching breaks drills |
| `couldBeCanaryCallsign` | "**could** this be a canary?" (`/^canary-/i`) | **denying** — under-matching hands a canary a directive it must never receive |

The first shipped version of `assertRoleCallsignCompatible` used the exact predicate for a deny decision. Measured result: `Canary-pilot` was refused while `canary-pilot`, `CANARY-pilot`, `CaNaRy-pilot` and `canary-` were all **allowed** and each delivered `/coordinator start` to a canary.

The case-insensitive deny that already existed in `resolveStartupPromptForCallsign` does **not** save you here: setting `opts.startupPrompt` short-circuits `defaultStartupPrompt`, so that function never runs for a non-worker role. The route guard is the **only** guard. `build-session-launch.cjs`'s structural backstop doesn't catch it either — it throws only when the prompt is byte-equal to the *worker* directive.

**Rule: any deny decision about canary-ness uses `couldBeCanaryCallsign`.** Both sites now share that one definition specifically so they cannot drift apart again — the drift is what produced the bug.

Related: an `unidentifiable` callsign (`["Canary-pilot"]`, `{}`, `"   "`, a number) classifies as neither worker nor canary, so a `kind === 'canary'` branch lets it through. Privileged roles refuse it.

## `canary` is not a role

It is an **`accountProfile`**; canaries **are** `role='worker'`. `spawn()` takes `{role, callsign, accountProfile}`.

Offering `canary` in the role list would send `accountProfile: undefined` and produce a session that later fails `assertCanaryTarget` with `not_canary_profile` — manufacturing the unexplained refusal the enumerated role list exists to remove. Tests pin the four-role list so adding it fails deliberately.

## Known gap, not closed by this SD

`spawn()` defines `SINGLETON_ROLES` / `isSingletonRole` but **never consults them** — only `restart()` does. So `add-session` with `role='coordinator'` and any fresh callsign starts an *additional* coordinator, which runs `/coordinator start` → `setActiveCoordinator` and takes the pointer with no incumbency check.

This was inert before this SD (the role produced no coordinator prompt) and is live after it. Raised by the EXEC SECURITY review; recorded here rather than silently fixed, because it sits in `spawn()` and this SD deliberately kept its changes at the route.

## Authorization, stated plainly

`/api/fleet-actions` requires a Supabase JWT, but `requireAuth` performs **no role-claim check and no allowlist** — any valid JWT in the shared project passes. The real containment is the server's **loopback bind**.

That was an acceptable trade when `role` was inert. It is a larger one now that `role='coordinator'` seizes the fleet coordinator pointer. Treat exposing port 3000 — a bind change, a tunnel, a reverse proxy, `vite --host` — as a **security decision**, not a convenience one.
