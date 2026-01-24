#!/usr/bin/env node

/**
 * Add Multi-Application Testing Architecture Section to LEO Protocol
 *
 * Addresses critical documentation gap discovered during SD-QUALITY-001 execution:
 * - Two applications (EHG vs EHG_Engineer) have separate test suites
 * - Test location and execution context was not documented
 * - Caused confusion about test coverage and location
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const projectId = 'dedlbzhpgkmetvhbkyzq'; // EHG_Engineer database
const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) throw new Error('SUPABASE_DB_PASSWORD required');

async function addTestingArchitectureSection() {
  const pool = new Pool({
    host: 'aws-1-us-east-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: `postgres.${projectId}`,
    password: password,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  const client = await pool.connect();

  try {
    console.log('\n🧪 ADDING MULTI-APPLICATION TESTING ARCHITECTURE SECTION');
    console.log('═'.repeat(60));
    console.log();

    // Get active protocol
    const protocolResult = await client.query(`
      SELECT id, version FROM leo_protocols WHERE status = 'active' LIMIT 1
    `);

    if (protocolResult.rows.length === 0) {
      console.error('❌ No active protocol found');
      process.exit(1);
    }

    const protocol = protocolResult.rows[0];
    console.log(`📋 Active Protocol: ${protocol.version} (${protocol.id})\n`);

    await client.query('BEGIN');

    const section = {
      protocol_id: protocol.id,
      section_type: 'multi_application_testing_architecture',
      title: 'Multi-Application Testing Architecture',
      order_index: 98, // Place near EXEC implementation requirements
      content: `## 🧪 Multi-Application Testing Architecture

### Critical Context: Two Independent Test Suites

The EHG ecosystem consists of two separate applications with **independent test suites**:

#### 1. EHG_Engineer Application (Management Dashboard)
- **Test Location**: \`./tests/\`
- **Test Framework**: Vitest + Jest
- **Coverage Target**: 50% minimum for management features
- **Test Types**: Unit tests, integration tests for LEO Protocol
- **Run Command**: \`npm run test\` (from EHG_Engineer directory)
- **Purpose**: Testing SD management, PRD tracking, dashboard functionality

#### 2. EHG Application (Business Application)
- **Test Location**: \`../ehg/tests/\`
- **Test Framework**: Vitest (unit), Playwright (E2E)
- **Coverage Targets**:
  - Unit: 50% minimum
  - E2E: Comprehensive user flow coverage
  - A11y: WCAG 2.1 AA compliance
- **Test Types**:
  - \`tests/unit/\` - Vitest unit tests
  - \`tests/integration/\` - Integration tests
  - \`tests/e2e/\` - Playwright E2E tests
  - \`tests/a11y/\` - Accessibility tests
  - \`tests/security/\` - Security tests
  - \`tests/performance/\` - Performance tests
- **Run Commands**:
  - \`npm run test:unit\` - Unit tests with coverage
  - \`npm run test:integration\` - Integration tests
  - \`npm run test:e2e\` - Playwright E2E tests
  - \`npm run test:a11y\` - Accessibility tests
- **Purpose**: Testing customer-facing features, business logic, UX

### MANDATORY: Test Context Switching

**Before running ANY tests**, determine target application:

1. **Read SD Description** - Which application is mentioned?
2. **Navigate to Correct Directory**:
   \`\`\`bash
   # For EHG_Engineer tests:
   cd . && npm run test

   # For EHG application tests:
   cd ../ehg && npm run test:unit
   \`\`\`

3. **Verify Test Location**:
   - Wrong: "No tests found" error
   - Right: Tests execute in correct context

### Coverage Reporting Per Application

**Coverage metrics are INDEPENDENT** - report separately:

- **EHG_Engineer Coverage**: Dashboard/management features only
- **EHG Application Coverage**: Customer-facing features only

**DO NOT** combine coverage metrics across applications!

### Common Mistakes to Avoid

❌ **Assuming test location based on current directory**
✅ **Always verify target application from SD context**

❌ **Running tests in wrong application directory**
✅ **Navigate to correct app before test execution**

❌ **Combining coverage metrics across applications**
✅ **Report coverage per application separately**

❌ **Claiming "zero test coverage" without checking both apps**
✅ **Verify test suite in correct application first**

### Sub-Agent Context: QA Engineering Director

When QA sub-agent is triggered:
1. Determine target application from SD context
2. Navigate to correct test directory
3. Run appropriate test suite for that application
4. Report coverage for that application only
5. Document test location in handoffs

### Example: SD-QUALITY-001 Learning

**Original Claim**: "362,538 LOC with 6 test files (0.001% coverage)"

**Reality Check**:
- EHG application has 63 test files (not 6!)
- E2E, integration, a11y tests extensive
- **Actual gap**: Unit test coverage for business logic
- Lesson: Always verify test suite in correct application

**Corrected Scope**: "Unit test coverage gap in EHG application business logic"`,
      metadata: {
        category: 'testing_architecture',
        created_for: 'SD-QUALITY-001',
        addresses: 'multi-application confusion',
        impact: 'Prevents incorrect test coverage claims'
      }
    };

    const result = await client.query(`
      INSERT INTO leo_protocol_sections (
        protocol_id, section_type, title, order_index, content, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      section.protocol_id,
      section.section_type,
      section.title,
      section.order_index,
      section.content,
      JSON.stringify(section.metadata)
    ]);

    await client.query('COMMIT');

    console.log('✅ Protocol Section Added Successfully');
    console.log('═'.repeat(60));
    console.log('Section ID:', result.rows[0].id);
    console.log('Section Type:', section.section_type);
    console.log('Title:', section.title);
    console.log('Order Index:', section.order_index);
    console.log();
    console.log('🎯 NEXT STEPS:');
    console.log('   1. Run: node scripts/generate-claude-md-from-db.js');
    console.log('   2. Verify section appears in CLAUDE.md');
    console.log('   3. Update QA Engineering Director sub-agent context');
    console.log();

    process.exit(0);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Failed to add protocol section:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

addTestingArchitectureSection();
