#!/usr/bin/env node

/**
 * Generate AI_GUIDE.md from Database - Dynamic Protocol Version Reference
 * ========================================================================
 * Creates AI_GUIDE.md that dynamically references the current LEO Protocol version
 * from the database, eliminating the need for manual updates.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function generateAIGuide() {
  console.log('🔄 Generating AI_GUIDE.md from database...\n');
  
  try {
    // Get current active LEO Protocol
    const { data: protocols, error } = await supabase
      .from('leo_protocols')
      .select('*')
      .eq('status', 'active')
      .limit(1);

    if (error) throw error;
    
    const currentProtocol = protocols?.[0];
    if (!currentProtocol) {
      throw new Error('No active LEO Protocol found in database');
    }

    console.log(`✅ Found active protocol: ${currentProtocol.version} - ${currentProtocol.title}`);

    // Get agents for percentage information
    const { data: agents, error: agentsError } = await supabase
      .from('leo_agents')
      .select('*');

    if (agentsError) throw agentsError;

    const agentPercentages = {};
    agents.forEach(agent => {
      agentPercentages[agent.code] = {
        name: agent.name,
        planning: agent.planning_percentage || 0,
        implementation: agent.implementation_percentage || 0,
        verification: agent.verification_percentage || 0,
        approval: agent.approval_percentage || 0
      };
    });

    // Generate AI_GUIDE.md content
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const aiGuideContent = `# AI_GUIDE.md - EHG_Engineer Development Guide

## ⚠️ DYNAMICALLY GENERATED FROM DATABASE
**Last Generated**: ${timestamp}
**Source**: Supabase Database (not static files)
**Auto-Update**: Run \`node scripts/generate-ai-guide-from-db.js\` anytime

> Essential context and practices for AI assistants working with the EHG_Engineer platform

## 🟢 CURRENT LEO PROTOCOL VERSION: ${currentProtocol.version}

**CRITICAL**: This is the ACTIVE version from database
**ID**: ${currentProtocol.id}
**Status**: ${currentProtocol.status?.toUpperCase()}
**Title**: ${currentProtocol.title}

## Project Overview

**EHG_Engineer** is a sophisticated implementation of the LEO Protocol ${currentProtocol.version} for strategic directive management. It provides:
- Database-first architecture with Supabase/PostgreSQL
- Strategic Directive lifecycle management
- Epic Execution Sequence tracking
- HAP blocks for detailed task management
- Complete template system for all LEO Protocol artifacts

## Critical Development Practices

### 1. LEO Protocol ${currentProtocol.version} Compliance

This project strictly follows the LEO Protocol multi-agent workflow:
${Object.entries(agentPercentages).map(([code, agent]) => `- **${code}**: ${agent.name} (${agent.planning + agent.implementation + agent.verification + agent.approval}% total)`).join('\n')}

### Agent Responsibilities (From Database)
${Object.entries(agentPercentages).map(([code, agent]) => `
#### ${agent.name} (${code})
- **Planning**: ${agent.planning}%
- **Implementation**: ${agent.implementation}%
- **Verification**: ${agent.verification}%
- **Approval**: ${agent.approval}%
- **Total**: ${agent.planning + agent.implementation + agent.verification + agent.approval}%`).join('\n')}

### 2. Communication Standards (MANDATORY)

All agent communications MUST use this header format:

\`\`\`markdown
**To:** [Recipient Agent Role/HUMAN]
**From:** [Sending Agent Role]  
**Protocol:** LEO Protocol ${currentProtocol.version} (${currentProtocol.title})
**Strategic Directive:** [SD-ID]: [Strategic Directive Title]
**Strategic Directive Path:** \`docs/strategic_directives/[SD-ID].md\`
**Related PRD:** [PRD-ID]
**Related PRD Path:** \`docs/product-requirements/[PRD-ID].md\`

**Reference Files Required**:
- \`docs/strategic_directives/[SD-ID].md\` (Strategic Directive)
- \`docs/product-requirements/[PRD-ID].md\` (Product Requirements Document)
- \`docs/03_protocols_and_standards/\` (Protocol Templates)
- \`[additional-files-as-needed]\` (Context-specific)
\`\`\`

### 3. Task Execution Options

**Iterative Execution (Default)**:
- Tasks provided one at a time
- Verification between each task
- Best for critical operations
- Allows course correction

**Batch Execution (Advanced)**:
- Multiple related tasks provided together
- Best for routine operations
- Requires explicit confirmation

### 4. Database-First Architecture

All protocol information comes from Supabase:
- Protocol versions in \`leo_protocols\` table
- Agent definitions in \`leo_agents\` table
- Sub-agent triggers in \`leo_sub_agent_triggers\` table
- Handoff templates in \`leo_handoff_templates\` table

### 5. Key Commands

**Get Current Protocol Version**:
\`\`\`bash
node scripts/get-latest-leo-protocol-from-db.js
\`\`\`

**Update AI Guide**:
\`\`\`bash
node scripts/generate-ai-guide-from-db.js
\`\`\`

**Update CLAUDE.md**:
\`\`\`bash
node scripts/generate-claude-md-from-db.js
\`\`\`

## Directory Structure Standards

Follow the Documentation Standards for file placement:

- \`/docs/01_architecture/\` - System architecture
- \`/docs/02_api/\` - API documentation
- \`/docs/03_guides/\` - User guides and tutorials
- \`/docs/04_features/\` - Feature documentation
- \`/docs/05_testing/\` - Testing documentation
- \`/docs/06_deployment/\` - Deployment guides
- \`/docs/07_reports/\` - Generated reports
- \`/docs/08_applications/\` - Generated applications
- \`/docs/09_retrospectives/\` - Project retrospectives

## Important Notes

1. **Database is Source of Truth** - Protocol information comes from database
2. **Dynamic References** - Always use current protocol version
3. **Auto-Generation** - This file is generated, don't edit manually
4. **Consistent Updates** - Run generation script after protocol changes

---

*Generated from Database: ${new Date().toISOString().split('T')[0]}*
*Protocol Version: ${currentProtocol.version}*
*Database-First Architecture: ACTIVE*`;

    // Write the generated AI_GUIDE.md
    const aiGuidePath = path.join(__dirname, '..', 'docs', '03_guides', 'AI_GUIDE.md');
    await fs.writeFile(aiGuidePath, aiGuideContent);
    
    console.log(`✅ AI_GUIDE.md generated successfully!`);
    console.log(`📁 Location: docs/03_guides/AI_GUIDE.md`);
    console.log(`📋 Protocol Version: ${currentProtocol.version}`);
    console.log(`🕒 Generated: ${timestamp}\n`);

    // Also create a backup of the old static version if it exists
    try {
      const oldGuidePath = path.join(__dirname, '..', 'AI_GUIDE.md');
      await fs.access(oldGuidePath);
      const backupPath = path.join(__dirname, '..', 'AI_GUIDE_static_backup.md');
      await fs.rename(oldGuidePath, backupPath);
      console.log(`📦 Backed up old static AI_GUIDE.md to AI_GUIDE_static_backup.md`);
    } catch {
      // No old file to backup
    }

    return {
      protocol_version: currentProtocol.version,
      file_path: aiGuidePath,
      generated_at: timestamp
    };

  } catch (error) {
    console.error('❌ Error generating AI_GUIDE.md:', error.message);
    throw error;
  }
}

// Run the generator
generateAIGuide()
  .then((result) => {
    console.log('=' .repeat(80));
    console.log('✨ AI_GUIDE.MD GENERATION COMPLETE');
    console.log('=' .repeat(80));
    console.log(`🎯 Protocol Version: ${result.protocol_version}`);
    console.log(`📁 File Location: ${result.file_path.replace(process.cwd(), '.')}`);
    console.log(`🕒 Generated At: ${result.generated_at}`);
    console.log('');
    console.log('💡 Next Steps:');
    console.log('1. AI_GUIDE.md now dynamically references current LEO Protocol');
    console.log('2. No more manual updates needed for protocol version changes');
    console.log('3. Run this script anytime the protocol is updated');
    console.log('4. Documentation Sub-Agent will use the organized structure');
  })
  .catch(console.error);