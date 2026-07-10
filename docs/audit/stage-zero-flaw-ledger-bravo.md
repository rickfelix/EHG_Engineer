# Stage-0 Flaw Ledger — Bravo (Leg B, chairman commission)

**Auditor:** Bravo (Fable seat, session 23026de5) — 2026-07-10
**Territory:** Solomon's SIX delta-predictions, deep-verified against `lib/eva/stage-zero/*` per `docs/design/stage-zero-greenfield-spec.md` (R1–R10).
**Method:** evidence-first; every finding carries file:line receipts read from live code this session. Refuted/partially-refuted aspects listed separately per adversarial-verify discipline. Severity ranks the *selection-integrity* blast radius.

**Verdict summary: 5 CONFIRMED, 1 PARTIALLY CONFIRMED (R6 — the letter of the prediction is refuted, its substance confirmed). Zero fully refuted.**

---

## 1. CONFIRMED — R8: the selection engine does NOT pass its own authenticity gate — **CRITICAL**

**Prediction:** the 17 synthesis modules are unaudited against R8 (mock-distinguishable scores, provenance reached at runtime, seeded-defect canary).

**Receipts:**
- `lib/eva/stage-zero/synthesis/index.js:91-160` — every one of the 15 components is fail-soft to a **zeroed result object** (`relevance_score: 0`, `composite_score: 0`, `moat_score: 0`, verdict `'review'`, …) with the failure recorded only in a `summary` string. A run in which **all 15 components throw** still returns a well-formed brief.
- `lib/eva/stage-zero/synthesis/index.js:258-259` — `components_run: 15, components_total: 15` are **hardcoded constants**, stamped regardless of how many components actually succeeded. The gauge reads 15/15 on a fully dead engine (gauge-vs-action divergence class).
- `lib/eva/stage-zero/synthesis/index.js:214-216` — maturity derivation: `constraints.verdict === 'fail' ? 'blocked' : timeHorizon.position === 'park_and_build_later' ? 'nursery' : 'ready'`. The chairman-constraints **failure fallback verdict is `'review'`** (line 159), which routes to… `'ready'`. **A total-failure run emits a `maturity: 'ready'` venture brief with all-zero scores.**
- Spec's own acceptance test (R10.2): "a stubbed selection engine … must fail R4 (ungrounded scores) and R8 (provenance-reached) mechanically — if it doesn't, the spec has failed its own bar." The implementation fails this mechanically-must-fail test in the strongest possible way: the stub doesn't merely pass, it is marked `ready` and reported as 15/15 components run.
- No seeded-defect canary exists anywhere under `lib/eva/stage-zero/` (grep `canary|seeded.defect`: zero hits).
- Provenance not reached: see finding 2's attention-capital receipt — declared "signal" dimensions with no data source touched.

