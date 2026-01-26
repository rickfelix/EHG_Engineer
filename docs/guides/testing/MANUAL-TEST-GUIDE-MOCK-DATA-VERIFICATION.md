# Manual Test Guide: Mock Data Verification System


## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: testing, guide, leo, validation

**Purpose**: Step-by-step guide for manual browser testing
**Estimated Time**: 15-20 minutes
**Prerequisites**: LEO Stack running on localhost

---

## Pre-Test Setup

### Check Server Status

```bash
# Run this command first
bash /mnt/c/_EHG/EHG_Engineer/scripts/leo-stack.sh status
```

**Expected Output**:
```
✅ EHG_Engineer (3000): Running
✅ EHG App (8080): Running
✅ Agent Platform (8000): Running
```

If any server is not running:
```bash
bash /mnt/c/_EHG/EHG_Engineer/scripts/leo-stack.sh start
```

---

## Test 1: Backend Running - Real Data Flow (Happy Path)

**Objective**: Verify research works with backend running (no mock data dialog)

### Setup
1. Ensure all servers are running (see Pre-Test Setup)
2. Verify Agent Platform health:
   ```bash
   curl http://localhost:8000/health
   ```
   Expected: `{"status":"healthy","service":"AI Research Platform",...}`

### Test Steps

1. **Navigate to Venture Creation**
   - Open browser: `http://localhost:8080/create-venture`
   - Expected: Page loads successfully

2. **Fill Stage 1 Form**
   - **Venture Name**: "Test Venture - Real Data"
   - **Description**: "Testing real research data flow with backend running"
   - **Problem Statement**: "Test problem"
   - **Target Market**: "Test market"
   - Click "Next" button

3. **Observe Stage 2 - Connection Status**
   - Expected: Page navigates to Stage 2 (Research)
   - **Look for connection indicator** (above "Start AI Research" button):
     - 🟢 Should show: **"Agent Platform Connected"**
     - Background color: **Green** (`bg-green-100`)
     - Icon: **Wifi** icon (not WifiOff)
   - Screenshot this indicator (save as `test1-connected-indicator.png`)

4. **Start Research**
   - Click **"Start AI Research"** button
   - Expected: Research starts immediately
   - **NO DIALOG SHOULD APPEAR** ❌ (this is critical!)

5. **Monitor Research Progress**
   - Expected: Progress bar appears and updates
   - Expected: Elapsed time counter increments (e.g., "5s", "10s")
   - Expected: Agent status cards show "Running" → "Complete"
   - Expected: Activity feed shows real-time events

6. **Wait for Completion** (10-15 minutes for real research)
   - If using mock backend: Completes in 30 seconds
   - If using real CrewAI: Takes 10-15 minutes

7. **Verify Results**
   - Expected: Results displayed in Stage 2
   - **Check for REAL data** (not the $5B TAM mock data)
   - **Check console logs**:
     ```
     [startResearch] Backend connection verified - proceeding with real research
     [startResearch] Research session created
     ```
   - **NO mock data warnings** in console ❌

### Expected Results ✅
- ✅ Green connection indicator shows "Agent Platform Connected"
- ✅ No dialog appears when clicking "Start AI Research"
- ✅ Research proceeds immediately
- ✅ Real research data returned (NOT mock $5B TAM)
- ✅ Console shows "Backend connection verified"
- ✅ NO console warnings about "MOCK DATA MODE"

### If Test Fails ❌
- **Dialog appears**: Backend connection check is failing (investigate health endpoint)
- **Mock data shown**: Check for silent fallback logic (should not exist)
- **No green indicator**: ValidationPanel not checking connection properly

---

## Test 2: Backend Stopped - Mock Data Dialog Flow

**Objective**: Verify dialog appears when backend is unavailable

### Setup
1. **Stop Agent Platform ONLY** (keep other servers running):
   ```bash
   # Find Agent Platform process
   lsof -ti :8000 | xargs kill

   # Verify it's stopped
   lsof -i :8000
   # Should show nothing

   # Verify health check fails
   curl http://localhost:8000/health
   # Should show: "Connection refused"
   ```

