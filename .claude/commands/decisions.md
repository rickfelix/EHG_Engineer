<!-- reasoning_effort: medium -->

---
description: "Chairman decision queue — list every pending decision (escalations, gate decisions, chairman approvals, critical/high feedback, idle draft flags, OKR acceptances) and walk the chairman through deciding each via AskUserQuestion. Nothing auto-decides. SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-001."
---

# /decisions — Chairman Decision Queue

**Constitutional rule**: NOTHING in this flow auto-decides. Recommendations are
display-only defaults; silence escalates VISIBILITY (sort order) only. Every
decision requires an explicit chairman answer, and each answer produces exactly
ONE source write (the CLI prints what was written).

## Steps

1. **List the queue**:
   ```bash
   node scripts/chairman-decisions.mjs list --json
   ```
   Each row carries `decision_type`, `id`, `title`, `priority`,
   `effective_priority` (+`age_escalated` marker when pending > 72h),
   `blocking`, `recommendation`, and `details` (context pack).

2. **Present each pending decision via AskUserQuestion** (one at a time, queue
   order — blocking first, then effective priority, oldest first):
   - Question: the row's title + a 1-2 sentence context summary from `details`
     (age, source, venture if any).
   - Options, in this order:
     1. The row's `recommendation` (or `approve` if none) — label it
        **(Recommended)**. This is a DISPLAY default only; never select it on
        the chairman's behalf.
     2. The alternatives (`reject`, plus any source-specific custom action the
        details suggest).
     3. `defer` — records the deferral durably; the item stays pending.

3. **Execute the chairman's answer** with the CLI (one call per decision):
   ```bash
   node scripts/chairman-decisions.mjs decide <decision_type:id> <approve|reject|defer|custom> --rationale "<the chairman's words or your faithful summary>"
   ```
   Routing (exactly one source write each):
   - `chairman_approval` → `fn_chairman_decide` RPC on `chairman_decisions`
   - `flag_review` → resolves the `feedback` row (status + resolution note)
   - `flag_enablement` → records the call as a `feedback` row (the flag itself
     is NOT toggled — enacting it is the flag tooling's job)
   - `okr_acceptance` → `acceptPendingOkrGeneration` (approve) / generation-log
     reject
   - `escalation` / `gate_decision` → read-only here; tell the chairman to use
     the coordinator inbox / venture gate flow.

4. **Report**: after the pass, summarize what was decided, deferred, and what
   remains pending. Do not loop automatically — one pass per invocation.

## Notes

- If the chairman gives an answer not in the options, pass it through as the
  custom decision verbatim (where the source supports it) — never coerce.
- `decide` without an explicit decision argument exits 1 by design.
