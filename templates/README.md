# LEO Protocol Template System

## Overview

The template system replaces SD-specific script proliferation with reusable, parameterized templates. Instead of creating new scripts for each Strategic Directive, we now use universal templates.

## Architecture

### Template Files
- `templates/execute-phase.js` - Universal phase execution for any LEO protocol phase
- `templates/generate-prd.js` - Universal PRD generation for regular and consolidated SDs
- `templates/create-handoff.js` - Universal handoff creation for any phase transition

### Configuration Files
- `templates/config/phase-requirements.json` - Phase requirements and sub-agent mappings
- `templates/config/handoff-templates.json` - 7-element handoff structure templates

## Usage

### Phase Execution
```bash
# Execute any phase for any SD
node templates/execute-phase.js LEAD SD-008
node templates/execute-phase.js PLAN SD-009
node templates/execute-phase.js EXEC SD-010 --force
```

### PRD Generation
```bash
# Generate PRD for any SD
node templates/generate-prd.js SD-008
node templates/generate-prd.js SD-009 --force
```

### Handoff Creation
```bash
# Create handoff between any phases
node templates/create-handoff.js LEAD PLAN SD-008
node templates/create-handoff.js PLAN EXEC SD-009
node templates/create-handoff.js VERIFICATION APPROVAL SD-010
```

## Integration

### LEO Orchestrator Integration
The `leo-orchestrator-enforced.js` now uses these templates internally:

```javascript
// Template instances
this.phaseExecutor = new UniversalPhaseExecutor();
this.prdGenerator = new UniversalPRDGenerator();
this.handoffCreator = new UniversalHandoffCreator();

// Template-based execution
await this.phaseExecutor.executePhase(phase, sdId, options);
```

### Benefits
1. **No Script Proliferation** - One template handles all SDs
2. **Consistent Behavior** - Same logic for all implementations
3. **Maintainable** - Changes in one place affect all usage
4. **Configuration-Driven** - Templates adapt based on config files
5. **Database-First** - All data stored properly in Supabase

## Template Features

### Universal Phase Executor
- Handles all 5 LEO protocol phases (LEAD, PLAN, EXEC, VERIFICATION, APPROVAL)
- Automatic phase completion checking
- Consolidated SD support
- Configuration-driven requirements
- Automatic handoff creation to next phase

### Universal PRD Generator
- Works with regular and consolidated Strategic Directives
- Fetches backlog items from `sd_backlog_map` table
- Generates user stories from backlog evidence
- Uses LEO Protocol Orchestrator internally
- Saves to correct `product_requirements_v2` table

### Universal Handoff Creator
- Supports all phase transitions
- 7-element structure validation
- Template-based content generation
- Placeholder replacement (`{sd_title}`, `{user_story_count}`, etc.)
- Automatic phase updates in database

## Configuration

### Adding New Phase Requirements
Edit `templates/config/phase-requirements.json`:
```json
{
  "NEW_PHASE": {
    "requirements": ["requirement1", "requirement2"],
    "sub_agents": ["AGENT1", "AGENT2"],
    "outputs": ["output1", "output2"],
    "validation_threshold": 85
  }
}
```

### Adding New Handoff Templates
Edit `templates/config/handoff-templates.json`:
```json
{
  "PHASE1_TO_PHASE2": {
    "from_agent": "PHASE1",
    "to_agent": "PHASE2",
    "required_elements": [...],
    "template": {
      "executive_summary": "...",
      "action_items_for_receiver": [...]
    }
  }
}
```

## Migration Guide

### From SD-Specific Scripts
Old pattern:
```bash
node scripts/sd027-exec-completion.js
node scripts/sd039-plan-exec-handoff.js
node scripts/generate-prd-sd046.js
```

New pattern:
```bash
node templates/execute-phase.js EXEC SD-027
node templates/create-handoff.js PLAN EXEC SD-039
node templates/generate-prd.js SD-046
```

### Benefits of Migration
- **17+ scripts** reduced to **3 templates**
- **Copy-paste development** eliminated
- **Consistent behavior** across all SDs
- **Easier maintenance** and updates
- **Configuration-driven** customization

## Testing

All templates have been tested with SD-008 (consolidated SD with 10 backlog items):
- ✅ PRD generation from backlog items
- ✅ All phase executions (LEAD through APPROVAL)
- ✅ Handoff creation between all phases
- ✅ Database integration and updates
- ✅ LEO orchestrator integration

## Future Enhancements

1. **Sub-Agent Integration** - Templates could activate sub-agents automatically
2. **Validation Rules** - More sophisticated phase validation
3. **Custom Templates** - Team-specific template variants
4. **Workflow Automation** - Full pipeline automation capabilities

---

**Implementation Date**: September 27, 2025
**Status**: Production Ready
**Integration**: Complete with LEO Orchestrator v2.0