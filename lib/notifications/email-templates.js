/**
 * Email Templates for Chairman Notifications
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Generates HTML + text emails for immediate, daily digest, and weekly summary.
 */

const APP_URL = process.env.EHG_APP_URL || 'http://localhost:8080';

/**
 * Immediate notification template for critical decisions.
 * @param {{ decisionTitle: string, ventureName: string, priority: string, decisionId: string, createdAt: string }} data
 * @returns {{ html: string, text: string, subject: string }}
 */
export function immediateTemplate(data) {
  const subject = `[Action Required] ${data.decisionTitle}`;
  const deepLink = `${APP_URL}/chairman/decisions?id=${data.decisionId}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a1a2e; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: #e0e0e0; margin: 0;">EHG Chairman Alert</h2>
      </div>
      <div style="background: #16213e; padding: 24px; color: #e0e0e0;">
        <p style="font-size: 16px; margin-top: 0;">A critical decision requires your attention:</p>
        <div style="background: #0f3460; padding: 16px; border-radius: 6px; border-left: 4px solid #e94560;">
          <h3 style="color: #ffffff; margin-top: 0;">${escapeHtml(data.decisionTitle)}</h3>
          <p style="color: #b0b0b0; margin: 4px 0;">Venture: ${escapeHtml(data.ventureName)}</p>
          <p style="color: #b0b0b0; margin: 4px 0;">Priority: <strong style="color: #e94560;">${escapeHtml(data.priority)}</strong></p>
        </div>
        <a href="${deepLink}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #e94560; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Review Decision</a>
      </div>
      <div style="background: #1a1a2e; padding: 12px 20px; border-radius: 0 0 8px 8px; text-align: center;">
        <p style="color: #666; font-size: 12px; margin: 0;">EHG Autonomous Venture Orchestrator</p>
      </div>
    </div>`;

  const text = `EHG Chairman Alert\n\nA critical decision requires your attention:\n\n${data.decisionTitle}\nVenture: ${data.ventureName}\nPriority: ${data.priority}\n\nReview: ${deepLink}`;

  return { html, text, subject };
}

/**
 * Daily digest template.
 * @param {{ date: string, timezone: string, events: Array<{ type: string, ventureName: string, description: string, timestamp: string, deepLink: string }> }} data
 * @returns {{ html: string, text: string, subject: string }}
 */
