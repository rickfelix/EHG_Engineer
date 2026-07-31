# Companion reachability — the decision FR-2 refuses to leave silent

**SD**: SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 / FR-2
**Status**: DECISION REQUIRED — routed to the coordinator for the chairman
**Written**: 2026-07-31 by fleet worker Alpha-2 (session 8aa7b984)

FR-2 allows exactly two outcomes and forbids a third: wire the companions, or record the
demotion explicitly and get it approved as such. **Silence is the unacceptable outcome.** This
document is the record, because the wiring turns out not to be available on its own.

## What is true today, measured

`CLAUDE_ADAM_MANUAL.md` and `CLAUDE_ADAM_PROVENANCE.md` do not exist at the repo root. They
exist only as drafts under `docs/protocol/adam-contract-review-2026-07-29/`. Specifically:

| Surface | Contains the companions? | Consequence |
|---|---|---|
| `getFileSpecs()` (`claude-md-generator/index.js`) | **No** — hardcoded table | Nothing generates them; adding a key to `section-file-mapping.json` produces nothing |
| `KNOWN_GENERATED_FILES` | **No** | Never drift-checked against the DB |
| `PROTOCOL_FILES` (`protocol-file-tracker.cjs`) | **No** | A read of them is never tracked, so no gate can require one |

## Why this is not housekeeping — the number

Re-probing the FR-1 imperative inventory against everything a reader can actually reach
(contract + both companions) retired 83 previously-open imperatives. Of those 83:

```
manual            63
provenance        14   -> 77 of 83 reachable ONLY in a companion
contract           4
contract+manual    1
union-only         1
```

**77 of 83 surviving obligations are reachable only inside a file that nothing loads,
nothing drift-checks, and nothing tracks a read of.** Moving them there without a loader is
not a relocation. It is a demotion from GOVERNED to ADVISORY with a forwarding address
nobody follows — which is exactly what the approval's "provenance prose, not rules"
justification assumed would not happen.

## Why the preferred branch — "wire them" — is NOT independently available

Wiring is four edits: a mapping entry, a generator function, a `getFileSpecs()` entry, and
`KNOWN_GENERATED_FILES` (plus `PROTOCOL_FILES` for read tracking). Doing them **before** the
governed rows exist is actively harmful, not merely premature:

1. `generate()` would write a companion containing only scaffolding — a governed-looking file
   with no governed content, which is a worse artifact than no file at all.
2. `check-claude-md-drift.cjs` compares the rendered output against what is on disk. A file
   that renders empty and is absent on disk makes the fleet-wide drift check go **red**.
3. Making the wiring conditional on "rows exist" collides with
   `scripts/__tests__/check-claude-md-drift.test.js:135`, which asserts the file list is
   EXACTLY `KNOWN_GENERATED_FILES` precisely to catch a forgotten file.

So the companions can only be wired **in the same motion that lands their rows** — and landing
governed rows is FR-3, which is chairman-blocked. FR-2 and FR-3 are one decision, not two.

## The decision requested

**Option A — GOVERN (recommended).** When FR-3 lands, land the companions as governed
`leo_protocol_sections` rows under their own section_types and wire all four surfaces in the
same change. The 77 obligations stay governed. Cost: two new section_types, four mechanical
edits, one regeneration.

**Option B — DEMOTE, explicitly.** Accept that the companions are advisory reference material
and that the 77 obligations above are no longer governed content. If this is chosen it must be
stated in the contract itself, so a future reader is not misled by a pointer that reads like a
citation of governing text. This is a real option — some of the 77 may genuinely be provenance —
but it must be *chosen*, not arrived at by leaving the wiring undone.

**What must not happen** is the third path: the shortened contract lands, points at two
companions, and nobody decides which of A or B is in force. That produces a contract whose own
header cites files that no mechanism reads — the failure this SD exists to prevent.

## Note on the remaining 216

The 216 still-open imperatives cannot be adjudicated by any text-matching tool. Calibration
measured a **3-of-3** blind rate: three rules *known* to survive into the corrected contract are
lexically invisible there, because the restorations were reworded rather than copied. That is
why `scripts/adam-contract-survival-probe.cjs` never reports ABSENT, and why the earlier
automated score was falsified. Closing those 216 requires a reader, and the outcome of this
decision changes what "survives" even means for them — if Option B is chosen, every one of them
that lands in a companion has survived as advisory text and not as a rule.
