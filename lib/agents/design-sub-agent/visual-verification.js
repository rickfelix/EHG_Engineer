/**
 * Visual Verification Module
 * Playwright MCP-based visual verification
 *
 * Extracted from design-sub-agent.js for modularity
 * SD-LEO-REFACTOR-DESIGN-AGENT-001
 */

/**
 * Visual verification using Playwright MCP tools
 * Captures screenshots and accessibility snapshots for review
 *
 * @param {string} _basePath - Base path for component analysis (unused)
 * @param {Object} options - Options including previewUrl
 * @returns {Object} Visual verification results with MCP instructions
 */
export function visualVerification(_basePath, options = {}) {
  const results = {
    enabled: true,
    timestamp: new Date().toISOString(),
    screenshots: [],
    snapshots: [],
    consoleErrors: [],
    status: 'PENDING',
    markdown_summary: ''
  };

  // Step 1: Determine preview URL
  const previewUrl = options.previewUrl ||
    process.env.BASE_URL ||
    'http://localhost:8080';
  results.previewUrl = previewUrl;

  // Step 2: Generate MCP instructions
  results.mcp_instructions = generateMCPInstructions(previewUrl, options);

  // Step 3: Generate markdown audit template
  results.markdown_summary = generateVisualAuditMarkdown(previewUrl, results);

  results.status = 'READY_FOR_MCP';
  return results;
}

/**
 * Generate Playwright MCP instructions for visual verification
 *
 * @param {string} previewUrl - URL to verify
 * @param {Object} _options - Additional options (unused)
 * @returns {Array} List of MCP tool calls to execute
 */
export function generateMCPInstructions(previewUrl, _options = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const screenshotDir = `visual-audit-${timestamp}`;

  return [
    {
      step: 1,
      tool: 'mcp__playwright__browser_navigate',
      params: { url: previewUrl },
      description: 'Navigate to preview URL'
    },
    {
      step: 2,
      tool: 'mcp__playwright__browser_snapshot',
      params: {},
      description: 'Capture accessibility tree'
    },
    {
      step: 3,
      tool: 'mcp__playwright__browser_take_screenshot',
      params: { filename: `${screenshotDir}/desktop.png` },
      description: 'Screenshot at desktop viewport'
    },
    {
      step: 4,
      tool: 'mcp__playwright__browser_console_messages',
      params: { level: 'error' },
      description: 'Check for console errors'
    },
    {
      step: 5,
      tool: 'mcp__playwright__browser_resize',
      params: { width: 768, height: 1024 },
      description: 'Resize to tablet viewport'
    },
    {
      step: 6,
      tool: 'mcp__playwright__browser_take_screenshot',
      params: { filename: `${screenshotDir}/tablet.png` },
      description: 'Screenshot at tablet viewport'
    },
    {
      step: 7,
      tool: 'mcp__playwright__browser_resize',
      params: { width: 375, height: 667 },
      description: 'Resize to mobile viewport'
    },
    {
      step: 8,
      tool: 'mcp__playwright__browser_take_screenshot',
      params: { filename: `${screenshotDir}/mobile.png` },
      description: 'Screenshot at mobile viewport'
    },
  ];
}

/**
 * Generate markdown summary for visual audit
 *
 * @param {string} previewUrl - URL being verified
 * @param {Object} results - Visual verification results
 * @returns {string} Markdown-formatted audit template
 */
export function generateVisualAuditMarkdown(previewUrl, results) {
  const timestamp = results.timestamp || new Date().toISOString();

  return `# Visual Audit Report

## Summary
- **URL**: ${previewUrl}
- **Generated**: ${timestamp}
- **Status**: ${results.status}

## Checklist

### Accessibility Snapshot
Execute \`mcp__playwright__browser_snapshot()\` and verify:
- [ ] ARIA roles present and correct
- [ ] Interactive elements have labels
- [ ] Heading hierarchy is logical (h1 > h2 > h3)
- [ ] Form inputs have associated labels

### Responsive Screenshots
| Viewport | Resolution | Status |
|----------|------------|--------|
| Desktop | 1920x1080 | Pending |
| Tablet | 768x1024 | Pending |
| Mobile | 375x667 | Pending |

### Console Errors
Execute \`mcp__playwright__browser_console_messages({ level: "error" })\`
- [ ] No JavaScript errors
- [ ] No failed network requests
- [ ] No accessibility warnings

## MCP Commands to Execute

\`\`\`
${results.mcp_instructions?.map(i =>
    `${i.step}. ${i.tool}(${JSON.stringify(i.params)}) // ${i.description}`
  ).join('\n') || 'No instructions generated'}
\`\`\`

## Results

*Complete after executing MCP commands above*

### Visual Assessment
- Layout matches design: [ ] Yes [ ] No
- Spacing consistent: [ ] Yes [ ] No
- Typography readable: [ ] Yes [ ] No
- Colors match brand: [ ] Yes [ ] No

### Accessibility Assessment
- Keyboard navigable: [ ] Yes [ ] No
- Screen reader friendly: [ ] Yes [ ] No
- Focus indicators visible: [ ] Yes [ ] No
- Touch targets >= 44px: [ ] Yes [ ] No
`;
}
