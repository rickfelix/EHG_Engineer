# Chairman Venture Delete + Cancel with SD-Cancellation Cascade

**Type:** feature
**Priority:** high
**Target repos:** EHG, EHG_Engineer

## Problem Statement

The Chairman portfolio overview at `/chairman/ventures` (`VentureTable.tsx`) is read-only — rows only navigate to the venture detail. There is no way to delete or cancel a venture from where the chairman actually lands; the delete UI lives only on the separate `/ventures` builder page (`VentureDataTable.tsx`).

Worse, the current deletion path has a data-integrity gap: `delete_venture(p_venture_id)` **orphans** a venture's strategic directives rather than cancelling them. The FK `strategic_directives_v2.venture_id` is `ON DELETE SET NULL`, and the RPC explicitly runs `UPDATE strategic_directives_v2 SET venture_id = NULL` — so an `in_progress` SD becomes an active-but-orphaned queue item, disconnected from the venture that motivated it. Same for `product_requirements_v2`, `sd_phase_handoffs`, `sd_proposals`.

There is also no first-class "cancel" operation. The schema already has venture-level kill-switch infrastructure (`killed_at`, `kill_reason`, `kill_switch_activated_at/by/reason`, `ventures_kill_log`) that is currently unused by any UI flow.

## Goal

Add Delete and Cancel actions to the Chairman venture table, and make both operations cancel the venture's non-terminal strategic directives instead of silently orphaning them. Cancel uses kill-switch semantics (keep all data + repo, mark cancelled, halt workers, reactivatable); Delete keeps its full teardown (repo + cascade) but now cancels SDs first for an audit trail.

Decisions confirmed with the chairman on 2026-05-28:
- **Cancel = kill-switch (terminal, reversible by reactivation, keeps data + repo).**
- **SD cascade = non-terminal SDs only** (`draft`, `planning`, `in_progress`, `review`, `pending_approval`); leave `completed` SDs untouched to preserve delivered history.
- **Process = full Tier-3 LEO SD, cross-repo.**

Blast radius is small: 22 SDs linked across 16 ventures at creation time.

## Scope

### FR-A — EHG_Engineer: cancel_venture RPC + delete_venture cascade + migration
- New `cancel_venture(p_venture_id uuid, p_reason text)` SECURITY DEFINER RPC:
  - Set `ventures.status = 'cancelled'`, populate `killed_at`, `kill_reason`, `kill_switch_activated_at/by/reason`.
  - Insert a `ventures_kill_log` row.
  - Cancel non-terminal linked SDs: `UPDATE strategic_directives_v2 SET status='cancelled', cancellation_reason=<reason>, metadata = metadata || {cancelled_due_to_venture, cancelled_at} WHERE venture_id = p_venture_id AND status NOT IN ('completed','cancelled')`.
  - KEEP all venture data and the GitHub repo. Idempotent (re-running on an already-cancelled venture is a no-op success).
- Extend `delete_venture` to run the same non-terminal SD cancellation BEFORE the existing `SET venture_id = NULL`, so deleted ventures leave a cancellation audit trail rather than silent orphans.
- Migration ships before any UI writes (staged rollout).

### FR-B — EHG_Engineer: cancel endpoint
- `POST /api/ventures/:id/cancel` in `server/routes/ventures.js`, mirroring the `full-delete` endpoint's auth + error handling. Calls `cancel_venture`, returns cancelled-SD count + kill-log id.

### FR-C — EHG: Chairman VentureTable Delete + Cancel actions
- Add a per-row `⋯` actions menu (DropdownMenu) to `src/components/chairman-v3/ventures/VentureTable.tsx`.
- **Delete** reuses the existing permanent-delete confirm dialog pattern (including the GitHub-repo-teardown warning) → `deleteVenture` service.
- **Cancel** opens a new, lighter confirm dialog ("keeps the venture and its repo, cancels N linked strategic directives") → new `cancelVenture` service in `src/services/ventures.ts`.
- Add a `cancelled` entry to `statusConfig` so cancelled ventures render a distinct badge.
- Use `stopPropagation` so the actions menu does not trigger the row-click navigation.
- Wire mutations with React Query invalidation of the `useVentureLifecycle` query.

### FR-D — Tests
- RPC: non-terminal SDs cancelled, completed SDs untouched, kill-switch columns populated, idempotency.
- Endpoint: success + error shape.
- UI: actions menu renders, Delete/Cancel dialogs open, mutations call the right service, row-click still navigates.

## Out of Scope
- Bulk cancel (single-row cancel only for v1; bulk delete already exists on `/ventures`).
- A dedicated "reactivate cancelled venture" UI (DB supports it; UI deferred).
- Changing the existing `/ventures` builder-page delete UX.
- Deep worker-halt enforcement IF the stage workers do not already honor a kill flag — PLAN verifies this; if unwired, v1 marks + logs and worker-halt becomes a fast-follow.

## Success Criteria
- Cancelling a venture from the Chairman table sets `status='cancelled'`, populates kill-switch columns + a `ventures_kill_log` row, and cancels its non-terminal SDs — while the venture row and GitHub repo remain.
- Deleting a venture still tears down repo + cascade, but its non-terminal SDs end up `status='cancelled'` (with reason) rather than orphaned with a null venture_id.
- Completed SDs linked to the venture are never altered by either operation.
- The Chairman `/chairman/ventures` table exposes working Delete and Cancel row actions, each behind a confirmation dialog.
- `delete_venture`'s existing callers (master-reset, bulk-full-delete) keep working; no regression.

## Risks
1. **Destructive action on the executive overview** — mitigate with explicit confirm dialogs (Delete = permanent + repo-teardown warning; Cancel = clear "cancels N SDs" copy).
2. **delete_venture RPC change affects all delete callers** (master-reset, bulk) — the SD-cancel step must be additive and preserve existing teardown order; covered by tests.
3. **Worker-halt on cancel** — kill flag may not be honored by stage workers today; verify in PLAN, fast-follow if needed.
4. **Cross-repo coordination** — EHG UI depends on the EHG_Engineer endpoint + RPC; ship migration/RPC first (staged rollout), then endpoint, then UI.
5. **Idempotency** — repeated cancel/delete must not error or double-log.
6. **Related vision** — `VISION-VENTURE-DELETE-PARITY-L2-001` exists; align language/scope, do not contradict prior `SINGLEVENTURE-AND-BULK-DELETE` delete work.
