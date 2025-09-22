/**
 * Connection Manager for Database Operations (TypeScript version)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../..', '.env') });

export interface ConnectionConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
  serviceRoleKey?: string;
}

export class ConnectionManager {
  private supabase: SupabaseClient | null = null;
  private isReady = false;

  constructor(config: ConnectionConfig = {}) {
    const supabaseUrl = config.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = config.supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.isReady = true;
    }
  }

  initializeSupabase(): void {
    if (!this.supabase) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.isReady = true;
        console.log('✅ Database connection established');
      } else {
        console.error('❌ Missing Supabase credentials');
      }
    }
  }

  getClient(): SupabaseClient | null {
    return this.supabase;
  }

  isConnected(): boolean {
    return this.isReady;
  }
}

export default ConnectionManager;