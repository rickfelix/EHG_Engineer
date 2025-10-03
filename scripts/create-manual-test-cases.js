#!/usr/bin/env node

/**
 * Create Manual UAT Test Cases
 * These are separate from the automated tests
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function createManualTestCases() {
  console.log(chalk.cyan.bold('\n🆕 Creating Manual UAT Test Cases\n'));
  console.log(chalk.gray('These are human-focused tests for manual execution'));
  console.log(chalk.gray('=' .repeat(60)));

  // Define manual test cases - focused on user experience and edge cases
  const manualTestCases = [
    // Manual Login Tests
    {
      id: 'MANUAL-AUTH-001',
      section: 'Manual_Authentication',
      title: 'Login with remember me checked - Verify functionality',
      priority: 'high',
      test_type: 'manual',
      description: 'Navigate to login page, check "Remember Me" checkbox, enter valid credentials, login. Close browser completely, reopen, navigate to app URL. Verify auto-login or pre-filled credentials.'
    },
    {
      id: 'MANUAL-AUTH-002',
      section: 'Manual_Authentication',
      title: 'Login with caps lock warning when typing password',
      priority: 'medium',
      test_type: 'manual',
      description: 'Click password field, turn on Caps Lock, start typing. Verify warning message appears near password field indicating Caps Lock is on.'
    },
    {
      id: 'MANUAL-AUTH-003',
      section: 'Manual_Authentication',
      title: 'Browser back button after login - Cannot go back',
      priority: 'critical',
      test_type: 'manual',
      description: 'Login successfully, wait for dashboard to load. Click browser back button. Verify user cannot return to login page and remains on dashboard or gets redirected.'
    },

    // Manual Visual Tests
    {
      id: 'MANUAL-UI-001',
      section: 'Manual_UI_Visual',
      title: 'Logo and branding displays correctly with proper sizing',
      priority: 'high',
      test_type: 'manual',
      description: 'Check all pages for company logo visibility. Verify logo is not stretched, pixelated, or cut off. Check logo appears in header, login page, and any branded areas.'
    },
    {
      id: 'MANUAL-UI-002',
      section: 'Manual_UI_Visual',
      title: 'Dark mode toggle works smoothly without flashing',
      priority: 'medium',
      test_type: 'manual',
      description: 'Toggle dark mode on/off multiple times. Verify smooth transition without white flash, all text remains readable, charts/graphs adapt colors appropriately.'
    },
    {
      id: 'MANUAL-UI-003',
      section: 'Manual_UI_Visual',
      title: 'Responsive layout adapts to mobile view properly',
      priority: 'critical',
      test_type: 'manual',
      description: 'Resize browser window to mobile size (375px). Verify navigation collapses to hamburger menu, content stacks vertically, no horizontal scroll appears, all buttons remain clickable.'
    },

    // Manual User Experience Tests
    {
      id: 'MANUAL-UX-001',
      section: 'Manual_User_Experience',
      title: 'Form validation messages are clear and helpful',
      priority: 'high',
      test_type: 'manual',
      description: 'Submit forms with invalid data (wrong email format, short passwords, missing required fields). Verify error messages clearly explain what needs to be fixed.'
    },
    {
      id: 'MANUAL-UX-002',
      section: 'Manual_User_Experience',
      title: 'Loading states appear during slow operations',
      priority: 'medium',
      test_type: 'manual',
      description: 'Trigger data-heavy operations (large report generation, bulk updates). Verify loading spinner/skeleton screens appear, user cannot click submit twice, clear indication of progress.'
    },
    {
      id: 'MANUAL-UX-003',
      section: 'Manual_User_Experience',
      title: 'Tooltips and help text provide useful information',
      priority: 'low',
      test_type: 'manual',
      description: 'Hover over icons, form fields with (?) symbols, complex features. Verify tooltips appear with helpful context, positioned correctly, disappear when moving away.'
    },

    // Manual Data Entry Tests
    {
      id: 'MANUAL-DATA-001',
      section: 'Manual_Data_Entry',
      title: 'Copy/paste works in all input fields (ctrl+v)',
      priority: 'high',
      test_type: 'manual',
      description: 'Copy text from external source (notepad, email). Paste into various form fields using Ctrl+V and right-click paste. Verify all fields accept pasted content correctly.'
    },
    {
      id: 'MANUAL-DATA-002',
      section: 'Manual_Data_Entry',
      title: 'Special characters (!@#$%^&*) handled correctly',
      priority: 'critical',
      test_type: 'manual',
      description: 'Enter special characters in name fields, descriptions, search boxes. Verify characters display correctly, no SQL errors, search works with special chars, data saves and retrieves properly.'
    },
    {
      id: 'MANUAL-DATA-003',
      section: 'Manual_Data_Entry',
      title: 'Tab order follows logical flow through forms',
      priority: 'medium',
      test_type: 'manual',
      description: 'Click first form field, press Tab repeatedly. Verify cursor moves through fields in logical order (top to bottom, left to right), skips disabled fields, includes all buttons.'
    },

    // Manual Browser-Specific Tests
    {
      id: 'MANUAL-BROWSER-001',
      section: 'Manual_Browser',
      title: 'Browser refresh (F5) maintains login and data state',
      priority: 'critical',
      test_type: 'manual',
      description: 'Login, navigate to a page with unsaved form data. Press F5 to refresh. Verify user stays logged in, form data persists or user is warned about losing unsaved changes.'
    },
    {
      id: 'MANUAL-BROWSER-002',
      section: 'Manual_Browser',
      title: 'Multiple tabs stay in sync when using app',
      priority: 'high',
      test_type: 'manual',
      description: 'Open app in two browser tabs. Make changes in one tab (create record, update settings). Verify other tab reflects changes after refresh or automatically if real-time sync exists.'
    },
    {
      id: 'MANUAL-BROWSER-003',
      section: 'Manual_Browser',
      title: 'Browser zoom (ctrl +/-) maintains usable layout',
      priority: 'low',
      test_type: 'manual',
      description: 'Zoom browser to 50%, 150%, 200% using Ctrl+/- keys. Verify layout remains usable, text scales properly, no overlapping elements, horizontal scroll appears appropriately.'
    }
  ];

  console.log(chalk.yellow(`\n📝 Creating ${manualTestCases.length} manual test cases...`));

  // Insert manual test cases
  const { data, error } = await supabase
    .from('uat_cases')
    .insert(manualTestCases)
    .select();

  if (error) {
    if (error.message.includes('duplicate')) {
      console.log(chalk.yellow('⚠️  Manual test cases already exist'));
      console.log(chalk.gray('   (This is OK - they were created previously)'));
    } else {
      console.error(chalk.red('❌ Error:'), error.message);
      return;
    }
  } else {
    console.log(chalk.green(`✅ Created ${data.length} manual test cases!`));
  }

  // Show summary
  const sections = [...new Set(manualTestCases.map(t => t.section))];

  console.log(chalk.yellow('\n📊 Manual Test Cases Summary:'));
  sections.forEach(section => {
    const count = manualTestCases.filter(t => t.section === section).length;
    const sectionName = section.replace('Manual_', '').replace(/_/g, ' ');
    console.log(chalk.white(`  ${sectionName}: ${count} tests`));
  });

  const priorities = {
    critical: manualTestCases.filter(t => t.priority === 'critical').length,
    high: manualTestCases.filter(t => t.priority === 'high').length,
    medium: manualTestCases.filter(t => t.priority === 'medium').length,
    low: manualTestCases.filter(t => t.priority === 'low').length
  };

  console.log(chalk.yellow('\n🎯 Priority Breakdown:'));
  console.log(chalk.red(`  Critical: ${priorities.critical}`));
  console.log(chalk.yellow(`  High:     ${priorities.high}`));
  console.log(chalk.blue(`  Medium:   ${priorities.medium}`));
  console.log(chalk.gray(`  Low:      ${priorities.low}`));

  console.log(chalk.cyan('\n' + '═'.repeat(60)));
  console.log(chalk.green('✨ Manual test cases created!'));
  console.log(chalk.yellow('\n📋 What\'s Different About These Tests:'));
  console.log(chalk.white('• Focus on user experience, not just functionality'));
  console.log(chalk.white('• Test visual elements and interactions'));
  console.log(chalk.white('• Check edge cases and browser-specific behavior'));
  console.log(chalk.white('• Require human judgment (colors, layouts, UX)'));

  console.log(chalk.yellow('\n🎯 To View Your Tests:'));
  console.log(chalk.white('1. Go to: http://localhost:3000/uat-dashboard'));
  console.log(chalk.white('2. Use filters to find "MANUAL-" tests'));
  console.log(chalk.white('3. Or search for "Manual" in the search box'));

  console.log(chalk.yellow('\n🧪 To Execute Manual Tests:'));
  console.log(chalk.white('Run: node scripts/simple-uat-test.js'));
  console.log(chalk.white('Then enter a test ID like: MANUAL-AUTH-001'));
  console.log(chalk.cyan('═'.repeat(60) + '\n'));
}

// Run
createManualTestCases().catch(console.error);