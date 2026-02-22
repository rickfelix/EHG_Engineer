/**
 * EVA Smoke Test Runner
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-011 / FR-001
 *
 * Reads smoke_test_steps from strategic_directives_v2 for a specified SD
 * and evaluates each step programmatically.
 *
 * Usage:
 *   node scripts/eva/smoke-test-runner.mjs <sd-key-or-uuid>
 *
 * Output: JSON to stdout with step results and summary
 * Exit: 0 if all pass, 1 if any fail or error
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log(JSON.stringify({ error: true, message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment', exit_code: 1 }, null, 2));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Evaluate a single smoke test step
 */
async function evaluateStep(step, stepIndex, sd) {
  const result = {
    step_number: step.step_number || stepIndex + 1,
    instruction: step.instruction || step.step || 'No instruction',
    expected_outcome: step.expected_outcome || step.expected || 'No expected outcome',
    verdict: 'skip',
    evidence: ''
  };

  try {
    const instruction = (result.instruction || '').toLowerCase();
    const expected = (result.expected_outcome || '').toLowerCase();

    // File existence checks
    if (instruction.includes('check') && instruction.includes('file') ||
        instruction.includes('verify') && instruction.includes('exist') ||
        instruction.includes('confirm') && instruction.includes('creat')) {
      const filePatterns = instruction.match(/`([^`]+\.[a-z]{1,4})`/g) ||
                          instruction.match(/(scripts\/[^\s,]+|lib\/[^\s,]+)/g);
      if (filePatterns) {
        const files = filePatterns.map(f => f.replace(/`/g, ''));
        const checks = files.map(f => ({
          file: f,
          exists: existsSync(resolve(process.cwd(), f))
        }));
        const allExist = checks.every(c => c.exists);
        result.verdict = allExist ? 'pass' : 'fail';
        result.evidence = checks.map(c => `${c.file}: ${c.exists ? 'exists' : 'MISSING'}`).join('; ');
        return result;
      }
    }

    // Module export checks
    if (instruction.includes('export') || instruction.includes('import') ||
        instruction.includes('function') && instruction.includes('signature')) {
      const modulePatterns = instruction.match(/`([^`]+\.[a-z]{1,4})`/g) ||
                            instruction.match(/(lib\/[^\s,]+\.js)/g);
      if (modulePatterns) {
        const modPath = modulePatterns[0].replace(/`/g, '');
        try {
          const mod = await import(pathToFileURL(resolve(process.cwd(), modPath)).href);
          const exports = Object.keys(mod).filter(k => k !== '__esModule');
          result.verdict = exports.length > 0 ? 'pass' : 'fail';
          result.evidence = `Module exports: ${exports.join(', ')}`;
        } catch (e) {
          result.verdict = 'fail';
          result.evidence = `Import error: ${e.message}`;
        }
        return result;
      }
    }

    // DB record checks
    if (instruction.includes('query') || instruction.includes('database') ||
        instruction.includes('record') || instruction.includes('table')) {
      const tableMatch = instruction.match(/(?:from|table|in)\s+`?(\w+)`?/i);
      if (tableMatch) {
        const table = tableMatch[1];
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) {
          result.verdict = 'fail';
          result.evidence = `DB error: ${error.message}`;
        } else {
          result.verdict = count > 0 ? 'pass' : 'fail';
          result.evidence = `Table ${table}: ${count} records`;
        }
        return result;
      }
    }

    // SD field checks
    if (instruction.includes('success_criteria') || instruction.includes('key_changes') ||
        instruction.includes('smoke_test_steps') || instruction.includes('success_metrics')) {
      const fieldMatch = instruction.match(/(success_criteria|key_changes|smoke_test_steps|success_metrics|delivers_capabilities)/);
      if (fieldMatch && sd) {
        const field = fieldMatch[1];
        const value = sd[field];
        const hasValue = Array.isArray(value) ? value.length > 0 : !!value;
        result.verdict = hasValue ? 'pass' : 'fail';
        result.evidence = `SD.${field}: ${hasValue ? (Array.isArray(value) ? `${value.length} items` : 'present') : 'empty/missing'}`;
        return result;
      }
    }

    // Generic pass check based on expected outcome matching SD status
    if (expected.includes('complete') || expected.includes('pass') || expected.includes('success')) {
      if (sd && (sd.status === 'completed' || sd.progress >= 100)) {
        result.verdict = 'pass';
        result.evidence = `SD status: ${sd.status}, progress: ${sd.progress}%`;
        return result;
      }
    }

    // Could not evaluate programmatically
    result.verdict = 'skip';
    result.evidence = 'Step requires manual verification — cannot evaluate programmatically';

  } catch (err) {
    result.verdict = 'fail';
    result.evidence = `Evaluation error: ${err.message}`;
  }

  return result;
}

async function main() {
  const sdIdentifier = process.argv[2];
  if (!sdIdentifier) {
    console.log(JSON.stringify({ error: true, message: 'Usage: smoke-test-runner.mjs <sd-key-or-uuid>', exit_code: 1 }, null, 2));
    process.exit(1);
  }

  try {
    // Query SD by key or UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdIdentifier);
    const query = supabase.from('strategic_directives_v2')
      .select('id, sd_key, title, status, progress, smoke_test_steps, success_criteria, key_changes, success_metrics, delivers_capabilities');

    const { data: sd, error } = isUuid
      ? await query.eq('id', sdIdentifier).single()
      : await query.eq('sd_key', sdIdentifier).single();

    if (error || !sd) {
      console.log(JSON.stringify({ error: true, message: `SD not found: ${sdIdentifier}`, exit_code: 1 }, null, 2));
      process.exit(1);
    }

    const steps = sd.smoke_test_steps;
    if (!Array.isArray(steps) || steps.length === 0) {
      console.log(JSON.stringify({
        sd_key: sd.sd_key,
        steps: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, passed_percent: 0 },
        warning: 'No smoke_test_steps found for this SD'
      }, null, 2));
      process.exit(0);
    }

    // Evaluate each step
    const results = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step || typeof step !== 'object') {
        results.push({
          step_number: i + 1,
          instruction: 'Malformed step',
          expected_outcome: '',
          verdict: 'skip',
          evidence: 'Step data is not a valid object'
        });
        continue;
      }
      results.push(await evaluateStep(step, i, sd));
    }

    const passed = results.filter(r => r.verdict === 'pass').length;
    const failed = results.filter(r => r.verdict === 'fail').length;
    const skipped = results.filter(r => r.verdict === 'skip').length;
    const total = results.length;
    const evaluable = total - skipped;
    const passedPercent = evaluable > 0 ? Math.round((passed / evaluable) * 100) : 0;

    const output = {
      sd_key: sd.sd_key,
      steps: results,
      summary: {
        total,
        passed,
        failed,
        skipped,
        passed_percent: passedPercent
      }
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(failed > 0 ? 1 : 0);

  } catch (err) {
    console.log(JSON.stringify({ error: true, message: err.message, exit_code: 1 }, null, 2));
    process.exit(1);
  }
}

main();
