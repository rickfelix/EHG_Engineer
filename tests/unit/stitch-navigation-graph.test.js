import { describe, it, expect } from 'vitest';
import { buildNavigationGraph, validateNavigation } from '../../lib/eva/qa/stitch-navigation-graph.js';

describe('buildNavigationGraph', () => {
  it('builds graph from 3 pages with links', () => {
    const pages = [
      { route: '/home', screenId: 'S1', html: '<a href="/about">About</a><a href="/contact">Contact</a>', title: 'Home' },
      { route: '/about', screenId: 'S2', html: '<a href="/home">Home</a>', title: 'About' },
      { route: '/contact', screenId: 'S3', html: '<a href="/home">Home</a>', title: 'Contact' },
    ];
    const graph = buildNavigationGraph(pages);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(4); // home->about, home->contact, about->home, contact->home
    expect(graph.orphaned).toHaveLength(0);
  });

  it('identifies orphaned screen', () => {
    const pages = [
      { route: '/home', screenId: 'S1', html: '<a href="/about">About</a>', title: 'Home' },
      { route: '/about', screenId: 'S2', html: '<a href="/home">Home</a>', title: 'About' },
      { route: '/settings', screenId: 'S3', html: '', title: 'Settings' },
    ];
    const graph = buildNavigationGraph(pages);
    expect(graph.orphaned).toContain('S3');
  });

  it('excludes first screen from orphan detection (home page)', () => {
    const pages = [
      { route: '/home', screenId: 'S1', html: '', title: 'Home' },
      { route: '/about', screenId: 'S2', html: '<a href="/home">Home</a>', title: 'About' },
    ];
    const graph = buildNavigationGraph(pages);
    expect(graph.orphaned).not.toContain('S1');
  });

  it('deduplicates edges', () => {
    const pages = [
      { route: '/home', screenId: 'S1', html: '<a href="/about">Link 1</a><a href="/about">Link 2</a>', title: 'Home' },
      { route: '/about', screenId: 'S2', html: '', title: 'About' },
    ];
    const graph = buildNavigationGraph(pages);
    const homeToAbout = graph.edges.filter(e => e.from === 'S1' && e.to === 'S2');
    expect(homeToAbout).toHaveLength(1);
  });

  it('skips external links', () => {
    const pages = [
      { route: '/home', screenId: 'S1', html: '<a href="https://google.com">Google</a><a href="/about">About</a>', title: 'Home' },
      { route: '/about', screenId: 'S2', html: '', title: 'About' },
    ];
    const graph = buildNavigationGraph(pages);
    expect(graph.edges).toHaveLength(1);
  });

  it('handles empty pages array', () => {
    const graph = buildNavigationGraph([]);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.orphaned).toHaveLength(0);
  });

  it('handles null input', () => {
    const graph = buildNavigationGraph(null);
    expect(graph.nodes).toHaveLength(0);
  });

  it('normalizes routes for matching', () => {
    const pages = [
      { route: '/Home/', screenId: 'S1', html: '<a href="about">About</a>', title: 'Home' },
      { route: '/About', screenId: 'S2', html: '', title: 'About' },
    ];
    const graph = buildNavigationGraph(pages);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toEqual({ from: 'S1', to: 'S2' });
  });
});

describe('validateNavigation', () => {
  it('returns valid for fully connected graph', () => {
    const graph = {
      nodes: [
        { id: 'S1', route: '/home', title: 'Home' },
        { id: 'S2', route: '/about', title: 'About' },
      ],
      edges: [
        { from: 'S1', to: 'S2' },
        { from: 'S2', to: 'S1' },
      ],
      orphaned: [],
    };
    const result = validateNavigation(graph);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('flags orphaned screens', () => {
    const graph = {
      nodes: [
        { id: 'S1', route: '/home', title: 'Home' },
        { id: 'S3', route: '/settings', title: 'Settings' },
      ],
      edges: [],
      orphaned: ['S3'],
    };
    const result = validateNavigation(graph);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('orphaned');
    expect(result.issues[0].screenId).toBe('S3');
  });

  it('flags one-way links', () => {
    const graph = {
      nodes: [
        { id: 'S1', route: '/home', title: 'Home' },
        { id: 'S2', route: '/about', title: 'About' },
      ],
      edges: [{ from: 'S1', to: 'S2' }],
      orphaned: [],
    };
    const result = validateNavigation(graph);
    expect(result.issues.some(i => i.type === 'one_way')).toBe(true);
  });

  it('handles empty graph', () => {
    const result = validateNavigation({ nodes: [], edges: [], orphaned: [] });
    expect(result.valid).toBe(true);
  });

  it('handles null input', () => {
    const result = validateNavigation(null);
    expect(result.valid).toBe(true);
  });
});
