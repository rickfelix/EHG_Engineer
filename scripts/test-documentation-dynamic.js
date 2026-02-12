#!/usr/bin/env node

/**
 * Test Dynamic Documentation Sub-Agent
 * Can analyze any path, not hardcoded
 */

import path from 'path';
import fs from 'fs';
import DynamicDocumentationSubAgent from '../lib/agents/documentation-sub-agent-dynamic';
import DocumentationSubAgent from '../lib/agents/documentation-sub-agent';

// Parse command-line arguments
const targetPath = process.argv[2] || process.cwd();

console.log('📚 Testing Dynamic Documentation Sub-Agent');
console.log(`📁 Target Path: ${targetPath}`);

// Check if path exists
if (!fs.existsSync(targetPath)) {
  console.error(`❌ Path does not exist: ${targetPath}`);
  process.exit(1);
}

// Check if we can load the dynamic agent
try {
  const agent = new DynamicDocumentationSubAgent();
  
  console.log('✅ Dynamic agent loaded successfully');
  console.log('\n📊 Running documentation analysis...\n');
  
  agent.execute({ path: targetPath })
    .then(results => {
      console.log('\n📚 Documentation Analysis Complete!');
      console.log(`Score: ${results.score}/100`);
      console.log(`README Issues: ${results.readme?.issues?.length || 0}`);
      console.log(`API Doc Issues: ${results.apiDocs?.issues?.length || 0}`);
      console.log(`Code Coverage: ${results.codeCoverage?.percentage || 0}%`);
      
      // Save full report
      const reportName = `documentation-report-${path.basename(targetPath)}.json`;
      const reportPath = path.join(process.cwd(), reportName);
      fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
      console.log(`\n💾 Full report saved to: ${reportPath}`);
    })
    .catch(error => {
      console.error('❌ Error during documentation analysis:', error.message);
      
      // Fall back to the original hardcoded version
      console.log('\n⚠️ Falling back to original Documentation Sub-Agent...');
      const fallbackAgent = new DocumentationSubAgent();
      
      fallbackAgent.execute({ path: targetPath })
        .then(results => {
          console.log('\n📚 Documentation Analysis Complete (Fallback)!');
          console.log(`Score: ${results.score}/100`);
          
          const reportName = `documentation-report-fallback-${path.basename(targetPath)}.json`;
          const reportPath = path.join(process.cwd(), reportName);
          fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
          console.log(`\n💾 Full report saved to: ${reportPath}`);
        })
        .catch(err => {
          console.error('❌ Fallback also failed:', err.message);
        });
    });
    
} catch (_error) {
  console.error('❌ Could not load dynamic agent:', error.message);
  console.log('\n🔧 Using original Documentation Sub-Agent instead...');
  
  // Use the original non-dynamic version
  const agent = new DocumentationSubAgent();
  
  agent.execute({ path: targetPath })
    .then(results => {
      console.log('\n📚 Documentation Analysis Complete!');
      console.log(`Score: ${results.score}/100`);
      console.log(`README Issues: ${results.readme?.issues?.length || 0}`);
      console.log(`API Doc Issues: ${results.apiDocs?.issues?.length || 0}`);
      console.log(`Code Coverage: ${results.codeCoverage?.percentage || 0}%`);
      
      const reportName = `documentation-report-${path.basename(targetPath)}.json`;
      const reportPath = path.join(process.cwd(), reportName);
      fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
      console.log(`\n💾 Full report saved to: ${reportPath}`);
    })
    .catch(err => {
      console.error('❌ Error during documentation analysis:', err.message);
    });
}

// Show example usage
console.log('\n📖 Usage Examples:');
console.log('   node test-documentation-dynamic.js                     # Analyze current directory');
console.log('   node test-documentation-dynamic.js /path/to/project    # Analyze specific project');
console.log('   node test-documentation-dynamic.js ../other-project    # Analyze relative path');