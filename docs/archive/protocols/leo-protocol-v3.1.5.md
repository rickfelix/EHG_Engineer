---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# The LEO Protocol (Version 3.1.5.9 - Vision QA System Integration)


## Table of Contents

- [Executive Summary](#executive-summary)
- [1. Communication Standards Framework (MANDATORY - v3.1.5 - ENHANCED)](#1-communication-standards-framework-mandatory---v315---enhanced)
  - [1.1. Universal Communication Requirements](#11-universal-communication-requirements)
  - [1.2. PRD Reference Requirements](#12-prd-reference-requirements)
  - [1.3. Strategic Directive Context Requirements](#13-strategic-directive-context-requirements)
  - [1.4. Communication Compliance Enforcement](#14-communication-compliance-enforcement)
- [2. Implementation Methodology Framework (MANDATORY - v3.1.4 - UNCHANGED)](#2-implementation-methodology-framework-mandatory---v314---unchanged)
  - [2.1. Completion-Driven Approach Requirements](#21-completion-driven-approach-requirements)
- [3. Adaptive Verification Framework (NEW - v3.1.5)](#3-adaptive-verification-framework-new---v315)
  - [3.1. Framework Overview](#31-framework-overview)
  - [3.2. Three-Tier Verification System](#32-three-tier-verification-system)
  - [3.3. PLAN Agent Verification Workflow](#33-plan-agent-verification-workflow)
  - [3.4. EXEC Agent Completion Report Enhancement](#34-exec-agent-completion-report-enhancement)
  - [3.5. Integration with Existing LEO Protocol Components](#35-integration-with-existing-leo-protocol-components)
  - [3.6. Success Metrics and Continuous Improvement](#36-success-metrics-and-continuous-improvement)
- [8. Proactive Governance Framework (v3.1.4 - UNCHANGED)](#8-proactive-governance-framework-v314---unchanged)
  - [8.1. Framework Overview](#81-framework-overview)
  - [8.2. Expected PRD Registry System](#82-expected-prd-registry-system)
  - [8.3. Dependency Gap Monitor System](#83-dependency-gap-monitor-system)
  - [8.4. Proactive Monitoring Cycles](#84-proactive-monitoring-cycles)
  - [8.5. Periodic Infrastructure Audits (NEW - Lesson from SD-012)](#85-periodic-infrastructure-audits-new---lesson-from-sd-012)
- [9. Strategic Directive Lifecycle Management (v3.1.4 - ENHANCED)](#9-strategic-directive-lifecycle-management-v314---enhanced)
  - [9.1. Database Status Update Requirements](#91-database-status-update-requirements)
  - [9.1.4. Cascade Closure Protocol (NEW - CRITICAL DATABASE INTEGRITY REQUIREMENT)](#914-cascade-closure-protocol-new---critical-database-integrity-requirement)
  - [Cascade Closure Verification Report](#cascade-closure-verification-report)
- [9.2. EES Naming Standards (NEW - v3.1.5.3)](#92-ees-naming-standards-new---v3153)
  - [9.2.1. Standard EES Identifier Format](#921-standard-ees-identifier-format)
  - [9.2.2. Naming Convention Rules](#922-naming-convention-rules)
  - [9.2.3. Database Integrity Requirements](#923-database-integrity-requirements)
  - [9.2.4. Implementation Guidelines](#924-implementation-guidelines)
  - [9.2.5. Verification Requirements](#925-verification-requirements)
- [9.3. Strategic Directive Naming Standards (NEW - v3.1.5.4)](#93-strategic-directive-naming-standards-new---v3154)
  - [9.3.1. Standard Strategic Directive Identifier Format](#931-standard-strategic-directive-identifier-format)
  - [9.3.2. Naming Convention Rules](#932-naming-convention-rules)
  - [9.3.3. Implementation Requirements](#933-implementation-requirements)
  - [9.3.4. Rationale and Benefits](#934-rationale-and-benefits)
  - [9.3.5. Verification Requirements](#935-verification-requirements)
  - [9.3.6. Integration with EES Naming](#936-integration-with-ees-naming)
- [10. Agent Workflow Updates for Adaptive Verification (v3.1.5)](#10-agent-workflow-updates-for-adaptive-verification-v315)
  - [10.1. Enhanced EXEC Agent Workflow](#101-enhanced-exec-agent-workflow)
  - [10.2. Enhanced PLAN Agent Workflow](#102-enhanced-plan-agent-workflow)
  - [10.3. Enhanced HUMAN Oversight](#103-enhanced-human-oversight)
- [10.4. Pre-Implementation Validation Protocol (NEW - Lesson from T-GAV-01)](#104-pre-implementation-validation-protocol-new---lesson-from-t-gav-01)
  - [10.4.1. Purpose and Mandate](#1041-purpose-and-mandate)
  - [10.4.2. PLAN Agent Responsibility: Prerequisite Manifest](#1042-plan-agent-responsibility-prerequisite-manifest)
  - [10.4.3. EXEC Agent Responsibility: Pre-Flight Check](#1043-exec-agent-responsibility-pre-flight-check)
- [10.5. Database Integrity Verification Protocol (NEW - Critical Incident Response)](#105-database-integrity-verification-protocol-new---critical-incident-response)
  - [10.5.1. Purpose and Mandate](#1051-purpose-and-mandate)
  - [10.5.2. Mandatory Verification Gates](#1052-mandatory-verification-gates)
  - [Database Verification Confirmation](#database-verification-confirmation)
  - [10.5.3. Database Verification Scripts and Tools](#1053-database-verification-scripts-and-tools)
  - [10.5.4. Incident Response and Continuous Improvement](#1054-incident-response-and-continuous-improvement)
  - [10.5.5. Integration with Existing Frameworks](#1055-integration-with-existing-frameworks)
- [10.6. Technical Debt Management (NEW)](#106-technical-debt-management-new)
  - [10.6.1. Purpose and Mandate](#1061-purpose-and-mandate)
  - [10.6.2. The Technical Debt Registry](#1062-the-technical-debt-registry)
  - [10.6.3. Agent Responsibilities](#1063-agent-responsibilities)
- [11. Vision QA System Integration (NEW - v3.1.5.9)](#11-vision-qa-system-integration-new---v3159)
  - [11.1. Purpose and Mandate](#111-purpose-and-mandate)
  - [11.2. Vision QA Trigger Requirements](#112-vision-qa-trigger-requirements)
  - [11.3. Vision QA Evidence Requirements](#113-vision-qa-evidence-requirements)
  - [11.4. Automatic Model Selection Protocol](#114-automatic-model-selection-protocol)
  - [11.5. Quality Gate Enhancement with Vision QA](#115-quality-gate-enhancement-with-vision-qa)
  - [11.6. Communication Enhancement for Vision QA](#116-communication-enhancement-for-vision-qa)
- [12. Version History and Migration](#12-version-history-and-migration)
  - [12.1. Version History](#121-version-history)
- [13. Gap-Referenced Artifact Standards (NEW - v3.1.5.6)](#13-gap-referenced-artifact-standards-new---v3156)
  - [13.1. Purpose and Mandate](#131-purpose-and-mandate)
  - [13.2. Requirements by Artifact Type](#132-requirements-by-artifact-type)
  - [12.3. Formatting Standards](#123-formatting-standards)
  - [12.4. Compliance and Validation](#124-compliance-and-validation)
  - [12.5. Backward Compatibility and Migration](#125-backward-compatibility-and-migration)

**Status: ACTIVE - Vision QA System Integration with Autonomous UI Testing**
**Last Updated: January 30, 2025 - Integrates Vision-Based QA System with automatic model selection**
**Previous Version: 3.1.5.8 (Test-ID Standardization + EXEC-Primary Git)**

This document represents an enhancement to LEO Protocol v3.1.5.3, adding mandatory Strategic Directive Naming Standards for all new directives while preserving existing SD names for system stability. The standard format SD-YYYY-MM-DD-[X] ensures chronological ordering and consistency for future Strategic Directives, complementing the successfully implemented EES naming standards to create a fully consistent naming ecosystem.

---

## Executive Summary

LEO Protocol v3.1.5 introduces the **Adaptive Verification Framework** and **Enhanced Communication Standards**, addressing the need for flexible yet rigorous verification processes and comprehensive reference file documentation across all agent communications. The enhancement maintains all existing v3.1.4 capabilities while optimizing verification efficiency and ensuring complete context availability.

**Core Enhancements**:
1. **Cascade Closure Protocol**: Mandatory cascade closure of all associated EES items when Strategic Directives are marked archived/completed, preventing orphaned execution sequences
2. **Database Integrity Verification Protocol**: Mandatory immediate verification of all database status updates through direct database queries
3. **Enhanced Communication Standards**: Mandatory reference file documentation for all agent roles (LEAD, PLAN, EXEC) with comprehensive file path requirements
4. **EES Naming Standards**: Mandatory standardized naming convention (EES-[SD-ID]-[NN]) for all Epic Execution Sequences - successfully implemented for all 87 existing items
5. **Strategic Directive Naming Standards**: Mandatory naming convention (SD-YYYY-MM-DD-[X]) for all new Strategic Directives while preserving existing names for system stability
6. **Tiered Adaptive Verification**: Three-tier verification system balancing quality assurance with operational efficiency
7. **Risk-Based Assessment Protocol**: PLAN agent discretion in verification depth based on implementation risk profiles
8. **Flexible Evidence Standards**: Multiple acceptable formats for verification evidence to accommodate diverse implementation approaches
9. **Maintained Quality Gates**: Preservation of critical 85+ quality thresholds and enterprise-grade standards

---

## 1. Communication Standards Framework (MANDATORY - v3.1.5 - ENHANCED)

### 1.1. Universal Communication Requirements

**MANDATORY**: All agent communications within the LEO Protocol framework MUST adhere to the following standardized format. This applies to ALL handoffs, status updates, reports, and inter-agent communications across ALL agent roles (LEAD, PLAN, EXEC).

#### 1.1.1. Required Communication Header Format

**Every Communication Must Include**:
```markdown
**To:** [Recipient Agent Role/HUMAN]
**From:** [Sending Agent Role]  
**Protocol:** LEO Protocol v3.1.5 (Adaptive Verification Framework)
**Strategic Directive:** [SD-ID]: [Strategic Directive Title]
**Strategic Directive Path:** `[full-path-to-SD]`
**Related PRD:** [PRD-ID]
**Related PRD Path:** `[full-path-to-PRD]`
```

#### 1.1.2. Mandatory Reference Files Section

**ALL COMMUNICATIONS MUST INCLUDE**: Following the header, every communication must include a "Reference Files Required" section listing all relevant documentation paths.

**Standard Reference Files Section Format**:
```markdown
**Reference Files Required**:
- `[full-path-to-strategic-directive]` (Strategic Directive)
- `[full-path-to-PRD]` (Product Requirements Document)
- `[full-path-to-leo-protocol]` (LEO Protocol v3.1.5)
- `[additional-reference-files-as-needed]` (Context-specific documentation)
```

#### 1.1.3. Agent-Specific Communication Requirements

**LEAD Agent Communications**:
```markdown
**Required Header Elements**:
- Strategic Directive path (from database query, not file analysis)
- Related PRD path (current version)
- Execution sequence context when applicable

**Required Reference Files**:
- Strategic Directive document: `docs/wbs_artefacts/strategic_directives/[SD-ID].md`
- Related PRD document: `docs/product-requirements/[PRD-ID].md`
- LEO Protocol: `docs/03_protocols_and_standards/leo_protocol_v3.1.5.md`
- Database query results or execution order context (when prioritizing)
- Any architectural blueprints or strategic frameworks referenced

**Example LEAD Communication**:
```markdown
**To:** PLAN Agent
**From:** LEAD Agent
**Protocol:** LEO Protocol v3.1.5 (Adaptive Verification Framework)
**Strategic Directive:** SD-012: Growth Acceleration and Scale Operations
**Strategic Directive Path:** `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md`
**Related PRD:** SD-012-PRD-growth-acceleration
**Related PRD Path:** `docs/product-requirements/SD-012-PRD-growth-acceleration.md`

**Reference Files Required**:
- `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md` (Strategic Directive)
- `docs/product-requirements/SD-012-PRD-growth-acceleration.md` (PRD Requirements)
- `docs/03_protocols_and_standards/leo_protocol_v3.1.5.md` (Protocol Compliance)
- `docs/strategic-operations/expected-prd-registry.json` (Dependency Context)
```

**PLAN Agent Communications**:
```markdown
**Required Header Elements**:
- Strategic Directive path and current phase/sequence
- Related PRD path with version specification
- Task or EES context when applicable

**Required Reference Files**:
- Strategic Directive document: `docs/wbs_artefacts/strategic_directives/[SD-ID].md`
- Related PRD document: `docs/product-requirements/[PRD-ID].md`
- LEO Protocol: `docs/03_protocols_and_standards/leo_protocol_v3.1.5.md`
- Current execution sequence documentation (when applicable)
- Any verification reports, test plans, or validation documents
- Cross-SD integration documentation (when relevant)

**Example PLAN Communication**:
```markdown
**To:** EXEC Agent
**From:** PLAN Agent
**Protocol:** LEO Protocol v3.1.5 (Adaptive Verification Framework)
**Strategic Directive:** SD-012: Growth Acceleration and Scale Operations
**Strategic Directive Path:** `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md`
**Related PRD:** SD-012-PRD-growth-acceleration
**Related PRD Path:** `docs/product-requirements/SD-012-PRD-growth-acceleration.md`

**Reference Files Required**:
- `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md` (Strategic Directive)
- `docs/product-requirements/SD-012-PRD-growth-acceleration.md` (PRD Requirements)
- `docs/03_protocols_and_standards/leo_protocol_v3.1.5.md` (Protocol Compliance)
- `docs/testing/T-GAV-03-E2E-Workflow-Test-Plan.md` (Task Specifications)
- `docs/validation/T-GAV-02-Market-Validation-Report.md` (Implementation Context)
```

**EXEC Agent Communications**:
```markdown
**Required Header Elements**:
- Strategic Directive path and current implementation phase
- Related PRD path with specific requirement sections
- Task completion status and verification context

**Required Reference Files**:
- Strategic Directive document: `docs/wbs_artefacts/strategic_directives/[SD-ID].md`
- Related PRD document: `docs/product-requirements/[PRD-ID].md`
- LEO Protocol: `docs/03_protocols_and_standards/leo_protocol_v3.1.5.md`
- Implementation artifacts and completion evidence
- Test results, performance reports, or validation documentation
- Any architectural decisions or technical documentation created

**Example EXEC Communication**:
```markdown
**To:** PLAN Agent
**From:** EXEC Agent
**Protocol:** LEO Protocol v3.1.5 (Adaptive Verification Framework)
**Strategic Directive:** SD-012: Growth Acceleration and Scale Operations
**Strategic Directive Path:** `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md`
**Related PRD:** SD-012-PRD-growth-acceleration
**Related PRD Path:** `docs/product-requirements/SD-012-PRD-growth-acceleration.md`

**Reference Files Required**:
- `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md` (Strategic Directive)
- `docs/product-requirements/SD-012-PRD-growth-acceleration.md` (PRD Requirements)
- `docs/03_protocols_and_standards/leo_protocol_v3.1.5.md` (Protocol Compliance)
- `docs/validation/T-GAV-03-Final-Validation-Report.md` (Completion Evidence)
- `docs/testing/T-GAV-03-E2E-Test-Results.md` (Technical Validation)
- `docs/retrospectives/T-GAV-04-JSON-Serialization-Solution.md` (Implementation Learnings)
```

#### 1.1.4. Communication Header Examples (Enhanced)

**Example 1: LEAD to PLAN Strategic Handoff**:
```markdown
**To:** PLAN Agent
**From:** LEAD Agent
**Protocol:** LEO Protocol v3.1.5 (Adaptive Verification Framework)
**Strategic Directive:** SD-012: Growth Acceleration and Scale Operations
**Strategic Directive Path:** `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md`
**Related PRD:** SD-012-PRD-growth-acceleration
**Related PRD Path:** `docs/product-requirements/SD-012-PRD-growth-acceleration.md`

**Reference Files Required**:
- `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md` (Strategic Directive)
- `docs/product-requirements/SD-012-PRD-growth-acceleration.md` (PRD Requirements)
- `docs/03_protocols_and_standards/leo_protocol_v3.1.5.md` (Protocol Compliance)
- `docs/strategic-operations/expected-prd-registry.json` (Dependency Context)
```

**Example 2: PLAN to EXEC Task Assignment**:
```markdown
**To:** EXEC Agent
**From:** PLAN Agent
**Protocol:** LEO Protocol v3.1.5 (Adaptive Verification Framework)
**Strategic Directive:** SD-012: Growth Acceleration and Scale Operations
**Strategic Directive Path:** `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md`
**Related PRD:** SD-012-PRD-growth-acceleration
**Related PRD Path:** `docs/product-requirements/SD-012-PRD-growth-acceleration.md`

**Reference Files Required**:
- `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md` (Strategic Directive)
- `docs/product-requirements/SD-012-PRD-growth-acceleration.md` (PRD Requirements)
- `docs/03_protocols_and_standards/leo_protocol_v3.1.5.md` (Protocol Compliance)
- `docs/testing/T-GAV-03-E2E-Workflow-Test-Plan.md` (Task Specifications)
- `docs/validation/T-GAV-02-Market-Validation-Report.md` (Implementation Context)
```

**Example 3: EXEC to PLAN Completion Report**:
```markdown
**To:** PLAN Agent
**From:** EXEC Agent
**Protocol:** LEO Protocol v3.1.5 (Adaptive Verification Framework)
**Strategic Directive:** SD-012: Growth Acceleration and Scale Operations
**Strategic Directive Path:** `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md`
**Related PRD:** SD-012-PRD-growth-acceleration
**Related PRD Path:** `docs/product-requirements/SD-012-PRD-growth-acceleration.md`

**Reference Files Required**:
- `docs/wbs_artefacts/strategic_directives/SD-012-Growth-Scale.md` (Strategic Directive)
- `docs/product-requirements/SD-012-PRD-growth-acceleration.md` (PRD Requirements)
- `docs/03_protocols_and_standards/leo_protocol_v3.1.5.md` (Protocol Compliance)
- `docs/validation/T-GAV-03-Final-Validation-Report.md` (Completion Evidence)
- `docs/testing/T-GAV-03-E2E-Test-Results.md` (Technical Validation)
- `docs/retrospectives/T-GAV-04-JSON-Serialization-Solution.md` (Implementation Learnings)
```

### 1.2. PRD Reference Requirements

#### 1.2.1. PRD Identification Protocol
**Primary PRD Reference**: Always use the most current and accurate PRD associated with the Strategic Directive
**PRD Location Verification**: Agents must verify PRD exists at referenced location
**PRD Version Control**: Reference latest version number when PRD versioning exists

#### 1.2.2. PRD Reference Format Standards
**Standard Format**: `[SD-ID]-PRD-[subject-identifier]`
**Location Reference**: Include full path when referencing PRD files
**Version Specification**: Include version number for versioned PRDs

**Examples**:
- `SD-2025-07-22-PRD-gtm-automation` (located at `docs/product-requirements/SD-2025-07-22-PRD-gtm-automation.md`)
- `SD-015-PRD-market-intelligence-platform-v1.2` (versioned PRD)
- `SD-014-PRD-infrastructure-audit` (standard format)

#### 1.2.3. PRD Granularity Standards (NEW - Lesson from SD-012)
**Mandate**: All PRDs **MUST** explicitly distinguish between "design," "implement," and "deploy" phases for each requirement to avoid assumption gaps. This ensures agents clearly understand what is conceptual vs. operational.
- **Design Phase**: Architectural blueprints, interfaces, and high-level plans.
- **Implement Phase**: Code development and unit testing.
- **Deploy Phase**: Containerization, deployment scripts, and integration setup.
**Enforcement**: PLAN must validate granularity during handoff; EXEC must report if a phase is missing.

### 1.3. Strategic Directive Context Requirements

#### 1.3.1. Strategic Directive Reference Standards
**Full Identification**: Always include both SD-ID, full descriptive title, and complete file path
**Current Status Awareness**: Agents should be aware of SD status (active, draft, archived)
**Phase/Sequence Context**: Include current execution sequence or phase when applicable

#### 1.3.2. Context Completeness Requirements
**Minimum Context**: Strategic Directive ID, title, and full file path in every communication
**Enhanced Context**: Include current phase, sequence, or task when relevant to communication
**Status Awareness**: Reference current SD status when making strategic decisions

### 1.4. Communication Compliance Enforcement

#### 1.4.1. Mandatory Compliance
**Zero Exceptions**: All communications must include:
- Required header format with full paths to Strategic Directive and PRD
- Complete "Reference Files Required" section with all relevant documentation paths
- Agent-specific reference files as outlined in Section 1.1.3

**Rejection Protocol**: Communications missing required elements should be rejected by receiving agent with specific feedback on missing components

**Correction Requirement**: Agents must request properly formatted communication before proceeding with any task execution or strategic planning

#### 1.4.2. Enhanced Quality Assurance
**Self-Validation Checklist**: Sending agents must verify before transmission:
- [ ] Header format complete with all required fields
- [ ] Strategic Directive path verified and accessible
- [ ] PRD path verified and current version referenced
- [ ] Reference Files section includes all relevant documentation
- [ ] Agent-specific requirements met per role (LEAD/PLAN/EXEC)

**Receiving Verification Protocol**: Receiving agents must verify:
- [ ] Complete header information present
- [ ] All reference file paths valid and accessible
- [ ] Context-appropriate reference files included
- [ ] Communication meets role-specific requirements

**Escalation Protocol**: 
- First violation: Request immediate correction with specific feedback
- Second violation: Document non-compliance and request correction
- Persistent non-compliance: Escalate to HUMAN for resolution and process review

#### 1.4.3. Reference File Verification Requirements
**Mandatory File Accessibility**: All referenced files must be:
- Accessible at the specified path
- Current and up-to-date versions
- Relevant to the communication context
- Properly formatted and complete

**Missing File Protocol**: If referenced files are missing or inaccessible:
- Sending agent must verify file existence before communication
- Receiving agent must report missing files immediately
- Communication cannot proceed until all reference files are available

---

## 2. Implementation Methodology Framework (MANDATORY - v3.1.4 - UNCHANGED)

### 2.1. Completion-Driven Approach Requirements

**MANDATORY**: All LEO Protocol implementations MUST follow completion-driven methodology rather than time-boxed approaches. This applies to ALL strategic directives, execution sequences, tasks, and project phases.

#### 2.1.1. Anti-Time Boxing Directive

**Prohibited Practices**:
- Time-boxed delivery windows (e.g., "complete in 5 days", "10-day development cycle")
- Calendar-based milestones (e.g., "Day 15", "by Week 3")
- Deadline-driven implementation (e.g., "90-day strategic window")
- Time-constrained parallel execution (e.g., "Days 15-40", "concurrent 2-week sprints")

**Required Practices**:
- Completion-based progression (e.g., "upon EES-01 completion", "after successful validation")
- Quality-driven advancement (e.g., "when >90% UI standards achieved", "upon compliance verification")
- Dependency-based sequencing (e.g., "following foundation establishment", "after integration testing")
- Merit-based transitions (e.g., "upon strategic gate achievement", "when success criteria met")

#### 2.1.2. Implementation Sequencing Protocol

**Sequential Implementation**: 
Each execution sequence proceeds only upon successful completion and validation of prerequisites
```markdown
EES-01 → Complete & Validate → EES-02 → Complete & Validate → EES-03
```

**Quality Gates**: 
Every phase must achieve defined success criteria before progression authorization
- Technical excellence validation
- UI/UX quality standard compliance
- Integration testing completion
- Performance requirement achievement

**Resource Allocation**: 
Concentrated effort on current priority rather than divided attention across time-constrained parallel streams

---

## 3. Adaptive Verification Framework (NEW - v3.1.5)

### 3.1. Framework Overview

The Adaptive Verification Framework optimizes EXEC → PLAN handoff efficiency by implementing a three-tier verification system that adapts to implementation risk profiles while maintaining enterprise-grade quality standards across all Strategic Directive implementations.

**Core Philosophy**: "Optimize verification effort allocation based on risk assessment while ensuring consistent quality gate enforcement across all implementations."

### 3.2. Three-Tier Verification System

#### 3.2.1. Tier 1: Core Standards (Non-Negotiable)
**Applied to ALL Strategic Directives - No Exceptions**:

**Mandatory Verification Requirements**:
- **PRD Compliance Verification**: PLAN must verify all PRD requirements completed per specifications
- **Quality Gate Enforcement**: 85+ quality score threshold validation with documented assessment
- **Database Status Validation**: Confirm Strategic Directive status updated to 'archived' with completion metadata
- **Database Verification Gate**: MANDATORY immediate query verification of all database status updates
- **Cross-SD Integration Testing**: Verify no negative impact on dependent Strategic Directives or shared systems

**Core Standards Verification Protocol**:
```markdown
1. **PRD Requirements Matrix Review** (Required)
   - Verify each PRD requirement against EXEC deliverables
   - Document completion status: Complete/Partial/Missing
   - Validate any deviations have documented rationale

2. **Quality Score Assessment** (Required)
   - Evaluate implementation against enterprise-grade standards
   - Confirm ≥85/100 quality score achievement
   - Document specific quality metrics and evidence

3. **Database Status Confirmation** (Required)
   - Query database to verify status = 'archived'
   - **MANDATORY VERIFICATION GATE**: Execute `npx tsx scripts/check-directives-data.ts` immediately after any status update
   - Confirm completion metadata present and accurate
   - Validate completion evidence documented and accessible
   - **CRITICAL**: Document database verification timestamp and results in completion report

4. **Integration Impact Validation** (Required)
   - Test integration points with dependent systems
   - Verify no performance degradation on shared components
   - Confirm API contracts maintained and backward compatible
```

#### 3.2.2. Tier 2: Risk-Adaptive Standards (PLAN Discretion)
**PLAN Agent Authority**: Determine verification depth based on implementation risk assessment

**Risk Assessment Framework**:
```markdown
**High-Risk Indicators** (Require Enhanced Verification):
- **Customer-Facing Functionality**: User interfaces, customer workflows, external APIs
- **Financial/Payment Systems**: Commerce integration, billing, financial data processing
- **Security-Sensitive Components**: Authentication, authorization, data access controls
- **Novel Architectural Patterns**: First-time implementations, experimental approaches
- **Cross-System Dependencies**: Integration with external services, complex data flows
- **Performance-Critical Paths**: High-traffic endpoints, real-time processing requirements

**Standard-Risk Implementations** (Streamlined Verification):
- **Internal Tooling and Frameworks**: Development tools, admin interfaces, internal APIs
- **Proven Architectural Patterns**: Standard CRUD operations, established design patterns
- **Non-Customer-Facing Enhancements**: Backend optimizations, reporting systems
- **Incremental Improvements**: Performance optimizations, code refactoring
- **Configuration Changes**: Environment settings, feature flags, routine updates
```

**Enhanced Verification Protocol** (High-Risk):
```markdown
**Extended Verification Requirements** (Additional 30-60 minutes):
1. **Comprehensive UI/UX Validation**
   - Breakpoint testing (320px, 768px, 1024px) with screenshots
   - Accessibility compliance (ARIA, keyboard navigation, screen readers)
   - Interaction states (hover, active, loading, error) validation
   - Design system adherence verification

2. **Security Assessment**
   - Authentication and authorization testing
   - Input validation and sanitization verification
   - Security vulnerability scan results review
   - Data protection and privacy compliance check

3. **Performance Validation**
   - Load testing results under expected traffic
   - Response time validation (API <500ms, UI <200ms)
   - Resource utilization assessment (CPU, memory, database)
   - Scalability impact analysis

4. **Integration Depth Testing**
   - End-to-end workflow validation with dependent systems
   - Error handling and recovery testing
   - Data consistency verification across system boundaries
   - Rollback procedures validation
```

**Streamlined Verification Protocol** (Standard-Risk):
```markdown
**Focused Verification Requirements** (15-30 minutes total):
1. **Functional Testing**
   - Core functionality validation against PRD requirements
   - Basic error handling verification
   - Integration point smoke testing

2. **Code Quality Review**
   - Test coverage validation (≥80% for critical paths)
   - Code review for adherence to established patterns
   - Documentation completeness check

3. **Performance Baseline**
   - Basic performance metrics collection
   - No regression verification against baseline
   - Resource usage within acceptable limits
```

#### 3.2.3. Tier 3: Evidence Flexibility (Multiple Acceptable Formats)
**EXEC Agent Flexibility**: Provide verification evidence in most efficient format for implementation approach

**Acceptable Evidence Formats**:

**Option A: Structured Evidence Package** (Comprehensive Documentation):
```markdown
Location: `docs/verification-packages/[SD-ID]-[COMPLETION-DATE]/`
Contents:
- `completion-summary.md` - Executive summary with key metrics
- `prd-compliance-matrix.xlsx` - Detailed requirement verification
- `technical-evidence/` - Code samples, test results, performance data
- `ui-ux-evidence/` - Screenshots, accessibility reports, interaction demos
- `integration-evidence/` - API tests, cross-SD validation, benchmarks
- `database-evidence/` - Schema changes, migration logs, status confirmations
```

**Option B: Working Demo + Code Review** (Show Don't Tell):
```markdown
Requirements:
- Live demonstration of functionality meeting PRD requirements
- Code walkthrough highlighting key implementation decisions
- Real-time testing of critical user paths and integration points
- Performance monitoring during demonstration
```

**Option B.1: Visual Verification with Playwright** (For UI Changes):
```markdown
Requirements:
- Automated Playwright tests capturing visual evidence
- Screenshots showing before/after states
- Animation verification for dynamic effects
- Cross-browser compatibility evidence
- Performance impact measurements
- Generated evidence JSON for handoff

Example Evidence Structure:
{
  "timestamp": "ISO-8601",
  "strategicDirective": "SD-XXX",
  "feature": "Feature Name",
  "verificationResults": {
    "visualPresence": true/false,
    "animationDetected": true/false,
    "darkModeSupport": true/false,
    "performanceImpact": "minimal/moderate/significant",
    "screenshots": ["path1.png", "path2.png"],
    "browserCompatibility": {...}
  }
}
```

**Option C: Automated Test Suite Results** (CI/CD Pipeline Validation):
```markdown
Requirements:
- Comprehensive test suite with ≥80% coverage
- All tests passing in CI/CD pipeline
- Performance benchmarks within acceptable thresholds
- Security scans showing no critical vulnerabilities
```

**Option D: Performance Benchmark Reports** (Quantitative Validation):
```markdown
Requirements:
- Detailed performance metrics (response times, throughput, resource usage)
- Comparison against baseline and requirements
- Load testing results under expected conditions
- Scalability analysis and capacity planning data
```

**Option E: Integration Testing Documentation** (System Interaction Focus):
```markdown
Requirements:
- End-to-end integration test results
- API contract validation documentation
- Cross-system compatibility verification
- Error handling and recovery procedure validation
```

### 3.3. PLAN Agent Verification Workflow

#### 3.3.1. Adaptive Verification Process
```markdown
**Step 1: Risk Assessment** (5 minutes)
- Review EXEC completion report and implementation scope
- Evaluate risk indicators (customer impact, security sensitivity, architectural novelty)
- Determine verification approach: Enhanced vs Streamlined
- Document risk assessment rationale

**Step 2: Core Standards Verification** (15-30 minutes - Always Required)
- PRD compliance check against requirements matrix
- Quality gate validation with documented scoring
- Database status confirmation with metadata verification
- Cross-SD integration impact assessment

**Step 3: Risk-Adaptive Deep Dive** (0-60 minutes based on risk assessment)
- **High-Risk**: Execute Enhanced Verification Protocol
- **Standard-Risk**: Execute Streamlined Verification Protocol
- Focus verification effort on highest-risk aspects

**Step 4: Evidence Review** (Variable duration based on format)
- Accept evidence in EXEC's preferred format
- Validate evidence completeness against verification requirements
- Document verification findings and decision rationale

**Step 5: Verification Decision** (5 minutes)
- **APPROVED**: All requirements met, quality gates achieved
- **CONDITIONAL APPROVAL**: Minor issues requiring correction
- **REJECTED**: Critical issues preventing acceptance, requires rework
```

#### 3.3.2. Verification Decision Criteria

**Automatic Approval Criteria**:
- All Tier 1 Core Standards met
- Risk-adaptive verification completed successfully
- Quality score ≥85/100 achieved and documented
- No critical security vulnerabilities or performance regressions

**Conditional Approval Criteria**:
- Tier 1 Core Standards met with minor deviations
- Quality score 80-84/100 with improvement plan
- Non-critical issues identified with clear resolution path
- Performance within acceptable range with optimization opportunities

**Rejection Criteria**:
- Any Tier 1 Core Standard not met
- Quality score <80/100 or critical quality issues
- Critical security vulnerabilities or major performance regressions
- Integration failures affecting dependent systems

### 3.4. EXEC Agent Completion Report Enhancement

#### 3.4.1. Enhanced Completion Report Structure
**REQUIRED**: All EXEC completion reports MUST include risk assessment support information

```markdown
**Section A: Implementation Risk Profile**
- **Risk Indicators Present**: List any high-risk characteristics (customer-facing, security, novel patterns)
- **Suggested Verification Approach**: Recommendation for Enhanced vs Streamlined verification
- **Critical Validation Areas**: Specific areas requiring focused PLAN attention
- **Integration Impact Summary**: Potential effects on other Strategic Directives

**Section B: Core Standards Self-Assessment**
- **PRD Compliance Status**: Requirement-by-requirement completion matrix
- **Quality Score Self-Assessment**: Estimated score with justification
- **Database Status Confirmation**: Evidence of proper status update
- **Integration Testing Results**: Cross-SD compatibility validation

**Section C: CI/CD Pipeline Status**
- **Pipeline Run ID**: GitHub Actions workflow run identifier
- **Pipeline Status**: Success/Failure/Skipped with timestamp
- **Failed Jobs**: List of any failed CI/CD jobs
- **Pre-existing Issues**: Documentation of any known CI/CD issues
- **Comments/Feedback**: Any automated pipeline comments or feedback

**Section D: Evidence Package Reference**
- **Evidence Format Used**: Specification of chosen evidence format (A-E)
- **Evidence Location**: Direct links/paths to verification materials
- **Key Validation Points**: Highlights for PLAN verification focus
- **Known Issues/Limitations**: Transparent reporting of any concerns
```

### 3.5. Integration with Existing LEO Protocol Components

#### 3.5.1. Proactive Governance Framework Integration
**Enhanced Integration Requirements**:
- **Expected PRD Registry**: Update verification requirements based on PRD complexity assessment
- **Dependency Gap Monitor**: Include verification failures in gap tracking
- **Alert System**: Escalate verification rejections requiring HUMAN intervention

#### 3.5.2. Database Status Management Integration
**Verification-Gated Status Updates**:
- Strategic Directive status only updated to 'archived' after PLAN verification approval
- Completion metadata includes verification decision and rationale
- Rejection triggers return to 'active' status with rework requirements

#### 3.5.3. Quality Scoring Integration
**Enhanced Quality Assessment**:
- **Base Quality Score**: Technical implementation quality (40 points)
- **Verification Compliance**: Adherence to adaptive verification requirements (10 points)
- **Risk Management**: Appropriate risk assessment and mitigation (10 points)
- **Evidence Quality**: Completeness and clarity of verification evidence (10 points)
- **Integration Quality**: Cross-SD compatibility and performance (30 points)

**Total**: 100 points  
**Minimum Required**: 85 points (including all quality components)

### 3.6. Success Metrics and Continuous Improvement

#### 3.6.1. Verification Efficiency Metrics
**Target Performance Indicators**:
- **Verification Time Reduction**: 40-60% reduction for standard-risk implementations
- **Quality Consistency**: ≥95% of implementations achieve 85+ quality score
- **Rework Reduction**: ≤10% of verifications require conditional approval or rejection
- **PLAN Satisfaction**: Verification process enables efficient quality assurance

#### 3.6.2. Adaptive Framework Effectiveness
**Monthly Assessment Requirements**:
- **Risk Assessment Accuracy**: Correlation between risk assessment and actual verification findings
- **Verification Approach Optimization**: Refinement of risk indicators based on experience
- **Evidence Format Preferences**: Analysis of most effective evidence formats per implementation type
- **Process Refinement**: Continuous improvement based on agent feedback and outcome analysis

---

## 8. Proactive Governance Framework (v3.1.4 - UNCHANGED)

### 8.1. Framework Overview

The Proactive Governance Framework transforms LEO Protocol from reactive to predictive dependency management, ensuring no PRD dependencies are discovered missing during critical implementation phases.

**Core Philosophy**: "Prevent implementation failures before they occur through systematic proactive monitoring and early dependency detection."

### 8.2. Expected PRD Registry System

#### 8.2.1. Purpose and Scope
The Expected PRD Registry maintains a comprehensive database of PRDs that are referenced in existing documents but don't exist yet, providing strategic visibility into future work requirements.

**Implementation**: `scripts/expected-prd-registry.ts`
**Registry Location**: `docs/strategic-operations/expected-prd-registry.json`
**Report Generation**: `docs/compliance/expected-prd-report.md`

#### 8.2.2. Detection Mechanisms
**Automated Scanning**:
- YAML frontmatter analysis (`related_sds`, `related_haps`)
- Strategic Dependencies section parsing
- Machine-readable metadata extraction
- Cross-reference detection in markdown content

#### 8.2.3. Registry Management
**Expected PRD Structure**:
```json
{
  "id": "SD-XXX",
  "title": "SD-XXX PRD",
  "referenced_by": ["source_file_list"],
  "reference_locations": ["file:line_references"],
  "priority": "critical|high|medium|low",
  "status": "expected|in_progress|created|cancelled",
  "expected_by": "ISO_date",
  "created_at": "ISO_date",
  "last_updated": "ISO_date",
  "notes": "string"
}
```

### 8.3. Dependency Gap Monitor System

#### 8.3.1. Purpose and Scope
The Dependency Gap Monitor provides automated detection of emerging dependency gaps through periodic validation cycles and real-time alerting for critical issues.

**Implementation**: `scripts/dependency-gap-monitor.ts`
**Configuration**: `docs/governance/dependency-monitor-config.json`
**Gap Database**: `docs/governance/dependency-gaps.json`
**Alert Log**: `docs/governance/dependency-alerts.json`

### 8.4. Proactive Monitoring Cycles

#### 8.4.1. Monitoring Workflow
```bash
# Complete proactive governance cycle
npm run proactive-governance
```

**Cycle Steps**:
1. **Expected PRD Scan**: Update registry with new references
2. **Dependency Gap Detection**: Run comprehensive validation
3. **Gap Analysis**: Compare with existing gaps and identify changes
4. **Alert Generation**: Create alerts for threshold violations
5. **Report Generation**: Update all governance reports
6. **Notification Distribution**: Send alerts through configured channels

### 8.5. Periodic Infrastructure Audits (NEW - Lesson from SD-012)

#### 8.5.1. Purpose and Mandate
To proactively detect and address infrastructure gaps, ensuring foundational elements (e.g., services, databases) are operational. This integrates with the Proactive Governance Framework to prevent "architecture vs. implementation gaps."

#### 8.5.2. Audit Schedule
- **Frequency**: Quarterly, or immediately after major SD completions.
- **Responsible Agent**: LEAD initiates; PLAN executes with EXEC support.

#### 8.5.3. Audit Protocol
1. Run automated checks (e.g., DB schema validation, service health pings).
2. Document findings in `docs/governance/infrastructure-audit-report.md`.
3. Log any gaps as technical debt (Section 10.5).
4. Escalate critical issues to HUMAN.

---

## 9. Strategic Directive Lifecycle Management (v3.1.4 - ENHANCED)

### 9.1. Database Status Update Requirements

**CRITICAL**: All database status updates now integrated with Adaptive Verification Framework to prevent status inconsistencies.

#### 9.1.1. Verification-Gated Status Updates

**Enhanced Status Lifecycle**:
```
draft → active → EXEC completes → PLAN verifies → archived (completion)
                      ↓              ↓
                   in_review → conditional_approval → rework → active
                              ↓
                         rejected → rework → active
```

**Status Values Allowed**: `draft`, `active`, `in_review`, `conditional_approval`, `archived`, `superseded`

#### 9.1.2. Agent Responsibilities for Database Status (Enhanced)

**EXEC Agent - Enhanced Completion Steps**:
```markdown
1. **Upon Strategic Directive Completion**:
   - Update status to 'in_review' (not 'archived')
   - Create comprehensive completion report with risk assessment
   - Provide verification evidence in chosen format (Tier 3 flexibility)
   - Hand off to PLAN for verification with all supporting materials

2. **Completion Evidence Requirements**:
   - Risk profile assessment and verification approach recommendation
   - PRD compliance self-assessment with requirement matrix
   - Quality score estimation with supporting evidence
   - Integration testing results and cross-SD impact analysis
```

**PLAN Agent - Enhanced Verification Authority**:
```markdown
1. **Verification Process Execution**:
   - Apply Adaptive Verification Framework (Tiers 1-3)
   - Document risk assessment and verification approach used
   - Complete verification within appropriate time allocation
   - Make verification decision: Approved/Conditional/Rejected

2. **Database Status Authority with Mandatory Verification**:
   - **APPROVED**: Update status to 'archived' with completion metadata
     - **CRITICAL**: MUST immediately verify database update using query script
     - **MANDATORY**: Include database verification confirmation in completion report
   - **CONDITIONAL**: Update status to 'conditional_approval' with requirements
     - **CRITICAL**: MUST immediately verify database update using query script
   - **REJECTED**: Update status to 'active' with rework requirements
     - **CRITICAL**: MUST immediately verify database update using query script
   - Always document verification rationale and evidence reviewed
   - **NEW REQUIREMENT**: Include database verification timestamp and confirmation
```

#### 9.1.3. LEAD Agent Responsibilities for Strategic Prioritization (NEW)

**CRITICAL**: The LEAD agent is responsible for initiating work on strategic directives in the correct sequence. To fulfill this responsibility, the LEAD agent MUST adhere to the following protocol:

1.  **Database as Single Source of Truth**: The `strategic_directives_v2` table in the PostgreSQL database is the single, authoritative source for the status and execution order of all strategic directives.
2.  **Mandatory Database Query**: The LEAD agent MUST NOT rely on analyzing the contents or metadata of markdown files in the `docs/` directory to determine execution priority. This method is unreliable and has been deprecated.
3.  **Prioritization Workflow**:
    - To determine the next directive to be executed, the LEAD agent MUST query the `strategic_directives_v2` table.
    - The query MUST order directives by the `execution_order` column to establish the correct sequence.
    - The analysis MUST consider both the `execution_order` and the `status` of each directive. Directives with a status of `draft`, `archived`, or `superseded` are not eligible for execution.
4.  **Handoff Protocol**: When handing off a directive to the PLAN agent, the LEAD agent MUST explicitly state that the prioritization was determined by a direct database query, referencing the `execution_order`.

### 9.1.4. Cascade Closure Protocol (NEW - CRITICAL DATABASE INTEGRITY REQUIREMENT)

**MANDATORY**: When a Strategic Directive is marked as `archived` or `completed`, ALL associated Epic Execution Sequences (EES) and subsidiary tasks MUST be cascaded to completion status. This prevents orphaned execution sequences and ensures complete strategic directive lifecycle closure.

#### Cascade Closure Requirements

**PLAN Agent Cascade Closure Authority**:
```markdown
**When marking Strategic Directive as 'archived':**
1. **EES Status Audit**: Query all EES items associated with the Strategic Directive
2. **Cascade Completion**: Update ALL associated EES items to 'completed' status
3. **Database Verification**: Verify both Strategic Directive AND all EES items show correct status
4. **Closure Documentation**: Document complete cascade closure in completion report

**Cascade Closure Verification Protocol**:
- Run database query to confirm Strategic Directive status = 'archived'
- Run database query to confirm ALL associated EES items status = 'completed'
- Document cascade closure timestamp and affected EES items
- Include cascade verification evidence in completion communications
```

**EXEC Agent Cascade Closure Support**:
```markdown
**Upon Strategic Directive Implementation Completion:**
1. **EES Completion Status**: Confirm all EES items implemented are marked 'completed'
2. **Outstanding EES Identification**: Report any EES items that remain incomplete
3. **Cascade Readiness Assessment**: Confirm Strategic Directive is ready for cascade closure
4. **Handoff Documentation**: Provide PLAN with complete EES status for cascade verification
```

#### Database Cascade Operations

**Required Database Updates for Strategic Directive Closure**:
```sql
-- Example cascade closure sequence
-- 1. Mark all associated EES items as completed
UPDATE epic_execution_sequences 
SET status = 'completed', 
    completed_at = NOW(),
    completion_method = 'cascade_closure'
WHERE strategic_directive_id = '[SD-ID]' 
AND status != 'completed';

-- 2. Mark Strategic Directive as archived
UPDATE strategic_directives_v2 
SET status = 'archived',
    completion_date = NOW(),
    cascade_closure_verified = true
WHERE id = '[SD-ID]';

-- 3. Immediate verification query
SELECT sd.id, sd.status as sd_status, ees.id as ees_id, ees.status as ees_status
FROM strategic_directives_v2 sd
LEFT JOIN epic_execution_sequences ees ON sd.id = ees.strategic_directive_id
WHERE sd.id = '[SD-ID]';
```

#### Cascade Closure Documentation Requirements

**Mandatory Cascade Evidence**:
```markdown
### Cascade Closure Verification Report
**Strategic Directive**: [SD-ID] - [Title]
**Closure Timestamp**: [ISO timestamp]
**EES Items Cascaded**: [Count] execution sequences
**Database Verification**: 
- Strategic Directive Status: archived ✅
- All EES Items Status: completed ✅
**Verification Query Results**:
```
[Include database query output showing all items properly closed]
```
**Cascade Closure Confirmation**: ✅ COMPLETE / ❌ INCOMPLETE
```

#### Integration with Database Integrity Verification Protocol

**Enhanced Database Verification for Cascade Closure**:
- Cascade closure MUST be verified using `npx tsx scripts/check-directives-data.ts`
- Verification MUST confirm both Strategic Directive AND all EES items show correct status
- Any incomplete cascade closure MUST be resolved before Strategic Directive can be marked archived
- Cascade closure verification is now mandatory component of Tier 1 Core Standards

#### Retroactive Cascade Closure Protocol

**For Existing Strategic Directives**:
```markdown
**IMMEDIATE ACTION REQUIRED**: All Strategic Directives currently marked 'archived' or 'completed' 
MUST have their cascade closure verified and corrected if necessary.

**Retroactive Verification Process**:
1. **Database Audit**: Query all Strategic Directives with status 'archived' or 'completed'
2. **EES Status Check**: For each, verify all associated EES items are also 'completed'
3. **Cascade Correction**: For any with incomplete EES items, execute cascade closure
4. **Documentation Update**: Document retroactive cascade closure actions taken
5. **Verification Confirmation**: Re-verify complete cascade closure for all directives

**Priority**: This retroactive verification MUST be completed before any new Strategic Directive work begins.
```

---

## 9.2. EES Naming Standards (NEW - v3.1.5.3)

### 9.2.1. Standard EES Identifier Format

**MANDATORY**: All Epic Execution Sequences (EES) MUST follow a standardized naming convention to ensure consistency, traceability, and database integrity across the entire ecosystem.

#### Standard Format
```
EES-[SD-IDENTIFIER]-[SEQUENCE-NUMBER]
```

**Components**:
- `EES`: Fixed prefix for all Epic Execution Sequences
- `[SD-IDENTIFIER]`: Strategic Directive identifier (without "SD-" prefix)
- `[SEQUENCE-NUMBER]`: Two-digit zero-padded sequential number (01, 02, 03, etc.)

#### Examples
```markdown
Correct Format:
- EES-010-01 (First EES for SD-010)
- EES-V-001-01 (First EES for SD-V-001)
- EES-2025-07-22-01 (First EES for SD-2025-07-22)
- EES-AX-002-05 (Fifth EES for SD-AX-002)

Incorrect Formats (to be avoided):
- SEQ-SD010-001 (legacy format)
- EES-CP-01 (missing SD association)
- EES-001 (missing SD identifier)
- EES-SD-015-01 (redundant SD prefix)
```

### 9.2.2. Naming Convention Rules

**Mandatory Rules**:
1. **Consistent Prefix**: Always use "EES-" as the prefix
2. **SD Association**: Every EES MUST be associated with a Strategic Directive
3. **Sequential Numbering**: Use zero-padded two-digit numbers (01-99)
4. **No Special Prefixes**: Avoid interim prefixes like CP, QW, BL, etc.
5. **Preserve SD Format**: Maintain the SD identifier format (e.g., if SD uses dates, keep dates)

### 9.2.3. Database Integrity Requirements

**Database Constraints**:
- EES identifiers serve as primary keys in `execution_sequences_v2` table
- Foreign key relationships exist with `hap_blocks_v2` and other tables
- Naming changes must preserve referential integrity

**Migration Protocol**:
When standardizing existing EES names:
1. Update foreign key references first (e.g., in `hap_blocks_v2`)
2. Then update the EES identifier
3. Verify all references remain intact
4. Document the mapping of old to new identifiers

### 9.2.4. Implementation Guidelines

**For New EES Creation**:
```markdown
1. Identify the parent Strategic Directive ID
2. Query existing EES items for that SD to determine next sequence number
3. Format: EES-[SD-ID-without-prefix]-[next-sequence-number]
4. Ensure no naming conflicts exist
5. Create with standardized name from inception
```

**For Existing EES Standardization**:
```markdown
1. Audit current naming patterns
2. Create mapping table: current_name → standardized_name
3. Execute database updates with foreign key handling
4. Verify referential integrity post-update
5. Document the standardization in version control
```

### 9.2.5. Verification Requirements

**PLAN Agent Responsibilities**:
- Verify all new EES items follow naming standards before creation
- Flag any non-compliant naming during task assignment
- Ensure consistency within Strategic Directive groups

**EXEC Agent Responsibilities**:
- Use standardized names when creating new EES items
- Report any legacy naming patterns encountered
- Follow migration protocol when standardizing existing items

---

## 9.3. Strategic Directive Naming Standards (NEW - v3.1.5.4)

### 9.3.1. Standard Strategic Directive Identifier Format

**MANDATORY FOR NEW DIRECTIVES**: All new Strategic Directives created after January 27, 2025 MUST follow a standardized naming convention to ensure consistency, chronological ordering, and clear identification across the ecosystem.

#### Standard Format for New Strategic Directives
```
SD-YYYY-MM-DD-[X]
```

**Components**:
- `SD`: Fixed prefix for all Strategic Directives
- `YYYY-MM-DD`: Creation date in ISO 8601 format
- `[X]`: Optional sequence letter (A, B, C, etc.) for multiple directives on the same day

#### Examples
```markdown
Future Directives (Mandatory Format):
- SD-2025-07-28-A (First directive created on July 28, 2025)
- SD-2025-07-28-B (Second directive created on July 28, 2025)
- SD-2025-08-15-A (Directive created on August 15, 2025)
- SD-2025-12-01-A (Directive created on December 1, 2025)

Existing Directives (Grandfathered - Do NOT Change):
- SD-010, SD-011, SD-012, etc. (Legacy numeric format)
- SD-V-001, SD-AX-001, etc. (Legacy categorical format)
- SD-2025-01-25-A through E (Existing date-based format)
- SD-1751664715770 (Legacy timestamp format)
```

### 9.3.2. Naming Convention Rules

**Mandatory Rules for New Strategic Directives**:
1. **Consistent Prefix**: Always use "SD-" as the prefix
2. **Date-Based Identifier**: Use creation date in YYYY-MM-DD format
3. **Sequential Letters**: Use A, B, C for multiple directives on same day
4. **No Special Prefixes**: Avoid category prefixes (e.g., AX, V, CP)
5. **Immutable Names**: Once created, SD names cannot be changed

**Grandfathering Clause**:
- All Strategic Directives created before January 27, 2025 retain their existing names
- No retroactive renaming due to database foreign key constraints
- System stability takes precedence over naming consistency for existing directives

### 9.3.3. Implementation Requirements

**For Creating New Strategic Directives**:
```markdown
1. Determine creation date (today's date)
2. Query existing SDs for that date to determine sequence letter
3. Format: SD-YYYY-MM-DD or SD-YYYY-MM-DD-[X] if multiple
4. Validate format before database insertion
5. Create with standardized name from inception
```

**Database Validation**:
```sql
-- Example validation for new Strategic Directive
-- Must match pattern: SD-YYYY-MM-DD or SD-YYYY-MM-DD-[A-Z]
CHECK (id ~ '^SD-\d{4}-\d{2}-\d{2}(-[A-Z])?$')
```

### 9.3.4. Rationale and Benefits

**Why Date-Based Naming**:
1. **Chronological Ordering**: Natural sorting by creation timeline
2. **Context Clarity**: Immediately see when directive was created
3. **Uniqueness**: Date + sequence letter ensures no conflicts
4. **Scalability**: Supports unlimited directives over time
5. **Consistency**: Aligns with successful EES naming standards

**Risk Management Decision**:
- Existing SD names preserved to maintain system stability
- Foreign key constraints with NO ACTION prevent safe renaming
- Future consistency achieved without risking current functionality

### 9.3.5. Verification Requirements

**PLAN Agent Responsibilities**:
- Verify all new Strategic Directives follow naming standards
- Reject non-compliant SD creation requests
- Ensure sequence letters are assigned correctly for same-day directives
- Reference this section when validating SD names

**EXEC Agent Responsibilities**:
- Use standardized names when creating new Strategic Directives
- Query existing SDs to determine correct sequence letter
- Never attempt to rename existing Strategic Directives
- Report any naming standard violations encountered

**LEAD Agent Responsibilities**:
- Enforce naming standards in all strategic planning
- Include proper SD names in all handoff communications
- Ensure consistency across strategic initiatives

### 9.3.6. Integration with EES Naming

**Consistent Ecosystem Naming**:
- Strategic Directives: `SD-YYYY-MM-DD-[X]` (new only)
- Epic Execution Sequences: `EES-[SD-IDENTIFIER]-[NN]` (all)
- Together create clear hierarchy: `SD-2025-07-28-A` → `EES-2025-07-28-A-01`

**Cross-Reference**:
- See Section 9.2 for EES Naming Standards
- EES naming successfully standardized for all 87 items
- SD naming standards apply to future directives only

---

## 10. Agent Workflow Updates for Adaptive Verification (v3.1.5)

### 10.1. Enhanced EXEC Agent Workflow

#### Implementation Completion (Enhanced)
```markdown
1. **Risk Assessment Integration** (10 minutes)
   - Self-assess implementation risk profile using Tier 2 indicators
   - Recommend verification approach to PLAN (Enhanced vs Streamlined)
   - Identify critical validation areas requiring focused attention
   - Document any novel approaches or potential integration concerns

2. **Evidence Package Preparation** (15-45 minutes based on chosen format)
   - Select most efficient evidence format (A-E) for implementation type
   - Prepare verification materials in chosen format
   - Ensure all Tier 1 Core Standards evidence is complete
   - Include supporting materials for risk-adaptive verification

3. **CI/CD Pipeline Verification** (5-10 minutes)
   - Check GitHub Actions workflow status after pushing changes
   - Use `gh run list --repo [owner/repo]` to view recent runs
   - Use `gh run view [run-id]` to check specific run details
   - Document pipeline status (success/failure/skipped)
   - If pipeline fails: Review failure logs and determine if issues are pre-existing
   - Include CI/CD status in completion report to PLAN

3.1 **Visual Verification for UI Changes** (5-10 minutes)
   - For UI/UX implementations, use Playwright for visual verification
   - Capture screenshots of implemented features
   - Verify animations and dynamic effects are working
   - Test dark mode support where applicable
   - Generate evidence JSON with verification results
   - Include visual evidence in completion report

4. **Enhanced Completion Report** (15 minutes)
   - Complete structured completion report with risk assessment
   - Update database status to 'in_review' (not 'archived')
   - Provide clear handoff to PLAN with verification roadmap
   - Document implementation decisions and potential optimization opportunities
   - Include CI/CD pipeline status and any relevant findings

**Critical Change**: EXEC no longer updates status directly to 'archived' - PLAN verification required
```

### 10.2. Enhanced PLAN Agent Workflow

#### Adaptive Verification Process (Enhanced)
```markdown
1. **Risk Assessment and Planning** (5-10 minutes)
   - Review EXEC risk assessment and recommendations
   - Apply risk assessment framework to determine verification approach
   - Plan verification activities and time allocation
   - Document risk assessment rationale

2. **Tier 1 Core Standards Verification** (15-30 minutes - Always Required)
   - PRD compliance verification against requirements matrix
   - Quality gate enforcement with documented scoring
   - Database status validation and completion metadata review
   - Cross-SD integration impact assessment

3. **Tier 2 Risk-Adaptive Verification** (0-60 minutes based on risk)
   - **Enhanced Verification**: Comprehensive validation for high-risk implementations
   - **Streamlined Verification**: Focused validation for standard-risk implementations
   - Evidence review in EXEC's chosen format
   - Documentation of verification findings

4. **Verification Decision and Database Update** (10 minutes)
   - Make verification decision based on established criteria
   - Update database status appropriately (archived/conditional_approval/active)
   - **MANDATORY DATABASE VERIFICATION GATE**: Immediately run database query to confirm status update
   - Document verification rationale and evidence quality assessment
   - **CRITICAL**: Include database verification confirmation with timestamp in completion report
   - Provide feedback to EXEC on verification efficiency and quality

5. **Database Verification Protocol** (5 minutes - NEW MANDATORY STEP)
   - Execute `npx tsx scripts/check-directives-data.ts` immediately after status update
   - Verify the Strategic Directive shows correct status in database query results
   - Document verification timestamp and confirmation in completion report
   - If discrepancy found, immediately investigate and resolve before proceeding
   - Include database verification evidence in all completion communications

**Authority Enhancement**: PLAN now has sole authority for 'archived' status updates with mandatory verification
```

### 10.3. Enhanced HUMAN Oversight

#### Strategic Verification Governance
```markdown
1. **Verification Framework Oversight**
   - Monthly review of verification efficiency metrics
   - Assessment of risk assessment accuracy and framework effectiveness
   - Approval of framework refinements based on operational experience
   - Resolution of escalated verification disputes

2. **Quality Assurance Authority**
   - Override authority for verification decisions when needed
   - Final approval for framework modifications and improvements
   - Strategic guidance on verification approach for novel implementations
   - Continuous improvement leadership for verification effectiveness
```

---

## 10.4. Pre-Implementation Validation Protocol (NEW - Lesson from T-GAV-01)

### 10.4.1. Purpose and Mandate
To prevent implementation work on non-existent or non-functional infrastructure, bridging the critical gap between architectural blueprints and operational reality. This protocol, born from the findings of `T-GAV-01`, mandates a "verify, then build" approach for all tasks involving service interaction.

### 10.4.2. PLAN Agent Responsibility: Prerequisite Manifest
- **Mandate**: For any task requiring interaction between services, databases, or APIs, PLAN **MUST** include a `Prerequisite Manifest` in the task handoff to EXEC.
- **Format**: The manifest is a simple, actionable checklist of required infrastructure dependencies.
- **Example Manifest**:
  ```
  **Prerequisite Manifest:**
  - [ ] DB Table Exists: `segments`
  - [ ] DB Table Exists: `campaigns`
  - [ ] API Endpoint Responsive: `GET /api/gtm/segments`
  - [ ] Service Health Check: `campaign-engine` is discoverable and healthy
  ```

### 10.4.3. EXEC Agent Responsibility: Pre-Flight Check
- **Mandate**: The **FIRST STEP** for EXEC upon receiving a task with a Prerequisite Manifest is to perform a "Pre-Flight Check" to validate every item on the list.
- **Method**: This check should be performed using the most direct and lightweight method possible (e.g., `curl`, simple DB queries, service health pings), not by building a full test suite.
- **Gating Condition**: If any prerequisite check fails, EXEC **MUST** immediately halt all other implementation work.
- **Failure Protocol**: Upon failure, EXEC must document the specific blocker and hand the task back to PLAN with a **"BLOCKED - PREREQUISITE FAILED"** status. This creates an immediate "fail-fast" feedback loop.

---

## 10.5. Database Integrity Verification Protocol (NEW - Critical Incident Response)

### 10.5.1. Purpose and Mandate
To prevent database status discrepancies and ensure complete integrity between reported actions and actual database state. This protocol was established in response to a critical incident where PLAN reported successful database archival that had not actually occurred, highlighting the need for immediate verification of all database operations.

### 10.5.2. Mandatory Verification Gates

**CRITICAL**: ALL database status updates MUST be immediately verified through direct database query.

#### Universal Database Verification Requirements
**Applies to ALL Agents (LEAD, PLAN, EXEC)**:
- **Immediate Verification**: Any agent claiming to have updated database status MUST immediately verify the update through `npx tsx scripts/check-directives-data.ts`
- **Verification Documentation**: Include database verification timestamp and confirmation in ALL status update communications
- **Discrepancy Protocol**: If verification reveals discrepancy, agent MUST immediately correct the database state and report the discrepancy
- **Zero Tolerance**: No strategic planning or task handoffs may proceed until database verification is complete and confirmed

#### PLAN Agent Database Verification Protocol
**Enhanced Requirements for PLAN Agent**:
```markdown
**Mandatory Verification Sequence**:
1. **Execute Database Update**: Perform intended status change using appropriate script
2. **Immediate Verification**: Run `npx tsx scripts/check-directives-data.ts` within 2 minutes of update
3. **Status Confirmation**: Verify Strategic Directive appears with correct status in query results
4. **Documentation**: Include verification timestamp and database query excerpt in completion report
5. **Discrepancy Resolution**: If status does not match, investigate and resolve immediately before any handoffs

**Verification Evidence Format**:
```markdown
### Database Verification Confirmation
**Update Executed**: [timestamp]
**Verification Query Run**: [timestamp]
**Database Status Confirmed**: [status] for [SD-ID]
**Query Evidence**: 
```
[Include relevant excerpt from database query showing correct status]
```
**Verification Status**: ✅ CONFIRMED / ❌ DISCREPANCY FOUND
```

#### LEAD Agent Database Verification Authority
**Enhanced Oversight Responsibilities**:
- **Verification Authority**: LEAD has authority to request immediate database verification from any agent at any time
- **Audit Protocol**: LEAD may audit database status independently to verify agent reports
- **Escalation Authority**: LEAD must escalate persistent database discrepancies to HUMAN for resolution
- **Protocol Enforcement**: LEAD ensures all agents comply with mandatory verification requirements

### 10.5.3. Database Verification Scripts and Tools

#### Required Verification Commands
**Primary Verification Script**: `npx tsx scripts/check-directives-data.ts`
- **Purpose**: Comprehensive database status query for all Strategic Directives
- **Usage**: MUST be executed immediately after any database status update
- **Output**: Complete status listing with timestamps and metadata

**Status Update Scripts** (when available):
- `npx tsx scripts/update-directive-status.ts` - For status updates with verification
- Custom database update scripts with built-in verification

#### Verification Evidence Standards
**Minimum Required Evidence**:
- **Timestamp**: Exact time of database update and verification
- **Query Results**: Relevant excerpt showing Strategic Directive with correct status
- **Agent Confirmation**: Explicit statement that verification was completed successfully
- **Discrepancy Reporting**: If any discrepancy found, complete details of resolution

### 10.5.4. Incident Response and Continuous Improvement

#### Database Discrepancy Incident Protocol
**When Database Verification Fails**:
1. **Immediate Halt**: Stop all strategic planning and task handoffs
2. **Root Cause Analysis**: Investigate why database update failed or was not executed
3. **Corrective Action**: Execute proper database update and re-verify
4. **Documentation**: Document incident and resolution in completion report
5. **Process Review**: Assess if additional protocol enhancements needed

#### Continuous Improvement Requirements
**Monthly Protocol Review**:
- **Verification Compliance**: Assess agent adherence to database verification requirements
- **Incident Analysis**: Review any database discrepancies and root causes
- **Protocol Enhancement**: Update verification requirements based on operational experience
- **Tool Improvement**: Enhance verification scripts and automation as needed

### 10.5.5. Integration with Existing Frameworks

#### Adaptive Verification Framework Integration
**Enhanced Tier 1 Requirements**:
- Database Verification Gate is now mandatory component of Tier 1 Core Standards
- All verification decisions MUST include database verification confirmation
- Database discrepancies automatically trigger Enhanced Verification regardless of risk assessment

#### Communication Standards Integration
**Enhanced Reference Files Requirements**:
- All completion reports MUST include database verification evidence
- Database verification timestamp MUST be included in communication headers when applicable
- Reference files MUST include database query results when status updates are involved

---

## 10.6. Technical Debt Management (NEW)

### 10.6.1. Purpose and Mandate
To ensure the long-term health and stability of the platform, a formal process for managing technical debt is hereby established. This process prevents the loss of valuable engineering insights and ensures that refactoring and hardening tasks are systematically addressed.

### 10.6.2. The Technical Debt Registry
- **Authoritative Source**: The single source of truth for all non-critical technical debt is the **`docs/governance/technical_debt_registry.md`** file.
- **Mandate**: All identified technical debt that is not addressed immediately MUST be logged in this registry.

### 10.6.3. Agent Responsibilities
- **PLAN and EXEC Agents**:
  - During verification, implementation, or analysis, if non-critical technical debt, refactoring opportunities, or hardening tasks are identified, the agent **MUST** log them in the `technical_debt_registry.md`.
  - Each entry must include a clear description, the affected components, and the source of its discovery (e.g., "Verification of T-GAE-06").
- **LEAD Agent**:
  - During strategic planning cycles (e.g., between major SDs), the LEAD agent **MUST** review the `technical_debt_registry.md`.
  - Based on this review, the LEAD agent will group high-priority items into a dedicated "Technical Debt Sprint" or "Platform Hardening" Epic Execution Sequence (EES) to be formally scheduled and executed within the standard workflow.

 ## 10.7. Terminal Reliability & Non-Interactive Execution Guidance (NEW - v3.1.5.5)
 
 ### 10.7.1. Purpose
 To ensure reliable execution of protocol-mandated commands in environments prone to terminal stalls (Cursor/WSL/CI), this section standardizes non-interactive, timeout-guarded, absolute-path command patterns.
 
 ### 10.7.2. Mandatory Execution Principles
 - Use absolute paths and explicitly `cd` into the project on each invocation.
 - Enforce non-interactive output and disable pagers: always append `| cat`.
 - Add timeouts and line buffering to prevent hangs.
 - Prefer local binaries over `npx` when possible to avoid network prompts.
 
 ### 10.7.3. Stable Command Patterns (WSL/Linux Bash)
 ```bash
 # Always start in project root
 cd /home/rickfelix2000/projects/ehg-replit
 
 # Environment guards (recommended)
 export CI=1
 export PGCONNECT_TIMEOUT=5
 npm config set progress=false --location=project
 
 # Use local tsx bin to avoid npx stalls
 ./node_modules/.bin/tsx --version | cat
 
 # Add timeout + line buffering wrapper for long operations
 timeout 30s stdbuf -oL -eL ./node_modules/.bin/tsx scripts/check-directives-data.ts | cat
 ```
 
 ### 10.7.4. Status Update and Verification Examples
 ```bash
 # Update directive status (protocol §9.1)
 cd /home/rickfelix2000/projects/ehg-replit && \
   CI=1 PGCONNECT_TIMEOUT=5 timeout 30s stdbuf -oL -eL \
   ./node_modules/.bin/tsx scripts/update-directive-status.ts SD-CHAIR-UI-S1 active | cat
 
 # Immediate DB verification (protocol §10.5)
 cd /home/rickfelix2000/projects/ehg-replit && \
   CI=1 PGCONNECT_TIMEOUT=5 timeout 30s stdbuf -oL -eL \
   ./node_modules/.bin/tsx scripts/check-directives-data.ts | cat
 ```
 
 ### 10.7.5. TTY-Safe and Background Logging Alternatives
 ```bash
 # Force TTY-safe execution when UI struggles to render output
 cd /home/rickfelix2000/projects/ehg-replit && \
   script -q -c "CI=1 PGCONNECT_TIMEOUT=5 timeout 30s stdbuf -oL -eL ./node_modules/.bin/tsx scripts/check-directives-data.ts | cat" /dev/null
 
 # Background execution with live tailing (for very long outputs)
 cd /home/rickfelix2000/projects/ehg-replit && \
   (CI=1 PGCONNECT_TIMEOUT=5 ./node_modules/.bin/tsx scripts/check-directives-data.ts > logs/db_verify.log 2>&1 &) && tail -n +1 -f logs/db_verify.log
 ```
 
 ### 10.7.6. PowerShell → WSL Bridge Pattern
 When invoking from Windows PowerShell into WSL, use a non-interactive bridge and absolute paths.
 ```powershell
 $env:CI = 1; $env:PGCONNECT_TIMEOUT = 5
 wsl -e bash -lc "cd /home/rickfelix2000/projects/ehg-replit && timeout 30s stdbuf -oL -eL ./node_modules/.bin/tsx scripts/check-directives-data.ts | cat"
 ```
 
 ### 10.7.7. Evidence Capture Requirement
 For protocol gates requiring evidence (e.g., §10.5), record:
 - UTC timestamp of command start/finish
 - Command used (with args)
 - Relevant output excerpt confirming state
 ```
 date -u +"%Y-%m-%dT%H:%M:%SZ"
 ```
 
 ---
  
  ## 10.8. Git Operations (EXEC-Primary with Governance Controls) (UPDATED - v3.1.5.7)
  
  ### 10.8.1. Purpose
  Enable EXEC to perform limited Git operations when explicitly authorized, improving verification throughput while preserving governance safety and auditability.
  
  ### 10.8.2. Default Rule (Updated)
  - EXEC performs Git operations by default for non-protected branches.
  - HUMAN serves as fallback when:
    - EXEC encounters blocking issues and requests assistance from PLAN, and
    - After PLAN assistance, the issue remains unresolved or requires elevated privileges.
  - Protected branches and force operations remain HUMAN-only unless explicitly authorized.
  
  ### 10.8.3. Execution Policy & Governance Controls
  - Default Mode: EXEC-enabled for Git (this document).
  - Optional Restriction via Flag: Teams MAY restrict scope using `docs/governance/flags/allow_exec_git.md` (scoped allow-list) or enforce HUMAN-only via `docs/governance/flags/disable_exec_git.md`.
  - Required in Flags (when used):
    - Scope: explicit file/path scope (e.g., `docs/verification-packages/**`, `docs/prd/**`)
    - Branch policy: allowed prefixes (e.g., `exec/*`, `chore/*`, `verif/*`)
    - Expiry: ISO timestamp to auto-revoke permissions
    - Approver: HUMAN identifier and approval timestamp
  - Risk class: High-risk scopes (security-sensitive, prod configs, protected branches) remain HUMAN-only unless explicitly authorized in writing.
  
  Example flag (minimal):
  ```markdown
  # allow_exec_git.md
  Scope: docs/verification-packages/**, docs/prd/**
  Branches: exec/*, chore/*, verif/*
  Expiry: 2025-08-16T00:00:00Z
  Approver: HUMAN (initials/date)
  ```
  
  ### 10.8.4. Allowed Operations (When Enabled)
  - Create/switch branches within allowed prefixes
  - Stage and commit permitted files within scope
  - Push to remote and create PRs
  - Prohibited: force-push, history rewrite, tag manipulation, protected branches without HUMAN approval
  
  ### 10.8.5. Required Safeguards
  - Branch naming: `exec/<sd-or-ees-id>/<purpose>` or `chore/<sd-id>-<purpose>`
  - Commit messages must include:
    - Purpose + scope (e.g., evidence/PRD only)
    - Reference to LEO section (e.g., “per LEO §10.5/§10.8”)
    - Evidence SHA256 when committing verification artifacts
  - Commands MUST follow §10.7 non-interactive patterns and use absolute paths
  - Immediate CI verification per §EXEC CI requirements after push
  - All actions must be mirrored in the PR/commit body with “Reference Files Required” paths
  
  ### 10.8.6. Recommended Command Pattern (WSL/Linux)
  ```bash
  cd /abs/path/to/repo && \
    git switch -c exec/<sd-id>/<purpose> || git switch exec/<sd-id>/<purpose> && \
    git add <scoped-paths> && git status | cat && \
    git commit -m "chore(leo-db): <purpose> per LEO §10.5/§10.8" \
                 -m "Evidence SHA256: ..." && \
    git push -u origin HEAD | cat
  ```
  
  ### 10.8.7. Revocation & Expiry
  - On expiry or removal of the flag file, EXEC must immediately stop performing Git operations
  - Any pending work must switch back to HUMAN-run Git
  
  ### 10.8.8. Audit & Compliance
  - EXEC must include push output, remote branch confirmation, and CI status in the completion report
  - PLAN verifies scope adherence and evidence accuracy
  - LEAD may request retroactive audit at any time
  
  ### 10.8.9. Emergency Stop
  - HUMAN may revoke permission by deleting or editing the flag. EXEC must honor revocation immediately.
  
  ---
  
  ### 10.8.10. Push Timing Triggers (NEW - v3.1.5.7)
  
  EXEC SHOULD push to Git (branch per §10.8.5) after the following events:
  - Database status updates with verification evidence (e.g., draft → active, active → archived) per §10.5
  - Cascade closure verification evidence for SD/EES per §9.1.4
  - Creation or update of PRDs/EES artifacts that gate execution or handoffs (post-validation)
  - Generation of verification packages for Tier 1/2 evidence (screenshots, a11y, telemetry, tests)
  - Protocol/rules updates that affect workflow, governance, or naming standards
  - Ledger updates or governance closeouts that finalize a gate (e.g., Assessment Gate, Vision-Lock)
  - CI fix commits that resolve verification failures (push after tests pass locally/CI rerun)
  
  Notes:
  - Group related evidence into a single commit per gate when feasible.
  - Always include evidence paths and SHA256 hashes in the commit body for auditability.
  - Open a PR when a gate is completed, or when collaboration/review is needed.

  ---

  ## 10.9. Automation & Test-ID Standardization (NEW - v3.1.5.8)

  ### 10.9.1. Scope
  - All interactive UI elements and key containers MUST expose stable TestIDs.
  - Applies to Chairman console, governance dashboards, and any surfaced widgets.

  ### 10.9.2. Naming Convention
  - Attribute: `data-testid="<suite>.<surface>.<widget>.<element>[.<state|action>]"`
  - Examples:
    - `data-testid="chairman.dashboard.rollups.header.profileMenu.open"`
    - `data-testid="chairman.sidebar.nav.kpiKri.link.active"`

  ### 10.9.3. Enforcement
  - Lint Rule: CI must fail when required elements lack TestIDs or naming deviates from the pattern.
  - CI Gate: Enforce minimum automation coverage thresholds as defined in the PRD (e.g., ≥80% on critical paths).
  - Evidence: Include lint report, coverage report, and a sample selector map in EES/SD evidence packages.
  - Exceptions: Must be documented in PRD §5 with rationale and a remediation plan, and linked to GAPs.

  ### 10.9.4. Traceability
  - Bind all related work to `GAP-036` (Test Identifier Standardization) and `GAP-037` (Widget Automation Quality Gates).
  - Update the PRD Gap Traceability Matrix accordingly.

  ### 10.9.5. Integration Points
  - Acceptance Criteria templates (§7) MUST require TestIDs for any UI work.
  - Testing Integration/CI sections MUST reference this section to ensure gating is enforced on PR/merge.

## 11. Vision QA System Integration (NEW - v3.1.5.9)

### 11.1. Purpose and Mandate
To integrate autonomous visual testing capabilities into the LEO Protocol workflow, enabling intelligent UI validation through the Vision-Based QA System that combines Playwright automation with multimodal LLMs.

### 11.2. Vision QA Trigger Requirements

#### 11.2.1. LEAD Agent Vision QA Triggers
**Mandatory Vision QA Assessment for Strategic Directives**:
- UI/UX components present → Vision QA Required
- Customer-facing functionality → Vision QA Required  
- Payment/Auth interfaces → Vision QA Mandatory
- Accessibility requirements → Vision QA Mandatory
- Internal tools only → Vision QA Optional

#### 11.2.2. PLAN Agent Vision QA Orchestration
**Risk-Based Vision QA Inclusion Matrix**:
```markdown
┌─────────────────────────┬──────────────┬────────────────┐
│ Component Type          │ Risk Level   │ Vision QA?     │
├─────────────────────────┼──────────────┼────────────────┤
│ New UI Feature          │ High         │ Required       │
│ UI Modification         │ Medium       │ Recommended    │
│ Payment/Auth UI         │ Critical     │ Mandatory      │
│ Mobile Responsive       │ High         │ Required       │
│ Accessibility Features  │ High         │ Mandatory      │
└─────────────────────────┴──────────────┴────────────────┘
```

**Integration with Tier 2 Verification**:
- Enhanced verification MUST include Vision QA for customer-facing UI
- Vision QA reports become part of verification evidence package
- Test failures block Strategic Directive completion

#### 11.2.3. EXEC Agent Vision QA Execution
**Mandatory Vision QA Execution Points**:
1. After UI implementation completion
2. After UI bug fixes (regression testing)
3. Before handoff to PLAN (evidence generation)
4. When integration affects UI components

**Execution Protocol**:
```bash
# Run vision tests with auto-selected model
node lib/testing/vision-qa-agent.js \
  --app-id "[APP-ID]" \
  --goal "[Test Goal]" \
  --max-iterations 30
```

### 11.3. Vision QA Evidence Requirements

#### 11.3.1. Required Evidence Components
**Minimum Vision QA Evidence Package**:
- Test execution summary with pass/fail status
- Bug report with severity classifications
- Screenshot evidence across viewports
- Accessibility compliance score
- Cost breakdown and model used
- Database session ID for audit trail

#### 11.3.2. Integration with Evidence Formats
**Option F: Vision QA Validation** (New Evidence Format):
```markdown
Location: `docs/verification-packages/[SD-ID]/vision-qa/`
Contents:
- `test-report.md` - Comprehensive test results
- `bugs.json` - Detected issues with severity
- `screenshots/` - Visual evidence by viewport
- `accessibility.html` - WCAG compliance report
- `consensus.json` - Multiple run agreement data
```

### 11.4. Automatic Model Selection Protocol

#### 11.4.1. Model Selection Rules
The Vision QA System automatically selects appropriate models:
- **Accessibility testing** → claude-sonnet-3.7
- **Critical/Payment/Security** → gpt-5
- **Performance/Speed tests** → gpt-5-nano
- **Smoke/Basic tests** → gpt-5-nano
- **Default testing** → gpt-5-mini

#### 11.4.2. Cost Management
- Strategic planning includes Vision QA budget allocation
- Critical paths: $5-10 budget
- Standard testing: $2-5 budget
- Basic validation: $1-2 budget

### 11.5. Quality Gate Enhancement with Vision QA

**Updated Quality Scoring (Total 100 points)**:
- Base Quality Score: 40 points
- **Vision QA Pass Rate: 10 points** (NEW)
  - 100% pass = 10 points
  - <80% pass = 0 points (gate failure)
- **Visual Bug Severity: 10 points** (NEW)
  - No critical/high bugs = 10 points
  - Critical/high bugs present = 0 points
- Verification Compliance: 10 points
- Integration Quality: 30 points

**Minimum Required**: 85 points (including Vision QA components)

### 11.6. Communication Enhancement for Vision QA

#### 11.6.1. Required Header Addition
When Vision QA is applicable, communications MUST include:
```markdown
**Vision QA Status:** Required/Recommended/Optional/Not Applicable
**Vision QA Configuration:** [If applicable]
```

#### 11.6.2. Reference Files Addition
Add to Reference Files when Vision QA involved:
```markdown
- `docs/03_protocols_and_standards/leo_vision_qa_integration.md` (Vision QA Guidelines)
- `docs/verification-packages/[SD-ID]/vision-qa/` (Test Results)
```

## 12. Version History and Migration

### 12.1. Version History
- **v3.1.0** (Jan 4, 2025): Initial API-driven architecture
- **v3.1.1** (Jan 5, 2025): Added initiative type classification and execution gates
- **v3.1.2** (Jan 21, 2025): Added Duplication Prevention Framework
- **v3.1.3** (Jan 21, 2025): Added Architecture-First PRD Governance Framework
- **v3.1.4** (Jul 22, 2025): Added Anti-Time Boxing Framework + Communication Standards + Proactive Governance
- **v3.1.5** (Jan 23, 2025): **Added Adaptive Verification Framework** - Three-tier verification system with risk-based assessment, flexible evidence formats, and enhanced EXEC→PLAN handoff efficiency while maintaining enterprise-grade quality standards
- **v3.1.5.1** (Jan 27, 2025): **Added Database Integrity Verification Protocol** - Mandatory database verification gates in response to critical incident where PLAN reported database archival that had not occurred, establishing "trust but verify" protocol for all database operations
- **v3.1.5.2** (Jan 27, 2025): **Added Cascade Closure Protocol** - Mandatory cascade closure of all associated EES items when Strategic Directives are marked archived/completed, preventing orphaned execution sequences and ensuring complete strategic directive lifecycle closure
- **v3.1.5.3** (Jan 27, 2025): **Added EES Naming Standards** - Mandatory standardized naming convention for all Epic Execution Sequences (EES-[SD-ID]-[NN]) to ensure consistency, traceability, and database integrity across the ecosystem
- **v3.1.5.4** (Jan 27, 2025): **Added Strategic Directive Naming Standards** - Mandatory naming convention for all new Strategic Directives (SD-YYYY-MM-DD-[X]) while preserving existing SD names for system stability, ensuring future consistency across the ecosystem
- **v3.1.5.5** (Aug 9, 2025): **Terminal Reliability & Non-Interactive Execution Guidance** - Stable command patterns for WSL/Linux, TTY-safe execution, and evidence capture requirements
- **v3.1.5.6** (Aug 9, 2025): **Controlled EXEC Git Operations** - Introduces governed permissions via `docs/governance/flags/allow_exec_git.md`, scoped operations, mandatory safeguards, CI verification, and audit requirements
- **v3.1.5.7** (Aug 9, 2025): **EXEC-Primary Git + Push Timing Triggers** - Makes EXEC default for Git on non-protected branches with PLAN-assist/HUMAN fallback, adds explicit push timing triggers
- **v3.1.5.8** (Aug 9, 2025): **Automation & Test-ID Standardization** - Mandates stable TestIDs, naming convention, CI lint/coverage gates, evidence requirements, and GAP mapping (GAP-036/037)
- **v3.1.5.9** (Jan 30, 2025): **Vision QA System Integration** - Integrates autonomous visual testing with Playwright and multimodal LLMs, automatic model selection, mandatory UI validation triggers for agents, evidence requirements, and quality gate enhancements
Familiarize yourself with the communication protocols updated in the new LEO protocol document version. 

---

## 13. Gap-Referenced Artifact Standards (NEW - v3.1.5.6)

### 13.1. Purpose and Mandate
To strengthen traceability and auditability across the lifecycle, all Strategic Directives (SDs), Epic Execution Sequences (EES), and Product Requirements Documents (PRDs) MUST explicitly reference the gaps they are intended to address using unique GAP identifiers (format: `GAP-###`).

### 13.2. Requirements by Artifact Type

#### 12.2.1. Strategic Directives (SD)
- Include a dedicated section titled: `Gap Closure Reference`
- List all targeted GAP IDs and a one-line closure objective per GAP
- Example:
  ```markdown
  ## Gap Closure Reference
  - GAP-016: Establish persistent header with ⌘K + governance cues
  - GAP-017: Implement persistent global sidebar
  ```

#### 12.2.2. Epic Execution Sequences (EES)
- In the task description, add: `Resolves GAP IDs: GAP-016, GAP-017` (as applicable)
- Each EES MUST map to one or more GAPs; include acceptance criteria tied to those GAPs

#### 12.2.3. Product Requirements Documents (PRD)
- Include a section titled: `Gap Traceability Matrix`
- Provide a table: `Requirement | GAP IDs | Evidence/Evaluation`
- Example:
  ```markdown
  ## Gap Traceability Matrix
  | Requirement                                    | GAP IDs            | Evidence |
  | ---                                            | ---                | ---      |
  | Persistent header with ⌘K + alerts + profile   | GAP-016, GAP-025   | PRD §5   |
  ```

### 12.3. Formatting Standards
- GAP IDs MUST use the canonical format `GAP-###`
- When closing a gap, add a brief note in the artifact changelog referencing the GAP ID(s)

### 12.4. Compliance and Validation
- LEO Compliance Audit MUST fail artifacts missing the required gap-reference sections:
  - SD without `Gap Closure Reference`
  - EES without `Resolves GAP IDs`
  - PRD without `Gap Traceability Matrix`
- Evidence packages SHOULD include screenshots or DB verification excerpts that demonstrate closure effectiveness

### 12.5. Backward Compatibility and Migration
- Legacy artifacts MAY be retrofitted by:
  1) Extracting GAP IDs from governance inventories (e.g., `docs/governance/assessment/full_system_gap_inventory.md`)
  2) Adding the new sections outlined above
  3) Recording changes in changelogs and updating hashes/ledgers
- Tooling: future versions of `scripts/leo_compliance_audit.sh` MAY auto-suggest GAP references based on content heuristics
