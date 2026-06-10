<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\sd-soft-delete-reconcile.md -->
<!-- SD Key: SD-LEO-INFRA-VENTURE-LIFECYCLE-SOFT-001 -->
<!-- Archived at: 2026-05-30T12:47:38.768Z -->

# Venture Lifecycle Soft-Deletion ↔ Applications Registry Reconciliation

## Type
infrastructure

## Target Application
EHG_Engineer

## Priority
medium

## Goal
When a venture is cancelled, killed, or retired through the EHG lifecycle RPCs, the `applications` registry is not kept in sync, so resolvers and gates continue to treat retired ventures as live. Introduce a reversible soft-deletion (tombstone) model on the `applications` registry and reconcile the venture lifecycle RPCs with it, so a retired venture is reflected in one authoritative place without losing any history. Source: inbox feedback 69d4d293-f395-416f-9697-3a69680df7b2.

## Changes
- Add reversible tombstone columns to `applications`: `deleted_at timestamptz`, `deleted_by text`, `deletion_reason text` (all nullable; absence means live). No rows are ever physically removed — soft-deletion only sets the tombstone, preserving full history and making the operation fully reversible (clear the tombstone to restore).
- Add a partial unique index so a venture name is unique only among live (non-tombstoned) rows, allowing a retired name to be reused.
- Reconcile the venture lifecycle RPCs: cancel/kill/retire transitions mark the registry row inactive (status), and the retire transition additionally stamps the tombstone columns; none physically purge data.
- Update the repo/path resolvers and completion gates to filter out tombstoned rows by default (with an opt-in to include retired ones for audit/history views).

## Objectives
- One authoritative lifecycle signal: a retired venture is reflected on its `applications` row, and resolvers/gates honor it.
- Fully reversible and history-preserving: the model only stamps tombstone columns; clearing them restores the row.
- Name reuse works: a retired venture's name can be reused by a new live venture.

## Acceptance Criteria
- AC-1: `applications` has nullable `deleted_at`, `deleted_by`, `deletion_reason`; a live row has them all null.
- AC-2: a partial unique index enforces name uniqueness only across live rows.
- AC-3: the cancel/kill/retire RPCs set the registry status (and the retire path stamps the tombstone); no RPC physically purges a row.
- AC-4: repo-path resolvers and completion gates exclude tombstoned rows by default and can opt in to include them.
- AC-5: clearing the tombstone columns fully restores a retired venture (reversibility test).
- AC-6: a regression test covers retire → resolver hides it → clear tombstone → resolver shows it again.

## Demo
1. Retire a test venture via the RPC → its `applications` row gets `deleted_at` stamped and resolvers stop returning it.
2. Create a new venture reusing the retired name → succeeds (partial unique index).
3. Clear the tombstone → the original venture is restored and resolvable again.
