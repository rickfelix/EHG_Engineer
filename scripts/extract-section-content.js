#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const sectionsToExtract = [
  { id: 39, file: 'sub-agent-compression.md', title: 'Sub-Agent Report Compression System' },
  { id: 38, file: 'database-best-practices.md', title: 'Database Query Best Practices' },
  { id: 32, file: 'qa-director-guide.md', title: 'Enhanced QA Engineering Director v2.0' },
  { id: 43, file: 'user-story-e2e-mapping.md', title: 'User Story E2E Test Mapping' },
  { id: 19, file: 'sd-evaluation-checklist.md', title: '6-Step SD Evaluation Checklist' }
];

async function extractSections() {
  for (const section of sectionsToExtract) {
    const { data, error } = await supabase
      .from('leo_protocol_sections')
      .select('title, content')
      .eq('id', section.id)
      .single();

    if (error || !data) {
      console.error('Error fetching section ' + section.id + ':', error);
      continue;
    }

    const content = '# ' + data.title + '\n\n' + data.content + '\n';
    const filepath = 'docs/reference/' + section.file;
    
    writeFileSync(filepath, content);
    console.log('Created: ' + filepath + ' (' + content.length + ' chars)');
  }
  
  console.log('\nAll reference docs created!');
}

extractSections().catch(console.error);