export function dailyDigestTemplate(data) {
  const subject = `[Daily Digest] ${data.date} - ${data.events.length} portfolio events`;

  const eventsByType = {};
  for (const event of data.events) {
    if (!eventsByType[event.type]) eventsByType[event.type] = [];
    eventsByType[event.type].push(event);
  }

  const eventSections = Object.entries(eventsByType).map(([type, events]) => {
    const items = events.map(e =>
      `<li style="margin: 8px 0;">
        <strong>${escapeHtml(e.ventureName)}</strong>: ${escapeHtml(e.description)}
        <span style="color: #888; font-size: 12px;">${e.timestamp}</span>
        ${e.deepLink ? `<a href="${e.deepLink}" style="color: #5b9bd5; font-size: 12px; margin-left: 8px;">View</a>` : ''}
      </li>`
    ).join('');
    return `<h4 style="color: #e0e0e0; margin-bottom: 8px;">${escapeHtml(formatEventType(type))} (${events.length})</h4>
      <ul style="list-style: none; padding: 0; margin: 0;">${items}</ul>`;
  }).join('');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a1a2e; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: #e0e0e0; margin: 0;">Daily Portfolio Digest</h2>
        <p style="color: #888; margin: 4px 0 0;">${escapeHtml(data.date)} (${escapeHtml(data.timezone)})</p>
      </div>
      <div style="background: #16213e; padding: 24px; color: #e0e0e0;">
        <p style="font-size: 16px; margin-top: 0;">${data.events.length} events in the last 24 hours:</p>
        ${eventSections}
      </div>
      <div style="background: #1a1a2e; padding: 12px 20px; border-radius: 0 0 8px 8px; text-align: center;">
        <a href="${APP_URL}/chairman/overview" style="color: #5b9bd5; font-size: 12px;">View Dashboard</a>
        <p style="color: #666; font-size: 12px; margin: 4px 0 0;">EHG Autonomous Venture Orchestrator</p>
      </div>
    </div>`;

  const textEvents = data.events.map(e => `- ${e.ventureName}: ${e.description} (${e.timestamp})`).join('\n');
  const text = `Daily Portfolio Digest - ${data.date}\n\n${data.events.length} events:\n${textEvents}\n\nDashboard: ${APP_URL}/chairman/overview`;

  return { html, text, subject };
}

/**
 * Weekly summary template.
 * @param {{ weekStart: string, weekEnd: string, timezone: string, venturesByStage: Record<string, number>, decisions: { kills: number, parks: number, advances: number }, revenueProjection: { current: number, previous: number, delta: number } }} data
 * @returns {{ html: string, text: string, subject: string }}
 */
export function weeklySummaryTemplate(data) {
  const subject = `[Weekly Summary] ${data.weekStart} - ${data.weekEnd}`;

  const stageRows = Object.entries(data.venturesByStage).map(([stage, count]) =>
    `<tr><td style="padding: 6px 12px; color: #e0e0e0;">${escapeHtml(stage)}</td><td style="padding: 6px 12px; color: #e0e0e0; text-align: right;">${count}</td></tr>`
  ).join('');

  const revDelta = data.revenueProjection.delta;
  const revDeltaColor = revDelta >= 0 ? '#4caf50' : '#e94560';
  const revDeltaSign = revDelta >= 0 ? '+' : '';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a1a2e; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: #e0e0e0; margin: 0;">Weekly Portfolio Summary</h2>
        <p style="color: #888; margin: 4px 0 0;">${escapeHtml(data.weekStart)} - ${escapeHtml(data.weekEnd)}</p>
      </div>
      <div style="background: #16213e; padding: 24px; color: #e0e0e0;">
        <h3 style="margin-top: 0;">Ventures by Stage</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead><tr><th style="text-align: left; padding: 6px 12px; border-bottom: 1px solid #333; color: #888;">Stage</th><th style="text-align: right; padding: 6px 12px; border-bottom: 1px solid #333; color: #888;">Count</th></tr></thead>
          <tbody>${stageRows}</tbody>
        </table>

        <h3>Decisions This Week</h3>
        <div style="display: flex; gap: 16px;">
          <div style="flex: 1; background: #0f3460; padding: 12px; border-radius: 6px; text-align: center;">
            <div style="font-size: 24px; font-weight: bold; color: #4caf50;">${data.decisions.advances}</div>
            <div style="color: #888; font-size: 12px;">Advances</div>
          </div>
          <div style="flex: 1; background: #0f3460; padding: 12px; border-radius: 6px; text-align: center;">
            <div style="font-size: 24px; font-weight: bold; color: #ff9800;">${data.decisions.parks}</div>
            <div style="color: #888; font-size: 12px;">Parks</div>
          </div>
          <div style="flex: 1; background: #0f3460; padding: 12px; border-radius: 6px; text-align: center;">
            <div style="font-size: 24px; font-weight: bold; color: #e94560;">${data.decisions.kills}</div>
            <div style="color: #888; font-size: 12px;">Kills</div>
          </div>
        </div>

        <h3>Revenue Projection</h3>
        <p>Current: <strong>$${formatNumber(data.revenueProjection.current)}</strong></p>
        <p>vs Last Week: <strong style="color: ${revDeltaColor};">${revDeltaSign}$${formatNumber(Math.abs(revDelta))} (${revDeltaSign}${((revDelta / (data.revenueProjection.previous || 1)) * 100).toFixed(1)}%)</strong></p>
      </div>
      <div style="background: #1a1a2e; padding: 12px 20px; border-radius: 0 0 8px 8px; text-align: center;">
        <a href="${APP_URL}/chairman/overview" style="color: #5b9bd5; font-size: 12px;">View Dashboard</a>
        <p style="color: #666; font-size: 12px; margin: 4px 0 0;">EHG Autonomous Venture Orchestrator</p>
      </div>
    </div>`;

  const stageText = Object.entries(data.venturesByStage).map(([s, c]) => `  ${s}: ${c}`).join('\n');
  const text = `Weekly Portfolio Summary (${data.weekStart} - ${data.weekEnd})\n\nVentures by Stage:\n${stageText}\n\nDecisions: ${data.decisions.advances} advances, ${data.decisions.parks} parks, ${data.decisions.kills} kills\n\nRevenue: $${formatNumber(data.revenueProjection.current)} (${revDeltaSign}$${formatNumber(Math.abs(revDelta))} vs last week)`;

  return { html, text, subject };
}

