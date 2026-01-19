# Deployment and Operations

This directory contains deployment strategies, operational procedures, and infrastructure documentation for the EHG Engineer project.

## Metadata
- **Category**: deployment
- **Status**: active
- **Last Updated**: 2025-10-24

---

## Directory Contents

| File | Description |
|------|-------------|
| `deployment_ops.md` | Deployment and operations documentation |

---

## Deployment Overview

### Current Deployment Stack

**Hosting**: Vercel (Frontend) + Supabase (Backend/Database)

**Environments**:
- **Development**: Local development environment
- **Staging**: Preview deployments (Vercel preview branches)
- **Production**: Main deployment (main branch)

### CI/CD Pipeline

**GitHub Actions Workflows**:
- Automated testing on PR
- Preview deployments for branches
- Production deployment on merge to main

See `/docs/03_protocols_and_standards/leo_github_deployment_workflow_v4.1.2.md` for workflow details.

---

## Quick Reference

### Deployment Commands

**Manual Deployment** (if needed):
```bash
# Frontend deployment (handled by Vercel)
git push origin main

# Database migrations
npm run migrate:production
```

**Preview Deployment**:
```bash
# Create PR - Vercel auto-deploys preview
git push origin feature-branch
```

**Rollback**:
```bash
# Vercel dashboard - instant rollback
# Or redeploy previous commit
git revert HEAD
git push origin main
```

### Environment Variables

**Required Environment Variables**:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)
- `DATABASE_URL` - PostgreSQL connection string

See `.env.example` for complete list.

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing (unit + E2E)
- [ ] Database migrations tested locally
- [ ] Environment variables configured
- [ ] Security review completed
- [ ] Performance testing completed

### Deployment Process
- [ ] Create PR with changes
- [ ] Review preview deployment
- [ ] Run E2E tests on preview
- [ ] Get PR approval
- [ ] Merge to main
- [ ] Monitor production deployment
- [ ] Verify production functionality

### Post-Deployment
- [ ] Smoke tests passed
- [ ] Database migrations executed
- [ ] Error monitoring checked
- [ ] Performance metrics reviewed
- [ ] Rollback plan confirmed

---

## Related Documentation

### Deployment Workflows
- `/docs/03_protocols_and_standards/leo_github_deployment_workflow_v4.1.2.md` - GitHub Actions workflows
- `/docs/03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md` - Git commit guidelines

### Database Operations
- `/docs/database/` - Database documentation
- `/docs/reference/database-agent-patterns.md` - Database patterns and migration best practices

### Testing
- `/docs/05_testing/` - Testing and QA documentation
- `/docs/reference/qa-director-guide.md` - QA guidelines

### Architecture
- `/docs/01_architecture/` - System architecture
- `/docs/04_features/IMPORTANT_DATABASE_DISTINCTION.md` - EHG vs EHG_Engineer database distinction

---

## Monitoring & Operations

### Application Monitoring

**Tools**:
- Vercel Analytics - Performance monitoring
- Supabase Dashboard - Database monitoring
- Error tracking - (TBD: Sentry or similar)

### Database Operations

**Backup Strategy**:
- Supabase automatic daily backups
- Point-in-time recovery available
- Manual backup before major migrations

**Migration Strategy**:
```bash
# Test migration locally
npm run migrate:local

# Apply to production
npm run migrate:production

# Rollback if needed
npm run migrate:rollback
```

### Security Operations

**Security Practices**:
- RLS policies on all tables
- Service role key server-side only
- Environment variables never committed
- Regular security audits

See `/docs/reference/security-patterns.md` for security best practices.

---

## Troubleshooting

### Common Deployment Issues

**1. Migration Failures**
```bash
# Check migration status
npx supabase migration list

# Reset local database (development only!)
npx supabase db reset

# Invoke database agent for complex issues
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>
```

**2. Build Failures**
```bash
# Check build locally
npm run build

# Review build logs in Vercel dashboard
# Fix TypeScript errors, linting issues
```

**3. Environment Variable Issues**
```bash
# Verify environment variables
printenv | grep SUPABASE

# Update in Vercel dashboard > Settings > Environment Variables
```

**4. Agent Platform (Python) Dependency Issues**
```bash
# Missing Python packages (langchain_openai, anthropic, etc.)
cd C:\Users\rickf\Projects\_EHG\ehg\agent-platform
.\venv_win\Scripts\pip.exe install langchain_openai anthropic

# Outdated Supabase stack (proxy errors)
.\venv_win\Scripts\pip.exe install --upgrade supabase gotrue

# Full dependency reinstall
.\venv_win\Scripts\pip.exe install -r requirements.txt --upgrade

# Restart stack after installing dependencies
node scripts/cross-platform-run.js leo-stack restart
```

See `/docs/guides/leo-stack-management.md` for detailed Agent Platform troubleshooting.

---

## Emergency Procedures

### Production Incident Response

**Step 1**: Assess severity
- Critical: Immediate rollback
- High: Fix forward if quick
- Medium: Schedule fix

**Step 2**: Communication
- Notify stakeholders
- Update status page (if applicable)
- Document incident

**Step 3**: Resolution
- Rollback (Vercel dashboard)
- Or apply hotfix
- Verify fix in production

**Step 4**: Post-mortem
- Document root cause
- Update runbooks
- Implement preventive measures

### Rollback Procedure

**Vercel Rollback** (Frontend):
1. Go to Vercel dashboard
2. Select deployment to rollback to
3. Click "Promote to Production"
4. Verify rollback successful

**Database Rollback** (if needed):
```bash
# Rollback last migration
npm run migrate:rollback

# For major issues, restore from backup via Supabase dashboard
```

---

## Navigation

- **Parent**: [Documentation Home](/docs/README.md)
- **Previous**: [05 Testing](/docs/05_testing/README.md)

---

## Contributing

When adding deployment documentation:
1. Update `deployment_ops.md` with new procedures
2. Document any infrastructure changes
3. Update deployment checklist if needed
4. Test procedures in staging first
5. Update this README with new files

---

**Note**: For detailed deployment workflow, see `deployment_ops.md`. For CI/CD configuration, see GitHub Actions workflow documentation in protocols directory.
