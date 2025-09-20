# 1. Draft Idea

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
- Idea completeness > ${thresholds.stage1.idea_completeness_min} -> **Advance**
- Validation score > ${thresholds.stage1.validation_score_min} -> **Proceed to AI review**
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
- **APIs**: TODO: Speech-to-text API, Natural language processing
- **External Services**: TODO: Supabase for storage

## Error Handling
- Voice transcription failures → Fall back to text input
- Validation errors → Clear error messages to Chairman
- Database write failures → Retry with exponential backoff

## Metrics & KPIs
- Idea quality score
- Validation completeness
- Time to capture

## Risks & Mitigations
- **Primary Risk**: TBD
- **Mitigation Strategy**: TBD
- **Fallback Plan**: TBD

## Failure Modes & Recovery
- **Common Failures**: TBD
- **Recovery Steps**: TBD
- **Rollback Procedure**: TBD

## Security/Compliance Considerations
- **Data Security**: Standard EHG data protection policies apply
- **Compliance**: SOX, GDPR where applicable
- **Audit Trail**: All decisions and changes logged

## Notes / Open Questions
- TODO: Map to specific PRD implementations
- TODO: Define specific tool integrations
- TODO: Establish concrete metrics and thresholds