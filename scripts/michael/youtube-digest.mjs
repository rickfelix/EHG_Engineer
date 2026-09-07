#!/usr/bin/env node
// scripts/michael/youtube-digest.mjs — v1.1 feeder (GitHub Actions, 06:00-06:30 ET).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J. Spec §5 v1.1 (FR-4). Credential-free: public
// Atom/RSS (lib/integrations/youtube/subscription-scanner.js), zero API quota, zero Google grant —
// this is the one v1.1 feeder that runs on GHA rather than the chairman's host, and it therefore
// NEVER calls assertHostVenue (there is no credential to gate).
//
// Channel list comes ONLY from active michael_rules rows with domain='youtube' — never a hardcoded
// list, never Drive. rule_json vocabulary for domain=youtube: { channel_id: '<UC...>', channel_name?:
// '<string>' }. A rule with no usable channel_id (rule_json null, non-object, or missing channel_id —
// e.g. a prose-only rule imported before this vocabulary existed) is COUNTED as malformed_rule and
// skipped, never thrown on: FR-4's picks must degrade honestly, not crash a GHA run over one bad row.
//
// FR-6 (non-goal): this feeder is READ-ONLY over public RSS and STAGE-ONLY over michael_staged_items.
// It never writes to a YouTube playlist, never requests a broader OAuth scope, and never reads or
// writes anything under the eva_ prefix — Michael and EVA are separate roles with no shared table
// (verified by this file's own boundary test, which greps the source for eva_).
//
// New picks are staged as kind 'youtube_pick', deduped on the VIDEO id (dedupe_key `youtube:<id>`,
// not date-scoped like task_route) so a video already staged is never re-staged on a later run even
// after the ET date rolls over — mirrors tasks-classifier.mjs's stage() helper.
//
// DRY-RUN BY DEFAULT; --apply writes. Usage: node scripts/michael/youtube-digest.mjs [--apply] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit, canonicalJson, sha256Hex } from '../../lib/michael/db.mjs';
import { runFeeder, exitCodeFor, gracefulExit } from '../../lib/michael/feeder.mjs';
import { scanSubscriptions } from '../../lib/integrations/youtube/subscription-scanner.js';

export const FEEDER = 'youtube-digest';
export const TITLE_MAX = 200;
export const SCAN_HOURS_BACK = 24;
export const SCAN_LIMIT = 50;

/** Pure: the {channel_id, channel_name} a youtube rule names, or null when its rule_json carries no usable channel_id. */
export function channelOfRule(rule) {
  const j = rule && rule.rule_json;
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  if (typeof j.channel_id !== 'string' || !j.channel_id.trim()) return null;
  const channel_name = typeof j.channel_name === 'string' && j.channel_name.trim() ? j.channel_name.trim() : rule.rule_key;
  return { channel_id: j.channel_id.trim(), channel_name };
}

/** Pure: the bounded, addressless payload staged for one video pick. */
export function pickPayload(video) {
  return {
    dedupe_key: `youtube:${video.video_id}`,
    dedupe_sha256: sha256Hex(canonicalJson({ video_id: video.video_id, title: video.title })),
    title: String(video.title || '').slice(0, TITLE_MAX),
    channel_id: video.channel_id,
    channel_name: video.channel_name,
    video_url: video.video_url,
    published_at: video.published_at,
  };
}

/** Stage youtube_pick payloads, skipping dedupe_keys already open (mirrors tasks-classifier.mjs's stage()). */
async function stagePicks(sb, payloads, { apply }) {
  if (!payloads.length) return { inserted: 0, skipped: 0, error: null };
  const open = await readRows(sb, 'michael_staged_items', (q) => q.eq('kind', 'youtube_pick').is('dispositioned_at', null), { select: 'payload' });
  if (open.error) return { inserted: 0, skipped: 0, error: open.error };
  const seen = new Set(open.rows.map((r) => r && r.payload && r.payload.dedupe_key).filter(Boolean));
  const fresh = payloads.filter((p) => !seen.has(p.dedupe_key));
  if (apply && fresh.length) {
    const w = await writeRows(sb, 'michael_staged_items', (t) => t.insert(fresh.map((payload) => ({ kind: 'youtube_pick', payload }))));
    if (!w.ok) return { inserted: 0, skipped: payloads.length - fresh.length, error: w.error };
  }
  return { inserted: fresh.length, skipped: payloads.length - fresh.length, error: null };
}

/** The feeder. deps: { sb, argv, now, scan, env }. Never throws. */
export async function runYoutubeDigest({ sb, argv = [], now = new Date(), scan = scanSubscriptions, env = process.env } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  const etDateOverride = a['et-date'] !== undefined ? String(a['et-date']) : undefined;
  if (etDateOverride !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(etDateOverride)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');

  return runFeeder({
    feeder: FEEDER,
    etDateOverride,
    dryRun: !apply,
    run: async () => {
      const counts = { dry_run: !apply, rules_seen: 0, channels: 0, malformed_rules: 0, videos_found: 0, staged: 0, stage_dupes_skipped: 0 };

      const rules = await readRows(sb, 'michael_rules', (q) => q.eq('domain', 'youtube').eq('status', 'active'), { select: 'rule_key,rule_json' });
      if (rules.error) return { status: 'failed', counts: { ...counts, error_code: 'READ_FAILED', phase: 'rules' } };
      counts.rules_seen = rules.rows.length;
      if (!rules.rows.length) return { status: 'skipped', counts: { ...counts, reason: 'no_youtube_rules' } };

      const channels = [];
      const malformed = [];
      for (const r of rules.rows) {
        const c = channelOfRule(r);
        if (c) channels.push(c); else malformed.push(r.rule_key);
      }
      counts.channels = channels.length;
      counts.malformed_rules = malformed.length;
      if (!channels.length) return { status: 'degraded', counts: { ...counts, reason: 'all_rules_malformed' } };

      const videos = await scan(channels, { hoursBack: SCAN_HOURS_BACK, limit: SCAN_LIMIT });
      counts.videos_found = Array.isArray(videos) ? videos.length : 0;
      const payloads = (Array.isArray(videos) ? videos : []).filter((v) => v && v.video_id).map(pickPayload);

      if (!apply) return { status: malformed.length ? 'degraded' : 'ok', counts, preview: { rows: payloads } };

      const st = await stagePicks(sb, payloads, { apply });
      if (st.error) return { status: 'failed', counts: { ...counts, error_code: 'STAGE_FAILED', phase: 'stage' } };
      counts.staged = st.inserted;
      counts.stage_dupes_skipped = st.skipped;
      return { status: malformed.length ? 'degraded' : 'ok', counts };
    },
  }, { sb, env, now });
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runYoutubeDigest({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  await gracefulExit(exitCodeFor(r));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:youtube-digest] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
