# EXEC Agent Workflow with Vision QA Integration
## LEO Protocol v3.1.5.9

### Step 1: Receive Task with Vision QA Requirements

When receiving task from PLAN, check for Vision QA:

```markdown
**Vision QA Checklist:**
- [ ] Vision QA Status identified
- [ ] Test goals clearly defined
- [ ] Configuration provided
- [ ] Success criteria understood
- [ ] Budget limit noted
```

### Step 2: Pre-Implementation Setup

Before starting UI implementation:

```bash
# 1. Register application if needed
node scripts/register-app.js

# 2. Verify Vision QA is ready
node lib/testing/vision-qa-agent.js --check

# 3. Review test goals to understand requirements
cat task-handoff.md | grep "Vision QA Test Goals" -A 10
```

### Step 3: Implementation with Vision QA in Mind

During implementation, ensure Vision QA compatibility:

```markdown
**UI Development Checklist:**
- [ ] Add data-testid attributes to key elements
- [ ] Use semantic HTML for better recognition
- [ ] Include ARIA labels for accessibility
- [ ] Ensure consistent element naming
- [ ] Avoid ambiguous UI patterns
- [ ] Test loading states are detectable
- [ ] Error messages are clear and visible
```

### Step 4: Post-Implementation Vision QA Execution

After completing UI implementation:

```bash
# 1. Basic execution
node lib/testing/vision-qa-agent.js \
  --app-id "APP-001" \
  --goal "Complete user registration flow" \
  --max-iterations 30 \
  --cost-limit 2.00

# 2. With specific configuration
cat > vision-qa-config.json << EOF
{
  "appId": "APP-001",
  "testGoals": [
    "User can register successfully",
    "Form validation works correctly",
    "Mobile responsive design verified"
  ],
  "maxIterations": 30,
  "costLimit": 2.00
}
EOF

node lib/testing/vision-qa-agent.js --config vision-qa-config.json

# 3. Run consensus testing for critical features
node lib/testing/vision-qa-agent.js \
  --app-id "APP-001" \
  --goal "Test payment flow" \
  --consensus-runs 3 \
  --cost-limit 5.00
```

### Step 5: Handling Vision QA Results

After Vision QA execution:

```markdown
**Result Analysis:**
1. Check pass rate (must be ≥ 80%)
2. Review detected bugs by severity
3. Verify accessibility score
4. Check cost vs. budget
5. Review screenshots for visual issues
```

**If Tests Pass:**
```bash
# Generate report
node lib/testing/vision-qa-reporter.js \
  --session-id "[SESSION-ID]" \
  --format markdown > vision-qa-report.md

# Move to evidence package
mkdir -p docs/verification-packages/[SD-ID]/vision-qa/
mv vision-qa-report.md docs/verification-packages/[SD-ID]/vision-qa/
cp -r screenshots/ docs/verification-packages/[SD-ID]/vision-qa/
```

**If Tests Fail:**
```bash
# 1. Analyze failures
node lib/testing/vision-qa-analyzer.js --session-id "[SESSION-ID]"

# 2. Fix identified issues
# - Update UI components
# - Fix accessibility issues
# - Resolve layout problems

# 3. Re-run Vision QA
node lib/testing/vision-qa-agent.js --retest --session-id "[SESSION-ID]"
```

### Step 6: Bug Remediation Workflow

For detected bugs:

```markdown
**Bug Priority Matrix:**
┌──────────────┬─────────────────────────┐
│ Severity     │ Action Required         │
├──────────────┼─────────────────────────┤
│ Critical     │ Fix immediately         │
│ High         │ Fix before handoff      │
│ Medium       │ Fix or document         │
│ Low          │ Document in backlog     │
└──────────────┴─────────────────────────┘
```

