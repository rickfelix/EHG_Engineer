# Triangulation Research: Blind Spots
## OpenAI Research Response

**Date**: 2026-01-01
**Researcher**: OpenAI (GPT-4)
**Method**: Web research + analysis

---

## Section 1: Multi-Venture Portfolio Management

### Q1.1 — What a "Venture Portfolio Operating System" (EVA) looks like (architecture)

**Direct answer**: EVA should be a **portfolio control plane**: one standardized data model + event pipeline + alerting + decision routing, with per-venture "adapters" (Stripe, support inbox, app metrics, uptime, repo, ads) and per-role views (Chairman/Operator/Finance).

**Core components (practical architecture)**:
- **Canonical data model** (single source of truth):
  - `Venture`, `LifecycleState`, `Objectives(OKRs)`, `KPIs`, `Risks`, `Incidents`, `Experiments`, `Backlog`, `Runbooks`, `Vendors`, `Costs`, `Revenue`, `ComplianceProfile`.
- **Ingestion/adapters** (pull + webhooks):
  - Payments (Stripe), support (email/helpdesk), analytics, error tracking, uptime, ads, repo/CI, domain/DNS, cloud bills.
- **Event bus + rules engine**:
  - Turn raw signals into typed events: `REVENUE_DROP`, `CHURN_SPIKE`, `INCIDENT_P1`, `COST_RUNRATE_SPIKE`, `SLA_BREACH_RISK`, `PRICING_TEST_DONE`.
- **Decision router**:
  - Routes events to: **auto-fix**, **auto-draft** (human approve), or **human required**.
- **Portfolio dashboards**:
  - "At a glance" health, plus drill-downs per venture.
- **Automation executor** (guardrails + idempotency):
  - Restart jobs, rollback deploy, send customer comms drafts, open tickets, schedule postmortems, create invoices reminders, pause ads, rotate keys, etc.
- **Audit log**:
  - Every decision + automated action is logged (what, why, who/agent, evidence).

**Dashboard requirements (metrics that matter)**:
- **Per-venture**:
  - **Money**: MRR/ARR, new MRR, churn (logo + revenue), gross margin estimate, refunds/chargebacks, CAC/payback if paid acquisition.
  - **Customer**: ticket volume, first response time, CSAT proxy (sentiment), top issue tags.
  - **Product/Tech**: uptime, error rate, deploy frequency, lead time, incident count, infra cost, latency.
  - **Growth loop**: activation rate, retention cohort, key event completion.
  - **Risk**: single points of failure, compliance flags, "bus factor."
- **Portfolio**:
  - **Focus allocation**: hours/week per venture, WIP, blocked items.
  - **Runway + burn**: total costs, cost per venture, anomalies.
  - **State distribution**: how many in build/maintain/grow/sunset.

**Automation vs human (rule of thumb)**:
- **Automate**: detection, summarization, scheduling, drafting, routine remediations, billing reminders, data pulls, weekly reporting, low-risk reversible actions.
- **Human required**: pricing changes, positioning, big roadmap shifts, legal commitments, enterprise security promises, killing/selling decisions, irreversible customer-impacting actions.

**Alert/escalation (when Chairman gets pulled in)**:
- **Revenue**: >X% weekly drop, or churn event of top-N customers.
- **Reputation**: public outage, security incident, chargeback surge.
- **Time**: operator hours > cap for 2 weeks, WIP > threshold, incident load > threshold.
- **Risk**: compliance breach risk, vendor failure, key person dependency.

**Examples (who does this well, conceptually)**:
- Berkshire-style: decentralized ops, centralized capital allocation.
- Constellation-style: many small vertical SaaS units, playbook-driven, metrics + autonomy.

**Template/framework to implement**:
- **Portfolio Weekly Review (30-45 min)**:
  - 1) Top 3 anomalies across all ventures (money/support/tech)
  - 2) Ventures to **pause**, **push**, **sunset**
  - 3) Next week allocation (hours) + single portfolio "must win"
  - 4) Approvals queue (AI drafted decisions)
- **Decision classes**:
  - **Class A (auto)**: reversible, <$X impact, low legal risk
  - **Class B (approve)**: customer-facing copy, minor pricing tests, vendor changes
  - **Class C (human)**: irreversible, legal/security, strategic

