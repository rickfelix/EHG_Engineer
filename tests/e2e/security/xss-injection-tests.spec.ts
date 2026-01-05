/**
 * XSS Injection Security Tests E2E
 * SD-E2E-UAT-COVERAGE-001A - User Story US-005
 *
 * Tests application security against XSS attacks:
 *   1. Script tag injection in text fields
 *   2. Event handler injection (onclick, onerror, etc.)
 *   3. URL-based XSS (javascript: protocol)
 *   4. Encoded XSS payloads
 *   5. Stored XSS prevention
 *   6. Reflected XSS prevention
 *
 * Model: Follows marketing-distribution.spec.ts pattern
 */

import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// XSS Payloads for testing
const XSS_PAYLOADS = {
  basicScript: '<script>alert("XSS")</script>',
  scriptWithAttributes: '<script type="text/javascript">alert(document.cookie)</script>',
  imgOnerror: '<img src="x" onerror="alert(\'XSS\')">',
  svgOnload: '<svg onload="alert(\'XSS\')">',
  iframeInject: '<iframe src="javascript:alert(\'XSS\')">',
  eventHandler: '<div onclick="alert(\'XSS\')">Click me</div>',
  encodedScript: '&lt;script&gt;alert("XSS")&lt;/script&gt;',
  unicodeEncoded: '\\u003cscript\\u003ealert("XSS")\\u003c/script\\u003e',
  htmlEntityEncoded: '&#60;script&#62;alert("XSS")&#60;/script&#62;',
  javascriptUrl: 'javascript:alert("XSS")',
  dataUrl: 'data:text/html,<script>alert("XSS")</script>',
  styleInjection: '<style>body{background:url("javascript:alert(\'XSS\')")}</style>',
  expressionInjection: '<div style="width:expression(alert(\'XSS\'))">',
  nullByteInjection: 'test<script>alert("XSS")</script>\x00',
  polyglot: 'jaVasCript:/*-/*`/*\\`/*\'/*"/**/(/* */oNcLiCk=alert() )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\\x3csVg/<sVg/oNloAd=alert()//>\\x3e'
};

// SQL Injection payloads (for completeness)
const SQL_PAYLOADS = {
  basicUnion: "' UNION SELECT * FROM users--",
  orTrue: "' OR '1'='1",
  dropTable: "'; DROP TABLE ventures;--",
  commentBypass: "admin'--"
};

