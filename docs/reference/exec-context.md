# EXEC_CONTEXT.md - Lean Implementation Guide for EXEC Agents

**BMAD Enhancement**: Reduced context guide focusing exclusively on EXEC implementation phase

**Purpose**: Provide EXEC agents with essential implementation guidance while minimizing context consumption (~500 lines vs 5000+ in full CLAUDE.md)

**When to Use**: During EXEC_IMPLEMENTATION phase only. For LEAD/PLAN operations, reference full CLAUDE.md.

---

## 📍 CRITICAL: Application Architecture

### Two Distinct Applications

**EHG** (Customer-Facing Business App) - **PRIMARY IMPLEMENTATION TARGET**
- **Path**: `/mnt/c/_EHG/EHG/`
- **Database**: liapbndqlqxdcgpwntbv (Supabase)
- **GitHub**: https://github.com/rickfelix/ehg.git
- **Port**: 5173 (dev), 4173 (preview)
- **Stack**: Vite + React + Shadcn + TypeScript
- **Role**: ALL customer features implemented here

**EHG_Engineer** (Management Dashboard) - **RARE IMPLEMENTATION TARGET**
- **Path**: `/mnt/c/_EHG/EHG_Engineer/`
- **Database**: dedlbzhpgkmetvhbkyzq (Supabase)
- **GitHub**: https://github.com/rickfelix/EHG_Engineer.git
- **Port**: 3000-3001
- **Role**: LEO Protocol dashboard/tooling ONLY

### ⚠️ Pre-Implementation Verification

**MANDATORY Before ANY Code**:
```bash
# 1. Verify correct application
cd /mnt/c/_EHG/EHG && pwd
# Expected: /mnt/c/_EHG/EHG (NOT EHG_Engineer!)

# 2. Verify correct repository
git remote -v
# Expected: origin  https://github.com/rickfelix/ehg.git

# 3. Wrong directory = STOP immediately
```

---

## ✅ EXEC Pre-Implementation Checklist

**MANDATORY Before Writing ANY Code**:

```markdown
## EXEC Pre-Implementation Checklist
- [ ] **Application**: [EHG or EHG_Engineer - VERIFIED via pwd]
- [ ] **GitHub Remote**: [verified via git remote -v]
- [ ] **URL**: [exact URL from PRD - accessible: YES/NO]
- [ ] **Component**: [path/to/component.tsx]
- [ ] **Screenshot**: [BEFORE state captured]
- [ ] **Build Status**: [npm run build:skip-checks - PASS/FAIL]
```

### Step-by-Step Verification

**1. URL Verification**
```bash
# Navigate to EXACT URL from PRD
# Confirm page loads and is accessible
# Take screenshot for evidence
```

**2. Component Identification**
```bash
# Identify exact file path of target component
# Confirm component exists at specified location
# Example: /mnt/c/_EHG/EHG/src/components/Dashboard/Settings.tsx
```

**3. Application Context**
```bash
# Verify dev server port available
lsof -i :5173 || echo "Port 5173 available"

# Check database connectivity
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.EHG_SUPABASE_URL, process.env.EHG_SUPABASE_ANON_KEY);
supabase.from('users').select('count').limit(1).then(r => console.log('DB:', r.error ? 'FAIL' : 'OK'));
"
```

**4. Build Validation**
```bash
# Verify project builds BEFORE making changes
cd /mnt/c/_EHG/EHG
npm run type-check
npm run build:skip-checks
```

---

## 🔄 MANDATORY: Server Restart Protocol

**After ANY Code Changes**:

```bash
# 1. Kill the dev server
pkill -f "vite" || pkill -f "node server.js"

# 2. Build client (if UI changes)
npm run build:client

# 3. Restart dev server
cd /mnt/c/_EHG/EHG
npm run dev -- --port 5173

# 4. Wait for ready message
# "VITE v5.x.x  ready in Xms"

# 5. Hard refresh browser
# Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)

# 6. Verify changes are live
# Test the new functionality
```

