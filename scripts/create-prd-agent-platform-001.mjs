#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const prd = {
  id: 'PRD-SD-AGENT-PLATFORM-001',
  directive_id: 'SD-AGENT-PLATFORM-001',
  title: 'Advanced AI Research Platform: Multi-Agent System for Venture Analysis',
  version: '1.0',
  status: 'planning',
  category: 'technical',
  priority: 'high',
  executive_summary: `
## Executive Summary

Build a comprehensive multi-agent AI research platform using CrewAI framework to automate venture analysis and opportunity validation. The platform will consist of 40+ specialized AI agents organized into 11 functional departments, integrated with EVA (Chairman's AI assistant) as the central orchestrator.

**Key Objectives:**
- Replace manual research (weeks) with automated AI analysis (hours)
- Leverage FREE APIs only (OpenVC, Growjo, Reddit, HackerNews) - Zero monthly costs
- Achieve ≥85% research quality score validated by chairman review
- Scale from 4 core agents to 40+ departmental agents
- Handle 50+ concurrent agent executions without performance degradation

**Scope:** 33 user stories, 222 story points, 14 sprints, 5 weeks estimated delivery

**Cost Savings:** $3,600/year by using free alternatives instead of Crunchbase ($300/month)
  `,

  content: `
# Product Requirements Document
## SD-AGENT-PLATFORM-001: Advanced AI Research Platform

---

## 1. Business Context

**Problem Statement:**
Current venture research is manual, time-consuming (weeks per venture), and inconsistent in quality. Research requires synthesizing data from multiple sources: market intelligence, competitive analysis, financial viability, regulatory compliance, and strategic fit assessment.

**Solution:**
Multi-agent AI platform that orchestrates specialized research agents to automatically analyze ventures across all critical dimensions, with EVA coordinating research sessions and presenting consolidated findings to the chairman.

**Success Criteria:**
- Research time reduced from weeks to hours
- Research quality score ≥85% (chairman validated)
- Zero monthly API costs (free integrations only)
- System handles 50+ concurrent agents without degradation
- Knowledge base recall accuracy ≥90% for historical data

---

## 2. Technical Architecture

### Core Technology Stack

**Backend:**
- Python 3.11+ with FastAPI framework
- CrewAI 0.70+ for agent orchestration
- Pydantic for data validation
- asyncio for concurrent operations

**Database:**
- Supabase PostgreSQL
- pgvector extension for semantic search
- Row Level Security (RLS) policies
- Real-time subscriptions

**AI & ML:**
- OpenAI GPT-4 Turbo for agent reasoning
- text-embedding-ada-002 for vectorization
- CrewAI Flows for multi-stage orchestration
- Hierarchical agent teams (CEO, department heads, specialists)

**External Integrations (FREE):**
- OpenVC API - Investor/funding data (100% free)
- Growjo API - Company intelligence (free tier)
- Reddit Data API - Community insights (100 QPM free)
- HackerNews API - Tech trends (unlimited, free)
- ProductHunt - Web scraping fallback (API deferred due to $300/month cost)

### System Architecture Diagram

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                    Chairman (Human)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
              ┌───────▼────────┐
              │   EVA (Central │
              │   Coordinator) │
              └───────┬────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
  ┌─────▼─────┐ ┌────▼────┐ ┌─────▼──────┐
  │ CEO Agent │ │ COO     │ │ Knowledge  │
  │           │ │ Agent   │ │ Base       │
  └─────┬─────┘ └────┬────┘ └─────┬──────┘
        │            │             │
  ┌─────▼────────────▼─────────────▼───────┐
  │   Department Heads (11 departments)    │
  │  - R&D, Marketing, Sales, Finance,     │
  │    Legal, Product, Customer Success    │
  │    Branding, Advertising, Tech, IR     │
  └─────┬──────────────────────────────────┘
        │
  ┌─────▼─────────────────────────────────┐
  │  Specialist Agents (9 core agents)    │
  │  - Market Sizing, Pain Point Validator│
  │    Competitive Mapper, Regulatory     │
  │    Risk, Tech Feasibility, Idea       │
  │    Enhancement, Duplicate Detection,  │
  │    Financial Viability, Strategic Fit │
  └───────────────────────────────────────┘
\`\`\`

---

## 3. User Stories (33 Stories, 222 Points)

### Phase 1: Core Agent Platform (Sprints 1-2, 39 points)

#### Sprint 1 (18 points) - Foundation Agents

**US-001: EVA Assistant as Central Coordinator Integration** (8 points, CRITICAL)
- **As a** chairman
- **I want** EVA to orchestrate research sessions across all agents
- **So that** I can initiate research with natural language commands and receive consolidated findings
- **Acceptance Criteria:**
  - EVA can route research requests to appropriate agent crews
  - Session management tracks all active research operations
  - EVA aggregates findings from multiple departments
  - Chairman can query EVA for research status and interim results
  - Integration with existing EVA conversation history
- **Technical Notes:**
  - Extend EVA's function calling with CrewAI crew execution
  - Store session state in \`eva_sessions\` table
  - Real-time status updates via WebSocket

**US-002: Regulatory Risk Assessor Agent** (5 points, HIGH)
- **As a** research coordinator
- **I want** automated regulatory compliance analysis
- **So that** ventures with high legal risk are flagged early
- **Acceptance Criteria:**
  - Identifies industry-specific regulations (healthcare, fintech, privacy)
  - Assesses compliance requirements and estimated costs
  - Flags jurisdictional considerations (US, EU, APAC)
  - Provides risk score (low/medium/high) with justification
- **Data Sources:** Government databases, legal precedent search, regulatory news feeds

**US-003: Technology Feasibility Checker Agent** (5 points, HIGH)
- **As a** technical evaluator
- **I want** automated technical feasibility assessment
- **So that** ventures requiring non-existent tech are identified
- **Acceptance Criteria:**
  - Evaluates technical maturity of required technologies
  - Identifies implementation challenges and complexity
  - Estimates development timeline and technical resources
  - Flags dependencies on unproven or unavailable tech
- **Tech Stack Assessment:** Available frameworks, libraries, tools, infrastructure requirements

---

#### Sprint 2 (21 points) - Enhancement & Validation Agents

**US-004: Idea Enhancement Agent** (8 points, HIGH)
- **As a** research analyst
- **I want** AI-powered venture idea refinement
- **So that** initial concepts are strengthened before deep research
- **Acceptance Criteria:**
  - Suggests improvements to value proposition
  - Identifies adjacent opportunities or pivots
  - Recommends differentiators based on market analysis
  - Proposes feature enhancements aligned with user pain points
- **Integration:** Runs before core research crew executes

**US-005: Duplicate Detection Agent** (8 points, CRITICAL)
- **As a** portfolio manager
- **I want** automatic detection of duplicate/similar ventures
- **So that** we avoid redundant research and conflicting investments
- **Acceptance Criteria:**
  - Searches existing ventures table with semantic similarity
  - Compares against ventures in all statuses (active, archived, declined)
  - Provides similarity score and detailed comparison
  - Flags potential cannibalization of existing portfolio companies
- **Technical Implementation:** pgvector cosine similarity search on venture descriptions

**US-006: Financial Viability Agent** (5 points, HIGH)
- **As a** financial analyst
- **I want** automated financial feasibility assessment
- **So that** ventures with poor unit economics are identified early
- **Acceptance Criteria:**
  - Estimates revenue model viability (SaaS, marketplace, transaction fees)
  - Calculates estimated CAC, LTV, gross margins
  - Projects burn rate and runway requirements
  - Identifies path to profitability and capital efficiency

---

### Phase 2: External Integrations (Sprints 3-4, 29 points)

#### Sprint 3 (13 points) - FREE API Integrations

**US-007: HackerNews Data Integration** (3 points, MEDIUM)
- **As a** trend analyst
- **I want** real-time tech trend insights from HackerNews
- **So that** I can identify emerging technologies and market sentiment
- **Acceptance Criteria:**
  - Search HN stories, comments by keyword/topic
  - Identify trending discussions related to venture space
  - Sentiment analysis on community reactions
  - Historical trend analysis (6-12 months)
- **API:** HackerNews API (Algolia) - 100% FREE, unlimited
- **Integration:** Python \`requests\` library, async fetching

**US-008: ProductHunt Data Integration** (5 points, MEDIUM)
- **As a** competitive researcher
- **I want** product launch insights from ProductHunt
- **So that** I can track competitor traction and market reception
- **Acceptance Criteria:**
  - Search products by category/keyword
  - Retrieve upvotes, comments, launch dates
  - Analyze maker profiles and previous launches
  - Track trending categories and launch strategies
- **Implementation:** Web scraping fallback (ProductHunt API requires $300/month - DEFERRED)
- **Alternative:** Selenium/BeautifulSoup for public data extraction

**US-009: Crunchbase Alternative Data Integration** (5 points, MEDIUM)
- **As a** market researcher
- **I want** company funding and investment data
- **So that** I can assess market validation and competitor traction
- **Acceptance Criteria:**
  - Retrieve company funding rounds, valuations
  - Identify investor profiles and investment theses
  - Track exits and M&A activity in sector
  - Compare funding trajectories of competitors
- **FREE Alternatives:**
  - **OpenVC API:** Open database of venture capital investments (100% free)
  - **Growjo API:** Company growth and funding data (free tier available)
- **Cost Savings:** $300/month avoided by not using Crunchbase Enterprise API

---

#### Sprint 4 (16 points) - Knowledge Base & Pattern Recognition

**US-010: Shared Knowledge Base with pgvector** (8 points, CRITICAL)
- **As an** agent
- **I want** access to historical research and chairman feedback
- **So that** I can learn from past decisions and improve recommendations
- **Acceptance Criteria:**
  - All research findings stored with vector embeddings
  - Semantic search retrieves relevant past ventures (≥90% recall)
  - Chairman feedback (approvals/rejections) linked to ventures
  - Agents query knowledge base before making recommendations
- **Schema:**
  - \`agent_knowledge\` table with \`embedding\` vector(1536) column
  - Indexes: ivfflat for fast similarity search
  - RLS policies per company/user

**US-011: Pattern Recognition from Chairman Feedback** (8 points, HIGH)
- **As a** learning system
- **I want** to identify patterns in chairman decisions
- **So that** agent recommendations align with historical preferences
- **Acceptance Criteria:**
  - Analyze approved vs rejected ventures for common themes
  - Identify chairman preferences (industries, business models, risk tolerance)
  - Weight agent recommendations based on learned patterns
  - Confidence scoring increases as feedback data grows
- **ML Approach:** Lightweight classification model (logistic regression on embeddings)

---

### Phase 3: EVA Orchestration (Sprint 5, 28 points)

**US-012: CrewAI Flows Orchestration** (8 points, HIGH)
- **As a** system architect
- **I want** multi-stage research workflows
- **So that** complex research tasks execute in proper sequence
- **Acceptance Criteria:**
  - Define flows for "Quick Validation" (4 agents, 30 min) and "Deep Research" (20+ agents, 4 hours)
  - Sequential execution with dependency management
  - Parallel execution of independent agents
  - Error handling and retry logic for failed agent calls
- **CrewAI Flows Features:**
  - Conditional branching based on intermediate results
  - State persistence between flow steps

**US-013: Performance Optimization and Caching** (5 points, MEDIUM)
- **As a** performance engineer
- **I want** efficient agent execution
- **So that** research completes within SLA (30 min quick, 4 hr deep)
- **Acceptance Criteria:**
  - Redis cache for external API responses (24-hour TTL)
  - Database connection pooling (pgbouncer)
  - Async/await for all I/O operations
  - Rate limiting to avoid API throttling
- **Performance Targets:**
  - <200ms API response time
  - 50+ concurrent agents without degradation
  - <5% cache miss rate for repeat queries

**US-014: EVA Orchestration Session Management** (5 points, CRITICAL)
- **As a** EVA
- **I want** to manage multiple research sessions
- **So that** I can handle concurrent research requests from chairman
- **Acceptance Criteria:**
  - Create unique session ID per research request
  - Track session state (queued, running, completed, failed)
  - Store interim results as agents complete
  - Support pause/resume for long-running research
- **Schema:** \`research_sessions\` table with status, created_at, completed_at fields

**US-015: EVA Agent-to-Agent Communication System** (5 points, CRITICAL)
- **As an** agent
- **I want** to request information from other agents
- **So that** I can leverage specialized knowledge for my analysis
- **Acceptance Criteria:**
  - Agents publish findings to shared context (Redis pub/sub)
  - Agents subscribe to topics relevant to their domain
  - CrewAI context sharing enabled across crews
  - Communication logged for debugging and learning

**US-016: EVA Action Execution & Coordination** (5 points, CRITICAL)
- **As a** EVA
- **I want** to execute actions based on research results
- **So that** I can automatically create ventures, schedule reviews, or flag issues
- **Acceptance Criteria:**
  - Create venture drafts in database from research output
  - Schedule chairman review meetings via calendar integration
  - Send notifications for high-confidence opportunities
  - Generate executive summary reports (PDF)

---

### Phase 4: Hierarchical Organization (Sprints 6-8, 42 points)

#### Sprint 6 (21 points) - Executive & Organizational Framework

**US-017: CrewAI Hierarchical Agent Configuration** (8 points, CRITICAL)
- **As a** system architect
- **I want** hierarchical agent teams mirroring org structure
- **So that** research follows realistic delegation and accountability
- **Acceptance Criteria:**
  - CEO agent delegates to department heads
  - Department heads manage specialist agents
  - Task assignment based on agent role and expertise
  - Clear reporting hierarchy in research output
- **CrewAI Implementation:** Manager agents with task delegation to subordinate agents

**US-018: Organizational Structure Framework** (8 points, CRITICAL)
- **As a** platform designer
- **I want** configurable org hierarchy
- **So that** agent structure adapts to business needs
- **Acceptance Criteria:**
  - Define departments in \`agent_departments\` table
  - Assign agents to departments with role/seniority
  - Configure delegation rules (who can assign tasks to whom)
  - Visualize org chart in admin dashboard
- **Departments (11):** R&D, Marketing, Sales, Finance, Legal, Product Management, Customer Success, Branding, Advertising, Technical/Engineering, Investor Relations

**US-019: CEO & COO Executive Agents** (5 points, CRITICAL)
- **As a** research director
- **I want** executive agents to oversee research strategy
- **So that** high-level coordination ensures comprehensive analysis
- **Acceptance Criteria:**
  - CEO agent sets overall research goals and priorities
  - COO agent monitors progress and reallocates resources
  - Executives synthesize department findings into executive summary
  - Escalation to chairman for ambiguous decisions
- **Agent Personas:** CEO = strategic vision, COO = operational efficiency

---

#### Sprint 7 (8 points) - Agent Configuration

**US-020: Agent Backstory Management System** (8 points, HIGH)
- **As a** agent designer
- **I want** configurable agent personalities and expertise
- **So that** agents provide contextually rich and domain-specific analysis
- **Acceptance Criteria:**
  - Define agent role, goal, backstory in database
  - Backstories include industry experience, expertise areas, decision-making style
  - Agents reference backstory in their reasoning
  - Admin UI to edit backstories without code changes
- **Schema:** \`crewai_agents\` table with \`role\`, \`goal\`, \`backstory\`, \`expertise\` fields

---

#### Sprint 8 (13 points) - Task Delegation

**US-021: Task Delegation Framework** (8 points, HIGH)
- **As a** manager agent
- **I want** to delegate tasks to subordinate agents
- **So that** complex research decomposes into manageable sub-tasks
- **Acceptance Criteria:**
  - CrewAI tasks assigned to specific agents
  - Tasks have context, expected output, and dependencies
  - Manager reviews subordinate outputs before aggregation
  - Retry logic for failed tasks
- **Task Types:** Research, analysis, synthesis, validation

**US-022: Tool Assignment & Access Control** (5 points, MEDIUM)
- **As a** security architect
- **I want** agents to access only authorized tools/APIs
- **So that** security and cost controls are enforced
- **Acceptance Criteria:**
  - Tools (APIs, databases, functions) assigned per agent role
  - API keys scoped by tool and rate-limited
  - Audit log of tool usage per agent
  - Cost tracking for paid tools (future-proofing for potential paid APIs)
- **Tool Examples:** search_hackernews(), query_openvc(), search_knowledge_base()

---

### Phase 5: Department Teams (Sprints 9-14, 84 points)

#### Sprint 9 (5 points) - Admin Dashboard

**US-023: AI Agent Management Dashboard** (5 points, MEDIUM)
- **As an** administrator
- **I want** visibility into agent performance and research sessions
- **So that** I can monitor system health and optimize configuration
- **Acceptance Criteria:**
  - List all agents with status (active, idle, error)
  - View research sessions (running, completed, failed)
  - Agent performance metrics (avg execution time, success rate)
  - Cost tracking dashboard (API usage, token consumption)
  - Agent backstory editor
- **Tech Stack:** React dashboard at \`/admin/agents\`

---

#### Sprint 10 (16 points) - Marketing & Product Departments

**US-024: Product Management Department Team** (8 points, HIGH)
- **As a** product strategist
- **I want** specialized agents for product-market fit analysis
- **So that** venture product strategies are evaluated by domain experts
- **Acceptance Criteria:**
  - Product Manager agent defines product requirements
  - UX Researcher agent assesses user experience needs
  - Product Marketing agent evaluates positioning strategy
  - Department head synthesizes product viability assessment
- **Agents:** Product Manager, UX Researcher, Product Marketing Manager

**US-025: Marketing Department Team** (8 points, HIGH)
- **As a** marketing strategist
- **I want** specialized marketing agents for go-to-market analysis
- **So that** venture GTM strategies are evaluated comprehensively
- **Acceptance Criteria:**
  - Marketing Manager agent defines GTM strategy
  - Content Strategist agent assesses content marketing approach
  - Growth Hacker agent evaluates customer acquisition tactics
  - Department synthesizes marketing viability score
- **Agents:** Marketing Manager, Content Strategist, Growth Hacker, SEO Specialist

---

#### Sprint 11 (16 points) - Branding & Advertising Departments

**US-026: Advertising Department Team** (8 points, HIGH)
- **As a** advertising expert
- **I want** specialized ad strategy agents
- **So that** venture advertising plans are evaluated by specialists
- **Acceptance Criteria:**
  - Ad Campaign Manager agent designs campaign strategy
  - Media Buyer agent evaluates channel mix and costs
  - Creative Director agent assesses creative requirements
  - Department synthesizes advertising feasibility
- **Agents:** Ad Campaign Manager, Media Buyer, Creative Director, Analytics Specialist

**US-027: Branding Department Team** (8 points, CRITICAL)
- **As a** brand strategist
- **I want** specialized branding agents
- **So that** venture brand positioning is evaluated professionally
- **Acceptance Criteria:**
  - Brand Strategist agent defines brand positioning
  - Visual Identity Designer agent assesses design requirements
  - Brand Voice Specialist agent evaluates messaging consistency
  - Department synthesizes brand strength score
- **Agents:** Brand Strategist, Visual Identity Designer, Brand Voice Specialist

---

#### Sprint 12 (16 points) - Sales & Customer Success Departments

**US-028: Sales Department Team** (8 points, HIGH)
- **As a** sales leader
- **I want** specialized sales strategy agents
- **So that** venture sales models are evaluated by experts
- **Acceptance Criteria:**
  - Sales Director agent defines sales strategy
  - Sales Engineer agent evaluates technical sales complexity
  - Channel Partner Manager agent assesses partnership opportunities
  - Department synthesizes sales feasibility score
- **Agents:** Sales Director, Sales Engineer, Channel Partner Manager, Sales Operations Analyst

**US-029: Customer Success Department Team** (8 points, HIGH)
- **As a** customer success leader
- **I want** specialized CS agents for retention analysis
- **So that** venture customer lifecycle strategies are evaluated
- **Acceptance Criteria:**
  - CS Manager agent defines success strategy
  - Onboarding Specialist agent evaluates onboarding complexity
  - Support Engineer agent assesses support requirements
  - Department synthesizes customer retention viability
- **Agents:** CS Manager, Onboarding Specialist, Support Engineer, Customer Advocate

---

#### Sprint 13 (16 points) - Finance & Legal Departments

**US-030: Finance Department Team** (8 points, HIGH)
- **As a** financial analyst
- **I want** specialized finance agents
- **So that** venture financial models are rigorously evaluated
- **Acceptance Criteria:**
  - CFO agent defines financial strategy
  - Financial Analyst agent builds financial models
  - FP&A Analyst agent forecasts revenue and expenses
  - Department synthesizes financial viability score
- **Agents:** CFO, Financial Analyst, FP&A Analyst, Controller

**US-031: Legal & Compliance Department Team** (8 points, MEDIUM)
- **As a** legal counsel
- **I want** specialized legal agents for compliance analysis
- **So that** venture legal risks are identified early
- **Acceptance Criteria:**
  - General Counsel agent evaluates overall legal strategy
  - Corporate Lawyer agent assesses entity structure and contracts
  - IP Attorney agent evaluates intellectual property protection
  - Department synthesizes legal risk score
- **Agents:** General Counsel, Corporate Lawyer, IP Attorney, Compliance Officer

---

#### Sprint 14 (7 points) - Technical & Investor Relations Departments

**US-032: Technical/Engineering Department Team** (7 points, MEDIUM)
- **As a** CTO
- **I want** specialized technical agents for engineering assessment
- **So that** venture technical execution is evaluated by engineers
- **Acceptance Criteria:**
  - CTO agent defines technical architecture
  - Senior Engineer agent assesses implementation complexity
  - DevOps Engineer agent evaluates infrastructure requirements
  - Department synthesizes technical feasibility score
- **Agents:** CTO, Senior Engineer, DevOps Engineer, QA Lead

---

#### Sprint 15 (Unscheduled) - Additional Department

**US-033: Investor Relations Department Team** (8 points, HIGH)
- **As an** investor relations manager
- **I want** specialized IR agents for fundraising analysis
- **So that** venture fundraising strategies are evaluated
- **Acceptance Criteria:**
  - IR Director agent defines fundraising strategy
  - Pitch Coach agent evaluates pitch quality
  - Investor Network Specialist agent identifies target investors
  - Department synthesizes fundraising viability score
- **Agents:** IR Director, Pitch Coach, Investor Network Specialist, Financial Communications Manager

---

## 4. Database Schema

### New Tables Required

\`\`\`sql
-- Agent configuration
CREATE TABLE crewai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  role TEXT NOT NULL,
  goal TEXT NOT NULL,
  backstory TEXT NOT NULL,
  department_id UUID REFERENCES agent_departments(id),
  tools TEXT[] DEFAULT '{}',
  llm_model VARCHAR(50) DEFAULT 'gpt-4-turbo-preview',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organizational hierarchy
CREATE TABLE agent_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_name VARCHAR(100) UNIQUE NOT NULL,
  department_head_id UUID REFERENCES crewai_agents(id),
  parent_department_id UUID REFERENCES agent_departments(id),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CrewAI crews (teams of agents)
CREATE TABLE crewai_crews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_name VARCHAR(100) UNIQUE NOT NULL,
  crew_type VARCHAR(50), -- 'sequential', 'hierarchical', 'parallel'
  manager_agent_id UUID REFERENCES crewai_agents(id),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crew membership
CREATE TABLE crew_members (
  crew_id UUID REFERENCES crewai_crews(id),
  agent_id UUID REFERENCES crewai_agents(id),
  role_in_crew VARCHAR(50), -- 'leader', 'member', 'reviewer'
  PRIMARY KEY (crew_id, agent_id)
);

-- Research sessions
CREATE TABLE research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key VARCHAR(100) UNIQUE NOT NULL,
  venture_id UUID REFERENCES ventures(id),
  research_type VARCHAR(50), -- 'quick_validation', 'deep_research'
  status VARCHAR(50) DEFAULT 'queued',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  results JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent knowledge base (with pgvector)
CREATE TABLE agent_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50), -- 'venture', 'research', 'feedback'
  source_id UUID,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create vector similarity index
CREATE INDEX agent_knowledge_embedding_idx
ON agent_knowledge
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- External API cache
CREATE TABLE api_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  api_provider VARCHAR(50),
  request_params JSONB,
  response_data JSONB,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX api_cache_expires_idx ON api_cache(expires_at);
\`\`\`

---

## 5. API Endpoints

### Python FastAPI Routes

\`\`\`python
# Research orchestration
POST   /api/research/start                  # Start research session
GET    /api/research/{session_id}           # Get session status
POST   /api/research/{session_id}/pause     # Pause session
POST   /api/research/{session_id}/resume    # Resume session
GET    /api/research/{session_id}/results   # Get final results

# Agent management
GET    /api/agents                          # List all agents
GET    /api/agents/{agent_id}               # Get agent details
PUT    /api/agents/{agent_id}               # Update agent config
POST   /api/agents/{agent_id}/execute       # Execute single agent

# Department management
GET    /api/departments                     # List departments
GET    /api/departments/{id}/agents         # Get department agents
POST   /api/departments                     # Create department

# Knowledge base
POST   /api/knowledge/search                # Semantic search
POST   /api/knowledge/store                 # Store knowledge
GET    /api/knowledge/patterns              # Get learned patterns

# EVA integration
POST   /api/eva/research-request            # EVA initiates research
GET    /api/eva/sessions                    # Get EVA's sessions
\`\`\`

---

## 6. Security & Compliance

### Security Controls

1. **Authentication & Authorization**
   - All API endpoints require JWT authentication
   - RLS policies enforce company-level data isolation
   - Agent tool access controlled by role

2. **Rate Limiting**
   - Free API rate limits enforced (Reddit: 100 QPM)
   - Internal rate limiting: 50 concurrent agents max
   - API key rotation every 90 days

3. **Data Privacy**
   - Venture data never sent to external APIs (only search queries)
   - PII scrubbing before knowledge base storage
   - GDPR-compliant data retention (2 years)

4. **Cost Controls**
   - OpenAI token budgets per agent (max 4K tokens/call)
   - Alert if daily token usage exceeds threshold
   - Free API monitoring to detect quota changes

---

## 7. Test Plan

### Unit Tests (300+ tests)

**Agent Tests:**
- Each agent (40+) has unit tests for:
  - Input validation
  - Output format correctness
  - Error handling
- Tool function tests (search_hackernews, etc.)

**API Tests:**
- FastAPI route tests (15 endpoints)
- Authentication/authorization tests
- Rate limiting tests

**Database Tests:**
- Schema migration tests
- pgvector similarity search accuracy
- RLS policy enforcement

### Integration Tests (50+ tests)

**Crew Execution:**
- Sequential crew execution
- Hierarchical crew delegation
- Parallel crew execution
- Error propagation and retry

**EVA Integration:**
- Research session creation
- Agent coordination
- Result aggregation

**External API Integration:**
- OpenVC data fetching
- Reddit API rate limiting
- HackerNews search accuracy
- Cache hit/miss scenarios

### E2E Tests (10 scenarios)

**Scenario 1: Quick Validation Research**
1. Chairman asks EVA: "Research AI-powered email client"
2. EVA creates session, executes 4-agent crew
3. Research completes in <30 min
4. Chairman reviews consolidated findings
5. Chairman approves/rejects venture

**Scenario 2: Deep Research with All Departments**
1. Chairman requests full analysis
2. EVA orchestrates 11 departments (40+ agents)
3. Research completes in <4 hours
4. Executive summary generated with dept breakdowns
5. Knowledge base updated with findings

**Scenario 3: Duplicate Detection**
1. New venture idea submitted
2. Duplicate Detection Agent searches knowledge base
3. Finds 87% similar venture from 2023
4. Flags to chairman with comparison report
5. Chairman decides on proceed vs merge

**Scenario 4: API Rate Limiting**
1. Multiple concurrent research sessions
2. Reddit API rate limit (100 QPM) reached
3. Request queue activates
4. Research continues with delayed API calls
5. No session failures

**Scenario 5: Agent Learning from Feedback**
1. Chairman rejects venture with feedback
2. Feedback stored in knowledge base
3. Pattern Recognition Agent analyzes
4. Future recommendations weighted by patterns
5. Confidence scores adjust over time

### Performance Tests

**Load Test:**
- 100 concurrent research sessions
- Target: <5% degradation in response time
- No session failures

**Stress Test:**
- 500 concurrent agents
- Identify breaking point
- Graceful degradation behavior

**Endurance Test:**
- 72-hour continuous operation
- Memory leak detection
- Database connection pool health

---

## 8. Deployment Strategy

### Phase 1: MVP (Weeks 1-2, Sprints 1-4)

**Deliverables:**
- 9 core specialist agents
- FastAPI service with basic orchestration
- External API integrations (free APIs)
- Knowledge base with pgvector
- Basic EVA integration

**Success Criteria:**
- Quick Validation research (<30 min)
- ≥75% research quality score

### Phase 2: Hierarchical Organization (Weeks 3-4, Sprints 5-8)

**Deliverables:**
- CEO/COO executive agents
- Hierarchical crew configuration
- Task delegation framework
- Admin dashboard

**Success Criteria:**
- Deep Research capability (<4 hours)
- 11 departments operational

### Phase 3: Full Department Teams (Week 5, Sprints 9-14)

**Deliverables:**
- 40+ specialized department agents
- Complete org hierarchy
- Pattern recognition from feedback
- Performance optimization

**Success Criteria:**
- ≥85% research quality score
- 50+ concurrent agents supported
- <$50/month OpenAI costs

---

## 9. Risk Assessment

### HIGH Risks

**Risk 1: Free API Rate Limits Too Restrictive**
- **Impact:** Research sessions fail or take too long
- **Mitigation:**
  - Implement request queuing and caching
  - Fallback to web scraping if API unavailable
  - Monitor rate limit usage and alert before threshold

**Risk 2: Agent Orchestration Complexity**
- **Impact:** 40+ agents hard to coordinate, debug, optimize
- **Mitigation:**
  - Use proven CrewAI framework (battle-tested)
  - Start small (4 agents) and scale incrementally
  - Comprehensive logging and debugging tools

**Risk 3: Knowledge Base Accuracy Degradation**
- **Impact:** Agents make poor recommendations based on stale data
- **Mitigation:**
  - Chairman feedback loop updates knowledge continuously
  - Automated quality scoring on knowledge entries
  - Periodic knowledge base pruning

### MEDIUM Risks

**Risk 4: OpenAI Token Costs**
- **Impact:** High usage leads to unexpected bills
- **Mitigation:**
  - Token budgets per agent (4K max)
  - Caching and result reuse
  - Alert if daily spend >$10

**Risk 5: Scope Creep**
- **Impact:** 222 story points balloons to 300+
- **Mitigation:**
  - Strict sprint boundaries
  - MVP-first approach (defer nice-to-haves)
  - Weekly scope review with LEAD agent

---

## 10. Success Metrics

### Quantitative Metrics

1. **Research Time Reduction:** Manual (2-4 weeks) → Automated (30 min - 4 hours)
2. **Research Quality Score:** ≥85% chairman validation
3. **Cost Savings:** $3,600/year from free APIs
4. **System Performance:** <200ms API response, 50+ concurrent agents
5. **Knowledge Base Accuracy:** ≥90% recall on similar ventures
6. **Agent Success Rate:** ≥95% successful executions

### Qualitative Metrics

1. **Chairman Satisfaction:** Post-research survey (1-5 scale, target ≥4.5)
2. **Research Comprehensiveness:** All critical dimensions covered
3. **Actionability of Findings:** Clear go/no-go recommendations
4. **System Reliability:** No critical outages during business hours

---

## 11. Acceptance Criteria (SD-Level)

**LEAD Approval Criteria:**
- [ ] All 33 user stories delivered with acceptance criteria met
- [ ] Research quality score ≥85% across 20+ test ventures
- [ ] Zero monthly API costs (free integrations confirmed)
- [ ] System handles 50+ concurrent agents without degradation
- [ ] Knowledge base demonstrates learning (improving recommendations over time)
- [ ] Chairman can initiate research via EVA with natural language
- [ ] Comprehensive test coverage (300+ unit, 50+ integration, 10+ E2E)
- [ ] Documentation complete (API docs, agent configuration guide, troubleshooting)
- [ ] Production deployment successful with zero data loss
- [ ] Retrospective generated with lessons learned

---

## 12. Dependencies & Prerequisites

### External Dependencies

1. **OpenAI API Access:** GPT-4 Turbo, text-embedding-ada-002
2. **Supabase PostgreSQL:** pgvector extension enabled
3. **Free API Accounts:**
   - OpenVC API (free, no account needed)
   - Growjo API (free tier signup)
   - Reddit Data API (OAuth app registration, free tier)
   - HackerNews API (no account needed)

### Internal Dependencies

1. **EVA Integration Points:** Existing EVA conversation system
2. **Ventures Table Schema:** Must support research_session_id foreign key
3. **Authentication:** Supabase Auth for API security

### Technical Prerequisites

1. **Python 3.11+** installed
2. **FastAPI framework** knowledge
3. **CrewAI 0.70+** familiarity
4. **PostgreSQL pgvector** extension

---

## 13. Appendix

### Agent Role Definitions (Sample)

**Market Sizing Analyst**
- **Role:** Senior Market Intelligence Analyst
- **Goal:** Provide accurate TAM/SAM/SOM estimates with data sources
- **Backstory:** "15 years at Gartner and CB Insights, specializing in B2B SaaS market sizing. Known for conservative estimates backed by multiple data sources."
- **Tools:** search_openvc(), search_growjo(), calculate_market_size()

**Duplicate Detection Specialist**
- **Role:** Portfolio Overlap Analyst
- **Goal:** Identify duplicate or conflicting ventures in portfolio
- **Backstory:** "Former M&A analyst with pattern recognition expertise. Prevented 12 redundant acquisitions by identifying hidden overlaps."
- **Tools:** search_knowledge_base(), calculate_similarity(), get_ventures()

### Glossary

- **CrewAI:** Python framework for orchestrating AI agents with roles, goals, and tasks
- **pgvector:** PostgreSQL extension for vector similarity search
- **EVA:** Chairman's AI assistant (existing system)
- **TAM/SAM/SOM:** Total Addressable Market / Serviceable Available Market / Serviceable Obtainable Market
- **RLS:** Row Level Security (PostgreSQL security feature)
- **Hierarchical Crew:** CrewAI pattern where manager agent delegates to subordinate agents

---

**End of PRD**

*Document Version: 1.0*
*Created By: PLAN Agent*
*Created Date: ${new Date().toISOString()}*
*Strategic Directive: SD-AGENT-PLATFORM-001*
*Total Story Points: 222 across 33 user stories*
  `,

  plan_checklist: [
    { text: 'PRD created and saved to database', checked: true },
    { text: 'All 33 user stories documented with acceptance criteria', checked: true },
    { text: 'Free API integrations researched and documented', checked: true },
    { text: 'Technical architecture defined (CrewAI + FastAPI + pgvector)', checked: true },
    { text: 'Database schema designed (8 new tables)', checked: true },
    { text: 'API endpoints specified (15 routes)', checked: true },
    { text: 'Test plan comprehensive (300+ unit, 50+ integration, 10+ E2E)', checked: true },
    { text: 'Security controls documented (RLS, rate limiting, cost controls)', checked: true },
    { text: 'Risk assessment completed (5 risks with mitigation)', checked: true },
    { text: 'Success metrics defined (6 quantitative, 4 qualitative)', checked: true },
    { text: 'Deployment strategy (3 phases, 5 weeks)', checked: true },
    { text: 'Resource requirements estimated (222 story points)', checked: false },
    { text: 'Sub-agent validation required (6 sub-agents)', checked: false }
  ],

  exec_checklist: [
    { text: 'Sprint 1-2: Core Agent Platform (39 points)', checked: false },
    { text: 'Sprint 3-4: External Integrations & Knowledge Base (29 points)', checked: false },
    { text: 'Sprint 5: EVA Orchestration (28 points)', checked: false },
    { text: 'Sprint 6-8: Hierarchical Organization (42 points)', checked: false },
    { text: 'Sprint 9-14: Department Teams (84 points)', checked: false },
    { text: 'Database migrations applied (8 tables created)', checked: false },
    { text: 'FastAPI service deployed', checked: false },
    { text: 'Free API integrations tested (OpenVC, Growjo, Reddit, HN)', checked: false },
    { text: 'CrewAI agents configured (40+ agents)', checked: false },
    { text: 'EVA integration complete', checked: false },
    { text: 'Knowledge base operational (pgvector)', checked: false },
    { text: 'Unit tests passing (300+)', checked: false },
    { text: 'Integration tests passing (50+)', checked: false },
    { text: 'E2E tests passing (10 scenarios)', checked: false },
    { text: 'Performance tests passing (50+ concurrent agents)', checked: false },
    { text: 'Admin dashboard deployed', checked: false },
    { text: 'Production deployment complete', checked: false }
  ],

  validation_checklist: [
    { text: 'All 33 user stories completed with acceptance criteria met', checked: false },
    { text: 'Research quality score ≥85% validated', checked: false },
    { text: 'Zero monthly API costs confirmed', checked: false },
    { text: 'System handles 50+ concurrent agents without degradation', checked: false },
    { text: 'Knowledge base recall accuracy ≥90%', checked: false },
    { text: 'Chairman can initiate research via EVA', checked: false },
    { text: 'Test coverage meets targets (300+, 50+, 10+)', checked: false },
    { text: 'Security controls operational (RLS, rate limiting)', checked: false },
    { text: 'Documentation complete (API docs, guides)', checked: false },
    { text: 'Sub-agent approvals received (6 sub-agents)', checked: false },
    { text: 'LEAD final approval obtained', checked: false }
  ],

  progress: 0,
  phase: 'planning',
  created_by: 'PLAN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

