# PRD Architecture Map


## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, unit

> **Purpose**: This map categorizes all 82 enhanced PRDs to clarify what needs to be built in Lovable (Platform) versus what becomes configuration data (Workflows) or AI orchestration (Agents).

## Architecture Categories Overview

### 🏗️ Platform PRDs (Build in Lovable - 19 PRDs)
The core EVA application infrastructure. These define React components, database schemas, authentication, and UI frameworks that developers build directly in code.

### 📋 Workflow PRDs (Store as Configuration - 40 PRDs)
The venture lifecycle processes that EVA orchestrates. These become JSON/JSONB configuration templates stored in the database and interpreted by EVA at runtime.

### 🤖 Agent PRDs (AI Orchestrators - 8 PRDs)
The intelligent agents that provide decision-making and automation capabilities. These define AI personalities, decision logic, and orchestration patterns.

### 🔄 Meta PRDs (Recursive Capabilities - 1 PRD)
Advanced capabilities where EVA generates or manages other systems, including the ability to generate PRDs for new ventures.

### 📚 Supporting PRDs (Cross-cutting Tools - 14 PRDs)
Utilities, frameworks, and tools that support multiple aspects of the platform but don't fit cleanly into other categories.

---

## 🏗️ PLATFORM PRDs (Build These First)

### Priority 1: Foundation (Week 1)
1. **stage_56_database_schema_enhanced.md** - Database Schema & Data Contracts ⭐ CRITICAL FOUNDATION
2. **stage_50_authentication_identity_enhanced.md** - Authentication & Identity Management
3. **stage_42_chairman_console_enhanced.md** - Chairman Executive Dashboard

### Priority 2: Core UI (Week 2)
4. **stage_48_navigation_ui_enhanced.md** - Navigation & UI Framework
5. **stage_55_design_system_enhanced.md** - Design System & Component Library
6. **stage_49_settings_personalization_enhanced.md** - Settings & Personalization

### Priority 3: Integration & Data (Week 3)
7. **stage_51_integration_hub_enhanced.md** - External Service Integration Hub
8. **stage_52_data_management_kb_enhanced.md** - Data Management & Knowledge Base
9. **stage_41_eva_assistant_orchestration_enhanced.md** - EVA Assistant & Master Orchestration

### Priority 4: Analytics & Communication (Week 4)
10. **stage_54_analytics_reports_insights_enhanced.md** - Analytics, Reports & Insights
11. **stage_53_notifications_collaboration_enhanced.md** - Notifications & Collaboration

### Priority 5: Quality & Compliance (Week 5)
12. **stage_58_testing_qa_enhanced.md** - Testing & Quality Assurance
13. **stage_59_governance_compliance_enhanced.md** - Governance & Compliance
14. **stage_57_user_stories_journeys_enhanced.md** - User Stories & Journey Mapping
15. **stage_60_onboarding_quickstart_enhanced.md** - User Onboarding & Quickstart

### Priority 6: Advanced UI Components (Week 6)
16. **stage_55_design_system_handcrafted_enhanced.md** - Handcrafted Design System Extensions
17. **stage_34_creative_media_handcrafted_enhanced.md** - Handcrafted Creative Media Components
18. **stage_32_customer_success_ai_enhanced.md** - Customer Success Dashboard (Platform side)
19. **stage_23_feedback_loops_ai_enhanced.md** - Feedback Loop Management Interface

---

## 📋 WORKFLOW PRDs (Configuration Data - 40 PRDs)

These define the venture lifecycle stages that EVA orchestrates. They will be stored as JSON configuration templates in the database.

