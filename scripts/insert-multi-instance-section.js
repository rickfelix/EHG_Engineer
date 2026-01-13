#!/usr/bin/env node
/**
 * Insert multi-instance coordination section into leo_protocol_sections
 * One-time script to add worktree guidance for parallel Claude Code instances
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const content = `## 🔀 Multi-Instance Coordination (MANDATORY)

**Root Cause**: Multiple Claude Code instances operating in the same git working directory causes branch conflicts, stash collisions, and interrupted operations.

### MANDATORY: Git Worktrees for Parallel SD Work

When multiple Claude Code instances may run concurrently on different SDs:

#### Before Starting EXEC Phase:
\`\`\`bash
# 1. Create isolated worktree (NOT shared ../ehg)
cd ../ehg
git worktree add ../ehg-worktrees/\${SD_ID} -b feat/\${SD_ID}-branch

# 2. Work ONLY in worktree directory
cd ../ehg-worktrees/\${SD_ID}

# 3. All git operations happen here
git add . && git commit -m "feat(\${SD_ID}): description"
git push origin feat/\${SD_ID}-branch
\`\`\`

#### After PR Merged:
\`\`\`bash
# Cleanup worktree
cd ../ehg
git worktree remove ../ehg-worktrees/\${SD_ID}
\`\`\`

### Forbidden Operations (Multi-Instance)

| Operation | Why Forbidden | Alternative |
|-----------|---------------|-------------|
| \`git stash pop\` across SDs | Mixes changes between instances | Use worktrees |
| \`git checkout\` to different SD branch | Switches shared directory | Use worktrees |
| Working in \`../ehg\` during parallel execution | Shared state conflicts | Use worktree path |
| Branch switching mid-operation | Interrupts other instance | Complete or stash first |

### Quick Reference

\`\`\`bash
# Helper script (recommended)
bash scripts/create-sd-worktree.sh SD-STAGE-09-001

# List active worktrees
git worktree list

# Check if directory is worktree
git rev-parse --is-inside-work-tree
\`\`\`

### Why Worktrees?

- **Complete isolation**: Each instance has its own filesystem
- **Shared history**: All worktrees share the same .git
- **No conflicts**: Branch operations don't affect other instances
- **Built-in**: No custom tooling required

**Evidence**: SD-STAGE-09-001 + SD-EVA-DECISION-001 collision - parallel instances caused branch switch during commit, resulting in mixed changes and failed operations.`;

async function insertSection() {
  // Get active protocol ID
  const { data: protocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id')
    .eq('status', 'active')
    .single();

  if (protocolError || !protocol) {
    console.log('Error getting protocol:', protocolError?.message || 'No active protocol found');
    return;
  }

  console.log('Active protocol ID:', protocol.id);

  // Check if section already exists
  const { data: existing } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('section_type', 'multi_instance_coordination')
    .eq('protocol_id', protocol.id)
    .single();

  if (existing) {
    console.log('Section already exists, updating...');
    const { data, error } = await supabase
      .from('leo_protocol_sections')
      .update({
        content: content,
        title: 'Multi-Instance Coordination (MANDATORY)'
      })
      .eq('id', existing.id)
      .select();

    if (error) {
      console.log('Error updating:', error.message);
    } else {
      console.log('Section updated:', data[0].id);
    }
    return;
  }

  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .insert({
      protocol_id: protocol.id,
      section_type: 'multi_instance_coordination',
      title: 'Multi-Instance Coordination (MANDATORY)',
      content: content,
      target_file: 'CLAUDE_EXEC.md',
      order_index: 91
    })
    .select();

  if (error) {
    console.log('Error inserting:', error.message);
  } else {
    console.log('Section inserted:', data[0].id);
  }
}

insertSection();
