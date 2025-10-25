#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * LEO Protocol Latest Version Detector
 * Scans all protocol files to determine the latest active version
 */

import fs from 'fs';
import path from 'path';

class LEOProtocolVersionDetector {
  constructor() {
    this.protocolsDir = path.join(__dirname, '..', 'docs', '03_protocols_and_standards');
    this.versions = [];
  }

  async scanProtocolFiles() {
    try {
      const files = await fs.promises.readdir(this.protocolsDir);
      const protocolFiles = files.filter(file => file.startsWith('leo_protocol_v') && file.endsWith('.md'));
      
      console.log('📋 Found LEO Protocol files:');
      
      for (const file of protocolFiles) {
        const filePath = path.join(this.protocolsDir, file);
        const content = await fs.promises.readFile(filePath, 'utf8');
        
        const versionInfo = this.parseVersionInfo(content, file);
        if (versionInfo) {
          this.versions.push(versionInfo);
          console.log(`  ${file} - v${versionInfo.version} - ${versionInfo.status}`);
        }
      }
      
      return this.findLatestVersion();
    } catch (error) {
      console.error('❌ Error scanning protocol files:', error.message);
      return null;
    }
  }

  parseVersionInfo(content, filename) {
    // Extract version from filename
    const versionMatch = filename.match(/leo_protocol_v(.+)\.md$/);
    if (!versionMatch) return null;
    
    let version = versionMatch[1];
    
    // Extract status from content
    const statusMatch = content.match(/\*\*Status\*\*:\s*([^\n]+)/i);
    const status = statusMatch ? statusMatch[1].trim() : 'Unknown';
    
    // Extract date
    const dateMatch = content.match(/\*\*Date\*\*:\s*([^\n]+)/i);
    const date = dateMatch ? dateMatch[1].trim() : null;
    
    // Check if superseded
    const isSuperseded = content.includes('SUPERSEDED') || status.includes('SUPERSEDED');
    
    return {
      filename,
      version,
      status,
      date,
      isSuperseded,
      isActive: !isSuperseded && (status.includes('ACTIVE') || status.includes('CURRENT') || status.includes('Critical Update'))
    };
  }

  findLatestVersion() {
    if (this.versions.length === 0) {
      console.log('❌ No protocol versions found');
      return null;
    }

    // Sort versions - prioritize active versions and higher version numbers
    this.versions.sort((a, b) => {
      // Active versions first
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      
      // Then by version number (crude but works for our format)
      return this.compareVersions(b.version, a.version);
    });

    console.log('\n🎯 VERSION ANALYSIS:');
    console.log('==================');
    
    const activeVersions = this.versions.filter(v => v.isActive);
    const supersededVersions = this.versions.filter(v => v.isSuperseded);
    
    console.log(`Active Versions: ${activeVersions.length}`);
    activeVersions.forEach(v => {
      console.log(`  ✅ v${v.version} (${v.filename}) - ${v.status}`);
    });
    
    console.log(`\nSuperseded Versions: ${supersededVersions.length}`);
    supersededVersions.forEach(v => {
      console.log(`  ⚠️  v${v.version} (${v.filename}) - ${v.status}`);
    });

    const latest = this.versions[0];
    console.log('\n🟢 LATEST VERSION DETECTED:');
    console.log(`   Version: ${latest.version}`);
    console.log(`   File: ${latest.filename}`);
    console.log(`   Status: ${latest.status}`);
    console.log(`   Active: ${latest.isActive ? 'YES' : 'NO'}`);
    
    return latest;
  }

  compareVersions(a, b) {
    // Simple version comparison for our format (4.1.2 vs 4.1.1, etc.)
    const aParts = a.split('.').map(n => parseInt(n, 10) || 0);
    const bParts = b.split('.').map(n => parseInt(n, 10) || 0);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      
      if (aVal > bVal) return 1;
      if (aVal < bVal) return -1;
    }
    
    return 0;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const detector = new LEOProtocolVersionDetector();
  
  detector.scanProtocolFiles()
    .then(latest => {
      if (latest) {
        console.log(`\n🎯 Use this version for all implementations: docs/03_protocols_and_standards/${latest.filename}`);
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Detection failed:', error.message);
      process.exit(1);
    });
}

export {  LEOProtocolVersionDetector  };