### Venture Ideation & Validation (Stages 1-10)
1. **stage_01_draft_idea_enhanced.md** - Initial Venture Idea Capture
2. **stage_01_idea_generation_intelligence_enhanced.md** - AI-Powered Idea Generation
3. **stage_02_ai_review_enhanced.md** - AI Review & Initial Assessment
4. **stage_03_comprehensive_validation_enhanced.md** - Comprehensive Validation Suite
5. **stage_04_competitive_intelligence_enhanced.md** - Competitive Intelligence Analysis
6. **stage_04_competitive_intelligence_analysis_enhanced.md** - Deep Competitive Analysis
7. **stage_04_competitive_kpi_tracking_enhanced.md** - Competitive KPI Tracking
8. **stage_05_profitability_forecasting_enhanced.md** - Profitability & Financial Forecasting
9. **stage_06_risk_evaluation_enhanced.md** - Risk Assessment & Mitigation
10. **stage_07_comprehensive_planning_suite_enhanced.md** - Strategic Planning Suite
11. **stage_08_problem_decomposition_enhanced.md** - Problem Decomposition & Analysis
12. **stage_09_gap_analysis_enhanced.md** - Gap Analysis & Requirements
13. **stage_09_gap_analysis_intelligence_enhanced.md** - Intelligent Gap Analysis
14. **stage_10_technical_review_enhanced.md** - Technical Feasibility Review

### Venture Design & Naming (Stages 11-15)
15. **stage_11_strategic_naming_enhanced.md** - Strategic Venture Naming
16. **stage_12_adaptive_naming_enhanced.md** - Adaptive Naming Optimization
17. **stage_13_exit_oriented_design_enhanced.md** - Exit-Oriented Design Strategy
18. **stage_13_exit_readiness_tracking_enhanced.md** - Exit Readiness Tracking
19. **stage_14_development_preparation_enhanced.md** - Development Preparation
20. **stage_15_pricing_strategy_enhanced.md** - Pricing Strategy Development

### Development & Integration (Stages 18-30)
21. **stage_18_documentation_sync_enhanced.md** - Documentation Synchronization
22. **stage_19_integration_verification_enhanced.md** - Integration Verification
23. **stage_20_enhanced_context_loading_enhanced.md** - Enhanced Context Loading
24. **stage_21_preflight_check_enhanced.md** - Pre-launch Verification
25. **stage_22_iterative_dev_loop_enhanced.md** - Iterative Development Loop
26. **stage_23_feedback_loops_enhanced.md** - Feedback Loop Management
27. **stage_24_mvp_engine_iteration_enhanced.md** - MVP Engine Iteration
28. **stage_25_quality_assurance_enhanced.md** - Quality Assurance Process
29. **stage_26_security_compliance_enhanced.md** - Security & Compliance Validation
30. **stage_27_actor_model_saga_enhanced.md** - Actor Model & Saga Patterns
31. **stage_28_dev_excellence_caching_enhanced.md** - Development Excellence & Caching
32. **stage_29_final_polish_enhanced.md** - Final Polish & Optimization
33. **stage_30_production_deployment_enhanced.md** - Production Deployment

### Launch & Growth (Stages 31-40)
34. **stage_31_mvp_launch_enhanced.md** - MVP Launch Orchestration
35. **stage_32_customer_success_enhanced.md** - Customer Success Workflows
36. **stage_33_post_mvp_expansion_enhanced.md** - Post-MVP Expansion Strategy
37. **stage_35_gtm_timing_intelligence_enhanced.md** - Go-to-Market Timing Intelligence
38. **stage_36_parallel_exploration_enhanced.md** - Parallel Opportunity Exploration
39. **stage_37_strategic_risk_forecasting_enhanced.md** - Strategic Risk Forecasting
40. **stage_38_timing_optimization_enhanced.md** - Market Timing Optimization
41. **stage_39_multi_venture_coordination_enhanced.md** - Multi-Venture Coordination
42. **stage_40_portfolio_exit_sequencing_enhanced.md** - Portfolio Exit Sequencing
43. **stage_40_venture_active_enhanced.md** - Active Venture Management

---

## 🤖 AGENT PRDs (AI Orchestrators - 8 PRDs)

These define the AI agents that provide intelligence and automation within the platform.

1. **stage_16_ai_ceo_agent_enhanced.md** - AI CEO Agent (per company)
2. **stage_17_gtm_strategist_agent_enhanced.md** - GTM Strategist Agent
3. **stage_17_gtm_strategist_marketing_automation_enhanced.md** - Marketing Automation Agent
4. **stage_17_gtm_creative_assets_enhanced.md** - Creative Assets Generation Agent
5. **stage_43_ai_leadership_agents_enhanced.md** - AI Leadership Agent Suite
6. **stage_44_mvp_engine_enhanced.md** - MVP Engine Agent
7. **stage_45_development_excellence_enhanced.md** - Development Excellence Agent
8. **stage_46_deployment_ops_enhanced.md** - Deployment Operations Agent
9. **stage_47_strategic_intelligence_scaling_enhanced.md** - Strategic Intelligence Agent