**Fixing Process:**
```bash
# 1. Get bug details
psql -c "SELECT * FROM vision_qa_bugs WHERE session_id = '[SESSION-ID]';"

# 2. Fix the issue in code

# 3. Run targeted retest
node lib/testing/vision-qa-agent.js \
  --app-id "APP-001" \
  --goal "Verify [specific bug] is fixed" \
  --max-iterations 10
```

### Step 7: Completion Report with Vision QA

Include in EXEC completion report:

```markdown
**To:** PLAN Agent
**From:** EXEC Agent
**Protocol:** LEO Protocol v3.1.5.9 (Vision QA Integration)
**Task Complete:** [EES-ID]: [Task Description]

**Section D: Vision QA Validation**
- **Test Session ID**: TEST-[APP-ID]-[TIMESTAMP]
- **Test Goals**: [X/Y] achieved
- **Pass Rate**: XX%
- **Bugs Detected**: 
  - Critical: 0
  - High: X (all fixed)
  - Medium: Y (Z fixed, W documented)
  - Low: V (documented)
- **Accessibility Score**: XX%
- **Total Cost**: $X.XX (within budget of $Y.YY)
- **Model Used**: [auto-selected: gpt-5-mini]
- **Consensus**: [if applicable]

**Evidence Location**:
- Report: `docs/verification-packages/[SD-ID]/vision-qa/report.md`
- Screenshots: `docs/verification-packages/[SD-ID]/vision-qa/screenshots/`
- Bug Details: `docs/verification-packages/[SD-ID]/vision-qa/bugs.json`
- Database Record: Session ID [SESSION-ID]

**Vision QA Summary**:
[Brief narrative of what was tested and results]
```

### Common Commands Reference

```bash
# Check if app is registered
node scripts/list-registered-apps.js

# Register new app
node scripts/register-app.js

# Run basic Vision QA test
node lib/testing/vision-qa-agent.js --app-id "APP-001" --goal "Test goal"

# Run with consensus
node lib/testing/vision-qa-agent.js --app-id "APP-001" --goal "Test goal" --consensus-runs 3

# Generate report
node lib/testing/vision-qa-reporter.js --session-id "TEST-XXX" --format markdown

# Check test history
psql -c "SELECT * FROM vision_qa_session_summaries WHERE application_id = 'APP-001';"

# Analyze specific bugs
psql -c "SELECT * FROM vision_qa_bugs WHERE severity IN ('critical', 'high');"
```

### Troubleshooting Guide

**Problem: Vision QA won't start**
```bash
# Check environment variables
echo $OPENAI_API_KEY
echo $NEXT_PUBLIC_SUPABASE_URL

# Verify app registration
node scripts/list-registered-apps.js

# Check Playwright installation
npx playwright install
```

**Problem: Tests failing consistently**
```bash
# Run in debug mode
DEBUG=vision-qa:* node lib/testing/vision-qa-agent.js --app-id "APP-001" --goal "Test"

# Try with different model
node lib/testing/vision-qa-agent.js --model gpt-5 --app-id "APP-001" --goal "Test"

# Reduce complexity
node lib/testing/vision-qa-agent.js --max-iterations 10 --simple-goal
```

**Problem: Costs too high**
```bash
# Use cheaper model
node lib/testing/vision-qa-agent.js --model gpt-5-nano --app-id "APP-001"

# Reduce iterations
node lib/testing/vision-qa-agent.js --max-iterations 15

# Skip consensus
node lib/testing/vision-qa-agent.js --consensus-runs 1
```

### Best Practices

1. **Always run Vision QA before handoff** for UI tasks
2. **Fix critical/high bugs** before marking complete
3. **Document medium/low bugs** if not fixed
4. **Include screenshots** in evidence package
5. **Monitor cost efficiency** and optimize configs
6. **Use consensus testing** only for critical paths
7. **Add data-testid** attributes during development
8. **Test multiple viewports** for responsive design
9. **Verify accessibility** for public-facing UI
10. **Save test sessions** for audit trail