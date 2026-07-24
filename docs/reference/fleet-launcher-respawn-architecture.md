---
Category: Reference
Status: Approved
Version: 1.2.0
Author: SD-LEO-INFRA-LEO-COMPLETION-001
Last Updated: 2026-07-24
Tags: fleet, launcher, respawn, supervisor, manifest, checkpoint-3, session-view, mockup-2
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
  had zero production callers. (Closed by Child E below; a second, graphical
  consumer was added later by `SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-B` — see
  "Graphical Session View pane" section below.)
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

## Graphical Session View pane (SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-B)

A second, graphical consumer of `browser-control.js`/`session-detail-view.js`/
`spawn-control.js`'s `attach()`, added as Child B of the chairman-directed
`SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001` (LEO launcher UI shell, mockup #2
assembly). Child E's CLI cockpit (above) remains the terminal-based consumer;
this is the first graphical one, served via EHG_Engineer's Express server under
a narrow, chairman-ratified exception to SD-ARCH-EHG-007 (see the exception note
at the top of `server/index.js`) since the fleet-launcher operator UI is
internal-only, not customer-facing product UI.

- `server/routes/fleet-sessions.js` — 5 `requireAuth`-gated routes: `GET /:id`
  (fresh view-model), `POST /:id/attach`, `POST /:id/browser-session`,
  `POST /:id/takeover`, `POST /:id/hand-back`, `GET /:id/browser-log` (auditable
  take-over/hand-back trail from `coordination_events`). No changes to the 3
  library modules — wired only.
- `server/public/fleet-ui/` — framework-free HTML/CSS/vanilla-JS pane (no
  React/Vue exists anywhere in this repo). Renders the 4 distinct `attach()`
  outcomes, a caution-striped sandbox frame, human-takeover/hand-back controls,
  and the auditable browser action log.
- **Render-layer completion (SD-LEO-INFRA-LEO-APP-RENDERED-001-B)**: the
  2026-07-22 render smoke-check found this pane missing a header bar, a live
  TTY/terminal pane with a ctx%/last-tool/wakeup footer, an agent-browser pane
  (URL bar + AGENT badge + narration), and F/B/A keyboard nav — this child SD
  closed that gap to match the ratified mockup-2 image below. `GET
  /:id` gained additive `badge`/`model`/`effort`/`role`/`callsign` fields
  (reusing `lib/fleet/fleet-view-badges.cjs`'s `computeSessionBadge()`, no
  logic duplication). The agent-narration stream is synthesized client-side
  from the real `browser-log` events (sorted chronologically before
  numbering — the endpoint itself returns newest-first) rather than a
  fabricated transcript, since no narration/transcript data source exists
  anywhere in the fleet namespace; a merge-blocking static-string test
  (`session-view.test.js` TS-7) guards against ever shipping the mockup's
  illustrative dialogue as real content.
- **Known scope boundary**: authorization is `requireAuth` (any authenticated
  account) plus session-existence checks only — no role gate (unlike
  `protocol-lint.js`'s `requireAdminRole`) and no per-session ownership check.
  Matches the PLAN-phase "single-operator trust model" judgment; flagged as an
  open follow-up decision given the surface drives OS-level window focus,
  sandboxed browser launch, and pause/resume of another operator's session.
- **Known integration gap**: the pane's own `fetch()` calls carry no auth
  header, so every action 401s when loaded standalone — credential-passthrough
  depends on how the parent SD's assembly shell eventually hosts this fragment.
- **Cross-sibling coordination**: as of this child's EXEC phase, siblings -A
  (fleet panel, `server/routes/fleet-panel.js`) and -C (control-verb buttons,
  `server/routes/fleet-actions.js`) plus the parent's own assembly-shell work
  all converge on one graphical UI surface. All three children (this one, -A,
  -C) shipped API-only + tests -- none has committed a shared framework/mount-
  contract or a static UI fragment except this child's `server/public/fleet-ui/`.
  This fragment stays dependency-free and self-contained (no assumed
  parent-shell mount API) to minimize integration coupling with whatever the
  parent ultimately builds.
- Ratified mockups: `docs/design/mockup-1-fleet-launcher.png` (sibling -A) and
  `docs/design/mockup-2-session-view-terminal-agent-browser.png` (this child).

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
