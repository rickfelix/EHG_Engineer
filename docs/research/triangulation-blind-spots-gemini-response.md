# Triangulation Research: Blind Spots

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: api, testing, unit, migration

## AntiGravity (Gemini) Research Response

**Date**: 2026-01-01
**Researcher**: AntiGravity (Gemini)
**Method**: Codebase-aware analysis

---

## Section 1: Multi-Venture Portfolio Management

**Context**: Managing 32 ventures requires shifting from "Architect" to "CEO of Holding Company". EHG has existing infrastructure (EVAOrchestrationDashboard, evaDirectiveRouter) that can be leveraged.

### Q1.1: Venture Portfolio Operating System (EVA Architecture)

**Architecture Requirement**: EVA must function as the "Operating System" for the holding company, not just an assistant.

**Design**:

**Central Nervous System (EVA Core)**:
- **Data Aggregator**: Pulls real-time stats from all 10-32 ventures (Revenue, Uptime, User Activity, Burn Rate).
- **Pattern Matcher**: Compares venture health against "Golden Paths" (e.g., is Venture X growing as fast as the benchmark?).
- **Exception Engine**: Only surfaces issues that deviate from the standard. "Management by Exception".

**Dashboard Requirements**:

**The "Cockpit" (Chairman View)**:
- **Health Grid**: 32 tiles, color-coded (Green/Yellow/Red). Green = Standard Ops (Ignore), Yellow = Warning (Watch), Red = Critical (Intervene).
- **Cash Flow Pulse**: Aggregate burn vs. revenue across the portfolio.
- **Capital Allocation**: Where is the "fuel" (money/compute) going?

**Venture Detail (Double-click)**:
- Specific metrics tailored to the venture stage (e.g., Vending Machine = Uptime/Transactions; SaaS = ARR/Churn).

**Automation vs. Human**:
- **Automate**: Data collection, routine reporting (Daily/Weekly digests), "Level 1" support (password resets, basic queries - already partially in EVAAssistantPage), automated billing/dunning.
- **Human**: Strategic pivots, "Kill" decisions, resolving "Red" alerts that AI cannot fix, final hiring/firing decisions.

**Decision Routing**:
- **Low Stake (<$100 impact)**: EVA Auto-decide (e.g., approving small server upgrade).
- **Medium Stake ($100-$1000)**: EVA Propose -> Human Approve (Async).
- **High Stake (>$1000 or Strategic)**: Human Decide -> EVA Execute.

**Alert System**:
- **P0 (Critical)**: Site down, Security breach, Runaway spend. Immediate SMS/Call.
- **P1 (Warning)**: metric deviation > 20%. Daily Digest.
- **P2 (Info)**: Routine updates. Weekly Review.

---

### Q1.2: Lessons from Holding Companies (Constellation, Tiny, Berkshire)

- **Constellation Software**: "Extreme Decentralization". Each venture runs autonomously. Central head office is tiny. **Lesson**: Do NOT try to centralize everything. Let ventures have their own "souls" but enforce centralized financial reporting.
- **Tiny Capital**: "Founder-friendly, long-term hold". They don't micromanage. **Lesson**: Trust the "Venture Lead" (even if AI) to run the day-to-day. Only step in for capital allocation.
- **Berkshire Hathaway**: "Trust mechanism". Buffett trusts managers implicitly. **Lesson**: Build AI agents you trust to operate within bounds, rather than verifying every action.

---

### Q1.3: The Management Cliff

The "Management Cliff" is where the cognitive load of switching contexts exceeds the marginal value of the next venture. For a solo operator, this usually hits around **8-12 active context-switching ventures without EVA**. With EVA handling "Maintenance Mode" ventures, this pushes to **32+**.

**Warning Signs**:
- Dreading updates from certain ventures.
- Missing "Red" alerts because of noise.
- "Zombie Ventures" (alive but strictly flat/declining for >3 months).
- Latency in decision making (>24h for simple decisions).

---

### Q1.4: Venture Lifecycle State Machine

Transitions should be defined in a `VentureStatus` enum in the codebase (likely in `src/types/orchestration.ts` or similar).

| State | Description | Trigger |
|-------|-------------|---------|
| **Incubation** (Active Dev) | High touch. Human + AI Architect. | Idea passed selection -> Stage 1. |
| **Growth** (Scale) | Marketing/Feature focus. Human + AI Growth Marketer. | PMF confirmed (Revenue > $X/mo). |
| **Maintenance** (Cash Cow) | "Vending Machine" mode. 99% AI Ops. | Growth plateaus but profitable. |
| **Distressed** (Fix/Kill) | Metric thresholds breached. | Churn spike, Revenue dip. Requires Human Intervention. |
| **Sunset** (Deprecate) | Shut down. | Unprofitable for X months + High maintenance. |
| **Exit** (Sold) | Acquisition. | Acquisition offer aimed at "Tiny" or similar. |

