/**
 * Database Loader Orchestrator (TypeScript version)
 * Main entry point that coordinates all database operations
 */

import path from 'path';
import dotenv from 'dotenv';
import { SupabaseClient } from '@supabase/supabase-js';

import ConnectionManager from './connections';

dotenv.config({ path: path.join(__dirname, '../../..', '.env') });

export interface LoadOptions {
  dryRun?: boolean;
}

export interface LoadResult {
  count: number;
  data: any[];
}

/**
 * DatabaseLoader class - maintains original API with TypeScript types
 */
export class DatabaseLoader {
  private connectionManager: ConnectionManager;
  public supabase: SupabaseClient | null = null;
  public isConnected = false;

  constructor() {
    this.connectionManager = new ConnectionManager();
    this.initializeSupabase();
  }

  initializeSupabase(): void {
    this.connectionManager.initializeSupabase();
    this.supabase = this.connectionManager.getClient();
    this.isConnected = this.connectionManager.isConnected();
  }

  // Strategic Directives methods
  async loadStrategicDirectives(options: LoadOptions = {}): Promise<LoadResult> {
    const { dryRun = false } = options;
    if (dryRun) {
      console.log('[dry-run] Would load strategic directives from database');
      return { count: 0, data: [] };
    }

    if (!this.supabase) {
      throw new Error('Database not connected');
    }

    const { data, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { count: data?.length || 0, data: data || [] };
  }

  async loadPRDs(options: LoadOptions = {}): Promise<LoadResult> {
    const { dryRun = false } = options;
    if (dryRun) {
      console.log('[dry-run] Would load PRDs from database');
      return { count: 0, data: [] };
    }

    if (!this.supabase) {
      throw new Error('Database not connected');
    }

    const { data, error } = await this.supabase
      .from('prds')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { count: data?.length || 0, data: data || [] };
  }

  // Add other methods as needed...
}

// Helper to parse CLI flags
export function parseFlags(argv: string[] = process.argv.slice(2)): LoadOptions {
  return { dryRun: argv.includes('--dry-run') };
}

export default DatabaseLoader;