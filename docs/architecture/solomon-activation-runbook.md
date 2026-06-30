<!-- SD-LEO-INFRA-SOLOMON-CONSULT-001F (Phase F — docs / dashboard / chairman-gated flip-prep).
     This runbook PREPARES Solomon's activation. It does NOT flip SOLOMON_CONSULT_V1 — the flip is
     a chairman-only action (see "The flip is chairman-only" below). Companion specs:
     docs/architecture/solomon-oracle.md §8 (staged-activation) and
     docs/architecture/solomon-agent-definition.md §10–11 (degradation / success metrics). -->

# Solomon Activation Runbook (chairman-gated, graduated)

**Status:** flip-prep. Solomon ships **DORMANT** behind `SOLOMON_CONSULT_V1` (default OFF). Everything
A–F is built and inert; nothing claims, fires, or spends tokens until the Chairman flips the flag.
This runbook is the readiness checklist + the staged-activation sequence the Chairman follows when
ready. **Running this build does NOT activate Solomon.**

> **Model:** Solomon runs on **Opus 4.8** (`claude-opus-4-8`) at high effort / ultracode by default —
> there is **no Fable dependency**. The model is a swappable config pin
> (`MODEL_DEFAULTS.claude.solomon` / `CLAUDE_MODEL_SOLOMON`); swap to a Fable id later only if/when
> Fable clears restriction and the cost/capability justifies it for the deepest duties.

---

## 0. The flip is chairman-only

`SOLOMON_CONSULT_V1=on` is a **Chairman action**, never performed by any build SD (including this one)
or by any worker/coordinator. Flag-off is byte-identical to today. Until the flip:

- `worker-signal.cjs solomon-consult` prints `Solomon dormant — handle locally` and inserts nothing.
- No `solomon_consult` rows are ever written, so the dashboard `PENDING SOLOMON CONSULTS` surface
  (this SD) renders `(no pending Solomon consults)`.
- The triage gate short-circuits to "no oracle"; consults fall through to RCA + asker judgment.

## 1. Pre-flip readiness checklist

Confirm ALL before the first flip:

- [ ] Children A–F all `status='completed'` (foundation, triage SSOT, correctness fixes, worker CLI,
      the Solomon session E, and this docs/dashboard/flip-prep F).
- [ ] The atomic flag migration `set_solomon_flag` / `clear_solomon_flag` (Child A) is **applied**
      (it is Tier-2 chairman-gated — `node scripts/apply-migration.js <path> --prod-deploy`; the JS
      register fail-softs until then).
- [ ] `node -e "require('./lib/config/model-config.js').getClaudeModel('solomon')"` → `claude-opus-4-8`.
- [ ] `CLAUDE_SOLOMON.md` + `CLAUDE_SOLOMON_DIGEST.md` regenerate cleanly from the seeded
      `solomon_role_contract` section (`node scripts/generate-claude-md-from-db.js`).
- [ ] `'broadcast-solomon'` is in `dispatch.cjs SENTINEL_TARGETS`; `solomon-advisory.cjs inbox` is in
      `retry-state-manager.cjs EXEMPT_PATTERNS`.
- [ ] Max-plan auth confirmed for the Solomon session (`/status` shows the subscription, NOT the
      `ANTHROPIC_API_KEY`) — otherwise Opus usage bills as pay-as-you-go API.

## 2. Launch the standing session

1. Set the pin: `CLAUDE_MODEL_SOLOMON=claude-opus-4-8` (default).
2. `claude --model claude-opus-4-8` → run `/solomon` (reads `CLAUDE_SOLOMON.md`, registers via
   `solomon:register`, arms the inbox-monitor + self-adherence ticks).
3. Verify the singleton: exactly one live `role='solomon'` session (`getActiveSolomonId`).

## 3. Graduated activation — "canary the canary"

Do **not** switch fully on. Stage it, watching the advice-outcome ledger + accuracy review
(agent-definition §11) between stages:

| Stage | Flag action (Chairman) | What it enables | Gate to advance |
|------|------------------------|-----------------|-----------------|
| **A** | `SOLOMON_CONSULT_V1=on` | **Mode A only** — reactive consults (workers/Adam `solomon-consult`); Mode B stays gated | Mode-A advice demonstrably trusted + correct (uptake + accuracy hold) |
| **B** | enable Mode-B sweeps | proactive backlog deep-sweeps — still quota- and `task_budget`-bounded | both modes stable |
| **C** | `ADAM_SOLOMON_TWOWAY_V1=on` | the Adam↔Solomon two-way channel (`-G`, ship-dormant follow-on) | — |

**Observe activation on the dashboard:** `node scripts/fleet-dashboard.cjs solomon` (or the `all`
view) renders `PENDING SOLOMON CONSULTS` — pending, un-actioned consults targeted at the live Solomon
or the `broadcast-solomon` buffer. The surface is **pure-read** (it never stamps `read_at`, so it
cannot hide a consult from the oracle's own `solomon-advisory.cjs inbox` drain).

## 4. Degradation (Solomon is advisory, never a critical path)

- **Opus 4.8 available:** Solomon runs normally.
- **A Fable swap requested but Fable unavailable:** the pin stays on Opus 4.8 — only the few duties
  that *want* Fable depth run at Opus depth. A graceful quality degradation on a subset, never an
  outage.
- **`SOLOMON_CONSULT_V1` OFF (default):** no Solomon session; the triage gate short-circuits to
  "no oracle"; consults resolve at RCA + asker judgment. Nothing blocks (Solomon never gates).
- **Gated on but session down:** consults emit an "oracle unavailable — proceed on best reasoning"
  marker and route past Solomon.

**Governing invariant:** Solomon improves outcomes when present and is invisible when absent. No part
of the harness takes a hard dependency on Solomon's advice.

## 5. Rollback

Flip `SOLOMON_CONSULT_V1=off`. Mode B never runs while dormant; in-flight consults fall through to the
next-best resolution. No data migration to undo (the flag is the entire kill switch).

## 6. Success metrics (keep / expand / kill — agent-definition §11)

advice-uptake (`applied`/total) · advice-accuracy (`worked`/`applied`) · systemic yield (findings that
became shipped fixes) · escalations-avoided (resolved at the Solomon rung that would have reached the
Chairman) · cost-per-accepted-proposal. A cluster consistently declined/inaccurate or with
unjustifiable cost-per-accepted-proposal is a candidate to drop — Solomon earns scope empirically.
