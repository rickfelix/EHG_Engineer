#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const updatedContent = `### Best Practice: Playwright-Managed Dev Server

**Evidence**: SD-AGENT-MIGRATION-001 - Always let Playwright manage the dev server lifecycle for consistent port and automated testing workflows.

**DO NOT** manually start dev servers before E2E tests. Let Playwright manage it.

#### Configuration (playwright.config.ts)
\`\`\`typescript
webServer: {
  command: 'npm run dev -- --port 8080',
  port: 8080,
  reuseExistingServer: true,  // Reuse if already running
  timeout: 120_000,            // 2 min startup timeout
}
\`\`\`

#### Why This Works
- **Consistent Port**: All tests use same port (8080)
- **Auto-Lifecycle**: Server starts before tests, stops after
- **CI/CD Compatible**: Works in automated environments
- **Local Dev Friendly**: \`reuseExistingServer\` prevents killing your dev server

#### Anti-Patterns
- ❌ Starting dev server manually on inconsistent ports
- ❌ Forgetting to stop old servers (port conflicts)
- ❌ Hardcoding URLs without using \`baseURL\` from config
- ❌ Running tests while manually managing server lifecycle

#### Example Test Run
\`\`\`bash
# Playwright handles everything
npm run test:e2e

# Playwright:
# 1. Checks if server already running on 8080
# 2. Starts server if needed: npm run dev -- --port 8080
# 3. Waits for server to be ready
# 4. Runs tests
# 5. Keeps server running (reuseExistingServer: true)
\`\`\`

#### Manual Server Check (if needed)
\`\`\`bash
# Kill old servers
lsof -i :8080 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Let Playwright manage
npm run test:e2e
\`\`\``;

async function updatePlaywrightSection() {
  console.log('📝 Updating Playwright Server Management section to use port 8080...\n');

  const { error } = await supabase
    .from('leo_protocol_sections')
    .update({ content: updatedContent })
    .eq('id', 41);

  if (error) {
    console.error('❌ Error updating section:', error);
    process.exit(1);
  }

  console.log('✅ Updated Playwright Server Management section (ID: 41) to use port 8080');
  console.log('\n🎯 Next Step: Regenerate CLAUDE.md from database');
  console.log('   Run: node scripts/generate-claude-md-from-db.js\n');
}

updatePlaywrightSection();
