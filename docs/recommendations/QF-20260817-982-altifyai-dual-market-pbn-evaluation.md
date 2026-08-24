# AltifyAI Dual-Market PBN Re-Evaluation — Recommendation

**QF-20260817-982** | Chairman-commissioned 2026-08-17 | Evaluated 2026-08-24 | venture `50763b6a-1fad-4e1e-b2fc-296a1d66ebf9`

## Bottom line

Neither market is a clean pass. **M1 (human self-serve upload)** has the richer evidence base
but its go-to-market currently conflates two distinct wedges into one bet (PBN hard gate: TRIM).
**M2 (AI-agent/API consumption)** clears the hard gate on a single, clean wedge — and reuses the
same already-proven core mechanic, so it is cheap to build — but its actual value proposition
("a purpose-built API beats an agent just calling a vision-LLM directly") is not yet evidenced at
all. **Recommendation: keep running the chairman-ratified M1 demand test as the primary,
resourced push — trimmed to one wedge — while treating M2 as a cheap, parallel technical
validation, not a market pivot, until its Better bucket has real evidence.** The site itself needs
a small, unrelated fix regardless of which market wins: it currently displays no brand identity at
all.

## Market 1: human self-serve upload — verdict TRIM

- **Proven** (coverage: yes): "AI-assisted image metadata generation" is a real, established
  mechanic — auto-alt/auto-tagging features exist in WordPress SEO plugins (Yoast, WP Smush,
  Imagify), Cloudinary AI tagging, AWS Rekognition, and Adobe Firefly workflows.
- **Better** (coverage: yes): hypothesis is that a zero-config, single-image, no-login web tool
  will out-convert existing plugin/DAM auto-alt features, whose friction (admin login, plugin
  install, context-switching) causes documented non-adoption (cited: WordPress.org plugin review
  patterns; WebAIM's alt-text prevalence survey).
- **New** — **this is where it fails clean**: the scorer found **two** novel wedges bundled
  together — (a) a zero-config, no-plugin, single-image tool, and (b) a distribution strategy of
  selling direct-to-consumer via organic/social rather than through an existing platform (WordPress
  marketplace, Cloudinary, AWS) or as an enterprise compliance sale. PBN's hard rule: >1 wedge on
  an otherwise-viable foundation is TRIM, not REJECT — pick one bet.
  - **Actionable**: the currently-running demand-test messaging should commit to the
    zero-config/no-plugin-install angle as the single tested wedge; the "which channel do we sell
    through" question is a go-to-market channel decision, not a second product bet, and should be
    decided separately rather than tested as if it were part of the same hypothesis.

## Market 2: AI-agent/API consumption — verdict PASS (but thin)

- **Proven** (coverage: yes): the underlying vision+LLM alt-text mechanic is the SAME one already
  built and running the human upload flow — M2 is not proposing a new mechanic, only a new
  interface to a proven one. **Firsthand fact, not assumed**: no API endpoint exists today — the
  deployed worker's only routes are `/api/register`, `/api/events`, `/api/feedback` — so this would
  be real, if modest, new backend work.
- **New**: single, clean wedge — "a REST endpoint agents/pipelines call directly instead of the
  human upload UI." No multi-wedge problem here.
- **Better** (coverage: **no** — this is the real gap): no citation was found for *why* a
  purpose-built alt-text API would out-perform an agent simply calling a general-purpose
  vision-LLM (GPT-4o/Gemini-vision/Claude-vision) directly with a good prompt. This is answerable
  — plausible angles are response-schema guarantees, consistency/quality tuning specific to
  SEO/accessibility, or per-call cost — but it was not evidenced in this pass and should not be
  assumed true.
- **Agent-readiness audit** (AC-ADD-2, mandatory instrument, real run — `agent_readiness_audit_run`
  `d6a579f5-e589-44fe-98e7-155364cff102`, 3 models × 5 buyer-intent prompts × 5 samples = 75 real
  LLM calls): **found_rate 96%, recommended_rate 69.3%** — AI assistants asked about "a company
  like AltifyAI" mostly recognize the category and often speak favorably of it, *without any
  agent-specific marketing ever having been done*. This is a mildly encouraging ambient signal for
  M2, but scope-note: this instrument measures AI-answer-engine brand discoverability/
  recommendation, **not** literal agent-to-API programmatic consumption readiness — no such API
  exists yet to test that directly.

## Site / offering design (AC-ADD-1 — Stage-17 UI/UX judgment)

No automated instrument exists that can screenshot or critique an already-deployed live site
(`lib/eva/stage-17/*` only generates and grades pre-build mockups from `venture_artifacts`, never
touches a live URL; `lib/apa/*` is an unrelated stub-detection system). This axis is therefore an
honest manual rubric from a firsthand source read (`src/ui/LandingPage.jsx`, `src/ui/App.jsx`,
`index.html`) — **could-not-measure flag: no live-rendered screenshot was available this session**,
so purely visual/CSS-rendering issues are unassessed; the DOM/copy content itself is fully known.

| Criterion | Score | Finding |
|---|---|---|
| Brand identity visible on page | 0 / 10 | "AltifyAI" appears **only** in the HTML `<title>` tag. `LandingPage.jsx` has no header, nav, or logo at all — the page goes straight into the hero. A visitor has no on-page way to learn the product's name. This is worse than "plain" (the chairman's word) — brand identity is **entirely absent** from the rendered page, not just understated. |
| CTA functions | 10 / 10 | The "Start free" → `/register` path is wired to Clerk sign-up (`App.jsx`). A stale docblock comment claims this "404s until D3 ships" — verified against current code: D3 has shipped, the route works. The demand-test's core conversion path is not broken. |
| Copy honesty & clarity | 9 / 10 | Copy is grounded only in the real, confirmed feature set, no fabricated metrics or testimonials. Clear and honest. Docked one point: the copy is 100% M1-framed — an agent or M2-curious visitor landing on this same URL gets zero signal that machine consumption is possible. |

