#!/usr/bin/env node

/**
 * Update Test Cases with New Section Mappings
 * Maps old section categories to new sidebar navigation structure
 */

// import { createClient } from '@supabase/supabase-js'; // Unused
import chalk from 'chalk';
import pg from 'pg';

const { Client } = pg;

// Section mapping from old to new
const SECTION_MAPPING = {
  // Authentication & Auth Flow tests
  'auth': 'authentication',
  'auth_flow': 'authentication',

  // Manual Authentication
  'Manual_Authentication': 'authentication',

  // Visual and UI tests
  'Manual_UI_Visual': 'ui_visual',

  // User Experience tests
  'Manual_User_Experience': 'user_experience',

  // Data Entry tests
  'Manual_Data_Entry': 'data_entry',

  // Browser tests
  'Manual_Browser': 'browser',

  // Dashboard tests
  'dashboard': 'console',

  // EVA tests
  'eva': 'eva',

  // Ventures tests
  'ventures': 'ventures',

  // Portfolio tests
  'portfolios': 'portfolios',

  // Landing page tests
  'landing': 'other',

  // Analytics & reporting
  'analytics': 'ai_analytics',
  'executiveReporting': 'ai_analytics',

  // AI Agent tests
  'aiAgents': 'ai_agents',

  // Governance & security tests
  'governance': 'security',
  'security': 'security',

  // Performance tests
  'performance': 'performance',

  // Team & collaboration
  'team': 'other',

  // Settings
  'settings': 'other',

  // Workflows
  'workflows': 'ai_workflows',

  // General/Other
  'poc_authenticated': 'other',
  'venture_lifecycle': 'ventures'
};

async function updateSections() {
  console.log(chalk.cyan.bold('\n🔄 Updating Test Case Sections\n'));
  console.log(chalk.gray('=' .repeat(60)));

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL ||
      'postgresql://postgres.dedlbzhpgkmetvhbkyzq:Fl%21M32DaM00n%211@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require',
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log(chalk.green('✅ Connected to database'));

    // Get current sections
    const currentResult = await client.query(`
      SELECT DISTINCT section, COUNT(*) as count
      FROM uat_cases
      GROUP BY section
      ORDER BY section
    `);

    console.log(chalk.yellow('\n📊 Current Sections:'));
    currentResult.rows.forEach(row => {
      console.log(chalk.white(`  ${row.section}: ${row.count} tests`));
    });

    // Update sections based on mapping
    console.log(chalk.cyan('\n🔄 Applying section mappings...'));

    for (const [oldSection, newSection] of Object.entries(SECTION_MAPPING)) {
      const updateResult = await client.query(
        'UPDATE uat_cases SET section = $1 WHERE section = $2',
        [newSection, oldSection]
      );

      if (updateResult.rowCount > 0) {
        console.log(chalk.green(`  ✅ Updated ${updateResult.rowCount} tests from '${oldSection}' to '${newSection}'`));
      }
    }

    // Get updated sections
    const updatedResult = await client.query(`
      SELECT DISTINCT section, COUNT(*) as count
      FROM uat_cases
      GROUP BY section
      ORDER BY section
    `);

    console.log(chalk.yellow('\n📊 Updated Sections:'));
    updatedResult.rows.forEach(row => {
      const sectionLabel = row.section.replace(/_/g, ' ');
      console.log(chalk.white(`  ${sectionLabel}: ${row.count} tests`));
    });

    // Show categorized breakdown
    console.log(chalk.cyan('\n📁 Categorized Breakdown:'));

    const categories = {
      'Main': ['chairman', 'console', 'eva', 'assistant', 'ventures', 'portfolios'],
      'AI Orchestration': ['ai_agents', 'ai_workflows', 'ai_analytics'],
      'General': ['authentication', 'ui_visual', 'user_experience', 'data_entry', 'browser', 'performance', 'security', 'other']
    };

    for (const [category, sections] of Object.entries(categories)) {
      console.log(chalk.yellow(`\n  ${category}:`));

      for (const section of sections) {
        const countResult = await client.query(
          'SELECT COUNT(*) as count FROM uat_cases WHERE section = $1',
          [section]
        );
        const count = countResult.rows[0].count;

        if (count > 0) {
          const sectionLabel = section.replace(/_/g, ' ');
          console.log(chalk.white(`    ${sectionLabel}: ${count} tests`));
        }
      }
    }

  } catch (_error) {
    console.error(chalk.red('❌ Error:'), error.message);
  } finally {
    await client.end();
    console.log(chalk.cyan('\n═'.repeat(60)));
    console.log(chalk.green('✨ Section update complete!'));
    console.log(chalk.yellow('\n🎯 Next Steps:'));
    console.log(chalk.white('1. Rebuild the application: npm run build:client'));
    console.log(chalk.white('2. Restart the server'));
    console.log(chalk.white('3. Test the new Create Test Case feature'));
    console.log(chalk.cyan('═'.repeat(60) + '\n'));
  }
}

// Run
updateSections().catch(console.error);