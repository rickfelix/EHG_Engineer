#!/usr/bin/env node

/**
 * LEO Evidence Capture
 * Captures and organizes completion evidence for LEO Protocol tasks
 * For use by PLAN and EXEC agents when completing tasks
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class EvidenceCapture {
  constructor(taskId, agentRole = 'EXEC') {
    this.taskId = taskId;
    this.agentRole = agentRole;
    this.evidenceDir = path.join('docs', 'verification-packages', taskId);
    this.evidence = {
      taskId,
      agentRole,
      timestamp: new Date().toISOString(),
      artifacts: [],
      testResults: [],
      screenshots: [],
      metrics: {},
      visionQA: null
    };
  }

  /**
   * Capture file modifications as evidence
   */
  captureFileArtifacts(files) {
    console.log(`📁 Capturing ${files.length} file artifacts...`);
    
    files.forEach(file => {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        this.evidence.artifacts.push({
          path: file,
          type: path.extname(file),
          size: stats.size,
          modified: stats.mtime.toISOString(),
          hash: this.getFileHash(file)
        });
        console.log(`   ✓ ${file}`);
      }
    });
  }

  /**
   * Capture test results
   */
  captureTestResults(testCommand) {
    console.log(`🧪 Running tests: ${testCommand}`);
    
    try {
      const output = execSync(testCommand, { encoding: 'utf8' });
      const passed = !output.includes('FAIL') && !output.includes('Error');
      
      this.evidence.testResults.push({
        command: testCommand,
        passed,
        output: output.substring(0, 5000), // Limit output size
        timestamp: new Date().toISOString()
      });
      
      console.log(`   ${passed ? '✅ Tests passed' : '❌ Tests failed'}`);
      return passed;
    } catch (error) {
      this.evidence.testResults.push({
        command: testCommand,
        passed: false,
        error: error.message
      });
      console.log(`   ❌ Test execution failed`);
      return false;
    }
  }

  /**
   * Capture Vision QA results
   */
  captureVisionQA(sessionId) {
    console.log(`👁️ Capturing Vision QA session: ${sessionId}`);
    
    // Check for Vision QA database records
    try {
      const query = `SELECT * FROM vision_qa_session_summaries WHERE session_id = '${sessionId}'`;
      const result = execSync(`psql "$DATABASE_URL" -t -c "${query}"`, { encoding: 'utf8' });
      
      if (result.trim()) {
        this.evidence.visionQA = {
          sessionId,
          captured: true,
          summary: result.trim()
        };
        console.log(`   ✓ Vision QA evidence captured`);
      }
    } catch {
      console.log(`   ⚠️ Could not capture Vision QA from database`);
    }
    
    // Check for screenshots
    const screenshotDir = path.join('screenshots', sessionId);
    if (fs.existsSync(screenshotDir)) {
      const screenshots = fs.readdirSync(screenshotDir);
      this.evidence.screenshots = screenshots.map(file => 
        path.join(screenshotDir, file)
      );
      console.log(`   ✓ ${screenshots.length} screenshots captured`);
    }
  }

  /**
   * Capture performance metrics
   */
  captureMetrics(metrics) {
    console.log(`📊 Capturing performance metrics...`);
    
    this.evidence.metrics = {
      ...this.evidence.metrics,
      ...metrics,
      captured: new Date().toISOString()
    };
    
    Object.entries(metrics).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
  }

  /**
   * Capture git commit information
   */
  captureGitInfo() {
    console.log(`📝 Capturing git information...`);
    
    try {
      const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      const lastCommit = execSync('git log -1 --oneline', { encoding: 'utf8' }).trim();
      const status = execSync('git status --short', { encoding: 'utf8' }).trim();
      
      this.evidence.git = {
        branch,
        lastCommit,
        uncommittedChanges: status.split('\n').filter(l => l).length,
        status: status || 'clean'
      };
      
      console.log(`   Branch: ${branch}`);
      console.log(`   Last commit: ${lastCommit}`);
      console.log(`   Uncommitted: ${this.evidence.git.uncommittedChanges} files`);
    } catch (error) {
      console.log(`   ⚠️ Could not capture git info: ${error.message}`);
    }
  }

  /**
   * Generate evidence report
   */
  generateReport() {
    console.log(`\n📋 Generating evidence report...`);
    
    // Create evidence directory
    if (!fs.existsSync(this.evidenceDir)) {
      fs.mkdirSync(this.evidenceDir, { recursive: true });
    }
    
    // Generate markdown report
    const reportPath = path.join(this.evidenceDir, 'evidence-report.md');
    const report = this.formatMarkdownReport();
    fs.writeFileSync(reportPath, report);
    console.log(`   ✓ Report: ${reportPath}`);
    
    // Save JSON evidence
    const jsonPath = path.join(this.evidenceDir, 'evidence.json');
    fs.writeFileSync(jsonPath, JSON.stringify(this.evidence, null, 2));
    console.log(`   ✓ JSON: ${jsonPath}`);
    
    // Copy screenshots if any
    if (this.evidence.screenshots.length > 0) {
      const screenshotTargetDir = path.join(this.evidenceDir, 'screenshots');
      if (!fs.existsSync(screenshotTargetDir)) {
        fs.mkdirSync(screenshotTargetDir);
      }
      
      this.evidence.screenshots.forEach(screenshot => {
        const target = path.join(screenshotTargetDir, path.basename(screenshot));
        if (fs.existsSync(screenshot)) {
          fs.copyFileSync(screenshot, target);
        }
      });
      console.log(`   ✓ Screenshots: ${this.evidence.screenshots.length} copied`);
    }
    
    return reportPath;
  }

  /**
   * Format evidence as markdown
   */
  formatMarkdownReport() {
    return `# Evidence Report: ${this.taskId}

**Agent:** ${this.agentRole}  
**Generated:** ${new Date().toISOString()}  
**Status:** ${this.getOverallStatus()}

## Summary

- **Files Modified:** ${this.evidence.artifacts.length}
- **Tests Run:** ${this.evidence.testResults.length}
- **Tests Passed:** ${this.evidence.testResults.filter(t => t.passed).length}/${this.evidence.testResults.length}
- **Screenshots:** ${this.evidence.screenshots.length}
${this.evidence.visionQA ? `- **Vision QA:** Session ${this.evidence.visionQA.sessionId}` : ''}

## Git Information

- **Branch:** ${this.evidence.git?.branch || 'N/A'}
- **Last Commit:** ${this.evidence.git?.lastCommit || 'N/A'}
- **Uncommitted Changes:** ${this.evidence.git?.uncommittedChanges || 0}

## File Artifacts

${this.evidence.artifacts.map(a => `- \`${a.path}\` (${a.size} bytes, modified ${new Date(a.modified).toLocaleString()})`).join('\n')}

