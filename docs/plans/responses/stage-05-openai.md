# Stage 5 "Profitability" -- OpenAI Response

> Independent response to the Stage 5 triangulation prompt.
> Respondent: GPT 5.3 (OpenAI)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact (Stage 6 & Blueprint) | Verdict | Challenge |
|-----|---------|---------|:-----------------:|------------------------------------------|---------|-----------|
| Financial input generation | AI-assisted model generation from assumptions | Manual 10-number input only | **5** | Stage 6 starts from weak/untraceable assumptions | **CLOSE** | Without this, Stage 5 is not autonomous |
| Stage 4 consumption | Pricing/market assumptions tied to competitor context | No Stage 4 linkage | **5** | Pricing and margin assumptions drift from market reality | **CLOSE** | Stage 4 `stage5Handoff` already planned; use it directly |
| ROI threshold calibration | 15% projected ROI | 50% 3-year ROI | **4** | Too strict kills viable ventures; too loose passes weak ventures | **ADAPT** | Neither threshold is universally right; calibrate to uncertainty |
| Unit economics guards | CAC/LTV/churn/payback | None | **4** | Stage 6 business model quality drops (no acquisition economics) | **CLOSE** | Keep minimal set; full GUI complexity not required |
| Scenario robustness | Optimistic/realistic/pessimistic | Single projection | **4** | Stage 6 inherits brittle assumptions | **ADAPT** | Lightweight scenarios are enough; no need full monthly sim |
| Kill behavior | Recursion with loop prevention | Hard block | **3** | Hard stop may reduce learning loops; recursion may thrash | **ADAPT** | Best is bounded remediation path, not open recursion |
| Projection granularity | 36-month monthly | 3-year annual | **3** | Annual may miss cashflow timing; still okay for kill gate | **ELIMINATE** (monthly gap) | Annual + payback metric is sufficient for gate decision |
| Composite profitability score | 0-100 weighted score | Binary pass/kill | **2** | Useful prioritization signal for Stage 6 confidence | **ADAPT** | Optional score, not gate dependency |
| AI-heavy UX features | Dynamic GUI forecasting workflow | Deterministic compute | **1** | Minimal effect on pipeline correctness | **ELIMINATE** | CLI strength is deterministic, auditable logic |

### 2. ROI Threshold Recommendation

- **Recommended threshold:** move from fixed `50%` to **`25%` base-case 3-year ROI** for early-stage ventures.
- **Keep break-even guardrail:** `breakEvenMonth <= 24` (or conditional pass up to 30 with strong unit economics).
- **Formula (keep current core):**
  `roi3y = (netProfitY1 + netProfitY2 + netProfitY3 - initialInvestment) / initialInvestment`
- **Decision bands (better than one hard cliff):**
  - `roi3y >= 0.25` and break-even <= 24 -> pass
  - `0.15 <= roi3y < 0.25` -> conditional (requires strong LTV:CAC + confidence)
  - `< 0.15` -> kill

### 3. Unit Economics Decision

- Stage 5 **does need** unit economics, but only a **minimal kill-gate set**:
  - `cac`
  - `arpuMonthly` (or annual ARPU)
  - `grossMarginPct`
  - `churnMonthly` (or retention proxy)
- Derived:
  - `ltv`
  - `ltvCacRatio`
  - `paybackMonths`
- Gate use:
  - `ltvCacRatio >= 2` (>=3 ideal)
  - `paybackMonths <= 18` (<=12 strong)

### 4. Financial Model Generation

Use an `analysisStep` in Stage 5 to generate the 10 numbers plus assumptions:

- **Inputs to generator:**
  - Venture description + Stage 3 demand context
  - Stage 4 `stage5Handoff` (pricing tiers, competitive intensity, confidence, market pressure)
- **Outputs:**
  - `year1-3 revenue/cogs/opex`
  - assumption pack (`price`, `penetration`, `growth`, `cost drivers`)
  - confidence + provenance notes
- **Pattern:** LLM proposes assumptions -> deterministic calculator produces financials -> Devil's Advocate challenges weak assumptions.

### 5. Kill Behavior Recommendation

- For autonomous pipelines, use **hard block + structured remediation**, not unbounded recursion.
- Recommended flow:
  - Kill -> block progression -> emit `remediationRoute` (`stage3` or `stage4`) + reasons
  - Allow **max 1 automatic retry cycle**
  - Then escalate/require explicit override rationale

This preserves deterministic control while still enabling recovery loops.

### 6. Stage 4 -> Stage 5 Pipeline

Consume `stage5Handoff` as first-class input:

- **Required from Stage 4:**
  - pricing model + tiers
  - competitor price range
  - `competitiveIntensity` (0-100)
  - confidence/provenance
- **Stage 5 should map it to:**
  - initial pricing assumption
  - margin compression factor (from competitive intensity)
  - penetration ceiling/floor
- **Additional Stage 5 data needed:**
  - initial investment
  - fixed/variable cost assumptions
  - acquisition channel assumption for CAC proxy

### 7. CLI Superiorities (preserve)

- Deterministic kill-gate math (stable, testable)
- Pure `evaluateKillGate()` function (excellent for regression tests)
- Clear machine-readable kill reasons (great for orchestration)
- Lower operational complexity than GUI AI stack
- Easier CI/CD validation and reproducibility

### 8. Recommended Stage 5 Schema (CLI-native)

Add sections while keeping existing 10-field compatibility:

- `inputs` (existing annual financials)
- `assumptions`
  - `pricing`, `growth`, `churn`, `cac`, `grossMarginPct`
- `stage4Context`
  - `pricingSummary`, `competitiveIntensity`, `confidence`, `provenance`
- `analysis`
  - generated assumptions + scenario outputs
- `derived`
  - existing ROI/break-even + `ltv`, `ltvCacRatio`, `paybackMonths`
- `killGate`
  - decision + reasons + remediation route
- `confidence`
  - overall confidence score + flags

### 9. Minimum Viable Change (priority ranked)

1. **Add Stage 4 handoff consumption to Stage 5**
   - Modify: `lib/eva/stage-templates/stage-05.js`
   - Purpose: ground assumptions in competitor pricing reality

2. **Add Stage 5 `analysisStep` for assumption/model generation**
   - Modify: `lib/eva/stage-templates/stage-05.js`
   - Modify: `lib/eva/eva-orchestrator.js`
   - Create: `lib/eva/stage-analysis/stage-05-financial-model.js`

3. **Introduce minimal unit-economics guardrails**
   - Modify: `lib/eva/stage-templates/stage-05.js`
   - Add derived metrics + kill reasons (`LTV:CAC`, payback)

4. **Add lightweight 3-scenario stress test**
   - Modify: `lib/eva/stage-templates/stage-05.js`
   - Base/optimistic/pessimistic multipliers; no monthly engine

5. **Adjust ROI threshold logic to banded decision**
   - Modify: `lib/eva/stage-templates/stage-05.js`
   - Replace single 50% hard cutoff with calibrated bands

### 10. Cross-Stage Impact

- Stage 6 gets stronger starting signals: realistic pricing pressure, better unit economics, and confidence-bounded profitability.
- Blueprint phase quality improves because financial viability is not only binary-pass but also **explainable and stress-tested**.
- Pipeline remains CLI-native and deterministic, while adding just enough intelligence to avoid garbage-in kill decisions.
