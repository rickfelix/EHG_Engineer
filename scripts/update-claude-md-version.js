#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Dynamic CLAUDE.md Version Updater
 * Updates CLAUDE.md with the latest LEO Protocol version dynamically
 */

import fs from 'fs';
import path from 'path';
import { LEOProtocolVersionDetector } from './get-latest-leo-protocol-version';

class CLAUDEMDUpdater {
  constructor() {
    this.claudeMDPath = path.join(__dirname, '..', 'CLAUDE.md');
    this.detector = new LEOProtocolVersionDetector();
  }

  async updateCLAUDEMD() {
    try {
      console.log('🔄 Updating CLAUDE.md with latest LEO Protocol version...');
      
      // Get latest version
      const latest = await this.detector.scanProtocolFiles();
      if (!latest) {
        throw new Error('Could not determine latest LEO Protocol version');
      }

      console.log(`📋 Latest version detected: ${latest.version}`);
      
      // Read current CLAUDE.md
      const currentContent = await fs.promises.readFile(this.claudeMDPath, 'utf8');
      
      // Generate dynamic content
      const updatedContent = this.replaceVersionReferences(currentContent, latest);
      
      // Write updated content
      await fs.promises.writeFile(this.claudeMDPath, updatedContent);
      
      console.log('✅ CLAUDE.md updated successfully with dynamic version references');
      console.log(`   Current version: LEO Protocol v${latest.version}`);
      console.log(`   File location: docs/03_protocols_and_standards/${latest.filename}`);
      
      return latest;
    } catch (_error) {
      console.error('❌ Failed to update CLAUDE.md:', error.message);
      throw error;
    }
  }

  replaceVersionReferences(content, latest) {
    const version = latest.version;
    const filename = latest.filename;
    const today = new Date().toISOString().split('T')[0];
    
    // Replace version header section
    const versionHeaderPattern = /## 🟢 CURRENT LEO PROTOCOL VERSION:.*?\n\*\*All previous versions.*?\*\*/s;
    const newVersionHeader = `## 🟢 CURRENT LEO PROTOCOL VERSION: v${version}

**CRITICAL**: Always reference LEO Protocol v${version} (Database-First Enforcement Update)
**Location**: \`docs/03_protocols_and_standards/${filename}\`
**All previous versions are SUPERSEDED** (verified dynamically)`;

    content = content.replace(versionHeaderPattern, newVersionHeader);

    // Replace versioning requirements section
    const versioningPattern = /(\*\*MUST reference current version only\*\*) \([^)]+\)/;
    content = content.replace(versioningPattern, `$1 (v${version})`);

    // Replace database-first approach reference
    const databaseApproachPattern = /### DATABASE-FIRST APPROACH \(Per LEO Protocol v[^)]+\)/;
    content = content.replace(databaseApproachPattern, `### DATABASE-FIRST APPROACH (Per LEO Protocol v${version})`);

    // Replace key points section
    const keyPointsPattern = /## LEO Protocol v[^\s]+ Key Points/;
    content = content.replace(keyPointsPattern, `## LEO Protocol v${version} Key Points`);

    // Replace GitHub deployment workflow reference
    const githubWorkflowPattern = /## GitHub Deployment Workflow \(LEO Protocol v[^)]+\)/;
    content = content.replace(githubWorkflowPattern, `## GitHub Deployment Workflow (LEO Protocol v${version})`);

    // Replace example version increments
    const exampleVersionPattern = /(\*\*MUST create new version file\*\* for protocol changes \()[^)]+(\))/;
    const nextVersion = this.generateNextVersionExample(version);
    content = content.replace(exampleVersionPattern, `$1${nextVersion}$2`);

    // Replace footer
    const footerPattern = /\*Last Updated:.*?per LEO Protocol v[^*]+\*/;
    content = content.replace(footerPattern, `*Last Updated: ${today} per LEO Protocol v${version}*`);

    return content;
  }

  generateNextVersionExample(currentVersion) {
    // Generate example next version (e.g., v4.1.2 -> v4.1.3, v4.2.0)
    const parts = currentVersion.replace('_database_first', '').split('.');
    if (parts.length >= 3) {
      const patch = parseInt(parts[2]) + 1;
      const minor = parseInt(parts[1]) + 1;
      return `v${parts[0]}.${parts[1]}.${patch}, v${parts[0]}.${minor}.0, etc.`;
    }
    return 'v4.1.3, v4.2.0, etc.';
  }

  async validateUpdate() {
    try {
      const content = await fs.promises.readFile(this.claudeMDPath, 'utf8');
      const latest = await this.detector.scanProtocolFiles();
      
      const hasCorrectVersion = content.includes(`v${latest.version}`);
      const hasCorrectFile = content.includes(latest.filename);
      
      if (hasCorrectVersion && hasCorrectFile) {
        console.log('✅ CLAUDE.md validation passed - references latest version');
        return true;
      } else {
        console.log('❌ CLAUDE.md validation failed - outdated version references detected');
        return false;
      }
    } catch (_error) {
      console.error('❌ Validation failed:', error.message);
      return false;
    }
  }
}

// Export for module use
export {  CLAUDEMDUpdater  };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const updater = new CLAUDEMDUpdater();
  
  updater.updateCLAUDEMD()
    .then(_latest => {
      console.log('\n🎯 CLAUDE.md now dynamically references the latest LEO Protocol version');
      console.log('   Run this script whenever protocol versions change');
      return updater.validateUpdate();
    })
    .then(valid => {
      process.exit(valid ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Update failed:', error.message);
      process.exit(1);
    });
}
