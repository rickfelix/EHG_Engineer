#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Automated LEO Protocol Superseding System
 * 
 * Automatically marks previous protocol versions as superseded when a new version is created.
 * Ensures proper version management and prevents manual errors.
 * 
 * Usage: 
 *   node auto-supersede-protocols.js --new-version v4.1.3
 *   node auto-supersede-protocols.js --validate-all
 */

import fs from 'fs';
import path from 'path';
import { LEOProtocolVersionDetector } from './get-latest-leo-protocol-version';
import { CLAUDEMDUpdater } from './update-claude-md-version';

class AutoSupersede {
  constructor() {
    this.protocolsDir = path.join(__dirname, '..', 'docs', '03_protocols_and_standards');
    this.detector = new LEOProtocolVersionDetector();
    this.claudeUpdater = new CLAUDEMDUpdater();
  }

  async run() {
    const args = process.argv.slice(2);
    const command = args[0];

    try {
      switch (command) {
        case '--new-version':
          const newVersion = args[1];
          if (!newVersion) {
            throw new Error('Usage: --new-version v4.1.3');
          }
          await this.supersedeForNewVersion(newVersion);
          break;

        case '--validate-all':
          await this.validateAllSuperseding();
          break;

        case '--fix-superseding':
          await this.fixSupersedingIssues();
          break;

        default:
          this.showHelp();
          break;
      }
    } catch (error) {
      console.error('❌ Auto-supersede failed:', error.message);
      process.exit(1);
    }
  }

  async supersedeForNewVersion(newVersionTag) {
    console.log('🔄 AUTOMATED SUPERSEDING PROCESS');
    console.log('===============================');
    console.log(`📋 New Version: ${newVersionTag}\n`);

    // Extract clean version number (remove 'v' prefix if present)
    const newVersion = newVersionTag.replace(/^v/, '');

    // 1. Detect current latest version
    console.log('1️⃣ Detecting current protocol landscape...');
    const latest = await this.detector.scanProtocolFiles();
    if (!latest) {
      throw new Error('Could not detect latest protocol version');
    }
    
    console.log(`   Current latest: v${latest.version}`);
    console.log(`   New version: v${newVersion}`);

    // 2. Validate new version is actually newer
    if (!this.isNewerVersion(latest.version, newVersion)) {
      throw new Error(`New version v${newVersion} is not newer than current v${latest.version}`);
    }
    console.log('   ✅ Version increment validated\n');

    // 3. Mark current latest as superseded
    console.log('2️⃣ Superseding current latest version...');
    await this.supersedeVersion(latest.filename, newVersion);
    console.log(`   ✅ ${latest.filename} marked as superseded\n`);

    // 4. Update all existing superseded versions to point to new version
    console.log('3️⃣ Updating existing superseded versions...');
    const allProtocols = await this.getAllProtocols();
    let updatedCount = 0;

    for (const protocol of allProtocols) {
      if (protocol.filename !== latest.filename && protocol.parsed.isSuperseded) {
        await this.updateSupersededReference(protocol.filename, newVersion);
        updatedCount++;
      }
    }
    console.log(`   ✅ Updated ${updatedCount} existing superseded versions\n`);

    // 5. Update CLAUDE.md dynamically
    console.log('4️⃣ Updating CLAUDE.md references...');
    await this.claudeUpdater.updateCLAUDEMD();
    console.log('   ✅ CLAUDE.md updated with new version references\n');

    // 6. Validate the superseding was successful
    console.log('5️⃣ Validating superseding process...');
    const validation = await this.validateSuperseding(newVersion);
    if (validation.success) {
      console.log('   ✅ Superseding validation passed\n');
    } else {
      console.log('   ⚠️  Validation issues found:');
      validation.issues.forEach(issue => console.log(`      - ${issue}`));
    }

    console.log('🎉 AUTOMATED SUPERSEDING COMPLETE!');
    console.log('==================================');
    console.log(`✅ All previous versions now reference v${newVersion}`);
    console.log('✅ CLAUDE.md updated automatically');
    console.log('✅ Protocol version management maintained');
    console.log('\n📝 Next steps:');
    console.log(`   1. Create the new protocol file: leo_protocol_v${newVersion}.md`);
    console.log('   2. Mark it with status: "🟢 CURRENT ACTIVE VERSION"');
    console.log('   3. Run: node scripts/get-latest-leo-protocol-version.js');
  }

