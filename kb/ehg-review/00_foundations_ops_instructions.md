# 00_foundations_ops_instructions.md

## Why This Matters
This document establishes the foundational principles, operating instructions, and shared vocabulary for the ExecHoldings Global (EHG) platform. It serves as the North Star for all strategic decisions, technical implementations, and operational procedures across the organization.

---

## Operating Instructions

### Purpose
The EHG Knowledge Base serves as the single source of truth for:
- Strategic direction and mission alignment
- Technical architecture and implementation standards
- Operational procedures and governance frameworks
- Agent roles, responsibilities, and workflows
- Performance metrics and quality gates

### Rigor Standards
All knowledge base content must meet these standards:
- **Accuracy**: Validated against source systems (database, code, documentation)
- **Completeness**: Cover all critical aspects without gaps
- **Clarity**: Written for both technical and business audiences
- **Currency**: Updated quarterly or upon major system changes
- **Consistency**: Uniform terminology and formatting across documents

### Style Guide
- Use clear, concise language
- Include "Why This Matters" introduction for each major section
- Provide concrete examples where applicable
- Cross-reference related documents with anchors
- End with "Sources of Truth" and timestamp

### Refresh Cadence
- **Quarterly**: Full review and update cycle
- **Monthly**: Critical updates for active development
- **Ad-hoc**: Major feature releases or strategy changes
- **Automated**: Database-driven content via scripts

---

## Mission

### Core Purpose
Transform startup ideas into validated, scalable, and strategically aligned ventures through **AI-driven automation, EVA orchestration, and Chairman-guided oversight**. The Chairman is the ONLY human in the entire system - all other roles (Board of Directors, CEOs, executives) are AI agents. By combining a **40-stage venture workflow**, intelligent agents, and adaptive strategic systems, EHG ensures startups evolve with precision — from idea inception to global scaling.

### Mission Components
1. **AI-Driven Automation**: Leverage cutting-edge AI to automate routine tasks and augment decision-making
2. **EVA Orchestration**: Intelligent assistant that learns, adapts, and orchestrates the entire venture lifecycle
3. **Chairman-Guided Oversight**: Human-in-the-loop for strategic decisions and quality control
4. **40-Stage Workflow**: Comprehensive framework from ideation to exit
5. **Adaptive Systems**: Continuous learning and improvement based on outcomes

---

## Core Principles

### 1. Database-First Architecture
- All critical data lives in Supabase databases
- No filesystem storage for strategic directives or PRDs
- Real-time synchronization across all systems
- Single source of truth for all operations

### 2. Quality Gates & Control Points
- Mandatory handoff checklists between agents
- Minimum quality threshold of 85% for progression
- Automated validation and remediation
- Exception process for blocked handoffs

### 3. Boundary Enforcement
- Strict separation between applications (EHG vs EHG_Engineer)
- Clear agent role boundaries (LEAD, PLAN, EXEC)
- Scope control to prevent feature creep
- Creative freedom within defined constraints

### 4. Continuous Improvement
- EVA learns from every Chairman decision
- Quarterly recalibration of scoring rubrics
- Feedback loops at every stage
- Performance metrics drive optimization

### 5. Portfolio Scale
- Manage 3-5 ventures simultaneously
- 80% reduction in operational overhead
- Shared resources and learnings across ventures
- Strategic coordination through Command Center

---

## Chairman Preferences

### Strategic Focus
- **Consolidated Directives**: Group related items into single SDs
- **Minimal Priority**: Focus on high-impact, low-complexity items first
- **Clear Objectives**: Measurable success criteria for every initiative
- **Rapid Iteration**: Quick validation cycles over perfect planning

### Operational Preferences
- **Dashboard-Driven**: Visual monitoring over detailed reports
- **Exception-Based**: Only surface issues requiring intervention
- **Voice-First**: Natural language interaction with EVA
- **Mobile-Optimized**: Full functionality from any device

