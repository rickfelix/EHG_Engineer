# Solomon ALWAYS-SWEEP policy — flip the durable DEFAULT to proactive (env becomes opt-out only)

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Solomon systemic finding 2026-07-17 (advisory e0352b9c; policy chairman-ratified in-session, only the ENCODING is outstanding). The ratified always-sweep policy (proactive Mode-B sweeps fire regardless of model pin, accepting Opus-depth when Fable is unavailable) is implemented ONLY as a local `.env` override on the chairman's machine (`SOLOMON_SWEEP_MODE=proactive`). `solomonSweepMode()` (scripts/solomon-startup-check.mjs) reads the env first, else regex-tests the pin for 'fable' — so a fresh Solomon session on a clean checkout / different machine / regenerated .env silently reverts to Fable-gating (consult-only whenever Fable is down). Controlled-mode-needs-a-durable-signal class. The recurring account-scoped Fable lockouts (e.g. today's RickFelix2000 flag) invalidate the original "Fable usually available" design assumption.

## Functional Requirements
### FR-1: Default = proactive in the resolver
Flip `solomonSweepMode()`'s DEFAULT to `'proactive'` — the env var remains as an OVERRIDE layer but is only needed to DISABLE (opt-out), never to enable (Solomon's counterfactual accepted as the design).
### FR-2: Align the design-of-record
Update the CLAUDE_SOLOMON.md Fable-pin-trigger section (leo_protocol_sections source for SD-LEO-INFRA-SOLOMON-MODEB-FABLE-PIN-TRIGGER-001): state the ratified always-sweep-accept-lower-depth reality and retire the "Fable usually available" assumption. Reconcile the internal seam: degradation section says Fable-wanting duties "run at Opus-depth" (degrade) while the pin-trigger says "not Fable → consult-only" (drop) — align BOTH toward "degrade" per the ratified policy. Regenerate CLAUDE_SOLOMON.md from DB after the section edit.
### FR-3: Test
A fresh-session simulation (no env override) resolves `solomonSweepMode()==='proactive'`; explicit disable env value resolves to the gated/off mode.

## Success Metrics
- metric: fresh clean-checkout session resolves sweep mode; target: 'proactive' (no local override needed)
- metric: contract degrade-vs-drop seam; target: aligned (degrade)
- metric: per-machine env needed to ENABLE the ratified policy; target: no (opt-out only)

## Smoke Test Steps
1. instruction: Unset SOLOMON_SWEEP_MODE and call solomonSweepMode(); expected_outcome: 'proactive'.
2. instruction: Set the explicit disable value and call it; expected_outcome: gated/disabled mode honored (override layer intact).

## Sizing / Notes
Tier 1-2 QF (resolver default flip + protocol-section edit + regenerate + test). Policy already chairman-ratified — no re-ratify; this is encoding-only. SOURCE-AND-GO. Controlled-mode durable-signal class.
