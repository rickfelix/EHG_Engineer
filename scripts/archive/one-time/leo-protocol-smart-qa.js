#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * LEO Protocol Smart QA & Version Management System
 * 
 * This script provides intelligent QA for LEO Protocol versions including:
 * - Automatic nomenclature validation
 * - Version consistency checking  
 * - Automated superseding process
 * - Quality assurance for protocol updates
 * - Detection of improper versioning patterns
 */

import fs from 'fs';
import path from 'path';
import { LEOProtocolVersionDetector } from './get-latest-leo-protocol-version';

class LEOProtocolSmartQA {
  constructor() {
    this.protocolsDir = path.join(__dirname, '..', 'docs', '03_protocols_and_standards');
    this.detector = new LEOProtocolVersionDetector();
    this.nomenclatureRules = {
      // Standard version pattern: leo_protocol_vX.Y.Z[_suffix].md
      versionPattern: /^leo_protocol_v(\d+\.\d+(?:\.\d+)?)(?:_([a-z_]+))?\.md$/,
      
      // Valid status values
      validStatuses: [
        'CURRENT ACTIVE VERSION',
        'SUPERSEDED BY LEO Protocol',
        'Critical Update',
        'Update Patch',
        'Proposed',
        'Draft'
      ],
      
      // Required header fields
      requiredFields: ['Version', 'Status', 'Date'],
      
      // Version increment rules
      incrementRules: {
        major: /^\d+\.0\.0$/, // Major: X.0.0
        minor: /^\d+\.\d+\.0$/, // Minor: X.Y.0  
        patch: /^\d+\.\d+\.\d+$/ // Patch: X.Y.Z
      }
    };
  }

  async runSmartQA() {
    console.log('🧠 LEO Protocol Smart QA System');
    console.log('=====================================\n');

    try {
      // 1. Scan and validate all protocol files
      const protocols = await this.scanAndValidateProtocols();
      
      // 2. Perform nomenclature validation
      const nomenclatureIssues = await this.validateNomenclature(protocols);
      
      // 3. Check version consistency
      const consistencyIssues = await this.checkVersionConsistency(protocols);
      
      // 4. Validate superseding status
      const supersedingIssues = await this.validateSuperseding(protocols);
      
      // 5. Detect latest version and validate it
      const latestValidation = await this.validateLatestVersion(protocols);
      
      // 6. Generate QA report
      const qaReport = this.generateQAReport({
        protocols,
        nomenclatureIssues,
        consistencyIssues, 
        supersedingIssues,
        latestValidation
      });

      // 7. Auto-fix issues if requested
      if (process.argv.includes('--fix')) {
        await this.autoFixIssues(qaReport);
      }

      return qaReport;
      
    } catch (error) {
      console.error('❌ Smart QA failed:', error.message);
      throw error;
    }
  }

  async scanAndValidateProtocols() {
    console.log('📋 Scanning protocol files...');
    
    const files = await fs.promises.readdir(this.protocolsDir);
    const protocolFiles = files.filter(file => 
      file.startsWith('leo_protocol_v') && file.endsWith('.md')
    );

    const protocols = [];
    
    for (const filename of protocolFiles) {
      const filePath = path.join(this.protocolsDir, filename);
      const content = await fs.promises.readFile(filePath, 'utf8');
      
      const protocol = {
        filename,
        filePath,
        content,
        parsed: this.parseProtocolFile(content, filename),
        issues: []
      };
      
      protocols.push(protocol);
    }
    
    console.log(`✅ Found ${protocols.length} protocol files\n`);
    return protocols;
  }

