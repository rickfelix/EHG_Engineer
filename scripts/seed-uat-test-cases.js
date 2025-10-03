#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Create client with fresh instance to avoid schema cache issues
const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g',
  {
    db: { schema: 'public' },
    auth: { persistSession: false }
  }
);

const testCases = [
  // Authentication (7 tests)
  { id: 'TEST-AUTH-001', section: 'Authentication', priority: 'critical', title: 'Standard Login' },
  { id: 'TEST-AUTH-002', section: 'Authentication', priority: 'critical', title: 'Invalid Credentials' },
  { id: 'TEST-AUTH-003', section: 'Authentication', priority: 'high', title: 'Password Reset' },
  { id: 'TEST-AUTH-004', section: 'Authentication', priority: 'high', title: 'Session Timeout' },
  { id: 'TEST-AUTH-005', section: 'Authentication', priority: 'high', title: 'Logout Functionality' },
  { id: 'TEST-AUTH-006', section: 'Authentication', priority: 'medium', title: 'Remember Me' },
  { id: 'TEST-AUTH-007', section: 'Authentication', priority: 'high', title: 'Multi-Factor Authentication' },
  // Dashboard (5 tests)
  { id: 'TEST-DASH-001', section: 'Dashboard', priority: 'critical', title: 'Dashboard Initial Load' },
  { id: 'TEST-DASH-002', section: 'Dashboard', priority: 'high', title: 'Key Metrics Display' },
  { id: 'TEST-DASH-003', section: 'Dashboard', priority: 'high', title: 'Real-time Updates' },
  { id: 'TEST-DASH-004', section: 'Dashboard', priority: 'medium', title: 'Customization Options' },
  { id: 'TEST-DASH-005', section: 'Dashboard', priority: 'medium', title: 'Date Range Filters' },
  // Ventures (10 tests)
  { id: 'TEST-VENT-001', section: 'Ventures', priority: 'critical', title: 'View All Ventures' },
  { id: 'TEST-VENT-002', section: 'Ventures', priority: 'high', title: 'Search Ventures' },
  { id: 'TEST-VENT-003', section: 'Ventures', priority: 'high', title: 'Filter Ventures' },
  { id: 'TEST-VENT-004', section: 'Ventures', priority: 'critical', title: 'Create New Venture' },
  { id: 'TEST-VENT-005', section: 'Ventures', priority: 'high', title: 'Edit Venture Details' },
  { id: 'TEST-VENT-006', section: 'Ventures', priority: 'high', title: 'Delete Venture' },
  { id: 'TEST-VENT-007', section: 'Ventures', priority: 'high', title: 'Venture Status Management' },
  { id: 'TEST-VENT-008', section: 'Ventures', priority: 'high', title: 'View Venture Details' },
  { id: 'TEST-VENT-009', section: 'Ventures', priority: 'medium', title: 'Document Management' },
  { id: 'TEST-VENT-010', section: 'Ventures', priority: 'high', title: 'Financial Metrics' },
  // Portfolio (4 tests)
  { id: 'TEST-PORT-001', section: 'Portfolio', priority: 'high', title: 'Create Portfolio' },
  { id: 'TEST-PORT-002', section: 'Portfolio', priority: 'high', title: 'Add Ventures to Portfolio' },
  { id: 'TEST-PORT-003', section: 'Portfolio', priority: 'high', title: 'Portfolio Analytics' },
  { id: 'TEST-PORT-004', section: 'Portfolio', priority: 'medium', title: 'Portfolio Sharing' },
  // AI Agents (4 tests)
  { id: 'TEST-AI-001', section: 'AI_Agents', priority: 'high', title: 'EVA Chat Interface' },
  { id: 'TEST-AI-002', section: 'AI_Agents', priority: 'medium', title: 'AI Agent Configuration' },
  { id: 'TEST-AI-003', section: 'AI_Agents', priority: 'medium', title: 'Voice Commands' },
  { id: 'TEST-AI-004', section: 'AI_Agents', priority: 'high', title: 'Context Awareness' },
  // Governance (3 tests)
  { id: 'TEST-GOV-001', section: 'Governance', priority: 'high', title: 'Policy Management' },
  { id: 'TEST-GOV-002', section: 'Governance', priority: 'high', title: 'Compliance Tracking' },
  { id: 'TEST-GOV-003', section: 'Governance', priority: 'critical', title: 'Audit Trail' },
  // Team (3 tests)
  { id: 'TEST-TEAM-001', section: 'Team', priority: 'high', title: 'Team Member Management' },
  { id: 'TEST-TEAM-002', section: 'Team', priority: 'medium', title: 'Collaboration Features' },
  { id: 'TEST-TEAM-003', section: 'Team', priority: 'high', title: 'Permission Inheritance' },
  // Reports (4 tests)
  { id: 'TEST-RPT-001', section: 'Reports', priority: 'high', title: 'Generate Standard Reports' },
  { id: 'TEST-RPT-002', section: 'Reports', priority: 'medium', title: 'Custom Report Builder' },
  { id: 'TEST-RPT-003', section: 'Reports', priority: 'high', title: 'Export Functionality' },
  { id: 'TEST-RPT-004', section: 'Reports', priority: 'medium', title: 'Scheduled Reports' },
  // Settings (3 tests)
  { id: 'TEST-SET-001', section: 'Settings', priority: 'high', title: 'User Profile Management' },
  { id: 'TEST-SET-002', section: 'Settings', priority: 'critical', title: 'System Configuration' },
  { id: 'TEST-SET-003', section: 'Settings', priority: 'high', title: 'Integration Settings' },
  // Notifications (3 tests)
  { id: 'TEST-NOT-001', section: 'Notifications', priority: 'high', title: 'In-App Notifications' },
  { id: 'TEST-NOT-002', section: 'Notifications', priority: 'medium', title: 'Email Notifications' },
  { id: 'TEST-NOT-003', section: 'Notifications', priority: 'medium', title: 'Notification Preferences' },
  // Performance (3 tests)
  { id: 'TEST-PERF-001', section: 'Performance', priority: 'critical', title: 'Page Load Times' },
  { id: 'TEST-PERF-002', section: 'Performance', priority: 'high', title: 'Concurrent Users' },
  { id: 'TEST-PERF-003', section: 'Performance', priority: 'high', title: 'Large Data Sets' },
  // Accessibility (3 tests)
  { id: 'TEST-ACC-001', section: 'Accessibility', priority: 'high', title: 'Keyboard Navigation' },
  { id: 'TEST-ACC-002', section: 'Accessibility', priority: 'high', title: 'Screen Reader Compatibility' },
  { id: 'TEST-ACC-003', section: 'Accessibility', priority: 'high', title: 'Color Contrast' },
  // Security (4 tests)
  { id: 'TEST-SEC-001', section: 'Security', priority: 'critical', title: 'SQL Injection' },
  { id: 'TEST-SEC-002', section: 'Security', priority: 'critical', title: 'Cross-Site Scripting (XSS)' },
  { id: 'TEST-SEC-003', section: 'Security', priority: 'critical', title: 'Authorization Bypass' },
  { id: 'TEST-SEC-004', section: 'Security', priority: 'critical', title: 'Secure Data Transmission' },
  // Browser (5 tests)
  { id: 'TEST-BROW-001', section: 'Browser', priority: 'high', title: 'Chrome Compatibility' },
  { id: 'TEST-BROW-002', section: 'Browser', priority: 'high', title: 'Firefox Compatibility' },
  { id: 'TEST-BROW-003', section: 'Browser', priority: 'medium', title: 'Safari Compatibility' },
  { id: 'TEST-BROW-004', section: 'Browser', priority: 'medium', title: 'Edge Compatibility' },
  { id: 'TEST-BROW-005', section: 'Browser', priority: 'high', title: 'Mobile Browser Testing' }
];

