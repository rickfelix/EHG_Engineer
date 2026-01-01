# Genesis PRD Review - Consolidated Findings

**Review Date**: December 30, 2025
**Reviewers**: OpenAI (7/10 confidence), AntiGravity (8.5/10 confidence)

---

## Executive Summary

Both reviewers found the Genesis Virtual Bunker architecture **sound at the conceptual level** but identified significant **specification gaps** that must be addressed before EXEC phase. The primary risk is the **Regeneration Gate mechanism** (MIRROR-ELEV) - both reviewers flagged the assumption that "Soul Extraction" can faithfully recreate production code from validated simulation as the highest-risk element.

### Confidence Assessment
| Reviewer | Score | Key Concern |
|----------|-------|-------------|
| OpenAI | 7/10 | Underspecified enforcement/verification |
| AntiGravity | 8.5/10 | Regeneration drift risk |

---

## Critical Issues - Must Fix Before EXEC

### 1. 🔴 Regeneration Fidelity Risk [MIRROR-ELEV]
**Both reviewers flagged this as the #1 risk**

| Aspect | OpenAI | AntiGravity |
|--------|--------|-------------|
| Risk | "No simulation artifacts" not test-defined | "Lobotomized Production" - subtle fixes lost |
| Gap | No verification mechanism specified | No behavioral parity check |
| Solution | "Simulation taint checklist" + CI enforcement | "Reflex Parity Tests" - same E2E on sim & prod |

**ACTION REQUIRED**: Add `FR-ELEV-4: Reflex Parity Check` - run identical E2E suite on both simulation and production builds before release.

---

### 2. 🔴 Mock Firewall Network Interception [MASON-FIREWALL]
**Both reviewers said current spec is insufficient**

| Aspect | OpenAI | AntiGravity |
|--------|--------|-------------|
| Gap | "Network interception" is vague | Monkey-patching `fetch` is fragile |
| Concern | Node fetch vs browser fetch, SSR vs client | Third-party SDKs bypass simple mocks |
| Solution | Explicit denylist + allowlist | Mandate MSW (Mock Service Worker) |

**ACTION REQUIRED**:
1. Specify denylist contents (Supabase, Vercel, GitHub, OpenAI, Stripe keys)
2. Mandate MSW `setupServer` (Node) / `setupWorker` (Browser) pattern
3. Create `simulation-firewall-check.yml` CI workflow (currently missing)

---

### 3. 🔴 Determinism Contract Undefined [MASON-P2]
**Both reviewers noted "identical inputs → identical outputs" is underspecified**

| Aspect | OpenAI | AntiGravity |
|--------|--------|-------------|
| Gap | No temperature/seed/prompt versioning | Pattern syntax not defined |
| Concern | What counts as "identical"? Hash scope? | "Slot-based composition" is vague |
| Solution | Define canonical sorting/formatting/hashing | Define Pattern Syntax Specification |

**ACTION REQUIRED**:
1. Define deterministic generation contract: model params, prompt versions, pattern hash scope
2. Specify pattern syntax (e.g., `{{variable}}` vs `__SLOT__`) in MASON-P1
3. Require formatter + strip nondeterministic timestamps before hashing

---

### 4. 🟠 Key File Paths Are Aspirational [Multiple PRDs]
**OpenAI flagged this as immediate blocker**

> "Key file paths in PRDs/User Stories are aspirational, not verified (e.g., `lib/genesis/*`, `lib/leo/commands/*`). This will stall implementation immediately."

**ACTION REQUIRED**: Freeze authoritative module layout before EXEC:
```
lib/genesis/
├── pattern-assembler.ts
├── quality-gates.ts
├── mock-firewall.ts
├── seed-parser.ts
├── prd-generator.ts
├── schema-inferrer.ts
├── repo-generator.ts
├── vercel-deploy.ts
├── regeneration.ts
└── pipeline.ts

lib/leo/commands/
├── genesis.ts
└── critique.ts
```

---

### 5. 🟠 Schema Inference Validation [DREAM-P2]
**Both reviewers want real PostgreSQL validation**

| Aspect | OpenAI | AntiGravity |
|--------|--------|-------------|
| Gap | "≥90% entity coverage" is ambiguous | RLS inference rules not specified |
| Concern | How is coverage measured? | AI hallucinations (invalid FKs) |
| Solution | CI job applies SQL to clean Postgres | Add "Schema Linter" for dangling FKs |

**ACTION REQUIRED**:
1. Define entity coverage calculation method
2. Add CI job: apply generated DDL to Postgres container
3. Add FK/circular dependency linter
4. Specify RLS inference rules

---

## High-Priority Recommendations

### From OpenAI
1. **Freeze authoritative module layout** - treat paths as contracts
2. **Add firewall CI workflow** as first-class deliverable
3. **Define deterministic generation contract**
4. **Add regeneration equivalence tests** (contract tests against requirements)
5. **Make multi-council cost ceilings explicit** in DREAM-P3

### From AntiGravity
1. **Implement "Behavioral Soul" Extraction** - extract test cases, not just requirements
2. **Hard cost circuit breakers** - $5/venture logic cap
3. **Pattern Library balance** - "Layout + Widget" model (layouts rigid, widgets composable)
4. **Add "Human Escape Hatch"** - manual edit after 3 AI failures
5. **Add "Broken Ritual" Protocol** - `manual-override.ts` if orchestrator jams

---

## PRD-Specific Actions

### MASON-P1 (Pattern Library)
| Issue | Action |
|-------|--------|
| "20+ patterns" is arbitrary | Define pattern quality rubric |
| No versioning strategy | Add `version` pinning requirement |
| Pattern syntax undefined | Add Pattern Syntax Specification |

