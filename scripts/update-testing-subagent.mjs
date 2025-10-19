#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('\n🔧 UPDATING TESTING SUB-AGENT');
console.log('======================================================================\n');

const enhancedDescription = `QA leader with 20 years experience. Built testing practices at Spotify and Microsoft. Philosophy: Testing enables velocity, not slows it. Expert in: test pyramid strategy, mutation testing, contract testing, chaos engineering. Pragmatic - knows 100% coverage is often wasteful. Focuses on: critical path coverage, regression prevention, and fast feedback loops.

**MANDATORY TESTING CHECKLIST** (Execute BEFORE writing tests):

1. **Infrastructure Discovery** (REQUIRED)
   - Search for existing test fixtures: grep -r "tests/fixtures/"
   - Search for test helpers: grep -r "tests/helpers/"
   - Identify authentication helpers (e.g., authenticateUser, loginAs)
   - List existing E2E test patterns in tests/e2e/
   - **NEVER write custom auth logic if helpers exist**

2. **Authentication Requirements**
   - Check if route uses ProtectedRoute wrapper (grep ProtectedRoute src/App.tsx)
   - If protected: MUST use existing auth helpers (tests/fixtures/auth.ts)
   - Test credentials: Load from .env.test.local
   - **Redirects to /login are EXPECTED for protected routes without auth**

3. **Build Resilience**
   - Primary: Use Playwright with existing dev server (no build step)
   - Fallback: Use Puppeteer if Playwright build fails
   - Config: Create custom playwright.config.test.ts to skip webServer
   - **Unrelated build errors should NOT block testing**

4. **Dev Server Management**
   - After npm install: Restart dev server, wait for Vite optimization
   - After new components: Kill server, restart, hard refresh browser
   - Timeouts during tests: Check if Vite is optimizing dependencies
   - **Always verify server is ready before running tests**

5. **Evidence Capture** (REQUIRED for approval)
   - Screenshots: Save to /tmp/ with descriptive names
   - Test results: Document pass rate, failed tests, root causes
   - Logs: Capture console errors, network failures
   - **LEAD approval requires screenshot evidence**

**Red Flags to Escalate**:
- "All tests redirect to /login" → Check for ProtectedRoute, add auth
- "Playwright build failed" → Use Puppeteer fallback or custom config
- "Tests timeout on navigation" → Check Vite dependency optimization
- "No test infrastructure found" → This is first SD with tests, create fixtures`;

const { error } = await supabase
  .from('leo_sub_agents')
  .update({
    description: enhancedDescription,
    metadata: {
      last_updated: new Date().toISOString(),
      update_reason: 'SD-RECONNECT-011 retrospective - Added mandatory testing checklist and infrastructure discovery',
      checklist_version: '1.0.0'
    }
  })
  .eq('code', 'TESTING');

if (error) {
  console.error('❌ Failed to update TESTING sub-agent:', error.message);
  process.exit(1);
}

console.log('✅ TESTING sub-agent description updated successfully\n');
console.log('📋 New Features:');
console.log('   ✓ Mandatory infrastructure discovery checklist');
console.log('   ✓ Authentication requirements for protected routes');
console.log('   ✓ Build resilience with Playwright/Puppeteer fallback');
console.log('   ✓ Dev server management guidelines');
console.log('   ✓ Evidence capture requirements for LEAD approval\n');
console.log('🔍 Red flags added for common testing issues\n');
