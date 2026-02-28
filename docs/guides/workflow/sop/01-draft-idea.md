---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# 1. Draft Idea


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, security, validation

- **Depends on**: None
- **Purpose**: Capture and validate initial venture ideas with AI assistance and Chairman feedback.

## Entry Gate
- No specific entry requirements

## Exit Gate
- Title validated (3-120 chars)
- Description validated (20-2000 chars)
- Category assigned

## Inputs
- Voice recording
- Text input
- Chairman feedback

## Outputs
- Structured idea document
- Initial validation
- Risk assessment

## Substages & Checklists
### 1.1 Idea Brief Creation
  - [ ] Title captured
  - [ ] Description written
  - [ ] Category selected

### 1.2 Assumption Listing
  - [ ] Key assumptions documented
  - [ ] Risk factors identified

### 1.3 Initial Success Criteria
  - [ ] Success metrics defined
  - [ ] Validation rules applied

## Progression Mode
Manual (default). System learns from Chairman feedback over time to suggest Auto.

## Metric -> Action Map (examples)
- Idea completeness > 70% -> **Advance**
- Validation score > 80% -> **Proceed to AI review**
- Title/description validation failed -> **Remediate**

## Data Flow (contract skeleton)
- **Inputs**: Chairman voice/text input, EVA notes
- **Outputs**: stage_summary.json → stored in DB, consumed by Stage 2

## Rollback
- Clear captured idea data from database
- Reset validation flags
- Notify Chairman of rollback reason

## Tooling & Integrations
- **Primary Tools**: EVA Assistant, Voice Interface
- **APIs**: Web Speech API (browser-native), OpenAI API for natural language processing
- **External Services**: Supabase for venture data storage and validation

## Error Handling
- Voice transcription failures → Fall back to text input
- Validation errors → Clear error messages to Chairman
- Database write failures → Retry with exponential backoff

## Metrics & KPIs
- Idea quality score
- Validation completeness
- Time to capture

## Risks & Mitigations
- **Primary Risk**: Process delays due to unclear validation criteria or incomplete idea capture
- **Mitigation Strategy**: Clear success criteria defined in Exit Gate; structured templates for idea capture
- **Fallback Plan**: Manual Chairman review and clarification; iterative refinement of incomplete ideas

## Failure Modes & Recovery
- **Common Failures**: Voice transcription errors; incomplete description (< 20 chars); missing category assignment; validation timeout
- **Recovery Steps**:
  - Voice transcription failure → Automatically fall back to text input
  - Incomplete data → Prompt Chairman with specific missing fields
  - Validation timeout → Retry validation with exponential backoff (max 3 attempts)
- **Rollback Procedure**: Clear captured idea data from database; reset validation flags; notify Chairman of rollback reason (see "Rollback" section above)

## Security/Compliance Considerations
- **Data Security**: Standard EHG data protection policies apply
- **Compliance**: SOX, GDPR where applicable
- **Audit Trail**: All decisions and changes logged

## Implementation Status

**Maturity**: 🚧 Partially Implemented (~70% complete)

**What IS Implemented**:
- ✅ Substage 1.1 (Idea Brief Creation) - Core form with title, description, category
- ✅ Quality scoring algorithm (EVA) - 100-point scale with detailed feedback
- ✅ Field validation (frontend + database) - Title (3-120), Description (20-2000)
- ✅ Voice recording component exists - Standalone VoiceRecorder component functional
- ✅ Transcription service - OpenAI Whisper API integration complete
- ✅ API endpoints - Venture creation endpoints operational

**What is NOT Implemented**:
- ❌ Substage 1.2 (Assumption Listing) - No assumptions/risk factors fields in UI
- ❌ Substage 1.3 (Success Criteria) - No success metrics input fields in UI
- ❌ Voice integration into main workflow - VoiceRecorder not connected to Stage1DraftIdea component
- ❌ API-level validation - Character limits only enforced in frontend and database

**Alternative Implementation**: Strategic Context fields (Vision Alignment, Strategic Focus, Performance Drive Phase) implemented instead of documented substages 1.2-1.3.

**Implementation Location**: `/mnt/c/_EHG/EHG/src/components/stages/Stage1DraftIdea.tsx` (EHG repository)

## Notes / Open Questions
- PRD mapping: Stage 1 is currently pre-PRD phase; PRD creation begins in Stage 2 (AI Review)
- Tool integrations defined above in "Tooling & Integrations" section
- Metrics thresholds established in "Metric -> Action Map" section
- For detailed gap analysis, see `docs/workflow/dossiers/stage-01/implementation-gaps.md`