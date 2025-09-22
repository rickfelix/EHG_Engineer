#!/usr/bin/env node

/**
 * Create PRD from Test Strategic Directive
 * PLAN Agent converting SD to technical PRD for Codex implementation
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRDFromSD(sdId) {
  console.log(chalk.blue('📋 PLAN AGENT: Creating PRD from Strategic Directive'));
  console.log(chalk.gray('─'.repeat(60)));

  try {
    // Fetch the SD
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      throw new Error(`Strategic Directive not found: ${sdId}`);
    }

    console.log(chalk.yellow('Strategic Directive:'));
    console.log(`  ID: ${chalk.white(sd.id)}`);
    console.log(`  Title: ${chalk.white(sd.title)}`);
    console.log(`  Intent: ${chalk.white(sd.strategic_intent)}`);

    // Create PRD ID
    const prdId = `PRD-CODEX-TEST-${Date.now()}`;

    // Build the PRD with detailed technical specifications
    const prd = {
      id: prdId,
      directive_id: sdId,
      title: `Technical Implementation: ${sd.title}`,
      version: '1.0',
      status: 'approved', // Ready for implementation
      category: 'feature',
      priority: 'medium',

      // Executive Summary
      executive_summary: `Implement a timestamp utility module as defined in ${sdId}. This will standardize timestamp formatting across the application.`,

      // Requirements
      functional_requirements: JSON.stringify([
        {
          id: 'FR-001',
          description: 'Create getTimestamp() function that returns current time in ISO 8601 format',
          priority: 'must-have'
        },
        {
          id: 'FR-002',
          description: 'Add formatTimestamp(date, format) function for custom formatting',
          priority: 'must-have'
        },
        {
          id: 'FR-003',
          description: 'Include getTimestampWithTimezone(timezone) for timezone-specific timestamps',
          priority: 'should-have'
        },
        {
          id: 'FR-004',
          description: 'Provide parseTimestamp(string) to parse timestamp strings',
          priority: 'nice-to-have'
        }
      ]),

      non_functional_requirements: JSON.stringify([
        {
          id: 'NFR-001',
          description: 'Functions must execute in under 1ms',
          priority: 'must-have'
        },
        {
          id: 'NFR-002',
          description: 'Must work in Node.js 14+',
          priority: 'must-have'
        },
        {
          id: 'NFR-003',
          description: 'Zero external dependencies',
          priority: 'must-have'
        }
      ]),

      technical_requirements: JSON.stringify([
        {
          id: 'TR-001',
          description: 'Use Node.js built-in Date API',
          technology: 'Node.js'
        },
        {
          id: 'TR-002',
          description: 'Export as CommonJS and ES Module',
          technology: 'JavaScript'
        },
        {
          id: 'TR-003',
          description: 'Include JSDoc documentation',
          technology: 'Documentation'
        }
      ]),

      // Implementation Details
      implementation_approach: `
1. Create src/utils/timestamp.js with the following structure:
   - Main exports: getTimestamp(), formatTimestamp(), getTimestampWithTimezone(), parseTimestamp()
   - Use Date.prototype.toISOString() for default formatting
   - Implement custom format string parser for formatTimestamp()
   - Handle timezone conversion using Intl.DateTimeFormat

2. Create src/utils/timestamp.test.js with tests for:
   - Default ISO 8601 formatting
   - Custom format strings
   - Timezone handling
   - Edge cases (invalid dates, null inputs)

3. Update existing logging utilities to use new timestamp functions
      `,

      technology_stack: JSON.stringify([
        'Node.js (built-in Date API)',
        'JavaScript ES6+',
        'Jest for testing'
      ]),

      dependencies: JSON.stringify([]),

      // Testing
      test_scenarios: JSON.stringify([
        {
          name: 'Default timestamp',
          description: 'getTimestamp() returns valid ISO 8601 string',
          expected: 'String matching YYYY-MM-DDTHH:mm:ss.sssZ'
        },
        {
          name: 'Custom format',
          description: 'formatTimestamp() applies custom format correctly',
          input: 'new Date(), "YYYY-MM-DD"',
          expected: 'Date string in specified format'
        },
        {
          name: 'Timezone handling',
          description: 'getTimestampWithTimezone() returns correct time for timezone',
          input: '"America/New_York"',
          expected: 'Timestamp in EST/EDT'
        },
        {
          name: 'Parse timestamp',
          description: 'parseTimestamp() correctly parses ISO string',
          input: '"2024-01-01T12:00:00Z"',
          expected: 'Valid Date object'
        }
      ]),

      acceptance_criteria: JSON.stringify([
        'All four functions are implemented and exported',
        'All test scenarios pass',
        'JSDoc documentation is complete',
        'No external dependencies added',
        'Performance meets NFR requirements'
      ]),

      // Checklists for execution
      exec_checklist: JSON.stringify([
        {
          task: 'Create src/utils/timestamp.js file',
          completed: false
        },
        {
          task: 'Implement getTimestamp() function',
          completed: false
        },
        {
          task: 'Implement formatTimestamp() function',
          completed: false
        },
        {
          task: 'Implement getTimestampWithTimezone() function',
          completed: false
        },
        {
          task: 'Implement parseTimestamp() function',
          completed: false
        },
        {
          task: 'Add JSDoc documentation',
          completed: false
        },
        {
          task: 'Create src/utils/timestamp.test.js',
          completed: false
        },
        {
          task: 'Write unit tests for all functions',
          completed: false
        },
        {
          task: 'Update logging utilities to use timestamp module',
          completed: false
        }
      ]),

      // Progress tracking
      progress: 0,
      phase: 'implementation'
    };

    // Insert PRD into database
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .insert(prd)
      .select()
      .single();

    if (prdError) throw prdError;

    console.log(chalk.green('\n✅ PRD created successfully!'));

    console.log(chalk.yellow('\nPRD Details:'));
    console.log(`  ID: ${chalk.white(prdData.id)}`);
    console.log(`  Title: ${chalk.white(prdData.title)}`);
    console.log(`  Status: ${chalk.white(prdData.status)}`);

    console.log(chalk.yellow('\nFunctional Requirements:'));
    const funcReqs = JSON.parse(prdData.functional_requirements);
    funcReqs.forEach(req => {
      console.log(`  - ${chalk.white(req.id)}: ${req.description}`);
    });

    console.log(chalk.yellow('\nImplementation Checklist:'));
    const checklist = JSON.parse(prdData.exec_checklist);
    console.log(`  ${chalk.white(checklist.length)} tasks defined for implementation`);

    console.log(chalk.blue('\n═══════════════════════════════════════════════════════'));
    console.log(chalk.blue.bold('🚀 PRD READY FOR CODEX IMPLEMENTATION'));
    console.log(chalk.blue('═══════════════════════════════════════════════════════'));

    console.log(chalk.green('\nNext Step:'));
    console.log(chalk.white(`  node scripts/generate-codex-prompt.js ${prdData.id}`));

    return prdData;

  } catch (error) {
    console.error(chalk.red('❌ Error creating PRD:'), error.message);
    throw error;
  }
}

// Get SD ID from command line
const sdId = process.argv[2] || 'SD-TEST-CODEX-1758340937843';

// Execute
createPRDFromSD(sdId)
  .then(prd => {
    console.log(chalk.gray('\n[PLAN Agent work complete]'));
    process.exit(0);
  })
  .catch(error => {
    process.exit(1);
  });