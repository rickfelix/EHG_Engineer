import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  GitBranch, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  Users,
  ArrowRight,
  RefreshCw,
  LayoutDashboard,
  Database,
  Wand2,
  Activity,
  Gauge,
  Package,
  Code,
  TestTube,
  GitCommit
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SDAssistant from './SDAssistant';
import ActiveSDProgress from './ActiveSDProgress';
import AnimatedCard from './AnimatedCard';
import CardGrid from './CardGrid';
import { CardSkeleton } from './LoadingSkeleton';
import { useReducedMotion } from '../animations/hooks/useReducedMotion';
import { ANIMATION_DURATION } from '../animations/constants';

function AnimatedOverview({ state, onRefresh, onSetActiveSD, isCompact }) {
  const [showSDAssistant, setShowSDAssistant] = useState(false);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    tests: { total: 0, passed: 0, failed: 0 },
    coverage: { lines: 0, branches: 0, functions: 0, statements: 0 },
    git: { branch: 'unknown', uncommittedChanges: 0, lastCommit: '' }
  });
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    // Simulate loading
    setTimeout(() => setLoading(false), 1000);
    
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => {
        setMetrics(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error loading metrics:', error);
        setLoading(false);
      });
  }, []);

  const contextPercentage = Math.round((state.context.usage / state.context.total) * 100);
  const contextStatus = contextPercentage > 90 ? 'critical' : contextPercentage > 70 ? 'warning' : 'healthy';

  // Prepare cards data
  const dashboardCards = [
    {
      id: 'context',
      title: 'Context Usage',
      icon: Gauge,
      expandable: true,
      flippable: true,
      content: (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold">{contextPercentage}%</span>
            <span className={`px-2 py-1 rounded text-xs ${
              contextStatus === 'critical' ? 'bg-red-100 text-red-800' :
              contextStatus === 'warning' ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            }`}>
              {contextStatus}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <motion.div 
              className={`h-2 rounded-full ${
                contextStatus === 'critical' ? 'bg-red-500' :
                contextStatus === 'warning' ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${contextPercentage}%` }}
              transition={{ duration: shouldReduceMotion ? 0 : 1, ease: 'easeOut' }}
            />
          </div>
        </div>
      ),
      backContent: (
        <div className="space-y-2">
          <h4 className="font-semibold">Breakdown:</h4>
          {Object.entries(state.context.breakdown || {}).map(([key, value]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
              <span>{value || 0} tokens</span>
            </div>
          ))}
        </div>
      )
    },
    {
      id: 'tests',
      title: 'Test Status',
      icon: TestTube,
      expandable: true,
      content: (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span>Total Tests:</span>
            <span className="font-bold">{metrics.tests.total}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center">
              <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
              Passed:
            </span>
            <span className="font-bold text-green-600">{metrics.tests.passed}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center">
              <XCircle className="w-4 h-4 text-red-500 mr-1" />
              Failed:
            </span>
            <span className="font-bold text-red-600">{metrics.tests.failed}</span>
          </div>
        </div>
      )
    },
    {
      id: 'coverage',
      title: 'Code Coverage',
      icon: Code,
      expandable: true,
      flippable: true,
      content: (
        <div className="space-y-2">
          {Object.entries(metrics.coverage).map(([key, value]) => (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="capitalize">{key}:</span>
                <span>{value}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <motion.div
                  className={`h-1.5 rounded-full ${
                    value >= 80 ? 'bg-green-500' :
                    value >= 60 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${value}%` }}
                  transition={{ 
                    duration: shouldReduceMotion ? 0 : 0.5, 
                    delay: shouldReduceMotion ? 0 : 0.1,
                    ease: 'easeOut' 
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ),
      backContent: (
        <div>
          <h4 className="font-semibold mb-2">Coverage Goals:</h4>
          <ul className="text-sm space-y-1">
            <li>• Lines: 80% minimum</li>
            <li>• Branches: 70% minimum</li>
            <li>• Functions: 80% minimum</li>
            <li>• Statements: 80% minimum</li>
          </ul>
        </div>
      )
    },
    {
      id: 'git',
      title: 'Git Status',
      icon: GitCommit,
      expandable: true,
      content: (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span>Branch:</span>
            <span className="font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              {metrics.git.branch}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Uncommitted:</span>
            <span className={`font-bold ${
              metrics.git.uncommittedChanges > 0 ? 'text-yellow-600' : 'text-green-600'
            }`}>
              {metrics.git.uncommittedChanges} files
            </span>
          </div>
          {metrics.git.lastCommit && (
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
              Last commit: {metrics.git.lastCommit}
            </div>
          )}
        </div>
      )
    },
    {
      id: 'handoffs',
      title: 'Recent Handoffs',
      icon: GitBranch,
      expandable: false,
      content: (
        <div>
          {state.handoffs?.length > 0 ? (
            <div className="space-y-2">
              {state.handoffs.slice(0, 3).map((handoff, index) => (
                <motion.div
                  key={index}
                  className="text-sm p-2 bg-gray-50 dark:bg-gray-700 rounded"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <div className="flex justify-between">
                    <span className="font-medium">{handoff.type}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(handoff.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No handoffs yet</p>
          )}
          <Link
            to="/handoffs"
            className={`flex items-center justify-center mt-3 ${
              isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
            } bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors`}
          >
            <ArrowRight className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} mr-1`} />
            View All
          </Link>
        </div>
      )
    },
    {
      id: 'prds',
      title: 'Active PRDs',
      icon: FileText,
      expandable: false,
      content: (
        <div>
          <div className="text-3xl font-bold mb-2">
            {state.prds?.length || 0}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {state.prds?.filter(p => p.metadata?.Status === 'Active').length || 0} Active
          </div>
          <Link
            to="/prds"
            className={`flex items-center justify-center mt-3 ${
              isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
            } bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors`}
          >
            <ArrowRight className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} mr-1`} />
            Manage PRDs
          </Link>
        </div>
      )
    }
  ];

  return (
    <div className={isCompact ? 'space-y-3' : 'space-y-6'}>
      {/* SD Assistant Modal */}
      <AnimatePresence>
        {showSDAssistant && (
          <SDAssistant
            existingDirectives={state.strategicDirectives}
            onClose={() => setShowSDAssistant(false)}
            isCompact={isCompact}
          />
        )}
      </AnimatePresence>
      
      {/* Header */}
      <motion.div 
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
      >
        <div className="flex items-center">
          <motion.div
            whileHover={{ rotate: shouldReduceMotion ? 0 : 360 }}
            transition={{ duration: 0.5 }}
          >
            <LayoutDashboard className={isCompact ? 'w-6 h-6 mr-2' : 'w-8 h-8 mr-3'} />
          </motion.div>
          <h1 className={isCompact ? 'text-2xl font-bold' : 'text-3xl font-bold text-gray-900 dark:text-white'}>
            Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => setShowSDAssistant(true)}
            className={`flex items-center ${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors`}
            whileHover={{ scale: shouldReduceMotion ? 1 : 1.05 }}
            whileTap={{ scale: shouldReduceMotion ? 1 : 0.95 }}
          >
            <Wand2 className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} mr-2`} />
            New Directive
          </motion.button>
          <motion.button
            onClick={onRefresh}
            className={`flex items-center ${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors`}
            whileHover={{ scale: shouldReduceMotion ? 1 : 1.05 }}
            whileTap={{ scale: shouldReduceMotion ? 1 : 0.95 }}
          >
            <motion.div
              animate={{ rotate: loading ? 360 : 0 }}
              transition={{ 
                duration: 1, 
                repeat: loading ? Infinity : 0,
                ease: 'linear'
              }}
            >
              <RefreshCw className={isCompact ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'} />
            </motion.div>
            Refresh
          </motion.button>
        </div>
      </motion.div>

      {/* Active Strategic Directive Progress */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
      >
        <ActiveSDProgress 
          strategicDirectives={state.strategicDirectives}
          currentSD={state.leoProtocol?.currentSD}
          onSetActiveSD={onSetActiveSD}
          isCompact={isCompact}
        />
      </motion.div>

      {/* Dashboard Cards Grid */}
      <CardGrid
        cards={dashboardCards}
        loading={loading}
        columns={3}
        gap={4}
        isCompact={isCompact}
        reorderable={!isCompact}
        onReorder={(newOrder) => console.log('Cards reordered:', newOrder)}
      />
    </div>
  );
}

export default AnimatedOverview;