/**
 * Vision score notification template.
 * SD: SD-MAN-INFRA-VISION-SCORE-NOTIFICATIONS-001
 *
 * @param {{ sdKey: string, sdTitle: string, totalScore: number, dimensionScores: Object, scoreId: string, scoredAt: string }} data
 * @returns {{ html: string, text: string, subject: string }}
 */
export function visionScoreTemplate(data) {
  const { sdKey, sdTitle, totalScore, dimensionScores = {}, scoreId, scoredAt } = data;
  const scoreDisplay = totalScore != null ? `${Math.round(totalScore)}%` : 'N/A';
  const deepLink = `${APP_URL}/eva/scores?id=${scoreId || ''}`;
  const scoreColor = totalScore >= 85 ? '#4caf50' : totalScore >= 70 ? '#ff9800' : '#e94560';

  const dimRows = Object.entries(dimensionScores).map(([id, dim]) => {
    const dimScore = dim.score != null ? `${Math.round(dim.score)}/100` : 'N/A';
    return `<tr>
      <td style="padding:6px 12px;color:#b0b0b0;font-size:13px;">${escapeHtml(dim.name || id)}</td>
      <td style="padding:6px 12px;color:#e0e0e0;text-align:right;font-size:13px;">${dimScore}</td>
    </tr>`;
  }).join('');

  const dimText = Object.entries(dimensionScores).map(([id, dim]) => {
    const dimScore = dim.score != null ? `${Math.round(dim.score)}/100` : 'N/A';
    return `  ${dim.name || id}: ${dimScore}`;
  }).join('\n');

  const subject = `[EVA Vision Score] ${sdKey}: ${scoreDisplay}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1a1a2e;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="color:#e0e0e0;margin:0;">EVA Vision Alignment Score</h2>
        <p style="color:#888;margin:4px 0 0;">${escapeHtml(scoredAt || new Date().toISOString())}</p>
      </div>
      <div style="background:#16213e;padding:24px;color:#e0e0e0;">
        <p style="font-size:14px;margin-top:0;color:#b0b0b0;">SD: <strong style="color:#e0e0e0;">${escapeHtml(sdKey)}</strong></p>
        <p style="font-size:14px;margin:4px 0 16px;color:#b0b0b0;">${escapeHtml(sdTitle || '')}</p>
        <div style="background:#0f3460;padding:16px;border-radius:6px;text-align:center;margin-bottom:20px;">
          <div style="font-size:48px;font-weight:bold;color:${scoreColor};">${scoreDisplay}</div>
          <div style="color:#888;font-size:13px;margin-top:4px;">Overall Vision Alignment</div>
        </div>
        ${dimRows ? `<h4 style="color:#888;font-size:12px;text-transform:uppercase;margin:0 0 8px;">Dimension Breakdown</h4>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="text-align:left;padding:6px 12px;border-bottom:1px solid #333;color:#888;font-size:12px;">Dimension</th>
            <th style="text-align:right;padding:6px 12px;border-bottom:1px solid #333;color:#888;font-size:12px;">Score</th>
          </tr></thead>
          <tbody>${dimRows}</tbody>
        </table>` : ''}
        <a href="${deepLink}" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#5b9bd5;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">View Full Report</a>
      </div>
      <div style="background:#1a1a2e;padding:12px 20px;border-radius:0 0 8px 8px;text-align:center;">
        <p style="color:#666;font-size:12px;margin:0;">EHG Autonomous Venture Orchestrator — EVA Vision Governance</p>
      </div>
    </div>`;

  const text = `EVA Vision Alignment Score\n\nSD: ${sdKey}\n${sdTitle || ''}\n\nOverall Score: ${scoreDisplay}\n\nDimension Breakdown:\n${dimText || '(no dimensions)'}\n\nFull Report: ${deepLink}`;

  return { html, text, subject };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatEventType(type) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toFixed(0);
}
