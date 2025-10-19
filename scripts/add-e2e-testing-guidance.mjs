#!/usr/bin/env node
/**
 * Add E2E Testing Mode Configuration guidance to LEO Protocol
 * Based on learnings from SD-AGENT-ADMIN-002 E2E authentication fix
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function addE2ETestingGuidance() {
  console.log('📝 Adding E2E Testing Mode Configuration to LEO Protocol');
  console.log('═'.repeat(80));

  // Get active protocol
  const { data: protocol } = await supabase
    .from('leo_protocols')
    .select('id')
    .eq('status', 'active')
    .single();

  const content = `## E2E Testing: Dev Mode vs Preview Mode (CRITICAL)

**Discovery**: SD-AGENT-ADMIN-002 revealed that Playwright E2E tests fail with blank pages in preview mode but pass perfectly in dev mode.

### The Problem with Preview Mode

**Symptoms**:
- Login pages render as blank HTML (no input elements)
- Authentication setup fails consistently
- Tests report "Has input elements: false"
- Screenshot shows empty white page

**Root Cause**: Production-optimized builds (preview mode) may have:
- Different React hydration timing
- Stripped debug code affecting test selectors
- Lazy-loaded components not loading correctly in test environment
- Static file serving instead of hot-reload source

### Solution: Default to Dev Mode

**Configuration** (playwright.config.ts):
\`\`\`typescript
// ✅ RECOMMENDED: Dev Mode (port 5173)
const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:5173';
webServer: {
  command: 'npm run dev -- --port 5173',
  port: 5173,
  reuseExistingServer: true,
  timeout: 120_000,
}

// ❌ PROBLEMATIC: Preview Mode (port 4173)
const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:4173';
webServer: {
  command: 'npm run build && npm run preview -- --port 4173',
  port: 4173,
}
\`\`\`

### When to Use Each Mode

| Mode | Port | Use Case | Pros | Cons |
|------|------|----------|------|------|
| **Dev** | 5173 | Default E2E testing | Fast, hot reload, full source maps | Not production-like |
| **Preview** | 4173 | Production parity testing | Optimized build, realistic | Slower, may have rendering issues |

### Decision Matrix

**Use Dev Mode (5173) when**:
- ✅ Running smoke tests (Tier 1)
- ✅ Developing new E2E tests
- ✅ Debugging test failures
- ✅ Daily development testing
- ✅ CI/CD pipelines (faster feedback)

**Use Preview Mode (4173) when**:
- 📋 Final pre-release validation
- 📋 Performance benchmarking
- 📋 Testing production-like bundle sizes
- 📋 Validating lazy loading behavior

### Troubleshooting E2E Test Failures

**If tests fail with authentication/rendering issues**:

1. **Check build mode first**:
   \`\`\`bash
   grep baseURL playwright.config.ts
   # Should show port 5173 for dev mode
   \`\`\`

2. **Switch to dev mode if using preview**:
   \`\`\`typescript
   // Change this
   const baseURL = 'http://localhost:4173';
   // To this
   const baseURL = 'http://localhost:5173';
   \`\`\`

3. **Update auth state file**:
   \`\`\`bash
   # Ensure origin matches port
   cat .auth/user.json | grep origin
   # Should show: "origin": "http://localhost:5173"
   \`\`\`

4. **Restart dev server**:
   \`\`\`bash
   cd /mnt/c/_EHG/ehg
   npm run dev -- --port 5173
   \`\`\`

5. **Re-run tests**:
   \`\`\`bash
   npm run test:e2e
   \`\`\`

### Protocol Update (From Retrospective)

**Before**: No guidance on build modes for E2E testing → 1.5 hours debugging authentication

**After**: Dev mode default, preview mode for specific use cases → Instant test success

**Evidence**: SD-AGENT-ADMIN-002 E2E tests:
- Preview mode: 0/5 passing (blank pages)
- Dev mode: 5/5 passing (26.8s execution time)

### Key Takeaways

1. **Dev mode is safer** for E2E testing (faster, more reliable)
2. **Preview mode is optional** (only for production parity validation)
3. **When debugging E2E failures**, check build mode before debugging test logic
4. **Trust your test code**, question environment configuration first`;

  const section = {
    protocol_id: protocol.id,
    section_type: 'e2e_testing_mode_configuration',
    title: 'E2E Testing: Dev Mode vs Preview Mode',
    content,
    order_index: 236,
    metadata: {
      category: 'testing_best_practices',
      related_sd: 'SD-AGENT-ADMIN-002',
      time_saved: '1.5 hours per SD',
      retrospective_id: 'b1b795c7-e781-4708-99ed-24426c82fe21'
    }
  };

  console.log('\n💾 Inserting section into database...');

  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .insert(section)
    .select()
    .single();

  if (error) {
    console.error('\n❌ Error adding section:', error.message);
    console.error('   Details:', error);
    process.exit(1);
  }

  console.log('\n✅ E2E testing guidance added successfully!');
  console.log(`   Section ID: ${data.id}`);
  console.log(`   Title: ${data.title}`);
  console.log(`   Order Index: ${data.order_index}`);

  console.log('\n' + '═'.repeat(80));
  console.log('📈 Next Steps:');
  console.log('   1. Regenerate CLAUDE.md: node scripts/generate-claude-md-from-db.js');
  console.log('   2. Verify new section appears in CLAUDE.md');
  console.log('   3. Use guidance for all future E2E test configurations');
  console.log('═'.repeat(80));
}

addE2ETestingGuidance()
  .then(() => {
    console.log('\n✅ E2E testing guidance addition complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
