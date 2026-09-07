// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J / FR-4 — the youtube-digest v1.1 feeder (GHA venue).
import { describe, it, expect } from 'vitest';
import { stubClient } from '../../lib/michael/db.test.js';
import { runYoutubeDigest, channelOfRule, pickPayload, FEEDER, TITLE_MAX } from './youtube-digest.mjs';

// 06:15 ET on Sunday 2026-09-06 (EDT, UTC-4) -> 10:15Z, inside the 06:00-06:30 window.
const IN_WINDOW = new Date('2026-09-06T10:15:00.000Z');
const OUTSIDE_WINDOW = new Date('2026-09-06T06:00:00.000Z');
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

function db({ reads = [], writes = [] } = {}) {
  const calls = [];
  let r = 0, w = 0;
  const sb = stubClient((table, ops) => { calls.push({ table, kind: ops[0].op, ops }); if (ops[0].op === 'select') return reads[r++] || { data: [], error: null }; return writes[w++] || { data: null, error: null }; });
  return { sb, calls };
}

const rule = (rule_key, rule_json) => ({ rule_key, rule_json });
const video = (id, title, channel = { channel_id: 'UC1', channel_name: 'Ch One' }) => ({ video_id: id, title, channel_id: channel.channel_id, channel_name: channel.channel_name, video_url: `https://www.youtube.com/watch?v=${id}`, published_at: '2026-09-06T05:00:00Z' });

describe('channelOfRule / pickPayload (pure)', () => {
  it('accepts a channel_id, defaults channel_name to rule_key, rejects malformed rule_json', () => {
    expect(channelOfRule(rule('k1', { channel_id: 'UC1', channel_name: 'One' }))).toEqual({ channel_id: 'UC1', channel_name: 'One' });
    expect(channelOfRule(rule('k1', { channel_id: 'UC1' }))).toEqual({ channel_id: 'UC1', channel_name: 'k1' });
    expect(channelOfRule(rule('k1', null))).toBe(null);
    expect(channelOfRule(rule('k1', { note: 'no channel here' }))).toBe(null);
    expect(channelOfRule(rule('k1', ['UC1']))).toBe(null);
    expect(channelOfRule(rule('k1', { channel_id: '' }))).toBe(null);
    expect(channelOfRule(rule('k1', { channel_id: 42 }))).toBe(null);
  });
  it('pickPayload bounds title, keys on the video id, never carries an address', () => {
    const p = pickPayload(video('v1', 'a'.repeat(300)));
    expect(p.dedupe_key).toBe('youtube:v1');
    expect(p.title).toHaveLength(TITLE_MAX);
    expect(p).toMatchObject({ channel_id: 'UC1', channel_name: 'Ch One', video_url: 'https://www.youtube.com/watch?v=v1', published_at: '2026-09-06T05:00:00Z' });
    expect(Object.keys(p).sort()).toEqual(['channel_id', 'channel_name', 'dedupe_key', 'dedupe_sha256', 'published_at', 'title', 'video_url'].sort());
  });
});

