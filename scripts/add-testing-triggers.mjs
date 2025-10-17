#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('\n🔧 ADDING TESTING SUB-AGENT TRIGGERS');
console.log('======================================================================\n');

// Get TESTING sub-agent ID
const { data: subAgent, error: subAgentError } = await supabase
  .from('leo_sub_agents')
  .select('id')
  .eq('code', 'TESTING')
  .single();

if (subAgentError || !subAgent) {
  console.error('❌ Failed to find TESTING sub-agent:', subAgentError?.message);
  process.exit(1);
}

const newTriggers = [
  {
    sub_agent_id: subAgent.id,
    trigger_type: 'keyword',
    trigger_phrase: 'protected route',
    trigger_context: 'any context',
    active: true,
    priority: 8,
    metadata: { description: 'Triggered when dealing with protected routes - reminds to check for ProtectedRoute wrapper and use authentication helpers' }
  },
  {
    sub_agent_id: subAgent.id,
    trigger_type: 'keyword',
    trigger_phrase: 'build error',
    trigger_context: 'any context',
    active: true,
    priority: 7,
    metadata: { description: 'Triggered when build errors occur - suggests fallback testing approaches (Puppeteer, custom Playwright config)' }
  },
  {
    sub_agent_id: subAgent.id,
    trigger_type: 'keyword',
    trigger_phrase: 'dev server',
    trigger_context: 'any context',
    active: true,
    priority: 6,
    metadata: { description: 'Triggered when dev server is mentioned - reminds about restart requirements after dependency changes' }
  },
  {
    sub_agent_id: subAgent.id,
    trigger_type: 'keyword',
    trigger_phrase: 'test infrastructure',
    trigger_context: 'any context',
    active: true,
    priority: 9,
    metadata: { description: 'Triggered when test infrastructure is mentioned - reminds to run discovery script before writing tests' }
  },
  {
    sub_agent_id: subAgent.id,
    trigger_type: 'keyword',
    trigger_phrase: 'testing evidence',
    trigger_context: 'any context',
    active: true,
    priority: 9,
    metadata: { description: 'Triggered when testing evidence is mentioned - reminds about screenshot capture and validation requirements' }
  },
  {
    sub_agent_id: subAgent.id,
    trigger_type: 'keyword',
    trigger_phrase: 'redirect to login',
    trigger_context: 'any context',
    active: true,
    priority: 10,
    metadata: { description: 'Triggered when tests redirect to login - indicates missing authentication in tests for protected routes' }
  },
  {
    sub_agent_id: subAgent.id,
    trigger_type: 'keyword',
    trigger_phrase: 'playwright build',
    trigger_context: 'any context',
    active: true,
    priority: 8,
    metadata: { description: 'Triggered when Playwright build is mentioned - suggests using existing dev server or Puppeteer fallback' }
  }
];

console.log(`Adding ${newTriggers.length} new triggers for TESTING sub-agent...\n`);

for (const trigger of newTriggers) {
  // Check if trigger already exists
  const { data: existing } = await supabase
    .from('leo_sub_agent_triggers')
    .select('id')
    .eq('sub_agent_id', trigger.sub_agent_id)
    .eq('trigger_phrase', trigger.trigger_phrase)
    .single();

  if (existing) {
    console.log(`⏭️  Skipping existing trigger: "${trigger.trigger_phrase}"`);
    continue;
  }

  const { error } = await supabase
    .from('leo_sub_agent_triggers')
    .insert(trigger);

  if (error) {
    console.error(`❌ Failed to add trigger "${trigger.trigger_phrase}":`, error.message);
  } else {
    console.log(`✅ Added trigger: "${trigger.trigger_phrase}" (priority: ${trigger.priority})`);
  }
}

console.log('\n📊 Trigger Summary:');
console.log('   🔐 Protected route detection');
console.log('   🛡️  Build error resilience');
console.log('   🔄 Dev server management');
console.log('   🔍 Test infrastructure discovery');
console.log('   📸 Testing evidence requirements');
console.log('   🚪 Login redirect diagnosis');
console.log('   🏗️  Playwright build guidance\n');

console.log('✅ TESTING triggers successfully updated\n');
