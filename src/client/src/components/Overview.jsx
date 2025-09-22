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
  Wand2
} from 'lucide-react';
import SDAssistant from './SDAssistant';
import ActiveSDProgress from './ActiveSDProgress';
import SmartRefreshButton from './SmartRefreshButton';

function Overview({ state, onRefresh, onSetActiveSD, isCompact }) {
  const [showSDAssistant, setShowSDAssistant] = useState(false);
  const [metrics, setMetrics] = useState({
    tests: { total: 0, passed: 0, failed: 0 },
    coverage: { lines: 0, branches: 0, functions: 0, statements: 0 },
    git: { branch: 'unknown', uncommittedChanges: 0, lastCommit: '' }
  });

  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => setMetrics(data))
      .catch(error => console.error('Error loading metrics:', error));
  }, []);

  const contextPercentage = Math.round((state.context.usage / state.context.total) * 100);
  const contextStatus = contextPercentage > 90 ? 'critical' : contextPercentage > 70 ? 'warning' : 'healthy';
  
  const cardClass = isCompact 
    ? 'bg-white dark:bg-gray-800 rounded-lg shadow p-3' 
    : 'bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6';
  
  const headerClass = isCompact 
    ? 'text-lg font-semibold mb-2' 
    : 'text-xl font-semibold mb-4';


  return (
    <div className={isCompact ? 'space-y-3' : 'space-y-6'}>
      {/* SD Assistant Modal */}
      {showSDAssistant && (
        <SDAssistant
          existingDirectives={state.strategicDirectives}
          onClose={() => setShowSDAssistant(false)}
          isCompact={isCompact}
        />
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <LayoutDashboard className={isCompact ? 'w-6 h-6 mr-2' : 'w-8 h-8 mr-3'} />
          <h1 className={isCompact ? 'text-2xl font-bold' : 'text-3xl font-bold text-gray-900 dark:text-white'}>
            Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSDAssistant(true)}
            className={`flex items-center ${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors`}
          >
            <Wand2 className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} mr-2`} />
            New Directive
          </button>
          <SmartRefreshButton 
            onRefresh={onRefresh} 
            isCompact={isCompact} 
          />
        </div>
      </div>

      {/* Active Strategic Directive Progress */}
      <ActiveSDProgress 
        strategicDirectives={state.strategicDirectives}
        currentSD={state.leoProtocol?.currentSD}
        onSetActiveSD={onSetActiveSD}
        isCompact={isCompact}
      />

      {/* Recent Handoffs */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={`${headerClass} mb-0`}>Recent Handoffs</h2>
          <Link
            to="/handoffs"
            className={`flex items-center ${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors`}
          >
            <ArrowRight className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} mr-1`} />
            View All
          </Link>
        </div>
        <div className={`space-y-${isCompact ? '2' : '3'}`}>
          {state.handoffs.slice(0, 3).map((handoff, index) => (
            <div key={index} className={`flex items-center justify-between ${isCompact ? 'py-2' : 'py-3'} border-b border-gray-200 dark:border-gray-700 last:border-0`}>
              <div className="flex items-center">
                {handoff.status === 'approved' ? (
                  <CheckCircle className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} text-green-500 mr-2`} />
                ) : handoff.status === 'exception' ? (
                  <AlertTriangle className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} text-yellow-500 mr-2`} />
                ) : (
                  <XCircle className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} text-red-500 mr-2`} />
                )}
                <div>
                  <p className={`${isCompact ? 'text-sm' : 'text-base'} font-medium`}>{handoff.type}</p>
                  <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500`}>
                    {new Date(handoff.timestamp).toLocaleDateString()}
                    {handoff.completionRate && ` • ${handoff.completionRate}`}
                  </p>
                </div>
              </div>
              <span className={`${isCompact ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1'} ${
                handoff.status === 'approved' 
                  ? 'bg-green-100 text-green-800' 
                  : handoff.status === 'exception'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              } rounded-full`}>
                {handoff.status}
              </span>
            </div>
          ))}
          {state.handoffs.length === 0 && (
            <p className={`${isCompact ? 'text-sm' : 'text-base'} text-gray-500 dark:text-gray-400`}>
              No handoffs yet
            </p>
          )}
        </div>
      </div>

      {/* Status Cards Grid */}
      <div className={`grid gap-${isCompact ? '3' : '4'} grid-cols-1 md:grid-cols-2 lg:grid-cols-4`}>
        {/* LEO Status */}
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <div>
              <p className={isCompact ? 'text-xs text-gray-600 dark:text-gray-400' : 'text-sm text-gray-600 dark:text-gray-400'}>
                Active Role
              </p>
              <p className={isCompact ? 'text-xl font-bold' : 'text-2xl font-bold'}>
                {state.leoProtocol.activeRole || 'Awaiting SD'}
              </p>
              <div className="flex items-center gap-2">
                <p className={isCompact ? 'text-xs' : 'text-sm'} style={{ color: '#4f9cf9' }}>
                  LEO v{state.leoProtocol.version}
                </p>
                {state.leoProtocol.lastHandoff && (
                  <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500`}>
                    • {new Date(state.leoProtocol.lastHandoff.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
            <Users className={`${isCompact ? 'w-8 h-8' : 'w-10 h-10'} ${
              state.leoProtocol.activeRole === 'LEAD' ? 'text-blue-500' :
              state.leoProtocol.activeRole === 'PLAN' ? 'text-purple-500' :
              state.leoProtocol.activeRole === 'EXEC' ? 'text-green-500' :
              'text-gray-400'
            }`} />
          </div>
        </div>

        {/* Git Status */}
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <div>
              <p className={isCompact ? 'text-xs text-gray-600 dark:text-gray-400' : 'text-sm text-gray-600 dark:text-gray-400'}>
                Git Branch
              </p>
              <p className={isCompact ? 'text-xl font-bold' : 'text-2xl font-bold'}>
                {metrics.git.branch}
              </p>
              <p className={isCompact ? 'text-xs' : 'text-sm'} style={{ color: metrics.git.uncommittedChanges > 0 ? '#ef4444' : '#10b981' }}>
                {metrics.git.uncommittedChanges} changes
              </p>
            </div>
            <GitBranch className={`${isCompact ? 'w-8 h-8' : 'w-10 h-10'} text-green-500`} />
          </div>
        </div>

        {/* Strategic Directives */}
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className={isCompact ? 'text-xs text-gray-600 dark:text-gray-400' : 'text-sm text-gray-600 dark:text-gray-400'}>
                Strategic Directives
              </p>
              <p className={isCompact ? 'text-xl font-bold' : 'text-2xl font-bold'}>
                {state.strategicDirectives.length}
              </p>
              <p className={isCompact ? 'text-xs' : 'text-sm'} style={{ color: '#4f9cf9' }}>
                Active SDs
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <FileText className={`${isCompact ? 'w-8 h-8' : 'w-10 h-10'} text-blue-500`} />
              <Link
                to="/strategic-directives"
                className={`flex items-center ${isCompact ? 'px-2 py-1 text-xs' : 'px-2 py-1 text-xs'} bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors`}
              >
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Context Usage */}
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className={isCompact ? 'text-xs text-gray-600 dark:text-gray-400' : 'text-sm text-gray-600 dark:text-gray-400'}>
                Context Usage
              </p>
              <p className={isCompact ? 'text-xl font-bold' : 'text-2xl font-bold'}>
                {contextPercentage}%
              </p>
              <p className={isCompact ? 'text-xs' : 'text-sm'} style={{ 
                color: contextStatus === 'critical' ? '#ef4444' : contextStatus === 'warning' ? '#f59e0b' : '#10b981' 
              }}>
                {contextStatus}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Database className={`${isCompact ? 'w-8 h-8' : 'w-10 h-10'} ${
                contextStatus === 'critical' ? 'text-red-500' : 
                contextStatus === 'warning' ? 'text-yellow-500' : 
                'text-teal-500'
              }`} />
              <Link
                to="/context"
                className={`flex items-center ${isCompact ? 'px-2 py-1 text-xs' : 'px-2 py-1 text-xs'} ${
                  contextStatus === 'critical' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 
                  contextStatus === 'warning' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 
                  'bg-teal-100 text-teal-700 hover:bg-teal-200'
                } rounded transition-colors`}
              >
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

export default Overview;