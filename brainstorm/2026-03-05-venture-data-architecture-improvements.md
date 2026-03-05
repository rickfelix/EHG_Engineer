# Brainstorm: Venture Data Architecture Improvements

## Metadata
- **Date**: 2026-03-05
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (clean slate — all ventures deleted prior to brainstorm)

---

## Problem Statement
The `ventures` table is the central entity in the EHG system with 73+ FK-dependent child tables. There is no standard lifecycle management pattern for creating, archiving, or deleting ventures and their related data. Deleting ventures requires a bespoke 150-line script that manually discovers and cleans every child table. FK constraints are inconsistently applied (some CASCADE, some RESTRICT, some missing), leading to runtime surprises. No soft-delete pattern exists for audit trail preservation, and no dev teardown/seed utility exists for test data management.

## Discovery Summary

### Trigger Event
During a routine cleanup of 7 test/demo ventures, we discovered:
1. A custom deletion script was required — no standard utility existed
2. The script had to handle 73+ child tables in correct FK order
3. `chairman_decisions` blocked deletion due to a RESTRICT FK constraint that wasn't anticipated
4. Several tables referenced in migrations don't exist in the Supabase schema cache (orphaned artifacts)

### Constraints Identified
- Backward compatibility with 73+ child tables
- Supabase/PostgreSQL platform limits
- Zero-downtime migrations required
- Solution must be generic enough to apply to portfolios, companies, and other central entities

### User Preferences
- Hybrid archive model: soft-delete first, then cold storage after N days
- Ventures first, document the pattern for reuse on other entities
- Biggest pain point: no safe way to clean up test data

## Analysis

### Arguments For
1. **Immediate pain relief** — teardown utility directly solves the biggest pain point
2. **CASCADE audit prevents future surprises** — discovering blocking FKs at runtime is a production risk
3. **Hybrid archive enables compliance** — preserving deleted venture data supports audit trails
4. **Pattern reusability** — building for ventures creates a template for other entities

### Arguments Against
1. **73+ table migration scope** — auditing and fixing CASCADE constraints is significant
2. **Cold storage adds complexity** — archive tables + scheduled jobs + restore logic
3. **Orphan cleanup may be cosmetic** — low ROI compared to other items

## Tradeoff Matrix: CASCADE Strategy

| Dimension | Weight | A: Universal CASCADE | B: Selective CASCADE + RESTRICT | C: Application-Level Cleanup |
|-----------|--------|---------------------|-------------------------------|------------------------------|
| Complexity | 20% | 3/10 | 7/10 | 5/10 |
| Maintainability | 25% | 8/10 | 9/10 | 4/10 |
| Performance | 20% | 7/10 | 7/10 | 5/10 |
| Migration Effort | 15% | 4/10 | 5/10 | 9/10 |
| Future Flexibility | 20% | 4/10 | 9/10 | 6/10 |
| **Weighted Score** | | **5.45** | **7.60** | **5.55** |

**Decision: Option B (Selective CASCADE + RESTRICT)** — highest score, no critical weaknesses.

## Tradeoff Matrix: Archive Strategy

| Dimension | Weight | A: Soft-Delete Only | B: Separate Archive Tables | C: Hybrid |
|-----------|--------|---------------------|---------------------------|-----------|
| Complexity | 20% | 8/10 | 4/10 | 5/10 |
| Maintainability | 25% | 7/10 | 5/10 | 7/10 |
| Performance | 20% | 6/10 | 9/10 | 8/10 |
| Migration Effort | 15% | 9/10 | 3/10 | 5/10 |
| Future Flexibility | 20% | 6/10 | 7/10 | 9/10 |
| **Weighted Score** | | **7.10** | **5.70** | **7.05** |

**Decision: Option C (Hybrid)** — highest flexibility (9/10), best long-term architecture.

## Team Perspectives

### Challenger
- **Blind Spots:**
  1. RLS policy interaction — CASCADE deletes bypass RLS, losing audit trail
  2. Cross-entity references — child tables referencing both ventures AND other entities could orphan data
  3. Migration ordering risk — 73 ALTER TABLEs with implicit interdependencies
- **Assumptions at Risk:**
  1. All 73 tables may not have data — many could be empty scaffolding
  2. CASCADE may not be universally correct — governance tables should RESTRICT
  3. Schema cache mismatches may not mean "orphaned" — could be schema/view differences
- **Worst Case:** CASCADE migration accidentally deletes chairman decision history on venture archive

### Visionary
- **Opportunities:**
  1. Entity lifecycle framework reusable across all central entities
  2. Schema health dashboard showing constraint consistency and migration drift
  3. Test fixture factory enabling reproducible CI/CD test environments
- **Synergies:**
  - Archive/restore as chairman actions in EVA
  - Schema consistency as a HEAL scoring dimension
  - Reliable E2E testing unblocked by test data cleanup
- **Upside Scenario:** Single `npm run venture:archive <id>` handles all 73+ tables with audit trails and reversibility

### Pragmatist
- **Feasibility:** 6/10 — each piece is straightforward, but cross-cutting scope (73 tables) and zero-downtime requirement add up
- **Resource Requirements:** 3-4 SDs phased over multiple sessions
- **Constraints:**
  1. Must not break existing queries (add view layer, not modify SELECTs)
  2. Archive tables need identical schemas (avoid drift)
  3. Cold storage job needs monitoring
- **Recommended Path:**
  1. Phase 1: FK audit script + teardown utility
  2. Phase 2: Soft-delete migration (deleted_at + v_active_ventures view)
  3. Phase 3: Selective CASCADE/RESTRICT (informed by audit)
  4. Phase 4: Cold storage archive (scheduled job + archive tables)

### Synthesis
- **Consensus:** Teardown utility is highest-value first step. FK audit must precede CASCADE changes.
- **Tension:** Challenger warns CASCADE isn't universally correct. Visionary wants full lifecycle framework. Pragmatist says phase it.
- **Composite Risk:** Medium

## Open Questions
- Which of the 73 child tables actually contain data vs. empty scaffolding?
- Which tables should RESTRICT vs CASCADE on venture delete? (governance vs data)
- What is the actual state of FK constraints in production vs. what migrations defined?
- Should the `v_active_ventures` view replace direct `ventures` table access in RLS policies?

## Suggested Next Steps
1. Create Vision + Architecture Plan documents
2. Register in EVA for HEAL scoring
3. Create phased SDs following the Pragmatist's recommended path