async function createPRD() {
  console.log('\n🔨 Creating PRD for SD-AGENT-PLATFORM-001');
  console.log('=====================================\n');

  try {
    // Check if PRD already exists
    const { data: existing } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('id', prd.id)
      .single();

    if (existing) {
      console.log('⚠️  PRD already exists. Updating...');
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .update(prd)
        .eq('id', prd.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating PRD:', error);
        process.exit(1);
      }

      console.log('✅ PRD updated successfully');
    } else {
      // Insert new PRD
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .insert(prd)
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating PRD:', error);
        process.exit(1);
      }

      console.log('✅ PRD created successfully');
    }

    console.log('\n📊 PRD Summary:');
    console.log('- ID:', prd.id);
    console.log('- Title:', prd.title);
    console.log('- User Stories: 33');
    console.log('- Story Points: 222');
    console.log('- Sprints: 14');
    console.log('- Estimated Duration: 5 weeks');
    console.log('- Plan Checklist Items:', prd.plan_checklist.length);
    console.log('- Exec Checklist Items:', prd.exec_checklist.length);
    console.log('- Validation Checklist Items:', prd.validation_checklist.length);

    console.log('\n🎯 Next Steps:');
    console.log('1. Engage 6 sub-agents for PRD validation (parallel)');
    console.log('2. Address sub-agent feedback');
    console.log('3. Create PLAN→EXEC handoff');
    console.log('4. Begin Sprint 1 implementation');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

createPRD();