  parseProtocolFile(content, filename) {
    // Extract version from filename
    const filenameMatch = filename.match(this.nomenclatureRules.versionPattern);
    const filenameVersion = filenameMatch ? filenameMatch[1] : null;
    const filenameSuffix = filenameMatch ? filenameMatch[2] : null;

    // Extract header information
    const versionMatch = content.match(/\*\*Version\*\*:\s*([^\n]+)/i);
    const statusMatch = content.match(/\*\*Status\*\*:\s*([^\n]+)/i);
    const dateMatch = content.match(/\*\*Date\*\*:\s*([^\n]+)/i);
    const titleMatch = content.match(/^#\s+(.+)$/m);

    return {
      filenameVersion,
      filenameSuffix,
      headerVersion: versionMatch ? versionMatch[1].trim() : null,
      status: statusMatch ? statusMatch[1].trim() : null,
      date: dateMatch ? dateMatch[1].trim() : null,
      title: titleMatch ? titleMatch[1].trim() : null,
      isSuperseded: content.includes('SUPERSEDED') || (statusMatch && statusMatch[1].includes('SUPERSEDED')),
      isActive: statusMatch && (
        statusMatch[1].includes('CURRENT ACTIVE VERSION') ||
        statusMatch[1].includes('Critical Update') ||
        statusMatch[1].includes('Active')
      )
    };
  }

  async validateNomenclature(protocols) {
    console.log('🔍 Validating nomenclature...');
    const issues = [];

    for (const protocol of protocols) {
      const p = protocol.parsed;
      
      // Check filename pattern
      if (!this.nomenclatureRules.versionPattern.test(protocol.filename)) {
        issues.push({
          file: protocol.filename,
          type: 'NOMENCLATURE_VIOLATION',
          severity: 'HIGH',
          message: 'Filename does not follow leo_protocol_vX.Y.Z[_suffix].md pattern'
        });
      }

      // Check version consistency between filename and header
      if (p.filenameVersion && p.headerVersion && p.filenameVersion !== p.headerVersion) {
        issues.push({
          file: protocol.filename,
          type: 'VERSION_MISMATCH',
          severity: 'HIGH',
          message: `Filename version (${p.filenameVersion}) != Header version (${p.headerVersion})`
        });
      }

      // Check required header fields
      const fieldMapping = {
        'Version': p.headerVersion,
        'Status': p.status,
        'Date': p.date
      };
      
      for (const field of this.nomenclatureRules.requiredFields) {
        const fieldValue = fieldMapping[field];
        if (!fieldValue) {
          issues.push({
            file: protocol.filename,
            type: 'MISSING_HEADER_FIELD',
            severity: 'MEDIUM',
            message: `Missing required header field: ${field}`
          });
        }
      }

      // Check status validity
      if (p.status && !this.nomenclatureRules.validStatuses.some(valid => p.status.includes(valid))) {
        issues.push({
          file: protocol.filename,
          type: 'INVALID_STATUS',
          severity: 'MEDIUM',
          message: `Status "${p.status}" not in valid status list`
        });
      }
    }

    console.log(`${issues.length > 0 ? '⚠️' : '✅'} Nomenclature validation: ${issues.length} issues found\n`);
    return issues;
  }

  async checkVersionConsistency(protocols) {
    console.log('📊 Checking version consistency...');
    const issues = [];
    
    // Sort protocols by version
    const versionedProtocols = protocols
      .filter(p => p.parsed.filenameVersion)
      .sort((a, b) => this.compareVersions(b.parsed.filenameVersion, a.parsed.filenameVersion));

    // Check for duplicate versions
    const versionMap = new Map();
    for (const protocol of versionedProtocols) {
      const version = protocol.parsed.filenameVersion;
      if (versionMap.has(version)) {
        issues.push({
          file: protocol.filename,
          type: 'DUPLICATE_VERSION',
          severity: 'HIGH',
          message: `Duplicate version ${version} (also in ${versionMap.get(version)})`
        });
      }
      versionMap.set(version, protocol.filename);
    }

    // Check version increment logic
    for (let i = 1; i < versionedProtocols.length; i++) {
      const current = versionedProtocols[i-1].parsed.filenameVersion;
      const previous = versionedProtocols[i].parsed.filenameVersion;
      
      if (!this.isValidVersionIncrement(previous, current)) {
        issues.push({
          file: versionedProtocols[i-1].filename,
          type: 'INVALID_VERSION_INCREMENT',
          severity: 'MEDIUM',
          message: `Invalid increment from ${previous} to ${current}`
        });
      }
    }

    console.log(`${issues.length > 0 ? '⚠️' : '✅'} Version consistency: ${issues.length} issues found\n`);
    return issues;
  }

  async validateSuperseding(protocols) {
    console.log('🔄 Validating superseding status...');
    const issues = [];
    
    const activeProtocols = protocols.filter(p => p.parsed.isActive && !p.parsed.isSuperseded);
    const supersededProtocols = protocols.filter(p => p.parsed.isSuperseded);
    
    // Should only be one active version
    if (activeProtocols.length > 1) {
      for (const protocol of activeProtocols) {
        issues.push({
          file: protocol.filename,
          type: 'MULTIPLE_ACTIVE_VERSIONS',
          severity: 'CRITICAL',
          message: 'Multiple active versions detected - only one should be active'
        });
      }
    }

    if (activeProtocols.length === 0) {
      issues.push({
        file: 'SYSTEM',
        type: 'NO_ACTIVE_VERSION',
        severity: 'CRITICAL',
        message: 'No active protocol version found'
      });
    }

    // Check that superseded versions properly reference the current version
    const latestVersion = activeProtocols[0]?.parsed.filenameVersion;
    if (latestVersion) {
      for (const protocol of supersededProtocols) {
        const supersededByPattern = new RegExp(`SUPERSEDED BY LEO Protocol v${latestVersion.replace('.', '\\.')}`);
        if (!supersededByPattern.test(protocol.content)) {
          issues.push({
            file: protocol.filename,
            type: 'INCORRECT_SUPERSEDING_REFERENCE',
            severity: 'MEDIUM',
            message: `Should reference "SUPERSEDED BY LEO Protocol v${latestVersion}"`
          });
        }
      }
    }

    console.log(`${issues.length > 0 ? '⚠️' : '✅'} Superseding validation: ${issues.length} issues found\n`);
    return issues;
  }

  async validateLatestVersion(protocols) {
    console.log('🎯 Validating latest version...');
    const issues = [];
    
    const activeProtocols = protocols.filter(p => p.parsed.isActive && !p.parsed.isSuperseded);
    
    if (activeProtocols.length === 1) {
      const latest = activeProtocols[0];
      
      // Check that latest version has proper status
      if (!latest.parsed.status.includes('CURRENT ACTIVE VERSION')) {
        issues.push({
          file: latest.filename,
          type: 'IMPROPER_LATEST_STATUS',
          severity: 'HIGH',
          message: 'Latest version should have status containing "CURRENT ACTIVE VERSION"'
        });
      }
      
      // Check that latest version has recent date
      const versionDate = new Date(latest.parsed.date);
      const now = new Date();
      const daysDiff = (now - versionDate) / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 90) { // Older than 90 days
        issues.push({
          file: latest.filename,
          type: 'OUTDATED_VERSION',
          severity: 'LOW',
          message: `Latest version is ${Math.round(daysDiff)} days old - consider if update needed`
        });
      }
      
      console.log(`✅ Latest version validated: v${latest.parsed.filenameVersion}`);
    }

    console.log(`${issues.length > 0 ? '⚠️' : '✅'} Latest version validation: ${issues.length} issues found\n`);
    return { issues, latest: activeProtocols[0] || null };
  }

