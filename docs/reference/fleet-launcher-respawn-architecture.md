---
Category: Reference
Status: Approved
Version: 1.0.0
Author: SD-LEO-INFRA-LEO-COMPLETION-001
Last Updated: 2026-07-21
Tags: fleet, launcher, respawn, supervisor, manifest, checkpoint-3
---

# Fleet Launcher & Respawn Architecture

Reference for the fleet-launcher subsystem built to close Solomon's checkpoint-3
gap findings (G1/G1a/G1b/G2/G3/U4). Delivered by orchestrator
`SD-LEO-INFRA-LEO-COMPLETION-001`, decomposed into children B (shared substrate),
C (launcher shell), D (respawn runner), E (operator cockpit).

## What checkpoint-3 found

Before this initiative, the fleet had no real launcher process, no respawn path, and
no wired operator surface:
- **G1a**: kill-supervisor survival was test-masked — the only test mocked `spawnFn`
  and never exercised the real detached-process path.
- **G1b/G2**: no reboot-respawn runner, no scheduled task, no `claude --resume`
  consumer existed anywhere in the fleet namespace.
- **G2 (manifest shape)**: `lib/fleet/session-manifest.js` was role-count-shaped
  (`{role, min}`), not slot-shaped (name/color/role/account/worktree/model+effort) —
  unusable as a respawn source-of-record.
- **G3**: `lib/fleet/browser-control.js` and `lib/fleet/session-detail-view.js`
  (from `SD-LEO-INFRA-SESSION-VIEW-BROWSER-001` A/B) were fully built and tested but
  had zero production callers.
- **U4**: the cookie-non-leak guarantee for `relaunchUnderProfile` was undefined
  anywhere in-repo — no formal spec, no drill.

## What was built, by child

### Child B — shared substrate (`SD-LEO-INFRA-LEO-COMPLETION-001-B`)
- `lib/fleet/session-manifest.js` — redesigned from role-count drift math into
  desired-state **slots** (name/color/role/account/worktree/model+effort), the
  frozen source-of-record interface Child D's respawn runner and Child E's
  relaunch-under-profile both depend on.
- `lib/fleet/canary-guard.js` — canary isolation harness so respawn/relaunch drills
  can run against a disposable session without touching live fleet state.
- `lib/fleet/session-metering.js`, `lib/fleet/session-registry-adapter.js` — support
  plumbing for the slot-shaped manifest.

### Child C — launcher shell (`SD-LEO-INFRA-LEO-COMPLETION-001-C`, G1a)
- `scripts/fleet/fleet-supervisor.cjs` — a real, persistent, killable supervisor
  process that owns/watches fleet child sessions, extending
  `lib/fleet/spawn-control.js`'s verb-composition style. De-masks the kill-supervisor
  test so it exercises the actual detached-process path instead of a mocked
  `spawnFn`.

### Child D — respawn runner (`SD-LEO-INFRA-LEO-COMPLETION-001-D`, G1b/G2)
- `lib/fleet/desired-slots-store.js` — reads Child B's frozen desired-state-slot
  manifest (fail-soft to `[]` on read error).
- `lib/fleet/reboot-respawn-runner.js` + `lib/fleet/reboot-respawn-drill-runner.js` —
  the respawn runner and its live-drill harness; consumes `claude --resume`.
- `scripts/fleet/reboot-respawn.cjs`, `scripts/setup-reboot-respawn-task.mjs` —
  CLI entrypoint and Windows Scheduled Task registration (adapted from the
  `buildSchtasksArgs` pattern in `scripts/setup-eva-watcher-task.mjs`).

### Child E — operator cockpit (`SD-LEO-INFRA-LEO-COMPLETION-001-E`, G3/U4)
- `scripts/fleet-dashboard.cjs` — wired `buildSessionDetailView()` /
  `requestBrowserSession()` / `signalTakeover()` (from the previously-orphaned
  `browser-control.js` / `session-detail-view.js`) into the live CLI operator
  surface as real production callers, plus model/effort chip rendering.
- `lib/fleet/u4-drill-runner.js` — the formal U4 (cookie-non-leak) spec and live
  account-switch relaunch drill proving `relaunchUnderProfile` never leaks
  chairman cookies to the agent browser.

## Operating it

- **Kill-supervisor drill**: exercise `scripts/fleet/fleet-supervisor.cjs` directly;
  `tests/unit/fleet/fleet-supervisor.test.js` covers the real detached-spawn path
  (no longer mocked).
- **Respawn**: `node scripts/fleet/reboot-respawn.cjs` (manually) or via the
  registered Scheduled Task (`scripts/setup-reboot-respawn-task.mjs`); reads
  `lib/fleet/desired-slots-store.js`, which sources from Child B's manifest.
- **Operator cockpit**: `npm run fleet:dashboard` (`scripts/fleet-dashboard.cjs`) —
  per-session detail view, browser takeover, model/effort chips.
- **U4 drill**: `lib/fleet/u4-drill-runner.js` — run to re-verify the cookie
  non-leak guarantee after any change to `relaunchUnderProfile`.

## Gotchas

- The manifest redesign in `session-manifest.js` intentionally shares a filename
  with `SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001`'s role-count manifest work — a
  naming-collision risk flagged during LEAD research; check which shape a given
  caller expects before assuming.
- Respawn only reads from Child B's slot manifest via `desired-slots-store.js` —
  it does not independently recompute desired state.
- The kill-supervisor test previously passed while asserting nothing real; if a
  future change reintroduces a mocked `spawnFn` in that test path, it silently
  regresses G1a's coverage without failing CI.
