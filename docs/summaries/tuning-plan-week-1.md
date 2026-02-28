---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# One-Week Tuning Plan for Agentic Review System



## Table of Contents

- [Metadata](#metadata)
- [Goal](#goal)
- [Timeline: Week 1 Post-Deployment](#timeline-week-1-post-deployment)
  - [Day 1-2: Baseline Establishment](#day-1-2-baseline-establishment)
  - [Day 3-4: Initial Tuning](#day-3-4-initial-tuning)
  - [Day 5-6: Sub-Agent Calibration](#day-5-6-sub-agent-calibration)
  - [Day 7: Report & Finalize](#day-7-report-finalize)
- [Success Metrics](#success-metrics)
  - [Primary Goals](#primary-goals)
  - [Tracking Dashboard](#tracking-dashboard)
- [Daily Checklist](#daily-checklist)
  - [Morning (9 AM)](#morning-9-am)
  - [Midday (12 PM)](#midday-12-pm)
  - [End of Day (5 PM)](#end-of-day-5-pm)
- [Tuning Decisions Tree](#tuning-decisions-tree)
- [Configuration Adjustments](#configuration-adjustments)
  - [Quick Fixes (Immediate)](#quick-fixes-immediate)
  - [Medium Adjustments (Day 3-4)](#medium-adjustments-day-3-4)
  - [Major Changes (Day 5-6)](#major-changes-day-5-6)
- [Rollback Plan](#rollback-plan)
- [Team Communication Template](#team-communication-template)
  - [Daily Update (Slack/Email)](#daily-update-slackemail)
  - [End of Week Report](#end-of-week-report)
- [Executive Summary](#executive-summary)
- [Configuration Changes](#configuration-changes)
- [Recommendations](#recommendations)
- [Tools & Scripts](#tools-scripts)
  - [Metrics Collection](#metrics-collection)
  - [False Positive Analysis](#false-positive-analysis)
  - [Quick Config Update](#quick-config-update)
- [Success Criteria Checklist](#success-criteria-checklist)
- [Escalation Path](#escalation-path)

## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, migration

## Goal
Achieve <15% false positive rate while maintaining comprehensive security and quality coverage.

## Timeline: Week 1 Post-Deployment

### Day 1-2: Baseline Establishment
**Actions:**
- [ ] Deploy workflows with conservative settings
- [ ] Monitor first 10-20 PRs
- [ ] Document every comment/finding in tracking spreadsheet
- [ ] Note developer reactions (👍 helpful, 👎 noise, 😕 unclear)

**Metrics to Track:**
```csv
PR#, Total Comments, Helpful, False Positive, Unclear, Agent Triggered, Time to Review
```

### Day 3-4: Initial Tuning
**Severity Adjustments:**
```yaml
# In .github/claude-review-config.yml
severity:
  thresholds:
    critical: block  # Keep blocking
    high: warn      # Consider changing to 'info' if >30% false positives
    medium: info    # Consider 'ignore' if >50% false positives
    low: ignore     # Already ignored
```

**Common False Positives to Allow-list:**
- Development-only console.log statements
- TODO comments with assignee and date
- Test fixtures with example credentials
- Documentation files with code examples

### Day 5-6: Sub-Agent Calibration
**Per Sub-Agent Tuning:**

#### Security Sub-Agent
- Track CWE categories with highest false positive rates
- Add patterns to exclusion list:
  ```yaml
  security:
    exclusions:
      - "*.test.js"       # Test files
      - "*.mock.js"       # Mock data
      - "docs/**"         # Documentation
      - "examples/**"     # Example code
  ```

#### Testing Sub-Agent
- Adjust coverage threshold if too aggressive:
  ```yaml
  coverage:
    minimum: 70  # Start lower, increase gradually
    new_code_only: true
  ```

#### Database Sub-Agent
- Exempt migration rollback files
- Allow schema documentation changes

### Day 7: Report & Finalize

## Success Metrics

### Primary Goals
- **False Positive Rate**: <15% by end of week
- **Review Latency**: <2 minutes per PR
- **Developer Satisfaction**: >80% find reviews helpful

### Tracking Dashboard
```markdown
| Metric | Day 1 | Day 3 | Day 5 | Day 7 | Target |
|--------|-------|-------|-------|-------|--------|
| False Positive Rate | - | - | - | - | <15% |
| Avg Review Time | - | - | - | - | <2min |
| PRs with SD/PRD | - | - | - | - | 100% |
| Helpful Comments | - | - | - | - | >80% |
```

## Daily Checklist

### Morning (9 AM)
- [ ] Check overnight PR reviews
- [ ] Log metrics in spreadsheet
- [ ] Note any workflow failures

### Midday (12 PM)
- [ ] Review morning PRs
- [ ] Adjust thresholds if needed
- [ ] Update allow-lists

### End of Day (5 PM)
- [ ] Compile daily metrics
- [ ] Update tracking dashboard
- [ ] Communicate changes to team

## Tuning Decisions Tree

```
High False Positives (>30%)?
├─> Yes: Lower severity thresholds
│   └─> Still high? Add to allow-list
└─> No: Check specific sub-agents
    ├─> Security: Add file exclusions
    ├─> Testing: Lower coverage threshold
    └─> Database: Exempt migrations

Missing Real Issues?
├─> Yes: Increase severity thresholds
└─> No: Current settings OK

Developer Complaints?
├─> "Too many comments": Reduce max_comments
├─> "Irrelevant findings": Update exclusions
└─> "Missed obvious issue": Check agent activation
```

## Configuration Adjustments

### Quick Fixes (Immediate)
```yaml
# Reduce comment spam
max_comments: 10  # Down from 20

# Ignore common patterns
security:
  allowlist:
    - "console.log"
    - "TODO:"
    - "FIXME:"
```

### Medium Adjustments (Day 3-4)
```yaml
# Tune sub-agent activation
sub_agents:
  triggers:
    security:
      - "password"  # Remove if too broad
      - "private key"  # More specific
```

### Major Changes (Day 5-6)
```yaml
# Change review mode if needed
review_mode: comment  # Keep comment-only

# Disable problematic agents
sub_agents:
  disabled:
    - "dependency"  # If causing issues
```

## Rollback Plan

If false positive rate exceeds 40% or blocks critical work:

1. **Immediate**: Set all workflows to `continue-on-error: true`
2. **Day 1**: Disable inline comments, summary only
3. **Day 2**: Run in shadow mode (logs only, no comments)
4. **Day 3**: Full disable if not improvable

## Team Communication Template

### Daily Update (Slack/Email)
```
📊 Agentic Review Tuning - Day X Update

✅ Processed: X PRs
📝 Total findings: X
🎯 Helpful: X%
⚠️ False positives: X%

Changes made today:
- [List adjustments]

Tomorrow's focus:
- [Planned changes]

Feedback welcome in #eng-reviews
```

### End of Week Report
```markdown
# Week 1 Tuning Results

## Executive Summary
- Achieved X% false positive rate (target: <15%)
- Average review time: X minutes (target: <2min)
- Developer satisfaction: X% (target: >80%)

## Configuration Changes
[List all changes made]

## Recommendations
[Next steps for Week 2]
```

## Tools & Scripts

### Metrics Collection
```bash
# Run daily at 6 PM
node scripts/pr-review-metrics.js > metrics/day-$(date +%Y%m%d).json
```

### False Positive Analysis
```bash
# Identify patterns in false positives
grep "false-positive" metrics/*.json | \
  jq '.finding_type' | \
  sort | uniq -c | sort -rn
```

### Quick Config Update
```bash
# Update and commit config changes
vi .github/claude-review-config.yml
git add .github/claude-review-config.yml
git commit -m "tune: Adjust thresholds based on Day X metrics"
git push
```

## Success Criteria Checklist

By end of Week 1:
- [ ] False positive rate <15%
- [ ] All PRs have SD/PRD linkage
- [ ] Average review completes in <2 minutes
- [ ] No workflow failures in last 48 hours
- [ ] Team feedback incorporated
- [ ] Config stabilized (no changes needed for 24 hours)
- [ ] Documentation updated with learnings
- [ ] Week 2 plan created

## Escalation Path

Issues requiring immediate attention:
1. **Workflow blocking merges**: Disable immediately, fix offline
2. **API rate limits hit**: Reduce PR trigger frequency
3. **Claude API errors**: Check API key, fallback to basic checks
4. **>50% false positives**: Switch to shadow mode
5. **Security breach detected**: Escalate to security team immediately

---

*This plan will be reviewed and updated based on actual deployment results.*