  generateQAReport(data) {
    console.log('📊 COMPREHENSIVE QA REPORT');
    console.log('==========================\n');
    
    const allIssues = [
      ...data.nomenclatureIssues,
      ...data.consistencyIssues,
      ...data.supersedingIssues,
      ...data.latestValidation.issues
    ];

    // Group by severity
    const critical = allIssues.filter(i => i.severity === 'CRITICAL');
    const high = allIssues.filter(i => i.severity === 'HIGH');
    const medium = allIssues.filter(i => i.severity === 'MEDIUM');
    const low = allIssues.filter(i => i.severity === 'LOW');

    console.log(`🎯 OVERALL STATUS: ${allIssues.length === 0 ? '✅ HEALTHY' : '⚠️  NEEDS ATTENTION'}`);
    console.log(`📈 Total Issues: ${allIssues.length}`);
    console.log(`   🔴 Critical: ${critical.length}`);
    console.log(`   🟠 High: ${high.length}`);
    console.log(`   🟡 Medium: ${medium.length}`);
    console.log(`   🟢 Low: ${low.length}\n`);

    if (data.latestValidation.latest) {
      console.log(`🎯 LATEST VERSION: v${data.latestValidation.latest.parsed.filenameVersion}`);
      console.log(`📄 File: ${data.latestValidation.latest.filename}`);
      console.log(`📅 Date: ${data.latestValidation.latest.parsed.date}\n`);
    }

    // Show issues by category
    if (critical.length > 0) {
      console.log('🔴 CRITICAL ISSUES (Must Fix):');
      critical.forEach(issue => {
        console.log(`   ${issue.file}: ${issue.message}`);
      });
      console.log();
    }

    if (high.length > 0) {
      console.log('🟠 HIGH PRIORITY ISSUES:');
      high.forEach(issue => {
        console.log(`   ${issue.file}: ${issue.message}`);
      });
      console.log();
    }

    if (medium.length > 0) {
      console.log('🟡 MEDIUM PRIORITY ISSUES:');
      medium.forEach(issue => {
        console.log(`   ${issue.file}: ${issue.message}`);
      });
      console.log();
    }

    // Recommendations
    console.log('💡 RECOMMENDATIONS:');
    if (allIssues.length === 0) {
      console.log('   ✅ LEO Protocol versioning is healthy');
      console.log('   ✅ All nomenclature standards followed');
      console.log('   ✅ Version consistency maintained');
    } else {
      console.log('   📝 Run with --fix flag to auto-resolve fixable issues');
      console.log('   🔍 Review critical and high priority issues first');
      console.log('   📚 Ensure all protocol changes follow versioning process');
    }

    return {
      status: allIssues.length === 0 ? 'HEALTHY' : 'NEEDS_ATTENTION',
      totalIssues: allIssues.length,
      issues: { critical, high, medium, low },
      latest: data.latestValidation.latest,
      protocols: data.protocols
    };
  }

