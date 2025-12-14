# SD-ARTIFACT-INTEGRATION-001: Decision Log

**SD**: SD-ARTIFACT-INTEGRATION-001
**Title**: 25-Stage Artifact Integration + Stage-Gated Runtime Consumption
**Created**: 2025-12-14
**Phase**: LEAD Step 1 (Pre-Approval)

---

## Decision 1: Boundary Enforcement Model

### Decision
**Runtime NEVER generates artifacts; governance ALWAYS owns generation.**

### Alternatives Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: Strict Boundary (CHOSEN)** | Runtime only reads; governance only writes | Clear ownership, no API cost in runtime, single source of truth | Requires artifact request workflow for missing items |
| B: Runtime Fallback Generation | Runtime can generate if governance artifact missing | Better UX for missing artifacts | API cost duplication, drift risk, harder to audit |
| C: Hybrid with Runtime Cache | Runtime caches then regenerates if stale | Fast reads, self-healing | Complex invalidation, dual generation logic |

### Rationale
- **Cost control**: API calls (OpenAI, Gemini) stay in governance budget only
- **Audit trail**: All artifacts traceable to governance process
- **Chairman's intent**: "runtime does NOT run governance scripts" (explicit requirement)

### Tradeoffs Accepted
- Users may see "artifact missing" state requiring governance action
- Slight delay between artifact request and fulfillment
- More governance queue work

---

## Decision 2: Stage Policy Location

### Decision
**stage_policy.yaml lives in EHG_Engineering, copied to runtime at build time.**

### Alternatives Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A: API Fetch | Runtime fetches policy from governance API | Always fresh | Network dependency, latency, CORS complexity |
| **B: Build-Time Copy (CHOSEN)** | Policy bundled into runtime at build | Fast, no runtime dependency | Requires rebuild to update policy |
| C: Supabase Table | Policy stored in database | Dynamic updates, no rebuild | Another table to manage, migration complexity |
| D: Duplicate Files | Policy in both repos | No cross-repo dependency | Drift risk (two sources of truth) |

### Rationale
- Policy changes are infrequent (stage structure is stable)
- Build-time copy ensures offline capability
- No additional API surface to maintain
- Can migrate to API fetch in Phase 2 if needed

### Tradeoffs Accepted
- Policy updates require EHG rebuild
- Slight staleness possible between governance update and runtime deploy

---

## Decision 3: Gate Enforcement Model

### Decision
**Hard gates at decision stages (3, 5, 16); soft gates elsewhere.**

### Alternatives Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A: All Hard Gates | Every stage blocks without artifacts | Maximum quality assurance | Frustrated users, too restrictive for early stages |
| **B: Hard at Decision Stages (CHOSEN)** | Hard gates at stages 3, 5, 16 only | Balanced enforcement | Some stages can proceed without full artifacts |
| C: All Soft Gates | Warnings only, never block | Maximum flexibility | Quality gate becomes meaningless |
| D: User-Configurable | Per-venture gate settings | Personalized | Complex UI, inconsistent quality |

### Rationale
- Stages 3 (Market Validation), 5 (Chairman Financial Review), 16 (Schema Firewall) are critical decision points
- These align with epistemic_required_stages in stages_v2.yaml
- Other stages benefit from artifacts but shouldn't block progression

### Tradeoffs Accepted
- Some ventures may proceed with incomplete artifact coverage
- Chairman may need to override gates more often in soft-gate stages

---

## Decision 4: SuperDesign vs Nano Banana Ownership

### Decision
**SuperDesign = first-party custom engine; Nano Banana = third-party API.**

### Alternatives Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A: Both Third-Party | Use external services for all generation | Less maintenance | No differentiation, cost not controlled |
| **B: First-Party + Third-Party (CHOSEN)** | SuperDesign custom, Nano Banana external | Differentiation for design, commodity for images | Maintenance burden for SuperDesign |
| C: Both First-Party | Build everything in-house | Full control | High development cost, slow iteration |

### Rationale
- **SuperDesign** (token extraction, wireframes-to-spec, design contracts) is core IP
- **Nano Banana** (image generation) is commodity - use best available API
- Chairman confirmed: "SuperDesign = first-party custom engine in EHG_Engineering"

### Tradeoffs Accepted
- Must maintain SuperDesign engine long-term
- Gemini API cost for Nano Banana per image (~$0.01-0.04)
- Potential vendor lock-in for image generation

---

## Decision 5: Artifact Storage Strategy

### Decision
**Artifacts stored in Supabase (DB metadata + Storage bucket for images).**

### Alternatives Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: Supabase Native (CHOSEN)** | Metadata in tables, images in Storage | Unified platform, existing infrastructure | Supabase dependency |
| B: S3 + PostgreSQL | Images in AWS S3, metadata in DB | More scalable for large files | Additional infrastructure, cross-service auth |
| C: Git LFS | Artifacts in Git repository | Version control, offline | Large repo size, not queryable |
| D: External CDN | CDN for images, DB for metadata | Fast global delivery | Additional service, cost complexity |

