# Control seed-test dispositions

SD-FDBK-INFRA-CONTROL-MERGE-WITHOUT-001, FR-6. Retrofit is deliberately **not wholesale** — three
targets, each carrying a recorded verdict under the SD's operational rule:

> **TRUST-OR-DISABLE, NEVER WORK-AROUND.** A control that fires on its seed gets TRUSTED (do not
> re-flip around it). One that fails its seed gets DISABLED (do not override around it). The
> seeded-defect test is the discriminator between the two verdicts.

Reproduce any row with:
`node scripts/audit/control-seed-test.mjs --spec scripts/audit/control-seed-specs.json`

## The binary does not cover what the evidence actually found

The rule offers two outcomes. The census produced **three**, and the third is the most common
non-BLOCKS result rather than an edge case. Recording it as either TRUST or DISABLE would be false:

- **TRUSTED** — fires on its seed *and blocks*. The rule's first branch, unchanged.
- **DISABLED** — fails its seed. The rule's second branch, unchanged.
- **NARRATES** — detects the seeded defect, names it accurately, and **exits 0**. Calling this
  TRUSTED is wrong: under the ruled BLOCKS reading it stops nothing at merge time, so trusting it
  is precisely the false confidence this SD exists to remove. Calling it DISABLED is also wrong:
  the detector works, and disabling it would discard a functioning detector over a rollout
  setting. It needs its own verdict, and the action it implies is neither trust nor disable — it
  is **promote or retire**.

This is not a quibble about naming. A binary that has to classify a NARRATES control will push it
into TRUSTED, because "it works" is the obvious reading — and that is how an advisory control comes
to be counted as protection it does not provide.

## Dispositions

| # | Control | Verdict | Disposition | Basis |
|---|---------|---------|-------------|-------|
| 1 | `session-coordination-insert-classguard-lint` | DETECTS (exit 0) | **NARRATES → promote or retire** | Found the seeded raw `session_coordination` insert and named the file, then exited 0 because its diff base was unavailable and it degraded to `all (degraded), advisory: not blocking`. It stops blocking under exactly the odd branch states where strange merges happen — a guarantee that lapses when stressed. |
| 2 | `fleet-liveness-select-lint` | DETECTS (exit 0) | **NARRATES → promote or retire** | Advisory by design; `--enforce` flips it to blocking. Caught the seeded unbounded `claude_sessions` select. Measured in **default** mode deliberately: `--enforce` is not what CI runs, and scoring the enforcing mode would overstate protection. |
| 3 | `no-mocked-sut-import-lint` | SILENT | **UNRESOLVED — explicitly not DISABLED** | Did not name the seeded mocked-SUT fixture. **Not** recorded as blind: re-probed with `NO_MOCKED_SUT_IMPORT_MODE=block` and still silent, so it is not a mode artifact, but the seed may simply miss its detector shape. A SILENT verdict is an accusation and must ship with the evidence to refute it; that evidence is not yet conclusive, so no disposition is recorded. |

**Deliberately absent: a fourth row.** The SD caps retrofit at three targets. Extending it converts
a shippable prevention into an open-ended audit — and the fleet already records lessons ~700× faster
than it converts them (loop-health `witnessesBeforePrevention=1458` against a target of ≤2). The
record is not the scarce thing.

## What a disposition is not

A control may not be **worked around**. That is not a third outcome; it is the protocol violation
the rule exists to forbid. If a TRUSTED control blocks you, the block is the answer. If a DISABLED
control is wrong, fix or remove it — do not route past it.
