---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# DirectiveLab Component Dependency Tree



## Table of Contents

- [Metadata](#metadata)
- [Component Hierarchy](#component-hierarchy)
- [Data Flow Diagram](#data-flow-diagram)
- [Component Communication Pattern](#component-communication-pattern)
  - [Props Flow (Top-Down)](#props-flow-top-down)
  - [Event Flow (Bottom-Up)](#event-flow-bottom-up)
- [File Dependencies](#file-dependencies)
- [State Management Summary](#state-management-summary)
  - [Main State Variables (15 total)](#main-state-variables-15-total)
- [Testing Strategy](#testing-strategy)
  - [Unit Test Coverage](#unit-test-coverage)
  - [Integration Test Coverage](#integration-test-coverage)
  - [E2E Test Coverage](#e2e-test-coverage)

## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: api, testing, e2e, unit

## Component Hierarchy

```
DirectiveLab/ (Main Orchestrator - 844 LOC)
│
├── Header & Navigation
│   ├── Mode Toggle (Quick/Comprehensive)
│   ├── Help Panel
│   └── Active Step Display
│
├── Progress Bar
│   └── ProgressBar component (imported from ui/)
│
├── Tab Navigation
│   ├── Input & Screenshot Tab
│   └── Recent Submissions Tab
│
├── Step Content Router (renderStepContent)
│   │
│   ├── Step 1: FeedbackForm
│   │   ├── Component: DirectiveLabForm.jsx → FeedbackForm
│   │   ├── Inputs: chairmanInput, screenshotUrl
│   │   ├── Validation: validateChairmanInput, validateUrl
│   │   └── Actions: submitFeedback, saveDraft
│   │
│   ├── Step 2: IntentConfirmationForm
│   │   ├── Component: DirectiveLabForm.jsx → IntentConfirmationForm
│   │   ├── Inputs: intentSummary
│   │   ├── Features: auto-resize textarea
│   │   └── Actions: confirmIntent
│   │
│   ├── Step 3: ClassificationStep
│   │   ├── Component: ValidationGatesManager.jsx → ClassificationStep
│   │   ├── Display: strategic/tactical percentages
│   │   ├── Features: slider adjustment, rationale generation
│   │   └── Actions: acceptClassification, resetOverride
│   │
│   ├── Step 4: ImpactAnalysisSection
│   │   ├── Component: ImpactAnalysisSection.jsx
│   │   ├── Display: ImpactAnalysisPanel (imported)
│   │   ├── Features: blocking issues warning
│   │   └── Actions: acceptImpactAnalysis
│   │
│   ├── Step 5: SynthesisStep
│   │   ├── Component: ValidationGatesManager.jsx → SynthesisStep
│   │   ├── Display: aligned, required, recommended items
│   │   ├── Features: PolicyBadgeSet, review checkbox
│   │   └── Actions: acceptSynthesis
│   │
│   ├── Step 6: QuestionnaireFlow
│   │   ├── Component: QuestionnaireFlow.jsx
│   │   ├── Display: dynamic questions list
│   │   ├── Features: answer collection, review checkbox
│   │   └── Actions: submitAnswers
│   │
│   └── Step 7: FinalConfirmationForm
│       ├── Component: DirectiveLabForm.jsx → FinalConfirmationForm
│       ├── Display: final summary, metrics cards
│       ├── Features: copy summary, regenerate
│       └── Actions: saveAndClose, submitDirective
│
├── Recent Submissions Tab
│   ├── Component: RecentSubmissions (imported)
│   └── Modal: GroupCreationModal (imported)
│
└── Supporting Utilities
    ├── types.js - Shared utilities & constants
    └── hooks/useDataGenerators.js - Auto-generation hooks
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     DirectiveLab.jsx                         │
│                  (Main Orchestrator)                         │
│                                                              │
│  State Management:                                           │
│  • formData (8 fields)                                       │
│  • submission (API response)                                 │
│  • gateStatus (7 gates)                                      │
│  • fieldErrors/fieldSuccess                                  │
│  • impactAnalysis, consistencyValidation                     │
│  • activeStep, mode, loading, error                          │
│                                                              │
│  API Functions:                                              │
│  • submitFeedback()                                          │
│  • updateSubmissionStep()                                    │
│  • completeStep()                                            │
│  • saveAndClose()                                            │
│  • submitDirective()                                         │
│                                                              │
│  Navigation:                                                 │
│  • navigateToStep() - with edit invalidation                │
│  • getNextStep() - mode-aware                                │
│  • getPreviousStep() - mode-aware                            │
│                                                              │
│  Data Generation Hooks:                                      │
│  • useClassificationGenerator()                              │
│  • useImpactAnalysisGenerator()                              │
│  • useSynthesisGenerator()                                   │
│  • useQuestionsGenerator()                                   │
│  • useFinalSummaryGenerator()                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Props Drilling
                            ▼
        ┌───────────────────────────────────────┐
        │                                       │
        ▼                                       ▼
┌────────────────────┐              ┌────────────────────┐
│ DirectiveLabForm   │              │ ValidationGates    │
│                    │              │ Manager            │
│ • FeedbackForm     │              │                    │
│ • IntentForm       │              │ • Classification   │
│ • FinalForm        │              │ • Synthesis        │
│                    │              │                    │
│ 315 LOC            │              │ 336 LOC            │
└────────────────────┘              └────────────────────┘
        │                                       │
        │                                       │
        ▼                                       ▼
┌────────────────────┐              ┌────────────────────┐
│ ImpactAnalysis     │              │ Questionnaire      │
│ Section            │              │ Flow               │
│                    │              │                    │
│ • Display panel    │              │ • Questions list   │
│ • Blocking issues  │              │ • Answer inputs    │
│ • Navigation       │              │ • Review checkbox  │
│                    │              │                    │
│ 87 LOC             │              │ 140 LOC            │
└────────────────────┘              └────────────────────┘
        │                                       │
        │                                       │
        └───────────────┬───────────────────────┘
                        │
                        ▼
            ┌──────────────────────┐
            │     types.js         │
            │                      │
            │ • Navigation utils   │
            │ • Validation funcs   │
            │ • Constants          │
            │ • Keywords           │
            │                      │
            │ 191 LOC              │
            └──────────────────────┘
                        │
                        │
                        ▼
            ┌──────────────────────┐
            │ useDataGenerators.js │
            │                      │
            │ • Classification     │
            │ • Impact Analysis    │
            │ • Synthesis          │
            │ • Questions          │
            │ • Final Summary      │
            │                      │
            │ 450 LOC              │
            └──────────────────────┘
```

## Component Communication Pattern

### Props Flow (Top-Down)

```javascript
DirectiveLab
  │
  ├─> FeedbackForm({
  │     chairmanInput,
  │     screenshotUrl,
  │     fieldErrors,
  │     fieldSuccess,
  │     onChairmanInputChange,
  │     onScreenshotUrlChange,
  │     onSubmit,
  │     onSaveDraft,
  │     loading
  │   })
  │
  ├─> ClassificationStep({
  │     submission,
  │     stratTacOverride,
  │     onStratTacChange,
  │     onResetOverride,
  │     onBack,
  │     onComplete,
  │     loading
  │   })
  │
  ├─> ImpactAnalysisSection({
  │     impactAnalysis,
  │     consistencyValidation,
  │     submission,
  │     onBack,
  │     onComplete,
  │     loading
  │   })
  │
  ├─> QuestionnaireFlow({
  │     submission,
  │     questionAnswers,
  │     onAnswerChange,
  │     questionsReviewed,
  │     onQuestionsReviewedChange,
  │     onBack,
  │     onComplete,
  │     loading
  │   })
  │
  └─> FinalConfirmationForm({
        submission,
        finalConfirmed,
        onFinalConfirmedChange,
        onBack,
        onSaveAndClose,
        onSubmitDirective,
        loading
      })
```

### Event Flow (Bottom-Up)

```
User Action (in sub-component)
  │
  ├─> onChange/onClick handler (props)
  │
  ├─> DirectiveLab state update (setState)
  │
  ├─> API call (if needed)
  │
  ├─> Response processing
  │
  └─> UI update (re-render)
```

## File Dependencies

```
DirectiveLab.jsx
  ├── Imports from React
  │   ├── useState, useEffect
  │   └── useLocation (react-router-dom)
  │
  ├── Imports from lucide-react
  │   └── 8 icons
  │
  ├── Imports from UI components
  │   ├── Button
  │   ├── ProgressBar
  │   ├── RecentSubmissions
  │   ├── GroupCreationModal
  │   └── ToastProvider, useToast
  │
  ├── Imports from DirectiveLab sub-components
  │   ├── FeedbackForm, IntentConfirmationForm, FinalConfirmationForm
  │   ├── ClassificationStep, SynthesisStep
  │   ├── ImpactAnalysisSection
  │   └── QuestionnaireFlow
  │
  ├── Imports from types.js
  │   ├── getSteps, getNextStep, getPreviousStep
  │   ├── DEPENDENCY_MAP, STEP_NAMES, getStepsWithData
  │   ├── validateChairmanInput, validateUrl
  │   └── AUTO_SAVE_DELAY, DRAFT_STORAGE_KEY, TOAST_DURATION
  │
  └── Imports from hooks/useDataGenerators.js
      ├── useClassificationGenerator
      ├── useImpactAnalysisGenerator
      ├── useSynthesisGenerator
      ├── useQuestionsGenerator
      └── useFinalSummaryGenerator
```

## State Management Summary

### Main State Variables (15 total)

```javascript
// Core state
mode                    // 'quick' | 'comprehensive'
activeStep             // 1-7
submission             // API response object
loading                // boolean
error                  // string | null
success                // string | null

// UI state
isMobile               // boolean
activeTab              // 'input' | 'submissions'
showHelp               // boolean

// Form data
formData               // {chairmanInput, screenshotUrl, intentSummary, ...}
fieldErrors            // {chairmanInput?: string, screenshotUrl?: string}
fieldSuccess           // {chairmanInput?: boolean, screenshotUrl?: boolean}
gateStatus             // {1: bool, 2: bool, ..., 7: bool}

// Analysis state
impactAnalysis         // object | null
consistencyValidation  // object | null
synthesisReviewed      // boolean
editHistory            // array

// Group/submissions state
selectedSubmissions    // array
showGroupModal         // boolean
combineMethod          // string
refreshSubmissions     // number (trigger)
```

## Testing Strategy

### Unit Test Coverage

1. **DirectiveLabForm.jsx** (3 components)
   - FeedbackForm: validation, submission, draft save
   - IntentConfirmationForm: auto-resize, navigation
   - FinalConfirmationForm: copy, regenerate, dual actions

2. **ValidationGatesManager.jsx** (2 components)
   - ClassificationStep: slider, rationale, override
   - SynthesisStep: display, review checkbox, navigation

3. **ImpactAnalysisSection.jsx** (1 component)
   - Display logic, blocking issues, navigation

4. **QuestionnaireFlow.jsx** (1 component)
   - Question rendering, answer collection, review

5. **types.js** (utilities)
   - Navigation functions (getSteps, getNextStep, getPreviousStep)
   - Validation functions (validateChairmanInput, validateUrl)
   - Data detection (getStepsWithData)

6. **useDataGenerators.js** (5 hooks)
   - Each hook tests data generation logic independently

### Integration Test Coverage

1. **Navigation Flow**
   - Comprehensive mode: 1→2→3→4→5→6→7
   - Quick mode: 1→3→7
   - Backward navigation
   - Edit invalidation warnings

2. **Data Persistence**
   - Auto-save functionality
   - Draft restoration
   - Step data updates
   - API synchronization

3. **Validation Gates**
   - Gate locking/unlocking
   - Step dependencies
   - Form validation

### E2E Test Coverage

1. **Complete Workflow**
   - Start to finish in comprehensive mode
   - Start to finish in quick mode
   - Draft save and restore
   - Error handling

2. **Edge Cases**
   - Invalid input handling
   - Network errors
   - Browser refresh
   - Mobile responsiveness

---

**Component Count**: 7 focused components
**Total LOC**: 2,370 (avg 338 LOC per component)
**Architecture**: Props drilling with custom hooks
**Status**: ✅ Ready for testing
