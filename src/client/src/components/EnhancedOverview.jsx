import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import { 
  FileText, 
  GitBranch, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  Users,
  ArrowRight,
  LayoutDashboard,
  Database,
  Wand2,
  FlaskConical,
  Package
} from 'lucide-react';
// SDAssistant removed - using DirectiveLab instead
import ActiveSDProgress from './ActiveSDProgress';
import SmartRefreshButton from './SmartRefreshButton';
import ReleaseGateWidget from './ReleaseGateWidget';
import { useReducedMotion } from '../animations/hooks/useReducedMotion';

function EnhancedOverview({ state, onRefresh, onSetActiveSD, isCompact }) {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState({
    tests: { total: 0, passed: 0, failed: 0 },
    coverage: { lines: 0, branches: 0, functions: 0, statements: 0 },
    git: { branch: 'unknown', uncommittedChanges: 0, lastCommit: '' }
  });
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => setMetrics(data))
      .catch(error => console.error('Error loading metrics:', error));
  }, []);

  
  const cardClass = isCompact 
    ? 'bg-white dark:bg-gray-800 rounded-lg shadow p-2 sm:p-3' 
    : 'bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6';
  
  const headerClass = isCompact 
    ? 'text-base sm:text-lg font-semibold mb-2' 
    : 'text-lg sm:text-xl font-semibold mb-4';

  // Animation variants for cards - much faster
  const cardVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    visible: (index) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.1,
        delay: shouldReduceMotion ? 0 : index * 0.02  // Much less delay
      }
    })
  };

  return (
    <div className={isCompact ? 'space-y-2 sm:space-y-3' : 'space-y-4 sm:space-y-6'}>
      {/* SDAssistant removed - now using DirectiveLab navigation */}
      
      {/* Header */}
      <motion.div 
        className="flex items-center justify-between"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.08 }}
      >
        <div className="flex items-center">
          <LayoutDashboard className={isCompact ? 'w-5 h-5 sm:w-6 sm:h-6 mr-2' : 'w-6 sm:w-8 h-6 sm:h-8 mr-2 sm:mr-3'} />
          <h1 className={isCompact ? 'text-xl sm:text-2xl font-bold' : 'text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white'}>
            Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => navigate('/directive-lab?mode=quick')}
            className={`flex items-center ${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors`}
            whileHover={{ scale: shouldReduceMotion ? 1 : 1.05 }}
            whileTap={{ scale: shouldReduceMotion ? 1 : 0.95 }}
          >
            <Wand2 className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} mr-2`} />
            New Directive
          </motion.button>
          <SmartRefreshButton 
            onRefresh={onRefresh} 
            isCompact={isCompact} 
          />
        </div>
      </motion.div>

      {/* Active Strategic Directive Progress */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.1 }}
      >
        <ActiveSDProgress 
          strategicDirectives={state.strategicDirectives}
          prds={state.prds}
          currentSD={state.leoProtocol?.currentSD}
          onSetActiveSD={onSetActiveSD}
          isCompact={isCompact}
        />
      </motion.div>

      {/* Release Gate Widget - Show when there's an active SD */}
      {state.leoProtocol?.currentSD && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.1, delay: 0.05 }}
        >
          <ReleaseGateWidget
            sdKey={state.leoProtocol.currentSD}
            isCompact={isCompact}
          />
        </motion.div>
      )}

      {/* Status Cards Grid - Stacked vertically for narrow widths */}
      <div className={`grid gap-${isCompact ? '2 sm:gap-3' : '3 sm:gap-4'} grid-cols-1`}>
        {/* LEO Status */}
        <motion.div 
          className={cardClass}
          initial="hidden"
          animate="visible"
          custom={1}
          variants={cardVariants}
          whileHover={{ scale: shouldReduceMotion ? 1 : 1.02, transition: { duration: 0.1 } }}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className={isCompact ? 'text-xs sm:text-xs text-gray-600 dark:text-gray-400' : 'text-xs sm:text-sm text-gray-600 dark:text-gray-400'}>
                Active Role
              </p>
              <p className={isCompact ? 'text-lg sm:text-xl font-bold truncate' : 'text-xl sm:text-2xl font-bold truncate'}>
                {state.leoProtocol.activeRole || 'Awaiting SD'}
              </p>
              <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                <p className={isCompact ? 'text-xs' : 'text-xs sm:text-sm'} style={{ color: '#4f9cf9' }}>
                  LEO v{state.leoProtocol.version}
                </p>
                {state.leoProtocol.lastHandoff && (
                  <span className={`${isCompact ? 'text-xs' : 'text-xs sm:text-sm'} text-gray-500 truncate`}>
                    • {new Date(state.leoProtocol.lastHandoff.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
            <Users className={`${isCompact ? 'w-6 sm:w-8 h-6 sm:h-8' : 'w-8 sm:w-10 h-8 sm:h-10'} flex-shrink-0 ${
              state.leoProtocol.activeRole === 'LEAD' ? 'text-blue-500' :
              state.leoProtocol.activeRole === 'PLAN' ? 'text-purple-500' :
              state.leoProtocol.activeRole === 'EXEC' ? 'text-green-500' :
              'text-gray-400'
            }`} />
          </div>
        </motion.div>

        {/* Strategic Directives */}
        <motion.div 
          className={cardClass}
          initial="hidden"
          animate="visible"
          custom={2}
          variants={cardVariants}
          whileHover={{ scale: shouldReduceMotion ? 1 : 1.02, transition: { duration: 0.1 } }}
        >
          <Link to="/strategic-directives" className="block">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className={isCompact ? 'text-xs sm:text-xs text-gray-600 dark:text-gray-400' : 'text-xs sm:text-sm text-gray-600 dark:text-gray-400'}>
                  Strategic Directives
                </p>
                <p className={isCompact ? 'text-lg sm:text-xl font-bold' : 'text-xl sm:text-2xl font-bold'}>
                  <CountUp 
                    end={state.strategicDirectives.length} 
                    duration={shouldReduceMotion ? 0 : 1.5}
                    preserveValue
                  />
                </p>
                <p className={isCompact ? 'text-xs' : 'text-xs sm:text-sm'} style={{ color: '#10b981' }}>
                  <CountUp 
                    end={state.strategicDirectives.filter(sd => sd.metadata?.Status === 'Active').length} 
                    duration={shouldReduceMotion ? 0 : 1.2}
                    preserveValue
                  /> Active
                </p>
              </div>
              <FileText className={`${isCompact ? 'w-6 sm:w-8 h-6 sm:h-8' : 'w-8 sm:w-10 h-8 sm:h-10'} flex-shrink-0 text-blue-500`} />
            </div>
          </Link>
        </motion.div>

        {/* Backlog */}
        <motion.div 
          className={cardClass}
          initial="hidden"
          animate="visible"
          custom={3}
          variants={cardVariants}
          whileHover={{ scale: shouldReduceMotion ? 1 : 1.02, transition: { duration: 0.1 } }}
        >
          <Link to="/backlog" className="block">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className={isCompact ? 'text-xs sm:text-xs text-gray-600 dark:text-gray-400' : 'text-xs sm:text-sm text-gray-600 dark:text-gray-400'}>
                  Backlog Items
                </p>
                <p className={isCompact ? 'text-lg sm:text-xl font-bold' : 'text-xl sm:text-2xl font-bold'}>
                  <CountUp 
                    end={state.strategicDirectives.reduce((sum, sd) => sum + (sd.total_backlog_items || sd.total_items || sd.backlog_count || 0), 0)} 
                    duration={shouldReduceMotion ? 0 : 1.5}
                    preserveValue
                  />
                </p>
                <p className={isCompact ? 'text-xs' : 'text-xs sm:text-sm'} style={{ color: '#6366f1' }}>
                  <CountUp 
                    end={state.strategicDirectives.filter(sd => (sd.total_backlog_items || sd.total_items || sd.backlog_count || 0) > 0).length} 
                    duration={shouldReduceMotion ? 0 : 1.2}
                    preserveValue
                  /> SDs with items
                </p>
              </div>
              <Package className={`${isCompact ? 'w-6 sm:w-8 h-6 sm:h-8' : 'w-8 sm:w-10 h-8 sm:h-10'} flex-shrink-0 text-indigo-500`} />
            </div>
          </Link>
        </motion.div>

        {/* Directive Lab */}
        <motion.div 
          className={cardClass}
          initial="hidden"
          animate="visible"
          custom={4}
          variants={cardVariants}
          whileHover={{ scale: shouldReduceMotion ? 1 : 1.02, transition: { duration: 0.1 } }}
        >
          <Link to="/directive-lab" className="block">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className={isCompact ? 'text-xs sm:text-xs text-gray-600 dark:text-gray-400' : 'text-xs sm:text-sm text-gray-600 dark:text-gray-400'}>
                  SDIP Submissions
                </p>
                <p className={isCompact ? 'text-lg sm:text-xl font-bold' : 'text-xl sm:text-2xl font-bold'}>
                  Directive Lab
                </p>
                <p className={isCompact ? 'text-xs' : 'text-xs sm:text-sm'} style={{ color: '#8b5cf6' }}>
                  Ready to submit
                </p>
              </div>
              <FlaskConical className={`${isCompact ? 'w-6 sm:w-8 h-6 sm:h-8' : 'w-8 sm:w-10 h-8 sm:h-10'} flex-shrink-0 text-purple-500`} />
            </div>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

export default EnhancedOverview;