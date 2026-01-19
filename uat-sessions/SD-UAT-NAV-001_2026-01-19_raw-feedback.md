# UAT Session Raw Feedback
**SD**: SD-UAT-NAV-001
**Title**: UAT: Core Navigation
**Date**: 2026-01-19
**Tester**: User (Manual)

---

## Test 1: Verify Sidebar Menu Navigation

### Raw User Feedback (verbatim)

> All right so starting off first just so you know like everything looked really big on my screen like I needed to reduce the magnification and zoom out until like 80% in order for things to see appropriately on my browser. But going back to the test which is to verify cyborg menu navigation clicking on the chairman navigation it navigation German dashboard button in the command center grouping that has no issues clicking on the Eva assistant has no issues although it looks like it's demo data but that might not be you know an issue right now The notifications tab that shows okay then there's a grouping that says my ventures and I know this one I clicked on some of them it gave me an application error. So now I'm going back to the next grouping which says all ventures when I click on that it takes me to the ventures page that is like the external facing ventures page which I think is incorrect which is definitely incorrect. So not going back we were at all ventures now going to venture analytics that shows a page these are interface like the colors don't really look appropriate under opportunity sourcing that page shows up under portfolios that page shows up not going to go to the analytics and insights grouping the performance dashboard button shows up competitive intelligence shows up profitability analysis it says there's an error message that says invalid input syntax for UUID undefined. Moving on to risk forecasting that looks okay well at least no error messages moving on to reports and insights no error messages there moving on to go to market intelligence no error messages there now in the next grouping which is go to market clicking on go to market execution and timing that appears to be the same page as the go to market intelligence dashboard and then clicking on created media that takes me to a page with no error messages cooking on the go to market timing route and shows no error messages. The next grouping is the AI and automation grouping clicking on the AI CEO that shows no issues click on the workflow automation shows no issues. Quickly on the board dashboard shows no issues. Quickly on the board meetings route shows no issues the next grouping is the settings and tools area. Quickly on the user settings shows no issues quickly on the feature catalog shows no issues clicking on feedback and support shows no issues clicking on mobile companion shows no issues the next grouping is the platform administration clicking on the Leo dashboard that takes me to the admin console which is good which the admin console is going to require its own user acceptance testing but going back the quality assurance that produce no error messages the next button is the preflight checks no error messages the next button is an integration status no error messages the next button is the security monitoring that shows that it failed to load security data. The next button is the access review no error messages the next button is the governance no error messages the next button is system monitoring and that shows a pop-up that says permissions required and it gives you a button to request access or contact admin. The next button is performance metrics and that also has a pop-up request for permissions to request access or contact admin. The next button is the knowledge management button and that is loading took a little took some time to load but no error messages and then the last one says team management and no error messages there.

---

### Extracted Observations

#### General Issue
- **Zoom Issue**: Page elements too large at default zoom; user had to reduce to 80%

#### Navigation Items Tested

| Menu Item | Grouping | Result | Notes |
|-----------|----------|--------|-------|
| Chairman Dashboard | Command Center | PASS | No issues |
| EVA Assistant | Command Center | PASS | Demo data (expected) |
| Notifications | Command Center | PASS | OK |
| My Ventures items | My Ventures | FAIL | Application error |
| All Ventures | All Ventures | FAIL | Wrong page (external-facing) |
| Venture Analytics | All Ventures | PASS | Colors noted as not appropriate |
| Opportunity Sourcing | All Ventures | PASS | OK |
| Portfolios | All Ventures | PASS | OK |
| Performance Dashboard | Analytics & Insights | PASS | OK |
| Competitive Intelligence | Analytics & Insights | PASS | OK |
| Profitability Analysis | Analytics & Insights | FAIL | UUID error: "invalid input syntax for UUID undefined" |
| Risk Forecasting | Analytics & Insights | PASS | OK |
| Reports & Insights | Analytics & Insights | PASS | OK |
| Go-to-Market Intelligence | Go-to-Market | PASS | OK |
| Go-to-Market Execution & Timing | Go-to-Market | FAIL | Same page as GTM Intelligence (duplicate) |
| Created Media | Go-to-Market | PASS | OK |
| Go-to-Market Timing | Go-to-Market | PASS | OK |
| AI CEO | AI & Automation | PASS | OK |
| Workflow Automation | AI & Automation | PASS | OK |
| Board Dashboard | Board | PASS | OK |
| Board Meetings | Board | PASS | OK |
| User Settings | Settings & Tools | PASS | OK |
| Feature Catalog | Settings & Tools | PASS | OK |
| Feedback & Support | Settings & Tools | PASS | OK |
| Mobile Companion | Settings & Tools | PASS | OK |
| LEO Dashboard | Platform Admin | PASS | Takes to admin console |
| Quality Assurance | Platform Admin | PASS | OK |
| Preflight Checks | Platform Admin | PASS | OK |
| Integration Status | Platform Admin | PASS | OK |
| Security Monitoring | Platform Admin | FAIL | "Failed to load security data" |
| Access Review | Platform Admin | PASS | OK |
| Governance | Platform Admin | PASS | OK |
| System Monitoring | Platform Admin | WARN | Permissions popup (may be expected) |
| Performance Metrics | Platform Admin | WARN | Permissions popup (may be expected) |
| Knowledge Management | Platform Admin | PASS | Slow load, but OK |
| Team Management | Platform Admin | PASS | OK |

