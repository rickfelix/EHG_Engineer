---
category: architecture
status: approved
version: 1.0.0
author: SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001
last_updated: 2026-07-04
tags: [stage-advancement, artifact-gate, governance, regression, sibling-app]
---

# Sibling-App Regression Checklist — FR-3 Staged Migrations

**SD:** SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-3

**Trigger for this checklist**: the RISK sub-agent flagged (PLAN_PRD phase, CONDITIONAL_PASS
verdict) that FR-3's staged, chairman-gated amendments to `rescan_stage_20`,
`advance_venture_stage`, and `advance_venture_to_stage` (census
[#2, #3, #4](stage-advancement-path-census.md)) are called directly from the sibling **EHG**
app's frontend (`C:\Users\rickf\Projects\_EHG\ehg`), not just from EHG_Engineer's own daemon.
Adding an artifact-gate soft-fail to these RPCs can regress that UI without any change to the
UI's own code. This checklist must be walked **before the chairman applies FR-3's migrations**,
not after.

## Call sites (verified live in the sibling repo)

| RPC | Caller | File | Checks `data.success`? |
|-----|--------|------|--------------------------|
| `advance_venture_to_stage` | `BuildMethodSelector.tsx` (Stage 19→20 "Advance to Stage 20" button) | `src/components/stages/shared/BuildMethodSelector.tsx:367-386` | **Yes** — `if (data?.success) { reload } else { console.error(...) }` |
| `advance_venture_to_stage` | `LeoBridgeBuildPanel.tsx` | `src/components/stages/shared/LeoBridgeBuildPanel.tsx:160-170` | **Yes** — same `data?.success` pattern |
| `advance_venture_stage` | `advanceStage.ts` → `Stage20CodeQuality.tsx` (Stage 20→21 "Advance" button, the S20 verdict-block flow) | `src/lib/ventures/advanceStage.ts:71-80` (`defaultInvokeRpc`) | **NO** — see finding below |

## Finding #1 (CRITICAL — must be fixed in the sibling app BEFORE or AT the same time as FR-3's `advance_venture_stage` migration ships)

`advanceStage.ts`'s `defaultInvokeRpc` only distinguishes a **transport/DB error** (`if (error) throw error`) from success. It never inspects the RPC's own return payload:

```ts
async function defaultInvokeRpc(input: AdvanceStageInput): Promise<unknown> {
  const { data, error } = await supabase.rpc("advance_venture_stage", { ... });
  if (error) throw error;
  return data;   // <-- data.success / data.error never checked here
}

export async function advanceStage(...): Promise<AdvanceResult> {
  ...
  const result = await invokeRpc(input);
  return { ok: true, result };   // <-- always ok:true if the RPC call didn't throw
}
```

`Stage20CodeQuality.tsx` then does:
```ts
if (result.ok) {
  toast.success("Venture advanced to Stage 21");   // <-- fires even on a soft-fail
}
```

**Consequence**: `fn_advance_venture_stage` (the chokepoint, census #1) already returns a
soft-fail JSON (`jsonb_build_object('success', false, 'error', <code>, ...)`) rather than
throwing — this is documented, deliberate RPC behavior (see the PRD summary in this SD's
census doc). FR-3's amendment to `advance_venture_stage` (census #3) is expected to route
through the same soft-fail-on-block convention. Once it does, a chairman/operator clicking
"Advance" on the Stage 20 verdict panel when a required artifact is missing will see a
**green "Venture advanced to Stage 21" success toast while the venture's
`current_lifecycle_stage` did not actually change** — a silent, user-facing false-positive.

**Required fix (sibling app, tracked as a fast-follow, not blocking FR-3's SQL from being
staged)**: `defaultInvokeRpc` must check `data?.success` the same way
`BuildMethodSelector.tsx`/`LeoBridgeBuildPanel.tsx` already do, and `advanceStage()` must
propagate a refusal (`{ok: false, reason: ..., ...}`) when `data.success === false`, not just
when the RPC call throws.

## Verification checklist (walk this after FR-3's migrations are chairman-applied)

1. **Confirm Finding #1 is fixed** in the sibling app (`advanceStage.ts` checks `data.success`)
   before or in the same deploy window as `advance_venture_stage`'s FR-3 amendment. If not yet
   fixed, do not apply the `advance_venture_stage` FR-3 migration — staging it in a PR is safe
   (chairman-gated, never auto-applied), but a live `--prod-deploy` apply without this fix ships
   a silent-false-success regression.
2. **Stage 19→20 (`BuildMethodSelector.tsx`)**: manually drive a fixture venture to Stage 19
   missing a required Stage-19 artifact, click "Advance to Stage 20", confirm the button's
   `console.error("Advance failed:", data?.error)` path fires and the UI does NOT reload/advance.
   (No user-visible toast exists on this path today — `console.error` only. This is a pre-existing
   UX gap, not introduced by FR-3, but worth noting: an operator watching the UI with devtools
   closed sees nothing happen and no reason why.)
3. **`LeoBridgeBuildPanel.tsx`**: same manual check as #2 for its own `advance_venture_to_stage`
   call site.
4. **Stage 20→21 (`Stage20CodeQuality.tsx` / `advanceStage.ts`)**: after Finding #1 is fixed,
   repeat the same fixture-venture-missing-artifact test and confirm `result.ok === false`
   surfaces via the existing `setRefusal(result)` UI path (the override modal /
   `Stage20OverrideModal.tsx`), NOT a false "Venture advanced to Stage 21" toast.
5. **`rescan_stage_20` (census #2)**: confirm no sibling-app frontend call site exists (grep
   confirmed none as of this SD — `rescan_stage_20` is only invoked by
   `lib/eva/stage-execution-worker.js` server-side). Re-grep the sibling repo before applying
   this migration in case a new frontend call site was added since.
6. **Chairman override path**: `logStageAdvanceOverride` + `advanceStageWithOverride` (the
   documented manual-override flow in `advanceStage.ts`) bypasses the verdict guard entirely by
   design — confirm this override path is unaffected by FR-3 (it should be: FR-3 only touches
   the RPC's own artifact-check logic, not this client-side override sequencing).

## Why this is a checklist, not a fix shipped in this SD

FR-3's migrations were staged (`-- requires-chairman-apply`) at authoring time; the chairman
GO decision has since been exercised and **all five are LIVE in the production DB**
(functions + `enforce_stage_advancement_artifact_gate` trigger verified in pg_proc/pg_trigger
2026-07-11 — SD-LEO-INFRA-HARNESS-FIXTURE-ARTIFACT-001 doc-drift correction). Finding #1's fix lives in a **different
repository** (`ehg`, not `EHG_Engineer`) and is out of this SD's EXEC scope by repo boundary,
same rationale as census rows #16/#17. It is captured here so it blocks the chairman's actual
`--prod-deploy` decision for `advance_venture_stage`'s FR-3 migration specifically, and routed
as a completion-flag `deferred_followup` finding so it is not lost.