---

### Q1.5: Human vs. AI Roles

- **AI Compatible**: DevOps, QA, Basic Customer Support (L1), CFO (Bookkeeping), Data Analysis, Copywriting.
- **Human Required**: High-stakes Negotiation, Legal Liability Sign-off, Creative "Zero to One" Vision, Complex Emotional Customer Disputes, Physical World Interface.

---

## Section 2: Pattern Deprecation

**Context**: EHG Pattern Library (in `src/components`).

### Q2.1: Detection Signals

- **Usage Stats**: grep check—if a pattern is used in < 2 ventures and hasn't been touched in 6 months.
- **Tech Debt**: Dependencies are 2+ major versions behind.
- **Alternative avail**: A "V2" component exists that covers 100% of V1 use cases + more.

---

### Q2.2: Pattern Lifecycle

| State | Location | Description |
|-------|----------|-------------|
| **Draft** | `src/components/experimental` | Experimental. |
| **Active** | `src/components/core` | Golden standard. |
| **Deprecated** | Marked with `@deprecated` JSDoc | Still works, but warn on build. |
| **Archived** | `legacy/` repo or deleted | Removed from code. |

---

### Q2.3: Handling Ventures with Deprecated Patterns

**Strategy**: "Freeze & Fork" (Containerization).
- Legacy ventures are "frozen" in time (containerized dependencies). They keep using the old pattern. We do not force migration unless there is a Security Vulnerability.
- Active ventures are encouraged to migrate via lint warnings.

---

### Q2.4: Maintenance Budget

**Ratio**: **80/20 (Create/Maintain)**.

- In early stages (building the holding co), focus on creation.
- Only refactor/deprecate if it blocks new ventures.
- "Don't fix it if it works" (for Vending Machines).

---

## Section 3: Failure Learning

**Context**: Learning from grep "failure".

### Q3.1: Post-Mortem Template (The "Black Box" Log)

Based on Amazon COE / Stripe Retrospectives.

```markdown
# Venture Post-Mortem

## Venture Name & ID:
## Lifespan: (Start Date - End Date)
## Kill Reason: (The "Why")

## Hypothesis vs. Reality:
- **We thought**: "Users want X."
- **Reality**: "Users wanted Y, or X was too expensive."

## Pattern Autopsy:
- Did a specific pattern fail? (e.g., "Viral Loop A" didn't convert).
- Did we lack a pattern? (e.g., "Missed Trust Signals").

## Action Item:
- New Pattern created? (Y/N)
- Pattern updated? (Y/N)
```

---

### Q3.2: The Feedback Loop

1. **Signal**: Venture Killed.
2. **Analysis**: Auto-generate Post-Mortem draft via EVA (analyzing logs/repo).
3. **Human Review**: Add "Gut feeling" context.
4. **Codification**: Create specific SD ("Strategic Directive") to update the Pattern Library.
5. **Distribution**: New ventures act as consumers of this updated wisdom.

---

### Q3.3: Industry Practices

- **Amazon**: "Correction of Errors" (COE). Deep 5-Whys.
- **Stripe**: "Incident Review". Blameless. Focus on process not people.
- **Bridgewater**: "Dot Collector". Radical transparency on why it failed.

---

### Q3.4: Failure Pattern Library

Yes. **"Anti-Patterns"**:

- **"The Solution in Search of a Problem"**: Built tech before validating demand.
- **"The Feature Creep Death"**: Delayed launch by 3 months for "one more thing".
- **"The Phantom Market"**: People said they would buy, but didn't swipe card.
- **"The Unit Economics Trap"**: CPA > LTV.

---

## Section 4: Team/Skill Requirements

### Q4.1: Skills Inventory System

A simple JSON/Markdown matrix in `docs/skills_matrix.md`.

| Capability | Level | Status |
|------------|-------|--------|
| Frontend | High | In-house |
| Backend | High | In-house |
| AI Ops | High | AI |
| Legal | Low | Outsource |
| Hardware | Zero | Blocked |

---

### Q4.2: Build / Buy / Partner Framework