---

### Defects Extracted

| ID | Title | Severity | Type | Description |
|----|-------|----------|------|-------------|
| DEF-001 | UI zoom defaults too large | minor | visual | 80% zoom needed for proper display |
| DEF-002 | My Ventures: Application error | major | functional | Click produces application error |
| DEF-003 | All Ventures: Wrong navigation | major | functional | Navigates to external-facing page |
| DEF-004 | Profitability Analysis: UUID error | major | functional | "invalid input syntax for UUID undefined" |
| DEF-005 | GTM Execution: Duplicate page | minor | functional | Same as GTM Intelligence Dashboard |
| DEF-006 | Security Monitoring: Load failure | major | functional | "Failed to load security data" |
| DEF-007 | System Monitoring: Permissions popup | minor | permissions | Unexpected permission requirement |
| DEF-008 | Performance Metrics: Permissions popup | minor | permissions | Unexpected permission requirement |

---

## Test 2: Verify Header User Menu

### Raw User Feedback (verbatim)

> Okay so we're on test two verifying the header user menu and I so I see it says given I'm logged into the application when I click on the user after I menu in the header I drop down menu appears and I see settings and log out or sign out but I don't see an option that says profile. Again the menu options I see are settings and sign out.

---

### Result: PASS (with minor issue)

**What Works:**
- Dropdown menu appears when clicking user avatar
- Settings option is present and functional
- Sign Out option is present

**Missing:**
- Profile option is NOT present in dropdown (expected per acceptance criteria)

### Defect Extracted

| ID | Title | Severity | Type | Description |
|----|-------|----------|------|-------------|
| DEF-009 | Header menu missing Profile option | minor | functional | User menu dropdown shows Settings and Sign Out but does not include Profile option as specified in acceptance criteria |

## Test 3: Verify Page Routing

### Result: PASS

Back/forward browser navigation works correctly. URLs update appropriately when navigating between pages.

## Test 4: Verify Breadcrumb Navigation

### Raw User Feedback (verbatim)

> Now it says verify bread crumb navigation This says it's the final test but first let me let me also say like in the header I see a surge platform button and it has some commands which are okay for now I guess I don't know that I'll ever use it and then I see an option for a chairman button builder button and both and for that I think what that does is it filters the sidebar navigation and I don't know that those are needed you know I am so the chairman and the solo builder and you know at times we're probably want to see you know the perspective of the chairman and of the solo builder I don't know if it's too complicated but you know I don't know that we need to be able to filter it I think it just adds some complexity to the application and then I see there's some shortcuts and I don't know that I'll need these shortcuts we could probably remove that. So I just wanted to mention that first now I'll get to test for which is to verify bread crumb navigation and it says steps to perform navigate to a nested page like venture detail or analytics let's go to Venture analytics okay and then look for bread crumb navigation I do not see bread crumb navigation effectiveness.

---

### Result: FAIL

**What's Missing:**
- Breadcrumb navigation is NOT present on nested pages (tested on Venture Analytics)
- No breadcrumb component visible in page header

### Additional Observations (not part of test, but noted)

User noted several header elements that may add unnecessary complexity:
1. **Search Platform button** - Has commands, user unsure if needed
2. **Chairman/Builder filter buttons** - Filters sidebar navigation by role, user questions if this complexity is needed
3. **Shortcuts** - User doesn't think they'll need these, suggested for removal

These are UX simplification suggestions, not defects per se.

### Defect Extracted

| ID | Title | Severity | Type | Description |
|----|-------|----------|------|-------------|
| DEF-010 | Breadcrumb navigation missing | major | functional | Nested pages (e.g., Venture Analytics) do not display breadcrumb navigation as specified in acceptance criteria |

---

*Raw feedback captured: 2026-01-19*