**Confidence**: **High**

**Caveats/uncertainties**:
- Metric choices vary by venture type (B2B vs consumer; ads vs subscription).
- Over-automation can create "silent failure" unless audit + alerting are excellent.

---

### Q1.2 — How successful holding companies manage portfolios (and lessons for solo+AI)

**Direct answer**: They win by combining **decentralized execution** with **centralized capital allocation + reporting standards + governance**.

**Practices to copy**:
- **Standard monthly operating packet** per venture (same fields, always).
- **Autonomy with guardrails**: ventures can move fast inside defined policy.
- **Kill thresholds** are explicit (time, money, traction).
- **Playbooks** for common situations (pricing change, outage, churn spike).

**Solo operator translation**:
- Replace middle management with **EVA + automation**; keep governance minimal but strict.
- Your scarce resource is **attention**; EVA's job is to keep attention pointed at the few ventures/events that change outcomes.

**Confidence**: **Medium-High**

**Caveats**: Public examples aren't perfectly transferable to a solo operator; incentives differ.

---

### Q1.3 — "Management Cliff" definition and warning signs

**Direct answer**: The cliff is when **adding a venture decreases total portfolio value** because context switching + incident load + support debt exceed your capacity and automation maturity.

**Leading indicators**:
- **Support**: backlog grows week-over-week; response time drifts; repeat issues spike.
- **Tech**: increasing P1/P2 incidents; deploy fear; "fragile systems."
- **Money**: revenue concentration worsens; churn surprises you; costs drift.
- **Personal**: >2 consecutive weeks of reactive work; no deep work blocks.

**Quantify it (simple thresholds)**:
- **Reactive hours** > 40% of your weekly time for 2-3 weeks.
- **Unreviewed alerts** > N/day (you start ignoring the system).
- **Unknown status**: you can't state each venture's health in 1 sentence.

**Confidence**: **High**

**Caveats**: Thresholds depend on venture complexity and SLA expectations.

---

### Q1.4 — Venture Lifecycle State Machine (states, triggers, decision maker)

**Direct answer (states)**:
- **Ideation -> Validation -> Active Development -> Launch -> Growth -> Maintenance -> Sunset/Deprecation -> Sold/Acquired**
- **Kill** can occur from any state.

**Triggers**:
- **Validation -> Active Dev**: proven pain + willingness to pay OR strong lead signal.
- **Launch -> Growth**: retention + unit economics hit minimum bar.
- **Growth -> Maintenance**: stable revenue + marginal ROI on new features < threshold.
- **Maintenance -> Sunset**: churn > acquisition for sustained period; tech risk too high; strategic mismatch.
- **Any -> Kill**: time-box expired without traction; legal/compliance blocker; opportunity cost too high.

**Who decides**:
- **EVA recommends** with evidence; **human approves** for state changes that impact customers, pricing, legal, or strategy.

**Confidence**: **High**

**Caveats**: Some "vending machine" ventures skip growth and live in maintenance profitably.

---

### Q1.5 — When to hire humans vs rely on AI (roles)

**Direct answer**: Hire when work is **high-stakes, high-context, high-empathy, or high-liability**, or when a role is a consistent bottleneck.

**AI-compatible (often)**:
- Reporting, triage, drafting comms, QA checklists, basic bookkeeping categorization, runbook execution, documentation, support tagging/summarization.

**Human-required (often)**:
- Enterprise sales, negotiations, legal sign-off, deep customer discovery, high-touch support for strategic accounts, brand/community, complex incident command.

**Confidence**: **Medium-High**

**Caveats**: AI can assist in all areas, but "final authority" often needs a human for liability.

---

## Section 2: Pattern Deprecation

### Q2.1 — Detecting outdated patterns (signals)

**Direct answer**: Track **usage**, **maintenance cost**, **compatibility**, and **outcome quality**.

**Signals**:
- New ventures stop adopting it.
- Bug/incident rate increases relative to alternatives.
- Vendor/framework versions break it frequently.
- Better pattern exists with measurable benefits (time-to-ship, performance, cost).

**Confidence**: **High**