2. **Keep EHG App running** (port 8080):
   ```bash
   lsof -i :8080
   # Should show node process listening
   ```

### Test Steps

1. **Navigate to Venture Creation**
   - Open browser: `http://localhost:8080/create-venture`
   - Clear browser cache (Ctrl+Shift+Delete)
   - Hard refresh (Ctrl+Shift+R)

2. **Fill Stage 1 Form**
   - **Venture Name**: "Test Venture - Mock Data"
   - **Description**: "Testing mock data dialog when backend is stopped"
   - **Problem Statement**: "Test problem"
   - **Target Market**: "Test market"
   - Click "Next" button

3. **Observe Stage 2 - Connection Status**
   - Expected: Page navigates to Stage 2 (Research)
   - **Look for connection indicator**:
     - 🔴 Should show: **"Agent Platform Offline: Cannot connect to Agent Platform on port 8000"**
     - Background color: **Red** (`bg-red-100`)
     - Icon: **WifiOff** icon (not Wifi)
   - Screenshot this indicator (save as `test2-offline-indicator.png`)

4. **Attempt to Start Research**
   - Click **"Start AI Research"** button
   - Expected: Button click triggers verification
   - Expected: Research HALTS immediately (loading spinner should be brief)
   - **DIALOG SHOULD APPEAR** ✅ (this is critical!)

5. **Inspect Dialog Content**
   - Dialog title: **"Agent Platform Unavailable"**
   - Red error box with message: **"Cannot connect to Agent Platform on port 8000"**
   - Explanation text: "Research requires the **Agent Platform backend** running on port 8000..."
   - Warning box: "Mock data is simulated for demonstration purposes only..."
   - Troubleshooting steps with commands:
     - `bash scripts/leo-stack.sh start`
     - `curl http://localhost:8000/health`
   - Screenshot the dialog (save as `test2-mock-dialog.png`)

6. **Test "Cancel Research" Button**
   - Click **"Cancel Research"** button
   - Expected: Dialog closes
   - Expected: Error message appears: **"Research canceled. Please start the LEO Stack and try again."**
   - Expected: No research starts
   - Screenshot the error message (save as `test2-cancel-result.png`)

7. **Test "Continue with Mock Data" Button**
   - Click **"Start AI Research"** again (to re-trigger dialog)
   - Dialog should reappear
   - Click **"Continue with Mock Data"** button (yellow button)
   - Expected: Dialog closes
   - Expected: Research starts with mock data

8. **Monitor Mock Research Progress**
   - Expected: Progress bar updates over 30 seconds
   - Expected: Completes in 30 seconds (simulated)
   - **Check console logs**:
     ```
     [handleContinueWithMock] User explicitly chose mock data
     [createMockResearchSession] User explicitly chose mock data
     ```

9. **Verify Mock Results**
   - Expected: Results show mock data:
     - TAM: $5,000,000,000 ($5B)
     - SAM: $1,000,000,000 ($1B)
     - SOM: $50,000,000 ($50M)
   - Expected: Success message: **"Research completed with sample data. Results are for demonstration only."**
   - Screenshot the results (save as `test2-mock-results.png`)

### Expected Results ✅
- ✅ Red connection indicator shows "Agent Platform Offline: {error}"
- ✅ Clicking "Start AI Research" triggers backend verification
- ✅ Research HALTS immediately (does not proceed)
- ✅ MockDataConfirmationDialog appears with error message
- ✅ Dialog shows troubleshooting tips (LEO Stack commands)
- ✅ "Cancel Research" button closes dialog, no research starts
- ✅ "Continue with Mock Data" button creates mock session
- ✅ Mock data clearly labeled with success message
- ✅ Console shows "[handleContinueWithMock] User explicitly chose mock data"

### If Test Fails ❌
- **No dialog appears**: startResearch() not calling verifyBackendConnection()
- **Research proceeds without dialog**: Silent fallback logic still present (should be removed)
- **Green indicator shown**: ValidationPanel not detecting connection failure
- **Dialog cannot be closed**: Check AlertDialog `open` prop binding

---

## Test 3: Connection Status Indicator Auto-Update

**Objective**: Verify indicator updates automatically

