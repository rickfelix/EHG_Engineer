#!/usr/bin/env node
/**
 * EVA Daily YouTube Subscription Digest
 * SD: SD-LEO-FEAT-EVA-DAILY-YOUTUBE-001
 *
 * CLI entry point and pipeline orchestrator.
 * Scans YouTube subscriptions via RSS, scores relevance via LLM,
 * persists to database, and delivers approved recommendations to Todoist.
 *
 * Usage:
 *   node scripts/eva/youtube-subscription-digest.js [options]
 *
 * Options:
 *   --dry-run       Log output only, no Todoist delivery (default: true)
 *   --scan          Trigger a manual scan
 *   --preview       Show digest preview without delivery
 *   --threshold N   Override minimum relevance score (default: 70)
 *   --limit N       Limit number of videos processed (for testing)
 *   --report        Show scoring accuracy metrics
 *   --verbose       Verbose output
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { scanSubscriptions } from '../../lib/integrations/youtube/subscription-scanner.js';
import { scoreVideoBatch } from '../../lib/eva/youtube-relevance-scorer.js';
import { createDigestTasks } from '../../lib/integrations/todoist/digest-task-creator.js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: !args.includes('--no-dry-run'),
    scan: args.includes('--scan') || !args.includes('--preview') && !args.includes('--report'),
    preview: args.includes('--preview'),
    report: args.includes('--report'),
    verbose: args.includes('--verbose'),
    threshold: parseInt(args.find((_, i) => args[i - 1] === '--threshold') || '70', 10),
    limit: parseInt(args.find((_, i) => args[i - 1] === '--limit') || '0', 10) || undefined
  };
}

async function getChannels() {
  const { data, error } = await supabase
    .from('eva_youtube_config')
    .select('channel_id, channel_name, interest_profile, score_threshold')
    .eq('active', true);

  if (error) throw new Error(`Failed to load channels: ${error.message}`);
  if (!data?.length) {
    console.log('[Config] No active channels configured. Add channels to eva_youtube_config.');
    return { channels: [], interests: [] };
  }

  // Build interest profiles from channel configs
  const interestMap = new Map();
  for (const ch of data) {
    if (ch.interest_profile?.ventures) {
      for (const v of ch.interest_profile.ventures) {
        if (!interestMap.has(v.name)) {
          interestMap.set(v.name, { name: v.name, keywords: v.keywords || [] });
        }
      }
    }
  }

  return {
    channels: data.map(ch => ({ channel_id: ch.channel_id, channel_name: ch.channel_name })),
    interests: Array.from(interestMap.values())
  };
}

async function getVentureInterests() {
  // Fallback: load from ventures table if no interest profiles in config
  const { data } = await supabase
    .from('ventures')
    .select('name, metadata')
    .eq('status', 'active');

  return (data || []).map(v => ({
    name: v.name,
    keywords: v.metadata?.keywords || [v.name.toLowerCase()]
  }));
}

async function runScan(options) {
  const startTime = Date.now();
  const scanDate = new Date().toISOString().split('T')[0];
  const { verbose, threshold, limit, dryRun } = options;

  console.log('\n📺 EVA YouTube Subscription Digest');
  console.log(`   Date: ${scanDate}`);
  console.log(`   Mode: ${dryRun ? 'DRY-RUN' : 'PRODUCTION'}`);
  console.log(`   Threshold: ${threshold}`);
  if (limit) console.log(`   Limit: ${limit}`);
  console.log('');

  // Load configuration
  const { channels, interests: configInterests } = await getChannels();
  let interests = configInterests;

  if (interests.length === 0) {
    interests = await getVentureInterests();
    if (verbose) console.log(`[Config] Using ${interests.length} venture interests from ventures table`);
  }

  if (channels.length === 0) {
    console.log('❌ No channels configured. Exiting.');
    return;
  }

  console.log(`📡 Scanning ${channels.length} channels...`);

  // Phase 1: RSS Scan
  const videos = await scanSubscriptions(channels, { limit });
  console.log(`   Found ${videos.length} new videos`);

  if (videos.length === 0) {
    console.log('✅ No new videos today. Done.');
    return;
  }

  // Create scan record
  const { data: scanRecord, error: scanError } = await supabase
    .from('eva_youtube_scans')
    .upsert({
      scan_date: scanDate,
      channel_count: channels.length,
      video_count: videos.length,
      status: 'scoring',
      dry_run: dryRun
    }, { onConflict: 'scan_date' })
    .select('id')
    .single();

  if (scanError) {
    console.error(`[DB] Scan record error: ${scanError.message}`);
    return;
  }

  // Phase 2: LLM Scoring
  console.log(`🧠 Scoring ${videos.length} videos against ${interests.length} venture interests...`);
  const scores = await scoreVideoBatch(videos, interests);

  // Phase 3: Database Persistence
  const scoreRecords = videos.map(video => {
    const score = scores.get(video.video_id) || { score: 0, venture_tags: [], reasoning: '' };
    return {
      scan_id: scanRecord.id,
      video_id: video.video_id,
      video_url: video.video_url,
      title: video.title,
      channel_name: video.channel_name,
      channel_id: video.channel_id,
      published_at: video.published_at,
      relevance_score: score.score,
      venture_tags: score.venture_tags,
      reasoning: score.reasoning,
      status: score.score >= threshold ? 'scored' : 'rejected'
    };
  });

  const { error: scoresError } = await supabase
    .from('eva_youtube_scores')
    .upsert(scoreRecords, { onConflict: 'scan_id,video_id' });

  if (scoresError) {
    console.error(`[DB] Score records error: ${scoresError.message}`);
  }

  const aboveThreshold = scoreRecords.filter(r => r.relevance_score >= threshold);

  // Update scan status
  await supabase
    .from('eva_youtube_scans')
    .update({
      videos_above_threshold: aboveThreshold.length,
      status: 'scored',
      scan_duration_ms: Date.now() - startTime
    })
    .eq('id', scanRecord.id);

  console.log('\n📊 Results:');
  console.log(`   Total videos: ${videos.length}`);
  console.log(`   Above threshold (${threshold}): ${aboveThreshold.length}`);
  console.log(`   Below threshold: ${videos.length - aboveThreshold.length}`);

  if (verbose) {
    console.log('\n   Top scored videos:');
    for (const r of scoreRecords.sort((a, b) => b.relevance_score - a.relevance_score).slice(0, 10)) {
      const tags = r.venture_tags.length > 0 ? ` [${r.venture_tags.join(', ')}]` : '';
      console.log(`   ${r.relevance_score >= threshold ? '✅' : '  '} [${r.relevance_score}] ${r.title}${tags}`);
    }
  }

  // Phase 4: Todoist Delivery (governance approval in production)
  if (aboveThreshold.length > 0) {
    const digest = {
      date: scanDate,
      videos: aboveThreshold.map(r => ({
        title: r.title,
        channel_name: r.channel_name,
        video_url: r.video_url,
        relevance_score: r.relevance_score,
        venture_tags: r.venture_tags
      }))
    };

    const result = await createDigestTasks(digest, { dryRun });

    if (!dryRun && result.parentTaskId) {
      await supabase
        .from('eva_youtube_scans')
        .update({ status: 'delivered' })
        .eq('id', scanRecord.id);

      console.log(`\n✅ Digest delivered to Todoist (${result.childTaskIds.length} tasks)`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Completed in ${duration}s`);
}

async function showReport() {
  console.log('\n📊 YouTube Digest Scoring Report');

  const { data: scans } = await supabase
    .from('eva_youtube_scans')
    .select('scan_date, video_count, videos_above_threshold, status, dry_run, scan_duration_ms')
    .order('scan_date', { ascending: false })
    .limit(14);

  if (!scans?.length) {
    console.log('   No scan data available.');
    return;
  }

  console.log(`\n   Last ${scans.length} scans:`);
  for (const s of scans) {
    const pct = s.video_count > 0 ? Math.round(s.videos_above_threshold / s.video_count * 100) : 0;
    const mode = s.dry_run ? 'DRY' : 'LIVE';
    console.log(`   ${s.scan_date} | ${s.video_count} videos | ${s.videos_above_threshold} recommended (${pct}%) | ${mode} | ${s.status}`);
  }

  const delivered = scans.filter(s => s.status === 'delivered').length;
  console.log(`\n   Delivery rate: ${delivered}/${scans.length} (${Math.round(delivered / scans.length * 100)}%)`);
}

// Entry point
const options = parseArgs();

if (options.report) {
  await showReport();
} else if (options.preview) {
  await runScan({ ...options, dryRun: true });
} else {
  await runScan(options);
}
