import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertCircle,
  GitMerge,
  TrendingUp,
  Lock,
  Unlock
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ReleaseGateWidget({ sdKey, isCompact = false }) {
  const [gateData, setGateData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (sdKey) {
      loadGateData();
      // Set up real-time subscription
      const subscription = supabase
        .channel('release-gates')
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'sd_backlog_map',
            filter: `sd_id=eq.${sdKey}`
          },
          () => {
            loadGateData(); // Reload on changes
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [sdKey]);

  async function loadGateData() {
    try {
      setLoading(true);

      // Get release gate status
      const { data, error } = await supabase
        .from('v_sd_release_gate')
        .select('*')
        .eq('sd_key', sdKey)
        .single();

      if (error) throw error;

      setGateData(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load gate data:', err);
      setError(err.message);
      setGateData(null);
    } finally {
      setLoading(false);
    }
  }

  if (!sdKey) {
    return null; // Don't show widget if no SD selected
  }

  if (loading) {
    return (
      <div className={`${isCompact ? 'p-3' : 'p-4'} bg-white dark:bg-gray-800 rounded-lg shadow animate-pulse`}>
        <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  if (error || !gateData) {
    return null; // Silently hide if no gate data available
  }

  const {
    ready,
    passing_pct = 0,
    passing_count = 0,
    failing_count = 0,
    not_run_count = 0,
    total_stories = 0,
    avg_coverage = 0
  } = gateData;

  // Determine gate status color and icon
  const gateColor = ready ? 'text-green-500' : 'text-red-500';
  const gateIcon = ready ?
    <Unlock className="w-5 h-5" /> :
    <Lock className="w-5 h-5" />;
  const gateStatus = ready ? 'READY TO MERGE' : 'BLOCKED';
  const gateBg = ready ?
    'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
    'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';

  // Calculate percentage for progress bar
  const progressPercent = Math.min(100, Math.max(0, passing_pct));
  const threshold = 80; // 80% threshold

  return (
    <motion.div
      className={`${isCompact ? 'p-3' : 'p-4'} bg-white dark:bg-gray-800 rounded-lg shadow-lg border ${gateBg}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className={`w-5 h-5 ${gateColor}`} />
          <h3 className={`${isCompact ? 'text-sm' : 'text-base'} font-semibold text-gray-900 dark:text-white`}>
            Release Gate
          </h3>
        </div>
        <div className={`flex items-center gap-1 ${gateColor}`}>
          {gateIcon}
          <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-bold`}>
            {gateStatus}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Story Verification
          </span>
          <span className={`text-xs font-bold ${progressPercent >= threshold ? 'text-green-600' : 'text-amber-600'}`}>
            {progressPercent.toFixed(0)}% / {threshold}%
          </span>
        </div>
        <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          {/* Threshold marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-400 dark:bg-gray-500 z-10"
            style={{ left: `${threshold}%` }}
          />
          {/* Progress fill */}
          <motion.div
            className={`h-full ${progressPercent >= threshold ? 'bg-green-500' : 'bg-amber-500'}`}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Story Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-green-600 dark:text-green-400`}>
              {passing_count}
            </span>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">Passing</span>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <XCircle className="w-3 h-3 text-red-500" />
            <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-red-600 dark:text-red-400`}>
              {failing_count}
            </span>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">Failing</span>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <AlertCircle className="w-3 h-3 text-gray-400" />
            <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-gray-600 dark:text-gray-400`}>
              {not_run_count}
            </span>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">Not Run</span>
        </div>
      </div>

      {/* Coverage & Total */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-blue-500" />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Coverage: {avg_coverage.toFixed(0)}%
          </span>
        </div>
        <span className="text-xs text-gray-600 dark:text-gray-400">
          Total: {total_stories} stories
        </span>
      </div>

      {/* Gate Message */}
      {!ready && total_stories > 0 && (
        <motion.div
          className="mt-3 p-2 bg-amber-100 dark:bg-amber-900/30 rounded text-xs text-amber-800 dark:text-amber-200"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2">
            <GitMerge className="w-3 h-3" />
            <span>
              Need {Math.ceil(total_stories * 0.8) - passing_count} more passing stories to merge
            </span>
          </div>
        </motion.div>
      )}

      {/* Feature Flag Check */}
      {process.env.REACT_APP_FEATURE_STORY_GATES === 'false' && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
          Gates tracking only (not enforcing)
        </div>
      )}
    </motion.div>
  );
}