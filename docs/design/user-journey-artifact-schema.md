# blueprint_user_journey — artifact schema + synthesis design

**Status:** implemented 2026-07-10 — `lib/eva/stage-templates/analysis-steps/stage-15-user-journey.js` (SD-LEO-INFRA-FIRST-CLASS-USER-001, PR #5786). The §2 step-ID durability rules and the DAG (`requires`) model both shipped as designed; DAG branch-detection is currently a simplified linear-chain-plus-auth-precedence MVP rather than the full IA/wireframe-flow-arrow branch detection this doc anticipates (documented follow-up in the SD's retrospective). `blueprint_user_journey` requires a chairman-gated migration apply (`database/migrations/20260710_add_blueprint_user_journey_artifact_type.sql`) before it is writable in production. Originally: design proposal (propose-only, CONST-002) — Solomon, Fable window 2026-07-07, for `SD-LEO-INFRA-FIRST-CLASS-USER-001` (Adam-sourced, chairman-approved to author). Adam co-reviewed.
**Purpose:** ventures have first-class personas, stories, IA, and wireframes — but the **ordered end-to-end journey** exists only by inference. This artifact makes it first-class, with **durable stable step IDs** that downstream systems (APA persona-walk §11, telemetry incident capture §11.3, builder, UAT) can reference for years.

---

## 1. Schema

```jsonc
{
  "artifact_class": "blueprint_user_journey",       // registered in the unified registry
  "venture_id": "<uuid>",
  "journey_id": "jny-<persona-slug>-<goal-slug>",   // stable slug, one journey per (persona, primary goal)
  "version": 3,                                      // bumps on regeneration; step IDs SURVIVE versions
  "persona_ref": "<identity_persona_* artifact id>", // provenance: personas come FROM the corpus, never invented
  "generated_from": {                                // full input provenance (auditable synthesis)
    "stories": ["<user-story ids>"],
    "wireframes": ["<wireframe artifact ids>"],
    "ia": "<ia artifact id>"
  },
  "entry_conditions": ["unauthenticated visitor on landing"],
  "exit_success": "persona goal met: <observable, assertable statement>",
  "steps": [
    {
      "step_id": "stp-a7f3-signup-submit",   // DURABLE — see §2
      "seq": 40,                              // presentation order; GAPPED (10,20,30…) so insertions don't renumber
      "goal": "create an account",            // user intent, one line
      "screen_ref": "<wireframe id / IA node>",
      "route": "/signup",
      "action": "fill form, submit",
      "expected_outcome": "account persisted; confirmation state shown",  // OBSERVABLE — this is what APA asserts
      "side_effects_claimed": ["email:confirmation"],                     // feeds APA side-effect-honesty directly
      "requires": ["stp-a7f3-landing-cta"],   // DAG dependencies (journeys are DAGs, not strict lines)
      "story_refs": ["<story ids this step realizes>"]
    }
  ],
  "coverage_selfcheck": { /* §4 — written by the generator, verified by the gate */ }
}
```

## 2. Durable stable step IDs (the load-bearing part)

Telemetry incident capture (APA §11.3) stamps `step_id` on every captured production error; error-replay resolves it *months later*. The rules:

1. **Content-slugged + entropy, never positional**: `stp-<4-hex>-<action-slug>`. Never `step-3` — insertion must not renumber, and renumbering must never be possible.
2. **Immutable once issued.** Regeneration (version bump) preserves the `step_id` of every step whose *intent* survives — the synthesizer matches steps across versions by (goal, screen_ref, action) similarity and carries IDs forward. A genuinely new step mints a new ID.
3. **Never reused.** A deleted step's ID is retired to a `tombstones` list inside the artifact — an old incident referencing a tombstoned step still resolves to "this step existed in v2, removed in v3" instead of dangling or (worse) pointing at a different step.
4. **Ordering lives in `seq` (gapped), never in the ID.** Reordering is a `seq` edit; IDs untouched.
5. **Cross-references are by `journey_id` + `step_id`** — globally unique within a venture, stable across versions.

## 3. Synthesis logic (Sonnet-tier + deterministic core — NOT Fable)

Stage-15 sub-step `stage-15-user-journey`, running after user-story-pack + IA + wireframes exist:

1. **Cluster** (LLM, cheap): group the persona's stories by primary goal → one journey per (persona, goal); most ventures have 1–3 journeys per persona.
2. **Map** (mostly deterministic): each story → the wireframe screen(s)/IA node(s) that realize it (wireframes + IA already carry story references where the generators emit them; LLM fills gaps and flags unmappable stories rather than inventing screens).
3. **Order** (deterministic): build the `requires` DAG from hard precedence rules (auth before authenticated screens; entity-create before entity-view; IA hierarchy; wireframe flow arrows) → topological sort → gapped `seq`. LLM only breaks ties by narrative sense.
4. **Phrase** (LLM, cheap): `goal` / `expected_outcome` per step — with the constraint that `expected_outcome` must be *observable* (a renderable state or persisted effect), because APA asserts it verbatim. `side_effects_claimed` is extracted from story/wireframe copy, not free-invented.
5. **Version-match** (deterministic + LLM assist): on regeneration, match steps to the prior version, carry IDs, tombstone removals.

## 4. Completeness self-check (deterministic, written into the artifact)

```jsonc
"coverage_selfcheck": {
  "stories_total": 14, "stories_covered": 13,
  "orphan_stories": ["<story id>"],            // P0/P1 orphan ⇒ generation FAILS; P2+ orphan ⇒ warning
  "screens_total": 9, "screens_reached": 8,
  "unreachable_screens": ["<wireframe id>"],   // a screen no journey reaches = dead UI = a finding
  "journeys_reaching_exit_success": "3/3",     // every journey must terminate at its exit_success
  "dag_valid": true                            // no cycles, no dangling requires
}
```

Absence-of-coverage is itself a finding (APA §0.5.1 rule): the self-check is written by the generator and **re-verified independently by the consuming gate** — generator-writes + gate-reads, the unified-registry primitive.

## 5. Registry + consumers

Registered in the unified registry as `blueprint_user_journey`; declared consumers (the availability-then-adoption list from the SD): **APA persona-walk** (S3 walks `steps` in `requires` order, asserting each `expected_outcome` + `side_effects_claimed`), **telemetry** (`step_id` on incident capture), **builder** (build TOWARD the journey), **design generation** (page-flow narrative), **verdict engines** (journey completeness), **S18 build-readiness**, **UAT** (canonical path).

---

*Solomon design proposal — propose-only. The step-ID durability rules (§2) are the part to hold firm in co-review; everything else can flex.*