### Test Steps

1. **Start with Backend Running**
   - Navigate to Stage 2: `http://localhost:8080/create-venture?step=2`
   - Expected: 🟢 "Agent Platform Connected" shows immediately

2. **Stop Backend Mid-Session**
   ```bash
   # In terminal:
   lsof -ti :8000 | xargs kill
   ```

3. **Navigate Away and Back**
   - Click "Previous" button (go to Stage 1)
   - Click "Next" button (return to Stage 2)
   - Expected: Indicator updates to 🔴 "Agent Platform Offline"

4. **Start Backend Again**
   ```bash
   # In terminal:
   bash scripts/leo-stack.sh start-agent
   # Wait 15 seconds for startup
   ```

5. **Navigate Away and Back**
   - Click "Previous" button
   - Click "Next" button
   - Expected: Indicator updates to 🟢 "Agent Platform Connected"

### Expected Results ✅
- ✅ Indicator updates automatically on component mount
- ✅ Color-coded correctly (green=connected, red=offline, yellow=checking)
- ✅ Shows appropriate icon (Wifi, WifiOff, or Loader2)
- ✅ Error message displayed when backend unreachable
- ✅ Brief "Checking..." state may appear (< 5 seconds)

---

## Test 4: Browser Console Inspection

**Objective**: Verify appropriate logging and no errors

### Test Steps

1. **Open Browser DevTools**
   - Press F12 (Chrome/Edge/Firefox)
   - Go to "Console" tab

2. **Run Test 1** (Backend Running)
   - Clear console (Ctrl+L)
   - Navigate through venture creation to Stage 2
   - Click "Start AI Research"
   - Observe console logs

3. **Expected Console Output** (Backend Running):
   ```
   [startResearch] Verifying backend connection...
   [verifyBackendConnection] Backend healthy: {status: "healthy", ...}
   [startResearch] Backend connection verified - proceeding with real research
   [startResearch] Starting AI research session for venture: {venture_id}
   [startResearch] Research session created: {session}
   [startResearch] Starting polling for session: {session_id}
   ```

4. **Run Test 2** (Backend Stopped)
   - Stop Agent Platform
   - Clear console
   - Navigate to Stage 2
   - Click "Start AI Research"
   - Click "Continue with Mock Data"
   - Observe console logs

5. **Expected Console Output** (Backend Stopped):
   ```
   [startResearch] Verifying backend connection...
   [startResearch] Backend unavailable: Cannot connect to Agent Platform on port 8000
   [handleContinueWithMock] User explicitly chose mock data
   [createMockResearchSession] User explicitly chose mock data
   ⚠️ [VentureResearch] MOCK DATA MODE - Backend not available
   ```

### Expected Results ✅
- ✅ No uncaught exceptions or React errors
- ✅ Appropriate info/warn/error logging
- ✅ Mock data logs ONLY appear when user chooses mock
- ✅ No silent fallback messages

### Red Flags ❌
- ❌ Uncaught TypeError or Promise rejection
- ❌ React warning about missing dependencies
- ❌ "MOCK DATA MODE" without user clicking "Continue with Mock Data"

---

## Test 5: UI/UX Validation

**Objective**: Verify visual design and responsiveness

### Test Steps

1. **Dialog Visual Inspection**
   - Trigger mock data dialog
   - Check styling:
     - ✅ Title has AlertCircle icon (red)
     - ✅ Error message in red box (`bg-destructive/10`)
     - ✅ Explanation text is readable
     - ✅ Warning box has gray background (`bg-muted/50`)
     - ✅ Troubleshooting steps use code font
     - ✅ "Cancel" button is outline style
     - ✅ "Continue" button is yellow (`bg-yellow-600`)

2. **Responsive Design Testing**
   - Open DevTools (F12)
   - Go to "Device Toolbar" (Ctrl+Shift+M)
   - Test on mobile sizes:
     - iPhone SE (375px)
     - iPad (768px)
     - Desktop (1920px)
   - Expected: Dialog scales properly, text wraps correctly

