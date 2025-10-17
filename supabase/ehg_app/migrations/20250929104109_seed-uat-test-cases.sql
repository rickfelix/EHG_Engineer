-- UAT Test Case Seeding
-- Total: 61 test cases across 14 sections

-- Clear existing test cases (optional)
DELETE FROM uat_cases WHERE id LIKE 'TEST-%';

-- Authentication (7 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-AUTH-001', 'Authentication', 'critical', 'Standard Login'),
  ('TEST-AUTH-002', 'Authentication', 'critical', 'Invalid Credentials'),
  ('TEST-AUTH-003', 'Authentication', 'high', 'Password Reset'),
  ('TEST-AUTH-004', 'Authentication', 'high', 'Session Timeout'),
  ('TEST-AUTH-005', 'Authentication', 'high', 'Logout Functionality'),
  ('TEST-AUTH-006', 'Authentication', 'medium', 'Remember Me'),
  ('TEST-AUTH-007', 'Authentication', 'high', 'Multi-Factor Authentication');

-- Dashboard (5 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-DASH-001', 'Dashboard', 'critical', 'Dashboard Initial Load'),
  ('TEST-DASH-002', 'Dashboard', 'high', 'Key Metrics Display'),
  ('TEST-DASH-003', 'Dashboard', 'high', 'Real-time Updates'),
  ('TEST-DASH-004', 'Dashboard', 'medium', 'Customization Options'),
  ('TEST-DASH-005', 'Dashboard', 'medium', 'Date Range Filters');

-- Ventures (10 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-VENT-001', 'Ventures', 'critical', 'View All Ventures'),
  ('TEST-VENT-002', 'Ventures', 'high', 'Search Ventures'),
  ('TEST-VENT-003', 'Ventures', 'high', 'Filter Ventures'),
  ('TEST-VENT-004', 'Ventures', 'critical', 'Create New Venture'),
  ('TEST-VENT-005', 'Ventures', 'high', 'Edit Venture Details'),
  ('TEST-VENT-006', 'Ventures', 'high', 'Delete Venture'),
  ('TEST-VENT-007', 'Ventures', 'high', 'Venture Status Management'),
  ('TEST-VENT-008', 'Ventures', 'high', 'View Venture Details'),
  ('TEST-VENT-009', 'Ventures', 'medium', 'Document Management'),
  ('TEST-VENT-010', 'Ventures', 'high', 'Financial Metrics');

-- Portfolio (4 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-PORT-001', 'Portfolio', 'high', 'Create Portfolio'),
  ('TEST-PORT-002', 'Portfolio', 'high', 'Add Ventures to Portfolio'),
  ('TEST-PORT-003', 'Portfolio', 'high', 'Portfolio Analytics'),
  ('TEST-PORT-004', 'Portfolio', 'medium', 'Portfolio Sharing');

-- AI Agents (4 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-AI-001', 'AI_Agents', 'high', 'EVA Chat Interface'),
  ('TEST-AI-002', 'AI_Agents', 'medium', 'AI Agent Configuration'),
  ('TEST-AI-003', 'AI_Agents', 'medium', 'Voice Commands'),
  ('TEST-AI-004', 'AI_Agents', 'high', 'Context Awareness');

-- Governance (3 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-GOV-001', 'Governance', 'high', 'Policy Management'),
  ('TEST-GOV-002', 'Governance', 'high', 'Compliance Tracking'),
  ('TEST-GOV-003', 'Governance', 'critical', 'Audit Trail');

-- Team (3 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-TEAM-001', 'Team', 'high', 'Team Member Management'),
  ('TEST-TEAM-002', 'Team', 'medium', 'Collaboration Features'),
  ('TEST-TEAM-003', 'Team', 'high', 'Permission Inheritance');

-- Reports (4 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-RPT-001', 'Reports', 'high', 'Generate Standard Reports'),
  ('TEST-RPT-002', 'Reports', 'medium', 'Custom Report Builder'),
  ('TEST-RPT-003', 'Reports', 'high', 'Export Functionality'),
  ('TEST-RPT-004', 'Reports', 'medium', 'Scheduled Reports');

-- Settings (3 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-SET-001', 'Settings', 'high', 'User Profile Management'),
  ('TEST-SET-002', 'Settings', 'critical', 'System Configuration'),
  ('TEST-SET-003', 'Settings', 'high', 'Integration Settings');

-- Notifications (3 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-NOT-001', 'Notifications', 'high', 'In-App Notifications'),
  ('TEST-NOT-002', 'Notifications', 'medium', 'Email Notifications'),
  ('TEST-NOT-003', 'Notifications', 'medium', 'Notification Preferences');

-- Performance (3 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-PERF-001', 'Performance', 'critical', 'Page Load Times'),
  ('TEST-PERF-002', 'Performance', 'high', 'Concurrent Users'),
  ('TEST-PERF-003', 'Performance', 'high', 'Large Data Sets');

-- Accessibility (3 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-ACC-001', 'Accessibility', 'high', 'Keyboard Navigation'),
  ('TEST-ACC-002', 'Accessibility', 'high', 'Screen Reader Compatibility'),
  ('TEST-ACC-003', 'Accessibility', 'high', 'Color Contrast');

-- Security (4 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-SEC-001', 'Security', 'critical', 'SQL Injection'),
  ('TEST-SEC-002', 'Security', 'critical', 'Cross-Site Scripting (XSS)'),
  ('TEST-SEC-003', 'Security', 'critical', 'Authorization Bypass'),
  ('TEST-SEC-004', 'Security', 'critical', 'Secure Data Transmission');

-- Browser (5 tests)
INSERT INTO uat_cases (id, section, priority, title) VALUES
  ('TEST-BROW-001', 'Browser', 'high', 'Chrome Compatibility'),
  ('TEST-BROW-002', 'Browser', 'high', 'Firefox Compatibility'),
  ('TEST-BROW-003', 'Browser', 'medium', 'Safari Compatibility'),
  ('TEST-BROW-004', 'Browser', 'medium', 'Edge Compatibility'),
  ('TEST-BROW-005', 'Browser', 'high', 'Mobile Browser Testing');

-- Verify the insert
SELECT
  section,
  COUNT(*) as test_count,
  SUM(CASE WHEN priority = 'critical' THEN 1 ELSE 0 END) as critical,
  SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high,
  SUM(CASE WHEN priority = 'medium' THEN 1 ELSE 0 END) as medium
FROM uat_cases
GROUP BY section
ORDER BY section;