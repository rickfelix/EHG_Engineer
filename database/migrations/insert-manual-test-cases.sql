-- Insert Manual UAT Test Cases with descriptions
-- These are separate from the automated tests and focus on user experience

INSERT INTO uat_cases (id, section, title, priority, test_type, description)
VALUES
  -- Authentication Tests
  ('MANUAL-AUTH-001', 'Manual_Authentication', 'Login with remember me checked - Verify functionality', 'high', 'manual',
   'Navigate to login page, check "Remember Me" checkbox, enter valid credentials, login. Close browser completely, reopen, navigate to app URL. Verify auto-login or pre-filled credentials.'),
  ('MANUAL-AUTH-002', 'Manual_Authentication', 'Login with caps lock warning when typing password', 'medium', 'manual',
   'Click password field, turn on Caps Lock, start typing. Verify warning message appears near password field indicating Caps Lock is on.'),
  ('MANUAL-AUTH-003', 'Manual_Authentication', 'Browser back button after login - Cannot go back', 'critical', 'manual',
   'Login successfully, wait for dashboard to load. Click browser back button. Verify user cannot return to login page and remains on dashboard or gets redirected.'),

  -- Visual Tests
  ('MANUAL-UI-001', 'Manual_UI_Visual', 'Logo and branding displays correctly with proper sizing', 'high', 'manual',
   'Check all pages for company logo visibility. Verify logo is not stretched, pixelated, or cut off. Check logo appears in header, login page, and any branded areas.'),
  ('MANUAL-UI-002', 'Manual_UI_Visual', 'Dark mode toggle works smoothly without flashing', 'medium', 'manual',
   'Toggle dark mode on/off multiple times. Verify smooth transition without white flash, all text remains readable, charts/graphs adapt colors appropriately.'),
  ('MANUAL-UI-003', 'Manual_UI_Visual', 'Responsive layout adapts to mobile view properly', 'critical', 'manual',
   'Resize browser window to mobile size (375px). Verify navigation collapses to hamburger menu, content stacks vertically, no horizontal scroll appears, all buttons remain clickable.'),

  -- User Experience Tests
  ('MANUAL-UX-001', 'Manual_User_Experience', 'Form validation messages are clear and helpful', 'high', 'manual',
   'Submit forms with invalid data (wrong email format, short passwords, missing required fields). Verify error messages clearly explain what needs to be fixed.'),
  ('MANUAL-UX-002', 'Manual_User_Experience', 'Loading states appear during slow operations', 'medium', 'manual',
   'Trigger data-heavy operations (large report generation, bulk updates). Verify loading spinner/skeleton screens appear, user cannot click submit twice, clear indication of progress.'),
  ('MANUAL-UX-003', 'Manual_User_Experience', 'Tooltips and help text provide useful information', 'low', 'manual',
   'Hover over icons, form fields with (?) symbols, complex features. Verify tooltips appear with helpful context, positioned correctly, disappear when moving away.'),

  -- Data Entry Tests
  ('MANUAL-DATA-001', 'Manual_Data_Entry', 'Copy/paste works in all input fields (ctrl+v)', 'high', 'manual',
   'Copy text from external source (notepad, email). Paste into various form fields using Ctrl+V and right-click paste. Verify all fields accept pasted content correctly.'),
  ('MANUAL-DATA-002', 'Manual_Data_Entry', 'Special characters (!@#$%^&*) handled correctly', 'critical', 'manual',
   'Enter special characters in name fields, descriptions, search boxes. Verify characters display correctly, no SQL errors, search works with special chars, data saves and retrieves properly.'),
  ('MANUAL-DATA-003', 'Manual_Data_Entry', 'Tab order follows logical flow through forms', 'medium', 'manual',
   'Click first form field, press Tab repeatedly. Verify cursor moves through fields in logical order (top to bottom, left to right), skips disabled fields, includes all buttons.'),

  -- Browser-Specific Tests
  ('MANUAL-BROWSER-001', 'Manual_Browser', 'Browser refresh (F5) maintains login and data state', 'critical', 'manual',
   'Login, navigate to a page with unsaved form data. Press F5 to refresh. Verify user stays logged in, form data persists or user is warned about losing unsaved changes.'),
  ('MANUAL-BROWSER-002', 'Manual_Browser', 'Multiple tabs stay in sync when using app', 'high', 'manual',
   'Open app in two browser tabs. Make changes in one tab (create record, update settings). Verify other tab reflects changes after refresh or automatically if real-time sync exists.'),
  ('MANUAL-BROWSER-003', 'Manual_Browser', 'Browser zoom (ctrl +/-) maintains usable layout', 'low', 'manual',
   'Zoom browser to 50%, 150%, 200% using Ctrl+/- keys. Verify layout remains usable, text scales properly, no overlapping elements, horizontal scroll appears appropriately.')
ON CONFLICT (id) DO NOTHING;

-- Verify manual test cases were created
SELECT
  test_type,
  section,
  COUNT(*) as count
FROM uat_cases
WHERE id LIKE 'MANUAL-%'
GROUP BY test_type, section
ORDER BY section;