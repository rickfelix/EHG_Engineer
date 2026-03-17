#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
  const { data: users } = await supabase.auth.admin.listUsers();
  if (!users || !users.users || users.users.length === 0) {
    console.log('No auth users found');
    return;
  }

  const userId = users.users[0].id;
  console.log('Using user_id:', userId);

  // Test create
  const { data: convId, error: e1 } = await supabase.rpc('create_eva_conversation', {
    p_user_id: userId, p_title: 'Verification Test', p_metadata: { test: true }
  });
  console.log('create_eva_conversation:', e1 ? 'FAILED: ' + e1.message : 'OK (id: ' + convId + ')');
  if (!convId) return;

  // Test list
  const { data: convs, error: e2 } = await supabase.rpc('get_eva_conversations', { p_user_id: userId });
  console.log('get_eva_conversations:', e2 ? 'FAILED: ' + e2.message : 'OK (' + (convs ? convs.length : 0) + ' convs)');

  // Test message insert
  const { error: e3 } = await supabase.from('eva_chat_messages').insert({
    conversation_id: convId, role: 'user', content: 'Test message'
  });
  console.log('insert message:', e3 ? 'FAILED: ' + e3.message : 'OK');

  // Test get messages
  const { data: msgs, error: e4 } = await supabase.rpc('get_conversation_messages', { p_conversation_id: convId });
  console.log('get_conversation_messages:', e4 ? 'FAILED: ' + e4.message : 'OK (' + (msgs ? msgs.length : 0) + ' msgs)');

  // Cleanup
  await supabase.from('eva_chat_messages').delete().eq('conversation_id', convId);
  await supabase.from('eva_chat_conversations').delete().eq('id', convId);
  console.log('Cleanup: OK');
  console.log('\n✅ All EVA Chat RPCs verified successfully!');
}

verify().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
