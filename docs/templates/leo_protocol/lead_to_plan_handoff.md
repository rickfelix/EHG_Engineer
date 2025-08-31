# LEAD → PLAN Handoff Template

**To:** PLAN Agent  
**From:** LEAD Agent  
**Protocol:** LEO Protocol v3.1.5 (Multi-Application Framework)  
**Application Context:** [APP-ID] - [Application Name]  
**Application Repository:** [github.com/owner/repo]  
**Application Database:** [supabase-project-id]  
**Strategic Directive:** [APP-ID]-SD-YYYY-MM-DD-[A]: [Title]  
**Strategic Directive Path:** `applications/[APP-ID]/directives/[SD-ID].md`  
**Related PRD:** [APP-ID]-PRD-SD-YYYY-MM-DD-[A]-[descriptor]  
**Related PRD Path:** `applications/[APP-ID]/prds/[PRD-ID].md`

## Application Context Required

- **Application ID**: [APP-ID]
- **Repository**: [github.com/owner/repo]
- **Database**: [project-id]
- **Current Branch**: [branch-name]
- **Environment**: Development | Staging | Production

## Pre-handoff Checklist

- [ ] Application context verified
- [ ] Repository accessible via GitHub CLI
- [ ] Database credentials valid
- [ ] Branch created/checked out
- [ ] Strategic Directive created and saved
- [ ] PRD requirements documented
- [ ] Success criteria defined
- [ ] Dependencies identified

## Reference Files Required

- `applications/[APP-ID]/directives/[SD-ID].md` (Strategic Directive)
- `applications/[APP-ID]/prds/[PRD-ID].md` (Product Requirements)
- `applications/[APP-ID]/config.json` (Application Configuration)
- `docs/templates/leo_protocol/` (Protocol Templates)
- `AI_GUIDE.md` (Platform Guidelines)

## Handoff Content

### Strategic Intent
[High-level strategic goal from LEAD]

### Key Objectives
1. [Objective 1]
2. [Objective 2]
3. [Objective 3]

### Constraints & Considerations
- **Technical**: [Application-specific technical constraints]
- **Timeline**: [Delivery expectations]
- **Resources**: [Available resources]
- **Dependencies**: [External dependencies]

### Expected Deliverables from PLAN
1. Epic Execution Sequences (EES) breakdown
2. Task prioritization and sequencing
3. Resource allocation recommendations
4. Risk assessment and mitigation strategies
5. Timeline with milestones

## Application-Specific Context

### Architecture Notes
[Application-specific architecture considerations]

### Technology Stack
- Frontend: [framework]
- Backend: [framework]
- Database: Supabase PostgreSQL
- Deployment: [platform]

### Existing Patterns
[Reference to existing patterns in the application]

### Integration Points
[APIs, services, or systems to integrate with]

## Validation Criteria

PLAN Agent must confirm:
- [ ] Understanding of application context
- [ ] Access to application repository
- [ ] Understanding of strategic objectives
- [ ] Ability to create app-specific EES items
- [ ] Awareness of technical constraints

## Next Steps for PLAN

1. Review Strategic Directive in detail
2. Analyze application codebase structure
3. Create Epic Execution Sequences
4. Define task dependencies
5. Prepare PLAN→EXEC handoff

---

**Handoff Timestamp**: [YYYY-MM-DD HH:MM:SS UTC]  
**LEAD Agent Signature**: [Agent ID]  
**Status**: PENDING PLAN ACKNOWLEDGMENT