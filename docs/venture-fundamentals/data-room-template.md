# EHG M&A Data Room Template

**Version**: 1.0.0
**SD**: SD-LEO-INFRA-EHG-VENTURE-FUNDAMENTALS-001

## Overview

This template defines the standard structure for an acquirer-ready data room. Most sections auto-populate from EHG platform data. Venture-specific sections require manual input. Target: completable in under 1 week.

## Data Room Structure

### 1. Executive Summary (Auto-populated)
- [ ] Venture name, description, founding date
- [ ] Current stage (MVA/MVP/Growth/Mature)
- [ ] Key metrics snapshot (MRR, users, growth rate)
- [ ] Tech stack summary (from `venture_fundamentals.tech_stack_version`)

**Source**: `ventures` table + `venture_fundamentals` table

### 2. Technical Architecture (Auto-populated)
- [ ] System architecture diagram
- [ ] Tech stack reference (from @ehg/design-tokens, @ehg/tailwind-preset)
- [ ] Database schema export (`supabase db dump --schema-only`)
- [ ] API endpoint inventory
- [ ] Third-party integrations list
- [ ] Infrastructure topology (Supabase project, hosting, CDN)

**Source**: `tech-stack-reference.md` + Supabase schema dump

### 3. Code Quality & Testing (Auto-populated)
- [ ] Test coverage report (`coverage/coverage-summary.json`)
- [ ] Lint compliance score (from `venture_compliance`)
- [ ] Conformance check results (from `venture_compliance`)
- [ ] SLO compliance history (from `venture_fundamentals.slo_targets`)
- [ ] Security audit results (last 90 days)

**Source**: CI/CD artifacts + `venture_compliance` table

### 4. Data Isolation & Portability (Auto-populated)
- [ ] Current isolation tier (from `venture_fundamentals.isolation_tier`)
- [ ] Migration playbook reference (`exit-architecture.md`)
- [ ] Data export script and format
- [ ] Estimated extraction time
- [ ] RLS policy audit

**Source**: `venture_fundamentals` table + `exit-architecture.md`

### 5. Financial & Operational (Manual)
- [ ] Revenue history (monthly, last 12 months)
- [ ] Cost breakdown (infra, services, labor)
- [ ] Unit economics (CAC, LTV, margins)
- [ ] Customer contracts (if applicable)
- [ ] Vendor agreements

**Source**: Manual input required

### 6. Legal & Compliance (Partially auto-populated)
- [ ] Open-source license audit (all dependencies MIT-compatible)
- [ ] Privacy policy and data handling
- [ ] Terms of service
- [ ] GDPR/CCPA compliance status
- [ ] IP ownership documentation

**Source**: `package-lock.json` license scan + manual

### 7. Team & Operations (Manual)
- [ ] Team structure and roles
- [ ] Key person dependencies
- [ ] Operational runbooks
- [ ] On-call procedures
- [ ] Vendor contact list

**Source**: Manual input required

### 8. Growth & Pipeline (Manual)
- [ ] Feature roadmap (next 6 months)
- [ ] User growth projections
- [ ] Market analysis
- [ ] Competitive positioning

**Source**: Manual input required

## Hit By A Bus (HBAB) Documentation Package

Critical knowledge that must be documented for any venture to survive key person loss.

### Runbooks (Auto-generated from platform)
1. **Deployment Runbook**: How to deploy, rollback, and hotfix
2. **Database Runbook**: Backup, restore, migration procedures
3. **Monitoring Runbook**: What to watch, alert thresholds, escalation
4. **Incident Response**: Severity levels, communication templates, post-mortem process

### Architecture Decision Records (ADRs)
Template for each significant decision:

```markdown
# ADR-NNN: [Decision Title]

**Status**: Accepted | Superseded | Deprecated
**Date**: YYYY-MM-DD
**Context**: Why was this decision needed?
**Decision**: What was decided?
**Consequences**: What are the trade-offs?
**Alternatives Considered**: What else was evaluated?
```

### Video Walkthrough Checklist
Record these for each venture (target: 2 hours total):

- [ ] **System Overview** (15 min): Architecture, data flow, key components
- [ ] **Development Setup** (15 min): Clone, install, configure, run locally
- [ ] **Deployment Pipeline** (15 min): CI/CD, environments, secrets
- [ ] **Database Schema** (15 min): Key tables, relationships, RLS policies
- [ ] **Business Logic** (15 min): Core algorithms, decision points, edge cases
- [ ] **Monitoring & Ops** (15 min): Dashboards, alerts, incident response
- [ ] **Known Issues** (10 min): Tech debt, workarounds, planned improvements
- [ ] **External Dependencies** (10 min): APIs, services, contracts

## Auto-Population Script

```bash
# Generate data room from platform data
node scripts/generate-data-room.js --venture-id <UUID> --output ./data-room/

# What it produces:
# data-room/
# ├── 01-executive-summary.md    (auto from DB)
# ├── 02-technical-architecture.md (auto from schema)
# ├── 03-code-quality.md         (auto from CI)
# ├── 04-data-isolation.md       (auto from venture_fundamentals)
# ├── 05-financial-ops.md        (template, manual fill)
# ├── 06-legal-compliance.md     (partial auto)
# ├── 07-team-operations.md      (template, manual fill)
# ├── 08-growth-pipeline.md      (template, manual fill)
# ├── runbooks/                  (auto from platform)
# └── adrs/                      (template)
```

## Completeness Scoring

| Section | Weight | Auto-populated | Manual Required |
|---------|--------|---------------|-----------------|
| Executive Summary | 10% | 90% | 10% |
| Technical Architecture | 20% | 95% | 5% |
| Code Quality | 15% | 100% | 0% |
| Data Isolation | 10% | 100% | 0% |
| Financial & Ops | 20% | 0% | 100% |
| Legal & Compliance | 10% | 40% | 60% |
| Team & Operations | 10% | 0% | 100% |
| Growth & Pipeline | 5% | 0% | 100% |

**Overall auto-population rate**: ~55%
**Estimated manual effort**: 3-5 days (down from 2-4 weeks without template)