## Test Results

${this.evidence.testResults.map(t => `### ${t.command}
- **Status:** ${t.passed ? '✅ Passed' : '❌ Failed'}
- **Time:** ${t.timestamp}
${t.error ? `- **Error:** ${t.error}` : ''}
`).join('\n')}

${this.evidence.metrics && Object.keys(this.evidence.metrics).length > 0 ? `## Performance Metrics

${Object.entries(this.evidence.metrics)
  .filter(([k]) => k !== 'captured')
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join('\n')}
` : ''}

${this.evidence.visionQA ? `## Vision QA Results

- **Session ID:** ${this.evidence.visionQA.sessionId}
- **Status:** ${this.evidence.visionQA.captured ? 'Captured' : 'Not Available'}
` : ''}

## Raw Evidence

\`\`\`json
${JSON.stringify(this.evidence, null, 2)}
\`\`\`
`;
  }

  /**
   * Get file hash for integrity
   */
  getFileHash(filePath) {
    try {
      const crypto = require('crypto');
      const content = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
    } catch {
      return 'unknown';
    }
  }

  /**
   * Determine overall status
   */
  getOverallStatus() {
    const allTestsPassed = this.evidence.testResults.every(t => t.passed);
    const hasArtifacts = this.evidence.artifacts.length > 0;
    
    if (allTestsPassed && hasArtifacts) return '✅ Complete';
    if (!allTestsPassed) return '⚠️ Tests Failed';
    if (!hasArtifacts) return '⚠️ No Artifacts';
    return '✓ Partial';
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log(`
Usage: leo-evidence-capture <task-id> [options]

Options:
  --role <LEAD|PLAN|EXEC>   Agent role (default: EXEC)
  --files <file1,file2>      Comma-separated list of files to capture
  --test <command>           Test command to run
  --vision-qa <session-id>   Vision QA session ID
  --metrics <json>           JSON string of metrics
  --git                      Capture git information

Example:
  node scripts/leo-evidence-capture.js SD-001-Task-1 \\
    --files "app/page.tsx,lib/api.ts" \\
    --test "npm test" \\
    --vision-qa "TEST-APP-001-20250830" \\
    --git
`);
    process.exit(1);
  }
  
  const taskId = args[0];
  let role = 'EXEC';
  const capture = new EvidenceCapture(taskId, role);
  
  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];
    
    switch (arg) {
      case '--role':
        capture.agentRole = value;
        i++;
        break;
        
      case '--files':
        if (value) {
          const files = value.split(',').map(f => f.trim());
          capture.captureFileArtifacts(files);
          i++;
        }
        break;
        
      case '--test':
        if (value) {
          capture.captureTestResults(value);
          i++;
        }
        break;
        
      case '--vision-qa':
        if (value) {
          capture.captureVisionQA(value);
          i++;
        }
        break;
        
      case '--metrics':
        if (value) {
          try {
            const metrics = JSON.parse(value);
            capture.captureMetrics(metrics);
          } catch (e) {
            console.error('Invalid metrics JSON:', e.message);
          }
          i++;
        }
        break;
        
      case '--git':
        capture.captureGitInfo();
        break;
    }
  }
  
  // Generate report
  const reportPath = capture.generateReport();
  console.log(`\n✅ Evidence captured successfully!`);
  console.log(`📄 Report: ${reportPath}`);
}

module.exports = EvidenceCapture;