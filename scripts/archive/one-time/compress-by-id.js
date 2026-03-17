#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const toCompress = [
  {
    id: 44,
    compressed: `**Documentation Platform**: AI Documentation Generation System integrated into LEO Protocol.

**Auto-Triggers**: SD completion, EXEC→PLAN handoff, retrospective creation
**EXEC Requirement**: Generate docs before handoff: \`node scripts/generate-workflow-docs.js --sd-id <SD-ID>\`
**Dashboard**: \`/ai-docs-admin\` to review and publish

**Complete Guide**: See \`docs/reference/documentation-platform.md\``
  },
  {
    id: 36,
    compressed: `**E2E Testing Mode**: Default to dev mode (port 5173) for reliable tests.

**Issue**: Preview mode (4173) may have rendering problems
**Solution**: Use dev mode for tests, preview only for production validation
\`\`\`typescript
baseURL: 'http://localhost:5173'  // Dev mode
\`\`\`

**Full Guide**: See \`docs/reference/e2e-testing-modes.md\``
  },
  {
    id: 17,
    compressed: `**Multi-App Testing**: Two independent test suites (EHG_Engineer + EHG app).

**CRITICAL**: Determine target app from SD context before running tests
- **EHG_Engineer**: Vitest + Jest (50% coverage)
- **EHG**: Vitest (unit) + Playwright (E2E)

**Full Guide**: See \`docs/reference/multi-app-testing.md\``
  },
  {
    id: 45,
    compressed: `**Handoff RLS Bypass**: Use direct PostgreSQL to bypass RLS policies.

**Issue**: RLS blocks INSERT with ANON_KEY
**Solution**: Direct connection via \`createDatabaseClient\` helper
\`\`\`javascript
import { createDatabaseClient } from '../lib/supabase-connection.js';
const client = await createDatabaseClient('engineer', { verify: true });
\`\`\`

**Full Pattern**: See \`docs/reference/handoff-rls-bypass.md\``
  }
];

async function compressByID() {
  let totalSaved = 0;

  for (const item of toCompress) {
    const { data: current } = await supabase
      .from('leo_protocol_sections')
      .select('content, title')
      .eq('id', item.id)
      .single();

    const oldChars = current.content ? current.content.length : 0;
    
    const { error } = await supabase
      .from('leo_protocol_sections')
      .update({ content: item.compressed })
      .eq('id', item.id);

    if (error) {
      console.error('Error:', error);
      continue;
    }

    const newChars = item.compressed.length;
    const saved = oldChars - newChars;
    totalSaved += saved;
    
    console.log('ID ' + item.id + ' (' + current.title.substring(0, 40) + '): ' + oldChars + ' → ' + newChars + ' (saved ' + saved + ')');
  }

  console.log('\nTotal saved: ' + totalSaved + ' chars');
}

compressByID().catch(console.error);
