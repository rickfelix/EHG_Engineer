# PLAN → EXEC Handoff Template

**To:** EXEC Agent  
**From:** PLAN Agent  
**Protocol:** LEO Protocol v3.1.5 (Multi-Application Framework)  
**Application Context:** [APP-ID] - [Application Name]  
**Application Repository:** [github.com/owner/repo]  
**Application Database:** [supabase-project-id]  
**Strategic Directive:** [APP-ID]-SD-YYYY-MM-DD-[A]: [Title]  
**Strategic Directive Path:** `applications/[APP-ID]/directives/[SD-ID].md`  
**Related PRD:** [APP-ID]-PRD-SD-YYYY-MM-DD-[A]-[descriptor]  
**Related PRD Path:** `applications/[APP-ID]/prds/[PRD-ID].md`  
**Epic Execution Sequence:** [APP-ID]-EES-YYYY-MM-DD-[A]-[NN]  
**EES Path:** `applications/[APP-ID]/ees/[EES-ID].md`

## Application Context Required

- **Application ID**: [APP-ID]
- **Repository**: [github.com/owner/repo]
- **Database**: [project-id]
- **Working Branch**: [feature/SD-branch-name]
- **Target Branch**: [main/develop]
- **Environment**: Development | Staging | Production
- **CI/CD Status**: [last run status]

## Pre-handoff Checklist

- [ ] Application repository cloned locally
- [ ] Feature branch created
- [ ] Database migrations prepared
- [ ] Test suite verified
- [ ] CI/CD pipeline status checked
- [ ] Dependencies installed
- [ ] Environment variables configured

## Reference Files Required

- `applications/[APP-ID]/codebase/` (Full repository)
- `applications/[APP-ID]/directives/[SD-ID].md` (Strategic Directive)
- `applications/[APP-ID]/prds/[PRD-ID].md` (Requirements)
- `applications/[APP-ID]/ees/[EES-ID].md` (Execution Sequence)
- `applications/[APP-ID]/config.json` (App Configuration)

## Task Breakdown

### Immediate Tasks (Priority 1)
1. **Task ID**: [APP-ID]-TASK-001
   - **Description**: [Task description]
   - **Files to modify**: [file paths]
   - **Acceptance criteria**: [specific criteria]
   - **Estimated effort**: [hours]

2. **Task ID**: [APP-ID]-TASK-002
   - **Description**: [Task description]
   - **Files to modify**: [file paths]
   - **Acceptance criteria**: [specific criteria]
   - **Estimated effort**: [hours]

### Follow-up Tasks (Priority 2)
[Additional tasks as needed]

## Technical Implementation Details

### Code Locations
```
applications/[APP-ID]/codebase/
├── src/              # Main source code
├── tests/            # Test files
├── docs/             # Documentation
└── ...
```

### Key Files to Modify
1. `[file-path]` - [modification description]
2. `[file-path]` - [modification description]

### Database Changes
```sql
-- Required migrations
[SQL statements if applicable]
```

### API Endpoints
- `[METHOD] /api/[endpoint]` - [description]

### Testing Requirements
- Unit tests: [test files]
- Integration tests: [test files]
- E2E tests: [test scenarios]

## Application-Specific Guidelines

### Coding Standards
- Style guide: [link or description]
- Linting rules: [configuration]
- Formatting: [prettier/eslint config]

### Git Workflow
1. Create feature branch: `git checkout -b feature/[APP-ID]-SD-YYYY-MM-DD-[A]`
2. Make changes and commit
3. Push to GitHub: `git push origin [branch]`
4. Create PR using: `gh pr create`
5. Monitor CI: `gh run watch`

### Deployment Process
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Success Criteria

EXEC must achieve:
- [ ] All code changes implemented
- [ ] Tests passing (unit, integration, E2E)
- [ ] CI/CD pipeline green
- [ ] Code review approved
- [ ] Documentation updated
- [ ] PR created and ready for merge

## Risk Mitigation

### Potential Issues
1. **Risk**: [Description]
   - **Mitigation**: [Strategy]

2. **Risk**: [Description]
   - **Mitigation**: [Strategy]

## Communication Protocol

- **Status Updates**: Every [frequency]
- **Blockers**: Immediate escalation to PLAN
- **PR Reviews**: Tag [reviewers]
- **Completion**: Update EES status in database

## Validation Commands

```bash
# Test suite
cd applications/[APP-ID]/codebase
npm test

# Lint check
npm run lint

# Type check
npm run typecheck

# CI status
gh run list --branch [branch-name]
```

## Next Steps for EXEC

1. Verify application context: `npm run show-context`
2. Pull latest changes: `npm run sync-github pull [APP-ID]`
3. Create feature branch
4. Implement tasks in priority order
5. Run tests after each task
6. Create PR when complete
7. Update task status in database

---

**Handoff Timestamp**: [YYYY-MM-DD HH:MM:SS UTC]  
**PLAN Agent Signature**: [Agent ID]  
**Status**: PENDING EXEC ACKNOWLEDGMENT