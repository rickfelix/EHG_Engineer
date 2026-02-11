# Genesis Oath: Sprint Roadmap


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: api, testing, migration, schema

> **Document Version: GENESIS-V3.1**
> **Vision Version: 3.1**
> **Status: RATIFIED**
> **Last Updated: 2025-12-29**

| Attribute | Value |
|-----------|-------|
| **Timeline** | December 29, 2025 – February 14, 2026 |
| **Total Capacity** | ~330 Strategic Directives |
| **Parent Document** | [GENESIS_OATH_V3.md](./GENESIS_OATH_V3.md) |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.1 | 2025-12-29 | Updated terminology: promotion → elevation |
| 3.0 | 2025-12-29 | Simulation Chamber sprint plan finalized |

---

## Overview

This roadmap defines the implementation plan for the Genesis Oath v3 Simulation Chamber architecture. The work is organized into three sprints aligned with zodiacal energies, culminating in the Genesis ritual on February 14, 2026.

---

## Sprint Timeline

| Sprint | Dates | Archetype | Focus | SDs | Energy |
|--------|-------|-----------|-------|-----|--------|
| **Capricorn** | Dec 29 – Jan 19 | The Mason | Simulation Infrastructure | 110 | Structure |
| **Aquarius** | Jan 20 – Feb 8 | The Dreamcatcher | Text-to-Simulation Intelligence | 140 | Intelligence |
| **Pisces** | Feb 9 – Feb 13 | The Mirror | Integration & Promotion | 80 | Connection |
| **Genesis** | Feb 14 | The Collapse | Ritual Execution | 0 | Activation |

**Hard Constraint:** No new logic after Feb 10 (Mercury enters pre-retrograde shadow Feb 12)

---

## Sprint 1: The Mason (Capricorn)

**Duration:** 22 days (Dec 29 – Jan 19)
**Capacity:** 110 SDs
**Theme:** Build the Simulation Chamber infrastructure

### Phase 1: Ephemeral Foundation (Dec 29 – Jan 5) — 40 SDs

| SD | Title | Description | SDs |
|----|-------|-------------|-----|
| SD-MAS-001 | GitHub Simulations Org | Create `ehg-simulations` GitHub organization | 3 |
| SD-MAS-002 | Simulation Domain Setup | Configure `*.possible.ehg.dev` wildcard DNS | 5 |
| SD-MAS-003 | Simulation DB Namespace | Create `schema_sim_*` namespace convention in Supabase | 5 |
| SD-MAS-004 | Epistemic Tagging Schema | Implement `epistemic_status` field across artifact tables | 8 |
| SD-MAS-005 | TTL System | Auto-archive logic for expired simulations | 7 |
| SD-MAS-006 | Simulation Metadata Table | `simulation_artifacts` table with full tracking | 6 |
| SD-MAS-007 | GitHub API Integration | Auth and permissions for simulation org | 6 |

**Exit Criteria:** Infrastructure ready to receive simulated artifacts

### Phase 2: Simulation Scaffolder (Jan 6 – Jan 12) — 35 SDs

| SD | Title | Description | SDs |
|----|-------|-------------|-----|
| SD-MAS-008 | Repo Template System | Venture scaffold templates (Next.js, API, etc.) | 8 |
| SD-MAS-009 | `gh repo create` Automation | Create repos in `ehg-simulations/` org | 7 |
| SD-MAS-010 | Git Init + Initial Commit | Automated first push with template | 5 |
| SD-MAS-011 | Schema Template Library | Pre-validated table patterns for ventures | 8 |
| SD-MAS-012 | Migration Generator | JSON schema → SQL migration files | 7 |

**Exit Criteria:** Script takes venture config → simulation repo + schema exist

### Phase 3: Ephemeral Deploy (Jan 13 – Jan 19) — 35 SDs

