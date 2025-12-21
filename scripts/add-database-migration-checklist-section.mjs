import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function addSections() {
  console.log('📝 Adding Database Migration Checklist and Playwright sections to leo_protocol_sections...\n');

  // Section 1: Database Migration Pre-Flight Checklist
  const section1 = {
    protocol_id: 'leo-v4-2-0-story-gates',
    title: 'Database Migration Pre-Flight Checklist',
    section_type: 'guide',
    order_index: 2347, // Insert before existing Database Migration Validation section
    content: `## 🚨 MANDATORY: Database Migration Pre-Flight Checklist

### BEFORE Attempting ANY Database Migration

**CRITICAL**: Read the established Database Sub-Agent pattern FIRST. Do NOT trial-and-error.

**Evidence**: SD-AGENT-MIGRATION-001 - Attempted migrations with wrong region (aws-0 vs aws-1), incorrect SSL parameters, and manual psql commands before reading the established pattern. User had to redirect: "Before you blindly go trying things to solve problems, why don't you take a smart approach and make sure you fully understand what is described in the Supabase database sub-agent?"

#### Step 1: Read the Established Pattern (5 minutes)
- [ ] Read \`/mnt/c/_EHG/EHG/scripts/lib/supabase-connection.js\` (198 lines)
- [ ] Read reference implementation: \`scripts/database-subagent-apply-agent-admin-migration.js\`
- [ ] Understand: Region (aws-1), SSL config, connection format, helper functions

#### Step 2: Verify Connection Parameters
- [ ] **Region**: aws-1-us-east-1 (NOT aws-0)
- [ ] **Port**: 5432 (Transaction Mode)
- [ ] **SSL**: \`{ rejectUnauthorized: false }\` (NO ?sslmode=require)
- [ ] **Password**: From .env (SUPABASE_DB_PASSWORD or EHG_DB_PASSWORD)
- [ ] **Format**: \`postgresql://postgres.PROJECT_ID:PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres\`

#### Step 3: Use Helper Functions (ALWAYS)
- [ ] Import: \`import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js'\`
- [ ] Connect: \`const client = await createDatabaseClient('ehg', { verify: true, verbose: true })\`
- [ ] Parse: \`const statements = splitPostgreSQLStatements(sql)\` (handles $$ delimiters)
- [ ] Transaction: \`BEGIN\`, execute statements, \`COMMIT\` or \`ROLLBACK\`

#### Step 4: Validate Migration File
- [ ] No cross-schema foreign keys (REFERENCES auth.users, etc.)
- [ ] RLS policies use auth.uid() only (no FROM/JOIN auth.users)
- [ ] PostgreSQL syntax correct (CREATE POLICY does NOT support IF NOT EXISTS)
- [ ] Use DROP POLICY IF EXISTS + CREATE POLICY instead

#### Step 5: Handle Conflicts
- [ ] Check for existing tables with same names (different schemas)
- [ ] Drop old tables if System A/B migration (use CASCADE carefully)
- [ ] Verify seed data inserts (ON CONFLICT DO NOTHING)

### Example Template
\`\`\`javascript
#!/usr/bin/env node
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import { readFileSync } from 'fs';

async function applyMigration() {
  const client = await createDatabaseClient('ehg', {
    verify: true,
    verbose: true
  });

  try {
    const sql = readFileSync('migration.sql', 'utf-8');
    const statements = splitPostgreSQLStatements(sql);

    await client.query('BEGIN');

    for (const stmt of statements) {
      try {
        await client.query(stmt);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('Skipped (exists)');
        } else {
          throw error;
        }
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

applyMigration().catch(err => process.exit(1));
\`\`\`

### Anti-Patterns to AVOID
- ❌ Using psql directly without understanding connection format
- ❌ Trial-and-error with different regions/ports/SSL settings
- ❌ Creating migration scripts without reading lib/supabase-connection.js
- ❌ Not using splitPostgreSQLStatements() for complex SQL
- ❌ Not handling "already exists" errors gracefully`,
    metadata: {
      evidence_sd: 'SD-AGENT-MIGRATION-001',
      lesson_learned: 'Always read established Database Sub-Agent pattern before attempting migrations',
      time_saved: '30-60 minutes per migration (avoids trial-and-error)'
    }
  };

  // Section 2: Playwright Server Management
  const section2 = {
    protocol_id: 'leo-v4-2-0-story-gates',
    title: 'Playwright Server Management Best Practice',
    section_type: 'guide',
    order_index: 996, // Insert after QA Engineering Director Key Principle
    content: `### Best Practice: Playwright-Managed Dev Server

**Evidence**: SD-AGENT-MIGRATION-001 - Started dev server manually on port 8080, but Playwright expected port 5173 (configured in playwright.config.ts). Tests failed due to port mismatch. Solution: Let Playwright manage the dev server.

**DO NOT** manually start dev servers before E2E tests. Let Playwright manage it.

#### Configuration (playwright.config.ts)
\`\`\`typescript
webServer: {
  command: 'npm run dev -- --port 5173',
  port: 5173,
  reuseExistingServer: true,  // Reuse if already running
  timeout: 120_000,            // 2 min startup timeout
}
\`\`\`

#### Why This Works
- **Consistent Port**: All tests use same port (5173)
- **Auto-Lifecycle**: Server starts before tests, stops after
- **CI/CD Compatible**: Works in automated environments
- **Local Dev Friendly**: \`reuseExistingServer\` prevents killing your dev server

#### Anti-Patterns
- ❌ Starting dev server manually on different port (8080)
- ❌ Forgetting to stop old servers (port conflicts)
- ❌ Hardcoding URLs without using \`baseURL\` from config
- ❌ Running tests while manually managing server lifecycle

#### Example Test Run
\`\`\`bash
# Playwright handles everything
npm run test:e2e

# Playwright:
# 1. Checks if server already running on 5173
# 2. Starts server if needed: npm run dev -- --port 5173
# 3. Waits for server to be ready
# 4. Runs tests
# 5. Keeps server running (reuseExistingServer: true)
\`\`\`

#### Manual Server Check (if needed)
\`\`\`bash
# Kill old servers
lsof -i :5173 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Let Playwright manage
npm run test:e2e
\`\`\``,
    metadata: {
      evidence_sd: 'SD-AGENT-MIGRATION-001',
      lesson_learned: 'Let Playwright manage dev server for consistent port and lifecycle',
      sub_agent: 'QA Engineering Director'
    }
  };

  // Insert sections
  const { data: data1, error: error1 } = await supabase
    .from('leo_protocol_sections')
    .insert(section1)
    .select();

  if (error1) {
    console.error('❌ Error inserting Database Migration Checklist:', error1);
    return;
  }

  console.log('✅ Database Migration Pre-Flight Checklist added to database');
  console.log(`   ID: ${data1[0].id}`);

  const { data: data2, error: error2 } = await supabase
    .from('leo_protocol_sections')
    .insert(section2)
    .select();

  if (error2) {
    console.error('❌ Error inserting Playwright section:', error2);
    return;
  }

  console.log('✅ Playwright Server Management section added to database');
  console.log(`   ID: ${data2[0].id}`);

  console.log('\n🎯 Next Step: Regenerate CLAUDE.md from database');
  console.log('   Run: node scripts/generate-claude-md-from-db.js\n');
}

addSections();
