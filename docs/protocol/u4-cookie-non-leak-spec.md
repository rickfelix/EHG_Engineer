# U4 — Agent-Browser Cookie-Non-Leak Guarantee

**Origin:** SD-LEO-INFRA-LEO-COMPLETION-001-B (FR-4), per Solomon's checkpoint-3 final acceptance
verdict, which called the underlying posture "structurally excellent" but noted it had never been
formally written down. This document originates that formal spec: a threat model, the current proof
substrate, and an explicit falsifiable failing case for Child E (SD-LEO-INFRA-LEO-COMPLETION-001-E,
operator cockpit) to build its live proof against.

Cross-reference: [`fleet-spawn-control.md`](./fleet-spawn-control.md) documents the six-verb control
layer this spec's proof substrate lives inside.

## 1. Threat model

**Asset:** browser session cookies / auth state belonging to one Claude Code account.

**Threat:** when a fleet session relaunches under a *different* account profile
(`relaunchUnderProfile`, per `fleet-spawn-control.md`), the new process could inherit or leak the
prior account's browser session cookies — either because the child process shares the supervisor's
environment, or because two account profiles share the same on-disk profile directory.

**Attacker/failure model:** not necessarily malicious — the primary risk is an *accidental* leak from
process/env/directory isolation bugs, which is exactly the class of bug `relaunchUnderProfile`'s own
isolation assertion (see §2) exists to catch.

**Out of scope:** this spec does not cover browser-level XSS/CSRF or third-party cookie policy; it
covers only the fleet's own account-profile-switching mechanism.

## 2. Existing proof substrate (already shipped, cited here — no net-new mechanism specified)

Per Solomon's checkpoint-3 verdict, these primitives are already structurally in place in
`lib/fleet/spawn-control.js` (SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001, completed):

1. **Per-session sandboxed profile directories, traversal-guarded.** `resolveProfileDir()`
   (`lib/fleet/spawn-control.js:47-57`) resolves an account-profile *name* (not a path) against an
   operator-configured base directory, rejecting anything but a bare `[A-Za-z0-9_-]+` name — never a
   raw/absolute/traversal path from card input. Each account profile therefore gets its own directory
   under `FLEET_ACCOUNT_PROFILES_DIR`; no two profiles can be coerced into sharing one directory via a
   crafted name.

2. **`CLAUDE_CONFIG_DIR` injected into the child's env only — never the supervisor's.**
   `buildLiveSpawnInvocation()` (`lib/fleet/spawn-control.js:70-80`) places `CLAUDE_CONFIG_DIR` into a
   *returned* env object handed to `child_process.spawn`'s `env` option — never assigned to
   `process.env` directly.

3. **The observable isolation assertion (THE proof mechanism this spec binds to).**
   `relaunchUnderProfile()` (`lib/fleet/spawn-control.js:306-313`):

   ```js
   const supervisorConfigDirBefore = process.env.CLAUDE_CONFIG_DIR;
   const spawnResult = await spawnReplacement({ oldIdentity, oldSession, accountProfile }, opts);
   const supervisorConfigDirAfter = process.env.CLAUDE_CONFIG_DIR;
   if (supervisorConfigDirBefore !== supervisorConfigDirAfter) {
     throw new Error('relaunchUnderProfile: supervisor process.env.CLAUDE_CONFIG_DIR changed -- isolation invariant violated');
   }
   ```

   This is a **runtime, observable** assertion (not just a design claim): every relaunch-under-profile
   call snapshots the supervisor's own `CLAUDE_CONFIG_DIR` before and after spawning the replacement,
   and throws if it changed. Because a browser session's cookie jar lives under the profile directory
   named by `CLAUDE_CONFIG_DIR`, an unchanged supervisor `CLAUDE_CONFIG_DIR` is the direct observable
   proxy for "the supervisor's own browser-session cookies were never touched by this relaunch."

4. **Default-OFF gate, re-checked every action.** `isLiveEnabled()`
   (`lib/fleet/spawn-control.js:60-62`) gates the entire live-spawn surface behind
   `FLEET_SPAWN_CONTROL_LIVE`, read fresh on every call (never cached) — no relaunch, and therefore no
   profile-switch, can occur unless the operator has explicitly enabled it for that invocation.

5. **Log-before-action.** Every verb emits a `fleet_verb_*` coordination event (`emitVerbEvent`,
   `lib/fleet/spawn-control.js:91-100`) with a payload hard-locked to exactly `{verb, outcome, at}`
   (FR-9/TR-6 of the sibling SD) — a relaunch's outcome is always durably recorded, never silent.

## 3. PASS observable

A `relaunchUnderProfile()` call for account profile `B` while the supervisor (or any sibling session)
is running under profile `A` **PASSES U4** when, after the call:

- `process.env.CLAUDE_CONFIG_DIR` on the supervisor is byte-identical before and after the call
  (§2.3's existing assertion — already enforced, throws on violation), **and**
- the spawned child's `CLAUDE_CONFIG_DIR` resolves to profile `B`'s own directory
  (`resolveProfileDir('B')`), distinct from profile `A`'s directory, **and**
- no cookie/session file present under profile `A`'s directory is copied into, symlinked from, or
  otherwise reachable from profile `B`'s directory (a filesystem-level non-overlap check).

## 4. FAIL observable (falsifiability — required by this spec, not present before)

U4 is **falsified** — i.e. Child E's proof mechanism must be able to detect and report this — if
**any** of the following is observed during or after a `relaunchUnderProfile('B')` call:

- The supervisor's `process.env.CLAUDE_CONFIG_DIR` differs before vs. after the call (this already
  throws per §2.3 — the falsifying observation is that the *throw itself* is the failure signal Child
  E's proof must capture and assert on, not silently swallow), **or**
- `resolveProfileDir('B')` returns a path that is equal to, or a parent/child of, `resolveProfileDir('A')`
  for any two *distinct* account-profile names `A ≠ B` (a directory-collision/traversal escape), **or**
- A file present under profile `A`'s resolved directory (e.g. a browser cookie-jar file) is also
  readable via profile `B`'s resolved directory path (cross-profile filesystem reachability), **or**
- A `fleet_verb_relaunch_under_profile` event is missing entirely for a call that mutated a live
  session (log-before-action violated — the action happened with no durable record).

A proof implementation that only asserts "no error was thrown" is **not sufficient** — it must
actively check the directory-collision and cross-profile-reachability conditions above, since those
are the classes of bug the existing runtime assertion (§2.3) cannot detect on its own (it only catches
supervisor-env drift, not profile-directory collisions).

## 5. Relationship to the canary isolation harness (FR-3, same SD)

This spec is orthogonal to, but composable with, the canary isolation harness
(`lib/fleet/canary-guard.js`, FR-3 of this same SD): the canary guard's `assert-before-kill` protects
*which session* a mutation may target; this U4 spec protects *what leaks* when a relaunch-under-profile
mutation is applied to a legitimately-targeted session. Child E's live proof should exercise both:
a canary-targeted `relaunchUnderProfile` call, verified via the canary guard, whose profile-switch is
then checked against the PASS/FAIL observables above.

## 6. Acceptance boundary (PIN, no-trim)

Per the parent program's Solomon acceptance pins: this document is a **specification**, not a live
proof. Its own acceptance criterion (see PRD FR-4) is that it exists, cites the exact observable by
file:line, and defines a falsifiable failing case — it does **not** itself constitute the S2 live-drill
U4 spot-check, which remains Child E's live-proof responsibility, re-run by Solomon.
