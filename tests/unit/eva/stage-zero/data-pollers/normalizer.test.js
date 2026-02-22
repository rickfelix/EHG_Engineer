/**
 * Unit Tests: Normalizer
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001
 */

import { describe, test, expect } from 'vitest';
import {
  normalizeAppleEntry,
  normalizeGooglePlayEntry,
  normalizeProductHuntEntry,
} from '../../../../../lib/eva/stage-zero/data-pollers/normalizer.js';

describe('normalizeAppleEntry', () => {
  test('maps fields correctly from Apple RSS entry', () => {
    const entry = { name: 'MyApp', artistName: 'Dev Inc', url: 'https://apps.apple.com/app/myapp/id123' };
    const result = normalizeAppleEntry(entry, 'Health & Fitness', 1);

    expect(result.source).toBe('apple_appstore');
    expect(result.app_name).toBe('MyApp');
    expect(result.developer).toBe('Dev Inc');
    expect(result.app_url).toBe('https://apps.apple.com/app/myapp/id123');
    expect(result.category).toBe('Health & Fitness');
    expect(result.chart_position).toBe(1);
    expect(result.chart_type).toBe('top-free');
  });

  test('handles missing fields gracefully', () => {
    const result = normalizeAppleEntry({}, 'Finance', 50);
    expect(result.app_name).toBe('');
    expect(result.developer).toBe('');
    expect(result.app_url).toBe('');
    expect(result.chart_position).toBe(50);
  });
});

describe('normalizeGooglePlayEntry', () => {
  test('maps all fields including rating and reviews', () => {
    const entry = {
      title: 'FitTracker',
      developer: 'FitCo',
      url: 'https://play.google.com/store/apps/details?id=com.fittracker',
      scoreText: '4.5',
      reviews: 12345,
      installs: '1,000,000+',
      summary: 'Track your fitness',
    };
    const result = normalizeGooglePlayEntry(entry, 'Health & Fitness', 3);

    expect(result.source).toBe('google_play');
    expect(result.app_name).toBe('FitTracker');
    expect(result.rating).toBe(4.5);
    expect(result.review_count).toBe(12345);
    expect(result.installs_range).toBe('1,000,000+');
    expect(result.description).toBe('Track your fitness');
  });

  test('handles non-numeric scoreText', () => {
    const result = normalizeGooglePlayEntry({ scoreText: 'N/A' }, 'Finance', 1);
    expect(result.rating).toBeNull();
  });

  test('handles null score', () => {
    const result = normalizeGooglePlayEntry({ score: null }, 'Finance', 1);
    expect(result.rating).toBeNull();
  });
});

describe('normalizeProductHuntEntry', () => {
  test('maps GraphQL post fields correctly', () => {
    const post = {
      name: 'AIHelper',
      tagline: 'Your AI assistant',
      votesCount: 500,
      url: 'https://www.producthunt.com/posts/aihelper',
      website: 'https://aihelper.com',
    };
    const result = normalizeProductHuntEntry(post, 1);

    expect(result.source).toBe('product_hunt');
    expect(result.app_name).toBe('AIHelper');
    expect(result.description).toBe('Your AI assistant');
    expect(result.vote_count).toBe(500);
    expect(result.app_url).toBe('https://www.producthunt.com/posts/aihelper');
    expect(result.website_url).toBe('https://aihelper.com');
    expect(result.chart_type).toBe('trending');
  });

  test('defaults vote_count to 0 when missing', () => {
    const result = normalizeProductHuntEntry({}, 5);
    expect(result.vote_count).toBe(0);
    expect(result.app_name).toBe('');
  });
});
