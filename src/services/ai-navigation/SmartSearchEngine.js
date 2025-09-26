/**
 * Smart Search Engine - Sprint 4 Implementation
 * SD-002: AI Navigation - Intelligent Search Foundation
 * 
 * Provides intelligent, context-aware search with <500ms response time
 * Uses progressive enhancement: rule-based now, ML-ready architecture
 */

import { createClient } from '@supabase/supabase-js';

class SearchIndex {
  constructor(supabase) {
    this.supabase = supabase;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async buildIndex() {
    const cacheKey = 'search_index';
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const { data, error } = await this.supabase
        .from('search_index')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;

      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data || [];
    } catch (error) {
      console.error('Failed to build search index:', error);
      return this.getFallbackIndex();
    }
  }

  getFallbackIndex() {
    // Fallback data when database is unavailable
    return [
      {
        content_id: 'nav_dashboard',
        content_type: 'navigation',
        title: 'Dashboard',
        description: 'Main application dashboard',
        keywords: ['dashboard', 'home', 'main'],
        search_weight: 150
      },
      {
        content_id: 'nav_portfolio',
        content_type: 'navigation',
        title: 'Portfolio',
        description: 'View your work portfolio',
        keywords: ['portfolio', 'projects', 'work'],
        search_weight: 120
      },
      {
        content_id: 'nav_settings',
        content_type: 'navigation',
        title: 'Settings',
        description: 'Application settings',
        keywords: ['settings', 'preferences', 'config'],
        search_weight: 100
      }
    ];
  }
}

class RankingModel {
  constructor(supabase) {
    this.supabase = supabase;
    this.weights = {
      textRelevance: 0.4,
      usageFrequency: 0.3,
      recency: 0.2,
      contextRelevance: 0.1
    };
  }

  async rankResults(results, context = {}) {
    const rankedResults = await Promise.all(
      results.map(async (result) => {
        const score = await this.calculateScore(result, context);
        return { ...result, score };
      })
    );

    return rankedResults.sort((a, b) => b.score - a.score);
  }

  async calculateScore(result, context) {
    let score = 0;

    // Text relevance score (40%)
    const textScore = result.relevance || 0;
    score += textScore * this.weights.textRelevance;

    // Usage frequency score (30%)
    const usageScore = await this.getUsageScore(result.content_id);
    score += usageScore * this.weights.usageFrequency;

    // Recency score (20%)
    const recencyScore = this.getRecencyScore(result);
    score += recencyScore * this.weights.recency;

    // Context relevance score (10%)
    const contextScore = this.getContextScore(result, context);
    score += contextScore * this.weights.contextRelevance;

    // Apply search weight multiplier
    score *= (result.search_weight || 100) / 100;

    return score;
  }

  async getUsageScore(contentId) {
    try {
      const { data } = await this.supabase
        .from('search_rankings')
        .select('click_count, relevance_score')
        .eq('content_id', contentId)
        .single();

      if (data) {
        const clickScore = Math.min(data.click_count / 100, 1);
        return (clickScore + data.relevance_score) / 2;
      }
    } catch (error) {
      // No usage data yet
    }
    return 0.5; // Default middle score
  }

  getRecencyScore(result) {
    // Placeholder for recency scoring
    // In future: check last accessed time
    return 0.5;
  }

  getContextScore(result, context) {
    // Score based on current context
    if (!context.currentPath) return 0.5;

    // Boost items related to current location
    if (context.currentPath.includes(result.content_id)) {
      return 1.0;
    }

    return 0.3;
  }
}

class SearchHistoryManager {
  constructor(supabase) {
    this.supabase = supabase;
  }

  async recordSearch(query, results, searchTime, context = {}) {
    try {
      const normalizedQuery = query.toLowerCase().trim();
      
      await this.supabase
        .from('search_history')
        .insert({
          query,
          normalized_query: normalizedQuery,
          results: results.map(r => ({
            id: r.content_id,
            score: r.score
          })),
          result_count: results.length,
          search_time_ms: searchTime,
          context,
          session_id: context.sessionId || 'default'
        });

      // Update search suggestions
      await this.updateSuggestions(query, normalizedQuery);
    } catch (error) {
      console.error('Failed to record search history:', error);
    }
  }

  async updateSuggestions(query, normalizedQuery) {
    try {
      const { error } = await this.supabase.rpc('record_search_feedback', {
        p_query: query
      });
      
      if (error) throw error;
    } catch (error) {
      // Fallback: try direct insert
      await this.supabase
        .from('search_suggestions')
        .upsert({
          query,
          normalized_query: normalizedQuery,
          frequency: 1
        }, {
          onConflict: 'query',
          ignoreDuplicates: false
        });
    }
  }

  async recordFeedback(query, selectedResult, shownResults) {
    try {
      await this.supabase.rpc('record_search_feedback', {
        p_query: query,
        p_selected_content_id: selectedResult,
        p_shown_results: shownResults
      });
    } catch (error) {
      console.error('Failed to record feedback:', error);
    }
  }
}