test.describe('XSS Injection Security Tests E2E', () => {
  // ============================================================
  // VENTURE CREATION XSS TESTS
  // ============================================================

  test.describe('Venture Creation - XSS Prevention', () => {
    test('POST /api/ventures - should sanitize script tags in name', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: XSS_PAYLOADS.basicScript,
          problem_statement: 'Test problem',
          solution: 'Test solution',
          target_market: 'Test market',
          origin_type: 'manual'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        // Verify the script tag is either stripped or escaped
        expect(data.name).not.toContain('<script>');
        expect(data.name).not.toContain('alert(');
      }
      // If rejected, that's also acceptable security behavior
    });

    test('POST /api/ventures - should sanitize event handlers', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: 'Test Venture',
          problem_statement: XSS_PAYLOADS.imgOnerror,
          solution: 'Test solution',
          target_market: 'Test market',
          origin_type: 'manual'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        // Verify onerror handler is sanitized
        expect(data.problem_statement).not.toContain('onerror=');
      }
    });

    test('POST /api/ventures - should sanitize SVG onload', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: 'Test Venture',
          problem_statement: 'Test',
          solution: XSS_PAYLOADS.svgOnload,
          target_market: 'Test market',
          origin_type: 'manual'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data.solution).not.toContain('onload=');
      }
    });
  });

  // ============================================================
  // ARTIFACT XSS TESTS
  // ============================================================

  test.describe('Artifact Management - XSS Prevention', () => {
    test('POST /api/ventures/:id/artifacts - should sanitize script in title', async ({ request }) => {
      const testVentureId = '00000000-0000-0000-0000-000000000001';

      const response = await request.post(`${API_BASE}/api/ventures/${testVentureId}/artifacts`, {
        data: {
          stage: 1,
          artifact_type: 'document',
          title: XSS_PAYLOADS.basicScript,
          content: 'Normal content'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data.title).not.toContain('<script>');
      }
    });

    test('POST /api/ventures/:id/artifacts - should sanitize script in content', async ({ request }) => {
      const testVentureId = '00000000-0000-0000-0000-000000000001';

      const response = await request.post(`${API_BASE}/api/ventures/${testVentureId}/artifacts`, {
        data: {
          stage: 1,
          artifact_type: 'document',
          title: 'Test Artifact',
          content: XSS_PAYLOADS.scriptWithAttributes
        }
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data.content).not.toContain('<script');
        expect(data.content).not.toContain('document.cookie');
      }
    });

    test('POST /api/ventures/:id/artifacts - should sanitize metadata XSS', async ({ request }) => {
      const testVentureId = '00000000-0000-0000-0000-000000000001';

      const response = await request.post(`${API_BASE}/api/ventures/${testVentureId}/artifacts`, {
        data: {
          stage: 1,
          artifact_type: 'document',
          title: 'Test Artifact',
          content: 'Normal content',
          metadata: {
            description: XSS_PAYLOADS.eventHandler,
            author: XSS_PAYLOADS.javascriptUrl
          }
        }
      });

      if (response.ok()) {
        const data = await response.json();
        const metadataStr = JSON.stringify(data.metadata);
        expect(metadataStr).not.toContain('onclick=');
        expect(metadataStr).not.toContain('javascript:');
      }
    });
  });

  // ============================================================
  // MARKETING CONTENT XSS TESTS
  // ============================================================

  test.describe('Marketing Content - XSS Prevention', () => {
    test('POST /api/v2/marketing/queue - should sanitize script in title', async ({ request }) => {
      const testVentureId = '00000000-0000-0000-0000-000000000001';

      const response = await request.post(`${API_BASE}/api/v2/marketing/queue`, {
        data: {
          venture_id: testVentureId,
          title: XSS_PAYLOADS.basicScript,
          content_body: 'Normal content',
          content_type: 'social_post'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data.queue_item?.title).not.toContain('<script>');
      }
    });

    test('POST /api/v2/marketing/queue - should sanitize script in content_body', async ({ request }) => {
      const testVentureId = '00000000-0000-0000-0000-000000000001';

      const response = await request.post(`${API_BASE}/api/v2/marketing/queue`, {
        data: {
          venture_id: testVentureId,
          title: 'Test Title',
          content_body: `Normal text ${XSS_PAYLOADS.imgOnerror} more text`,
          content_type: 'social_post'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data.queue_item?.content_body).not.toContain('onerror=');
      }
    });
  });

  // ============================================================
  // COMPLIANCE CHECK XSS TESTS
  // ============================================================

  test.describe('Content Compliance - XSS Prevention', () => {
    test('POST /api/v2/content-forge/compliance-check - should handle XSS in content safely', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/content-forge/compliance-check`, {
        data: {
          content: XSS_PAYLOADS.basicScript
        }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // The response should be safe (either XSS is detected as issue or content is sanitized)
      expect(data.success).toBe(true);
      // Response should not execute XSS
      const responseStr = JSON.stringify(data);
      expect(responseStr).not.toContain('<script>alert');
    });

    test('POST /api/v2/content-forge/compliance-check - should handle polyglot XSS', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/content-forge/compliance-check`, {
        data: {
          content: XSS_PAYLOADS.polyglot
        }
      });

      expect(response.ok()).toBeTruthy();
      // Should process without crashing
    });
  });

  // ============================================================
  // ENCODED XSS TESTS
  // ============================================================

  test.describe('Encoded XSS Prevention', () => {
    test('should handle HTML entity encoded payloads', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: XSS_PAYLOADS.htmlEntityEncoded,
          problem_statement: 'Test',
          solution: 'Test',
          target_market: 'Test',
          origin_type: 'manual'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        // Should not decode entities into executable script
        expect(data.name).not.toMatch(/<script>/i);
      }
    });

    test('should handle URL encoded payloads', async ({ request }) => {
      const urlEncodedXSS = encodeURIComponent(XSS_PAYLOADS.basicScript);

      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: urlEncodedXSS,
          problem_statement: 'Test',
          solution: 'Test',
          target_market: 'Test',
          origin_type: 'manual'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        // Should not decode into executable script
        expect(data.name).not.toMatch(/<script>/i);
      }
    });

    test('should handle double encoded payloads', async ({ request }) => {
      const doubleEncoded = encodeURIComponent(encodeURIComponent(XSS_PAYLOADS.basicScript));

      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: doubleEncoded,
          problem_statement: 'Test',
          solution: 'Test',
          target_market: 'Test',
          origin_type: 'manual'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data.name).not.toMatch(/<script>/i);
      }
    });
  });

  // ============================================================
  // SQL INJECTION TESTS (Bonus security coverage)
  // ============================================================

  test.describe('SQL Injection Prevention', () => {
    test('POST /api/ventures - should handle SQL injection in name', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: SQL_PAYLOADS.basicUnion,
          problem_statement: 'Test',
          solution: 'Test',
          target_market: 'Test',
          origin_type: 'manual'
        }
      });

      // Should not cause database error (500)
      expect(response.status()).not.toBe(500);

      if (response.ok()) {
        const data = await response.json();
        // Should store literally, not execute
        expect(data.name).toContain('UNION');
      }
    });

    test('POST /api/ventures - should handle DROP TABLE injection', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: SQL_PAYLOADS.dropTable,
          problem_statement: 'Test',
          solution: 'Test',
          target_market: 'Test',
          origin_type: 'manual'
        }
      });

      // Should not cause database error
      expect(response.status()).not.toBe(500);
    });

    test('GET endpoints should handle SQL injection in query params', async ({ request }) => {
      const injectionParam = encodeURIComponent(SQL_PAYLOADS.orTrue);

      const response = await request.get(
        `${API_BASE}/api/v2/content-forge/list?status=${injectionParam}`
      );

      // Should either return 400 (validation) or 200 (parameterized query handles it)
      expect([200, 400]).toContain(response.status());
      expect(response.status()).not.toBe(500);
    });
  });

  // ============================================================
  // HEADER INJECTION TESTS
  // ============================================================

  test.describe('Header Injection Prevention', () => {
    test('should handle CRLF injection attempts', async ({ request }) => {
      const crlfPayload = 'test\r\nX-Injected-Header: malicious';

      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: crlfPayload,
          problem_statement: 'Test',
          solution: 'Test',
          target_market: 'Test',
          origin_type: 'manual'
        }
      });

      // Response should not have injected headers
      const headers = response.headers();
      expect(headers['x-injected-header']).toBeUndefined();
    });
  });

  // ============================================================
  // JSON INJECTION TESTS
  // ============================================================

  test.describe('JSON Injection Prevention', () => {
    test('should handle JSON breaking attempts', async ({ request }) => {
      const jsonBreakPayload = '","malicious":"injected","extra":"';

      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: jsonBreakPayload,
          problem_statement: 'Test',
          solution: 'Test',
          target_market: 'Test',
          origin_type: 'manual'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        // Should be stored as literal string, not parsed as JSON structure
        expect(data.malicious).toBeUndefined();
      }
    });

    test('should handle nested JSON injection', async ({ request }) => {
      const nestedJsonPayload = '{"nested": {"malicious": true}}';

      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: nestedJsonPayload,
          problem_statement: 'Test',
          solution: 'Test',
          target_market: 'Test',
          origin_type: 'manual'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        // Name should be string, not parsed object
        expect(typeof data.name).toBe('string');
      }
    });
  });

  // ============================================================
  // STORED XSS VERIFICATION
  // ============================================================

  test.describe('Stored XSS Verification', () => {
    let storedVentureId: string;

    test('should store sanitized content and retrieve safely', async ({ request }) => {
      // Create venture with XSS payload
      const createResponse = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: `XSS Test ${Date.now()}`,
          problem_statement: XSS_PAYLOADS.basicScript,
          solution: XSS_PAYLOADS.imgOnerror,
          target_market: 'Test market',
          origin_type: 'manual'
        }
      });

      if (createResponse.ok()) {
        const createData = await createResponse.json();
        storedVentureId = createData.id;

        // Retrieve and verify
        const getResponse = await request.get(`${API_BASE}/api/ventures`);

        if (getResponse.ok()) {
          const ventures = await getResponse.json();
          const stored = ventures.find((v: { id: string }) => v.id === storedVentureId);

          if (stored) {
            // Verify XSS payloads are not present in raw form
            expect(stored.problem_statement).not.toContain('<script>');
            expect(stored.solution).not.toContain('onerror=');
          }
        }
      }
    });
  });
});
