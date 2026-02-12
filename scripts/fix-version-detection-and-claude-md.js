#!/usr/bin/env node

/**
 * Fix Version Detection and CLAUDE.md Accuracy
 * 1. Fixes dashboard version detector to only look at actual protocol files
 * 2. Ensures CLAUDE.md always stays accurate
 * 3. Adds comprehensive sub-agent documentation to CLAUDE.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fix 1: Update version detector to only look at actual protocol files
function fixVersionDetector() {
  console.log('🔧 Fixing dashboard version detector...');
  
  const detectorPath = path.join(__dirname, '../lib/dashboard/version-detector.js');
  const fixedDetector = `/**
 * LEO Protocol Version Detector
 * FIXED: Only detects versions from actual protocol files, not content references
 */

import fs from 'fs';
import path from 'path';

class LEOVersionDetector {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    // Only match actual protocol filenames, not content
    this.protocolFilePattern = /leo_protocol_v([\\d\\.]+(?:_[\\w]+)?)\\.md$/i;
  }

  /**
   * Detect latest version from actual protocol files only
   */
  detectLatestVersion() {
    const versions = new Map(); // version -> {file, status}
    const protocolsPath = path.join(this.projectRoot, 'docs', '03_protocols_and_standards');

    try {
      if (fs.existsSync(protocolsPath)) {
        const files = fs.readdirSync(protocolsPath);
        
        for (const file of files) {
          const match = file.match(this.protocolFilePattern);
          if (match) {
            const version = match[1];
            const fullPath = path.join(protocolsPath, file);
            const content = fs.readFileSync(fullPath, 'utf8');
            
            // Check if superseded
            const isSuperseded = content.includes('SUPERSEDED') || 
                                content.includes('Status: Superseded') ||
                                content.includes('DEPRECATED');
            
            versions.set(version, {
              file: file,
              status: isSuperseded ? 'superseded' : 'active'
            });
          }
        }
      }

      // Find the latest active version
      const activeVersions = Array.from(versions.entries())
        .filter(([v, info]) => info.status === 'active')
        .map(([v, info]) => v);

      if (activeVersions.length === 0) {
        console.warn('⚠️ No active protocol versions found');
        return '4.1.2_database_first'; // Fallback
      }

      // Sort versions properly (handle underscore versions)
      const sorted = activeVersions.sort((a, b) => {
        const aNum = parseFloat(a.split('_')[0]);
        const bNum = parseFloat(b.split('_')[0]);
        return bNum - aNum;
      });

      const latest = sorted[0];
      console.log(\`🎯 Version Detection: Latest ACTIVE protocol: v\${latest}\`);
      console.log(\`📄 File: leo_protocol_v\${latest}.md\`);
      
      return latest;
    } catch (error) {
      console.error('❌ Version detection error:', error);
      return '4.1.2_database_first';
    }
  }

  getVersion() {
    return this.detectLatestVersion();
  }
}

export default LEOVersionDetector;`;

  fs.writeFileSync(detectorPath, fixedDetector);
  console.log('✅ Version detector fixed - will only detect actual protocol files');
}

// Fix 2: Enhance CLAUDE.md with complete sub-agent documentation
function enhanceCLAUDEMD() {
  console.log('📝 Enhancing CLAUDE.md with complete sub-agent documentation...');
  
  const claudePath = path.join(__dirname, '../CLAUDE.md');
  let content = fs.readFileSync(claudePath, 'utf8');
  
  // Find the sub-agent section
  const subAgentStart = content.indexOf('### Sub-Agent Activation Triggers');
  const dashboardStart = content.indexOf('## Dashboard-Specific Notes');
  
  if (subAgentStart === -1 || dashboardStart === -1) {
    console.error('❌ Could not find sub-agent section in CLAUDE.md');
    return;
  }
  
  // Enhanced sub-agent documentation
  const enhancedSubAgentSection = `### Sub-Agent Activation Triggers

| Sub-Agent | MUST Activate When |
|-----------|-------------------|
| Security | ANY security mention, authentication, authorization, PII, encryption, OWASP |
| Performance | Any metric defined, load time requirements, optimization needs |
| Design | 2+ UI/UX requirements, responsive design, accessibility |
| Testing | Coverage >80% OR E2E testing requirements |
| Database | ANY schema change, migration, data integrity requirements |

### Sub-Agent Activation Process (MANDATORY)

When trigger conditions are met, EXEC MUST:

1. **Create Formal Handoff** (7 elements required):
   - Executive Summary (≤200 tokens)
   - Scope & Requirements
   - Context Package  
   - Deliverables Manifest
   - Success Criteria & Validation
   - Resource Allocation
   - Handoff Requirements

2. **Execute Sub-Agent** (choose approach):
   - **Option A**: Run sub-agent tool if available
   - **Option B**: Simulate sub-agent analysis if no tool exists
   - **Option C**: Document what sub-agent would do

3. **Collect Sub-Agent Report** including:
   - Analysis results
   - Recommendations
   - Implementation guidance
   - Risk assessment
   - Validation criteria

4. **Include in EXEC Handback**:
   - Sub-agent reports MUST be attached
   - Missing sub-agent reports = handoff rejection

### Sub-Agent Handoff Template

\`\`\`markdown
SUB-AGENT ACTIVATION HANDOFF

From: EXEC Agent
To: [Security/Performance/Design/Testing/Database] Sub-Agent
Date: [ISO Date]
PRD Reference: [PRD-ID]
Activation Trigger: [Specific trigger from PRD]

1. EXECUTIVE SUMMARY (≤200 tokens)
[Why activated, what's needed, priority level]

2. SCOPE & REQUIREMENTS
Primary Objectives:
- [Objective 1 from PRD]
- [Objective 2 from PRD]

3. CONTEXT PACKAGE
[Technical stack, constraints, integration points]

4. DELIVERABLES MANIFEST
- [Required output 1]
- [Required output 2]

5. SUCCESS CRITERIA & VALIDATION
- [ ] [Measurable outcome 1]
- [ ] [Measurable outcome 2]

6. RESOURCE ALLOCATION
[Context budget, time constraints, dependencies]

7. HANDOFF REQUIREMENTS
Immediate Actions:
1. [Action 1]
2. [Action 2]
\`\`\`

### Sub-Agent Documentation References
- **Detailed Protocols**: \`docs/03_protocols_and_standards/LEO_v4.1_SUB_AGENT_HANDOFFS.md\`
- **Hybrid System**: \`docs/03_protocols_and_standards/LEO_v4.2_HYBRID_SUB_AGENTS.md\`
- **Activation Script**: \`node scripts/activate-sub-agents.js [PRD-ID]\`

`;

  // Replace the section
  const beforeSection = content.substring(0, subAgentStart);
  const afterSection = content.substring(dashboardStart);
  
  content = beforeSection + enhancedSubAgentSection + afterSection;
  
  fs.writeFileSync(claudePath, content);
  console.log('✅ CLAUDE.md enhanced with complete sub-agent documentation');
}

// Fix 3: Add auto-update check to CLAUDE.md
function addAutoUpdateCheck() {
  console.log('🔄 Adding auto-update check to CLAUDE.md...');
  
  const claudePath = path.join(__dirname, '../CLAUDE.md');
  let content = fs.readFileSync(claudePath, 'utf8');
  
  // Add auto-update notice at the top
  const autoUpdateNotice = `# CLAUDE.md - LEO Protocol Workflow Guide for AI Agents

## ⚠️ AUTO-UPDATE CHECK
**Before using this guide, ALWAYS run:**
\`\`\`bash
node scripts/update-claude-md-version.js
\`\`\`
This ensures you're using the latest LEO Protocol version and documentation.

`;

  if (!content.includes('AUTO-UPDATE CHECK')) {
    content = content.replace('# CLAUDE.md - LEO Protocol Workflow Guide for AI Agents\n', autoUpdateNotice);
    fs.writeFileSync(claudePath, content);
    console.log('✅ Auto-update check added to CLAUDE.md');
  }
}

// Main execution
async function main() {
  console.log('🚀 Fixing version detection and CLAUDE.md accuracy...\n');
  
  // Fix the version detector
  fixVersionDetector();
  
  // Enhance CLAUDE.md with sub-agent docs
  enhanceCLAUDEMD();
  
  // Add auto-update check
  addAutoUpdateCheck();
  
  // Run the update script to ensure latest version
  console.log('\n🔄 Running CLAUDE.md update script...');
  await import('./update-claude-md-version.js');
  
  console.log('\n✅ All fixes complete!');
  console.log('\n📋 Summary:');
  console.log('1. Version detector fixed - only detects actual protocol files');
  console.log('2. CLAUDE.md enhanced with complete sub-agent documentation');
  console.log('3. Auto-update check added to CLAUDE.md');
  console.log('4. CLAUDE.md updated to latest protocol version');
  
  console.log('\n💡 To keep CLAUDE.md accurate:');
  console.log('   Always run: node scripts/update-claude-md-version.js');
  console.log('   This is now mentioned at the top of CLAUDE.md');
}

main().catch(console.error);