### MASON-FIREWALL
| Issue | Action |
|-------|--------|
| Network interception vague | Mandate MSW pattern |
| CI workflow missing | Create `simulation-firewall-check.yml` |
| Third-party SDK bypass risk | Mock Supabase/Stripe clients explicitly |
| Denylist not specified | List exact env vars to block |

### MASON-P2 (Generation Pipeline)
| Issue | Action |
|-------|--------|
| Determinism claim weak | Define model params + normalization |
| Output hash scope undefined | Specify files/formatting/exclusions |

### DREAM-P2 (Schema/Repo Generation)
| Issue | Action |
|-------|--------|
| Coverage metric ambiguous | Define calculation method |
| Schema evolution not addressed | Document "Nuke and recreate" for v1 |
| RLS inference rules missing | Specify inference logic |

### DREAM-P3 (Ratification)
| Issue | Action |
|-------|--------|
| Cost control thin | Add hard $5/venture cap |
| Partial council failure unhandled | Add 2/3 quorum fallback |

### MIRROR-ELEV (Regeneration Gates)
| Issue | Action |
|-------|--------|
| "No simulation artifacts" not defined | Create simulation taint checklist |
| Behavioral parity not verified | Add Reflex Parity Tests |
| Data migration not addressed | Document "Clean Slate" approach |

### RITUAL
| Issue | Action |
|-------|--------|
| No contingency if deploy fails | Define fallback (PRD+venture+idea_brief only) |
| No "Broken Ritual" protocol | Create `manual-override.ts` |

---

## User Story Quality Scores

| SD | OpenAI | AntiGravity | Key Issues |
|----|--------|-------------|------------|
| MASON-P1 | - | 9/10 | Solid |
| MASON-P2 | 7/10 | 8/10 | Determinism needs stronger AC |
| MASON-FIREWALL | 8/10 | 9/10 | Network interception AC weak |
| MASON-BRANCH | 7/10 | - | Branch naming/audit logging not explicit |
| DREAM-P1 | - | 10/10 | Excellent INVEST |
| DREAM-P2 | 7/10 | - | Coverage metric ambiguous |
| DREAM-P3 | - | 7/10 | External dependency risks, handle partial failure |
| MIRROR-INT | 6/10 | - | Assumes paths exist, idempotency missing |
| MIRROR-ELEV | 6/10 | 8/10 | Needs "Diffs checked" AC |
| MIRROR-TEST | - | - | "Reflex patterns" undefined |
| RITUAL | 8/10 | 10/10 | Fallback not specified |

---

## Risk Matrix (Combined)

| Risk | OpenAI | AntiGravity | Combined | Action |
|------|--------|-------------|----------|--------|
| Regeneration Drift | High/High | High/Critical | **CRITICAL** | Add Reflex Parity Tests |
| Mock Firewall Bypass | Medium/Critical | - | **HIGH** | MSW + CI workflow |
| LLM Non-Determinism | High/High | - | **HIGH** | Define generation contract |
| Schema Inference Invalid | Medium/High | Medium/High | **HIGH** | Postgres CI + Linter |
| Pattern Exhaustion | - | High/Medium | **MEDIUM** | Layout+Widget model |
| Cost Death Spiral | - | Low/Low | **LOW** | Hard $5 cap |
| Feb 10 Cutoff Slips | Medium/High | - | **MEDIUM** | Front-load integration |

---

## Questions Requiring Team Answers

### From OpenAI
1. What is the authoritative module path for Genesis code?
2. What exactly counts as "simulation artifact" for MIRROR-ELEV verification?
3. What's the deterministic generation contract (model, temperature, prompt versions)?
4. What is the denylist (exact env vars) and outbound network policy?
5. What is the ritual fallback if deploy fails?

### From AntiGravity
1. How does `EHG_MOCK_MODE` handle Supabase Auth `getUser()` calls?
2. What specifically is the slot syntax for patterns?
3. Does the "Soul" include actual prompts or just abstract requirements?

---

## Recommended Action Plan

### Phase 1: Specification Fixes (Before Any EXEC)
1. [ ] Define authoritative module layout
2. [ ] Create Pattern Syntax Specification
3. [ ] Define deterministic generation contract
4. [ ] Specify mock firewall denylist + MSW mandate
5. [ ] Define "simulation artifact" checklist
6. [ ] Define entity coverage calculation
7. [ ] Document schema evolution strategy ("Nuke and recreate" for v1)
8. [ ] Add cost circuit breaker ($5/venture)

### Phase 2: Missing Deliverables
1. [ ] Create `simulation-firewall-check.yml` workflow
2. [ ] Create `manual-override.ts` for Ritual fallback
3. [ ] Add Reflex Parity Test requirement to MIRROR-ELEV
4. [ ] Add Schema Linter requirement to DREAM-P2

### Phase 3: PRD Updates
1. [ ] Update MASON-P1 with pattern syntax spec + versioning
2. [ ] Update MASON-FIREWALL with MSW mandate + CI workflow
3. [ ] Update MASON-P2 with determinism contract
4. [ ] Update DREAM-P2 with coverage calculation + linter
5. [ ] Update DREAM-P3 with cost cap + fallback modes
6. [ ] Update MIRROR-ELEV with Reflex Parity requirement
7. [ ] Update RITUAL with fallback protocol

---

## Conclusion

The Genesis Virtual Bunker architecture is **fundamentally sound** but requires **specification hardening** before EXEC phase. The reviewers' combined confidence (7.75/10 average) reflects achievable quality with the identified fixes.

**Primary Focus Areas**:
1. Regeneration verification (Reflex Parity Tests)
2. Mock firewall robustness (MSW + CI)
3. Determinism contract (model params + pattern syntax)

With these fixes, AntiGravity indicated confidence would rise to 9.5/10.
