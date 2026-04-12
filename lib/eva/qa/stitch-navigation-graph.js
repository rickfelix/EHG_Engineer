/**
 * Stitch Navigation Graph — Cross-Screen Consistency
 * SD: SD-WIREFRAME-FIDELITY-QA-WITH-ORCH-001-G
 *
 * Builds a navigation adjacency graph from Stitch build_site output,
 * validates bidirectional navigation links, and identifies orphaned screens.
 */

/**
 * Build a navigation adjacency graph from build_site route mappings.
 *
 * @param {Array<{route: string, screenId: string, html: string, title?: string}>} pages
 * @returns {{nodes: Array<{id: string, route: string, title: string}>, edges: Array<{from: string, to: string}>, orphaned: string[]}}
 */
export function buildNavigationGraph(pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    return { nodes: [], edges: [], orphaned: [] };
  }

  // Build route-to-screenId lookup
  const routeToScreen = new Map();
  const nodes = [];
  for (const page of pages) {
    const screenId = page.screenId || page.screen_id || page.route;
    routeToScreen.set(normalizeRoute(page.route), screenId);
    nodes.push({
      id: screenId,
      route: page.route,
      title: page.title || page.route,
    });
  }

  // Extract links from HTML and build edges
  const edges = [];
  const inboundCount = new Map();
  nodes.forEach(n => inboundCount.set(n.id, 0));

  for (const page of pages) {
    const sourceId = page.screenId || page.screen_id || page.route;
    const links = extractLinks(page.html || '');

    for (const link of links) {
      const targetId = routeToScreen.get(normalizeRoute(link));
      if (targetId && targetId !== sourceId) {
        // Deduplicate edges
        const edgeKey = `${sourceId}->${targetId}`;
        if (!edges.some(e => `${e.from}->${e.to}` === edgeKey)) {
          edges.push({ from: sourceId, to: targetId });
          inboundCount.set(targetId, (inboundCount.get(targetId) || 0) + 1);
        }
      }
    }
  }

  // Identify orphaned screens (no inbound links, excluding first/home screen)
  const orphaned = [];
  for (const [screenId, count] of inboundCount) {
    if (count === 0 && screenId !== nodes[0]?.id) {
      orphaned.push(screenId);
    }
  }

  return { nodes, edges, orphaned };
}

/**
 * Validate navigation consistency.
 * Checks for bidirectional links and orphaned screens.
 *
 * @param {{nodes: Array, edges: Array, orphaned: string[]}} graph
 * @returns {{valid: boolean, issues: Array<{type: string, from?: string, to?: string, screenId?: string, message: string}>}}
 */
export function validateNavigation(graph) {
  const issues = [];

  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    return { valid: true, issues: [] };
  }

  // Check for orphaned screens
  for (const screenId of graph.orphaned) {
    const node = graph.nodes.find(n => n.id === screenId);
    issues.push({
      type: 'orphaned',
      screenId,
      message: `Screen "${node?.title || screenId}" has no inbound navigation links`,
    });
  }

  // Check for one-way links (A->B exists but B->A does not)
  for (const edge of graph.edges) {
    const reverse = graph.edges.find(e => e.from === edge.to && e.to === edge.from);
    if (!reverse) {
      const fromNode = graph.nodes.find(n => n.id === edge.from);
      const toNode = graph.nodes.find(n => n.id === edge.to);
      issues.push({
        type: 'one_way',
        from: edge.from,
        to: edge.to,
        message: `One-way link: "${fromNode?.title || edge.from}" -> "${toNode?.title || edge.to}" (no return path)`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract navigation link targets from HTML content.
 * Matches href attributes in anchor tags.
 *
 * @param {string} html
 * @returns {string[]} Array of link targets (routes)
 */
function extractLinks(html) {
  if (!html || typeof html !== 'string') return [];

  const links = [];
  // Match href="..." in anchor tags — covers both single and double quotes
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1].trim();
    // Skip external links, javascript:, mailto:, tel:
    if (href.startsWith('http') || href.startsWith('javascript:') ||
        href.startsWith('mailto:') || href.startsWith('tel:')) {
      continue;
    }
    links.push(href);
  }

  return links;
}

/**
 * Normalize a route for comparison.
 * @param {string} route
 * @returns {string}
 */
function normalizeRoute(route) {
  if (!route) return '';
  return route.replace(/^\/+|\/+$/g, '').toLowerCase();
}
