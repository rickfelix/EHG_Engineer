#!/usr/bin/env node
/**
 * SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 / FR-2 — one-time audit runner: disposition every
 * currently-parked chairman SMS row.
 *
 * Fetches sms_relay_staging WHERE parked_at IS NOT NULL AND resolved_at IS NULL, NEWEST-FIRST
 * (per the SD's explicit audit ordering — distinct from surfaceParkedChairmanSms's oldest-first
 * alarm ordering, which this script does not touch). For each row, classifies via
 * lib/chairman/parked-sms-audit.mjs's classifyParkedSmsDisposition, writes ONE feedback row
 * recording the disposition (chairman SMS body content is NEVER written to a git-tracked file —
 * only to this RLS-protected DB table), then stamps resolved_at via the EXISTING, unmodified
 * resolveParkedChairmanSmsRow so the row stops re-firing QUIET_TICK_SMS_PARKED.
 *
 * Usage:
 *   node scripts/audit-parked-chairman-sms.mjs --dry-run   # classify + print counts, write nothing
 *   node scripts/audit-parked-chairman-sms.mjs             # run for real
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { classifyParkedSmsDisposition } from '../lib/chairman/parked-sms-audit.mjs';
import { resolveParkedChairmanSmsRow } from '../lib/chairman/sms-bridge.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const TAG = '[audit-parked-chairman-sms]';

/**
 * Run the audit against injected deps — testable without a live DB.
 * @param {object} deps
 * @param {() => Promise<Array<{id:string, from_phone:string, body_raw:string, parked_at:string}>>} deps.fetchParkedRows
 * @param {(fromPhones: string[]) => Promise<Array<{id:string, from_phone:string, outcome:string, created_at:string}>>} deps.fetchInboundLogRows
 * @param {(row: object, disposition: 'EVIDENCE_HANDLED'|'NEEDS_ADAM_REVIEW', evidence: object|null) => Promise<void>} deps.insertFeedback
 * @param {(id: string) => Promise<{resolved: boolean}>} deps.resolveRow
 * @param {boolean} [deps.dryRun]
 * @param {(msg: string) => void} [deps.onLog]
 * @returns {Promise<{total: number, evidenceHandled: number, needsReview: number}>}
 */
export async function runAudit(deps) {
  const {
    fetchParkedRows, fetchInboundLogRows, insertFeedback, resolveRow,
    dryRun = false, onLog = (m) => console.log(m),
  } = deps;

  const rows = await fetchParkedRows();
  const uniquePhones = [...new Set(rows.map((r) => r.from_phone).filter(Boolean))];
  const logRows = uniquePhones.length ? await fetchInboundLogRows(uniquePhones) : [];
  const logsByPhone = new Map();
  for (const l of logRows) {
    if (!logsByPhone.has(l.from_phone)) logsByPhone.set(l.from_phone, []);
    logsByPhone.get(l.from_phone).push(l);
  }

  let evidenceHandled = 0;
  let needsReview = 0;

  for (const row of rows) {
    const { disposition, evidence } = classifyParkedSmsDisposition(row, logsByPhone.get(row.from_phone) || []);
    if (disposition === 'EVIDENCE_HANDLED') evidenceHandled += 1;
    else needsReview += 1;

    if (dryRun) {
      onLog(`${TAG} DRY RUN id=${row.id} phone=...${String(row.from_phone).slice(-4)} disposition=${disposition}`);
      continue;
    }

    await insertFeedback(row, disposition, evidence);
    await resolveRow(row.id);
    onLog(`${TAG} id=${row.id} phone=...${String(row.from_phone).slice(-4)} disposition=${disposition}`);
  }

  const summary = { total: rows.length, evidenceHandled, needsReview };
  onLog(`${TAG} SUMMARY total=${summary.total} evidence_handled=${summary.evidenceHandled} needs_review=${summary.needsReview}${dryRun ? ' (DRY RUN — nothing written)' : ''}`);
  return summary;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const deps = {
    dryRun,
    async fetchParkedRows() {
      const { data, error } = await supabase
        .from('sms_relay_staging')
        .select('id, from_phone, body_raw, parked_at')
        .not('parked_at', 'is', null)
        .is('resolved_at', null)
        .order('parked_at', { ascending: false });
      if (error) throw new Error(`fetchParkedRows: ${error.message}`);
      return data || [];
    },
    async fetchInboundLogRows(fromPhones) {
      const { data, error } = await supabase
        .from('sms_inbound_log')
        .select('id, from_phone, outcome, created_at')
        .in('from_phone', fromPhones)
        .eq('outcome', 'answered');
      if (error) throw new Error(`fetchInboundLogRows: ${error.message}`);
      return data || [];
    },
    async insertFeedback(row, disposition, evidence) {
      const last4 = String(row.from_phone || '').slice(-4);
      const { error } = await supabase.from('feedback').insert({
        type: 'issue',
        source_application: 'EHG_Engineer',
        source_type: 'auto_capture',
        title: `chairman-sms-parked-audit ${disposition} ...${last4}`,
        description: `body: ${row.body_raw}\nparked_at: ${row.parked_at}\nevidence: ${evidence ? JSON.stringify(evidence) : 'none'}`,
        status: disposition === 'EVIDENCE_HANDLED' ? 'resolved' : 'new',
        severity: disposition === 'EVIDENCE_HANDLED' ? 'low' : 'high',
        category: 'chairman_sms_parked_audit',
        sd_id: 'SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001',
      });
      if (error) throw new Error(`insertFeedback: ${error.message}`);
    },
    async resolveRow(id) {
      return resolveParkedChairmanSmsRow(supabase, id);
    },
  };

  const summary = await runAudit(deps);
  console.log(JSON.stringify(summary, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(`${TAG} FATAL:`, err && err.message); process.exit(1); });
}