**Caveats**: Low usage isn't always bad (might be niche but valuable).

---

### Q2.2 — Pattern Lifecycle: Draft -> Active -> Deprecated -> Archived

**Direct answer**:
- **Draft -> Active**: used successfully in >=2 ventures or 1 venture with repeatable proof + docs + tests/runbook.
- **Active -> Deprecated**: replacement exists; security/maintainability concerns; or compatibility horizon risk.
- **Deprecated -> Archived**: no longer allowed for new work; only maintained for legacy with explicit EOL.

**Deprecation process (template)**:
1. Declare replacement + rationale
2. Add "no new uses" guardrail (lint/template generator checklists)
3. Define EOL date + migration guide
4. Track ventures still using it + migration effort

**Confidence**: **High**

**Caveats**: Some ventures can be exempt if ROI is negative.

---

### Q2.3 — Handling ventures using deprecated patterns

**Direct answer**: Use a **tiered strategy**:
- **Force migration** only when security/compliance or vendor EOL demands it.
- **Maintain legacy** for "cash cow" ventures in maintenance mode.
- **Fork** when legacy must stay stable but new features need modern path.

**Confidence**: **High**

**Caveats**: Forking increases long-term cognitive load—only do it with clear boundaries.

---

### Q2.4 — Pattern Maintenance Budget ratio

**Direct answer**: Start with **60/40 (build/maintain)** while portfolio is small; shift toward **40/60** as ventures scale and operational load dominates.

**Heuristic**:
- If incidents/support are rising: allocate more to maintenance automation and reliability patterns.
- If shipping speed is the bottleneck: allocate more to creation/standardization.

**Confidence**: **Medium**

**Caveats**: Ratio depends heavily on venture maturity mix.

---

## Section 3: Failure Learning

### Q3.1 — Venture Post-Mortem template

**Template**:
- **Summary**: what it was, who for, timeframe
- **Hypothesis**: problem, customer, value proposition, channel
- **Success criteria**: leading + lagging indicators
- **What happened**: timeline, key decisions
- **Failure signals**: metrics + qualitative evidence
- **Root causes**: market, product, channel, execution, timing, constraints
- **Patterns used**: which helped, which hurt
- **Missing patterns**: what would have prevented/shortened failure
- **Counterfactual**: what we'd do in 2 weeks to test faster
- **Action items**: pattern updates, new patterns, kill-switch thresholds

**Confidence**: **High**

**Caveats**: Post-mortems must avoid "storytelling" and focus on falsifiable signals.

---

### Q3.2 — Feedback loop into the pattern library

**Direct answer**: Treat failures as **inputs to pattern backlog** with triage.

**Loop**:
- Failure detected -> evidence captured -> classify failure mode -> update/create pattern -> add guardrail/checklist -> require it in new venture templates -> review after next 2 uses.

**Confidence**: **High**

**Caveats**: Overfitting to one failure can create unnecessary bureaucracy.

---

### Q3.3 — How successful companies capture lessons

**Direct answer**: They operationalize learning via **blameless postmortems**, **mechanisms**, and **standard reviews** (pre-mortems, launch checklists, incident reviews).