### Rationale
- Supabase already in use for both EHG_Engineering and EHG
- Storage bucket (vision-briefs) already created and tested
- RLS policies align with existing auth model

### Tradeoffs Accepted
- Supabase Storage has size limits (currently 50MB per file, sufficient)
- Global CDN performance depends on Supabase infrastructure

---

## Decision 6: Stage Viewer Expansion Scope

### Decision
**Expand from 6/25 (24%) to 16/25 (64%) stage viewers in Phase 1.**

### Alternatives Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A: All 25 Stages | Build viewers for all stages | Complete coverage | Large scope, delays delivery |
| **B: Stages 1-16 (CHOSEN)** | Cover THE TRUTH through THE BLUEPRINT | Most critical stages covered | BUILD LOOP and LAUNCH stages delayed |
| C: Only Modified Stages | Only update existing 6 viewers | Smallest scope | Still 24% coverage, misses key stages |
| D: Artifact-Heavy Stages Only | Stages 2, 3, 5, 10, 11, 16 | Targeted impact | Gaps in navigation, confusing UX |

### Rationale
- Stages 1-16 cover THE TRUTH, THE ENGINE, THE IDENTITY, THE BLUEPRINT phases
- These are the phases where governance artifacts are most relevant
- BUILD LOOP (17-20) and LAUNCH (21-25) are more execution-focused, less artifact-dependent

### Tradeoffs Accepted
- Stages 17-25 remain without dedicated viewers (can use generic fallback)
- May need Phase 2 to complete 100% coverage

---

## Decision 7: Quality Threshold Value

### Decision
**85% validation threshold for artifact approval.**

### Alternatives Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A: 70% Threshold | Lower bar for approval | Faster throughput | Quality compromise |
| **B: 85% Threshold (CHOSEN)** | Moderate quality bar | Balanced quality/speed | Some artifacts may need rework |
| C: 95% Threshold | High quality bar | Excellent artifact quality | Bottleneck, frustrated users |
| D: Per-Artifact Variable | Different thresholds per type | Tailored quality | Complex configuration |

### Rationale
- 85% aligns with LEO Protocol gate pass rate target
- Allows minor imperfections while ensuring substantive quality
- Can be adjusted per-stage in stage_policy.yaml if needed

### Tradeoffs Accepted
- 15% of artifacts may have minor quality issues that pass
- Chairman may need to review edge cases

---

## Decision 8: Artifact Panel Position in UI

### Decision
**ArtifactPanel at bottom of stage viewer, after main content.**

### Alternatives Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A: Top of Stage | Artifacts above main content | Immediate visibility | Distracts from primary task |
| B: Sidebar | Artifacts in right panel | Always visible | Reduces main content width |
| **C: Bottom Section (CHOSEN)** | Artifacts below main content | Clear visual hierarchy | Requires scroll to see |
| D: Modal/Drawer | Artifacts in expandable panel | Non-intrusive | Extra click to access |

### Rationale
- Stage content is primary; artifacts are supporting material
- Bottom position follows natural reading order (complete stage, review artifacts)
- Gate indicator at top provides immediate status without scrolling

### Tradeoffs Accepted
- Long stages may require scroll to see artifacts
- Consider adding mini-indicator in stage header for awareness

---

## Summary: Decision Matrix

| # | Decision | Risk Level | Reversibility |
|---|----------|------------|---------------|
| 1 | Strict boundary (runtime never generates) | Low | Easy (add fallback later) |
| 2 | Build-time policy copy | Low | Easy (switch to API fetch) |
| 3 | Hard gates at decision stages only | Medium | Easy (change gate_type in YAML) |
| 4 | SuperDesign first-party, Nano Banana third-party | Low | Medium (engine migration) |
| 5 | Supabase native storage | Low | Medium (data migration) |
| 6 | Stages 1-16 viewers | Low | Easy (add more later) |
| 7 | 85% quality threshold | Low | Easy (configuration) |
| 8 | ArtifactPanel at bottom | Low | Easy (UI repositioning) |

**Overall Risk Assessment**: LOW - All decisions are reversible with minimal effort.

---

## Open Questions for Chairman Approval

1. **Gate Override UX**: Should Chairman override be instant or require justification text?
2. **Artifact Request Flow**: When runtime requests missing artifact, does it auto-create governance queue entry?
3. **Epistemic Display**: Show Four Buckets classification inline or in expandable section?
4. **Stage Viewer 17-25**: Delay to Phase 2 acceptable, or should we include generic fallback now?

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-14 | LEO Protocol | Initial decision log (LEAD Step 1) |
