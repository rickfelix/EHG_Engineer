/**
 * PRD Playwright Generator - Configuration
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

export const DEFAULT_CONFIG = {
  outputDir: 'tests/e2e/generated',
  templateDir: 'tests/templates',
  baseUrl: 'http://localhost:8080'
};

export const DEFAULT_VIEWPORT_SIZES = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 667 }
];

export const DEFAULT_BROWSERS = ['chromium', 'firefox', 'webkit'];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export function createSupabaseClient() {
  return createClient(supabaseUrl, supabaseKey);
}
