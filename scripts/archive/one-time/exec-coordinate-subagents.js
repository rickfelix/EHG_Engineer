#!/usr/bin/env node

/**
 * EXEC Agent Sub-Agent Coordination Script
 * 
 * This script demonstrates how the EXEC Agent role uses the coordination tool
 * to manage sub-agents during implementation phase.
 * 
 * IMPORTANT: This is used BY the EXEC Agent, not a separate agent itself.
 * 
 * Usage: node scripts/exec-coordinate-subagents.js PRD-2025-001
 */

import EXECCoordinationTool from '../lib/agents/exec-coordination-tool';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Example of EXEC Agent using the coordination tool
 */
async function execAgentCoordinatesSubAgents(prdId) {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           EXEC AGENT - Sub-Agent Coordination              ║
║                                                            ║
║  Role: EXEC Agent (Implementation Phase)                  ║
║  Tool: Sub-Agent Coordination Tool                        ║
║  PRD: ${prdId.padEnd(48)}║
╚════════════════════════════════════════════════════════════╝
`);

  console.log('📋 EXEC Agent Status: Implementation Phase Active\n');
  console.log('As the EXEC Agent, I will now coordinate sub-agents based on PRD requirements.\n');
  
  try {
    // EXEC Agent creates instance of coordination tool
    const coordinationTool = new EXECCoordinationTool();
    
    // EXEC Agent uses tool to coordinate sub-agents
    console.log('🔧 Using coordination tool to manage sub-agents...\n');
    const results = await coordinationTool.coordinate(prdId, {
      path: process.argv[3] || process.cwd(),
      verbose: true
    });
    
    // EXEC Agent reviews results
    console.log('\n📊 EXEC Agent Review of Sub-Agent Results:');
    console.log('=' .repeat(60));
    
    if (results.status === 'success') {
      console.log('✅ Coordination successful');
      console.log(`   Overall Score: ${results.results.overallScore}/100`);
      console.log(`   Agents Activated: ${results.activatedAgents.join(', ')}`);
      console.log(`   Total Findings: ${results.results.totalFindings}`);
      console.log(`   Critical Issues: ${results.results.findingsBySeverity.critical.length}`);
      
      // EXEC Agent decides on integration strategy
      console.log('\n🎯 EXEC Agent Integration Decision:');
      
      if (results.results.findingsBySeverity.critical.length > 0) {
        console.log('   ⚠️  Critical issues found - must address before implementation');
        console.log('   Action: Fix critical issues identified by sub-agents');
      } else if (results.results.overallScore < 60) {
        console.log('   ⚠️  Quality score below threshold');
        console.log('   Action: Implement improvements recommended by sub-agents');
      } else {
        console.log('   ✅ Quality gates passed');
        console.log('   Action: Proceed with implementation including sub-agent recommendations');
      }
      
      // EXEC Agent prepares handback to PLAN
      console.log('\n📝 Preparing handback to PLAN Agent:');
      console.log('   - Including sub-agent reports');
      console.log('   - Documenting issues addressed');
      console.log('   - Providing implementation artifacts');
      
      // Save coordination report for handback
      const handbackPath = path.join(process.cwd(), `exec-handback-${prdId}.json`);
      await fs.writeFile(handbackPath, JSON.stringify({
        execAgent: 'EXEC',
        phase: 'Implementation Complete',
        prdId,
        subAgentCoordination: {
          tool: 'exec-coordination-tool',
          results: results.results,
          activatedAgents: results.activatedAgents,
          timestamp: results.metadata
        },
        nextPhase: 'PLAN Verification'
      }, null, 2));
      
      console.log(`\n💾 Handback prepared: ${handbackPath}`);
      
    } else {
      console.error('❌ Coordination failed:', results.error);
      console.log('\n🔄 EXEC Agent Recovery Action:');
      console.log('   - Review error details');
      console.log('   - Manually activate required sub-agents');
      console.log('   - Document issues for PLAN review');
    }
    
  } catch (error) {
    console.error('❌ EXEC Agent encountered error:', error.message);
    process.exit(1);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('EXEC Agent coordination phase complete.\n');
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1].replace(/\\\\/g, '/')}`) {
  const prdId = process.argv[2];
  
  if (!prdId) {
    console.error('Usage: node scripts/exec-coordinate-subagents.js PRD-YYYY-XXX [path]');
    console.error('\nThis script is used by the EXEC Agent during implementation phase.');
    console.error('It demonstrates how EXEC uses tools to coordinate sub-agents.\n');
    process.exit(1);
  }
  
  execAgentCoordinatesSubAgents(prdId);
}

export default execAgentCoordinatesSubAgents;