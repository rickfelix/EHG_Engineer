/**
 * OKR Scorecard Display for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

import { colors } from '../colors.js';

/**
 * Display OKR scorecard - strategic visibility header
 *
 * @param {Object|null} vision - Strategic vision object
 * @param {Array} okrScorecard - OKR scorecard data
 */
export function displayOKRScorecard(vision, okrScorecard) {
  if (!okrScorecard || okrScorecard.length === 0) return;

  // Vision header (if available)
  if (vision) {
    console.log(`${colors.dim}┌─ VISION: ${vision.code} ${'─'.repeat(Math.max(0, 52 - vision.code.length))}┐${colors.reset}`);
    const stmt = vision.statement.substring(0, 63);
    console.log(`${colors.dim}│${colors.reset} ${colors.white}"${stmt}"${colors.reset}`);
    console.log(`${colors.dim}└${'─'.repeat(67)}┘${colors.reset}\n`);
  }

  console.log(`${colors.bold}┌─ OKR SCORECARD ${'─'.repeat(52)}┐${colors.reset}`);
  console.log(`${colors.bold}│${colors.reset}`);

  for (const obj of okrScorecard) {
    // Objective line with progress dots
    const dots = obj.progress_dots || '[○○○○○]';
    const pct = obj.avg_progress_pct ? `${Math.round(obj.avg_progress_pct)}%` : '0%';
    const statusColor = obj.at_risk_krs > 0 ? colors.yellow : colors.green;

    console.log(`${colors.bold}│${colors.reset} ${colors.bold}${obj.objective_code}${colors.reset}: ${obj.objective_title.substring(0, 35)}`);
    console.log(`${colors.bold}│${colors.reset}   ${statusColor}${dots}${colors.reset} ${pct} avg | ${obj.total_krs} KRs`);

    // Key results detail (if loaded)
    if (obj.key_results && obj.key_results.length > 0) {
      for (const kr of obj.key_results) {
        displayKeyResult(kr);
      }
    }
    console.log(`${colors.bold}│${colors.reset}`);
  }

  console.log(`${colors.bold}└${'─'.repeat(67)}┘${colors.reset}\n`);
}

/**
 * Display a single key result with progress bar
 *
 * @param {Object} kr - Key result object
 */
function displayKeyResult(kr) {
  const krStatus = kr.status === 'achieved' ? `${colors.green}✓` :
                  kr.status === 'on_track' ? `${colors.green}●` :
                  kr.status === 'at_risk' ? `${colors.yellow}●` :
                  kr.status === 'off_track' ? `${colors.red}●` : `${colors.dim}○`;

  // Calculate progress bar
  let progress = 0;
  if (kr.target_value && kr.target_value !== 0) {
    if (kr.direction === 'decrease') {
      progress = ((kr.baseline_value - kr.current_value) / (kr.baseline_value - kr.target_value)) * 100;
    } else {
      progress = ((kr.current_value - (kr.baseline_value || 0)) / (kr.target_value - (kr.baseline_value || 0))) * 100;
    }
  }
  progress = Math.min(100, Math.max(0, progress));

  const barFilled = Math.round(progress / 10);
  const barEmpty = 10 - barFilled;
  const progressBar = '█'.repeat(barFilled) + '░'.repeat(barEmpty);

  const current = kr.current_value ?? 0;
  const target = kr.target_value ?? 0;
  const unit = kr.unit || '';

  console.log(`${colors.bold}│${colors.reset}     ${krStatus}${colors.reset} ${kr.code.substring(0, 20).padEnd(20)} ${progressBar} ${current}${unit}→${target}${unit}`);
}
