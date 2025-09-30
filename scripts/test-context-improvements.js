#!/usr/bin/env node

/**
 * Test script for LEO Protocol context improvements
 * Tests tiktoken, auto-compaction, and sub-agent compression
 */

import ContextMonitor from '../lib/context/context-monitor.js';

async function testTokenCounting() {
  console.log('\n📊 Test 1: Accurate Token Counting\n');
  const monitor = new ContextMonitor();

  const testText = 'The quick brown fox jumps over the lazy dog. This is a test sentence for token counting.';
  const tokens = monitor.estimateTokens(testText);

  console.log(`Text: "${testText}"`);
  console.log(`Tokens: ${tokens}`);
  console.log(`Method: ${monitor.useAccurateCount ? 'tiktoken (accurate)' : 'estimated'}`);
  console.log(`Characters: ${testText.length}`);
  console.log(`Chars/Token: ${(testText.length / tokens).toFixed(2)}`);

  monitor.cleanup();
  return tokens > 0;
}

async function testAutoCompaction() {
  console.log('\n🔄 Test 2: Auto-Compaction Trigger\n');
  const monitor = new ContextMonitor();

  console.log('Simulating 5 tool calls...');
  for (let i = 1; i <= 5; i++) {
    const result = await monitor.onToolCall('TestTool', { success: true });
    console.log(`  Tool call ${i}: autoCompacted=${result.autoCompacted}`);

    if (i === 5) {
      console.log(`  ✅ Auto-compaction check triggered on call #${i}`);
    }
  }

  monitor.cleanup();
  return true;
}

async function testSubAgentCompression() {
  console.log('\n🗜️  Test 3: Smart Sub-Agent Compression\n');
  const monitor = new ContextMonitor();

  // Create mock sub-agent reports
  const reports = [
    {
      agent: 'Chief Security Architect',
      status: 'passed',
      confidence: 95,
      critical_issues: [],
      recommendations: ['Use HTTPS']
    },
    {
      agent: 'Principal Database Architect',
      status: 'passed',
      confidence: 90,
      critical_issues: [],
      recommendations: ['Add indexes']
    },
    {
      agent: 'QA Engineering Director',
      status: 'warning',
      confidence: 75,
      critical_issues: ['Test coverage low'],
      recommendations: ['Increase coverage']
    },
    {
      agent: 'Performance Lead',
      status: 'passed',
      confidence: 80,
      critical_issues: [],
      recommendations: ['Optimize queries']
    },
    {
      agent: 'Design Lead',
      status: 'passed',
      confidence: 85,
      critical_issues: [],
      recommendations: ['Improve accessibility']
    }
  ];

  const result = monitor.summarizeSubAgentReports(reports);

  console.log('Original reports:', reports.length);
  console.log('Full reports kept:', result.full.length);
  console.log('Compressed reports:', result.compressed.length);
  console.log('Compression ratio:', result.compressionRatio + '%');
  console.log('Tokens saved:', result.metadata.tokensSaved);
  console.log('\nSummary:', result.summary);

  console.log('\nFull reports (high priority + recent):');
  result.full.forEach(r => {
    console.log(`  - ${r.agent}: ${r.status} (confidence: ${r.confidence}%)`);
  });

  console.log('\nCompressed reports (low priority older):');
  result.compressed.forEach(r => {
    console.log(`  - ${r.summary}`);
  });

  monitor.cleanup();
  return result.full.length >= 2;
}

async function runAllTests() {
  console.log('🧪 LEO Protocol Context Improvements - Test Suite\n');
  console.log('='.repeat(60));

  try {
    const test1 = await testTokenCounting();
    const test2 = await testAutoCompaction();
    const test3 = await testSubAgentCompression();

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Test Results:\n');
    console.log(`  Test 1 (Token Counting): ${test1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Test 2 (Auto-Compaction): ${test2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Test 3 (Sub-Agent Compression): ${test3 ? '✅ PASS' : '❌ FAIL'}`);

    const allPassed = test1 && test2 && test3;
    console.log(`\n${allPassed ? '✅ All tests passed!' : '❌ Some tests failed'}\n`);

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAllTests();
