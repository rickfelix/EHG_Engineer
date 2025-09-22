import React, { useState } from 'react';
import { RefreshCw, Database, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function SmartRefreshButton({ onRefresh, isCompact = false, isCollapsed = false }) {
  const [refreshState, setRefreshState] = useState('idle'); // idle, refreshing, complete, error
  const [feedback, setFeedback] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);

  const handleManualRefresh = async () => {
    console.log('🔄 Manual Refresh: Starting database sync...');
    setRefreshState('refreshing');
    setFeedback('Syncing with database...');

    try {
      // Simple database refresh - no analysis needed
      // Real-time subscriptions handle automatic updates
      const response = await fetch('/api/refresh', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'database' })
      });
      
      if (!response.ok) {
        throw new Error('Database refresh failed');
      }
      
      const result = await response.json();
      console.log('✅ Database refreshed:', result);
      
      // Call the parent's onRefresh to update UI with new data
      if (onRefresh) {
        console.log('🔄 Triggering UI refresh...');
        await onRefresh();
      }
      
      setRefreshState('complete');
      setFeedback(`Refreshed: ${result.sds || 0} SDs, ${result.prds || 0} PRDs`);
      setLastRefresh(new Date());
      
      // Auto-clear success state after 3 seconds
      setTimeout(() => {
        setRefreshState('idle');
        setFeedback('');
      }, 3000);

    } catch (error) {
      console.error('❌ Refresh Error:', error);
      setRefreshState('error');
      setFeedback(`Failed: ${error.message}`);
      
      // Auto-clear error state after 5 seconds
      setTimeout(() => {
        setRefreshState('idle');
        setFeedback('');
      }, 5000);
    }
  };

  const getButtonIcon = () => {
    switch (refreshState) {
      case 'refreshing':
        return <Database className="w-4 h-4 animate-spin" />;
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <RefreshCw className="w-4 h-4" />;
    }
  };

  const getButtonColor = () => {
    switch (refreshState) {
      case 'refreshing':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'complete':
        return 'bg-green-500 hover:bg-green-600';
      case 'error':
        return 'bg-red-500 hover:bg-red-600';
      default:
        return 'bg-gray-600 hover:bg-gray-700';
    }
  };

  const isDisabled = refreshState === 'refreshing';

  return (
    <div className="relative flex items-center">
      <motion.button
        onClick={handleManualRefresh}
        disabled={isDisabled}
        className={`
          flex items-center ${isCollapsed ? 'justify-center w-full' : ''} transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
          ${getButtonColor()} text-white rounded hover:opacity-90
          ${isCollapsed 
            ? 'px-2 py-2' 
            : isCompact 
              ? 'px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm' 
              : 'px-3 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base'
          }
        `}
        whileHover={{ scale: isDisabled ? 1 : 1.05 }}
        whileTap={{ scale: isDisabled ? 1 : 0.95 }}
        title={isCollapsed ? "Manual Refresh - Sync with database" : "Manually sync with database (automatic real-time updates are active)"}
      >
        {getButtonIcon()}
        {!isCollapsed && (
          <>
            <span className={`${isCompact ? 'ml-1' : 'ml-1 sm:ml-2'} hidden xs:inline`}>
              {refreshState === 'idle' && 'Manual Refresh'}
              {refreshState === 'refreshing' && 'Syncing...'}
              {refreshState === 'complete' && 'Synced!'}
              {refreshState === 'error' && 'Failed'}
            </span>
            <span className="xs:hidden ml-1">
              {refreshState === 'idle' && '↻'}
              {refreshState === 'refreshing' && '↻'}
              {refreshState === 'complete' && '✓'}
              {refreshState === 'error' && '✗'}
            </span>
          </>
        )}
      </motion.button>

      <AnimatePresence>
        {feedback && !isCollapsed && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className={`
              absolute left-full ml-4 top-1/2 transform -translate-y-1/2
              text-sm px-3 py-1 rounded-lg whitespace-nowrap z-50
              ${refreshState === 'error' 
                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                : refreshState === 'complete'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
              }
              ${isCompact ? 'text-xs px-2 py-0.5' : ''}
            `}
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip for collapsed sidebar state */}
      <AnimatePresence>
        {isCollapsed && feedback && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={`
              absolute left-full ml-2 top-1/2 transform -translate-y-1/2
              text-xs px-2 py-1 rounded-lg whitespace-nowrap z-50 pointer-events-none
              ${refreshState === 'error' 
                ? 'bg-red-900 text-red-200'
                : refreshState === 'complete'
                ? 'bg-green-900 text-green-200'
                : 'bg-blue-900 text-blue-200'
              }
            `}
          >
            {refreshState === 'refreshing' && 'Syncing'}
            {refreshState === 'complete' && 'Done!'}
            {refreshState === 'error' && 'Error'}
          </motion.div>
        )}
      </AnimatePresence>

      {lastRefresh && refreshState === 'idle' && (
        <div className={`absolute left-full ml-4 top-full mt-1 text-gray-500 dark:text-gray-400 whitespace-nowrap ${isCompact ? 'text-xs' : 'text-sm'}`}>
          Last refresh: {lastRefresh.toLocaleTimeString()}
        </div>
      )}

      {/* Real-time indicator */}
      <div className="absolute -top-1 -right-1">
        <div className="relative">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <div className="absolute inset-0 w-2 h-2 bg-green-400 rounded-full animate-ping"></div>
        </div>
      </div>
    </div>
  );
}

export default SmartRefreshButton;