### Decision Framework
- **Data-Driven**: Decisions backed by metrics and evidence
- **Risk-Aware**: Explicit risk assessment and mitigation
- **Exit-Oriented**: Design for acquisition or scale from day one
- **Portfolio Thinking**: Optimize across ventures, not individually

---

## Glossary

### Core Terms

**EVA (Executive Virtual Assistant)**
- AI-powered orchestration engine
- Learns from Chairman decisions
- Manages 40-stage workflow
- Natural language interface

**LEO Protocol**
- Standardized agent interaction framework
- Currently v4.1.2 (database-first)
- Defines roles, handoffs, and quality gates
- Enforces boundaries and validation

**SDIP (Strategic Directive Intelligent Processing)**
- Automated intake system for directives
- Gate progression tracking
- Intent analysis and validation
- SD creation from submissions

**Strategic Directive (SD)**
- High-level business objective
- Created by LEAD agent or SDIP
- Contains success criteria and constraints
- Tracked in strategic_directives_v2 table

**Product Requirements Document (PRD)**
- Technical specification from SD
- Created by PLAN agent
- Includes test plans and acceptance criteria
- Defines implementation scope for EXEC

**Handoff**
- Formal transfer between agents
- Requires 7-9 checkpoint validations
- Includes context summary (500 tokens)
- Tracked in database for audit

**Sub-Agent**
- Specialized expert within EXEC
- Triggered by keywords or patterns
- Domains: Design, Security, Performance, Testing, Database
- Provides deep expertise in specific areas

**Quality Gate**
- Validation checkpoint in workflow
- Minimum 85% score to proceed
- Automated scoring via EVA
- Remediation for failed gates

**Backlog Item**
- Specific task within an SD
- Mapped in sd_backlog_map table
- Contains KPIs and acceptance criteria
- Priority: Very High, High, Medium, Low

**Command Center**
- Chairman's portfolio dashboard
- Real-time venture monitoring
- Exception alerts and interventions
- Strategic decision support

---

## Index

### Knowledge Base Documents
1. **[00_foundations_ops_instructions.md](#)** (this document) - Operating instructions, mission, principles
2. **[01_vision_ehg_eva.md](01_vision_ehg_eva.md)** - EHG vision, platform vision, EVA capabilities
3. **[02_architecture_boundaries.md](02_architecture_boundaries.md)** - System architecture, boundaries, components
4. **[03_leo_protocol_roles_workflow.md](03_leo_protocol_roles_workflow.md)** - LEO protocol, agent roles, 40-stage workflow
5. **[04_governance_kpis_prompts.md](04_governance_kpis_prompts.md)** - Governance, KPIs, prompt library

### Quick Links
- [Mission](#mission)
- [Core Principles](#core-principles)
- [Chairman Preferences](#chairman-preferences)
- [Glossary](#glossary)
- [40-Stage Workflow](03_leo_protocol_roles_workflow.md#40-stage-workflow)
- [EVA KPIs](01_vision_ehg_eva.md#eva-kpis)
- [Stage KPIs Table](04_governance_kpis_prompts.md#stage-kpis-table)

### External References
- Database: `dedlbzhpgkmetvhbkyzq.supabase.co`
- EHG App: `/mnt/c/_EHG/ehg`
- EHG_Engineer: `/mnt/c/_EHG/EHG_Engineer`
- Mission Source: `/mnt/c/Users/rickf/Dropbox/_EHG/_EHG/Mission_v3.txt`

---

## Sources of Truth
- **Mission & Principles**: Mission_v3.txt
- **Database Schema**: Supabase (strategic_directives_v2, sd_backlog_map, directive_submissions)
- **LEO Protocol**: Database table leo_protocols (active: v4.1.2_database_first)
- **Agent Definitions**: CLAUDE.md (generated from database)
- **Workflow Stages**: stages.yaml (EHG repo)

**Last updated**: 2025-01-14