describe('runYoutubeDigest', () => {
  it('runs on GHA with no host-venue gate: GITHUB_ACTIONS=true does not refuse (this feeder needs no credential)', async () => {
    const { sb } = db({ reads: [{ data: [], error: null }] });
    const r = await runYoutubeDigest({ sb, argv: [], now: IN_WINDOW, scan: async () => [], env: { GITHUB_ACTIONS: 'true' } });
    expect(r).toMatchObject({ ok: true, action: 'dry_run', status: 'skipped', counts: { reason: 'no_youtube_rules' } });
  });
  it('a malformed --et-date is refused; outside the window is inert with no rules read; a missing table is inert tables_absent', async () => {
    expect(await runYoutubeDigest({ sb: db().sb, argv: ['--et-date', 'sunday'], now: IN_WINDOW })).toMatchObject({ ok: false, refusal: 'ET_DATE_INVALID' });
    const { sb, calls } = db();
    expect(await runYoutubeDigest({ sb, argv: ['--apply'], now: OUTSIDE_WINDOW })).toMatchObject({ ok: true, action: 'inert', reason: 'outside_et_window', feeder: FEEDER });
    expect(calls).toEqual([]);
    const absent = db({ reads: [MISSING] });
    expect(await runYoutubeDigest({ sb: absent.sb, argv: ['--apply'], now: IN_WINDOW })).toMatchObject({ action: 'inert', reason: 'tables_absent' });
  });
  it('no active youtube rules is skipped with no scan call', async () => {
    let scanCalled = false;
    const r = await runYoutubeDigest({ sb: db({ reads: [{ data: [], error: null }] }).sb, argv: [], now: IN_WINDOW, scan: async () => { scanCalled = true; return []; } });
    expect(r).toMatchObject({ status: 'skipped', counts: { rules_seen: 0, reason: 'no_youtube_rules' } });
    expect(scanCalled).toBe(false);
  });
  it('every rule malformed is degraded with no scan call', async () => {
    const rulesRead = { data: [{ rule_key: 'a', rule_json: null }, { rule_key: 'b', rule_json: { note: 'x' } }], error: null };
    let scanCalled = false;
    const r = await runYoutubeDigest({ sb: db({ reads: [{ data: [], error: null }, rulesRead] }).sb, argv: [], now: IN_WINDOW, scan: async () => { scanCalled = true; return []; } });
    expect(r).toMatchObject({ status: 'degraded', counts: { rules_seen: 2, channels: 0, malformed_rules: 2, reason: 'all_rules_malformed' } });
    expect(scanCalled).toBe(false);
  });
  it('dry run: scans the channels named by valid rules, previews staged payloads, writes nothing; a mix of good/bad rules is degraded', async () => {
    const rulesRead = { data: [{ rule_key: 'good', rule_json: { channel_id: 'UC1', channel_name: 'Ch One' } }, { rule_key: 'bad', rule_json: null }], error: null };
    const { sb, calls: dbCalls } = db({ reads: [{ data: [], error: null }, rulesRead] });
    let scanArgs = null;
    const scan = async (channels, opts) => { scanArgs = { channels, opts }; return [video('v1', 'First video')]; };
    const r = await runYoutubeDigest({ sb, argv: ['--json'], now: IN_WINDOW, scan });
    expect(r).toMatchObject({ ok: true, action: 'dry_run', status: 'degraded', counts: { channels: 1, malformed_rules: 1, videos_found: 1 } });
    expect(scanArgs.channels).toEqual([{ channel_id: 'UC1', channel_name: 'Ch One' }]);
    expect(scanArgs.opts).toMatchObject({ hoursBack: 24, limit: 50 });
    expect(r.preview.rows).toEqual([expect.objectContaining({ dedupe_key: 'youtube:v1', title: 'First video' })]);
    expect(dbCalls.map((c) => c.kind)).toEqual(['select', 'select']);
  });
  it('--apply stages fresh picks by video id and writes the run row; an already-open pick is skipped, not restaged', async () => {
    const rulesRead = { data: [{ rule_key: 'good', rule_json: { channel_id: 'UC1' } }], error: null };
    const openRead = { data: [{ payload: { dedupe_key: 'youtube:v-old' } }], error: null };
    const { sb, calls: dbCalls } = db({ reads: [{ data: [], error: null }, rulesRead, openRead] });
    const scan = async () => [video('v-old', 'Already staged'), video('v-new', 'Fresh one')];
    const r = await runYoutubeDigest({ sb, argv: ['--apply'], now: IN_WINDOW, scan });
    expect(r).toMatchObject({ ok: true, action: 'run', status: 'ok', counts: { videos_found: 2, staged: 1, stage_dupes_skipped: 1 } });
    expect(dbCalls.map((c) => `${c.table}:${c.kind}`)).toEqual(['michael_feeder_runs:select', 'michael_feeder_runs:insert', 'michael_rules:select', 'michael_staged_items:select', 'michael_staged_items:insert', 'michael_feeder_runs:update']);
    const inserted = dbCalls.find((c) => c.table === 'michael_staged_items' && c.kind === 'insert').ops[0].args[0];
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ kind: 'youtube_pick', payload: expect.objectContaining({ dedupe_key: 'youtube:v-new', title: 'Fresh one' }) });
  });
  it('does not read or write anything under the eva_ prefix (Michael/EVA role boundary, FR-6)', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('./youtube-digest.mjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\beva_[a-z_]+/);
  });
  it('never imports googleapis or a Google credential module (public RSS only, no chairman grant)', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('./youtube-digest.mjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from 'googleapis'|chairman-oauth|readHostKey|MICHAEL_ENCRYPTION_KEY/);
  });
  it('never imports the pre-existing (unrelated) youtube playlist/OAuth modules or calls a playlist-write endpoint (FR-6 non-goal)', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('./youtube-digest.mjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/oauth-manager|playlist-sync/);
    expect(src).not.toMatch(/playlistItems\.(insert|delete|update)|videos\.insert|youtube\.force-ssl|youtube\.upload|youtubepartner/);
  });
});
