# Brainstorm: UI Cloner SRIP Integration for 25-Stage Venture Workflow

## Metadata
- **Date**: 2026-03-14
- **Domain**: Venture
- **Phase**: MVP
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Chairman Review**: 2 items reviewed, 1 accepted, 1 flagged (browser automation reliability), 0 research-needed
- **Source**: EVA Intake (Todoist/YouTube item 5696e572) + GitHub repo review
- **Reference**: https://github.com/ragnar-pwninskjold/tech-snacks/tree/main/ui-cloner

---

## Problem Statement
The 25-stage venture workflow currently has no systematic approach to UI design sourcing. When a new venture reaches the design stage, there's no structured process for finding design inspiration, deconstructing it, and adapting it to the venture's brand. This leads to ad-hoc design decisions and slower time-to-prototype.

Sean Kochel's SRIP (Site Replication Intelligence Protocol) provides a proven 4-phase pipeline: Forensic Audit → Brand Interview → Synthesis → Quality Check. The chairman wants to rebuild this for EHG's DB-first architecture and integrate it into the venture workflow.

## Discovery Summary

### SRIP Pipeline (from GitHub review)
6 Claude Code skills totaling ~50KB of prompts:
1. **Forensic Audit** (9 steps): Macro architecture, design tokens, section blueprints, visual compositions, animation timelines, micro-interactions, component behaviors, scroll choreography, tech stack + motion philosophy
2. **Brand Interview** (12 questions): Product identity, audience, brand feeling, colors, sections, headline, CTA, differentiator, animation intensity, tech stack, assets, section modifications
3. **Synthesis** (11 rules): Merges Site DNA + brand into a one-shot replication prompt with embedded artifacts
4. **Quality Check**: Multi-domain fidelity checklist (layout, visual composition, animation, interaction, design system, technical)
5. **Iterator**: 5-pass refinement loop for post-build corrections

### Integration Decision
Chairman chose **Path B: Rebuild for EHG** — adapt SRIP concept into EVA/venture pipeline with DB-first architecture, not adopt as standalone skills.

## Analysis

### Arguments For
- Compresses venture design from weeks to days
- Every cloned UI becomes training data for the next venture (design corpus)
- Natural shared service for Genesis platform
- Existing EVA/LEO infrastructure handles 60% of orchestration
- Pre-populates Brand Interview from existing venture DB data

### Arguments Against
- Browser automation (Playwright) is flaky on dynamic SPAs
- Rick isn't a designer — who validates AI forensics output?
- SRIP validates fidelity to reference, not fitness for venture's market
- 6-8 weeks investment, capability could be commoditized

## Team Perspectives

### Challenger
- **Blind Spots**: Designer-as-bottleneck (Rick is non-designer), competitive moat evaporation (6-12 months), integration tax on vision phase
- **Assumptions at Risk**: Fidelity scores ≠ venture success; 9-step audit may not generalize across verticals
- **Worst Case**: Ships, consumes 40 hours, produces prompts requiring 3-5 iterations each, gets shelved

### Visionary
- **Opportunities**: Brand velocity engine for Stages 1-3; cross-venture design compounding; shared service platform accelerator
- **Synergies**: EVA intake gets brand reference archetype; chairman vision gets raw materials; LEO gates validate design fidelity
- **Upside**: 10x design velocity, Genesis "Design in 48 Hours" differentiator, proprietary pattern corpus

### Pragmatist
- **Feasibility**: 7/10
- **Resources**: 6-8 weeks (LEAD 1w, PLAN 2w, EXEC 3-4w), Playwright, 4 new Supabase tables
- **Constraints**: Browser automation flakiness, human-in-the-loop bottleneck, HEAL scoring integration complexity
- **Recommended Path**: Week 1 define Site DNA schema + pilot sites, Week 2 architect Phase 1, Week 3-4 implement forensic audit, then pause to validate

### Synthesis
- **Consensus**: Viable to rebuild, brand data should pre-populate from venture DB
- **Tension**: "Pretty mockups faster" vs "discover ventures faster"
- **Composite Risk**: Medium

## Chairman Review Flags
- **Technical Feasibility** (FLAGGED): Browser automation (Playwright) on dynamic SPAs will have reliability issues. Include fallback mechanisms and manual screenshot support in architecture.

## Open Questions
- Which venture stages specifically trigger SRIP? (Design stage, or earlier during validation?)
- Should Site DNA be stored per-venture or as a shared reference library?
- How does SRIP output connect to the existing frontend-design skill?

## Suggested Next Steps
- Create vision + architecture documents
- Target: Phase 1 (Forensic Audit EVA module) as first SD
- Pilot on 2-3 reference sites of varying complexity