async function seedTestCases() {
  console.log('🌱 Seeding UAT test cases...\n');

  try {
    // Check if cases already exist
    const { count: existingCount } = await supabase
      .from('uat_cases')
      .select('*', { count: 'exact', head: true });

    if (existingCount > 0) {
      console.log(`⚠️  ${existingCount} test cases already exist in database`);
      const proceed = process.argv.includes('--force');
      if (!proceed) {
        console.log('Use --force to overwrite existing data');
        return;
      }
      console.log('Clearing existing test cases...');
      await supabase.from('uat_cases').delete().neq('id', '');
    }

    // Insert test cases in batches
    const batchSize = 10;
    let inserted = 0;

    for (let i = 0; i < testCases.length; i += batchSize) {
      const batch = testCases.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from('uat_cases')
        .insert(batch)
        .select();

      if (error) {
        console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error.message);
      } else {
        inserted += data.length;
        process.stdout.write(`\r📝 Inserted ${inserted}/${testCases.length} test cases`);
      }
    }

    console.log('\n');

    // Verify insertion
    const { count: finalCount } = await supabase
      .from('uat_cases')
      .select('*', { count: 'exact', head: true });

    // Get section breakdown
    const { data: sections } = await supabase
      .from('uat_cases')
      .select('section');

    const sectionCounts = {};
    sections?.forEach(s => {
      sectionCounts[s.section] = (sectionCounts[s.section] || 0) + 1;
    });

    console.log('✅ Seeding complete!\n');
    console.log('📊 Summary:');
    console.log(`   Total test cases: ${finalCount}`);
    console.log('\n📂 By Section:');
    Object.entries(sectionCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([section, count]) => {
        console.log(`   ${section}: ${count}`);
      });

    console.log('\n🚀 UAT system ready!');
    console.log('   Dashboard: http://localhost:3000/uat-dashboard');
    console.log('   Start testing with: node scripts/uat-wizard.js');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  }
}

seedTestCases();