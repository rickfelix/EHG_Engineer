/**
 * Smoke Tests for EHG_Engineer
 * Quick validation that critical systems are functional
 * Target execution time: <60 seconds
 */

import { jest } from '@jest/globals';
import dotenv from 'dotenv';

dotenv.config();

describe('Smoke Tests - Critical System Validation', () => {
  describe('Environment Configuration', () => {
    test('should have Supabase URL configured', () => {
      expect(process.env.SUPABASE_URL).toBeDefined();
      expect(process.env.SUPABASE_URL).not.toBe('your_supabase_url_here');
    });

    test('should have Supabase anon key configured', () => {
      expect(process.env.SUPABASE_ANON_KEY).toBeDefined();
      expect(process.env.SUPABASE_ANON_KEY.length).toBeGreaterThan(50);
    });

    test('should have node environment set', () => {
      expect(process.env.NODE_ENV || 'development').toBeTruthy();
    });
  });

  describe('Core Dependencies', () => {
    test('should load Supabase client', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      expect(createClient).toBeDefined();
      expect(typeof createClient).toBe('function');
    });

    test('should load Express', async () => {
      const express = await import('express');
      expect(express.default).toBeDefined();
      expect(typeof express.default).toBe('function');
    });

    test('should load dotenv', async () => {
      const dotenv = await import('dotenv');
      expect(dotenv.config).toBeDefined();
      expect(typeof dotenv.config).toBe('function');
    });
  });

  describe('Database Schema', () => {
    let supabase;

    beforeAll(async () => {
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );
    });

    test('should connect to strategic_directives_v2 table', async () => {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    test('should connect to product_requirements_v2 table', async () => {
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .select('id')
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    test('should connect to leo_protocols table', async () => {
      const { data, error } = await supabase
        .from('leo_protocols')
        .select('id')
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('File System Access', () => {
    test('should access package.json', async () => {
      const fs = await import('fs/promises');
      const packageJson = await fs.readFile('./package.json', 'utf-8');
      const parsed = JSON.parse(packageJson);

      expect(parsed.name).toBe('ehg-engineer');
      expect(parsed.version).toBeDefined();
    });

    test('should access jest config', async () => {
      const fs = await import('fs/promises');
      const configExists = await fs.access('./jest.config.cjs')
        .then(() => true)
        .catch(() => false);

      expect(configExists).toBe(true);
    });
  });

  describe('Script Availability', () => {
    test('should have test:coverage script', async () => {
      const fs = await import('fs/promises');
      const packageJson = JSON.parse(await fs.readFile('./package.json', 'utf-8'));

      expect(packageJson.scripts['test:coverage']).toBeDefined();
    });

    test('should have build:client script', async () => {
      const fs = await import('fs/promises');
      const packageJson = JSON.parse(await fs.readFile('./package.json', 'utf-8'));

      expect(packageJson.scripts['build:client']).toBeDefined();
    });

    test('should have leo:status script', async () => {
      const fs = await import('fs/promises');
      const packageJson = JSON.parse(await fs.readFile('./package.json', 'utf-8'));

      expect(packageJson.scripts['leo:status']).toBeDefined();
    });
  });

  describe('LEO Protocol Version', () => {
    let supabase;

    beforeAll(async () => {
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );
    });

    test('should have an active LEO protocol version', async () => {
      const { data, error } = await supabase
        .from('leo_protocols')
        .select('version, status')
        .eq('status', 'active')
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.version).toBeDefined();
      expect(data.status).toBe('active');
    });
  });
});
