#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function findAndCompressFinal() {
  const { data: sections } = await supabase
    .from('leo_protocol_sections')
    .select('id, title, content')
    .eq('protocol_id', 'leo-v4-2-0-story-gates');

  const toCompress = [
    {
      title: '📚 Documentation Platform Integration (SD-DOCUMENTATION-001)',
      compressed: `**Documentation Platform**: AI Documentation Generation System (SD-041C) integrated into LEO Protocol.

**Automatic Triggers**: SD completion, EXEC→PLAN handoff, retrospective creation

**EXEC Requirement**: Before EXEC→PLAN handoff, generate documentation:
\`\`\`bash
node scripts/generate-workflow-docs.js --sd-id <SD-ID>
\`\`\`

**Dashboard**: Navigate to \`/ai-docs-admin\` to review and publish

**Complete Guide**: See \`docs/reference/documentation-platform.md\``
    },
    {
      title: 'E2E Testing: Dev Mode vs Preview Mode (CRITICAL)',
      compressed: `**E2E Testing Mode**: Default to dev mode (port 5173) for reliable tests.

**Problem**: Preview mode (port 4173) may have blank page rendering issues
**Solution**: Use dev mode for E2E tests, preview only for production validation

\`\`\`typescript
// playwright.config.ts
const baseURL = 'http://localhost:5173';  // Dev mode
webServer: { command: 'npm run dev -- --port 5173', port: 5173 }
\`\`\`

**Complete Guide**: See \`docs/reference/e2e-testing-modes.md\``
    },
    {
      title: '🧪 Multi-Application Testing Architecture',
      compressed: `**Multi-App Testing**: Two independent test suites for two applications.

**EHG_Engineer** (dashboard): Vitest + Jest, 50% coverage target
**EHG** (business app): Vitest (unit) + Playwright (E2E), comprehensive coverage

**MANDATORY**: Determine target app from SD context before running tests

**Complete Guide**: See \`docs/reference/multi-app-testing.md\``
    },
    {
      title: '🔐 Handoff Creation: RLS Bypass Pattern',
      compressed: `**Handoff RLS Bypass**: Use direct PostgreSQL connection to bypass RLS policies.

**Problem**: \`sd_phase_handoffs\` table RLS blocks INSERT with SUPABASE_ANON_KEY
**Solution**: Direct connection via \`createDatabaseClient\` helper

\`\`\`javascript
import { createDatabaseClient } from '../lib/supabase-connection.js';
const client = await createDatabaseClient('engineer', { verify: true });
// Execute INSERT bypassing RLS
\`\`\`

**Complete Pattern**: See \`docs/reference/handoff-rls-bypass.md\``
    }
  ];

  let totalSaved = 0;

  for (const item of toCompress) {
    const section = sections.find(s => s.title === item.title);
    if (!section) {
      console.log('Not found: ' + item.title);
      continue;
    }

    const oldChars = section.content ? section.content.length : 0;
    
    const { error } = await supabase
      .from('leo_protocol_sections')
      .update({ content: item.compressed })
      .eq('id', section.id);

    if (error) {
      console.error('Error:', error);
      continue;
    }

    const newChars = item.compressed.length;
    const saved = oldChars - newChars;
    totalSaved += saved;
    
    console.log(item.title.substring(0, 45) + ': ' + oldChars + ' → ' + newChars + ' (saved ' + saved + ')');
  }

  console.log('\nTotal saved: ' + totalSaved + ' chars');
}

findAndCompressFinal().catch(console.error);
