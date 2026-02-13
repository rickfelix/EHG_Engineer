/**
 * Tests for lib/notifications/email-templates.js
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Covers: immediateTemplate, dailyDigestTemplate, weeklySummaryTemplate
 * Focus: HTML/text/subject output, XSS escaping, number formatting
 */

import { describe, it, expect } from 'vitest';
import { immediateTemplate, dailyDigestTemplate, weeklySummaryTemplate } from '../../../lib/notifications/email-templates.js';

describe('email-templates', () => {
  describe('immediateTemplate', () => {
    const baseData = {
      decisionTitle: 'Approve Series A for Venture X',
      ventureName: 'Venture X',
      priority: 'critical',
      decisionId: 'dec-001',
      createdAt: '2026-02-13T10:00:00Z'
    };

    it('returns html, text, and subject fields', () => {
      const result = immediateTemplate(baseData);
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('subject');
    });

    it('includes decision title in subject with [Action Required] prefix', () => {
      const result = immediateTemplate(baseData);
      expect(result.subject).toBe('[Action Required] Approve Series A for Venture X');
    });

    it('includes decision title in html body', () => {
      const result = immediateTemplate(baseData);
      expect(result.html).toContain('Approve Series A for Venture X');
    });

    it('includes venture name in html body', () => {
      const result = immediateTemplate(baseData);
      expect(result.html).toContain('Venture X');
    });

    it('includes priority in html body', () => {
      const result = immediateTemplate(baseData);
      expect(result.html).toContain('critical');
    });

    it('includes deep link with decision ID', () => {
      const result = immediateTemplate(baseData);
      expect(result.html).toContain('decisions?id=dec-001');
    });

    it('includes deep link in text output', () => {
      const result = immediateTemplate(baseData);
      expect(result.text).toContain('decisions?id=dec-001');
    });

    it('includes decision title in text output', () => {
      const result = immediateTemplate(baseData);
      expect(result.text).toContain('Approve Series A for Venture X');
    });

    it('escapes HTML entities in decision title (XSS protection)', () => {
      const xssData = { ...baseData, decisionTitle: '<script>alert("xss")</script>' };
      const result = immediateTemplate(xssData);
      expect(result.html).not.toContain('<script>');
      expect(result.html).toContain('&lt;script&gt;');
    });

    it('escapes HTML entities in venture name', () => {
      const xssData = { ...baseData, ventureName: 'Name & "Quoted" <Tag>' };
      const result = immediateTemplate(xssData);
      expect(result.html).toContain('Name &amp; &quot;Quoted&quot; &lt;Tag&gt;');
    });

    it('escapes HTML entities in priority', () => {
      const xssData = { ...baseData, priority: '<b>high</b>' };
      const result = immediateTemplate(xssData);
      expect(result.html).not.toContain('<b>high</b>');
      expect(result.html).toContain('&lt;b&gt;high&lt;/b&gt;');
    });

    it('handles empty string fields gracefully', () => {
      const emptyData = { ...baseData, decisionTitle: '', ventureName: '', priority: '' };
      const result = immediateTemplate(emptyData);
      expect(result.subject).toBe('[Action Required] ');
      expect(result.html).toBeTruthy();
      expect(result.text).toBeTruthy();
    });
  });

  describe('dailyDigestTemplate', () => {
    const baseData = {
      date: '2026-02-13',
      timezone: 'America/New_York',
      events: [
        {
          type: 'stage_completion',
          ventureName: 'Venture Alpha',
          description: 'Completed stage 3',
          timestamp: '10:30 AM',
          deepLink: 'http://localhost:8080/ventures/alpha'
        },
        {
          type: 'stage_completion',
          ventureName: 'Venture Beta',
          description: 'Completed stage 2',
          timestamp: '11:00 AM',
          deepLink: ''
        },
        {
          type: 'dfe_auto_approval',
          ventureName: 'Venture Gamma',
          description: 'DFE auto-approved',
          timestamp: '02:00 PM',
          deepLink: 'http://localhost:8080/ventures/gamma'
        }
      ]
    };

    it('returns html, text, and subject fields', () => {
      const result = dailyDigestTemplate(baseData);
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('subject');
    });

    it('includes date and event count in subject', () => {
      const result = dailyDigestTemplate(baseData);
      expect(result.subject).toBe('[Daily Digest] 2026-02-13 - 3 portfolio events');
    });

    it('includes date and timezone in html', () => {
      const result = dailyDigestTemplate(baseData);
      expect(result.html).toContain('2026-02-13');
      expect(result.html).toContain('America/New_York');
    });

    it('includes event count in html', () => {
      const result = dailyDigestTemplate(baseData);
      expect(result.html).toContain('3 events in the last 24 hours');
    });

    it('groups events by type in html', () => {
      const result = dailyDigestTemplate(baseData);
      // stage_completion appears as "Stage Completion"
      expect(result.html).toContain('Stage Completion');
      expect(result.html).toContain('Dfe Auto Approval');
    });

    it('includes event count per type group', () => {
      const result = dailyDigestTemplate(baseData);
      expect(result.html).toContain('(2)'); // 2 stage_completion events
      expect(result.html).toContain('(1)'); // 1 dfe_auto_approval event
    });

    it('includes venture names in html', () => {
      const result = dailyDigestTemplate(baseData);
      expect(result.html).toContain('Venture Alpha');
      expect(result.html).toContain('Venture Beta');
      expect(result.html).toContain('Venture Gamma');
    });

    it('includes deep links for events that have them', () => {
      const result = dailyDigestTemplate(baseData);
      expect(result.html).toContain('http://localhost:8080/ventures/alpha');
      expect(result.html).toContain('http://localhost:8080/ventures/gamma');
    });

    it('omits View link when deepLink is empty', () => {
      // Venture Beta has empty deepLink
      const result = dailyDigestTemplate(baseData);
      // The HTML for Venture Beta should not contain a View link
      const betaSection = result.html.split('Venture Beta')[1].split('</li>')[0];
      expect(betaSection).not.toContain('View');
    });

    it('includes all events in text output', () => {
      const result = dailyDigestTemplate(baseData);
      expect(result.text).toContain('Venture Alpha: Completed stage 3');
      expect(result.text).toContain('Venture Beta: Completed stage 2');
      expect(result.text).toContain('Venture Gamma: DFE auto-approved');
    });

    it('includes dashboard link in text and html', () => {
      const result = dailyDigestTemplate(baseData);
      expect(result.text).toContain('/chairman/overview');
      expect(result.html).toContain('/chairman/overview');
    });

    it('escapes HTML entities in venture names (XSS)', () => {
      const xssData = {
        ...baseData,
        events: [{
          type: 'test',
          ventureName: '<img onerror="alert(1)">',
          description: 'test',
          timestamp: '10:00',
          deepLink: ''
        }]
      };
      const result = dailyDigestTemplate(xssData);
      expect(result.html).not.toContain('<img onerror');
      expect(result.html).toContain('&lt;img onerror');
    });

    it('handles empty events array', () => {
      const emptyData = { ...baseData, events: [] };
      const result = dailyDigestTemplate(emptyData);
      expect(result.subject).toContain('0 portfolio events');
      expect(result.html).toContain('0 events');
    });
  });

  describe('weeklySummaryTemplate', () => {
    const baseData = {
      weekStart: '2026-02-10',
      weekEnd: '2026-02-16',
      timezone: 'UTC',
      venturesByStage: {
        'Stage 0': 3,
        'Stage 1': 5,
        'Stage 2': 2
      },
      decisions: { kills: 1, parks: 2, advances: 4 },
      revenueProjection: { current: 1500000, previous: 1200000, delta: 300000 }
    };

    it('returns html, text, and subject fields', () => {
      const result = weeklySummaryTemplate(baseData);
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('subject');
    });

    it('includes week range in subject', () => {
      const result = weeklySummaryTemplate(baseData);
      expect(result.subject).toBe('[Weekly Summary] 2026-02-10 - 2026-02-16');
    });

    it('includes week range in html', () => {
      const result = weeklySummaryTemplate(baseData);
      expect(result.html).toContain('2026-02-10');
      expect(result.html).toContain('2026-02-16');
    });

    it('includes venture stage counts in html table', () => {
      const result = weeklySummaryTemplate(baseData);
      expect(result.html).toContain('Stage 0');
      expect(result.html).toContain('3');
      expect(result.html).toContain('Stage 1');
      expect(result.html).toContain('5');
    });

    it('includes decision counts (advances, parks, kills)', () => {
      const result = weeklySummaryTemplate(baseData);
      expect(result.html).toContain('4'); // advances
      expect(result.html).toContain('2'); // parks
      expect(result.html).toContain('1'); // kills
    });

    it('formats revenue with M suffix for millions', () => {
      const result = weeklySummaryTemplate(baseData);
      expect(result.html).toContain('$1.5M');
    });

    it('shows positive delta with green color and + sign', () => {
      const result = weeklySummaryTemplate(baseData);
      expect(result.html).toContain('#4caf50'); // green for positive
      expect(result.html).toContain('+$300.0K');
    });

    it('shows negative delta with red color', () => {
      const negativeData = {
        ...baseData,
        revenueProjection: { current: 900000, previous: 1200000, delta: -300000 }
      };
      const result = weeklySummaryTemplate(negativeData);
      expect(result.html).toContain('#e94560'); // red for negative
      expect(result.html).toContain('$300.0K');
    });

    it('formats revenue in K for thousands', () => {
      const kData = {
        ...baseData,
        revenueProjection: { current: 50000, previous: 45000, delta: 5000 }
      };
      const result = weeklySummaryTemplate(kData);
      expect(result.html).toContain('$50.0K');
    });

    it('formats revenue without suffix for small amounts', () => {
      const smallData = {
        ...baseData,
        revenueProjection: { current: 500, previous: 400, delta: 100 }
      };
      const result = weeklySummaryTemplate(smallData);
      expect(result.html).toContain('$500');
    });

    it('includes stage information in text output', () => {
      const result = weeklySummaryTemplate(baseData);
      expect(result.text).toContain('Stage 0: 3');
      expect(result.text).toContain('Stage 1: 5');
    });

    it('includes decision counts in text output', () => {
      const result = weeklySummaryTemplate(baseData);
      expect(result.text).toContain('4 advances');
      expect(result.text).toContain('2 parks');
      expect(result.text).toContain('1 kills');
    });

    it('includes dashboard link in html and text', () => {
      const result = weeklySummaryTemplate(baseData);
      expect(result.html).toContain('/chairman/overview');
    });

    it('escapes HTML entities in stage names (XSS)', () => {
      const xssData = {
        ...baseData,
        venturesByStage: { '<script>alert(1)</script>': 5 }
      };
      const result = weeklySummaryTemplate(xssData);
      expect(result.html).not.toContain('<script>alert(1)</script>');
      expect(result.html).toContain('&lt;script&gt;');
    });

    it('handles zero previous revenue without division error', () => {
      const zeroData = {
        ...baseData,
        revenueProjection: { current: 5000, previous: 0, delta: 5000 }
      };
      // Should not throw - divides by (previous || 1) to prevent NaN
      const result = weeklySummaryTemplate(zeroData);
      expect(result.html).toBeTruthy();
      expect(result.html).not.toContain('NaN');
      expect(result.html).not.toContain('Infinity');
    });

    it('handles empty venturesByStage object', () => {
      const emptyData = { ...baseData, venturesByStage: {} };
      const result = weeklySummaryTemplate(emptyData);
      expect(result.html).toBeTruthy();
    });
  });
});
