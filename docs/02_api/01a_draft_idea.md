---
category: api
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [api, auto-generated]
---
# Stage 01 – Draft Idea PRD (Enhanced Technical Specification v4)



## Table of Contents

- [Metadata](#metadata)
- [EHG Management Model Integration](#ehg-management-model-integration)
  - [Corporate Foundation Layer](#corporate-foundation-layer)
  - [Performance Drive Cycle Alignment](#performance-drive-cycle-alignment)
  - [Multi-Company Architecture](#multi-company-architecture)
  - [AI-Agent Organization](#ai-agent-organization)
- [1. Executive Summary](#1-executive-summary)
  - [Implementation Readiness: ✅ **Immediately Buildable**](#implementation-readiness-immediately-buildable)
- [2. Business Logic Specification](#2-business-logic-specification)
  - [2.1 Input Validation Rules](#21-input-validation-rules)
  - [2.2 Quality Gate Specifications](#22-quality-gate-specifications)
  - [2.3 Comprehensive Voice Ecosystem](#23-comprehensive-voice-ecosystem)
- [3. Data Architecture](#3-data-architecture)
  - [3.1 Core Data Schemas](#31-core-data-schemas)
  - [3.2 Database Schema Integration](#32-database-schema-integration)
  - [3.3 Stage-Specific Schema Extensions](#33-stage-specific-schema-extensions)
- [4. Component Architecture](#4-component-architecture)
  - [4.1 Component Hierarchy](#41-component-hierarchy)
  - [4.2 Component Specifications](#42-component-specifications)
- [5. Integration Patterns](#5-integration-patterns)
  - [5.0 Integration Hub Alignment](#50-integration-hub-alignment)
  - [5.1 Storage Integration](#51-storage-integration)
  - [5.2 Event System](#52-event-system)
  - [5.3 Voice Service Integration](#53-voice-service-integration)
- [6. User Experience Specifications](#6-user-experience-specifications)
  - [6.1 Form Flow](#61-form-flow)
  - [6.2 Voice Input Flow](#62-voice-input-flow)
- [7. Error Handling & Edge Cases](#7-error-handling-edge-cases)
  - [7.1 Input Edge Cases](#71-input-edge-cases)
  - [7.2 Voice Input Edge Cases](#72-voice-input-edge-cases)
- [8. Performance Requirements](#8-performance-requirements)
  - [8.1 Response Time Targets](#81-response-time-targets)
  - [8.2 Resource Optimization](#82-resource-optimization)
- [9. Accessibility Requirements](#9-accessibility-requirements)
  - [9.1 WCAG 2.1 AA Compliance](#91-wcag-21-aa-compliance)
- [10. Security & Privacy](#10-security-privacy)
  - [10.1 Data Protection](#101-data-protection)
- [11. Testing Specifications](#11-testing-specifications)
  - [11.1 Test Scenarios](#111-test-scenarios)
  - [11.2 Test Data Sets](#112-test-data-sets)
- [12. Implementation Checklist](#12-implementation-checklist)
  - [Phase 1: Foundation (Day 1)](#phase-1-foundation-day-1)
  - [Phase 2: Core Form (Days 2-3)](#phase-2-core-form-days-2-3)
  - [Phase 3: Voice Integration (Day 4)](#phase-3-voice-integration-day-4)
  - [Phase 4: Storage & Events (Day 5)](#phase-4-storage-events-day-5)
  - [Phase 5: Polish & Testing (Days 6-7)](#phase-5-polish-testing-days-6-7)
- [13. Configuration Requirements](#13-configuration-requirements)
  - [Environment Variables](#environment-variables)
- [14. Success Criteria](#14-success-criteria)
  - [Definition of Done](#definition-of-done)
  - [Business Metrics](#business-metrics)
- [15. Chairman Console Integration Specifications](#15-chairman-console-integration-specifications)
  - [15.1 Executive Dashboard Integration](#151-executive-dashboard-integration)
  - [15.2 Governance Compliance Integration](#152-governance-compliance-integration)
- [Document Version History](#document-version-history)

## Metadata
- **Category**: API
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

**Status:** Enhanced for Lovable.dev • **Owner:** EVA Agent • **Scope:** AI-Agent Orchestrated  
**Stack:** React + Vite + Tailwind • TypeScript/Zod • Supabase • OpenAI Voice Integration  
**Enhancement Level:** EHG Management Model Integration

## EHG Management Model Integration

### Corporate Foundation Layer
**Vision:** Accelerate breakthrough ventures through AI-powered innovation  
**Values:** Speed, Quality, Scalability, Human-Centric AI  
**Strategic Focus:** Multi-company portfolio development with AI agent orchestration  
**Goals:** Enable rapid venture ideation and validation across EHG portfolio companies  

### Performance Drive Cycle Alignment
- **Strategy Development:** Idea capture supports portfolio strategy execution
- **Goal Setting:** Each idea contributes to company-specific venture targets
- **Plan Development:** Ideas feed into venture development planning workflows
- **Implementation & Monitoring:** Chairman Console integration for portfolio oversight

### Multi-Company Architecture
**EHG Holding Structure:**
- Ideas can be attributed to specific portfolio companies
- Cross-company idea sharing and synergy identification
- Company-specific categorization and validation rules
- Centralized Chairman oversight across all portfolio companies

### AI-Agent Organization
**Agent Coordination:**
- **LEAD Agent (Gemini):** Strategic direction for idea categorization
- **PLAN Agent (Cursor):** Tactical planning for implementation workflows
- **EXEC Agent (Claude):** Technical execution of idea capture systems
- **EVA Agent:** Real-time assistance and idea quality assessment
- **Chairman (Human):** Final oversight and strategic feedback

**RACI Matrix for Stage 01:**
- **Responsible:** EVA Agent (idea capture orchestration)
- **Accountable:** Chairman (strategic oversight)
- **Consulted:** LEAD Agent (categorization guidance)
- **Informed:** PLAN/EXEC Agents (downstream workflow preparation)

---

## 1. Executive Summary

Stage 01 serves as the strategic entry point for venture ideation across the EHG portfolio, capturing breakthrough ideas through intelligent text and voice interfaces. This AI-agent orchestrated system validates ideas against company-specific schemas, enables Chairman voice feedback, and seamlessly integrates with the Chairman Console for portfolio-wide oversight. Each idea becomes part of the Performance Drive cycle, supporting strategy execution across multiple portfolio companies.

### Implementation Readiness: ✅ **Immediately Buildable**

**What This PRD Defines:**
- AI-agent orchestrated idea capture workflows
- Multi-company portfolio integration patterns
- Chairman Console integration for executive oversight
- Voice-enabled feedback systems (Chairman + user input)
- EHG Management Model alignment specifications
- Features-first folder architecture for Lovable.dev
- Corporate governance and compliance frameworks

**What Developers Build:**
- React form components with validation
- Voice input handling and transcription
- Data persistence layer
- Event emission system

---

## 2. Business Logic Specification

### 2.1 Input Validation Rules

```typescript
interface ValidationRules {
  title: {
    minLength: 3;           // Absolute minimum
    maxLength: 120;          // Keep concise
    requiredWords: 2;        // Must have at least 2 words
    prohibitedPatterns: RegExp[]; // No URLs, emails, phone numbers
    characterSet: 'utf-8';   // Unicode support
  };
  
  description: {
    minLength: 20;          // Force meaningful input
    maxLength: 2000;        // Prevent novels
    minWords: 10;           // Ensure substance
    requiredElements: ['problem' | 'solution' | 'opportunity']; // At least one
    qualityChecks: {
      hasActionableContent: boolean;  // Contains verbs
      hasSpecificity: boolean;        // Contains nouns/proper nouns
      coherenceScore: number;         // Sentence structure check
    };
  };
  
  category: {
    allowedValues: IdeaCategory[];
    defaultValue: 'Other';
    requireExplicit: true;  // No auto-selection
  };
  
  tags: {
    minPerTag: 1;
    maxPerTag: 24;
    maxTags: 12;
    normalization: 'lowercase-trim';
    deduplication: true;
    suggestedTags: string[]; // Based on category
  };
}
```

### 2.2 Quality Gate Specifications

```
Algorithm: Minimum Quality Assessment

1. TITLE QUALITY CHECK
   - Must contain 2+ words
   - No single repeated character >3 times
   - Not just numbers or special characters
   - Score: PASS/FAIL (binary gate)

2. DESCRIPTION QUALITY CHECK
   - Word count >= 10
   - Contains at least 2 sentences (period detection)
   - Has problem OR solution indicators
   - Score: PASS/FAIL (binary gate)

3. COMPLETENESS CHECK
   - Title: Required
   - Description: Required
   - Category: Required
   - Tags: Optional but recommended
   
4. DUPLICATE DETECTION
   - Check against last 100 ideas
   - Similarity threshold: 85% (Levenshtein distance)
   - Action: Warn but allow submission

GATE DECISION:
- All required fields present: PROCEED
- Quality checks failed: SHOW_WARNINGS but allow override
- Duplicate detected: SHOW_DUPLICATE_WARNING with comparison
```

### 2.3 Comprehensive Voice Ecosystem

```typescript
interface EHGVoiceEcosystem {
  // User Voice Input (Ideas)
  userVoiceCapture: {
    format: 'webm' | 'wav';
    sampleRate: 44100;          // High quality for Chairman
    maxDuration: 600;           // 10 minutes for detailed ideas
    realTimeTranscription: true;
    multiSpeakerDetection: true;
  };
  
  // Chairman Voice Feedback System
  chairmanVoiceSystem: {
    priorityProcessing: true;    // Chairman gets fastest processing
    executiveQuality: true;      // Best available models
    contextAwareness: true;      // Understands portfolio context
    actionItemDetection: true;   // Auto-detect instructions
    agentRouting: true;         // Auto-route to appropriate agents
  };
  
  // Voice-to-Text Processing (OpenAI Whisper)
  transcriptionPipeline: {
    primary: {
      service: 'openai-whisper-1';
      temperature: 0.0;          // Consistent transcription
      language: 'auto-detect';
      prompt: 'Venture capital, startup ideas, business strategy';
    };
    qualityEnhancement: {
      noiseReduction: true;
      speakerDiarization: true;  // Distinguish multiple speakers
      confidenceScoring: true;
      realTimePartial: true;     // Show partial results
    };
  };
  
  // Text-to-Speech for System Responses (OpenAI TTS)
  systemVoiceResponse: {
    voiceModel: 'alloy';        // Professional, clear
    speed: 1.0;
    chairmanPreferences: {
      voice: 'onyx';            // Preferred executive voice
      speed: 1.1;               // Slightly faster for efficiency
      summaryMode: true;        // Concise responses
    };
    contextualPrompts: true;    // Responses aware of portfolio context
  };
  
  // Performance Optimization
  optimization: {
    streamingTranscription: true;
    backgroundPreprocessing: true;
    chairmanQueuePriority: true;
    multiLanguageSupport: ['en', 'es', 'fr', 'de', 'zh'];
  };
}
```

---

## 3. Data Architecture

### 3.1 Core Data Schemas

```typescript
// Entity Definitions (not implementation)
interface EHGPortfolioIdea {
  id: UUID;
  title: string;
  description: string;
  
  // Multi-Company Portfolio Structure
  portfolioContext: {
    primaryCompany: PortfolioCompanyID;
    secondaryCompanies: PortfolioCompanyID[];
    ehgSynergyPotential: number; // 0-100 score
    crossCompanyOpportunities: string[];
  };
  
  // Voice-Enabled Capture
  voiceCapture: {
    titleVoiceUrl?: string;      // Voice-captured title
    descVoiceUrl?: string;       // Voice-captured description
    chairmanVoiceNotes: ChairmanVoiceFeedback[];
    voiceToTextAccuracy: number; // 0-1 confidence
    multilingualDetected?: string; // Language codes
  };
  
  // EHG Management Model Integration
  managementAlignment: {
    visionAlignment: number;     // 0-100 score vs EHG vision
    strategicFocus: string[];    // Which strategic focuses
    performanceDrivePhase: 'strategy' | 'goals' | 'planning' | 'implementation';
    expectedGoalContribution: string;
  };
  
  // AI Agent Processing
  agentProcessing: {
    leadAnalysis?: LEADIdeaAnalysis;
    planRecommendations?: PLANIdeaRecommendations;
    execFeasibility?: EXECIdeaFeasibility;
    evaQualityScore: number;     // 0-100
    agentConsensus?: 'proceed' | 'hold' | 'reject' | 'escalate';
  };
  
  // Chairman Console Integration
  executiveMetrics: {
    strategicPriority: number;   // 0-100
    resourceRequirement: 'low' | 'medium' | 'high';
    riskLevel: number;          // 0-100
    timeToMarket: number;       // Estimated months
    portfolioFit: number;       // 0-100 portfolio alignment
  };
}

interface ChairmanVoiceFeedback {
  id: UUID;
  targetId: UUID;
  targetType: 'idea' | 'review' | 'validation' | 'portfolio-item';
  
  // Voice-First Feedback System
  voiceFeedback: {
    originalAudioUrl: string;     // OpenAI compatible audio
    transcriptText: string;       // Auto-generated transcript
    chairmanEdited?: string;      // Chairman can edit transcript
    audioLength: number;          // Seconds
    audioQuality: 'high' | 'medium' | 'low';
  };
  
  // Strategic Context
  strategicContext: {
    performanceDrivePhase: 'strategy' | 'goals' | 'planning' | 'implementation';
    portfolioCompany: string;     // Which company this affects
    crossCompanyImpact: string[]; // Other companies affected
    priorityLevel: 'strategic' | 'tactical' | 'operational';
    executiveDecision: boolean;   // Requires board/executive action
  };
  
  // AI Agent Coordination
  agentInstructions: {
    forLEAD?: string;    // Strategic guidance
    forPLAN?: string;    // Tactical planning notes
    forEXEC?: string;    // Implementation instructions
    forEVA?: string;     // Assistance parameters
  };
  
  // Chairman Console Integration
  consoleMetadata: {
    dashboardCategory: string;
    alertLevel: 'info' | 'warning' | 'critical';
    followUpRequired: Date;
    relatedMetrics: string[];
  };
}

// EHG Portfolio Company Categories
enum EHGIdeaCategory {
  // Core Venture Types
  'AI_AGENT_PLATFORM',
  'ENTERPRISE_SAAS',
  'CONSUMER_MARKETPLACE',
  'DEVELOPER_TOOLS',
  'FINTECH_INNOVATION',
  'HEALTHCARE_AI',
  'EDTECH_PLATFORM',
  
  // EHG-Specific Categories
  'PORTFOLIO_SYNERGY',      // Cross-company opportunities
  'INFRASTRUCTURE_PLAY',    // Shared services
  'STRATEGIC_ACQUISITION',  // M&A targets
  'VENTURE_STUDIO_TOOL',    // Internal tooling
  'CHAIRMAN_INITIATIVE',    // Executive-driven projects
  'PERFORMANCE_OPTIMIZATION' // Portfolio efficiency
}

// Portfolio Company Structure
interface PortfolioCompany {
  id: string;
  name: string;
  sector: string;
  stage: 'concept' | 'mvp' | 'growth' | 'scale' | 'exit';
  ehgFoundationLayer: {
    vision: string;
    values: string[];
    strategicFocus: string[];
    currentGoals: string[];
  };
}
```

### 3.2 Database Schema Integration

**Canonical Schema Reference**: `enhanced_prds/stage_56_database_schema_enhanced.md`

This stage integrates with the canonical EHG Database Schema, utilizing the following core entities and contracts:

#### Core Entity Dependencies
- **Venture Entity**: Primary container for venture ideas and metadata
- **Chairman Feedback Schema**: Voice feedback capture and processing (`ChairmanVoiceFeedback`)  
- **Feedback Intelligence Schema**: AI-powered feedback analysis and sentiment tracking
- **User Authentication Schema**: User identity and session management
- **Portfolio Company Schema**: Multi-company portfolio structure support

#### Contract Compliance Requirements
- **Universal Contract Enforcement**: All data operations must comply with Stage 56 canonical contracts
- **Schema Evolution Support**: Automatic schema migration support via Stage 56 intelligent migration engine
- **Data Integrity Validation**: Real-time validation against canonical data contracts
- **Cross-Stage Consistency**: Ensure entity definitions align with downstream workflow stages

#### Integration Points
```typescript
// Reference to canonical entities from Stage 56
interface Stage01DatabaseIntegration {
  ventureEntity: Stage56VentureSchema;
  chairmanFeedback: Stage56ChairmanFeedbackSchema;
  feedbackIntelligence: Stage56FeedbackIntelligenceSchema;
  userAuthentication: Stage56UserAuthSchema;
  portfolioCompany: Stage56PortfolioCompanySchema;
}
```

### 3.3 Stage-Specific Schema Extensions

```sql
-- Table Structures (PostgreSQL/Supabase)

ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(120) NOT NULL CHECK (LENGTH(title) >= 3),
  description TEXT NOT NULL CHECK (LENGTH(description) >= 20),
  category VARCHAR(50) NOT NULL,
  tags TEXT[] DEFAULT '{}',
  
  -- Metadata
  source VARCHAR(20) DEFAULT 'manual',
  voice_transcript TEXT,
  import_source VARCHAR(200),
  device_info JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  modified_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  
  -- Ownership
  created_by UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  visibility VARCHAR(20) DEFAULT 'private',
  
  -- Constraints
  CONSTRAINT valid_category CHECK (category IN ('SaaS','Marketplace',...)),
  CONSTRAINT valid_visibility CHECK (visibility IN ('private','organization','public'))
)

chairman_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL,
  target_type VARCHAR(20) NOT NULL,
  
  -- Feedback content
  feedback_text TEXT NOT NULL CHECK (LENGTH(feedback_text) >= 3),
  sentiment VARCHAR(20),
  action_required BOOLEAN DEFAULT FALSE,
  priority VARCHAR(10),
  
  -- Voice support
  mode VARCHAR(10) NOT NULL DEFAULT 'text',
  voice_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  role VARCHAR(20) DEFAULT 'chairman',
  context JSONB,
  
  -- Indexes
  INDEX idx_feedback_target (target_id, target_type),
  INDEX idx_feedback_created (created_at DESC)
)
```

---

## 4. Component Architecture

### 4.1 Component Hierarchy

```
/features/venture-ideation/
  /components/
    IdeaCaptureShell        // Main container with Chairman Console integration
    MultiCompanySelector    // Portfolio company selection
    VoiceEnabledForm       // Voice-first form interface
    TitleCaptureVoice      // Voice-enabled title input
    DescriptionVoiceEditor // Voice transcription + editing
    StrategicCategorizer   // AI-powered categorization with LEAD agent input
    CrossCompanySynergy    // Multi-company opportunity identification
    ChairmanVoiceFeedback  // Real-time Chairman voice feedback
    PerformanceDrivePanel  // Strategy cycle integration
    GovernanceCompliance   // Corporate governance validation
    PortfolioContext       // Chairman Console context panel
    
  /hooks/
    useEHGIdeaWorkflow   // EHG Management Model integration
    useMultiCompanyState // Portfolio company state management
    useVoiceEverywhere   // Comprehensive voice integration (user + Chairman)
    useAIAgentCoord      // AI agent coordination (LEAD/PLAN/EXEC/EVA)
    useChairmanConsole   // Chairman Console integration
    usePerformanceDrive  // Performance cycle tracking
    useGovernanceGates   // Corporate governance validation
    
  /services/
    ehgIdeaOrchestrator    // Multi-company idea orchestration
    voiceEcosystemService  // Full voice ecosystem (OpenAI STT/TTS)
    chairmanConsoleAPI     // Chairman Console integration
    agentCoordinationAPI   // AI agent coordination protocols
    portfolioSynergyAPI    // Cross-company synergy detection
    performanceDriveAPI    // Performance cycle integration
    governanceComplianceAPI // Corporate governance validation
```

### 4.2 Component Specifications

#### DraftIdeaPage Component

**Responsibility:** Container for the entire idea capture experience

**State Management:**
```typescript
interface DraftIdeaPageState {
  mode: 'create' | 'edit' | 'view';
  idea: Partial<DraftIdea>;
  validation: ValidationState;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  voiceStatus: 'idle' | 'recording' | 'transcribing' | 'complete';
  autoSaveEnabled: boolean;
  lastSaved?: Date;
}

interface ValidationState {
  isValid: boolean;
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
  touched: Record<string, boolean>;
}
```

**Key Behaviors:**
- Auto-save every 30 seconds if changes detected
- Real-time validation on blur/change
- Voice input appends to description
- Keyboard shortcuts for submission (Cmd/Ctrl + Enter)
- Preserve unsaved changes on navigation (with warning)

#### VoiceRecorder Component

**Responsibility:** Handle voice input capture and transcription

**Interface Specification:**
```typescript
interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  maxDuration?: number;
  autoStop?: boolean;
}

interface VoiceRecorderState {
  status: 'idle' | 'requesting-permission' | 'recording' | 'processing' | 'complete' | 'error';
  duration: number;
  audioLevel: number;
  transcript?: string;
  error?: VoiceError;
}

interface VoiceError {
  type: 'permission-denied' | 'not-supported' | 'transcription-failed' | 'timeout';
  message: string;
  fallbackAction?: string;
}
```

**Visual States:**
- Idle: Microphone icon with "Click to record"
- Recording: Pulsing red dot, waveform visualization
- Processing: Spinner with "Transcribing..."
- Complete: Green checkmark with preview
- Error: Red icon with error message and retry

---

## 5. Integration Patterns

### 5.0 Integration Hub Alignment

**Integration Hub Reference**: `enhanced_prds/stage_51_integration_hub_enhanced.md`

This stage leverages the canonical Integration Hub for external system connectivity and data transformation:

#### External Integration Requirements
- **Voice Service APIs**: OpenAI Whisper integration via Stage 51 API orchestration
- **Chairman Console Integration**: Real-time data sync through Integration Hub connectors
- **Portfolio Company APIs**: Multi-tenant data integration for portfolio company systems
- **Analytics Platforms**: Event streaming to analytics systems via Integration Hub

#### Data Contract Enforcement
- **API Schema Validation**: All external API calls validated through Integration Hub contracts
- **Data Transformation**: Intelligent data mapping via Stage 51 transformation engine
- **Error Recovery**: Automated integration failure recovery through Integration Hub monitoring
- **Rate Limiting**: Intelligent API rate limiting and optimization via Integration Hub

#### Integration Monitoring
```typescript
// Integration Hub connectivity for Stage 01
interface Stage01IntegrationHub {
  voiceServiceConnector: Stage51VoiceAPIConnector;
  chairmanConsoleConnector: Stage51ChairmanAPIConnector;
  portfolioDataConnector: Stage51PortfolioAPIConnector;
  analyticsConnector: Stage51AnalyticsConnector;
}
```

### 5.1 Storage Integration

```typescript
interface StorageStrategy {
  primary: 'supabase';
  fallback: 'local-storage';
  
  persistence: {
    drafts: {
      location: 'localStorage';
      key: 'draft-ideas';
      maxItems: 10;
      ttl: 7; // days
    };
    
    submitted: {
      location: 'supabase';
      table: 'ideas';
      replication: 'async';
    };
  };
  
  sync: {
    strategy: 'eventual';
    conflictResolution: 'last-write-wins';
    retryPolicy: {
      maxAttempts: 3;
      backoffMultiplier: 2;
    };
  };
}
```

### 5.2 Event System

```typescript
interface EventSpecification {
  events: {
    'idea.draft.created': {
      payload: { id: UUID; title: string };
      subscribers: ['analytics', 'autosave'];
    };
    
    'idea.draft.updated': {
      payload: { id: UUID; changes: string[] };
      subscribers: ['autosave'];
      debounce: 1000; // ms
    };
    
    'idea.submitted': {
      payload: { id: UUID; idea: DraftIdea };
      subscribers: ['stage-02-review', 'analytics', 'notifications'];
    };
    
    'idea.validation.failed': {
      payload: { errors: ValidationError[] };
      subscribers: ['analytics', 'error-tracking'];
    };
    
    'voice.transcription.complete': {
      payload: { duration: number; wordCount: number };
      subscribers: ['analytics'];
    };
  };
  
  delivery: {
    guaranteed: ['idea.submitted'];
    bestEffort: ['idea.draft.updated', 'voice.transcription.complete'];
  };
}
```

### 5.3 Voice Service Integration

```typescript
interface VoiceServiceSpec {
  providers: {
    primary: {
      service: 'openai';
      endpoint: '/v1/audio/transcriptions';
      model: 'whisper-1';
      options: {
        temperature: 0;
        language: 'en';
        response_format: 'json';
      };
    };
    
    fallback: {
      service: 'web-speech-api';
      recognition: 'webkitSpeechRecognition' | 'SpeechRecognition';
      options: {
        continuous: false;
        interimResults: true;
        maxAlternatives: 1;
      };
    };
  };
  
  processing: {
    chunking: {
      enabled: true;
      size: 25; // MB
      overlap: 1; // seconds
    };
    
    quality: {
      noiseReduction: true;
      normalization: true;
      format: 'wav';
    };
  };
}
```

---

## 6. User Experience Specifications

### 6.1 Form Flow

```
User Journey: Idea Capture

1. ENTRY POINTS
   - "New Idea" button in header
   - Keyboard shortcut (Cmd/Ctrl + N)
   - Voice command: "Hey EVA, new idea"

2. PROGRESSIVE DISCLOSURE
   Step 1: Title (focused on load)
   Step 2: Description (revealed after title)
   Step 3: Category (auto-suggested based on content)
   Step 4: Tags (optional, suggested based on category)

3. VALIDATION FEEDBACK
   - Real-time character count
   - Quality indicators (green/yellow/red)
   - Inline error messages
   - Success checkmarks on valid fields

4. SUBMISSION OPTIONS
   - "Save as Draft" → Stay on page
   - "Save and Close" → Return to list
   - "Save and Review" → Proceed to Stage 02
   - "Save and New" → Clear form for next idea

5. POST-SUBMISSION
   - Success toast with idea ID
   - Option to add Chairman feedback
   - Link to view in Stage 02 review
```

### 6.2 Voice Input Flow

```
Voice Capture Sequence:

1. REQUEST PERMISSION
   - Browser permission prompt
   - Fallback message if denied
   - Settings link for manual enable

2. RECORDING INTERFACE
   - 3-second countdown
   - Live audio waveform
   - Duration timer
   - Stop button (prominent)

3. PROCESSING FEEDBACK
   - "Processing audio..." spinner
   - Chunk progress if long recording
   - Partial results display (if available)

4. RESULT PRESENTATION
   - Full transcript in preview box
   - Edit capability before inserting
   - "Use Transcript" / "Retry" / "Cancel" actions

5. ERROR RECOVERY
   - Clear error message
   - Suggested fixes
   - Fallback to text input
   - Retry with different settings
```

---

## 7. Error Handling & Edge Cases

### 7.1 Input Edge Cases

| Scenario | Detection | Handling | User Feedback |
|----------|-----------|----------|---------------|
| Empty required field | On blur/submit | Prevent submission | "This field is required" |
| Too short input | Character count | Allow but warn | "Add more detail for better results" |
| Too long input | Character limit | Truncate with warning | "Maximum {limit} characters" |
| Special characters | Regex validation | Strip or escape | "Special characters removed" |
| Duplicate idea | Similarity check | Allow but notify | "Similar idea exists: [link]" |
| Spam/gibberish | Pattern detection | Flag for review | "Please provide meaningful content" |

### 7.2 Voice Input Edge Cases

| Scenario | Detection | Handling | User Feedback |
|----------|-----------|----------|---------------|
| No microphone | API check | Disable voice | "No microphone detected" |
| Permission denied | Promise rejection | Show text input | "Microphone access required" |
| Background noise | Low confidence | Suggest retry | "High noise detected, try again?" |
| Multiple speakers | Voice change detection | Warning | "Multiple voices detected" |
| Timeout | Duration > max | Auto-stop | "Maximum recording time reached" |
| Network failure | Fetch error | Local save | "Saved locally, will sync later" |

---

## 8. Performance Requirements

### 8.1 Response Time Targets

| Operation | Target | Maximum | Optimization |
|-----------|--------|---------|--------------|
| Form field input | <50ms | 100ms | Debounce validation |
| Character count | <10ms | 50ms | Local calculation |
| Category suggest | <200ms | 500ms | Preload options |
| Tag autocomplete | <150ms | 300ms | Local dataset |
| Save draft | <500ms | 2s | Background save |
| Submit idea | <1s | 3s | Optimistic UI |
| Start recording | <100ms | 500ms | Pre-warm API |
| Transcription | <3s/min | 10s/min | Stream processing |

### 8.2 Resource Optimization

```typescript
interface OptimizationStrategy {
  memory: {
    maxAudioBuffer: 100; // MB
    maxUndoStack: 20;   // Operations
    clearOnSubmit: true;
  };
  
  network: {
    compression: 'gzip';
    batchUpdates: true;
    debounceSave: 2000; // ms
    retryOnFailure: true;
  };
  
  rendering: {
    virtualizeTagList: true; // After 20 tags
    lazyLoadCategories: false; // Always loaded
    memoizeValidation: true;
  };
}
```

---

## 9. Accessibility Requirements

### 9.1 WCAG 2.1 AA Compliance

```typescript
interface AccessibilitySpec {
  keyboard: {
    fullNavigation: true;
    shortcuts: {
      'submit': 'Ctrl+Enter',
      'cancel': 'Escape',
      'voice': 'Ctrl+Shift+V',
    };
    tabOrder: 'logical';
  };
  
  screen_reader: {
    landmarks: true;
    liveRegions: ['validation', 'save-status', 'transcript'];
    labels: 'all-inputs';
    descriptions: 'help-text';
  };
  
  visual: {
    contrast: 4.5; // Minimum ratio
    focusIndicators: 'visible';
    errorColors: 'not-sole-indicator';
    fontSize: 'user-scalable';
  };
  
  motor: {
    targetSize: '44x44'; // Minimum px
    timeout: 'user-adjustable';
    dragAlternatives: true;
  };
}
```

---

## 10. Security & Privacy

### 10.1 Data Protection

```typescript
interface SecurityRequirements {
  input_sanitization: {
    xss_prevention: true;
    sql_injection: true;
    script_tags: 'strip';
    max_length_enforcement: true;
  };
  
  pii_handling: {
    detection: ['email', 'phone', 'ssn'];
    redaction: 'before-storage';
    encryption: 'at-rest';
    retention: '90-days';
  };
  
  voice_privacy: {
    storage: 'user-consent-required';
    transcripts: 'deletable';
    sharing: 'opt-in';
  };
  
  rate_limiting: {
    submissions: '10-per-minute';
    voice_transcriptions: '5-per-minute';
    api_calls: '100-per-minute';
  };
}
```

---

## 11. Testing Specifications

### 11.1 Test Scenarios

**Unit Tests:**
- Field validation (empty, min, max, special chars)
- Quality gate algorithms
- Tag normalization and deduplication
- Event emission verification

**Integration Tests:**
- Form submission flow
- Voice recording and transcription
- Auto-save functionality
- Duplicate detection

**E2E Tests:**
- Complete idea submission journey
- Voice input with transcription
- Chairman feedback addition
- Error recovery paths

### 11.2 Test Data Sets

```typescript
interface TestData {
  valid_ideas: {
    minimal: { title: 'Valid Title', description: '20 character minimum', category: 'SaaS' };
    complete: { /* all fields */ };
    voice_generated: { /* from transcript */ };
  };
  
  invalid_ideas: {
    empty_title: { title: '', /* ... */ };
    short_description: { description: 'Too short' };
    invalid_category: { category: 'Invalid' };
    xss_attempt: { title: '<script>alert(1)</script>' };
  };
  
  edge_cases: {
    unicode: { title: '🚀 Émoji Tîtle 中文' };
    max_length: { description: 'x'.repeat(2000) };
    many_tags: { tags: Array(12).fill('tag') };
  };
}
```

---

## 12. Implementation Checklist

### Phase 1: Foundation (Day 1)
- [ ] Set up feature folder structure
- [ ] Define TypeScript interfaces
- [ ] Create Zod validation schemas
- [ ] Initialize component shells

### Phase 2: Core Form (Days 2-3)
- [ ] Build form components
- [ ] Implement validation logic
- [ ] Add real-time feedback
- [ ] Create auto-save functionality

### Phase 3: Voice Integration (Day 4)
- [ ] Implement voice recorder
- [ ] Integrate transcription service
- [ ] Add fallback handling
- [ ] Create transcript editor

### Phase 4: Storage & Events (Day 5)
- [ ] Set up Supabase tables
- [ ] Implement CRUD operations
- [ ] Add event emission
- [ ] Configure persistence

### Phase 5: Polish & Testing (Days 6-7)
- [ ] Add accessibility features
- [ ] Implement error handling
- [ ] Write comprehensive tests
- [ ] Performance optimization

---

## 13. Configuration Requirements

### Environment Variables

```bash
# Core Configuration
NODE_ENV=development|production
API_URL=https://api.example.com

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_KEY=xxx

# Voice Services
OPENAI_API_KEY=sk-xxx
SPEECH_API_ENDPOINT=/api/speech

# Feature Flags
ENABLE_VOICE_INPUT=true
ENABLE_AUTO_SAVE=true
ENABLE_DUPLICATE_CHECK=true
ENABLE_AI_SUGGESTIONS=false

# Limits
MAX_TITLE_LENGTH=120
MAX_DESCRIPTION_LENGTH=2000
MAX_TAGS=12
MAX_AUDIO_DURATION=300
```

---

## 14. Success Criteria

### Definition of Done

- [ ] All fields validate according to specifications
- [ ] Voice input works with fallback
- [ ] Ideas persist to database
- [ ] Events emit to downstream stages
- [ ] Chairman feedback can be added
- [ ] Auto-save prevents data loss
- [ ] Accessibility standards met
- [ ] Performance targets achieved
- [ ] Security requirements implemented
- [ ] 90% test coverage

### Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to capture | <2 minutes | Analytics tracking |
| Form completion | >90% | Funnel analysis |
| Voice usage | >30% | Feature analytics |
| Validation errors | <10% | Error tracking |
| Save success | >99% | Database logs |

---

## 15. Chairman Console Integration Specifications

### 15.1 Executive Dashboard Integration
```typescript
interface ChairmanConsoleIntegration {
  // Real-time Idea Flow Monitoring
  ideationMetrics: {
    ideasPerCompany: Record<PortfolioCompanyID, number>;
    qualityTrends: {
      daily: number[];
      weekly: number[];
      monthly: number[];
    };
    categoryDistribution: Record<EHGIdeaCategory, number>;
    synergyOpportunities: CrossCompanyOpportunity[];
  };
  
  // 15-Minute Portfolio Oversight
  executiveSummary: {
    newIdeasCount: number;
    strategicAlignmentScore: number;
    crossCompanySynergies: number;
    actionItemsForChairman: ChairmanActionItem[];
    portfolioHealthIndicators: {
      ideationVelocity: 'high' | 'medium' | 'low';
      qualityTrend: 'improving' | 'stable' | 'declining';
      diversificationIndex: number; // 0-100
    };
  };
  
  // Voice-Enabled Executive Controls
  voiceCommands: {
    'show new ideas': () => DisplayNewIdeasPanel;
    'company [name] summary': (company: string) => CompanySummary;
    'record feedback': () => StartVoiceFeedback;
    'prioritize idea [id]': (id: string) => SetIdeaPriority;
    'schedule review': () => ScheduleIdeaReview;
  };
}
```

### 15.2 Governance Compliance Integration
```typescript
interface GovernanceIntegration {
  // Corporate Governance Gates
  complianceChecks: {
    strategicAlignment: (idea: EHGPortfolioIdea) => boolean;
    resourceAllocation: (idea: EHGPortfolioIdea) => 'within-budget' | 'requires-approval';
    riskAssessment: (idea: EHGPortfolioIdea) => RiskLevel;
    portfolioFit: (idea: EHGPortfolioIdea) => number;
  };
  
  // Performance Drive Cycle Integration
  performanceDriveTracking: {
    strategicContribution: number;
    goalAlignment: string[];
    planningRequirements: string[];
    implementationComplexity: 'low' | 'medium' | 'high';
  };
}
```

---

## Document Version History

- **v4.0** (Current): EHG Management Model integration with voice ecosystem
- **v3.0**: Technical specification enhancement for Lovable.dev
- **v2.0**: Added schemas and basic component code
- **v1.0**: Original business requirements

---

**End of Enhanced EHG-Integrated PRD**

*This document provides complete EHG Management Model specifications with AI-agent orchestration, multi-company portfolio integration, comprehensive voice systems, and Chairman Console integration. All specifications are optimized for Lovable.dev implementation with features-first architecture.*