  async validateAllSuperseding() {
    console.log('🔍 VALIDATING ALL PROTOCOL SUPERSEDING');
    console.log('====================================\n');

    const latest = await this.detector.scanProtocolFiles();
    const allProtocols = await this.getAllProtocols();
    
    const issues = [];
    const supersededVersions = allProtocols.filter(p => p.parsed.isSuperseded);
    
    console.log(`📊 Found ${supersededVersions.length} superseded versions to validate\n`);

    for (const protocol of supersededVersions) {
      const expectedReference = `SUPERSEDED BY LEO Protocol v${latest.version}`;
      if (!protocol.content.includes(expectedReference)) {
        issues.push(`${protocol.filename}: Should reference "${expectedReference}"`);
      }
    }

    if (issues.length === 0) {
      console.log('✅ All superseded versions properly reference the latest version');
    } else {
      console.log('⚠️  Issues found:');
      issues.forEach(issue => console.log(`   - ${issue}`));
      console.log('\n💡 Run --fix-superseding to automatically fix these issues');
    }

    return { success: issues.length === 0, issues };
  }

  async fixSupersedingIssues() {
    console.log('🔧 FIXING SUPERSEDING ISSUES');
    console.log('===========================\n');

    const latest = await this.detector.scanProtocolFiles();
    const allProtocols = await this.getAllProtocols();
    const supersededVersions = allProtocols.filter(p => p.parsed.isSuperseded);

    let fixedCount = 0;

    for (const protocol of supersededVersions) {
      const expectedReference = `SUPERSEDED BY LEO Protocol v${latest.version}`;
      if (!protocol.content.includes(expectedReference)) {
        console.log(`🔧 Fixing ${protocol.filename}...`);
        await this.updateSupersededReference(protocol.filename, latest.version);
        fixedCount++;
      }
    }

    console.log(`✅ Fixed ${fixedCount} superseding references`);
  }

  async supersedeVersion(filename, newVersion) {
    const filePath = path.join(this.protocolsDir, filename);
    let content = await fs.promises.readFile(filePath, 'utf8');

    // Update status to superseded
    const statusPattern = /\*\*Status\*\*:\s*([^\n]+)/;
    const newStatus = `⚠️  SUPERSEDED BY LEO Protocol v${newVersion}`;
    
    if (statusPattern.test(content)) {
      content = content.replace(statusPattern, `**Status**: ${newStatus}`);
    }

    // Add superseded date if not present
    if (!content.includes('**Superseded Date**')) {
      const today = new Date().toISOString().split('T')[0];
      content = content.replace(
        /(\*\*Date\*\*:\s*[^\n]+)/,
        `$1\n**Superseded Date**: ${today}`
      );
    }

    // Add or update deprecation notice
    const deprecationNotice = `---
## ⚠️  DEPRECATION NOTICE

**This version has been superseded by LEO Protocol v${newVersion}.**

**Current active version**: \`docs/03_protocols_and_standards/leo_protocol_v${newVersion}_[suffix].md\`

---`;

    if (content.includes('DEPRECATION NOTICE')) {
      // Update existing notice
      const deprecationPattern = /---\n## ⚠️  DEPRECATION NOTICE.*?---/s;
      content = content.replace(deprecationPattern, deprecationNotice);
    } else {
      // Add new notice after the header
      const headerEndPattern = /(---\n)/;
      content = content.replace(headerEndPattern, `$1${deprecationNotice}\n`);
    }

    await fs.promises.writeFile(filePath, content);
  }