**Refuted-candidate aspects:** none. (Note: module count is 15 components / 17 files including `index.js` + `archetype-mapping.js`; the prediction's "17" refers to the file count — immaterial.)

---

## 2. CONFIRMED — R4: ungrounded LLM numbers dominate ranking; no evidence grading exists — **CRITICAL**

**Prediction:** ungrounded LLM scoring (`parseRevenuePotential` / strategic-fit realism) fails R4.

**Receipts:**
- `lib/eva/stage-zero/utils/parse-revenue.js:1-9,25` — parses **freeform LLM-emitted** `monthly_revenue_potential` strings ("$5K/month", "~$10K MRR"). The number's only source is the generation prompt itself.
- `lib/eva/stage-zero/paths/discovery-mode.js:689-698` — that parsed LLM number becomes `revenue01` (log-scaled to $1M) and receives **weight 0.25 — the second-largest factor** in the composite. An E0-by-definition claim (spec R4) not only participates, it can dominate.
- `lib/eva/stage-zero/paths/discovery-mode.js:723` — `parsed_revenue_high` is also the **first tiebreaker** after composite score.
- `lib/eva/stage-zero/utils/strategic-fit.js:17-53` — "strategic fit" is stopworded **keyword overlap** between candidate text and theme strings; no triangulation, silently neutral-50 on missing context.
- `lib/eva/stage-zero/synthesis/attention-capital.js:55-90` — the LLM is asked to score "Organic Search Momentum" ("is there unpaid search interest **growing**…"), "Earned Media Ratio", "Return Engagement" **with no search, media, or retention data provided** — the model invents measurements, which are then banded (AC-Low…AC-Strong) as if observed. This is the provenance-not-reached pattern in its purest form.
- Evidence grading is absent repo-wide in the module: grep `evidence_grade|E0|weakest.link|evidenceGrade` across `lib/eva/stage-zero/`: **zero hits**. No source declaration, no weakest-link inheritance, no chairman-waiver path.

**Refuted-candidate aspects:** `score_attribution` (discovery-mode.js:705-717) does record *which fields* contributed — a provenance seed worth keeping — but it lists field presence, not evidence sources or grades.

---

## 3. CONFIRMED — R2: no posture concept; fixed weights; silent legacy fallback; active-phase contradiction — **CRITICAL**

**Prediction:** no posture concept — hard-coded revenue-ish weights.

**Receipts:**
- `lib/eva/stage-zero/paths/discovery-mode.js:637-643` — `DEFAULT_RANK_WEIGHTS` is a **frozen module constant** (automation 0.30, **revenue 0.25**, market-specificity 0.20, strategic-fit 0.15, competition 0.10). No phases, no transition conditions, no expiry.
- `lib/eva/stage-zero/paths/discovery-mode.js:112` — the only production caller invokes `rankCandidates(candidates)` **with no opts**: the override parameter is dead in practice; the frozen defaults always apply.
- Phase-1 contradiction (spec R2: "SIMPLICITY dominates… revenue potential = tiebreaker only"): revenue is the second-heaviest weight AND the first tiebreaker (line 723). **No anti-goal disqualifiers exist** (grep `anti.goal|app.store|sales.cycle|regulatory` in stage-zero: no disqualification logic) and no full-traversability hard criterion (grep `traversab`: zero hits in stage-zero).
- Silent-fallback (the exact divergence R2 says must be structurally impossible): `lib/eva/stage-zero/profile-service.js:45,57,73,87` — no client / profile-not-found / no-active-profile all **fall back to legacy defaults with a warn**, and `lib/eva/stage-zero/synthesis/index.js:82-85,186` — profile resolution failure → `null` → the weighted score is **skipped entirely** and the run proceeds. Nothing fails closed.

**Refuted-candidate aspects (partial mitigations, honestly noted):** an evaluation-profile system DOES exist (`profile-service.js` — chairman-configurable weights with name/version/source), and when a profile resolves, its identity IS stamped into synthesis output (`synthesis/index.js:189-194`). That is a posture *seed*: versioned, queryable, stamped. But it has no phases/transition conditions, does not govern `rankCandidates` at all (the discovery leg never receives it), and fails open. The prediction stands for the ranking path; the profile system is the natural place to build R2 rather than greenfield.

---

## 4. CONFIRMED — R3: output is scores + strings, not a falsifiable thesis; no pre-registered kills; no demand-test plan — **HIGH**

**Prediction:** scores, not theses — no pre-registered kill criteria, no pre-build demand-test plan.

**Receipts:**
- `lib/eva/stage-zero/interfaces.js:90-115` — `validateVentureBrief` enumerates the **complete** Stage-0 → Stage-1 contract: `name, problem_statement, solution, target_market, origin_type, raw_chairman_intent, maturity`. **No who-pays/price field, no demand-test plan, no kill criteria, no falsifiers.**
- `lib/eva/stage-zero/synthesis/index.js:218-264` — the enriched brief adds archetype/moat/scores/metadata, still nothing thesis-shaped.
- Grep `kill.criteri|kill_criteri|demand.test|who.pays|falsif` across `lib/eva/stage-zero/`: **zero genuine hits** (every "thesis" match is the substring of "synthesis").
- Consequence receipt for the spec's gate-realism claim: downstream gates cannot consume pre-registered falsifiers that were never created — generic thresholds are the only option (exactly the class R3 calls out).

**Refuted-candidate aspects:** none found.

---

## 5. PARTIALLY CONFIRMED — R6: capability input exists but is advisory prompt seasoning, not a traversability gate — **HIGH**

**Prediction:** no capability-envelope input.

**The letter of the prediction is REFUTED; its substance is CONFIRMED:**
- Refuting receipt: a capability context feed EXISTS — `lib/capabilities/scanner-context.js:125-179` (`getCapabilityContextBlock`, portfolio-wide `v_unified_capabilities`, maturity-weighted), injected into discovery prompts at `lib/eva/stage-zero/paths/discovery-mode.js:216,226` (SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-B).
- Confirming receipts (what R6 actually requires is absent): the block is a **markdown prompt string** for the generating LLM — advisory shaping, opt-in per scanner type (`scanner-context.js:132-139`, unmapped types get `''`), and **fail-soft to empty string on any error** (`:126,153-158,177-179`) — capability-data absence is silent. There is **no post-generation check anywhere** that a candidate's requirements fit delivered capability, and no "fails traversability regardless of score" gate (grep `traversab` in stage-zero: zero hits). A candidate needing undelivered capability sails through ranking and synthesis untouched.

---

## 6. CONFIRMED — R5: web/hosted-SaaS form factor is a silent build-time assumption, never a selection-time decision — **MEDIUM**

**Prediction:** assumes web silently (`venture-stack-policy.js:57`).

**Receipts:**
- `lib/eva/standards/venture-stack-policy.js:52-58` — the `cli_as_product` FORBIDDEN entry, line 57 verbatim: `why: 'Ventures are hosted SaaS web apps, not CLI products.'` — the form-factor commitment lives as a **scanner-rule rationale** in build-time standards, exactly the predicted line. (Path note for Solomon: the spec cites `venture-stack-policy.js:57`; the file resolves to `lib/eva/standards/venture-stack-policy.js` — same finding, one directory deeper.)
- Stage-0 surface check: grep `form.factor|form_factor|PWA|native|mobile` across `lib/eva/stage-zero/`: only two cosmetic hits (`modeling.js:86` prompt text "standard web/mobile products"; an agentic-fit band string). **No form-factor field on PathOutput or VentureBrief** (`interfaces.js:123-137, 90-115`), no ratifiable decision with declared default, no pricing-model or hosting decision surface either (the R5 general rule).
- Severity rationale: MEDIUM not HIGH only because the current Phase-1 posture (web-first, native = anti-goal) happens to coincide with the baked assumption — the flaw is latent until the posture changes, which is precisely how Stage-14 surprises are made.

**Refuted-candidate aspects:** the policy itself is a *good* factory-constraint artifact (declared, tested, negation-aware); the flaw is its **location in the pipeline** (build scan) with no selection-time counterpart.

---

## Cross-cutting note for adjudication

Findings 1–3 compound: ungrounded numbers (R4) flow through fixed weights (R2) into an engine that cannot mechanically distinguish itself from a stub (R8), and the output contract (R3) discards even the attribution trail before Stage 1. The cheapest structural lever appears to be the existing profile-service (versioned, stamped, chairman-owned) — extend it to a governed posture with phases + fail-closed resolution, make `rankCandidates` consume it, and attach evidence grades at the same seam.

*Propose-only; no code changed. Routed to coordinator → Solomon for adjudication.*
