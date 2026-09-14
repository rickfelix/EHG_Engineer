# Venture Quality Model v1

**Category**: Architecture
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B
**Last Updated**: 2026-09-13
**Tags**: quality, ratification, venture-lifecycle, capa

## Why this doc exists

Root cause A of the chairman-ratified Venture Quality Review Programme (ratification
[`0afc86e4-3aa5-4ad4-87f8-952a832cd48b`](../../lib/eva/quality-model/registry.js)) is
that there was no quality model of record: `FINDING_CATEGORIES`
(`lib/eva/quality-findings/finding-shape.js`) and the stage-23 launch-readiness
checklist's category arrays (`lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js`)
were each hand-maintained, accreted one SD at a time, with no shared source of truth.

This SD builds that source of truth: [`lib/eva/quality-model/registry.js`](../../lib/eva/quality-model/registry.js),
a frozen array of dimension records. Both category arrays above are now **generated**
from it (see the registry module's own docblock for the exact derivation and provenance
rules — this doc is the narrative companion, the registry is the machine-readable
source).

## What the ratification actually said

The chairman's verbatim ratified quote for `0afc86e4` is five agreement sentences:

> "I agree with decision one. I agree with the decision, too. I agree with decision 3.
> I'm not sure about decision 4... I agree with decision 5."

It names **zero** dimensions by name. The ~20-dimension enumeration ("about twenty
dimensions in tiers: the eleven design-quality dimensions plus public-route protection,
data protection, legal, billing correctness, onboarding, analytics, monitoring/uptime,
feedback/support, functional journeys") exists only in a **scribe paraphrase** of the
ratification meeting (CLAUDE.md / the CAPA-001 plan doc) — not in the ratified quote
itself. This is a deliberate, load-bearing distinction: every dimension in the registry
below carries a `ratification_pointer.source` tag saying exactly which kind of evidence
backs it, so a future reader never mistakes a paraphrase for a verbatim instruction.

## The three (or four) kinds of provenance

| `source` | Meaning |
|---|---|
| `chairman_verbatim` | The chairman's own words name this dimension. (None do, today — see above.) |
| `scribe_paraphrase` | A documented paraphrase of the ratification meeting names this dimension or its tier as a category, even though the verbatim quote doesn't enumerate it. |
| `verified_external_proxy` | The specific name isn't in any ratification-adjacent document, but is grounded in an independently verified, published system-of-record used as the best available stand-in for an ambiguous paraphrase reference. |
| `reconstructed` | Invented with no supporting document at all. **Forbidden** — the registry module throws at load time if any entry carries this tag. |

## The "eleven design-quality dimensions" ambiguity

The scribe paraphrase claims "the eleven design-quality dimensions" as a tier, but
**does not enumerate them**. The only verified, published source in the same
neighborhood is the `adherence_rubrics` table:

- `design_quality_v1` (published, 6 dimensions): `trust`, `typography`, `brand_assets`,
  `visual_hierarchy`, `accessibility_states`, `content_copy_corpus_fidelity`
- `post_build_adherence_v1` (published, 4 dimensions): `data_model_fidelity`,
  `user_story_coverage`, `architecture_conformance`, `persona_surface_coverage`

That's **10**, not 11. This SD ships v1 with exactly these 10 verified dimensions
(tagged `verified_external_proxy`, each carrying a `design_tier_incomplete` waiver)
rather than inventing an eleventh. **Important caveat**: these `adherence_rubrics` rows
are venture-specific scoring *instances* (`design_quality_v1`'s behavioral anchors are
written for one venture, MarketLens — naming its wordmark, palette, and named
competitors), not abstract, venture-agnostic dimension definitions. Only the dimension
**keys** are reused here; the per-venture rubric application is out of this SD's scope.

**Open item, routed non-blocking**: whether the ratified "eleven" is these 10 plus one
more, or a different set entirely, is a narrow question for the chairman via Adam. This
SD does not block on the answer, and does not guess it.

## Dimensions with no producer or reader yet

Several ratified dimensions (`public_route_protection`, `data_protection`,
`billing_correctness`, `onboarding`, `functional_journeys`) have no code today that
produces or reads evidence for them. Per this SD's own excluded scope ("building missing
producers/readers"), these are registered as **stub rows** — the same convention
`lib/governance/gauge-registry.js` uses for a not-yet-built invariant: `producer: null,
reader_or_gate: null`, reserving the registry slot without depending on a future SD
shipping first, each carrying a dated waiver.

## The CI predicate (FR-4)

[`lib/eva/quality-model/predicate.js`](../../lib/eva/quality-model/predicate.js) is a
two-limb check:

1. **Blocking**: every category emitted by the generated arrays maps to a registry
   dimension. Trivially true today (the arrays *are* generated from the registry) — this
   guards future drift if either generator is hand-edited to emit something the registry
   doesn't know about.
2. **Advisory**: every dimension has both a producer and a reader/gate, or a dated,
   unexpired waiver. Starts advisory because most dimensions don't have both yet (the
   programme's own root cause B); an **expired or undated** waiver does not suppress a
   finding — "dated" is enforced, not decorative.

## What this SD deliberately did NOT do

- **No DB constraint migration.** `feedback_widget_present` and `error_capture_wired`
  are still rejected by the live `venture_quality_findings_finding_category_check`
  constraint (verified via live probe). Both carry a dated waiver recording the gap; the
  migration to close it is a follow-up ticket, not this SD.
- **No gate-threshold change.** `LEO_S21_GROWTH_PLAYBOOK_REQUIRED` and
  `LEO_S24_CAPABILITY_CHECKLIST_REQUIRED` keep their current (OFF) defaults. The
  generated arrays are byte-identical, in order, to the prior hand-authored literals.
- **No resolution of the `accessibility` producer-overlap.** Two independent producers
  (design-agent review and the CAPA-001-A axe-core baseline) write the same category
  with no discriminator field. Flagged in code, not resolved unilaterally — needs
  PLAN/chairman-level ratification.

## Where the model is enforced

- `lib/eva/quality-findings/finding-shape.js` — `FINDING_CATEGORIES`,
  `WARN_CAPPED_CATEGORIES`
- `lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js` —
  `REQUIRED_CATEGORIES`, `ADVISORY_CATEGORIES`, `GROWTH_CATEGORIES`
- `.github/workflows/quality-model-predicate.yml` — the CI predicate

## Update procedure

Bump `QUALITY_MODEL_VERSION` in `lib/eva/quality-model/registry.js` and file an SD with
LEAD approval — this registry is itself the source other code derives from; changing it
changes what downstream gates require.
