# SD Script Migration Analysis
Generated: 2025-09-27T14:55:51.664Z

## Summary
- Total scripts found: 38
- Handoff scripts: 13
- PRD scripts: 5
- Execute scripts: 4
- Need manual review: 16

## Migration Commands

### Handoff Scripts
- `create-lead-plan-handoff-sd028.js` → `node templates/create-handoff.js LEAD PLAN SD028`
- `create-plan-exec-handoff-sd008.js` → `node templates/create-handoff.js PLAN EXEC SD008`
- `sd003-lead-plan-handoff.js` → `node templates/create-handoff.js LEAD PLAN SD003`
- `sd027-lead-plan-handoff.js` → `node templates/create-handoff.js LEAD PLAN SD027`
- `sd027-plan-exec-handoff.js` → `node templates/create-handoff.js PLAN EXEC SD027`
- `sd031-lead-plan-handoff.js` → `node templates/create-handoff.js LEAD PLAN SD031`
- `sd037-lead-plan-handoff.js` → `node templates/create-handoff.js LEAD PLAN SD037`
- `sd039-exec-plan-verification-handoff.js` → `# Handoff phases unclear for sd039-exec-plan-verification-handoff.js`
- `sd039-lead-plan-handoff.js` → `node templates/create-handoff.js LEAD PLAN SD039`
- `sd039-plan-exec-handoff.js` → `node templates/create-handoff.js PLAN EXEC SD039`
- `sd039-plan-lead-approval-handoff.js` → `# Handoff phases unclear for sd039-plan-lead-approval-handoff.js`
- `sd046-lead-plan-handoff.js` → `node templates/create-handoff.js LEAD PLAN SD046`
- `sd046-plan-exec-handoff.js` → `node templates/create-handoff.js PLAN EXEC SD046`

### PRD Generation Scripts
- `generate-prd-sd008.js` → `node templates/generate-prd.js SD008`
- `generate-prd-sd027.js` → `node templates/generate-prd.js SD027`
- `generate-prd-sd037.js` → `node templates/generate-prd.js SD037`
- `generate-prd-sd039.js` → `node templates/generate-prd.js SD039`
- `generate-prd-sd046.js` → `node templates/generate-prd.js SD046`

### Execution Scripts
- `execute-plan-sd008.js` → `node templates/execute-phase.js EXEC SD008`
- `execute-sd-leo-001.js` → `# Unable to extract SD ID from execute-sd-leo-001.js`
- `execute-sd-leo-002.js` → `# Unable to extract SD ID from execute-sd-leo-002.js`
- `execute-sd-leo-003.js` → `# Unable to extract SD ID from execute-sd-leo-003.js`


### Manual Review Needed
- `plan-verification-sd-2025-001.js` - # Unknown script type for plan-verification-sd-2025-001.js
- `plan-verify-sdip.js` - # Unable to extract SD ID from plan-verify-sdip.js
- `sd027-completion.js` - # Unknown script type for sd027-completion.js
- `sd027-exec-completion.js` - # Unknown script type for sd027-exec-completion.js
- `sd027-lead-final-approval.js` - # Unknown script type for sd027-lead-final-approval.js
- `sd027-lead-requirements-analysis.js` - # Unknown script type for sd027-lead-requirements-analysis.js
- `sd028-phase1-verification.js` - # Unknown script type for sd028-phase1-verification.js
- `sd028-phase2-verification.js` - # Unknown script type for sd028-phase2-verification.js
- `sd028-retrospective.js` - # Unknown script type for sd028-retrospective.js
- `sd039-lead-final-approval.js` - # Unknown script type for sd039-lead-final-approval.js
- `sd039-plan-supervisor-verification.js` - # Unknown script type for sd039-plan-supervisor-verification.js
- `sd046-exec-completion.js` - # Unknown script type for sd046-exec-completion.js
- `sd046-lead-final-approval.js` - # Unknown script type for sd046-lead-final-approval.js
- `sd046-lead-requirements-analysis.js` - # Unknown script type for sd046-lead-requirements-analysis.js
- `sd046-plan-supervisor-verification.js` - # Unknown script type for sd046-plan-supervisor-verification.js
- `update-prd-sd028.js` - # Unknown script type for update-prd-sd028.js


## Next Steps
1. Test template commands before removing originals
2. Update any automation that calls these scripts
3. Archive original scripts after validation
4. Update team documentation with new commands