class SearchCacheManager {
  constructor() {
    this.cache = new Map();
    this.maxSize = 100;
    this.ttl = 5 * 60 * 1000; // 5 minutes
  }

  get(query) {
    const key = this.normalizeQuery(query);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.results;
    }
    
    this.cache.delete(key);
    return null;
  }

  set(query, results) {
    const key = this.normalizeQuery(query);
    
    // LRU eviction
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      results,
      timestamp: Date.now()
    });
  }

  normalizeQuery(query) {
    return query.toLowerCase().trim();
  }

  clear() {
    this.cache.clear();
  }
}

export class SmartSearchEngine {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.searchIndex = new SearchIndex(this.supabase);
    this.rankingModel = new RankingModel(this.supabase);
    this.historyManager = new SearchHistoryManager(this.supabase);
    this.cacheManager = new SearchCacheManager();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    // Pre-build index for faster first search
    await this.searchIndex.buildIndex();
    this.initialized = true;
  }

  async search(query, context = {}) {
    const startTime = Date.now();
    
    if (!query || query.trim().length === 0) {
      return { results: [], searchTime: 0 };
    }

    // Check cache first
    const cached = this.cacheManager.get(query);
    if (cached) {
      return { results: cached, searchTime: 0, fromCache: true };
    }

    try {
      // Process query
      const processedQuery = this.preprocessQuery(query);
      
      // Execute search
      const results = await this.executeSearch(processedQuery, context);
      
      // Rank results
      const rankedResults = await this.rankingModel.rankResults(results, context);
      
      // Take top results
      const topResults = rankedResults.slice(0, 20);
      
      // Calculate search time
      const searchTime = Date.now() - startTime;
      
      // Cache results
      this.cacheManager.set(query, topResults);
      
      // Record history (async, don't wait)
      this.historyManager.recordSearch(query, topResults, searchTime, context)
        .catch(console.error);
      
      return {
        results: topResults,
        searchTime,
        fromCache: false
      };
    } catch (error) {
      console.error('Search error:', error);
      return {
        results: [],
        searchTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  preprocessQuery(query) {
    return {
      original: query,
      normalized: query.toLowerCase().trim(),
      tokens: query.toLowerCase().split(/\s+/).filter(t => t.length > 0)
    };
  }

  async executeSearch(processedQuery, context) {
    const { normalized, tokens } = processedQuery;

    // Try database search first
    try {
      const { data, error } = await this.supabase.rpc('smart_search', {
        p_query: normalized,
        p_limit: 50
      });

      if (!error && data && data.length > 0) {
        return data.map(item => ({
          ...item,
          relevance: item.score || 0
        }));
      }
    } catch (error) {
      console.error('Database search failed:', error);
    }

    // Fallback to local search
    const index = await this.searchIndex.buildIndex();
    return this.localSearch(index, processedQuery);
  }

  localSearch(index, processedQuery) {
    const { normalized, tokens } = processedQuery;
    const results = [];

    for (const item of index) {
      let score = 0;
      
      // Title match
      if (item.title.toLowerCase().includes(normalized)) {
        score += 1.0;
      }
      
      // Description match
      if (item.description && item.description.toLowerCase().includes(normalized)) {
        score += 0.5;
      }
      
      // Keyword match
      if (item.keywords) {
        for (const token of tokens) {
          if (item.keywords.some(k => k.toLowerCase().includes(token))) {
            score += 0.3;
          }
        }
      }
      
      if (score > 0) {
        results.push({
          ...item,
          relevance: score,
          score: score * (item.search_weight || 100) / 100
        });
      }
    }

    return results;
  }

  async getSuggestions(prefix) {
    if (!prefix || prefix.length < 2) {
      return [];
    }

    try {
      // Try database suggestions first
      const { data, error } = await this.supabase.rpc('get_search_suggestions', {
        p_prefix: prefix,
        p_limit: 10
      });

      if (!error && data) {
        return data.map(s => s.suggestion);
      }
    } catch (error) {
      console.error('Failed to get suggestions:', error);
    }

    // Fallback suggestions
    return this.getLocalSuggestions(prefix);
  }

  getLocalSuggestions(prefix) {
    const suggestions = [
      'Dashboard',
      'Settings',
      'Portfolio',
      'Analytics',
      'Search',
      'Export',
      'New Project',
      'Help'
    ];

    const normalized = prefix.toLowerCase();
    return suggestions
      .filter(s => s.toLowerCase().startsWith(normalized))
      .slice(0, 5);
  }

  async recordFeedback(query, selectedResult, shownResults) {
    await this.historyManager.recordFeedback(query, selectedResult, shownResults);
  }

  clearCache() {
    this.cacheManager.clear();
    this.searchIndex.cache.clear();
  }
}

// Singleton instance
let searchEngineInstance = null;

export function getSearchEngine() {
  if (!searchEngineInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase configuration missing for SmartSearchEngine');
      return null;
    }
    
    searchEngineInstance = new SmartSearchEngine(supabaseUrl, supabaseKey);
    searchEngineInstance.initialize().catch(console.error);
  }
  
  return searchEngineInstance;
}

export default SmartSearchEngine;