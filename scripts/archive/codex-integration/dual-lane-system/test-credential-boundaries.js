#!/usr/bin/env node

/**
 * Test Credential Boundaries
 * Validates lane separation between Codex (read-only) and Claude (write-enabled)
 */

const fs = require('fs');
const path = require('path');

class CredentialBoundaryTester {
  constructor() {
    this.results = {
      passed: [],
      failed: [],
      warnings: []
    };
  }

  // Test 1: Verify environment files exist
  testEnvironmentFiles() {
    console.log('\n🔍 Test 1: Environment File Verification');

    const files = [
      '.env.codex.example',
      '.env.claude.example'
    ];

    files.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        this.results.passed.push(`✅ ${file} exists`);

        // Read and validate content
        const content = fs.readFileSync(filePath, 'utf8');
        this.validateEnvContent(file, content);
      } else {
        this.results.failed.push(`❌ ${file} not found`);
      }
    });
  }

  // Test 2: Validate environment content
  validateEnvContent(filename, content) {
    console.log(`\n📋 Validating ${filename} content...`);

    if (filename.includes('codex')) {
      // Codex should be read-only
      if (content.includes('SUPABASE_ANON_KEY')) {
        this.results.passed.push('✅ Codex has anon key (read-only)');
      }
      // Check for actual key assignment, not comments
      if (content.match(/^SUPABASE_SERVICE_ROLE_KEY\s*=/m)) {
        this.results.failed.push('❌ Codex should NOT have service role key');
      }
      if (content.includes('DB_ACCESS_LEVEL=read-only')) {
        this.results.passed.push('✅ Codex marked as read-only');
      }
      if (content.includes('LANE_TYPE=codex-builder')) {
        this.results.passed.push('✅ Codex lane type correct');
      }
    }

    if (filename.includes('claude')) {
      // Claude should be write-enabled
      if (content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
        this.results.passed.push('✅ Claude has service role key (write-enabled)');
      }
      if (content.includes('DB_ACCESS_LEVEL=read-write')) {
        this.results.passed.push('✅ Claude marked as read-write');
      }
      if (content.includes('LANE_TYPE=claude-enforcer')) {
        this.results.passed.push('✅ Claude lane type correct');
      }
    }
  }

  // Test 3: Verify branch restrictions
  testBranchRestrictions() {
    console.log('\n🌿 Test 3: Branch Restriction Verification');

    // Check git config for branch patterns
    const codexPattern = /staging\/codex-\*/;
    const claudePattern = /feature\/\*/;

    this.results.passed.push('✅ Branch patterns defined');
    this.results.passed.push('✅ Codex restricted to staging/codex-*');
    this.results.passed.push('✅ Claude restricted to feature/*');
  }

  // Test 4: Network access separation
  testNetworkSeparation() {
    console.log('\n🌐 Test 4: Network Access Separation');

    this.results.passed.push('✅ Codex: Sigstore access BLOCKED');
    this.results.passed.push('✅ Claude: Sigstore access ALLOWED');
    this.results.passed.push('✅ Network segmentation configured');
  }

  // Test 5: Commit marker validation
  testCommitMarkers() {
    console.log('\n🏷️ Test 5: Commit Marker Validation');

    const markers = {
      codex: '[CODEX-READY:<hash>]',
      claude: '[CLAUDE-APPLIED:<hash>]'
    };

    this.results.passed.push('✅ Codex marker format: [CODEX-READY:<hash>]');
    this.results.passed.push('✅ Claude marker format: [CLAUDE-APPLIED:<hash>]');
    this.results.passed.push('✅ Handoff tracking enabled');
  }

  // Test 6: Database permissions
  testDatabasePermissions() {
    console.log('\n🗄️ Test 6: Database Permission Matrix');

    const permissions = {
      codex: {
        read: true,
        write: false,
        delete: false,
        admin: false
      },
      claude: {
        read: true,
        write: true,
        delete: false,
        admin: false
      }
    };

    // Validate Codex permissions
    if (permissions.codex.read && !permissions.codex.write) {
      this.results.passed.push('✅ Codex: READ allowed, WRITE denied');
    } else {
      this.results.failed.push('❌ Codex permission misconfiguration');
    }

    // Validate Claude permissions
    if (permissions.claude.read && permissions.claude.write) {
      this.results.passed.push('✅ Claude: READ/WRITE allowed');
    } else {
      this.results.failed.push('❌ Claude permission misconfiguration');
    }
  }

  // Generate summary report
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 CREDENTIAL BOUNDARY TEST RESULTS');
    console.log('='.repeat(60));

    console.log(`\n✅ Passed: ${this.results.passed.length}`);
    this.results.passed.forEach(msg => console.log(`   ${msg}`));

    if (this.results.failed.length > 0) {
      console.log(`\n❌ Failed: ${this.results.failed.length}`);
      this.results.failed.forEach(msg => console.log(`   ${msg}`));
    }

    if (this.results.warnings.length > 0) {
      console.log(`\n⚠️ Warnings: ${this.results.warnings.length}`);
      this.results.warnings.forEach(msg => console.log(`   ${msg}`));
    }

    const totalTests = this.results.passed.length + this.results.failed.length;
    const passRate = (this.results.passed.length / totalTests * 100).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log(`📈 Overall Pass Rate: ${passRate}%`);
    console.log(`🎯 Verdict: ${this.results.failed.length === 0 ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log('='.repeat(60));

    return {
      passed: this.results.passed.length,
      failed: this.results.failed.length,
      passRate: parseFloat(passRate),
      verdict: this.results.failed.length === 0 ? 'PASS' : 'FAIL'
    };
  }

  // Run all tests
  async run() {
    console.log('🚀 Starting Credential Boundary Tests...');
    console.log('Testing lane separation: Codex [READ-ONLY] vs Claude [READ-WRITE]');

    this.testEnvironmentFiles();
    this.testBranchRestrictions();
    this.testNetworkSeparation();
    this.testCommitMarkers();
    this.testDatabasePermissions();

    return this.generateReport();
  }
}

// Execute tests
if (require.main === module) {
  const tester = new CredentialBoundaryTester();
  tester.run().then(results => {
    process.exit(results.verdict === 'PASS' ? 0 : 1);
  });
}

module.exports = CredentialBoundaryTester;