| SD | Title | Description | SDs |
|----|-------|-------------|-----|
| SD-MAS-013 | Vercel Simulation Project | Ephemeral deployment target | 6 |
| SD-MAS-014 | Deploy Automation | Repo → Live URL pipeline | 8 |
| SD-MAS-015 | Watermark Overlay | "SIMULATION" banner on all preview URLs | 5 |
| SD-MAS-016 | Health Check Endpoint | `/health` returns 200 with simulation metadata | 4 |
| SD-MAS-017 | Cost Cap Enforcement | Budget limits on simulation infrastructure | 5 |
| SD-MAS-018 | Garbage Collection | Stage 3 rejection → destroy infrastructure | 7 |

**Exit Criteria:** Script takes config → deployed simulation URL with watermark

---

## Sprint 2: The Dreamcatcher (Aquarius)

**Duration:** 20 days (Jan 20 – Feb 8)
**Capacity:** 140 SDs
**Theme:** Build the intelligence layer (Text-to-Simulation)

### Phase 1: PRD Generation (Jan 20 – Jan 26) — 45 SDs

| SD | Title | Description | SDs |
|----|-------|-------------|-----|
| SD-DRM-001 | Venture Seed Parser | Raw text → structured intake | 8 |
| SD-DRM-002 | PRD Template Engine | Stage 1-2 artifact generation | 10 |
| SD-DRM-003 | Problem/Solution Extraction | NLP extraction from seed text | 8 |
| SD-DRM-004 | Requirements Generator | Functional requirements from seed | 10 |
| SD-DRM-005 | PRD Validator | Quality gates for generated PRD | 9 |

**Exit Criteria:** Text input → valid PRD artifact (official, Stage 1-2)

### Phase 2: Schema/Repo Simulation (Jan 27 – Feb 2) — 50 SDs

| SD | Title | Description | SDs |
|----|-------|-------------|-----|
| SD-DRM-006 | PRD-to-Schema Intelligence | Extract data model from PRD | 12 |
| SD-DRM-007 | Schema Generator | PRD → SQL tables with relationships | 10 |
| SD-DRM-008 | RLS Policy Generator | Auto-generate security policies | 8 |
| SD-DRM-009 | PRD-to-Repo Intelligence | Extract tech requirements from PRD | 8 |
| SD-DRM-010 | Repo Customizer | Template + PRD → customized scaffold | 12 |

**Exit Criteria:** PRD → simulated schema + repo (tagged as simulation)

### Phase 3: EVA + Approval Gate (Feb 3 – Feb 8) — 45 SDs

| SD | Title | Description | SDs |
|----|-------|-------------|-----|
| SD-DRM-011 | `/ratify` Command | CLI command for Contract of Pain | 8 |
| SD-DRM-012 | Approval Prompt UI | "Will you do the work?" display | 6 |
| SD-DRM-013 | Venture Creation Flow | Post-ratify venture instantiation | 10 |
| SD-DRM-014 | Stage Scheduler | Auto-schedule Stage 3 kill gate | 6 |
| SD-DRM-015 | EVA Integration | Connect simulation to EVA orchestration | 10 |
| SD-DRM-016 | Simulation Summary Generator | "Possible Future" display output | 5 |

**Exit Criteria:** Full Genesis flow works end-to-end (text → simulation → ratify → venture)

---

## Sprint 3: The Mirror (Pisces)

**Duration:** 5 days (Feb 9 – Feb 13)
**Capacity:** 80 SDs
**Theme:** Integration, elevation logic, and testing

**HARD CONSTRAINT:** No new logic after Feb 10 (Mercury Shadow)

### Integration (Feb 9 – Feb 10) — 35 SDs

| SD | Title | Description | SDs |
|----|-------|-------------|-----|
| SD-MIR-001 | End-to-End Pipeline | Dreamcatcher → Mason integration | 12 |
| SD-MIR-002 | Error Recovery | Graceful handling of generation failures | 8 |
| SD-MIR-003 | Retry Logic | Idempotent re-execution of failed steps | 8 |
| SD-MIR-004 | CLI Status Command | `leo status` for simulation display | 7 |

### Elevation Logic (Feb 10 – Feb 11) — 25 SDs

