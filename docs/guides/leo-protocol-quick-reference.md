---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# LEO Protocol v4.3.3 - Quick Reference Guide



## Table of Contents

- [Metadata](#metadata)
- [🚀 Quick Start Commands](#-quick-start-commands)
- [📋 Agent Cheat Sheet](#-agent-cheat-sheet)
  - [LEAD Agent](#lead-agent)
  - [PLAN Agent](#plan-agent)
  - [EXEC Agent](#exec-agent)
- [✅ Handoff Checklists](#-handoff-checklists)
  - [LEAD → PLAN](#lead-plan)
  - [PLAN → EXEC](#plan-exec)
  - [EXEC → COMPLETE](#exec-complete)
- [🚨 Boundary Rules](#-boundary-rules)
  - [Before ANY Implementation](#before-any-implementation)
  - [Exception Process](#exception-process)
- [📊 Context Management](#-context-management)
  - [Thresholds](#thresholds)
  - [Quick Actions](#quick-actions)
- [🤖 Sub-Agent Triggers](#-sub-agent-triggers)
- [📁 File Structure](#-file-structure)
- [🔧 Troubleshooting](#-troubleshooting)
  - [Context Overflow](#context-overflow)
  - [Handoff Blocked](#handoff-blocked)
  - [Boundary Violation](#boundary-violation)
- [📈 Success Metrics](#-success-metrics)
- [🎯 Golden Rules](#-golden-rules)
- [🚦 Decision Tree](#-decision-tree)
- [💡 Pro Tips](#-pro-tips)

## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, testing, e2e, schema

> **Note**: This guide updated for LEO Protocol v4.3.3. See CLAUDE.md for full protocol details.

## 🚀 Quick Start Commands

```bash
# Start new SD
node scripts/leo.js new-sd "Add feature X"

# Check context usage
node scripts/context-monitor.js check

# Perform handoff
node scripts/handoff.js handoff LEAD-to-PLAN

# Archive work
node scripts/handoff.js archive EXEC completed-feature
```

---

## 📋 Agent Cheat Sheet

### LEAD Agent
**Purpose**: Business strategy
**Creates**: Strategic Directive (SD)
**Cannot**: Make technical decisions

### PLAN Agent  
**Purpose**: Technical planning
**Creates**: Product Requirements (PRD)
**Cannot**: Change business objectives

### EXEC Agent
**Purpose**: Implementation
**Creates**: Working code
**Cannot**: Add unrequested features

---

## ✅ Handoff Checklists

### LEAD → PLAN
```
□ SD created in database (strategic_directives_v2 table)
□ Business objectives clear
□ Success metrics measurable
□ Constraints documented
□ Risks identified
□ Feasibility confirmed
□ Environment healthy
□ Context < 30%
□ Summary (500 tokens)
```

### PLAN → EXEC
```
□ PRD created in /docs/prds/
□ SD requirements mapped
□ Tech specs complete
□ Prerequisites verified
□ Test requirements defined
□ Acceptance criteria clear
□ Risks mitigated
□ Context < 40%
□ Summary (500 tokens)
```

### EXEC → COMPLETE
```
□ PRD requirements met
□ Tests passing
□ Lint passing (npm run lint)
□ Types passing (npx tsc)
□ Build successful
□ CI/CD green
□ Docs updated
□ Context < 60%
□ Summary (500 tokens)
```

---

## 🚨 Boundary Rules

### Before ANY Implementation
Ask yourself:
1. **Is this in the PRD?** → If NO, STOP
2. **Is this in scope?** → If NO, STOP  
3. **Does this add value?** → If NO, STOP

### Exception Process
```
1. Document blocker
2. Request human exception
3. Provide justification
4. Wait for approval
5. Proceed ONLY with approval
```

---

## 📊 Context Management

### Thresholds
- **< 70%**: ✅ Healthy
- **70-90%**: ⚠️ Run `/compact`
- **> 90%**: 🚨 Critical - Archive immediately

### Quick Actions
```bash
# Check usage
/context

# Compress conversation
/compact focus: "current task"

# Emergency reset (last resort)
/clear
```

---

## 🤖 Sub-Agent Triggers

| Keyword | Activates | For |
|---------|-----------|-----|
| security | Security | Auth, encryption |
| performance | Performance | Speed, optimization |
| design/UI | Design | Components, UX |
| database | Database | Schema, queries |
| test | Testing | Coverage, E2E |

---

## 📁 File Structure

```
Project/
├── docs/
│   ├── strategic-directives/
│   │   └── SD-XXX-*.md
│   └── prds/
│       └── PRD-SD-XXX-*.md
├── archives/
│   ├── lead/
│   ├── plan/
│   └── exec/
├── CLAUDE.md
└── .leo-state.json
```

---

## 🔧 Troubleshooting

### Context Overflow
```bash
1. node scripts/context-monitor.js check
2. /compact focus: "critical items"
3. Archive to archives/[agent]/
```

### Handoff Blocked
```bash
1. Complete missing items
2. OR request exception:
   node scripts/handoff.js handoff [type]
   > Provide justification
```

### Boundary Violation
```
1. Check PRD requirements
2. Remove out-of-scope additions
3. Get approval for valuable additions
```

---

## 📈 Success Metrics

| Metric | Good | Bad |
|--------|------|-----|
| Context Overflow | < 5% | > 20% |
| Handoff Time | < 5 min | > 15 min |
| Scope Creep | < 10% | > 50% |
| First Success | > 90% | < 70% |

---

## 🎯 Golden Rules

1. **Always complete checklists**
2. **Monitor context proactively**
3. **Stay within boundaries**
4. **Archive completed work**
5. **Generate summaries**
6. **Request help when blocked**

---

## 🚦 Decision Tree

```
New Task?
├─ Is it in PRD/SD?
│  ├─ YES → Implement
│  └─ NO → Request clarification
│
├─ Context > 70%?
│  ├─ YES → Run /compact
│  └─ NO → Continue
│
└─ Checklist complete?
   ├─ YES → Handoff
   └─ NO → Complete or request exception
```

---

## 💡 Pro Tips

1. **Start each session**: Check context usage
2. **Before handoff**: Archive verbose content
3. **During implementation**: Check boundaries frequently
4. **When blocked**: Document and request exception
5. **After completion**: Update documentation

---

*Keep this guide handy during LEO Protocol execution*
*v4.3.3 - Updated 2025-12-29*