---

## 🔄 META PRDs (Recursive Capabilities - 1 PRD)

Advanced capabilities where EVA generates or manages other systems.

1. **stage_61_venture_prd_generation_enhanced.md** - Venture PRD Generation Engine ⭐ META-CAPABILITY

---

## 📚 SUPPORTING PRDs (Cross-cutting Tools - 14 PRDs)

Utilities and frameworks that support multiple aspects of the platform.

### Integration & Intelligence Tools
1. **ai_ceo_competitive_intelligence_integration.md** - Competitive Intelligence Integration
2. **ai_ceo_exit_decision_integration.md** - Exit Decision Intelligence Framework
3. **customer_success_retention_automation_integration.md** - Retention Automation Tools

### Content & Media Tools
4. **programmatic_seo_content_engine.md** - SEO Content Generation Engine
5. **creative_quality_assurance_framework.md** - Creative QA Framework
6. **stage_34_creative_media_automation_enhanced.md** - Creative Media Automation
7. **stage_34_creative_media_automation.md** - Creative Media Automation (duplicate?)

### Templates & Frameworks
8. **prompt_template_library.md** - Prompt Template Library
9. **automated_replication_blueprint_generator.md** - Replication Blueprint Generator
10. **opportunity_matrix_analyzer.md** - Opportunity Matrix Analysis Tool

---

## 🚀 Platform Development Priority Order

### Phase 1: Foundation (Weeks 1-2)
1. **Database Schema** (stage_56) - ABSOLUTELY FIRST
2. **Authentication** (stage_50) - Single Chairman auth
3. **Chairman Console** (stage_42) - Basic dashboard
4. **Navigation UI** (stage_48) - Core routing

### Phase 2: Core Platform (Weeks 3-4)
5. **Design System** (stage_55) - Component library
6. **Integration Hub** (stage_51) - External connections
7. **Settings** (stage_49) - Configuration management
8. **Data Management** (stage_52) - Knowledge base

### Phase 3: Orchestration (Week 5)
9. **EVA Assistant** (stage_41) - Master orchestrator
10. **Notifications** (stage_53) - Communication layer

### Phase 4: Analytics & Quality (Week 6)
11. **Analytics** (stage_54) - Reports and insights
12. **Testing/QA** (stage_58) - Quality framework
13. **Governance** (stage_59) - Compliance layer

### Phase 5: Advanced Features (Week 7+)
14. **User Stories** (stage_57) - Journey mapping
15. **Onboarding** (stage_60) - User quickstart
16. **PRD Generation** (stage_61) - Meta-capability

---

## 📝 Development Guidelines

### When Building Platform PRDs:
- These become React components, API endpoints, and database tables
- Build in Lovable.dev directly as code
- Follow the priority order above
- Each represents actual application features

### When Implementing Workflow PRDs:
- These become JSON configuration templates
- Store in `workflow_definitions` table
- EVA interprets and executes these at runtime
- Do NOT hard-code these as application features

### When Implementing Agent PRDs:
- These define AI agent configurations
- Store agent personalities and decision logic
- EVA orchestrates agent interactions
- Agents operate within company contexts

### When Implementing Meta PRDs:
- These are advanced recursive capabilities
- Build after core platform is stable
- Stage 61 (PRD Generation) is the flagship meta-capability

---

## 🎯 Key Development Principles

1. **Platform First**: Build the container before the content
2. **Workflows as Data**: Venture processes are configuration, not code
3. **Single Chairman**: Not multi-tenant, but multi-company under one Chairman
4. **EVA as OS**: EVA Assistant is the operating system that runs everything
5. **Progressive Enhancement**: Start minimal, add complexity incrementally

---

## ✅ Success Criteria

By following this architecture map:
- Developers know exactly what to build vs configure
- Platform features are clearly separated from workflows
- Development proceeds in logical, dependency-aware order
- The system architecture remains clean and maintainable

---

*Last Updated: [Current Date]*
*Total PRDs: 82*
*Platform: 19 | Workflows: 40+ | Agents: 8 | Meta: 1 | Supporting: 14*