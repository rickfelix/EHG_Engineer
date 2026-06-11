#!/usr/bin/env node
/**
 * EVA YouTube Channel Configuration Manager
 * SD: SD-LEO-FEAT-EVA-DAILY-YOUTUBE-001
 *
 * Manage YouTube channels for the subscription digest pipeline.
 *
 * Usage:
 *   node scripts/eva/youtube-config.js list
 *   node scripts/eva/youtube-config.js add --id <channel_id> --name <name> [--threshold N]
 *   node scripts/eva/youtube-config.js remove --id <channel_id>
 *   node scripts/eva/youtube-config.js seed
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

const supabase = createSupabaseServiceClient();

const SEED_CHANNELS = [
  { channel_id: 'UCbfYPyITQ-7l4upoX8nvctg', channel_name: 'Two Minute Papers' },
  { channel_id: 'UCsBjURrPoezykLs9EqgamOA', channel_name: 'Fireship' },
  { channel_id: 'UCcefcZRL2oaA_uBNeo5UOWg', channel_name: 'Y Combinator' },
  { channel_id: 'UCNJ1Ymd5yFuUPtn21xtRbbw', channel_name: 'AI Explained' },
  { channel_id: 'UCJIfeSCssxSC_Dhc5s7woww', channel_name: 'Matt Wolfe' },
  { channel_id: 'UCLXo7UDZvByw2ixzpQCufnA', channel_name: 'Vox' },
  { channel_id: 'UCnUYZLuoy1rq1aVMwx4piYg', channel_name: 'Jeff Su' }
];

async function listChannels() {
  const { data, error } = await supabase
    .from('eva_youtube_config')
    .select('channel_id, channel_name, active, score_threshold, max_recommendations')
    .order('channel_name');

  if (error) { console.error('Error:', error.message); return; }
  if (!data?.length) { console.log('No channels configured. Run: node scripts/eva/youtube-config.js seed'); return; }

  console.log(`\n📺 Configured Channels (${data.length}):\n`);
  for (const ch of data) {
    const status = ch.active ? '✅' : '❌';
    console.log(`  ${status} ${ch.channel_name} (${ch.channel_id}) threshold=${ch.score_threshold}`);
  }
}

async function addChannel(channelId, channelName, threshold = 70) {
  const { error } = await supabase
    .from('eva_youtube_config')
    .upsert({
      channel_id: channelId,
      channel_name: channelName,
      active: true,
      score_threshold: threshold,
      max_recommendations: 15
    }, { onConflict: 'channel_id' });

  if (error) { console.error('Error:', error.message); return; }
  console.log(`✅ Added: ${channelName} (${channelId})`);
}

async function removeChannel(channelId) {
  const { error } = await supabase
    .from('eva_youtube_config')
    .update({ active: false })
    .eq('channel_id', channelId);

  if (error) { console.error('Error:', error.message); return; }
  console.log(`❌ Deactivated channel: ${channelId}`);
}

async function seedChannels() {
  console.log(`\n🌱 Seeding ${SEED_CHANNELS.length} default channels...\n`);

  for (const ch of SEED_CHANNELS) {
    await addChannel(ch.channel_id, ch.channel_name);
  }

  console.log('\n✅ Seed complete. Run "node scripts/eva/youtube-config.js list" to verify.');
}

// Parse CLI
const [command, ...rest] = process.argv.slice(2);
const getFlag = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : undefined; };

switch (command) {
  case 'list': await listChannels(); break;
  case 'add': {
    const id = getFlag('--id');
    const name = getFlag('--name');
    const threshold = parseInt(getFlag('--threshold') || '70', 10);
    if (!id || !name) { console.error('Usage: add --id <channel_id> --name <name> [--threshold N]'); break; }
    await addChannel(id, name, threshold);
    break;
  }
  case 'remove': {
    const id = getFlag('--id');
    if (!id) { console.error('Usage: remove --id <channel_id>'); break; }
    await removeChannel(id);
    break;
  }
  case 'seed': await seedChannels(); break;
  default:
    console.log('Usage: node scripts/eva/youtube-config.js <list|add|remove|seed>');
}
