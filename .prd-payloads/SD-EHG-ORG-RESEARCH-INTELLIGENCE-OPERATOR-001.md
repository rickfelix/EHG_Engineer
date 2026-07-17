# RESEARCH_INTELLIGENCE_OPERATOR — 5th EHG-shared operator: standing R&D / tech-landscape function

## Type
feature

## Target Repos
EHG_Engineer

## Summary
Chairman-directed 2026-07-17 (evening thread; Solomon framing 7f6cdda5, all pointers Fable-code/DB-verified). Mission principle 6 ("stay ahead of the field / competitively vigilant") has NO organizational owner — proven stale: the only shipped tech forecaster (`lib/eva/stage-zero/synthesis/tech-trajectory.js`) runs per-venture at Stage-0 only, off TRAINING DATA (no tools/browse, self-caveats "not real-time"), and its external hook `dataFeed.getTechSignals()` (L38/42/47) has never been fed. No EHG-level model/tech-landscape research exists at all. Chairman direction: (a) the forecaster should RESEARCH LIVE, not be hand-fed videos; (b) the landscape reference should be STANDING + periodically maintained (compute-continuously, read-many); (c) an R&D function should OWN it, with curated signal streams (his YouTube intake) as HINTS it triages — including which videos merit Gemini analysis; (d) design delegated. Attachment point VERIFIED BUILT: the EHG_SHARED_OPERATORS rail (venture-ceo-factory.js, SD-FDBK-ENH-ORG-TEMPLATE-DELTA-001 @ a8e777c) — holdco operators instantiated once serving N ventures; 4 live (FINANCE_BILLING, LEGAL_COMPLIANCE, SECURITY_POSTURE, DATA_PLATFORM). This adds the 5th rail entry — pattern-conformant template-delta, NOT a new org.

## Functional Requirements
### FR-1: 5th shared-operator template-delta
Add RESEARCH_INTELLIGENCE_OPERATOR to EHG_SHARED_OPERATORS (same template-delta pattern as ORG-TEMPLATE-DELTA-001): shared placement; duty_cycle = periodic live-research refresh of a STANDING model/tech-landscape reference (a table/doc every consumer reads) + triage of intake signal streams; honest_idle = "no fresh landscape events → reference stands, no fabricated updates"; arming stays a separate named action per the rail's design.
### FR-2: Standing landscape reference (compute-continuously, read-many)
Create the standing reference surface (DB table or governed doc) the operator maintains: model landscape, tech-trajectory signals, adoption-relevant events. Consumers read it; nothing recomputes per-venture from stale knowledge.
### FR-3: Wire tech-trajectory's dataFeed AT THE LIVE CALL SITE (chairman-directed: producer + consumer in the SAME SD)
Feed `dataFeed.getTechSignals()` from the standing reference so Stage-0 tech-trajectory reads live signals instead of training data. CHAIRMAN ADDITION (Mode-C bundle bfea7e74): the consumer modification is IN-SCOPE — wire `deps.dataFeed` at the live synthesis call site (`lib/eva/stage-zero/synthesis/index.js`, which currently passes NO dataFeed, starving the hook), and audit the other synthesis components for the same read where relevant. No generator-without-consumer.
### FR-4: Intake-stream triage lane
Route the eva_youtube_intake AI-news lane to this operator as HINTS it triages (ending the reference-graveyard), including deciding which videos merit deep (Gemini) analysis.
### FR-5a: Modeling-information CUSTODY (chairman-CORRECTED e2a1f9fe: primary = STAGE-0 ECONOMIC MODELS, not the LLM registry)
PRIMARY custody object: the Stage-0 economic/forecasting models' grounding data. Today `lib/eva/stage-zero/modeling.js` (revenue projections, TAM/SAM/SOM, unit economics, growth curves) and the 15 synthesis components are plain LLM prompts over the venture brief — market sizes are training-data guesses ("proxies are inferred, not measured" per their own comments); the one real external feed (data-pollers → app_rankings) is consumed by none of them. The operator: **(a)** maintains the REFERENCE DATA that grounds these models — market-size baselines, benchmark unit economics by archetype, adoption-curve priors, comparables — as a **versioned data product** the Stage-0 prompts inject (same producer→consumer wiring as FR-3, applied to modeling.js + relevant synthesis components); **(b) CALIBRATION LOOP** — grades past Stage-0 forecasts against actual venture outcomes (forecast-vs-actual) so the models sharpen with every venture — this is also the concrete P7 (compounding) fix; **(c) VESSEL RIDER (chairman ruling 287ed704, do NOT double-source):** the calibration duty extends one notch to a per-venture "what did this venture teach the system" check at kill/complete, feeding the reference data + the selection-method recalibration (capability-lattice/B10; gate pack binds at >=3-run cohort) — the MEASUREMENT half of compounding (hand-off #6 remains the machinery track). SECONDARY: `llm_models` registry + landscape reference + eval-harness data pipeline custody. BOUNDARY (custodian ≠ doctrine-setter): the operator curates DATA; routing DOCTRINE stays with the eval harness + coordinator; eval design/grading stays Solomon (Cluster-5).
### FR-5: EHG model-adoption input
The operator's reference informs EHG's OWN model-adoption/re-tiering decisions (live use case: today's Fable lockout). Foresight-Board linkage: when the Frontier Capability council builds, this operator is its research arm (no collision — council Phase-1 defers ingestion).

## Success Metrics
- metric: mission principle 6 organizational owner; target: RESEARCH_INTELLIGENCE_OPERATOR (named)
- metric: tech-trajectory dataFeed fed by live standing reference; target: yes (no training-data-only runs)
- metric: YouTube AI-news intake triaged by an owner; target: yes (reference-graveyard ended)
- metric: fabricated updates on idle; target: 0 (honest_idle)

## Smoke Test Steps
1. instruction: Inspect EHG_SHARED_OPERATORS after the delta; expected_outcome: 5 operators incl RESEARCH_INTELLIGENCE_OPERATOR with duty_cycle + honest_idle defined.
2. instruction: Run a Stage-0 tech-trajectory synthesis; expected_outcome: it reads the standing reference via dataFeed (not training-data-only).
3. instruction: Insert a YouTube AI-news intake row; expected_outcome: routed to the operator's triage lane.

## Sizing / Notes
Tier 3 (feature; org-template + wiring + reference surface; decompose at sourcing if needed). BOUNDARIES (Solomon, deliberate): NOT a Solomon duty (standing-continuous is the opposite of the oracle cost-shape — operator runs breadth, Solomon remains deep-adjudication escalation + reviews the duty cycle); ANTI-OVERLAP: venture-scoped Market_Research/Competitive_Analysis crews research the VENTURE's market, this operator researches THE FIELD for EHG. PLACEMENT RATIFICATION: routed chairman-ward with Adam recommendation = shared placement (matches the ratified build-shared-AI-org-services doctrine); build may proceed on the rail pattern, arming is the separate gated action. ALSO QUEUED (chairman "at some point", Solomon will run as a Mode-C sweep): mission-principle ownership audit — every principle gets a named accountable owner. Relates: SD-FDBK-ENH-ORG-TEMPLATE-DELTA-001 (pattern), SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001 (FYI: 840 of 844 org_agent_identities rows are test fixtures), QF-SYNC-LEG-FAIL-LOUD-DURABLE-SIGNAL-001 (the YouTube leg feeding this).