- **Core Competency (Software/AI)**: **Build**. (It's our leverage).
- **Commodity (Legal/Tax/Hosting)**: **Buy**. (Use Stripe Atlas, Vercel, etc.).
- **Niche High-Skill (e.g., specialized ML model training, video production)**: **Partner/Contract**.
- **Blocker**: If a venture requires a "Blocked" skill (e.g., Hardware Mfg) -> **Kill/Pass**.

---

### Q4.3: Skill Distance

**Score 0-5**:
- **0**: We have patterns and exact skills.
- **1**: We have patterns, need minor learning.
- **3**: New language/framework required.
- **5**: Completely foreign domain (e.g., Biotech).

**Rule**: Don't pick ventures with Distance > 2 unless the primary goal is learning.

---

### Q4.4: Minimum Viable Skill Set

- **Architect/Coder**: Full-stack capability (or ability to direct AI to do it).
- **Product Manager**: "What to build" intuition.
- **Growth/Sales**: "How to sell it". (Often the weak point for engineers).

---

## Section 5: Legal/Compliance Patterns

### Q5.1: Compliance Patterns

**Templates**:
- `TermsOfService_SaaS_Standard`
- `PrivacyPolicy_GDPR_Compliant`
- `DPA` (Data Processing Agreement)

**Mechanisms**:
- `CookieConsentBanner` (Component)
- `DeleteUserDataJob` (Pattern for GDPR "Right to be Forgotten").

---

### Q5.2: Compliance Triggers

| Requirement | Trigger Point |
|-------------|---------------|
| Privacy/Terms | Day 1 (Store generated). |
| GDPR | First EU User (or aimed at EU). |
| Tax Nexus | Revenue > Threshold in specific state/country (Stripe Tax handles this). |
| SOC2 | Enterprise Deal > $20k/yr requiring it. (Don't do it before). |
| HIPAA | Touching PHI (Avoid unless specialized). |

---

### Q5.3: Maintenance

**Centralized is king**.

- Use a "Master Terms" structure where specific ventures append an exhibit.
- Or use a centralized compliance vendor (e.g., Termly, Iubenda) tailored to multiple domains.
- **Do not hand-roll 32 separate privacy policies**.

---

### Q5.4: Legal Structure (32 Ventures)

**Recommendation**: **Series LLC (Delaware or Wyoming)**.

- **Structure**: One "Master LLC" (EHG Holdings).
- **Cells**: Each venture is a "Series" (e.g., Venture A, Series of EHG Holdings LLC).
- **Pros**: One filing fee (mostly), segregated liability (assets of Venture A effectively protected from lawsuits against Venture B).
- **Cons**: Some banking complexity (needs clear separation), but manageable.
- **Alt**: Delaware C-Corp is overkill for 32 micro-saas bets unless one scales significantly (then spin it out).

---

## Section 6: Pricing Patterns

### Q6.1: Pricing Pattern Library

| Pattern | Best For | Notes |
|---------|----------|-------|
| **Freemium** | "Viral" tools | High support load risk. |
| **Free Trial (CC Required)** | SaaS | Filters tire-kickers. |
| **Usage-Based** | API/Compute heavy tools (AI wrappers) | Aligns cost/rev. |
| **Lifetime Deal (LTD)** | Initial cash injection / validation | Bad for long-term if high maintenance. |

---

### Q6.2: Decision Framework

**Algorithm**:
- If **CostToServe is High** (AI tokens) -> **Usage Based**.
- If **Value is Time Saved** -> **Monthly SaaS**.
- If **Target is Enterprise** -> **Tiered (Contact Sales)**.
- If **Target is Consumer/Prosumer** -> **Freemium or Low-cost Subscription**.

---

### Q6.3: A/B Testing

- **MVP**: "Painted Door" test. Two landing pages, two prices. Measure click-through to "Checkout".
- **Phase 2**: Stripe Price ID A/B testing.

---

### Q6.4: Changing Prices

- **Grandfathering**: Always grandfather existing users (Legacy Plan). It builds immense goodwill and reduces churn.
- **New Users**: See new price.

---

## Prioritization Matrix

| Blind Spot | Urgency | Impact | Effort | Rank | Why? |
|------------|---------|--------|--------|------|------|
| 1. Multi-Venture Portfolio (EVA) | High | Critical | High | **1** | You cannot scale past ~5 ventures without this. It is the bottleneck. |
| 5. Legal/Compliance | Medium | High | Low | **2** | Liability risk grows with volume. Series LLC setup is a one-time high-leverage fix. |
| 3. Failure Learning | Medium | High | Medium | **3** | To get better at selection, you must learn from the "Kills". |
| 2. Pattern Deprecation | Low | Medium | Low | **4** | Can tolerate some tech debt early on. |
| 6. Pricing Patterns | Low | Medium | Low | **5** | Can accept suboptimal pricing initially; easy to fix later. |
| 4. Skills Inventory | Low | Low | Low | **6** | Solo founders usually know what they can't do intuitively. |

**Recommendation**: Focus immediately on Q1 (EVA Architecture). It is the "Operating System" that enables all others. Without it, the "Management Cliff" will stop EHG at ~8 ventures regardless of how good the legal or pricing patterns are.
