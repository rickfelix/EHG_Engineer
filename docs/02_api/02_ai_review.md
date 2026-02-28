---
category: api
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [api, auto-generated]
---
# Stage 02 – AI Review PRD (Enhanced Technical Specification v4)



## Table of Contents

- [Metadata](#metadata)
- [EHG Management Model Integration](#ehg-management-model-integration)
  - [Performance Drive Cycle Alignment](#performance-drive-cycle-alignment)
  - [AI-Agent Coordination for Reviews](#ai-agent-coordination-for-reviews)
  - [Multi-Company Portfolio Context](#multi-company-portfolio-context)
- [1. Executive Summary](#1-executive-summary)
  - [Implementation Readiness: ⚠️ **Needs Business Logic** → ✅ **Immediately Buildable**](#implementation-readiness-needs-business-logic-immediately-buildable)
- [2. Business Logic Specification](#2-business-logic-specification)
  - [2.1 Validation Rules Engine](#21-validation-rules-engine)
  - [2.2 Scoring Algorithm](#22-scoring-algorithm)
  - [2.3 LLM Augmentation Specification](#23-llm-augmentation-specification)
- [3. Data Architecture](#3-data-architecture)
  - [3.0 Database Schema Integration](#30-database-schema-integration)
  - [Integration Hub Connectivity](#integration-hub-connectivity)
  - [3.1 Core Data Schemas](#31-core-data-schemas)
  - [3.2 Database Schema Specification](#32-database-schema-specification)
- [4. Component Architecture](#4-component-architecture)
  - [4.1 Component Hierarchy](#41-component-hierarchy)
  - [4.2 Component Specifications](#42-component-specifications)
- [5. Integration Patterns](#5-integration-patterns)
  - [5.1 EVA LLM Router Integration](#51-eva-llm-router-integration)
  - [5.2 Supabase Integration](#52-supabase-integration)
  - [5.3 Voice Integration (OpenAI)](#53-voice-integration-openai)
- [6. Error Handling & Edge Cases](#6-error-handling-edge-cases)
  - [6.1 Error Scenarios](#61-error-scenarios)
  - [6.2 Data Validation](#62-data-validation)
- [7. Performance Requirements](#7-performance-requirements)
  - [7.1 Response Time Targets](#71-response-time-targets)
  - [7.2 Optimization Strategies](#72-optimization-strategies)
- [8. Security & Privacy](#8-security-privacy)
  - [8.1 Data Protection](#81-data-protection)
  - [8.2 Prompt Injection Prevention](#82-prompt-injection-prevention)
- [9. Testing Strategy](#9-testing-strategy)
  - [9.1 Test Scenarios](#91-test-scenarios)
  - [9.2 Test Data Sets](#92-test-data-sets)
- [10. Monitoring & Analytics](#10-monitoring-analytics)
  - [10.1 Key Metrics](#101-key-metrics)
  - [10.2 Alerting Rules](#102-alerting-rules)
- [11. Implementation Checklist](#11-implementation-checklist)
  - [Phase 1: Foundation (Days 1-2)](#phase-1-foundation-days-1-2)
  - [Phase 2: Core Logic (Days 3-5)](#phase-2-core-logic-days-3-5)
  - [Phase 3: LLM Integration (Days 6-7)](#phase-3-llm-integration-days-6-7)
  - [Phase 4: UI Components (Days 8-10)](#phase-4-ui-components-days-8-10)
  - [Phase 5: Integration (Days 11-12)](#phase-5-integration-days-11-12)
  - [Phase 6: Testing & Polish (Days 13-14)](#phase-6-testing-polish-days-13-14)
- [12. Configuration Requirements](#12-configuration-requirements)
  - [Environment Variables](#environment-variables)
  - [Feature Toggles](#feature-toggles)
- [13. Success Criteria](#13-success-criteria)
  - [Definition of Done](#definition-of-done)
  - [Acceptance Metrics](#acceptance-metrics)
- [14. Migration & Versioning](#14-migration-versioning)
  - [Schema Evolution Strategy](#schema-evolution-strategy)
  - [Rollback Plan](#rollback-plan)
- [15. Future Enhancements](#15-future-enhancements)
  - [Planned Improvements (Not in MVP)](#planned-improvements-not-in-mvp)
- [Appendix A: Validation Rule Taxonomy](#appendix-a-validation-rule-taxonomy)
  - [Industry/Domain Terms (for TQ-003)](#industrydomain-terms-for-tq-003)
  - [Clarity Indicators (for TQ-002)](#clarity-indicators-for-tq-002)
  - [Problem Indicators (for DQ-002)](#problem-indicators-for-dq-002)
  - [Solution Words (for DQ-003)](#solution-words-for-dq-003)
- [Appendix B: LLM Prompt Templates](#appendix-b-llm-prompt-templates)
  - [Primary Analysis Prompt](#primary-analysis-prompt)
  - [Fallback Analysis Prompt (Simplified)](#fallback-analysis-prompt-simplified)
- [Document Version History](#document-version-history)

## Metadata
- **Category**: API
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

**Status:** Enhanced for Lovable.dev • **Owner:** LEAD Agent (Coordination) • **Scope:** AI-Agent Orchestrated Review  
**Stack:** React + Vite + Tailwind • TypeScript/Zod • Supabase • OpenAI Voice Integration
**Enhancement Level:** EHG Management Model Integration with Multi-Agent Coordination

## EHG Management Model Integration

### Performance Drive Cycle Alignment
- **Strategy Development:** Reviews validate strategic fit with EHG portfolio direction
- **Goal Setting:** Each review contributes to company-specific venture quality metrics
- **Plan Development:** Review outcomes inform downstream planning workflows
- **Implementation & Monitoring:** Chairman Console receives aggregated review intelligence

### AI-Agent Coordination for Reviews
**Agent Responsibilities:**
- **LEAD Agent (Gemini):** Strategic analysis of market positioning and portfolio fit
- **PLAN Agent (Cursor):** Tactical assessment of implementation feasibility  
- **EXEC Agent (Claude):** Technical evaluation of execution complexity
- **EVA Agent:** Real-time review orchestration and quality assurance
- **Chairman:** Strategic override and priority setting

### Multi-Company Portfolio Context
**Cross-Company Analysis:**
- Ideas evaluated against all portfolio company contexts
- Synergy opportunities automatically identified
- Resource sharing possibilities flagged
- Strategic conflicts highlighted for Chairman review

---

## 1. Executive Summary

Stage 02 orchestrates intelligent first-pass evaluation of venture ideas through coordinated AI-agent analysis, combining LEAD strategic assessment, PLAN tactical review, and EXEC feasibility analysis. This multi-agent review system evaluates ideas against EHG portfolio strategy while maintaining Chairman oversight for strategic decisions. Each review contributes to the Performance Drive cycle, informing goal-setting and strategic planning across portfolio companies.

### Implementation Readiness: ⚠️ **Needs Business Logic** → ✅ **Immediately Buildable**

**What This PRD Defines:**
- Multi-agent coordination protocols for review workflow
- Chairman Console integration for executive oversight
- Voice-enabled feedback systems for Chairman input
- Cross-portfolio company evaluation frameworks
- EHG Management Model alignment specifications
- AI-agent consensus mechanisms and escalation paths

**What Developers Build:**
- AI-agent coordination interfaces for multi-agent reviews
- Chairman Console integration for executive review oversight
- Voice-enabled review feedback systems (Chairman + reviewers)
- Cross-portfolio company analysis workflows
- Real-time agent consensus mechanisms
- Performance Drive cycle integration components

---

## 2. Business Logic Specification

### 2.1 Validation Rules Engine

The validation engine evaluates ideas across multiple dimensions. Each rule outputs a score and feedback message.

```typescript
interface EHGValidationRule {
  id: string;
  category: 'quality' | 'viability' | 'originality' | 'market' | 'portfolio-fit' | 'synergy';
  weight: number; // 0.5 to 2.0 multiplier
  agentResponsible: 'LEAD' | 'PLAN' | 'EXEC' | 'EVA';
  portfolioContext: boolean; // Requires multi-company analysis
  chairmanEscalation: boolean; // Requires Chairman review if failed
  evaluate: (idea: EHGPortfolioIdea) => EHGRuleResult;
}

interface EHGRuleResult extends RuleResult {
  agentAnalysis: {
    leadStrategic?: string;     // LEAD agent strategic assessment
    planTactical?: string;      // PLAN agent tactical notes
    execTechnical?: string;     // EXEC agent feasibility
    evaQuality?: string;        // EVA quality assessment
  };
  portfolioSynergies: string[]; // Cross-company opportunities
  chairmanFeedback?: ChairmanVoiceFeedback; // Voice feedback if provided
}

interface RuleResult {
  score: number;      // 0-10 scale
  confidence: number; // 0-1 certainty
  feedback: string;
  details?: Record<string, any>;
}
```

#### 2.1.1 Title Quality Rules

| Rule ID | Check | Scoring Logic | Weight |
|---------|-------|--------------|---------|
| TQ-001 | Length validation | 10 pts: 10-60 chars, 5 pts: 5-9 or 61-80, 0 pts: outside range | 1.0 |
| TQ-002 | Clarity keywords | +2 pts per clarity indicator: "platform", "tool", "system", "service", "solution" (max 6) | 0.8 |
| TQ-003 | Specificity check | +3 pts if contains industry/domain term from taxonomy list | 1.2 |
| TQ-004 | Buzzword penalty | -2 pts per generic term: "revolutionary", "game-changing", "cutting-edge", "disruptive" | 1.0 |
| TQ-005 | Action orientation | +2 pts if starts with verb or contains action word | 0.7 |

#### 2.1.2 Description Quality Rules

| Rule ID | Check | Scoring Logic | Weight |
|---------|-------|--------------|---------|
| DQ-001 | Completeness | 10 pts: >200 chars, 7 pts: 150-200, 4 pts: 100-149, 0 pts: <100 | 1.5 |
| DQ-002 | Problem statement | +4 pts if contains problem indicators: "problem", "issue", "challenge", "pain point", "inefficient" | 1.8 |
| DQ-003 | Solution clarity | +3 pts if contains solution words: "solve", "address", "improve", "optimize", "automate" | 1.3 |
| DQ-004 | Target audience | +5 pts if specifies user segment (developers, marketers, SMBs, enterprise, etc.) | 1.6 |
| DQ-005 | Uniqueness signal | +3 pts if contains differentiation terms: "unlike", "first", "only", "unique" | 0.9 |

#### 2.1.3 Market Potential Rules

| Rule ID | Check | Scoring Logic | Weight |
|---------|-------|--------------|---------|
| MP-001 | Market size indicators | +2 pts per indicator: "billion", "million users", "global", "worldwide" (max 6) | 1.4 |
| MP-002 | Growth signals | +3 pts if contains: "growing", "expanding", "emerging", "trend" | 1.2 |
| MP-003 | Urgency markers | +4 pts if contains: "urgent", "immediate", "critical", "time-sensitive" | 1.1 |
| MP-004 | Competition context | +3 pts if mentions competitive landscape or alternatives | 0.8 |
| MP-005 | Revenue model hint | +5 pts if includes monetization terms: "subscription", "saas", "marketplace", "commission" | 1.3 |

#### 2.1.4 Feasibility Rules

| Rule ID | Check | Scoring Logic | Weight |
|---------|-------|--------------|---------|
| FE-001 | Technical complexity | Penalty: -3 pts if contains >3 complex tech terms without clear path | 1.0 |
| FE-002 | Resource requirements | Penalty: -2 pts if implies large team/capital without justification | 0.9 |
| FE-003 | Timeline realism | +3 pts if includes realistic timeline or phase approach | 0.7 |
| FE-004 | Existing tech leverage | +4 pts if mentions using existing platforms/APIs/tools | 1.2 |
| FE-005 | Regulatory awareness | +2 pts if acknowledges relevant compliance/legal considerations | 0.6 |

### 2.2 Scoring Algorithm

```
Algorithm: Weighted Aggregate Score Calculation

1. COLLECT all rule results
   rules = [TQ-*, DQ-*, MP-*, FE-*]
   
2. CALCULATE category scores
   For each category:
     category_score = SUM(rule.score * rule.weight) / SUM(rule.weight)
     
3. NORMALIZE to 10-point scale
   normalized = (category_score / MAX_POSSIBLE) * 10
   
4. APPLY confidence adjustment
   final_score = normalized * confidence_multiplier
   Where confidence_multiplier = 0.7 + (0.3 * data_completeness_ratio)
   
5. DETERMINE thresholds
   overall_score = AVERAGE(all_category_scores)
   
   Recommendation Logic:
   - overall >= 7.5: "advance" 
   - overall >= 5.0: "revise"
   - overall < 5.0: "reject"
   
   With modifiers:
   - If any category < 3.0: Force "revise" regardless of overall
   - If market_potential > 8.5 AND feasibility > 6.0: Consider "fast-track"
```

### 2.3 LLM Augmentation Specification

The LLM layer provides qualitative analysis to complement deterministic scoring.

```typescript
interface LLMAnalysisRequest {
  idea: DraftIdea;
  deterministicScores: CategoryScores;
  focusAreas: string[]; // Areas needing deeper analysis
}

interface LLMAnalysisResponse {
  insights: {
    strengths: string[];      // 3-5 key strengths
    weaknesses: string[];     // 3-5 improvement areas
    opportunities: string[];  // 2-3 market opportunities
    risks: string[];         // 2-3 potential risks
  };
  suggestions: {
    immediate: string[];     // Quick improvements
    strategic: string[];     // Longer-term considerations
  };
  competitiveContext: string; // Brief competitive landscape
  confidenceFactors: {
    dataQuality: number;     // 0-1 score
    marketClarity: number;   // 0-1 score
    feasibilityClarity: number; // 0-1 score
  };
}
```

#### LLM Prompt Engineering Specification

```
System Prompt Template:
"You are an expert venture evaluator with experience in product-market fit, 
lean startup methodology, and technology commercialization. Evaluate ideas 
based on: viability, originality, market potential, and execution feasibility.
Provide actionable, specific feedback focused on improving success probability."

User Prompt Structure:
1. Idea presentation (title + description)
2. Deterministic scores for context
3. Specific analysis requested (insights, suggestions, competitive)
4. Output format specification (JSON structure)

Prompt Optimization Rules:
- Max 500 tokens for idea description
- Include top 3 deterministic rule triggers for context
- Request structured JSON response
- Specify maximum response length (1000 tokens)
```

---

## 3. Data Architecture

### 3.0 Database Schema Integration

**Canonical Schema Reference**: `enhanced_prds/stage_56_database_schema_enhanced.md`

Stage 02 builds upon the canonical EHG Database Schema for AI-powered review operations:

#### Core Entity Dependencies
- **Venture Entity**: Ideas from Stage 01 for multi-agent review processing
- **AI Review Schema**: Agent analysis results and consensus tracking
- **Chairman Feedback Schema**: Executive review oversight and strategic decisions
- **Feedback Intelligence Schema**: AI sentiment and priority scoring integration
- **Agent Coordination Schema**: Multi-agent workflow state management

#### Universal Contract Enforcement
- **Review Data Contracts**: All AI agent outputs validated against canonical schemas
- **Cross-Agent Consistency**: Agent analysis results follow unified data contracts
- **Chairman Override Protocols**: Executive decision data adheres to canonical feedback schemas
- **Audit Trail Compliance**: Complete review process audit trails per Stage 56 requirements

#### Multi-Agent Review Integration
```typescript
// Database integration for multi-agent review system
interface Stage02DatabaseIntegration {
  ideaEntity: Stage56VentureSchema;
  aiReviewResults: Stage56AIReviewSchema;
  agentConsensus: Stage56AgentConsensusSchema;
  chairmanOverride: Stage56ChairmanFeedbackSchema;
  reviewAuditTrail: Stage56AuditSchema;
}
```

### Integration Hub Connectivity

**Integration Hub Reference**: `enhanced_prds/stage_51_integration_hub_enhanced.md`

AI review processes leverage Integration Hub for external AI service orchestration:

#### AI Service Integrations
- **LEAD Agent (Gemini)**: Strategic analysis via Integration Hub AI connector
- **PLAN Agent (Cursor)**: Tactical assessment through managed API endpoints
- **EXEC Agent (Claude)**: Technical evaluation with rate limiting and optimization
- **External Analytics**: Review performance data streaming via Integration Hub

#### Contract-Driven AI Integration
```typescript
// Integration Hub AI service coordination
interface Stage02IntegrationHub {
  leadGeminiConnector: Stage51AIServiceConnector;
  planCursorConnector: Stage51AIServiceConnector;
  execClaudeConnector: Stage51AIServiceConnector;
  analyticsStreamConnector: Stage51AnalyticsConnector;
}
```

### 3.1 Core Data Schemas

```typescript
// Primary Entities
interface DraftIdea {
  id: string;
  title: string;
  description: string;
  category?: IdeaCategory;
  tags?: string[];
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'submitted' | 'reviewing' | 'reviewed';
}

interface ReviewResult {
  id: string;
  ideaId: string;
  version: number; // Support multiple reviews
  
  // Scoring
  overallScore: number;
  categoryScores: {
    quality: number;
    viability: number;
    originality: number;
    market: number;
    feasibility: number;
  };
  
  // Recommendation
  recommendation: 'advance' | 'revise' | 'reject' | 'fast-track';
  confidence: number;
  
  // Rule Results
  ruleResults: RuleResult[];
  
  // LLM Augmentation
  llmInsights?: LLMAnalysisResponse;
  llmProvider?: string;
  llmModel?: string;
  llmTokenUsage?: TokenUsage;
  
  // Metadata
  processingTime: number; // milliseconds
  createdAt: Date;
  reviewedBy: 'system' | 'chairman' | 'hybrid';
}

interface ChairmanOverride {
  id: string;
  reviewId: string;
  originalRecommendation: string;
  overrideRecommendation: string;
  rationale: string;
  voiceNote?: VoiceNoteReference;
  createdAt: Date;
}
```

### 3.2 Database Schema Specification

```sql
-- Core Tables Structure (Supabase/PostgreSQL)

ideas (
  id UUID PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50),
  tags JSONB,
  author_id UUID REFERENCES users(id),
  status VARCHAR(20),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

ai_reviews (
  id UUID PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id),
  version INTEGER,
  overall_score DECIMAL(3,1),
  category_scores JSONB NOT NULL,
  recommendation VARCHAR(20),
  confidence DECIMAL(3,2),
  rule_results JSONB,
  llm_insights JSONB,
  llm_provider VARCHAR(50),
  llm_model VARCHAR(50),
  llm_token_usage JSONB,
  processing_time INTEGER,
  reviewed_by VARCHAR(20),
  created_at TIMESTAMPTZ,
  
  UNIQUE(idea_id, version)
)

chairman_overrides (
  id UUID PRIMARY KEY,
  review_id UUID REFERENCES ai_reviews(id),
  original_recommendation VARCHAR(20),
  override_recommendation VARCHAR(20),
  rationale TEXT,
  voice_note_url TEXT,
  created_at TIMESTAMPTZ
)

-- Indexes for performance
CREATE INDEX idx_reviews_idea ON ai_reviews(idea_id);
CREATE INDEX idx_reviews_recommendation ON ai_reviews(recommendation);
CREATE INDEX idx_reviews_created ON ai_reviews(created_at DESC);
```

---

## 4. Component Architecture

### 4.1 Component Hierarchy

```
/features/ai_review/
  /components/
    AIReviewDashboard       // Main container
    ReviewTriggerButton     // Initiates review
    ReviewProgressIndicator // Shows processing state
    ReviewResultsPanel      // Displays scores and recommendation
    CategoryScoreCard       // Individual category display
    RuleResultsList        // Detailed rule feedback
    LLMInsightsAccordion   // Expandable insights section
    OverridePanel          // Chairman override interface
    ReviewHistoryTimeline  // Previous reviews display
    
  /hooks/
    useAIReview           // Main review logic orchestration
    useValidationRules    // Rule engine execution
    useLLMAnalysis       // LLM integration
    useReviewState       // State management
    
  /services/
    reviewOrchestrator   // Coordinates review flow
    ruleEngine          // Executes validation rules  
    llmAdapter          // Handles LLM provider abstraction
    scoreCalculator     // Implements scoring algorithm
```

### 4.2 Component Specifications

#### AIReviewDashboard Component

**Responsibility:** Orchestrate the entire review experience

**Props Interface:**
```typescript
interface AIReviewDashboardProps {
  idea: DraftIdea;
  mode: 'automatic' | 'manual' | 'chairman-review';
  onReviewComplete: (result: ReviewResult) => void;
  previousReviews?: ReviewResult[];
}
```

**State Management:**
```typescript
interface AIReviewDashboardState {
  status: 'idle' | 'validating' | 'analyzing' | 'complete' | 'error';
  currentResult: ReviewResult | null;
  processingStep: string; // Current step description
  progress: number; // 0-100 percentage
  error: Error | null;
}
```

**Key Behaviors:**
- Auto-trigger review on idea submission (if mode='automatic')
- Show real-time progress during processing
- Display results in expandable sections
- Enable chairman override when authorized
- Persist results to database on completion

#### ReviewResultsPanel Component

**Responsibility:** Present review results in digestible format

**Display Sections:**
1. **Summary Header**
   - Overall score (prominent, color-coded)
   - Recommendation badge
   - Confidence indicator

2. **Category Breakdown**
   - Spider/radar chart for visual comparison
   - Individual category cards with scores
   - Expandable rule details per category

3. **Insights Section**
   - Strengths and weaknesses lists
   - Improvement suggestions (actionable)
   - Market opportunities identified

4. **Action Buttons**
   - "Accept Review" → Advance to Stage 03
   - "Request Re-review" → Trigger with modifications
   - "Override Decision" → Open chairman panel

---

## 5. Integration Patterns

### 5.1 EVA LLM Router Integration

```typescript
interface EVARouterConfig {
  stage: 'ai_review';
  providers: {
    primary: LLMProvider;
    fallbacks: LLMProvider[];
  };
  retry: {
    maxAttempts: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
  };
  timeout: {
    perProvider: number;
    total: number;
  };
}

interface LLMProvider {
  name: 'openai' | 'anthropic' | 'gemini' | 'local';
  model: string;
  maxTokens: number;
  temperature: number;
  topP?: number;
}
```

**Integration Flow:**
1. Prepare structured prompt with idea + scores
2. Submit to EVA router with stage config
3. Router attempts primary provider
4. On failure, iterate through fallback providers
5. Parse and validate LLM response
6. Merge with deterministic results
7. Return unified ReviewResult

### 5.2 Supabase Integration

**RLS Policies Required:**
```sql
-- Read own reviews
CREATE POLICY read_own_reviews ON ai_reviews
  FOR SELECT USING (
    idea_id IN (
      SELECT id FROM ideas WHERE author_id = auth.uid()
    )
  );

-- Chairman can read all
CREATE POLICY chairman_read_all ON ai_reviews
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'chairman'
    )
  );

-- System can insert reviews
CREATE POLICY system_insert_reviews ON ai_reviews
  FOR INSERT WITH CHECK (
    reviewed_by = 'system'
  );
```

**Real-time Subscriptions:**
```typescript
// Subscribe to review updates
const reviewSubscription = {
  table: 'ai_reviews',
  filter: `idea_id=eq.${ideaId}`,
  event: '*',
  callback: handleReviewUpdate
};
```

### 5.3 Voice Integration (OpenAI)

**Voice Note Capture for Overrides:**
```typescript
interface VoiceOverrideFlow {
  // 1. Start recording
  startRecording: () => MediaRecorder;
  
  // 2. Stream to OpenAI Whisper
  transcribe: (audioBlob: Blob) => Promise<string>;
  
  // 3. Process transcription
  extractOverrideIntent: (transcript: string) => {
    recommendation: string;
    rationale: string;
    confidence: number;
  };
  
  // 4. Store voice note
  storeVoiceNote: (audio: Blob, transcript: string) => Promise<VoiceNoteReference>;
}
```

---

## 6. Error Handling & Edge Cases

### 6.1 Error Scenarios

| Scenario | Detection | Handling | User Feedback |
|----------|-----------|----------|---------------|
| Empty idea fields | Validation before review | Prevent review trigger | "Please complete all required fields" |
| LLM timeout | Promise timeout after 30s | Use deterministic only | "Advanced analysis unavailable, showing basic review" |
| All providers fail | Catch in fallback chain | Return partial result | "Review completed with limited insights" |
| Invalid LLM response | Zod validation failure | Retry with prompt fix | "Regenerating analysis..." |
| Database write failure | Transaction rollback | Retry with exponential backoff | "Saving review... (attempt 2/3)" |
| Concurrent reviews | Version conflict detection | Queue or merge | "Another review in progress" |

### 6.2 Data Validation

```typescript
// Input sanitization
interface InputSanitization {
  maxTitleLength: 200;
  maxDescriptionLength: 5000;
  prohibitedPatterns: RegExp[]; // SQL injection, XSS
  encoding: 'utf-8';
}

// Output validation
interface OutputValidation {
  scoreRange: [0, 10];
  recommendationEnum: ['advance', 'revise', 'reject', 'fast-track'];
  requiredFields: string[];
  jsonSchema: ZodSchema;
}
```

---

## 7. Performance Requirements

### 7.1 Response Time Targets

| Operation | Target | Maximum | Degradation Strategy |
|-----------|--------|---------|---------------------|
| Deterministic rules | <500ms | 1s | Cache rule results |
| LLM analysis | <5s | 30s | Timeout and fallback |
| Total review | <6s | 35s | Show progressive results |
| UI update | <100ms | 200ms | Optimistic updates |
| Database write | <1s | 3s | Queue and retry |

### 7.2 Optimization Strategies

1. **Rule Engine Optimization**
   - Execute rules in parallel where possible
   - Cache regex compilations
   - Use early exit for obvious cases

2. **LLM Optimization**
   - Minimize prompt tokens (max 500)
   - Use streaming responses where supported
   - Cache similar idea analyses (24hr TTL)

3. **UI Optimization**
   - Progressive disclosure (summary first, details on demand)
   - Virtualize long lists
   - Lazy load historical reviews

---

## 8. Security & Privacy

### 8.1 Data Protection

```typescript
interface SecurityRequirements {
  piiRedaction: {
    patterns: ['email', 'phone', 'ssn', 'credit_card'];
    action: 'mask' | 'remove';
  };
  
  encryption: {
    atRest: true;
    inTransit: true;
    algorithm: 'AES-256-GCM';
  };
  
  retention: {
    reviews: '2 years';
    voiceNotes: '90 days';
    llmLogs: '30 days';
  };
}
```

### 8.2 Prompt Injection Prevention

```typescript
interface PromptSecurity {
  sanitization: {
    removeSystemCommands: true;
    escapeSpecialChars: true;
    maxLength: 5000;
  };
  
  validation: {
    checkForInstructions: RegExp;
    blockSuspiciousPatterns: string[];
  };
  
  monitoring: {
    logAnomalies: true;
    alertThreshold: 5; // suspicious attempts
  };
}
```

---

## 9. Testing Strategy

### 9.1 Test Scenarios

**Unit Tests Required:**
- Each validation rule with edge cases
- Scoring algorithm with various inputs
- Recommendation thresholds
- Data sanitization functions

**Integration Tests Required:**
- Full review flow (deterministic + LLM)
- Provider failover sequence
- Database persistence
- Real-time updates

**E2E Tests Required:**
- Submit idea → Review → Override flow
- Concurrent review handling
- Error recovery paths
- Performance under load

### 9.2 Test Data Sets

```typescript
interface TestDataSets {
  validIdeas: {
    highQuality: DraftIdea[];  // Should score 7+
    moderate: DraftIdea[];     // Should score 5-7
    poor: DraftIdea[];        // Should score <5
  };
  
  edgeCases: {
    empty: DraftIdea[];
    tooLong: DraftIdea[];
    specialChars: DraftIdea[];
    multilingual: DraftIdea[];
  };
  
  llmResponses: {
    valid: LLMAnalysisResponse[];
    malformed: string[];
    timeout: null;
    injectionAttempts: string[];
  };
}
```

---

## 10. Monitoring & Analytics

### 10.1 Key Metrics

```typescript
interface ReviewMetrics {
  performance: {
    reviewDuration: Histogram;      // p50, p95, p99
    llmLatency: Histogram;
    ruleExecutionTime: Histogram;
  };
  
  quality: {
    recommendationDistribution: Counter; // advance/revise/reject
    scoreDistribution: Histogram;
    overrideRate: Gauge;
    confidenceAverage: Gauge;
  };
  
  reliability: {
    llmFailureRate: Counter;
    fallbackUsage: Counter;
    errorRate: Counter;
  };
  
  usage: {
    dailyReviews: Counter;
    uniqueUsers: Gauge;
    peakHourLoad: Gauge;
  };
}
```

### 10.2 Alerting Rules

| Metric | Threshold | Alert Level | Action |
|--------|-----------|-------------|--------|
| Error rate | >5% | Critical | Page on-call |
| LLM failure rate | >20% | Warning | Check provider status |
| p95 latency | >30s | Warning | Scale infrastructure |
| Override rate | >40% | Info | Review rule accuracy |

---

## 11. Implementation Checklist

### Phase 1: Foundation (Days 1-2)
- [ ] Set up feature folder structure
- [ ] Define TypeScript interfaces
- [ ] Create Zod schemas
- [ ] Initialize database tables
- [ ] Configure RLS policies

### Phase 2: Core Logic (Days 3-5)
- [ ] Implement validation rules
- [ ] Build scoring algorithm
- [ ] Create rule engine
- [ ] Add recommendation logic
- [ ] Write unit tests

### Phase 3: LLM Integration (Days 6-7)
- [ ] Configure EVA router
- [ ] Create prompt templates
- [ ] Implement fallback chain
- [ ] Add response validation
- [ ] Test provider switching

### Phase 4: UI Components (Days 8-10)
- [ ] Build review dashboard
- [ ] Create results panel
- [ ] Add progress indicators
- [ ] Implement override flow
- [ ] Style with Tailwind

### Phase 5: Integration (Days 11-12)
- [ ] Connect to Supabase
- [ ] Add real-time subscriptions
- [ ] Implement voice capture
- [ ] Set up monitoring
- [ ] Configure alerts

### Phase 6: Testing & Polish (Days 13-14)
- [ ] Run integration tests
- [ ] Perform load testing
- [ ] Fix edge cases
- [ ] Optimize performance
- [ ] Document configuration

---

## 12. Configuration Requirements

### Environment Variables

```bash
# LLM Providers
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...

# Feature Flags
AI_REVIEW_AUTO_TRIGGER=true
AI_REVIEW_USE_LLM=true
AI_REVIEW_CACHE_TTL=86400

# Thresholds (adjustable without code changes)
AI_REVIEW_ADVANCE_THRESHOLD=7.5
AI_REVIEW_REVISE_THRESHOLD=5.0
AI_REVIEW_CONFIDENCE_MINIMUM=0.6

# Performance
AI_REVIEW_TIMEOUT_MS=30000
AI_REVIEW_MAX_RETRIES=3
AI_REVIEW_BATCH_SIZE=10
```

### Feature Toggles

```typescript
interface FeatureConfig {
  enableAutoReview: boolean;
  enableLLMAugmentation: boolean;
  enableVoiceOverride: boolean;
  enableHistoricalComparison: boolean;
  enableFastTrackPath: boolean;
  enableMultiLanguage: boolean;
}
```

---

## 13. Success Criteria

### Definition of Done

- [ ] All validation rules return consistent scores
- [ ] Scoring algorithm produces deterministic results
- [ ] LLM integration fails gracefully
- [ ] Chairman can override any recommendation
- [ ] Reviews complete in <6s (p50)
- [ ] All components are keyboard accessible
- [ ] Error messages are user-friendly
- [ ] Monitoring dashboards are live
- [ ] Documentation is complete
- [ ] 90% test coverage achieved

### Acceptance Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Review accuracy | >80% chairman agreement | Track override rate |
| Processing speed | <6s p50, <30s p95 | Performance monitoring |
| LLM availability | >95% success rate | Error tracking |
| User satisfaction | >4.0/5.0 rating | Feedback surveys |
| System reliability | >99.9% uptime | Availability monitoring |

---

## 14. Migration & Versioning

### Schema Evolution Strategy

```typescript
interface VersioningStrategy {
  current: 'v3';
  supported: ['v2', 'v3']; // Backward compatibility
  
  migration: {
    v2_to_v3: {
      addFields: ['confidence', 'llmInsights'];
      transformFields: {
        'score': 'overallScore';
        'decision': 'recommendation';
      };
      defaultValues: {
        'confidence': 0.7;
        'reviewedBy': 'system';
      };
    };
  };
}
```

### Rollback Plan

1. Feature flag to disable new review system
2. Fallback to v2 logic if critical issues
3. Maintain audit log of all changes
4. Database migrations are reversible
5. Two-week parallel run before full cutover

---

## 15. Future Enhancements

### Planned Improvements (Not in MVP)

1. **Machine Learning Enhancement**
   - Train custom model on chairman overrides
   - Improve scoring accuracy over time
   - Personalized thresholds per category

2. **Advanced Analytics**
   - Cohort analysis of idea success
   - Predictive modeling for outcomes
   - A/B testing framework for rules

3. **Collaboration Features**
   - Multi-reviewer workflows
   - Commenting and annotations
   - Review consensus mechanisms

4. **External Integrations**
   - Market research APIs
   - Patent search integration
   - Competitive intelligence feeds

---

## Appendix A: Validation Rule Taxonomy

### Industry/Domain Terms (for TQ-003)
```
technology, healthcare, finance, education, retail, 
manufacturing, logistics, entertainment, real estate, 
agriculture, energy, transportation, hospitality, 
legal, insurance, telecommunications, media, gaming, 
fitness, food, fashion, travel, automotive, aerospace
```

### Clarity Indicators (for TQ-002)
```
platform, tool, system, service, solution, application, 
framework, engine, network, marketplace, portal, hub, 
dashboard, interface, algorithm, protocol, standard
```

### Problem Indicators (for DQ-002)
```
problem, issue, challenge, pain point, inefficient, 
bottleneck, friction, gap, limitation, constraint, 
obstacle, difficulty, complication, barrier, hurdle
```

### Solution Words (for DQ-003)
```
solve, address, improve, optimize, automate, streamline, 
simplify, accelerate, enhance, enable, facilitate, 
integrate, consolidate, eliminate, reduce, increase
```

---

## Appendix B: LLM Prompt Templates

### Primary Analysis Prompt
```
Analyze this venture idea:
Title: {title}
Description: {description}

Context: Deterministic scoring shows:
- Quality: {quality_score}/10
- Viability: {viability_score}/10  
- Market Potential: {market_score}/10

Provide:
1. Top 3 strengths (one sentence each)
2. Top 3 improvements needed (actionable)
3. Primary market opportunity
4. Biggest execution risk
5. One similar successful venture

Format as JSON matching this structure:
{llm_response_schema}
```

### Fallback Analysis Prompt (Simplified)
```
Quick evaluation of: "{title}"
Idea: "{description}"

Rate 1-10: viability, originality, market potential
Explain each score in one sentence.
Suggest one key improvement.

JSON output required.
```

---

## Document Version History

- **v3.0** (Current): Technical specification enhancement for Lovable.dev
- **v2.0**: Added provider-agnostic patterns and basic schemas  
- **v1.0**: Original business requirements

---

**End of Enhanced PRD**

*This document provides complete technical specifications without implementation code. Developers should implement these specifications using the Lovable.dev stack and patterns defined herein.*