**Why This Matters**:
- No hot-reloading configured
- Dev servers cache components
- New files not picked up without restart
- Hard refresh clears browser cache

---

## 📝 Git Commit Guidelines

**Format**: `<type>(<SD-ID>): <subject>`

```bash
git commit -m "feat(SD-XXX): Brief description

Detailed explanation of changes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Types**: feat, fix, docs, refactor, test, chore, perf

**Rules**:
- **<100 lines ideal**, <200 max
- Commit after checklist items, before context switches
- Create commits at logical breakpoints
- Branch strategy: `eng/` prefix for EHG_Engineer, standard prefixes for EHG

---

## 🧪 Testing Requirements

### Dual Test Execution (MANDATORY)

**CRITICAL**: Run BOTH test types before EXEC→PLAN handoff

**1. Unit Tests** (Business Logic)
```bash
cd /mnt/c/_EHG/EHG
npm run test:unit
```
- Validates: Service layer, business logic, data transformations
- Framework: Vitest
- Failure means: Core functionality broken

**2. E2E Tests** (User Flows)
```bash
cd /mnt/c/_EHG/EHG
npm run test:e2e
```
- Validates: User flows, component rendering, integration
- Framework: Playwright
- Failure means: User-facing features don't work
- **100% User Story Coverage Required**: ≥1 E2E test per user story

### Test Execution Checklist

```markdown
- [ ] Unit tests executed: `npm run test:unit`
- [ ] Unit tests passed: [X/X tests]
- [ ] E2E tests executed: `npm run test:e2e`
- [ ] E2E tests passed: [X/X tests]
- [ ] Both test types documented in handoff
- [ ] Screenshots captured for E2E evidence
- [ ] User story coverage validated (100%)
```

**Common Mistake**: "Tests exist" ≠ "Tests passed"
- Always run tests explicitly
- Document pass/fail counts
- Include screenshots for visual evidence

---

## 📏 Component Sizing Guidelines

**Optimal Component Size**: 300-600 Lines

| Lines of Code | Action | Rationale |
|---------------|--------|-----------|
| **<200** | Consider combining | Too granular, hard to maintain |
| **300-600** | ✅ **OPTIMAL** | Sweet spot for testing & maintenance |
| **>800** | **MUST split** | Too complex, hard to test |

**Component Splitting Pattern**:
```
Dashboard.tsx (1200 lines) → TOO LARGE
├── DashboardLayout.tsx (400 lines) ✅
├── DashboardCharts.tsx (450 lines) ✅
└── DashboardSettings.tsx (350 lines) ✅
```

---

## 🗄️ Database Operations

### Connection Pattern

**Use Existing Helper**:
```javascript
import { createDatabaseClient } from '@/lib/supabase-connection';

const client = await createDatabaseClient('ehg', {
  verify: true,
  verbose: true
});
```

### Query Efficiency (CRITICAL for Context)

**❌ Inefficient** (wastes context):
```javascript
const { data } = await supabase.from('table').select('*');
console.log(data); // Dumps full JSON
```

**✅ Efficient** (saves 90% context):
```javascript
const { data } = await supabase
  .from('table')
  .select('id, title, status')
  .limit(5);
console.log(`Found ${data.length} items`);
```

### Database-First Architecture

**❌ NEVER Create**:
- Strategic Directive files (SD-*.md)
- PRD files (PRD-*.md)
- Retrospective files (RETRO-*.md)
- Handoff documents

**✅ ALWAYS Use**:
- Database tables only: `strategic_directives_v2`, `product_requirements_v2`, `retrospectives`, `sd_phase_handoffs`

---

## 🧠 Context Efficiency Rules

**Token Budget**: 200,000 tokens

### Status Thresholds

| Status | Range | Percentage | Action |
|--------|-------|------------|--------|
| 🟢 HEALTHY | 0-140K | 0-70% | Continue normally |
| 🟡 WARNING | 140K-180K | 70-90% | Consider `/context-compact` |
| 🔴 CRITICAL | 180K-190K | 90-95% | MUST compact before handoff |
| 🚨 EMERGENCY | >190K | >95% | BLOCKED - force handoff |

### Efficiency Patterns

**1. Select Specific Columns**
```javascript
// ❌ Bad
.select('*')

