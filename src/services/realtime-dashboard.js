/**
 * Simplified Real-time Dashboard Updates
 * Uses Supabase Realtime subscriptions for automatic updates
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

class RealtimeDashboard {
  constructor(dbLoader) {
    this.dbLoader = dbLoader;
    this.subscriptions = new Map();
    this.isConnected = false;
    this._debounceTimers = new Map(); // Per-type trailing-edge debounce
    
    // Initialize Supabase client for realtime
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        realtime: {
          params: {
            eventsPerSecond: 2 // Limit updates to prevent overwhelming
          }
        }
      });
      this.isConnected = true;
      console.log('✅ Realtime Dashboard initialized');
    } else {
      console.log('⚠️ Realtime disabled - missing Supabase credentials');
    }
  }

  /**
   * Trailing-edge debounce: coalesces rapid events into a single reload
   * @param {string} key - Debounce group key (e.g., 'sd', 'prd')
   * @param {Function} fn - The function to debounce
   * @param {number} delayMs - Delay in milliseconds (default 1500)
   */
  _debouncedReload(key, fn, delayMs = 1500) {
    if (this._debounceTimers.has(key)) {
      clearTimeout(this._debounceTimers.get(key));
    }
    this._debounceTimers.set(key, setTimeout(async () => {
      this._debounceTimers.delete(key);
      try {
        await fn();
      } catch (err) {
        console.error(`❌ Debounced reload failed (${key}):`, err.message);
      }
    }, delayMs));
  }

  /**
   * Start real-time subscriptions for all tables
   */
  startSubscriptions(onUpdate) {
    if (!this.isConnected) {
      console.log('⚠️ Cannot start subscriptions - not connected');
      return;
    }

    console.log('🔄 Starting real-time subscriptions...');

    // Subscribe to Strategic Directives changes
    const sdChannel = this.supabase
      .channel('strategic-directives-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'strategic_directives_v2'
        },
        (payload) => {
          console.log('📡 SD change detected:', payload.eventType);
          this._debouncedReload('sd', async () => {
            if (this.dbLoader) {
              const sds = await this.dbLoader.loadStrategicDirectives();
              onUpdate('strategicDirectives', sds);
            }
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to Strategic Directives');
        }
      });

    this.subscriptions.set('strategic_directives', sdChannel);

    // Subscribe to PRD changes
    const prdChannel = this.supabase
      .channel('prd-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_requirements_v2'
        },
        (payload) => {
          console.log('📡 PRD change detected:', payload.eventType);
          this._debouncedReload('prd', async () => {
            if (this.dbLoader) {
              const prds = await this.dbLoader.loadPRDs();
              onUpdate('prds', prds);
            }
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to PRDs');
        }
      });

    this.subscriptions.set('product_requirements', prdChannel);

    // Subscribe to Execution Sequences changes
    const eesChannel = this.supabase
      .channel('ees-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'execution_sequences_v2'
        },
        (payload) => {
          console.log('📡 EES change detected:', payload.eventType);
          this._debouncedReload('ees', async () => {
            if (this.dbLoader) {
              const ees = await this.dbLoader.loadExecutionSequences();
              onUpdate('executionSequences', ees);
            }
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to Execution Sequences');
        }
      });

    this.subscriptions.set('execution_sequences', eesChannel);

    // Subscribe to PR Review changes (Agentic Review Integration)
    const prReviewChannel = this.supabase
      .channel('pr-reviews-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agentic_reviews'
        },
        (payload) => {
          console.log('📡 PR review change detected:', payload.eventType);
          this._debouncedReload('prReviews', async () => {
            if (this.dbLoader) {
              const reviews = await this.dbLoader.loadPRReviews();
              const metrics = await this.dbLoader.calculatePRMetrics();
              onUpdate('prReviews', { reviews, metrics });
            }
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to PR Reviews');
        }
      });

    this.subscriptions.set('agentic_reviews', prReviewChannel);

    console.log('📡 Real-time subscriptions active');
  }

  /**
   * Manual refresh - forces reload from database
   */
  async manualRefresh() {
    if (!this.dbLoader || !this.dbLoader.isConnected) {
      throw new Error('Database not connected');
    }

    console.log('🔄 Manual refresh triggered');
    
    const [sds, prds, ees] = await Promise.all([
      this.dbLoader.loadStrategicDirectives(),
      this.dbLoader.loadPRDs(),
      this.dbLoader.loadExecutionSequences()
    ]);

    console.log(`✅ Refreshed: ${sds.length} SDs, ${prds.length} PRDs, ${ees.length} EES`);
    
    return { 
      strategicDirectives: sds, 
      prds: prds, 
      executionSequences: ees 
    };
  }

  /**
   * Stop all subscriptions
   */
  stopSubscriptions() {
    console.log('🛑 Stopping real-time subscriptions...');

    // Clear pending debounce timers
    this._debounceTimers.forEach((timer) => clearTimeout(timer));
    this._debounceTimers.clear();

    this.subscriptions.forEach((channel, name) => {
      channel.unsubscribe();
      console.log(`  ✅ Unsubscribed from ${name}`);
    });

    this.subscriptions.clear();
  }

  /**
   * Check subscription health
   */
  getStatus() {
    const status = {
      connected: this.isConnected,
      subscriptions: {}
    };

    this.subscriptions.forEach((channel, name) => {
      status.subscriptions[name] = channel.state === 'joined';
    });

    return status;
  }
}

export default RealtimeDashboard;