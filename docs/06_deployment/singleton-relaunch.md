---
category: deployment
status: approved
version: 1.0.0
author: Claude (SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001)
last_updated: 2026-07-02
tags: [deployment, singleton, relaunch, adam, solomon, coordinator]
---
# Singleton Relaunch Pipeline (A → B → C)

A singleton role-session (Adam, Solomon, the coordinator) can accumulate a stale git
checkout over a long-lived run. This pipeline lets a singleton relaunch itself onto a
fresh checkout without a double-registration window or losing in-flight reasoning
context. Delivered across three children of
`SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001`.

## Pipeline

1. **001-A — Trigger + scheduler.** Consumes the `checkoutFreshness` stale-tree gauge
   (`lib/governance/checkout-freshness.js`). Gates on fleet-quiescence and the target
   singleton's own `loop_state` (fail-closed unless `awaiting_tick`/`exited`), then
   persists an idempotent, flag-gated schedule row to `session_coordination` for B/C to
   pick up.
2. **001-B — Fresh-checkout relaunch + handoff memory** (this doc's primary subject).
   - `lib/singleton-relaunch.js` (`relaunchOntoFreshCheckout`) creates a fresh `ADHOC`
     worktree via `createWorkTypeWorktree` and verifies it against `origin/main` via
     `checkoutFreshness`, throwing on `STALE-CRITICAL`. Scope boundary: this module never
     touches registration/retirement/removal — that's 001-C.
   - `lib/coordinator/handoff-memory.cjs` + `handoff-memory-store.cjs` let a relaunching
     singleton persist in-flight state that isn't already DB-backed (a reply it owed, a
     mid-reasoning consult) before it hands off, and the successor read it back. Same
     shape as the existing `working_context` RPC pattern — see
     `docs/protocol/coordinator-adam-comms.md` for the sibling-key convention.
   - `scripts/singleton-relaunch-restore.cjs` — CLI a fresh session runs after relaunch:
     `node scripts/singleton-relaunch-restore.cjs --predecessor-session-id <id>` prints the
     predecessor's normalized `handoff_memory`. Never throws (exits 0 always) so it's safe
     to shell out to during startup.
   - `scripts/adam-restart.cjs` gained an optional **RELAUNCH** step (`deps.relaunch`)
     between the existing FRESHNESS and REGENERATE steps — a no-op when `deps.relaunch` is
     absent, so the extension is fully backward compatible.
3. **001-C — Register-then-retire sequencer.**
   `lib/coordinator/singleton-refresh-sequencer.cjs` (`sequenceSingletonRefresh`) enforces
   new-session-healthy-before-old-session-retired: the new session must register and pass
   a health check before the old one is retired, so there is never a zero-singleton
   window or a double-registration window. Reuses `worktree-manager.js`'s guarded removal
   and the existing `released_at`/`released_reason` columns. Deliberately unconsumed by
   001-B — 001-B builds the relaunch mechanism; wiring `sequenceSingletonRefresh()` as the
   caller is a separate, explicit integration step.

## Persistence

- `set_session_handoff_memory(p_session_id, p_hm)` — chairman-gated migration
  (`database/migrations/20260702_set_session_handoff_memory.sql`), atomic
  `metadata || jsonb_build_object('handoff_memory', p_hm)`, `EXECUTE` revoked from
  `PUBLIC, anon, authenticated` (server callers use `service_role`, unaffected). Fail-soft:
  when unapplied, the JS writer returns `{persisted:false, reason:'rpc_absent'}` and never
  falls back to an unsafe read-modify-write.

## Operational notes

- The RELAUNCH step in `adam-restart.cjs` is fail-soft — a `deps.relaunch` throw is
  recorded (`warn: fail-soft: ...`) but does not abort the restart sequence.
- `relaunchOntoFreshCheckout` throwing on `STALE-CRITICAL` is intentional: relaunching
  onto a checkout that's already critically behind `origin/main` defeats the purpose of
  the relaunch.
