#!/usr/bin/env node
/**
 * Quick test for OllamaAdapter
 *
 * Usage: node scripts/benchmarks/test-ollama-adapter.mjs
 */

import { OllamaAdapter, getLocalFirstAdapter } from '../../lib/sub-agents/vetting/provider-adapters.js';

async function main() {
  console.log('Testing OllamaAdapter with qwen3-coder:30b\n');

  const adapter = new OllamaAdapter({
    model: 'qwen3-coder:30b',
    fallbackEnabled: false // Disable fallback for this test
  });

  // Test 1: Check availability
  console.log('1. Checking Ollama availability...');
  const available = await adapter.isAvailable();
  console.log(`   Ollama available: ${available}\n`);

  if (!available) {
    console.error('Ollama not running. Start with: ollama serve');
    process.exit(1);
  }

  // Test 2: Classification task (typical Haiku workload)
  console.log('2. Testing classification (Haiku replacement task)...');
  const classifyResult = await adapter.complete(
    'You are a classifier. Respond with ONLY one word: BUG, FEATURE, REFACTOR, or DOCS. No explanation.',
    'Fix the null pointer exception in user login'
  );
  console.log(`   Response: "${classifyResult.content.trim()}"`);
  console.log(`   Expected: "BUG"`);
  console.log(`   Duration: ${classifyResult.durationMs}ms`);
  console.log(`   Local: ${classifyResult.local}\n`);

  // Test 3: JSON output
  console.log('3. Testing JSON output...');
  const jsonResult = await adapter.complete(
    'You are a JSON generator. Output ONLY valid JSON, no markdown, no explanation.',
    'Generate a JSON object with fields: name (string), age (number), active (boolean).'
  );
  console.log(`   Response: ${jsonResult.content.trim().substring(0, 100)}`);
  try {
    JSON.parse(jsonResult.content.trim());
    console.log('   Valid JSON: YES');
  } catch {
    console.log('   Valid JSON: NO');
  }
  console.log(`   Duration: ${jsonResult.durationMs}ms\n`);

  // Test 4: getLocalFirstAdapter helper
  console.log('4. Testing getLocalFirstAdapter helper...');
  const smartAdapter = getLocalFirstAdapter();
  const smartResult = await smartAdapter.complete(
    'Respond with only: OK',
    'Test'
  );
  console.log(`   Response: "${smartResult.content.trim()}"`);
  console.log(`   Provider: ${smartResult.provider}`);
  console.log(`   Fallback used: ${smartResult.fallback || false}\n`);

  console.log('All tests completed!');
}

main().catch(error => {
  console.error('Test failed:', error.message);
  process.exit(1);
});