3. **Connection Indicator Positioning**
   - Verify indicator is:
     - ✅ Above "Start AI Research" button
     - ✅ Centered in the card
     - ✅ Readable font size
     - ✅ Clear color contrast

### Expected Results ✅
- ✅ Dialog looks professional and polished
- ✅ All text is readable (no overflow)
- ✅ Buttons are clearly distinguishable
- ✅ Dialog is responsive on mobile
- ✅ Connection indicator is prominent and clear

---

## Test 6: Accessibility Testing

**Objective**: Verify keyboard navigation and screen reader support

### Test Steps

1. **Keyboard Navigation**
   - Trigger mock data dialog
   - Press Tab key
   - Expected: Focus moves to "Cancel Research" button
   - Press Tab again
   - Expected: Focus moves to "Continue with Mock Data" button
   - Press Enter
   - Expected: Focused button activates

2. **Screen Reader Testing** (Optional)
   - Enable Windows Narrator (Win+Ctrl+Enter)
   - Navigate to dialog
   - Expected: Dialog title and description are read aloud
   - Expected: Button labels are clear

### Expected Results ✅
- ✅ Tab navigation works correctly
- ✅ Enter/Space activates focused button
- ✅ Focus is trapped in dialog (doesn't escape)
- ✅ Focus returns to trigger element when closed

---

## Test Completion Checklist

After completing all tests, verify:

- [ ] Test 1: Backend running flow works (no dialog)
- [ ] Test 2: Backend stopped flow works (dialog appears)
- [ ] Test 3: Connection indicator updates correctly
- [ ] Test 4: Console logs are appropriate (no errors)
- [ ] Test 5: UI looks polished and professional
- [ ] Test 6: Keyboard navigation works
- [ ] No uncaught exceptions in console
- [ ] No React warnings in console
- [ ] Screenshots captured for documentation

---

## Reporting Results

### If All Tests Pass ✅

**Action**: Approve for production deployment

**Report Format**:
```
Mock Data Verification System: ✅ APPROVED

All 6 manual tests passed:
- Test 1: Backend Running Flow ✅
- Test 2: Backend Stopped Flow ✅
- Test 3: Connection Indicator ✅
- Test 4: Console Logs ✅
- Test 5: UI/UX ✅
- Test 6: Accessibility ✅

Screenshots attached: [list filenames]
Ready for production deployment.
```

### If Any Test Fails ❌

**Action**: Report issue with details

**Report Format**:
```
Mock Data Verification System: ❌ ISSUES FOUND

Failed Test: [Test Number and Name]

Issue Description:
- Expected: [what should happen]
- Actual: [what actually happened]
- Screenshot: [filename]

Console Errors:
[paste error messages]

Reproduction Steps:
1. [step 1]
2. [step 2]
...

Severity: [Low/Medium/High/Blocker]
```

---

## Troubleshooting

### Issue: Backend Health Check Always Fails

**Symptoms**: Red indicator even when port 8000 is running

**Diagnosis**:
```bash
# Check if port 8000 is listening
lsof -i :8000

# Try health check directly
curl -v http://localhost:8000/health
```

**Possible Causes**:
- CORS issues (check browser console for CORS errors)
- Backend not fully started (wait 15 seconds after starting)
- Wrong health check URL (should be `http://localhost:8000/health`)

### Issue: Dialog Doesn't Appear

**Symptoms**: Research proceeds even when backend is stopped

**Diagnosis**:
- Check console for error in verifyBackendConnection()
- Verify showMockDataDialog state is set to true
- Check if dialog component is rendered

**Possible Causes**:
- verifyBackendConnection() throwing exception
- Dialog component not imported
- State update not triggering re-render

### Issue: Mock Data Used Without User Consent

**Symptoms**: Mock data shown without dialog appearing

**Diagnosis**:
- Check console for "[createMockResearchSession] User explicitly chose mock data"
- If missing, silent fallback is still present

**Possible Causes**:
- createResearchSession() has silent fallback logic (should be removed)
- generateMockSession() called directly (should only be via createMockResearchSession)

---

**Manual Testing Guide Prepared By**: QA Engineering Director (Claude Code)
**Date**: 2025-11-02
**Estimated Testing Time**: 15-20 minutes
