-- ============================================================================
-- STRATEGIC DIRECTIVE: Venture Lifecycle Gap Remediation
-- Orchestrator SD with 5 Children addressing gaps from 40→25 stage consolidation
-- Created: 2026-01-18
-- Triangulation: OpenAI + AntiGravity consensus applied
-- ============================================================================
-- Execute in Supabase SQL Editor OR via Node.js script
-- This follows LEO Protocol v4.3.3 database-first approach
-- ============================================================================

-- ============================================================================
-- PARENT ORCHESTRATOR: SD-LIFECYCLE-GAP-000
-- ============================================================================

INSERT INTO strategic_directives_v2 (
    id,
    sd_key,
    title,
    category,
    priority,
    status,
    version,
    sd_type,
    relationship_type,
    description,
    rationale,
    scope,
    strategic_intent,
    success_criteria,
    risks,
    dependencies,
    success_metrics,
    stakeholders,
    metadata,
    target_application,
    current_phase,
    created_by
) VALUES (
    'SD-LIFECYCLE-GAP-000',
    'SD-LIFECYCLE-GAP-000',
    'Venture Lifecycle Gap Remediation - 25-Stage Model Hardening',
    'infrastructure',
    'critical',
    'draft',
    '1.0',
    'orchestrator',
    'parent',

    -- DESCRIPTION
    'Orchestrator SD to address 5 gaps identified when consolidating from 40-stage to 25-stage venture lifecycle model. Triangulation with OpenAI and AntiGravity confirmed all 5 gaps are real and require remediation. The consensus approach is to HARDEN the 25-stage model (not expand it) through gates, continuous processes, and scope expansion of existing stages.',

    -- RATIONALE
    'BUSINESS RATIONALE:
- 40-stage model had explicit stages for retention, security, feature expansion, portfolio coordination, and risk forecasting
- 25-stage consolidation improved velocity but created blind spots in operational infrastructure
- Triangulation confirmed: SD-001 (Retention) and SD-002 (Security) are CRITICAL - can cause venture failure
- Without remediation, ventures may scale without retention infrastructure (churn destroys unit economics) or security posture (blocks enterprise sales)

TRIANGULATION CONSENSUS:
- OpenAI: "Add 1 new stage for Security & Compliance before Scaling, add gates in Scaling for retention/risk"
- AntiGravity: "Do NOT return to 40 stages. Harden the 25-stage model instead."
- Final Decision: Keep 25 stages, add gates and continuous processes',

    -- SCOPE
    'INCLUDED IN SCOPE:
1. SD-LIFECYCLE-GAP-001: Customer Success & Retention Engineering (CRITICAL)
   - Upgrade Stage 24 from artifact_only to sd_required
   - Rename to "Analytics, Feedback & Retention"
   - Define retention infrastructure requirements

2. SD-LIFECYCLE-GAP-002: Security & Compliance Certification (CRITICAL)
   - Add hard Compliance Gate at Stage 20 exit
   - Create compliance checklist (GDPR, SOC2, Privacy Policy)
   - Block Scaling phase entry without security baseline

3. SD-LIFECYCLE-GAP-003: Post-MVP Feature Expansion Framework (HIGH)
   - Define "Phase 7: The Orbit" as continuous post-Stage-25 lifecycle
   - Create Feature Loop that recurses stages 15-21
   - Document expansion vs exit decision criteria

4. SD-LIFECYCLE-GAP-004: Multi-Venture Portfolio Coordination (MEDIUM)
   - Implement "Secondary Outputs" requirement per stage
   - Define Capability Router protocol
   - Enable cross-venture capability sharing

5. SD-LIFECYCLE-GAP-005: Strategic Risk Forecasting (MEDIUM)
   - Add Risk Re-calibration checks at phase boundaries
   - Define escalation triggers per risk category
   - Integrate with venture health reviews

EXCLUDED FROM SCOPE:
- Adding new stages (keeping 25-stage count)
- Tier system changes
- EVA integration (future iteration)

TRIANGULATION APPROACH MAPPING:
| SD | Approach | Source |
|----|----------|--------|
| 001 | B+D (gates + continuous) | OpenAI + AntiGravity |
| 002 | B (hard gate at Stage 20) | AntiGravity |
| 003 | D (Phase 7: The Orbit) | AntiGravity |
| 004 | D (Secondary Outputs) | AntiGravity |
| 005 | B (phase boundary gates) | OpenAI + AntiGravity |',

    -- STRATEGIC INTENT
    'STRATEGIC ALIGNMENT:
Transform the 25-stage venture lifecycle from a "happy path" model into a comprehensive operational framework that ensures ventures are enterprise-ready, retention-optimized, and continuously monitored.

ORGANIZATIONAL IMPACT:
- Quality ventures: Retention and security infrastructure built during development, not retrofitted
- Enterprise-ready: Security certification gate ensures ventures can sell to enterprise customers
- Sustainable growth: Feature expansion framework prevents product stagnation
- Portfolio leverage: Capability sharing multiplies EHG investment across ventures
- Risk awareness: Continuous forecasting prevents surprise market disruptions

COMPETITIVE ADVANTAGE:
- Faster enterprise sales (security pre-validated)
- Higher NRR (retention infrastructure baked in)
- More ventures per founder (capability reuse)
- Better exit timing (risk forecasting informs decisions)',

    -- SUCCESS CRITERIA (JSONB array)
    jsonb_build_array(
        jsonb_build_object(
            'id', 'SC-001',
            'criterion', 'All 5 child SDs completed with full LEAD→PLAN→EXEC cycle',
            'measure', 'Database status = completed for all children, retrospectives created',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-002',
            'criterion', 'Stage 24 upgraded to sd_required with retention infrastructure scope',
            'measure', 'lifecycle_stage_config updated, documentation reflects new scope',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-003',
            'criterion', 'Stage 20 Compliance Gate implemented and blocking',
            'measure', 'Ventures cannot exit Stage 20 without compliance checklist completion',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-004',
            'criterion', 'Phase 7 "The Orbit" documented with Feature Loop process',
            'measure', 'Documentation in venture lifecycle guide, stages 15-21 recursion defined',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'SC-005',
            'criterion', 'Secondary Outputs requirement added to stage configurations',
            'measure', 'Each stage config includes capability_artifact output specification',
            'priority', 'MEDIUM'
        ),
        jsonb_build_object(
            'id', 'SC-006',
            'criterion', 'Risk Re-calibration gates at phase boundaries (3, 4, 5, 6)',
            'measure', 'Phase transition blocked without risk matrix review',
            'priority', 'MEDIUM'
        )
    ),

    -- RISKS (JSONB array)
    jsonb_build_array(
        jsonb_build_object(
            'risk', 'Over-complicating the 25-stage model defeats consolidation purpose',
            'severity', 'medium',
            'probability', 'medium',
            'mitigation', 'Add gates and processes, NOT new stages. Preserve simplicity.',
            'owner', 'LEAD'
        ),
        jsonb_build_object(
            'risk', 'Security gate too strict blocks legitimate ventures',
            'severity', 'medium',
            'probability', 'low',
            'mitigation', 'Tiered compliance: B2B enterprise = full SOC2, B2C = GDPR basics',
            'owner', 'PLAN'
        ),
        jsonb_build_object(
            'risk', 'Retention infrastructure scope creep into full CRM build',
            'severity', 'low',
            'probability', 'medium',
            'mitigation', 'Define minimum viable retention: health score + churn triggers only',
            'owner', 'PLAN'
        ),
        jsonb_build_object(
            'risk', 'Portfolio coordination overhead slows individual ventures',
            'severity', 'medium',
            'probability', 'medium',
            'mitigation', 'Make secondary outputs lightweight (metadata, not full documentation)',
            'owner', 'LEAD'
        )
    ),

    -- DEPENDENCIES (JSONB array)
    jsonb_build_array(
        jsonb_build_object(
            'dependency', 'Venture Lifecycle System (25-stage model)',
            'type', 'technical',
            'status', 'ready',
            'notes', 'Existing lifecycle_stage_config table and stage definitions'
        ),
        jsonb_build_object(
            'dependency', 'Quality Lifecycle System',
            'type', 'technical',
            'status', 'ready',
            'notes', 'Feedback table and SD integration patterns available for reference'
        ),
        jsonb_build_object(
            'dependency', 'Triangulation validation',
            'type', 'process',
            'status', 'completed',
            'notes', 'OpenAI and AntiGravity consensus captured 2026-01-18'
        )
    ),

    -- SUCCESS METRICS (JSONB object)
    jsonb_build_object(
        'implementation', jsonb_build_object(
            'total_child_sds', 5,
            'critical_sds', 2,
            'high_sds', 1,
            'medium_sds', 2
        ),
        'quality', jsonb_build_object(
            'child_completion_rate', '100%',
            'gates_implemented', 3,
            'continuous_processes_defined', 2
        ),
        'business', jsonb_build_object(
            'stages_modified', '2 (Stage 20, Stage 24)',
            'new_stages_added', 0,
            'model_complexity_change', 'minimal (gates only)'
        )
    ),

    -- STAKEHOLDERS (JSONB array)
    jsonb_build_array(
        jsonb_build_object(
            'name', 'Chairman',
            'role', 'Executive Sponsor',
            'involvement', 'Final approval of lifecycle changes',
            'contact', 'Primary stakeholder'
        ),
        jsonb_build_object(
            'name', 'LEAD Agent',
            'role', 'Strategic Validator',
            'involvement', 'Each child SD requires LEAD approval',
            'contact', 'LEO Protocol agent'
        ),
        jsonb_build_object(
            'name', 'Venture Founders',
            'role', 'End Users',
            'involvement', 'Will use updated lifecycle for all ventures',
            'contact', 'EHG venture creators'
        )
    ),

    -- METADATA
    jsonb_build_object(
        'triangulation', jsonb_build_object(
            'date', '2026-01-18',
            'participants', jsonb_build_array('Claude', 'OpenAI', 'AntiGravity'),
            'consensus', 'Harden 25-stage model with gates and continuous processes',
            'key_decisions', jsonb_build_array(
                'Keep 25 stages (do not expand)',
                'Upgrade Stage 24 to sd_required',
                'Add Compliance Gate at Stage 20',
                'Define Phase 7: The Orbit for post-launch',
                'Implement Secondary Outputs for portfolio coordination'
            )
        ),
        'child_sd_order', jsonb_build_array(
            'SD-LIFECYCLE-GAP-002',
            'SD-LIFECYCLE-GAP-001',
            'SD-LIFECYCLE-GAP-003',
            'SD-LIFECYCLE-GAP-005',
            'SD-LIFECYCLE-GAP-004'
        ),
        'estimated_effort_weeks', 4,
        'complexity', 'MEDIUM'
    ),

    -- TARGET APPLICATION
    'EHG',

    -- CURRENT PHASE
    'LEAD_APPROVAL',

    -- CREATED BY
    'human:Chairman'
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    rationale = EXCLUDED.rationale,
    scope = EXCLUDED.scope,
    strategic_intent = EXCLUDED.strategic_intent,
    success_criteria = EXCLUDED.success_criteria,
    risks = EXCLUDED.risks,
    dependencies = EXCLUDED.dependencies,
    success_metrics = EXCLUDED.success_metrics,
    metadata = EXCLUDED.metadata,
    updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- CHILD 1: SD-LIFECYCLE-GAP-001 - Customer Success & Retention Engineering
-- Priority: CRITICAL | Triangulation Rank: #1-2 (tied with Security)
-- ============================================================================

INSERT INTO strategic_directives_v2 (
    id,
    sd_key,
    title,
    category,
    priority,
    status,
    version,
    sd_type,
    relationship_type,
    parent_sd_id,
    dependency_chain,
    description,
    rationale,
    scope,
    strategic_intent,
    success_criteria,
    risks,
    dependencies,
    success_metrics,
    metadata,
    target_application,
    current_phase,
    created_by
) VALUES (
    'SD-LIFECYCLE-GAP-001',
    'SD-LIFECYCLE-GAP-001',
    'Customer Success & Retention Engineering',
    'infrastructure',
    'critical',
    'draft',
    '1.0',
    'feature',
    'child',
    'SD-LIFECYCLE-GAP-000',
    '["SD-LIFECYCLE-GAP-002"]'::jsonb,

    -- DESCRIPTION
    'Address the missing customer success infrastructure in the 25-stage model. The 40-stage model had explicit stages for retention (Stage 20: Customer Success & Support Infrastructure, Stage 32: Customer Retention Programs). The current model only has Stage 12 (Sales & Success Logic - artifact only) and Stage 24 (Analytics & Feedback - artifact only). This SD upgrades Stage 24 to sd_required and expands its scope to include retention infrastructure.',

    -- RATIONALE
    'TRIANGULATION CONSENSUS:
- OpenAI: "YES gap. Retention is implied in scaling, but not explicit enough to drive systems (health scoring, churn loops)."
- AntiGravity: "YES, SIGNIFICANT gap. There is no stage where the code for retention is actually built."
- Both recommend: B+D (gates within existing stages + continuous process)
- Specific fix: "Rename Stage 24 to Analytics, Feedback & Retention and upgrade from artifact_only to sd_required"

BUSINESS IMPACT:
- Without retention infrastructure, ventures fill a leaky bucket
- High churn destroys SaaS unit economics (CAC payback impossible)
- NRR metrics tracked but no systems to improve them',

    -- SCOPE
    'INCLUDED:
1. Upgrade Stage 24 from artifact_only to sd_required
2. Rename Stage 24 to "Analytics, Feedback & Retention"
3. Define retention infrastructure requirements:
   - Customer health scoring system (engagement metrics → score)
   - Churn prediction triggers (usage patterns → alerts)
   - Retention program framework (intervention playbooks)
4. Add retention gates to Scaling phase entry

EXCLUDED:
- Full CRM implementation (future iteration)
- Customer support tooling (Zendesk/Intercom)
- Onboarding flow automation (separate SD)

DELIVERABLES:
- Updated lifecycle_stage_config for Stage 24
- Retention infrastructure requirements document
- Health scoring algorithm specification
- Churn trigger definitions',

    -- STRATEGIC INTENT
    'Ensure every EHG venture has minimum viable retention infrastructure before scaling. Retention is not optional - it is the foundation of sustainable SaaS economics.',

    -- SUCCESS CRITERIA
    jsonb_build_array(
        jsonb_build_object(
            'id', 'SC-001',
            'criterion', 'Stage 24 upgraded to sd_required in lifecycle_stage_config',
            'measure', 'Database query confirms stage_type = sd_required',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-002',
            'criterion', 'Customer health scoring framework documented',
            'measure', 'Framework includes: input metrics, scoring algorithm, thresholds',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-003',
            'criterion', 'Churn prediction triggers defined',
            'measure', 'At least 5 trigger conditions with response playbooks',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'SC-004',
            'criterion', 'Retention gate blocks Scaling phase without health system',
            'measure', 'Phase 4 entry requires retention_infrastructure_ready = true',
            'priority', 'HIGH'
        )
    ),

    -- RISKS
    jsonb_build_array(
        jsonb_build_object(
            'risk', 'Scope creep into full CRM implementation',
            'severity', 'medium',
            'probability', 'medium',
            'mitigation', 'Strict scope: health score + churn triggers only. CRM is separate SD.',
            'owner', 'PLAN'
        ),
        jsonb_build_object(
            'risk', 'Retention requirements too strict for early-stage ventures',
            'severity', 'low',
            'probability', 'medium',
            'mitigation', 'Tier requirements: pre-PMF = manual tracking, post-PMF = automated',
            'owner', 'LEAD'
        )
    ),

    -- DEPENDENCIES
    jsonb_build_array(
        jsonb_build_object(
            'dependency', 'SD-LIFECYCLE-GAP-002 (Security)',
            'type', 'technical',
            'status', 'required',
            'notes', 'AntiGravity: "Retention data triggers privacy/compliance concerns. Security baseline must be solid first."'
        ),
        jsonb_build_object(
            'dependency', 'lifecycle_stage_config table',
            'type', 'technical',
            'status', 'ready',
            'notes', 'Existing table for stage configuration'
        )
    ),

    -- SUCCESS METRICS
    jsonb_build_object(
        'target_nrr', '>120%',
        'target_monthly_churn', '<5%',
        'health_score_coverage', '100% of active users'
    ),

    -- METADATA
    jsonb_build_object(
        'triangulation_rank', 2,
        'triangulation_approach', 'B+D (gates + continuous)',
        'affected_stages', jsonb_build_array(24),
        'estimated_effort_days', 5
    ),

    'EHG',
    'LEAD_APPROVAL',
    'human:Chairman'
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    rationale = EXCLUDED.rationale,
    scope = EXCLUDED.scope,
    success_criteria = EXCLUDED.success_criteria,
    risks = EXCLUDED.risks,
    dependencies = EXCLUDED.dependencies,
    dependency_chain = EXCLUDED.dependency_chain,
    metadata = EXCLUDED.metadata,
    updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- CHILD 2: SD-LIFECYCLE-GAP-002 - Security & Compliance Certification
-- Priority: CRITICAL | Triangulation Rank: #1
-- ============================================================================

INSERT INTO strategic_directives_v2 (
    id,
    sd_key,
    title,
    category,
    priority,
    status,
    version,
    sd_type,
    relationship_type,
    parent_sd_id,
    dependency_chain,
    description,
    rationale,
    scope,
    strategic_intent,
    success_criteria,
    risks,
    dependencies,
    success_metrics,
    metadata,
    target_application,
    current_phase,
    created_by
) VALUES (
    'SD-LIFECYCLE-GAP-002',
    'SD-LIFECYCLE-GAP-002',
    'Security & Compliance Certification Gate',
    'infrastructure',
    'critical',
    'draft',
    '1.0',
    'feature',
    'child',
    'SD-LIFECYCLE-GAP-000',
    NULL,

    -- DESCRIPTION
    'Add a hard Compliance Gate at Stage 20 exit to ensure ventures have enterprise-ready security posture before scaling. Stage 20 (Security & Performance) exists but is a "catch-all" that does not enforce compliance certification artifacts. This SD adds strict exit criteria requiring GDPR data map, privacy policy, and SOC2 scope documentation.',

    -- RATIONALE
    'TRIANGULATION CONSENSUS:
- OpenAI: "YES gap. This is a true blind spot. Enterprise sales can be blocked outright." Ranked #1 criticality.
- AntiGravity: "PARTIAL gap. Stage 20 exists but is not enforcing compliance artifacts."
- Both recommend: B (hard gate at Stage 20 exit)
- OpenAI suggested adding a new stage; AntiGravity countered that a gate is sufficient.
- Final decision: Gate, not new stage (preserves 25-stage simplicity).

BUSINESS IMPACT:
- Without security certification, ventures cannot sell to enterprise customers
- B2B SaaS deals blocked by procurement security questionnaires
- Retrofitting security is 5-10x more expensive than building it in',

    -- SCOPE
    'INCLUDED:
1. Add Compliance Gate at Stage 20 exit
2. Define compliance checklist by target market:
   - B2B Enterprise: SOC2 Type I scope, GDPR data map, privacy policy
   - B2B SMB: GDPR basics, privacy policy
   - B2C: GDPR compliance, privacy policy, terms of service
3. Create compliance artifact templates
4. Block Scaling phase entry without compliance gate pass

EXCLUDED:
- Actual SOC2 audit (external process)
- HIPAA compliance (healthcare-specific, separate SD)
- PCI-DSS (payment processing, separate SD)

DELIVERABLES:
- Compliance Gate implementation in Stage 20
- Compliance checklist by venture archetype
- Artifact templates (GDPR data map, privacy policy, SOC2 scope)
- Gate blocking logic for phase transition',

    -- STRATEGIC INTENT
    'Ensure every EHG venture is enterprise-ready before scaling. Security is not a feature - it is a requirement for enterprise sales.',

    -- SUCCESS CRITERIA
    jsonb_build_array(
        jsonb_build_object(
            'id', 'SC-001',
            'criterion', 'Compliance Gate blocks Stage 20 exit without checklist completion',
            'measure', 'Ventures cannot progress to Stage 21+ without gate pass',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-002',
            'criterion', 'Compliance checklist covers B2B Enterprise, B2B SMB, and B2C archetypes',
            'measure', 'Three distinct checklists with appropriate requirements per archetype',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-003',
            'criterion', 'GDPR data map template created and integrated',
            'measure', 'Template available in venture creation workflow',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'SC-004',
            'criterion', 'SOC2 scope document template created',
            'measure', 'Template guides ventures on what controls to implement',
            'priority', 'HIGH'
        )
    ),

    -- RISKS
    jsonb_build_array(
        jsonb_build_object(
            'risk', 'Gate too strict blocks legitimate early-stage ventures',
            'severity', 'medium',
            'probability', 'low',
            'mitigation', 'Tiered requirements: B2C ventures have lighter checklist',
            'owner', 'LEAD'
        ),
        jsonb_build_object(
            'risk', 'Compliance templates become outdated as regulations change',
            'severity', 'low',
            'probability', 'medium',
            'mitigation', 'Annual review of templates, version control on artifacts',
            'owner', 'PLAN'
        )
    ),

    -- DEPENDENCIES
    jsonb_build_array(
        jsonb_build_object(
            'dependency', 'Stage 20 (Security & Performance)',
            'type', 'technical',
            'status', 'ready',
            'notes', 'Existing stage, adding gate at exit'
        ),
        jsonb_build_object(
            'dependency', 'Venture archetype classification',
            'type', 'technical',
            'status', 'ready',
            'notes', 'ventures.archetype field exists for B2B/B2C classification'
        )
    ),

    -- SUCCESS METRICS
    jsonb_build_object(
        'gate_pass_rate', '>90% (ventures should be prepared)',
        'enterprise_sales_unblocked', '100% (no security rejections)',
        'compliance_artifacts_created', '3 templates minimum'
    ),

    -- METADATA
    jsonb_build_object(
        'triangulation_rank', 1,
        'triangulation_approach', 'B (hard gate)',
        'affected_stages', jsonb_build_array(20),
        'estimated_effort_days', 4
    ),

    'EHG',
    'LEAD_APPROVAL',
    'human:Chairman'
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    rationale = EXCLUDED.rationale,
    scope = EXCLUDED.scope,
    success_criteria = EXCLUDED.success_criteria,
    risks = EXCLUDED.risks,
    dependencies = EXCLUDED.dependencies,
    metadata = EXCLUDED.metadata,
    updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- CHILD 3: SD-LIFECYCLE-GAP-003 - Post-MVP Feature Expansion Framework
-- Priority: HIGH | Triangulation Rank: #3
-- ============================================================================

INSERT INTO strategic_directives_v2 (
    id,
    sd_key,
    title,
    category,
    priority,
    status,
    version,
    sd_type,
    relationship_type,
    parent_sd_id,
    dependency_chain,
    description,
    rationale,
    scope,
    strategic_intent,
    success_criteria,
    risks,
    dependencies,
    success_metrics,
    metadata,
    target_application,
    current_phase,
    created_by
) VALUES (
    'SD-LIFECYCLE-GAP-003',
    'SD-LIFECYCLE-GAP-003',
    'Post-MVP Feature Expansion Framework (Phase 7: The Orbit)',
    'infrastructure',
    'high',
    'draft',
    '1.0',
    'feature',
    'child',
    'SD-LIFECYCLE-GAP-000',
    '["SD-LIFECYCLE-GAP-001", "SD-LIFECYCLE-GAP-002"]'::jsonb,

    -- DESCRIPTION
    'Define "Phase 7: The Orbit" as the continuous post-Stage-25 lifecycle for active ventures. The 40-stage model had 10 stages (31-40) for Growth/Optimization. The 25-stage model compresses this to one stage (Stage 25: Optimization & Scale). This SD creates the Feature Loop - a recursive process through stages 15-21 for post-launch feature development.',

    -- RATIONALE
    'TRIANGULATION CONSENSUS:
- OpenAI: "PARTIAL gap. Scaling implies ongoing iteration, but no explicit framework exists."
- AntiGravity: "YES gap. The model assumes linear progression to launch, then... optimize. You cannot stage infinite feature development. It is a cycle."
- Both recommend: D (continuous process outside stage framework)
- AntiGravity proposed: "Define Phase 7: The Orbit as post-Stage-25 lifecycle using The Build Loop recursion"

BUSINESS IMPACT:
- Without feature expansion framework, products stagnate after launch
- Market feedback → roadmap pipeline is undefined
- Ventures drift without clear expansion vs. exit decision criteria',

    -- SCOPE
    'INCLUDED:
1. Define "Phase 7: The Orbit" as implicit post-Stage-25 lifecycle
2. Create "The Feature Loop" - recursive stages 15-21:
   - Stage 15: User Stories (new feature definition)
   - Stage 16: Schema Design (data model changes)
   - Stage 17: Environment Setup (if needed)
   - Stage 18: MVP Development (feature implementation)
   - Stage 19: Integration & API (connect to existing systems)
   - Stage 20: Security & Performance (validate new code)
   - Stage 21: QA & Testing (regression + new feature tests)
3. Document expansion vs. exit decision criteria
4. Define Feature Loop entry triggers (market feedback, metrics, roadmap)

EXCLUDED:
- EVA integration for feature prioritization (future iteration)
- Automatic stage execution (manual process)
- Exit strategy implementation (separate SD)

DELIVERABLES:
- Phase 7 "The Orbit" documentation
- Feature Loop process definition
- Expansion vs Exit decision tree
- Feature prioritization framework',

    -- STRATEGIC INTENT
    'Ensure active ventures have a clear framework for continuous improvement without requiring full lifecycle restart. Prevent product stagnation through structured iteration.',

    -- SUCCESS CRITERIA
    jsonb_build_array(
        jsonb_build_object(
            'id', 'SC-001',
            'criterion', 'Phase 7 "The Orbit" documented in venture lifecycle guide',
            'measure', 'Documentation exists with clear entry/exit criteria',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-002',
            'criterion', 'Feature Loop stages 15-21 recursion defined',
            'measure', 'Process document shows how to re-enter and exit the loop',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-003',
            'criterion', 'Expansion vs Exit decision tree created',
            'measure', 'Decision tree with measurable criteria (growth rate, market opportunity, ROI)',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'SC-004',
            'criterion', 'Feature prioritization framework documented',
            'measure', 'Framework for ranking features by impact and effort',
            'priority', 'MEDIUM'
        )
    ),

    -- RISKS
    jsonb_build_array(
        jsonb_build_object(
            'risk', 'Feature Loop becomes bureaucratic overhead',
            'severity', 'medium',
            'probability', 'medium',
            'mitigation', 'Keep lightweight - not all stages required for every feature. Small features skip Schema/Env stages.',
            'owner', 'PLAN'
        ),
        jsonb_build_object(
            'risk', 'Ventures stay in Orbit indefinitely, never exit',
            'severity', 'low',
            'probability', 'medium',
            'mitigation', 'Decision tree includes time-based triggers for exit evaluation',
            'owner', 'LEAD'
        )
    ),

    -- DEPENDENCIES
    jsonb_build_array(
        jsonb_build_object(
            'dependency', 'SD-LIFECYCLE-GAP-001 (Retention)',
            'type', 'process',
            'status', 'required',
            'notes', 'Retention data informs feature expansion priorities'
        ),
        jsonb_build_object(
            'dependency', 'SD-LIFECYCLE-GAP-002 (Security)',
            'type', 'process',
            'status', 'required',
            'notes', 'Security baseline required before feature expansion'
        ),
        jsonb_build_object(
            'dependency', 'Existing Build Loop (Phase 5)',
            'type', 'technical',
            'status', 'ready',
            'notes', 'Feature Loop reuses existing stage definitions'
        )
    ),

    -- SUCCESS METRICS
    jsonb_build_object(
        'feature_loop_adoption', '100% of active ventures',
        'average_loop_duration', '2-4 weeks per feature',
        'exit_decision_clarity', '>90% Chairman confidence'
    ),

    -- METADATA
    jsonb_build_object(
        'triangulation_rank', 3,
        'triangulation_approach', 'D (continuous process)',
        'affected_stages', jsonb_build_array(15, 16, 17, 18, 19, 20, 21),
        'estimated_effort_days', 5
    ),

    'EHG',
    'LEAD_APPROVAL',
    'human:Chairman'
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    rationale = EXCLUDED.rationale,
    scope = EXCLUDED.scope,
    success_criteria = EXCLUDED.success_criteria,
    risks = EXCLUDED.risks,
    dependencies = EXCLUDED.dependencies,
    dependency_chain = EXCLUDED.dependency_chain,
    metadata = EXCLUDED.metadata,
    updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- CHILD 4: SD-LIFECYCLE-GAP-004 - Multi-Venture Portfolio Coordination
-- Priority: MEDIUM | Triangulation Rank: #5
-- ============================================================================

INSERT INTO strategic_directives_v2 (
    id,
    sd_key,
    title,
    category,
    priority,
    status,
    version,
    sd_type,
    relationship_type,
    parent_sd_id,
    dependency_chain,
    description,
    rationale,
    scope,
    strategic_intent,
    success_criteria,
    risks,
    dependencies,
    success_metrics,
    metadata,
    target_application,
    current_phase,
    created_by
) VALUES (
    'SD-LIFECYCLE-GAP-004',
    'SD-LIFECYCLE-GAP-004',
    'Multi-Venture Portfolio Coordination (Capability Router)',
    'infrastructure',
    'medium',
    'draft',
    '1.0',
    'feature',
    'child',
    'SD-LIFECYCLE-GAP-000',
    '["SD-LIFECYCLE-GAP-003"]'::jsonb,

    -- DESCRIPTION
    'Implement cross-venture capability sharing through "Secondary Outputs" requirement per stage. The 40-stage model had explicit multi-venture coordination (Stage 39). EHG''s capability lattice philosophy requires ventures to share capabilities, but there is no mechanism in the 25-stage model. This SD adds capability artifact outputs to each stage and defines the Capability Router protocol.',

    -- RATIONALE
    'TRIANGULATION CONSENSUS:
- OpenAI: "YES gap but structural - not per-venture lifecycle. Coordination happens across ventures, not inside one lifecycle."
- AntiGravity: "YES (new capability). Neither model explicitly handled this. This comes from the Capability Lattice insight."
- Both recommend: D (continuous process / architecture outside stage framework)
- AntiGravity proposed: "Add Secondary Output requirement to every stage. E.g., Stage 7 (Pricing) must output reusable Pricing Model Component to Capability Library."

BUSINESS IMPACT:
- Without coordination, EHG misses synergies across ventures
- Duplicated effort: same capabilities rebuilt multiple times
- Capability lattice philosophy not operationalized',

    -- SCOPE
    'INCLUDED:
1. Define "Secondary Output" requirement per stage
2. Create Capability Artifact specification (lightweight metadata)
3. Implement Capability Library structure
4. Define Capability Router protocol (how ventures discover shared capabilities)
5. Update stage configurations with secondary_output field

EXCLUDED:
- Full capability marketplace (future iteration)
- Automated capability detection (manual for now)
- Cross-venture dependency management (separate SD)

DELIVERABLES:
- Secondary Output specification per stage
- Capability Artifact schema
- Capability Library structure (database table or file structure)
- Router protocol documentation',

    -- STRATEGIC INTENT
    'Enable EHG capability lattice philosophy by making capability sharing explicit in the venture lifecycle. Every stage should contribute to the shared capability library.',

    -- SUCCESS CRITERIA
    jsonb_build_array(
        jsonb_build_object(
            'id', 'SC-001',
            'criterion', 'Secondary Output requirement defined for all 25 stages',
            'measure', 'Each stage has documented capability artifact output',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-002',
            'criterion', 'Capability Library structure implemented',
            'measure', 'Database table or file structure for storing artifacts',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'SC-003',
            'criterion', 'Capability Router protocol documented',
            'measure', 'Protocol describes how ventures discover and use shared capabilities',
            'priority', 'MEDIUM'
        ),
        jsonb_build_object(
            'id', 'SC-004',
            'criterion', 'At least 3 stages have artifacts populated from existing ventures',
            'measure', 'Proof of concept with real capability artifacts',
            'priority', 'MEDIUM'
        )
    ),

    -- RISKS
    jsonb_build_array(
        jsonb_build_object(
            'risk', 'Secondary outputs become bureaucratic overhead',
            'severity', 'medium',
            'probability', 'high',
            'mitigation', 'Make outputs lightweight metadata, not full documentation. 5-10 fields max.',
            'owner', 'PLAN'
        ),
        jsonb_build_object(
            'risk', 'Capability artifacts become stale/unmaintained',
            'severity', 'low',
            'probability', 'medium',
            'mitigation', 'Link artifacts to venture status - archive when venture exits',
            'owner', 'PLAN'
        )
    ),

    -- DEPENDENCIES
    jsonb_build_array(
        jsonb_build_object(
            'dependency', 'SD-LIFECYCLE-GAP-003 (Feature Expansion)',
            'type', 'process',
            'status', 'required',
            'notes', 'Feature Loop generates new capabilities that should be shared'
        ),
        jsonb_build_object(
            'dependency', 'Capability Ledger v2 (existing)',
            'type', 'technical',
            'status', 'ready',
            'notes', 'Existing capability_ledger_v2 table can be extended'
        )
    ),

    -- SUCCESS METRICS
    jsonb_build_object(
        'capability_reuse_rate', '>20% (capabilities used by 2+ ventures)',
        'time_saved_per_reuse', '2-5 days per capability',
        'library_growth_rate', '5+ new artifacts per month'
    ),

    -- METADATA
    jsonb_build_object(
        'triangulation_rank', 5,
        'triangulation_approach', 'D (continuous process)',
        'affected_stages', 'All 25',
        'estimated_effort_days', 6
    ),

    'EHG',
    'LEAD_APPROVAL',
    'human:Chairman'
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    rationale = EXCLUDED.rationale,
    scope = EXCLUDED.scope,
    success_criteria = EXCLUDED.success_criteria,
    risks = EXCLUDED.risks,
    dependencies = EXCLUDED.dependencies,
    dependency_chain = EXCLUDED.dependency_chain,
    metadata = EXCLUDED.metadata,
    updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- CHILD 5: SD-LIFECYCLE-GAP-005 - Strategic Risk Forecasting
-- Priority: MEDIUM | Triangulation Rank: #4
-- ============================================================================

INSERT INTO strategic_directives_v2 (
    id,
    sd_key,
    title,
    category,
    priority,
    status,
    version,
    sd_type,
    relationship_type,
    parent_sd_id,
    dependency_chain,
    description,
    rationale,
    scope,
    strategic_intent,
    success_criteria,
    risks,
    dependencies,
    success_metrics,
    metadata,
    target_application,
    current_phase,
    created_by
) VALUES (
    'SD-LIFECYCLE-GAP-005',
    'SD-LIFECYCLE-GAP-005',
    'Strategic Risk Forecasting (Phase Boundary Gates)',
    'infrastructure',
    'medium',
    'draft',
    '1.0',
    'feature',
    'child',
    'SD-LIFECYCLE-GAP-000',
    '["SD-LIFECYCLE-GAP-002"]'::jsonb,

    -- DESCRIPTION
    'Add Risk Re-calibration gates at phase boundaries to ensure ventures continuously monitor strategic risks. The 40-stage model had explicit strategic risk forecasting (Stage 37). Both models have Risk Evaluation at Stage 6, but neither has ongoing risk monitoring later. This SD adds mandatory risk matrix review at phase transitions (entry to Phases 3, 4, 5, 6).',

    -- RATIONALE
    'TRIANGULATION CONSENSUS:
- OpenAI: "YES gap. Active ventures need ongoing risk monitoring, but no definition of when/how this happens."
- AntiGravity: "YES gap. Risk rots. Stage 6 risk matrices are obsolete by Stage 20."
- Both recommend: B+D (gates at phase boundaries + continuous monitoring)
- AntiGravity proposed: "Add Risk Re-calibration mandatory check at the start of every Phase Boundary (Phases 3, 4, 5, 6)"

BUSINESS IMPACT:
- Without ongoing risk monitoring, ventures are surprised by market changes
- Stage 6 risk assessment becomes stale as venture evolves
- Exit timing decisions made without current risk context',

    -- SCOPE
    'INCLUDED:
1. Add Risk Re-calibration gate at phase boundaries (3, 4, 5, 6)
2. Define risk categories requiring review:
   - Market risk (competition, demand changes)
   - Technical risk (architecture, scalability)
   - Financial risk (burn rate, revenue)
   - Operational risk (team, processes)
3. Create escalation triggers by risk category
4. Integrate with Chairman review cadence

EXCLUDED:
- Automated risk detection (manual review for now)
- Risk scoring algorithms (qualitative assessment)
- External market monitoring tools integration

DELIVERABLES:
- Phase boundary gate implementation
- Risk Re-calibration checklist
- Escalation trigger definitions
- Review cadence documentation',

    -- STRATEGIC INTENT
    'Ensure active ventures continuously recalibrate risk assessment as they progress through phases. Risk is not static - it evolves with the venture.',

    -- SUCCESS CRITERIA
    jsonb_build_array(
        jsonb_build_object(
            'id', 'SC-001',
            'criterion', 'Risk Re-calibration gate blocks phase transitions without review',
            'measure', 'Ventures cannot enter Phase 3, 4, 5, or 6 without risk matrix update',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-002',
            'criterion', 'Risk categories defined with review criteria',
            'measure', 'Four categories (market, technical, financial, operational) with checklists',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'SC-003',
            'criterion', 'Escalation triggers documented',
            'measure', 'Clear criteria for when to escalate to Chairman review',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'SC-004',
            'criterion', 'Chairman review cadence defined for active ventures',
            'measure', 'Quarterly or phase-based review schedule',
            'priority', 'MEDIUM'
        )
    ),

    -- RISKS
    jsonb_build_array(
        jsonb_build_object(
            'risk', 'Risk gates become checkbox exercise without real analysis',
            'severity', 'medium',
            'probability', 'medium',
            'mitigation', 'Require delta from previous assessment - what changed and why',
            'owner', 'LEAD'
        ),
        jsonb_build_object(
            'risk', 'Too many escalations overwhelm Chairman',
            'severity', 'low',
            'probability', 'low',
            'mitigation', 'Tiered escalation: only critical risks require immediate Chairman attention',
            'owner', 'PLAN'
        )
    ),

    -- DEPENDENCIES
    jsonb_build_array(
        jsonb_build_object(
            'dependency', 'SD-LIFECYCLE-GAP-002 (Security)',
            'type', 'process',
            'status', 'required',
            'notes', 'Security risk is part of risk assessment framework'
        ),
        jsonb_build_object(
            'dependency', 'Existing Stage 6 Risk Evaluation',
            'type', 'technical',
            'status', 'ready',
            'notes', 'Build on existing risk matrix format'
        )
    ),

    -- SUCCESS METRICS
    jsonb_build_object(
        'risk_review_compliance', '100% at phase boundaries',
        'escalation_accuracy', '>80% (escalations are actionable)',
        'surprise_rate', '<10% (unexpected market events)'
    ),

    -- METADATA
    jsonb_build_object(
        'triangulation_rank', 4,
        'triangulation_approach', 'B+D (gates + continuous)',
        'affected_phases', jsonb_build_array(3, 4, 5, 6),
        'estimated_effort_days', 4
    ),

    'EHG',
    'LEAD_APPROVAL',
    'human:Chairman'
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    rationale = EXCLUDED.rationale,
    scope = EXCLUDED.scope,
    success_criteria = EXCLUDED.success_criteria,
    risks = EXCLUDED.risks,
    dependencies = EXCLUDED.dependencies,
    dependency_chain = EXCLUDED.dependency_chain,
    metadata = EXCLUDED.metadata,
    updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify parent SD
SELECT id, sd_key, title, relationship_type, sd_type, status
FROM strategic_directives_v2
WHERE id = 'SD-LIFECYCLE-GAP-000';

-- Verify all children
SELECT id, sd_key, title, relationship_type, parent_sd_id, priority, dependency_chain
FROM strategic_directives_v2
WHERE parent_sd_id = 'SD-LIFECYCLE-GAP-000'
ORDER BY priority DESC, id;

-- Verify hierarchy
SELECT
    p.sd_key as parent,
    c.sd_key as child,
    c.priority,
    c.dependency_chain
FROM strategic_directives_v2 p
JOIN strategic_directives_v2 c ON c.parent_sd_id = p.id
WHERE p.id = 'SD-LIFECYCLE-GAP-000'
ORDER BY c.priority DESC;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Venture Lifecycle Gap Remediation SDs Created Successfully!';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'PARENT ORCHESTRATOR:';
  RAISE NOTICE '  SD-LIFECYCLE-GAP-000: Venture Lifecycle Gap Remediation';
  RAISE NOTICE '';
  RAISE NOTICE 'CHILD SDs (in triangulation priority order):';
  RAISE NOTICE '  1. SD-LIFECYCLE-GAP-002: Security & Compliance (CRITICAL) - no deps';
  RAISE NOTICE '  2. SD-LIFECYCLE-GAP-001: Customer Success (CRITICAL) - deps: 002';
  RAISE NOTICE '  3. SD-LIFECYCLE-GAP-003: Feature Expansion (HIGH) - deps: 001, 002';
  RAISE NOTICE '  4. SD-LIFECYCLE-GAP-005: Risk Forecasting (MEDIUM) - deps: 002';
  RAISE NOTICE '  5. SD-LIFECYCLE-GAP-004: Portfolio Coordination (MEDIUM) - deps: 003';
  RAISE NOTICE '';
  RAISE NOTICE 'EXECUTION ORDER (based on dependencies):';
  RAISE NOTICE '  Phase 1: SD-LIFECYCLE-GAP-002 (Security) - no dependencies';
  RAISE NOTICE '  Phase 2: SD-LIFECYCLE-GAP-001 (Retention) + SD-LIFECYCLE-GAP-005 (Risk)';
  RAISE NOTICE '  Phase 3: SD-LIFECYCLE-GAP-003 (Feature Expansion)';
  RAISE NOTICE '  Phase 4: SD-LIFECYCLE-GAP-004 (Portfolio Coordination)';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '  1. LEAD approval for parent SD: npm run sd:start SD-LIFECYCLE-GAP-000';
  RAISE NOTICE '  2. LEAD approval for first child: SD-LIFECYCLE-GAP-002 (Security)';
  RAISE NOTICE '  3. Execute children in dependency order';
  RAISE NOTICE '';
  RAISE NOTICE 'TRIANGULATION APPLIED:';
  RAISE NOTICE '  - OpenAI and AntiGravity consensus captured';
  RAISE NOTICE '  - Keep 25 stages (no expansion)';
  RAISE NOTICE '  - Add gates and continuous processes';
  RAISE NOTICE '======================================================================';
END $$;