**Total: 19/30.** Recommend adding an actual masthead (logo + product name, minimally) — a small,
cheap fix, independent of the M1-vs-M2 decision, since credibility matters to both.

## Feedback capture model (chairman's security question, folded into scope)

Confirmed firsthand: the current anonymous path (`POST /api/feedback` → `fn_submit_venture_user_feedback`
via `lib/feedback/submit.js`) fails closed today because `EHG_ENGINEER_INGEST_SECRET` is not
provisioned for this venture — exactly as the QF described. When provisioned, its residual risk is
a client-held secret enabling per-venture forgery and guessable `venture_id` attribution.
`fn_submit_internal_feedback` (identity-bound, Clerk-backed) shipped 2026-08-17 and is a real,
usable alternative now that Clerk has landed.

**Recommendation (matches the chairman's own stated default): sign-in-required feedback on the
authenticated product surface (dashboard); anonymous feedback stays on the landing page**, where
during the demand-test phase the feedback itself IS the signal and adding friction there would
suppress it. The agent-first framing also gives agents an authenticated API path regardless.

## An orthogonal finding, not asked for but observed directly

`ventures.problem_statement` frames AltifyAI as solving an **enterprise** image-metadata-compliance
problem ("Enterprises with large, dynamic image libraries..."), while the actual GTM artifact
(stage 12), `target_market` field, and the chairman-ratified demand-test plan all target
**bloggers/small e-commerce/agencies** — a real internal inconsistency in how this venture defines
its own market, independent of the M1-vs-M2 question this QF was commissioned to answer. Not
resolved here; flagged for whoever next touches this venture's positioning.

## Methodology notes and honest limitations

- PBN buckets were generated by the shipped `pbn-scoring.js` LLM call (temperature 0.1, not 0),
  then evaluated by the shipped, pure `pbn-gate.js` rules — the deterministic evaluation half is
  fully reproducible; the LLM-generated bucket content is not perfectly so. A live retry during
  this evaluation (working around a reproducible JSON-malformation issue in the classification
  tier's Haiku fallback, logged separately as a harness bug, not fixed here) produced a
  meaningfully different M2 "better" coverage result (true, then false) across two consecutive
  live calls on the same brief. The verdicts reported above are from the final, clean
  (`scoring_error: null`) run for each market; treat single-run PBN verdicts as informative, not
  statistically certain.
- `ventures.validation_score` is composed here as: per-market PBN sub-score (proven +30, better
  +20, verdict PASS +20/TRIM +10/REJECT +0, max 70) + a per-market modifier (M1: the manual UX
  rubric above, out of 30; M2: agent-readiness found/recommended rates, out of 30), scaled to the
  column's `DECIMAL(3,2)` (0-10) range. This column had **zero known prior writers** anywhere in
  the codebase — there is no pre-existing numeric convention this had to match, so the formula is
  authored and documented here for auditability, not inherited from elsewhere. Full 0-100
  per-market breakdown is preserved in `ventures.metadata.stage_zero.retroactive_pbn_evaluation`.
- No inputs were fabricated. Where evidence could not be gathered (live screenshot; literal
  agent-API-consumption readiness, since no such API exists to test), that is flagged above rather
  than hand-waved into a score.
