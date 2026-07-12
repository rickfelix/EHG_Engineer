# Venture Stage → Marketing Ownership Map

**Purpose**: A durable reference mapping the 26-stage venture workflow to the marketing pieces each stage owns — so the Chairman (and any operator) can see where marketing decisions live, which stages need Chairman sign-off, and where the pre-build demand test is enforced.

**Source of truth**: The stage definitions are generated from the `venture_stages` table (columns: stage_number, stage_name, phase_number, phase_name, gate_type, work_type, description). This document is an **annotated overlay** — it does not redefine stages; it marks the marketing pieces. If `venture_stages` changes, re-derive this map against it rather than letting it drift.

**Authored**: 2026-07-12 by Adam (Chairman-directed), from a live `venture_stages` read.

**Legend**: 📣 = owns a marketing piece · 🔴 KILL gate · ⬆️ promotion gate · 👤 = Chairman sign-off required

---

## The 6 phases, 26 stages

### Phase 1 — "The Truth" (stages 1–5): is this real?
| # | Stage | Gate | Marketing piece |
|---|-------|------|-----------------|
| 1 | Draft Idea | — | — (structures the raw seed) |
| 2 | AI Review | — | — (seven-analyst critique) |
| 3 | Comprehensive Validation | 🔴 KILL | — |
| 4 | Competitive Intelligence | — | 📣 competitor positioning, SWOT, market pricing (feeds positioning) |
| 5 | Profitability Forecasting | 🔴 KILL | — |

### Phase 2 — "The Engine" (stages 6–9): the business model
| # | Stage | Gate | Marketing piece |
|---|-------|------|-----------------|
| 6 | Risk Evaluation | — | — |
| 7 | Revenue Architecture | — | 📣 pricing model, tiers, competitive anchoring, positioning |
| 8 | Business Model Canvas | — | — (9-block model) |
| 9 | Exit Strategy | — | — |

### Phase 3 — "The Identity" (stages 10–12): who it's for and how you reach them
| # | Stage | Gate | Marketing piece |
|---|-------|------|-----------------|
| 10 | Customer & Brand Foundation | ⬆️ promotion 👤 | 📣 customer personas + brand foundation (naming candidates Chairman-gated) |
| 11 | Naming & Visual Identity | — | 📣 final name, visual identity system, brand expression, logo |
| 12 | GTM & Sales Strategy | — | 📣 **the core: go-to-market — acquisition channels, sales model, conversion funnel, customer journey** |

### Phase 4 — "The Blueprint" (stages 13–17): design before you build
| # | Stage | Gate | Marketing piece |
|---|-------|------|-----------------|
| 13 | Product Roadmap | 🔴 KILL | — |
| 14 | Technical Architecture | — | — |
| 15 | Design Studio | — | 📣 wireframes/UX (marketing-adjacent — the site/landing look) |
| 16 | Financial Projections | ⬆️ promotion | — |
| 17 | Blueprint Review | ⬆️ promotion | — (readiness aggregate before build) |

### Phase 5 — "The Build" (stages 18–23): make it, prep the launch
| # | Stage | Gate | Marketing piece |
|---|-------|------|-----------------|
| 18 | Marketing Copy Studio | ⬆️ promotion 👤 | 📣 **all persona-targeted marketing copy — Chairman sign-off required** |
| 19 | Sprint Planning | — | — (build backlog; where an SD is created) |
| 20 | Code Quality Gate | — | — (automated security/lint/test) |
| 21 | Distribution Setup | — | 📣 **marketing distribution channels + per-channel ad copy + targeting** |
| 22 | Visual Assets | — | 📣 device screenshots + per-platform social graphics |
| 23 | Launch Readiness | 🔴 KILL | — |

### Phase 6 — "The Launch" (stages 24–26): go live and grow
| # | Stage | Gate | Marketing piece |
|---|-------|------|-----------------|
| 24 | Go Live & Announce | ⬆️ promotion | 📣 **launch execution — activates distribution channels, announces** |
| 25 | Post-Launch Review | ⬆️ promotion | 📣 actual performance vs projections, user feedback, learnings |
| 26 | Growth Playbook | — | 📣 growth experiments, scaling priorities, 90-day plan |

---

## The marketing arc (reading only the 📣 stages)

1. **Understand the market** — stage 4 (competitive intel) → stage 7 (pricing/positioning)
2. **Define who + what it's called** — stage 10 (personas + brand) → stage 11 (name, logo, identity)
3. **Decide how to reach + convert** — stage 12 (GTM: channels, funnel, customer journey) — the strategic core
4. **Create the materials** — stage 18 (copy, Chairman-gated) → stage 22 (visual/social assets)
5. **Wire up the channels** — stage 21 (distribution setup + ad copy + targeting)
6. **Launch** — stage 24 (go-live, activate channels, announce)
7. **Measure + scale** — stage 25 (performance review) → stage 26 (growth playbook)

## Two things to know

### Where the pre-build demand test lives
The demand test is **not a separate stage** — its kill-checks are wired into the flow **before build** (build starts at stage 19):
- **~Stage 12** — signup threshold (venture dies if fewer than the qualified-signup floor).
- **~Stage 16** — pre-commitment threshold (dies if fewer than the pre-order/LOI floor).

This enforces the factory's core discipline: **prove demand before you build.** It is cheap to learn "nobody wants this" with a landing page and targeted outreach; expensive to learn it after building.

### Chairman touchpoints in marketing
Only two marketing stages hard-gate on the Chairman:
- **Stage 10** — brand/naming governance (approve the brand + naming direction).
- **Stage 18** — marketing copy sign-off (approve the copy before it ships).

Everything else is machine-generated from upstream artifacts. So the Chairman's marketing control points are: **approve the brand/name, and approve the copy.**

## Demand-test channel policy (ratified, 2026-07-12)
The stage-12 / stage-21 outreach and distribution for a demand test must follow the **Chairman-ratified AUP-safe design** (Solomon's, commit `65e8b41e`): **manual 1:1 personalized outreach** for the cold "would a stranger pay?" signal, and the shared email rail (Resend) reserved for **opt-in sequences only** (people who raised their hand). **Cold mass-channel tactics** — forum blasting (e.g. BlackHatWorld/WebmasterWorld), unsolicited subreddit posting, unsolicited bulk email — are **out of policy**: they read as spam, risk the shared email account (which carries every venture's transactional mail), and produce a dirtier demand signal. Genuine long-term community participation is a legitimate *launch/growth* channel (stages 24/26), not a drive-by demand-test tactic. If a Stage-0 synthesis auto-generates a cold-channel demand-test plan, it must be overridden to this ratified design before the venture proceeds.

---

*Reference doc. Re-derive against `venture_stages` if the stage map changes. Marketing annotations + demand-test policy are operator-maintained overlays, not DB-generated.*
