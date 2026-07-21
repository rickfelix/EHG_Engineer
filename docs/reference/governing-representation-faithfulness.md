---
Category: Reference
Status: Active
Version: 1.0.0
Author: SD-LEO-INFRA-GOVERNING-REPRESENTATION-FAITHFULNESS-001
Last Updated: 2026-07-21
Tags: [governance, invariant, gauge-vs-truth, contract, detector]
---

# Governing-Representation Faithfulness

## The invariant

**A fact or obligation that lives in a source representation `R1` must be faithfully present in the
representation `R2` that actually GOVERNS behavior, and any divergence must FAIL LOUD — never silently
resolve to a convenient default.**

This is the previously-unnamed invariant behind the entire *gauge-vs-truth* incident family. The harness
had been fixing it **one site at a time**; this is the naming tier that names it once so it can be
detected everywhere. New incidents register as **instances of this one contract**, not as N sibling SDs.

## The single mechanical predicate

> **Does the governing representation `R2` derive from the source-of-truth `R1` at write/action time, and
> does it alarm on divergence?**
>
> `faithful ⇔ (derives_at_action_time ∧ alarms_on_divergence)`

Two distinct failure modes, each independently sufficient to make a site **unfaithful**:

- **Hand-derived R2** — `R2` is re-derived after the fact (not from `R1` at action time). It drifts.
- **Silent default** — the site resolves `R1 ≠ R2` to a convenient default instead of alarming. It is
  unfaithful *even when `R2` currently matches `R1`*, because the alarm — not the momentary agreement —
  is the contract.

Solomon's cheap validation: the single predicate generalizes cleanly across count-integrity
(`rows.length` vs true `COUNT(*)`), acceptance-trim (gate-accepted mock vs ratified live AC), and
comms-truncation (preview vs full body).

## Instances (the registry)

The machine-readable registry lives in [`lib/governance/representation-faithfulness.js`](../../lib/governance/representation-faithfulness.js)
as `INSTANCE_REGISTRY`. Each instance names its `R1`, its `R2`, the derive-at-action-time site, and the
loud-alarm mechanism. Seeded instances:

| Instance | R1 (source of truth) | R2 (governs behavior) | Status |
|---|---|---|---|
| count-integrity | true `COUNT(*)` | `rows.length` (1000-capped) | shipped |
| acceptance-integrity | ratified live AC | gate-accepted mock | shipped (sibling SD) |
| role-measurement-integrity | authoritative role | measured/displayed role | shipped (sibling SD) |
| comms-capBody | full body | delivered preview (`slice(0,300)`) | existing |
| park-obligation-watcher | park/route order | worker loop state | planned |
| review-loop-action-closure | flagged-and-owed obligation | closure/escalation ledger | planned |
| fence-classification-view | ~8 scattered fence metadata keys | hand-derived fence status each tick | planned |

## Triage rule

When a new gauge-vs-truth incident appears, **register it as an instance** here (name its `R1`/`R2`,
the derive site, the alarm), then apply the shared predicate. Do **not** open a new sibling SD for the
same class.

**Counterfactual (do not over-abstract):** if a site genuinely resists the common predicate, register it
as `status: 'separate'` (per-site) and record the decision — the registry stays honest rather than
force-fitting every site under one lint.

## Detector API

- `assessFaithfulness(instance)` → `{ faithful, divergent, alarms_on_divergence, remediation }` (F2)
- `assessRegistry(registry)` → per-instance verdicts + the currently-unfaithful set
- `divergenceAge(registry, { nowMs })` → oldest-undetected-divergence + oldest-unclosed-flagged age (F3)
- `isActionClosureFaithful(item, { nowMs, dueCycleMs })` → flags an unclosed flagged item past its due
  cycle so it auto-escalates (F4)

## Related

Instances shipped as their own SDs (now registered here): `SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001`,
`SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001`. Prior art: the gauge-vs-action divergent-flag SSOT family.
