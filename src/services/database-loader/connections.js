/**
 * Database Connection Module
 * Handles Supabase client initialization and connection management
 * Extracted from database-loader.js - NO BEHAVIOR CHANGES
 */

import { createClient } from '@supabase/supabase-js';

class ConnectionManager {
  constructor() {
    this.supabase = null;
    this.isConnected = false;
  }

  initializeSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey ||
        supabaseUrl === 'your_supabase_url_here' ||
        supabaseKey === 'your_supabase_anon_key_here') {
      console.log('⚠️  Supabase not configured - falling back to file system');
      this.isConnected = false;
      return;
    }

    try {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.isConnected = true;
      console.log('✅ Database connection established');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      this.isConnected = false;
    }
  }

  getClient() {
    return this.supabase;
  }

  isReady() {
    return this.isConnected;
  }
}

export default ConnectionManager;