// ✅ Good
.select('id, title, status, priority')
```

**2. Limit Results**
```javascript
.limit(5)  // For summaries
.limit(50) // For dashboards
```

**3. Summarize, Don't Dump**
```javascript
// ❌ Bad: Full JSON dump
console.log(results);

// ✅ Good: Summary
console.log(`Found ${results.length} tests: ${passed} passed, ${failed} failed`);
```

**4. Read Tool with Offset/Limit**
```javascript
Read('large-file.js', { offset: 100, limit: 50 })
```

**Expected Impact**: 90-98% token reduction per query

---

## 📋 Quick Reference Commands

### Application Navigation
```bash
# Navigate to EHG app
cd /mnt/c/_EHG/EHG

# Navigate to EHG_Engineer
cd /mnt/c/_EHG/EHG_Engineer
```

### Development Server
```bash
# Start dev server (EHG)
cd /mnt/c/_EHG/EHG
npm run dev -- --port 5173

# Start dev server (EHG_Engineer)
cd /mnt/c/_EHG/EHG_Engineer
PORT=3000 node server.js
```

### Build & Validation
```bash
# Type check
npm run type-check

# Lint
npm run lint

# Build (skip checks for speed)
npm run build:skip-checks

# Full build
npm run build
```

### Testing
```bash
# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# Both (MANDATORY before handoff)
npm run test:unit && npm run test:e2e
```

### Git Operations
```bash
# Check status
git status

# Stage changes
git add .

# Commit with SD-ID
git commit -m "feat(SD-XXX): Description

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push (after CI/CD green)
git push
```

### CI/CD Verification
```bash
# Wait 2-3 minutes for GitHub Actions
gh run list --limit 5

# View specific run
gh run view [run-id]

# All green ✅ = proceed with handoff
```

---

## 🚨 Common Mistakes to Avoid

### 1. Wrong Directory
**Symptom**: Changes not reflected, wrong database
**Fix**: `cd /mnt/c/_EHG/EHG && pwd` to verify

### 2. No Server Restart
**Symptom**: Changes not visible, old code running
**Fix**: Kill server, rebuild, restart, hard refresh

### 3. Skipped Pre-Verification
**Symptom**: Implementation fails, blockers discovered late
**Fix**: Complete full pre-implementation checklist

### 4. Tests Not Run
**Symptom**: Claim "tests pass" without evidence
**Fix**: Execute both test types explicitly, document results

### 5. Large Components
**Symptom**: Component >800 lines, hard to test
**Fix**: Split into 3-4 focused components (300-600 lines each)

### 6. Inefficient Queries
**Symptom**: Context consumption >90%, slow responses
**Fix**: Select specific columns, limit results, summarize output

---

## 📚 Reference Documentation

For comprehensive guidance, see:
- **Full Protocol**: `CLAUDE.md` (5000+ lines)
- **LEO Workflow**: `docs/reference/leo-operations.md`
- **Testing Guide**: `docs/reference/qa-director-guide.md`
- **Database Schema**: `database/schema/`

---

## ✅ EXEC Implementation Workflow

1. **Pre-Implementation Checklist** (above) - MANDATORY
2. **Implement Feature** (following PRD requirements)
3. **Server Restart** (kill, build, restart, refresh)
4. **Git Commit** (conventional commits with SD-ID)
5. **Dual Test Execution** (unit + E2E, BOTH required)
6. **CI/CD Verification** (wait for green checks)
7. **Evidence Collection** (screenshots, test results)
8. **EXEC→PLAN Handoff** (7-element handoff with evidence)

---

**End of EXEC_CONTEXT.md**

*For LEAD/PLAN operations, reference full CLAUDE.md*
*Last Updated: 2025-10-12*
*BMAD Enhancement: Lean context for EXEC agents*
