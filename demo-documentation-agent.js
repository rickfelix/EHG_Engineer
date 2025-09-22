#!/usr/bin/env node

/**
 * Context-Aware Documentation Agent Demonstration
 * ===============================================
 * Shows how the Documentation sub-agent intelligently handles
 * multi-application environments and provides SaaS-grade organization
 */

import { ContextAwareDocumentationAgent } from './lib/agents/documentation-agent.js';

async function demonstrateDocumentationAgent() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         CONTEXT-AWARE DOCUMENTATION AGENT DEMO               ║');
  console.log('║   Multi-Application Documentation Management & Organization   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  
  // Initialize the documentation agent
  const docAgent = new ContextAwareDocumentationAgent();
  await docAgent.initialize();
  
  console.log('=' .repeat(70) + '\n');
  
  // ============================================================
  // DEMO 1: Application Context Discovery
  // ============================================================
  console.log('📋 DEMO 1: Application Context Discovery');
  console.log('─'.repeat(60));
  
  console.log('🔍 Discovered Application Contexts:');
  for (const [contextName, context] of docAgent.applicationContexts) {
    console.log(`\n   📱 ${context.name} (${contextName})`);
    console.log(`      Type: ${context.type}`);
    console.log(`      Role: ${context.role}`);
    console.log(`      Root: ${context.root.replace(process.cwd(), '.')}`);
    
    if (context.technology) {
      console.log(`      Technology: ${context.technology}`);
    }
    
    if (context.documentationFocus) {
      console.log(`      Documentation Focus:`);
      context.documentationFocus.forEach(focus => {
        console.log(`        • ${focus}`);
      });
    }
  }
  
  console.log('\n' + '=' .repeat(70) + '\n');
  
  // ============================================================
  // DEMO 2: Context-Aware Documentation Structure
  // ============================================================
  console.log('📋 DEMO 2: Context-Aware Documentation Structure');
  console.log('─'.repeat(60));
  
  const structure = docAgent.getDocumentationStructure('current');
  if (structure) {
    console.log('📁 Recommended Documentation Structure:');
    Object.entries(structure).forEach(([path, description]) => {
      const icon = path.endsWith('/') ? '📁' : '📄';
      console.log(`   ${icon} ${path.padEnd(30)} ${description}`);
    });
  } else {
    console.log('⚠️  No structure available for current context');
  }
  
  console.log('\n' + '=' .repeat(70) + '\n');
  
  // ============================================================
  // DEMO 3: Documentation Health Audit
  // ============================================================
  console.log('📋 DEMO 3: Documentation Health Audit');
  console.log('─'.repeat(60));
  
  try {
    console.log('🔍 Running documentation audit...');
    const audit = await docAgent.auditDocumentationOrganization('current');
    
    console.log(`\n📊 Audit Results for ${audit.context}:`);
    console.log(`   Overall Health Score: ${audit.health_score}/100 ${audit.health_score >= 80 ? '✅' : '⚠️'}`);
    console.log(`   Timestamp: ${audit.timestamp}`);
    
    console.log('\n📋 Issues Found:');
    console.log(`   Misplaced Files: ${audit.findings.misplaced_files.length}`);
    console.log(`   Missing Structure: ${audit.findings.missing_structure.length}`);
    console.log(`   Broken Links: ${audit.findings.broken_links.length}`);
    console.log(`   Outdated Docs: ${audit.findings.outdated_docs.length}`);
    
    if (audit.findings.misplaced_files.length > 0) {
      console.log('\n📄 Misplaced Files:');
      audit.findings.misplaced_files.slice(0, 5).forEach(file => {
        console.log(`   • ${file.file}`);
        console.log(`     → Should be: ${file.suggested_location.replace(process.cwd(), '.')}`);
        console.log(`     Reason: ${file.reason}`);
      });
      
      if (audit.findings.misplaced_files.length > 5) {
        console.log(`   ... and ${audit.findings.misplaced_files.length - 5} more`);
      }
    }
    
    if (audit.findings.missing_structure.length > 0) {
      console.log('\n📁 Missing Directories:');
      audit.findings.missing_structure.forEach(missing => {
        console.log(`   • ${missing.directory}`);
        console.log(`     Path: ${missing.expected_path.replace(process.cwd(), '.')}`);
      });
    }
    
    console.log('\n💡 Recommendations:');
    audit.recommendations.forEach(rec => {
      const priorityIcon = rec.priority === 'high' ? '🔴' : 
                          rec.priority === 'medium' ? '🟡' : '🟢';
      console.log(`   ${priorityIcon} [${rec.priority.toUpperCase()}] ${rec.action}`);
      console.log(`      ${rec.description}`);
    });
    
  } catch (error) {
    console.log(`❌ Audit failed: ${error.message}`);
  }
  
  console.log('\n' + '=' .repeat(70) + '\n');
  
  // ============================================================
  // DEMO 4: Auto-Organization Simulation
  // ============================================================
  console.log('📋 DEMO 4: Auto-Organization Simulation');
  console.log('─'.repeat(60));
  
  try {
    console.log('🤖 Simulating auto-organization (dry run)...');
    const result = await docAgent.autoOrganizeDocumentation('current', true);
    
    console.log(`\n📊 Organization Plan for ${result.context}:`);
    console.log(`   Actions to Take: ${result.actions_taken}`);
    console.log(`   Mode: ${result.dry_run ? 'Dry Run (Simulation)' : 'Live Execution'}`);
    
    if (result.actions.length > 0) {
      console.log('\n📋 Planned Actions:');
      result.actions.forEach((action, i) => {
        console.log(`   ${i + 1}. ${action}`);
      });
    } else {
      console.log('\n✅ No organization actions needed - documentation is well organized!');
    }
    
  } catch (error) {
    console.log(`❌ Auto-organization failed: ${error.message}`);
  }
  
  console.log('\n' + '=' .repeat(70) + '\n');
  
  // ============================================================
  // DEMO 5: Cross-Application Documentation Links
  // ============================================================
  console.log('📋 DEMO 5: Cross-Application Documentation Links');
  console.log('─'.repeat(60));
  
  try {
    console.log('🔗 Analyzing cross-application documentation links...');
    const links = await docAgent.generateCrossApplicationLinks();
    
    const linkCount = Object.keys(links).length;
    if (linkCount > 0) {
      console.log(`\n📊 Found ${linkCount} cross-application reference(s):`);
      
      Object.entries(links).forEach(([linkKey, references]) => {
        console.log(`\n   ${linkKey}:`);
        references.forEach(ref => {
          console.log(`     📄 ${ref.source_file}`);
          console.log(`       → References: ${ref.target_app}`);
          console.log(`       → Suggested link: ${ref.suggested_link}`);
        });
      });
    } else {
      console.log('\n📊 No cross-application documentation links found');
      console.log('   This is normal for single-application contexts');
    }
    
  } catch (error) {
    console.log(`❌ Link analysis failed: ${error.message}`);
  }
  
  console.log('\n' + '=' .repeat(70) + '\n');
  
  // ============================================================
  // DEMO 6: Documentation Health Report
  // ============================================================
  console.log('📋 DEMO 6: Multi-Application Health Report');
  console.log('─'.repeat(60));
  
  try {
    console.log('📊 Generating comprehensive health report...');
    const healthReport = await docAgent.generateHealthReport();
    
    console.log(`\n📈 Documentation Health Report:`);
    console.log(`   Generated: ${healthReport.timestamp}`);
    console.log(`   Overall Health: ${healthReport.overall_health}/100 ${healthReport.overall_health >= 80 ? '✅' : '⚠️'}`);
    console.log(`   Contexts Analyzed: ${Object.keys(healthReport.contexts).length}`);
    
    console.log('\n📊 Per-Context Health:');
    Object.entries(healthReport.contexts).forEach(([contextName, context]) => {
      const healthIcon = context.health_score >= 80 ? '✅' : 
                        context.health_score >= 60 ? '⚠️' : '❌';
      
      console.log(`\n   ${healthIcon} ${contextName} (${context.type})`);
      if (context.error) {
        console.log(`      Error: ${context.error}`);
      } else {
        console.log(`      Health Score: ${context.health_score}/100`);
        console.log(`      Issues:`);
        console.log(`        • Misplaced files: ${context.issues.misplaced_files}`);
        console.log(`        • Missing structure: ${context.issues.missing_structure}`);
        console.log(`        • Recommendations: ${context.issues.total_recommendations}`);
      }
    });
    
  } catch (error) {
    console.log(`❌ Health report failed: ${error.message}`);
  }
  
  console.log('\n' + '=' .repeat(70));
  
  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                     DEMONSTRATION COMPLETE                    ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║  ✅ Application Context Discovery                            ║');
  console.log('║  ✅ Context-Aware Documentation Structures                   ║');
  console.log('║  ✅ Intelligent Documentation Health Auditing               ║');
  console.log('║  ✅ Automated Organization with Dry Run                     ║');
  console.log('║  ✅ Cross-Application Documentation Linking                  ║');
  console.log('║  ✅ Multi-Application Health Reporting                       ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║  🏆 SaaS-Grade Documentation Management                      ║');
  console.log('║     Inspired by: Stripe, Notion, GitBook, Confluence        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  console.log('\n🎯 Key Capabilities Demonstrated:');
  console.log('• Multi-application context awareness (EHG_Engineer + generated apps)');
  console.log('• Intelligent file organization based on content analysis');
  console.log('• Health scoring with actionable recommendations');
  console.log('• Cross-application documentation linking');
  console.log('• SaaS-grade documentation governance');
  
  console.log('\n💡 Next Actions:');
  console.log('1. Run auto-organization without dry-run: docAgent.autoOrganizeDocumentation("current", false)');
  console.log('2. Set up automated weekly documentation audits');
  console.log('3. Implement broken link detection and fixing');
  console.log('4. Create documentation templates for new features');
  
  console.log('\n🚀 The Documentation Sub-Agent is now equipped with:');
  console.log('• Stripe-level API documentation organization');
  console.log('• Notion-style workspace management');
  console.log('• GitBook enterprise governance patterns');
  console.log('• Confluence cross-application linking');
}

// Run the demonstration
demonstrateDocumentationAgent().catch(console.error);