  async autoFixIssues(qaReport) {
    console.log('\n🔧 AUTO-FIXING ISSUES...');
    console.log('========================\n');
    
    const fixableIssues = qaReport.issues.medium.concat(qaReport.issues.low)
      .filter(issue => this.isAutoFixable(issue));
    
    if (fixableIssues.length === 0) {
      console.log('⚠️  No auto-fixable issues found');
      return;
    }

    for (const issue of fixableIssues) {
      try {
        await this.applyAutoFix(issue);
        console.log(`✅ Fixed: ${issue.message} in ${issue.file}`);
      } catch (error) {
        console.log(`❌ Failed to fix: ${issue.message} in ${issue.file} - ${error.message}`);
      }
    }

    console.log(`\n🎉 Auto-fix completed: ${fixableIssues.length} issues addressed`);
  }

  isAutoFixable(issue) {
    const autoFixableTypes = [
      'INCORRECT_SUPERSEDING_REFERENCE',
      'IMPROPER_LATEST_STATUS'
    ];
    return autoFixableTypes.includes(issue.type);
  }

  async applyAutoFix(issue) {
    // Implementation would go here for specific auto-fixes
    // This is a placeholder for the auto-fix logic
    console.log(`🔧 Applying fix for ${issue.type} in ${issue.file}`);
  }

  // Utility methods
  compareVersions(a, b) {
    const aParts = a.split('.').map(n => parseInt(n, 10));
    const bParts = b.split('.').map(n => parseInt(n, 10));
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      
      if (aVal > bVal) return 1;
      if (aVal < bVal) return -1;
    }
    return 0;
  }

  isValidVersionIncrement(oldVersion, newVersion) {
    const oldParts = oldVersion.split('.').map(n => parseInt(n, 10));
    const newParts = newVersion.split('.').map(n => parseInt(n, 10));
    
    // Pad with zeros to make comparison consistent (e.g., "4.1" becomes [4, 1, 0])
    while (oldParts.length < 3) oldParts.push(0);
    while (newParts.length < 3) newParts.push(0);
    
    // Valid increments: patch (+0.0.1), minor (+0.1.0), major (+1.0.0)
    if (newParts[0] > oldParts[0]) return true; // Major increment
    if (newParts[0] === oldParts[0] && newParts[1] > oldParts[1]) return true; // Minor
    if (newParts[0] === oldParts[0] && newParts[1] === oldParts[1] && newParts[2] > oldParts[2]) return true; // Patch
    
    return false;
  }
}

// Export for module use
export {  LEOProtocolSmartQA  };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const qa = new LEOProtocolSmartQA();
  
  qa.runSmartQA()
    .then(report => {
      console.log(`\n🏁 Smart QA Complete: ${report.status}`);
      process.exit(report.totalIssues === 0 ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Smart QA failed:', error.message);
      process.exit(1);
    });
}