| SD | Title | Description | SDs |
|----|-------|-------------|-----|
| SD-MIR-005 | Stage 16 Elevation | Schema simulation → production copy | 10 |
| SD-MIR-006 | Stage 17 Elevation | Repo simulation → production fork | 10 |
| SD-MIR-007 | Elevation Audit Trail | Log all elevation decisions with Chairman signature | 5 |

### Reflex Testing (Feb 11 – Feb 13) — 20 SDs

| SD | Title | Description | SDs |
|----|-------|-------------|-----|
| SD-MIR-008 | Happy Path Testing | Full flow success scenarios | 8 |
| SD-MIR-009 | Failure Mode Testing | Error handling validation | 7 |
| SD-MIR-010 | Edge Case Testing | Unusual inputs, timeouts, etc. | 5 |

**Exit Criteria:** System ready for Genesis ritual

---

## Genesis Day: February 14, 2026

### Pre-Ritual Checklist (Feb 13, evening)

- [ ] All systems green
- [ ] Simulation infrastructure verified
- [ ] Dreamcatcher pipeline tested
- [ ] `/ratify` command working
- [ ] Venture Genesis-001 seed prepared
- [ ] Monitoring dashboards ready
- [ ] Rollback procedures documented

### Ritual Timeline (Feb 14)

| Time | Action |
|------|--------|
| 08:30 | Systems health check |
| 08:45 | Final seed review |
| 09:00 | **THE COLLAPSE** — Execute ritual |
| 09:15 | Verify simulation artifacts |
| 09:30 | Verify venture created at Stage 1 |
| 10:00 | Document results |

### Post-Ritual Validation

- [ ] PRD generated (official)
- [ ] Schema generated (simulation)
- [ ] Repo scaffolded (simulation)
- [ ] Live URL deployed (simulation)
- [ ] Venture at Stage 1
- [ ] Stage 3 kill gate scheduled
- [ ] All epistemic tags correct
- [ ] Watermarks displaying
- [ ] TTL countdown active

---

## Risk Mitigation

### Technical Risks

| Risk | Mitigation | Owner |
|------|------------|-------|
| Schema generation quality | PRD Validator + human review option | Dreamcatcher |
| GitHub API rate limits | Caching, retry logic | Mason |
| Deployment failures | Fallback to manual scaffold | Mason |
| LLM hallucination | Structured output validation | Dreamcatcher |

### Timeline Risks

| Risk | Mitigation |
|------|------------|
| Sprint 1 overrun | Buffer in Sprint 2 |
| Sprint 2 overrun | Reduce Sprint 3 scope to essentials |
| Feb 10 deadline miss | Defer promotion logic to post-Genesis |

### Fallback Plan

If not ready by Feb 14:
1. Execute "Option A" (PRD-only Genesis)
2. Schema/Repo generation becomes post-ritual enhancement
3. Preserve ritual significance with reduced scope

---

## Success Metrics

### Sprint 1 Exit
- [ ] Simulation org exists
- [ ] Simulation domain resolves
- [ ] Simulation schema namespace works
- [ ] TTL system functional
- [ ] Garbage collection tested

### Sprint 2 Exit
- [ ] Text → PRD works
- [ ] PRD → Schema works
- [ ] PRD → Repo works
- [ ] `/ratify` command works
- [ ] Venture creation works

### Sprint 3 Exit
- [ ] End-to-end flow works
- [ ] Elevation logic works (Stage 16/17)
- [ ] Error recovery works
- [ ] CLI status works

### Genesis Success
- [ ] Ritual completes without errors
- [ ] All artifacts generated
- [ ] Venture enters pipeline
- [ ] Team celebrates

---

## Appendix: SD Naming Convention

```
SD-MAS-###  = Mason Sprint (Infrastructure)
SD-DRM-###  = Dreamcatcher Sprint (Intelligence)
SD-MIR-###  = Mirror Sprint (Integration)
```

---

*Roadmap generated: December 29, 2025*
*Aligned with Genesis Oath v3*
