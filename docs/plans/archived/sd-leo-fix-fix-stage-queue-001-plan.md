<!-- Archived from: C:/Users/rickf/.claude/plans/sd-stage0-queue-runaway-fix.md -->
<!-- SD Key: SD-LEO-FIX-FIX-STAGE-QUEUE-001 -->
<!-- Archived at: 2026-06-06T11:59:34.129Z -->

# Fix Stage-0 queue processor runaway: never-terminal status re-processes requests into duplicate ventures

## Type
bugfix

## Priority
high

## Target Application
EHG_Engineer

## Summary

`scripts/stage-zero-queue-processor.js` — the Stage-0 work-queue consumer — caused a runaway
that generated **131 duplicate "discovery" ventures** in the EHG product between 2026-05-31 and
2026-06-06. This SD fixes the root cause so a single intake request can never be synthesized into
more than one venture, and so a request that has already produced a venture can never be re-claimed
and re-run.

## Problem

The processor's per-request lifecycle is: mark the `stage_zero_requests` row `in_progress`
(`processRequest`, line ~229), call `executeStageZero()` which **synthesizes and inserts a venture**,
then write the terminal status (`completed`/`failed`) — and only in that terminal write does it
backfill `venture_id` (line ~257). The venture-creating side effect therefore lands BEFORE the
terminal status and BEFORE any durable venture linkage on the request.

Failure mechanism (root-caused this session):

- For request `760f4d20` the venture was created but the process died / timed out **before** the
  terminal status write, leaving the request stuck `in_progress` with `completed_at` NULL **and no
  `venture_id` set** (the backfill never ran).
- `releaseStaleClaims()` (line ~61; `STAGE_ZERO_STALE_CLAIM_MINUTES`, default 30) blindly resets any
  `claimed`/`in_progress` row older than the threshold back to `pending`, with **no check for whether
  a venture was already created**. The poller then re-fetches and re-claims the same request and
  `executeStageZero()` **synthesizes ANOTHER venture**. Infinite loop, roughly one venture per 30-60 min.
- Compounding gap: the dedup guard `checkForDuplicate()` (line ~189) short-circuits with
  `if (path !== 'blueprint_browse' || !request.blueprint_id) return null;` — so **`discovery_mode`
  has no dedup at all** and nothing caps the repeats even when prior runs completed.
- There is **no attempt/retry cap** anywhere, so a request that keeps failing (or keeps dying
  mid-run) loops forever.

This is the same "failed-but-created status desync" already flagged for request `eb698149` in
`docs/adr/adr-stage0-intake-001.md` (item G4 / backlog item F4: "RCA the Stage 0 request status
desync", classified bugfix) — it was never fixed, and `760f4d20` is a strictly worse,
never-terminal form of it that turns a one-time desync into an unbounded duplicate-generation loop.

## Scope

In scope — `scripts/stage-zero-queue-processor.js` and `lib/eva/stage-zero/*` only (single repo,
EHG_Engineer):

- Durable terminal status / idempotent synthesis so an already-synthesized request is never re-run.
- A `releaseStaleClaims` guard that refuses to re-`pending` a request that already created a venture.
- Extend `checkForDuplicate` to cover `discovery_mode` (currently `blueprint_browse`-only).
- An attempt/retry counter on `stage_zero_requests` with a fail-terminal cap.
- Tests for the never-terminal-and-re-claimed scenario.

Out of scope: the broader F1-F7 intake backlog in the ADR, the `/chairman/explore` route fix, the
EHG product UI, and any cleanup/dedup of the 131 already-created duplicate ventures (data remediation
is a separate operational task — this SD stops the bleeding in code).

## Changes

- Make venture synthesis idempotent per request: before calling `executeStageZero()`, check whether
  this request already has a linked venture (its own `venture_id` is set, OR a venture row already
  references this request id) and, if so, write the terminal status instead of re-synthesizing.
- And/or write the terminal status + `venture_id` atomically with (or immediately guarded by)
  venture creation so the never-terminal window cannot leave a created-but-unrecorded venture.
- Add a guard in `releaseStaleClaims()` so a request that already produced a venture is moved to a
  terminal state (e.g. `completed`/`failed`) rather than reset to `pending`.
- Extend `checkForDuplicate()` so `discovery_mode` requests dedup against prior equivalent
  completed requests (define the discovery-mode dedup key from the request's strategy/constraints
  metadata), removing the `blueprint_browse`-only short-circuit.
- Add a `processing_attempts` (or equivalent) counter column on `stage_zero_requests`, incremented
  on each claim/process; after N attempts the request is marked terminal `failed` instead of being
  re-claimed and looped.
- Add tests reproducing the never-terminal-then-re-claimed path and asserting exactly one venture is
  created.

## Success Criteria

- A request that has already created a venture is NEVER re-synthesized into a second venture, even
  after `releaseStaleClaims()` runs (no `in_progress`-with-venture row is ever reset to `pending`).
- The terminal status (and `venture_id` linkage) is durable: a process death between venture
  creation and status write cannot result in a duplicate venture on the next poll cycle.
- `discovery_mode` requests are deduplicated against prior equivalent completed requests, mirroring
  the existing `blueprint_browse` dedup.
- `stage_zero_requests` carries a `processing_attempts` (or similar) counter; after N attempts a
  request is failed-terminal instead of looping indefinitely.
- A regression test reproduces the never-terminal-and-re-claimed scenario (venture created, process
  dies before terminal write, stale-claim release runs, request re-fetched) and asserts exactly one
  venture results.
- Root cause is addressed, not symptoms: no code path remains where a single `stage_zero_requests`
  row can produce more than one venture.

## Smoke Test Steps

- Seed a `stage_zero_requests` row with `metadata.path = 'discovery_mode'`, mark it `in_progress`
  with a created venture but NULL terminal status (simulating the `760f4d20` death window), run
  `releaseStaleClaims()` then `pollOnce()`, and confirm NO second venture is created and the request
  reaches a terminal state.
- Run the same path twice for an identical `discovery_mode` request and confirm the second run is a
  dedup hit (no new venture), proving `checkForDuplicate` now covers `discovery_mode`.
- Drive a request that fails repeatedly and confirm it is marked `failed` once the
  `processing_attempts` cap is reached instead of being re-claimed forever.

## Risks

- A migration adds the `processing_attempts` column to `stage_zero_requests` — must default safely
  for existing rows and not disrupt the live queue.
- The discovery-mode dedup key must be chosen so legitimately-distinct discovery requests are not
  collapsed into one (avoid over-dedup).
- Idempotency check adds a read before synthesis — verify it does not materially slow the poll loop.

## Key Principles

- Root-cause fix, not a workaround: a single intake request must map to at most one venture.
- Fail-terminal beats loop-forever: bounded retries with an explicit terminal failure.
- Preserve existing `blueprint_browse` behavior; extend, do not rewrite, the dedup path.