  async updateSupersededReference(filename, newVersion) {
    const filePath = path.join(this.protocolsDir, filename);
    let content = await fs.promises.readFile(filePath, 'utf8');

    // Update any references to superseding version
    const oldReferencePattern = /SUPERSEDED BY LEO Protocol v[\d.]+/g;
    const newReference = `SUPERSEDED BY LEO Protocol v${newVersion}`;
    
    content = content.replace(oldReferencePattern, newReference);

    await fs.promises.writeFile(filePath, content);
  }

  async getAllProtocols() {
    const files = await fs.promises.readdir(this.protocolsDir);
    const protocolFiles = files.filter(file => 
      file.startsWith('leo_protocol_v') && file.endsWith('.md')
    );

    const protocols = [];
    for (const filename of protocolFiles) {
      const filePath = path.join(this.protocolsDir, filename);
      const content = await fs.promises.readFile(filePath, 'utf8');
      
      protocols.push({
        filename,
        filePath,
        content,
        parsed: this.parseProtocol(content, filename)
      });
    }

    return protocols;
  }

  parseProtocol(content, filename) {
    const versionMatch = filename.match(/leo_protocol_v(.+)\.md$/);
    const version = versionMatch ? versionMatch[1] : null;
    
    const statusMatch = content.match(/\*\*Status\*\*:\s*([^\n]+)/i);
    const status = statusMatch ? statusMatch[1].trim() : null;
    
    return {
      version,
      status,
      isSuperseded: content.includes('SUPERSEDED') || (status && status.includes('SUPERSEDED')),
      isActive: status && (
        status.includes('CURRENT ACTIVE VERSION') ||
        status.includes('Critical Update') ||
        status.includes('Active')
      )
    };
  }

  async validateSuperseding(newVersion) {
    const issues = [];
    const allProtocols = await this.getAllProtocols();
    
    // Check that all superseded versions reference the new version
    for (const protocol of allProtocols) {
      if (protocol.parsed.isSuperseded) {
        const expectedRef = `SUPERSEDED BY LEO Protocol v${newVersion}`;
        if (!protocol.content.includes(expectedRef)) {
          issues.push(`${protocol.filename} should reference ${expectedRef}`);
        }
      }
    }

    return { success: issues.length === 0, issues };
  }

  isNewerVersion(oldVersion, newVersion) {
    const oldParts = oldVersion.replace('_database_first', '').split('.').map(n => parseInt(n, 10));
    const newParts = newVersion.split('.').map(n => parseInt(n, 10));
    
    // Pad with zeros for consistent comparison
    while (oldParts.length < 3) oldParts.push(0);
    while (newParts.length < 3) newParts.push(0);
    
    for (let i = 0; i < 3; i++) {
      if (newParts[i] > oldParts[i]) return true;
      if (newParts[i] < oldParts[i]) return false;
    }
    
    return false; // Versions are equal
  }

  showHelp() {
    console.log('🤖 LEO Protocol Automated Superseding System');
    console.log('============================================');
    console.log('');
    console.log('Usage:');
    console.log('  node auto-supersede-protocols.js --new-version v4.1.3');
    console.log('    Marks all previous versions as superseded by v4.1.3');
    console.log('');
    console.log('  node auto-supersede-protocols.js --validate-all');
    console.log('    Validates all superseded versions reference the latest');
    console.log('');
    console.log('  node auto-supersede-protocols.js --fix-superseding');
    console.log('    Fixes any incorrect superseding references');
    console.log('');
    console.log('Examples:');
    console.log('  # When creating LEO Protocol v4.1.3');
    console.log('  node auto-supersede-protocols.js --new-version v4.1.3');
    console.log('');
    console.log('  # Validate current superseding is correct');
    console.log('  node auto-supersede-protocols.js --validate-all');
  }
}

// Export for module use
export {  AutoSupersede  };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const autoSupersede = new AutoSupersede();
  autoSupersede.run();
}
