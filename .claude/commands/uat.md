# /uat - Human Acceptance Testing Command

**Purpose**: Execute interactive User Acceptance Testing after `/restart` and before `/ship`

## When to Use

- After completing implementation and running `/restart`
- Before shipping features, bugfixes, or security changes
- When SD type requires human verification (feature, bugfix, security, refactor, enhancement)

## SD Type Requirements

| SD Type | UAT Required | Action |
|---------|--------------|--------|
| `feature` | YES | Proceed with UAT |
| `bugfix` | YES | Proceed with UAT |
| `security` | YES | Proceed with UAT |
| `refactor` | YES | Proceed with UAT (regression testing) |
| `enhancement` | YES | Proceed with UAT |
| `performance` | PROMPT | Ask if visible UX changes |
| `infrastructure` | EXEMPT | Skip UAT, suggest /ship |
| `database` | EXEMPT | Skip UAT, suggest /ship |
| `docs` | EXEMPT | Skip UAT, suggest /ship |
| `orchestrator` | EXEMPT | Skip UAT, suggest /ship |

## Execution Flow

### Step 1: Detect Current SD

Read the current SD from the git branch name or ask user:

```javascript
// Parse SD ID from branch name like feat/SD-FEATURE-001-description
const branchMatch = branch.match(/SD-[A-Z]+-\d+/);
```

### Step 2: Check UAT Requirement

```javascript
import { getUATRequirement } from '../lib/utils/sd-type-validation.js';

const requirement = getUATRequirement(sd.sd_type);
// Returns: 'REQUIRED', 'PROMPT', or 'EXEMPT'

if (requirement === 'EXEMPT') {
  // Use AskUserQuestion to suggest skipping
  return suggestSkip();
}
```

### Step 3: Generate Scenarios

```javascript
import { generateScenarios, checkUATReadiness } from '../lib/uat/scenario-generator.js';

// Check readiness first
const readiness = await checkUATReadiness(sdId);
if (readiness.readiness === 'NOT_READY') {
  console.log('No user stories or acceptance criteria found');
  return;
}

// Generate scenarios
const result = await generateScenarios(sdId, { quickRun: true });
```

### Step 4: Mode Selection (if many scenarios)

If more than 5 scenarios, use AskUserQuestion:

```javascript
{
  "question": "Found 12 scenarios. How would you like to test?",
  "header": "UAT Mode",
  "multiSelect": false,
  "options": [
    {"label": "Quick Run (Top 5)", "description": "Critical paths only, ~15 mins"},
    {"label": "Full Run (All 12)", "description": "Complete coverage, ~45 mins"},
    {"label": "Exploratory", "description": "Freeform testing, record findings"}
  ]
}
```

### Step 5: Present Each Scenario

Display each scenario in this format:

```
=============================================================
  /uat - Human Acceptance Testing (Quick Run Mode)
  SD: SD-FEATURE-001 (feature)
  Scenarios: 1 of 5 | Timeboxed: ~15 mins
=============================================================

  Test 1 of 5: User Login Flow
  ──────────────────────────────────────────────────────────
  GIVEN: User is on the login page
  WHEN:  User enters valid credentials and clicks "Sign In"
  THEN:  Dashboard loads within 3 seconds

  Steps to perform:
  1. Navigate to http://localhost:8080/login
  2. Enter username: test@example.com
  3. Enter password: [test password]
  4. Click "Sign In" button
  5. Verify: Dashboard page loads
```

### Step 6: Record Result via AskUserQuestion

```javascript
{
  "question": "Result for: User Login Flow",
  "header": "Test 1/5",
  "multiSelect": false,
  "options": [
    {"label": "PASS", "description": "Test passed as expected"},
    {"label": "FAIL", "description": "Test failed - capture details next"},
    {"label": "BLOCKED", "description": "Cannot execute - missing prerequisite"},
    {"label": "SKIP", "description": "Not applicable to this change"}
  ]
}
```

### Step 7: On FAIL - Capture Details

```javascript
{
  "question": "What went wrong?",
  "header": "Failure Type",
  "multiSelect": false,
  "options": [
    {"label": "Visual bug", "description": "UI doesn't look right"},
    {"label": "Functional bug", "description": "Feature doesn't work"},
    {"label": "Performance issue", "description": "Too slow/unresponsive"},
    {"label": "Console error", "description": "Errors in browser console"}
  ]
}
```

Then ask for brief description and estimated LOC.

#### Step 7.1: DOM Capture for Visual Failures (SD-LEO-ENH-UAT-DOM-CAPTURE-001)

**If failure_type is "Visual bug"**, prompt for DOM capture:

