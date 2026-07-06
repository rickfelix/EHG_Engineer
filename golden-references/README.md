# Golden References — canonical implementations for the delegate tier

**Source SD**: `SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001` (chairman sprint item 3, 2026-07-05, amendment honored: consumption target is the **Opus/Sonnet delegate tier**, not local open-weight models).

A golden reference is a pristine, fully-worked example of one recurring logic domain,
authored at Fable depth so a delegate-tier session can apply the same logic to a new
target **without reading the estate**. Durable-output doctrine: quality that outlives
the burst window.

Each reference lives in `golden-references/<domain>/` and contains exactly:

| File | Purpose |
|---|---|
| `problem-prompt.md` | The original problem statement + the reuse evidence that earned this domain a reference |
| implementation file(s) | The canonical implementation — self-contained, isolation-law compliant |
| test file(s) | **Both directions**: the miss test proves the guarded failure fires; the pass test proves the happy path |
| `application-guide.md` | Template-shaped instructions for a delegate (rubric-validated, see below) |

## Isolation law (executable, not convention)

References import **only**:
- `node:` builtins (either form: `fs` or `node:fs`),
- `@supabase/supabase-js`, `dotenv`, `vitest`.

Anything resolving into the repo's own source tree (`lib/`, `scripts/`, `database/`,
relative escapes like `../../lib`) is a violation. **Non-literal** imports
(`import(variable)`, `require(expr)`) are conservatively flagged — if the scanner
cannot statically clear it, it fails. Enforced by
`tests/unit/golden-references/isolation.test.js`; the planted fixture under
`tests/fixtures/golden-references/` keeps the miss direction honest.

Why: a reference that leans on estate wrappers rots when the estate refactors, and a
delegate consuming it would need estate context — the exact dependency this folder
exists to remove. Where the estate has a richer wrapper (e.g. `lib/supabase-client.cjs`),
the reference shows the canonical *raw* wiring and says so in a comment.

## Application-guide rubric (machine-checked)

Every `application-guide.md` must carry these sections, validated by
`lib/governance/golden-reference-rubric.js` (`checkGuide`):

1. `## Inputs` — what the delegate needs before starting (names, schema, env).
2. `## Adaptation points` — exactly what to rename/rewire per target.
3. `## Invariants` — what must NOT change, and why each invariant exists.
4. `## Acceptance (both directions)` — the miss check and the pass check the
   applied output must satisfy.

Guides are explicit and low-context on purpose: that discipline transfers to any
future delegate tier.

## Registry

`golden-references/registry.json` is the **source of truth**: one row per reference
`{domain, path, guide, door_class_of_application, provenance: {source_files,
source_commit}, created_at}`. `scripts/golden-references/mirror-registry.mjs` mirrors
rows into the existing `leo_artifacts` table (`artifact_type='golden_reference'`,
registry row folded into `content` JSONB) — **zero new DDL**; idempotency is
application-level (select by natural key, insert only if absent) because the live
table carries no unique index. A missing table fails **loud** via `to_regclass`,
never a silent head/count no-op.

## Consumption proof (the transfer gate)

A reference is proven when a Sonnet-tier session applies it to an
**adaptation-forcing** fixture task (different entity names + at least one structural
change, so transcription cannot pass) using only the guide + problem prompt, and the
output passes the reference's own both-directions acceptance. The live run happens
**once**; its output is captured to a committed golden fixture so CI stays
deterministic (no live LLM per build). Child `-B` (gated RPC + migration) carries the
family's live proof.

## Staleness policy

References carry `REVISIT-IF` tags (grammar: `lib/governance/revisit-tags.js`) on any
premise that can expire; this folder is in the expired-premise gauge's default scan,
so lapsed premises surface as gauge findings. Doctrine examples in prose (like the
ones in this README) are written so they never parse as real tags — a real tag is a
comment whose body *starts* with the marker, e.g. a line reading
`// REVISIT-IF(...)` followed by `owner=` and `provenance=` fields on the same line.
Registry `provenance` (source_files + source_commit) additionally enables drift
diffing when the estate seam a reference was distilled from moves on.