**Adoptable practices**:
- "Mechanism owner" for each recurring failure mode (even if that's you + EVA).
- Write lessons as **checklists + automated gates**, not essays.

**Confidence**: **Medium-High**

**Caveats**: Cultural buy-in is easier solo, but discipline is harder.

---

### Q3.4 — "Failure Pattern Library" concept

**Direct answer**: Yes—keep it compact and actionable.

**What it contains**:
- Failure mode name, early signals, common causes, prevention checklist, "fast test" to validate earlier, and "kill criteria."

**Confidence**: **High**

**Caveats**: Don't let it become a fear-based blocker to experimentation.

---

## Section 4: Team/Skill Requirements

### Q4.1 — Skills Inventory system design

**Direct answer**: Maintain a **capability ledger** per skill with confidence and evidence.

**Data model**:
- Skill: name, category (backend/frontend/devops/sales/legal/etc), level (0-5), evidence links (projects), recency, AI-supportability, outsource options.
- Venture requirements: required skills + minimum level + risk if missing.

**Confidence**: **High**

**Caveats**: Self-assessments are biased—tie levels to evidence.

---

### Q4.2 — Learn vs hire/contract vs partner vs avoid (decision framework)

**Framework**:
- **Learn** if: skill is reusable across many ventures + core to differentiation + short ramp.
- **Hire/contract** if: urgent blocker + high leverage + clear spec + not core identity.
- **Partner** if: distribution/credibility is the real missing piece (not just skill).
- **Avoid** if: long ramp + high liability + low strategic fit + alternatives exist.

**Confidence**: **High**

**Caveats**: "Partner" often fails without aligned incentives—use sparingly.

---

### Q4.3 — Assess "skill distance"

**Direct answer**: Skill distance = (required level - current level) weighted by **time-to-competence** and **liability**.

**Simple scoring**:
- For each required skill: gap (0-5) x (ramp months) x (liability multiplier 1-3).
- Sum across skills; set a cutoff for "solo viable."

**Confidence**: **Medium-High**

**Caveats**: Ramp time varies widely by person and by project constraints.

---

### Q4.4 — Minimum viable skill set for solo operator with AI

**Must-have**:
- Product thinking + customer discovery
- Shipping full-stack MVPs (or reliably integrating patterns)
- Basic devops + incident response
- Pricing/positioning basics
- Writing (docs, marketing, support)
- Finance basics (cashflow, taxes awareness, subscription metrics)

**Confidence**: **Medium**

**Caveats**: You can outsource parts, but coordination overhead rises quickly.

---

## Section 5: Legal/Compliance Patterns

### Q5.1 — Legal/compliance patterns to include in the pattern library

**Direct answer (starter set)**:
- Terms of Service, Privacy Policy, Cookie banner/consent, DPA templates, data retention/deletion workflows, security incident response plan, vulnerability disclosure policy, access control patterns, audit logging, vendor risk checklist, ADA/WCAG basics, IP assignment/contractor templates.

**Confidence**: **Medium-High**

**Caveats**: Templates reduce effort but **don't replace legal review**.

---

### Q5.2 — Trigger points table (expand)

| Requirement | "Day 1" vs Trigger |
|---|---|
| Privacy Policy | **Day 1** if collecting personal data |
| Terms of Service | **Day 1** if users access service |
| Cookie consent | If tracking/ads + certain jurisdictions (esp. EU/UK) |
| GDPR | If EU/EEA/UK users or targeting those markets |
| DPA | When selling B2B and handling customer data as processor |
| SOC 2 | When selling to security-sensitive B2B / enterprise procurement |
| PCI | If you handle card data directly (avoid; use Stripe/etc) |
| Accessibility (WCAG) | Higher priority for public-facing apps; often required for gov/enterprise deals |
| Security policies (IRP, access control, logging) | **Early** if B2B; otherwise before meaningful scale |

**Confidence**: **Medium**

**Caveats**: Legal triggers vary by jurisdiction and business model.

---

### Q5.3 — Maintaining templates across 10-32 ventures (central vs per venture)

**Direct answer**: Use **centralized canonical templates** with **per-venture overrides** (name, entity, contact, product-specific data use).

**Practical approach**:
- One "Legal Core" folder + versioning + change log.
- Each venture references a pinned version; EVA flags when an update requires propagation.

**Suggested file locations** (beginner-friendly):
- `docs/legal/templates/terms-of-service.md`
- `docs/legal/templates/privacy-policy.md`
- `docs/legal/CHANGELOG.md`
- `ventures/<venture_name>/legal/overrides.yml`

**Confidence**: **High**

**Caveats**: Some ventures will need bespoke clauses; track those explicitly.

---

### Q5.4 — Legal structure for holding company with many ventures (trade-offs)

**Direct answer**: Common options:
- **Single parent LLC + DBAs**: simplest, cheapest; weakest liability isolation.
- **Parent + one LLC per venture**: stronger isolation; more admin/tax complexity.
- **Series LLC**: can reduce admin while isolating "series," but **recognition varies** by state/jurisdiction and can complicate banking/contracts.
- **Delaware C-Corp parent**: fundraising-friendly; heavier formalities; may be overkill early.

**Confidence**: **Medium**

**Caveats**: This is jurisdiction-specific; you need a qualified attorney/CPA for final decisions.

---

## Section 6: Pricing Patterns

### Q6.1 — Pricing patterns library (when to use, pros/cons, complexity)

- **Freemium**: big top-of-funnel; risk of costly free users; **complexity: medium**.
- **Free trial -> paid**: strong for B2B SaaS; needs onboarding; **complexity: low-medium**.
- **Usage-based**: aligns with value at scale; can be hard to understand; **complexity: high** (metering + billing edge cases).
- **Per-seat**: simple for team tools; limits revenue if value not seat-linked; **complexity: low**.
- **Flat rate**: simplest; may underprice heavy users; **complexity: low**.
- **Tiered**: balances; needs good packaging; **complexity: medium**.
- **One-time purchase**: great for utilities; less recurring; **complexity: low**.

**Confidence**: **High**

**Caveats**: "Best" depends on your true value metric and channel.

---

### Q6.2 — Pricing Decision Framework (inputs -> recommended structure)

**Direct answer**: Choose the **value metric** first, then map to a pricing pattern that's easy to explain and implement.

**Framework**:
- Inputs:
  - Customer type (SMB/enterprise/consumer)
  - Value metric (seat, usage, transactions, outcomes)
  - Sales motion (self-serve vs sales-led)
  - Cost drivers (compute, support)
  - Pattern support (what billing you can implement reliably)
- Output:
  - Primary pricing model + packaging + guardrails (caps, overages, minimums)

**Confidence**: **High**

**Caveats**: Competitive context can force packaging choices even if imperfect.

---

### Q6.3 — Minimum viable pricing experiment (A/B)

**Direct answer**: Don't A/B in the early days unless you have volume; instead run **sequential tests** and measure conversion + retention.

**MV experiment**:
- Two price points (or 2 packages), time-boxed 2-4 weeks, consistent traffic source.
- Measure: activation-to-paid, churn in first 30 days, refund requests, support complaints.

**Confidence**: **Medium-High**

**Caveats**: With low volume, qualitative feedback matters more than p-values.

---

### Q6.4 — Pricing changes as you scale (raise prices + grandfathering)

**Direct answer**: Raise prices when value increases, demand is strong, or support/costs rise; grandfather strategically to preserve trust.

**Rules**:
- Grandfather best customers (or time-box grandfathering).
- Offer upgrade path with clear value improvements.
- Communicate early, clearly, and with options.

**Confidence**: **High**

**Caveats**: Complexity grows with many legacy cohorts—keep SKU count low.

---

### Q6.5 — Most compatible pricing patterns with "vending machine" model

**Direct answer**: Prefer **simple, low-maintenance** pricing:
- Flat monthly, tiered, per-seat, or free trial -> paid.
- Avoid early usage-based unless metering is already a strong pattern in your library.

**Confidence**: **High**

**Caveats**: Some ventures (API/infra) are naturally usage-based—don't fight reality.

---

## Recommendations: which blind spots to address first (and why)

1. **Multi-venture portfolio management (EVA)**: it prevents burnout and compounding chaos; everything else becomes easier once you have a control plane.
2. **Legal/compliance patterns**: "Day 1" risk surface; centralized templates avert repeated work and dangerous omissions.
3. **Pricing patterns**: directly impacts time-to-revenue; you want a repeatable go-to-market motion.
4. **Failure learning**: turns each loss into compounding advantage; prevents repeating mistakes across ventures.
5. **Team/skill requirements**: important, but you can defer by selecting ventures within skill radius early.
6. **Pattern deprecation**: becomes critical later; can be light-touch early with a lifecycle policy.

---

## Prioritization Matrix (Urgency / Impact / Effort)

| Blind Spot | Urgency | Impact | Effort |
|---|---:|---:|---:|
| 1. Multi-venture portfolio management | **High** | **Very High** | High |
| 5. Legal/compliance patterns | **High** | High | Medium |
| 6. Pricing patterns | **High** | High | Medium |
| 3. Failure learning | Medium | High | Medium |
| 4. Team/skill requirements | Medium | Medium | Low-Medium |
| 2. Pattern deprecation | Low-Medium | Medium | Medium |