```javascript
import { shouldCaptureDom, captureVisualDefect, verifySelector } from '../lib/uat/dom-capture.js';

if (shouldCaptureDom(failureType)) {
  // Prompt user for DOM capture
  {
    "question": "Visual failure detected. Capture DOM element?",
    "header": "DOM Capture",
    "multiSelect": false,
    "options": [
      {"label": "Yes, capture element", "description": "Capture selector and position for EXEC targeting"},
      {"label": "No, skip capture", "description": "Continue without DOM capture"}
    ]
  }

  // Record the offering
  const domCaptureOffered = true;
  let domCaptureAccepted = false;
  let domCapture = null;

  if (userAccepted) {
    domCaptureAccepted = true;

    // Use Playwright MCP to capture element
    // page is the Playwright page instance from browser_snapshot
    domCapture = await captureVisualDefect(page, elementSelector, {
      defectId: `defect-${Date.now()}`,
      outputDir: './visual-polish-reports/screenshots'
    });

    if (domCapture.success) {
      console.log(`DOM captured: ${domCapture.primary_selector}`);
    }
  } else {
    console.log('Skipping DOM capture');
  }
}
```

**DOM Capture Output** (shown to user):
```
Visual failure detected. Capture DOM element? [Y/n]
> Y
DOM captured: button[data-testid="submit-btn"]
  - Primary selector: button[data-testid="submit-btn"]
  - Alternatives: #submit, .btn-primary
  - Bounding box: (100, 200, 80, 32)
  - Screenshot saved: screenshots/defect-123-annotated.png
```

**EXEC Agent Integration**: When EXEC picks up a defect with `dom_capture` metadata:
```javascript
import { verifySelector } from '../lib/uat/dom-capture.js';
import { recoverFromDrift } from '../lib/uat/selector-drift-recovery.js';

// First action: verify selector exists
const verification = await verifySelector(page, defect.metadata.dom_capture);

if (verification.verified) {
  console.log(`Selector verified: ${verification.matchedSelector} found`);
  const element = page.locator(verification.matchedSelector).first();
  // Proceed with fix
} else {
  console.log('Selector not found: attempting drift recovery');
  const recovery = await recoverFromDrift(page, defect.metadata.dom_capture);
  if (recovery.recovered) {
    console.log(`Fallback selector matched: ${recovery.new_selector}`);
  }
}
```

### Step 8: Record to Database

```javascript
import { startSession, recordResult, completeSession } from '../lib/uat/result-recorder.js';

// Start session
const session = await startSession(sdId, {
  triggeredBy: 'UAT_COMMAND',
  scenarioSnapshot: scenarios
});

// Record each result
await recordResult(session.id, scenario, 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIP', {
  notes: userNotes,
  errorMessage: failureDescription,
  failureType: 'visual' | 'functional' | 'performance' | 'console',
  estimatedLOC: 30
});

// Complete session
const summary = await completeSession(session.id);
```

### Step 9: Session Summary with Routing

```
=============================================================
  UAT Session Complete - SD-FEATURE-001
=============================================================

  Results: 4 PASS | 1 FAIL | 0 SKIP
  Quality Gate: YELLOW (80% pass rate)

  Defect Captured:
  ──────────────────────────────────────────────────────────
  [DEF-001] Visual bug: Save button misaligned on mobile
  Severity: minor | Est. LOC: <50
```

### Step 10: Route Defects

```javascript
import { routeDefect, getRoutingOptions } from '../lib/uat/risk-router.js';

const routing = getRoutingOptions(defect);
// Use AskUserQuestion with routing.options
```

```javascript
{
  "question": "Defect found. How should we proceed?",
  "header": "Next Step",
  "multiSelect": false,
  "options": [
    {"label": "/quick-fix DEF-001", "description": "Fix now (<50 LOC, auto-merge)"},
    {"label": "Create SD", "description": "Larger fix via LEO Protocol"},
    {"label": "/ship anyway", "description": "Ship with known issue"},
    {"label": "Rerun /uat", "description": "Test again after fixing"}
  ]
}
```

## Quality Gate Logic

- **GREEN**: 0 failures AND pass rate >= 85%
- **YELLOW**: Has failures BUT pass rate >= 85%
- **RED**: Pass rate < 85% OR any blocked-critical

## Command Ecosystem Integration

### Comes After
- `/restart` - Clean environment for testing

### Goes To
- `/quick-fix` - If defect found, <=50 LOC, low risk
- `/ship` - If GREEN or YELLOW quality gate
- Create SD - If defect requires full workflow

### Cross-Reference
See [Command Ecosystem Reference](../../docs/reference/command-ecosystem.md) for full workflow diagram.

## Error Handling

- If no SD detected from branch: Ask user to provide SD ID
- If no user stories: Suggest creating stories first
- If database error: Log and continue with local-only mode
- If session interrupted: Offer to resume on next run
