# ⚠️ LEAD MANDATORY APPROVAL CHECKLIST

**CRITICAL**: This checklist is MANDATORY for all SD approvals.
**Failure to follow = Protocol violation**

---

## 🎯 Before Approving ANY Strategic Directive

### Step 1: Run Automation (MANDATORY)
```bash
node scripts/complete-sd.js <SD_UUID>
```

**What this does**:
- ✅ Runs Continuous Improvement Coach (generates retrospective)
- ✅ Runs DevOps Platform Architect (verifies CI/CD)
- ✅ Validates all completion requirements
- ✅ Shows PASS/FAIL verdict

**Example**:
```bash
node scripts/complete-sd.js ccf6484d-9182-4879-a36a-33c7bbb1796c
```

### Step 2: Verify Success (MANDATORY)
Check output for:
```
✅ SD READY FOR COMPLETION

📋 Summary:
   ✅ All required sub-agents executed
   ✅ Retrospective generated
   ✅ DevOps verification complete
   ✅ All validation checks passed
```

**If you see warnings**: Review and address them before proceeding.

**If you see errors**: Do NOT approve. Fix issues first.

### Step 3: Human Approval (MANDATORY)
- [ ] Automation ran successfully
- [ ] Output shows "✅ SD READY FOR COMPLETION"
- [ ] All warnings reviewed and acceptable
- [ ] Request human approval for status change
- [ ] Human explicitly approves

### Step 4: Mark Complete
- [ ] Update SD status to "completed" in dashboard
- [ ] Progress should be 100%

---

## ❌ What NOT to Do

**NEVER**:
- ❌ Approve SD without running `complete-sd.js`
- ❌ Skip retrospective generation
- ❌ Ignore automation warnings
- ❌ Change SD status without human approval
- ❌ Assume "it's probably fine"

---

## 🚨 Consequences of Skipping

**If you skip the automation**:
1. ❌ No retrospective → No learnings captured
2. ❌ No DevOps check → Unknown CI/CD status
3. ❌ No validation → Incomplete requirements
4. ❌ Protocol violation → Quality degrades
5. ❌ Future SDs suffer → No historical context

**This is a CRITICAL protocol violation.**

---

## 📋 Quick Command Reference

```bash
# Complete SD (all-in-one)
node scripts/complete-sd.js <SD_UUID>

# Or run individually:
node scripts/generate-retrospective.js <SD_UUID>
node scripts/devops-verification.js <SD_UUID>
node scripts/lead-approval-checklist.js <SD_UUID>
```

---

## ✅ Success Example

```
🎯 COMPLETE STRATEGIC DIRECTIVE
════════════════════════════════════════════════════════════
SD: SD-UAT-021 - Navigation and UX Improvements
Current Status: completed
Progress: 100%

STEP 1: Running Required Sub-Agents
════════════════════════════════════════════════════════════
🤖 Running: CONTINUOUS_IMPROVEMENT_COACH
   ✅ Success

🤖 Running: DEVOPS_PLATFORM_ARCHITECT
   ✅ Success

📊 SUMMARY
   Required: 2
   Succeeded: 2
   Failed: 0

STEP 2: Validating Completion Requirements
════════════════════════════════════════════════════════════
✅ SD exists and accessible
✅ Retrospective generated (Quality: 94/100)
✅ PRD exists
✅ Handoffs recorded

✅ READY FOR LEAD APPROVAL

════════════════════════════════════════════════════════════
✅ SD READY FOR COMPLETION
════════════════════════════════════════════════════════════

SD-UAT-021 is ready for final approval! 🎉
```

---

## 📖 Full Documentation

- `docs/AUTOMATION_COMPLETE.md` - Complete usage guide
- `docs/preventing-missed-subagents.md` - Prevention strategies
- `CLAUDE.md` (lines 286-366) - Protocol integration

---

**Version**: 1.0
**Created**: 2025-10-01
**Status**: MANDATORY for all SD approvals
**Enforcement**: Part of LEAD role responsibilities
