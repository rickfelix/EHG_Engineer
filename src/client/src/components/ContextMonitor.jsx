import React from 'react';
import { Gauge, AlertTriangle, Archive, TrendingUp, Database } from 'lucide-react';

function ContextMonitor({ context, onCompact }) {
  const percentage = Math.round((context.usage / context.total) * 100);
  const status = percentage > 90 ? 'critical' : percentage > 70 ? 'warning' : 'healthy';
  
  const getStatusColor = () => {
    if (status === 'critical') return 'text-red-600 bg-red-100';
    if (status === 'warning') return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  const getProgressColor = () => {
    if (status === 'critical') return 'bg-red-500';
    if (status === 'warning') return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        Context Monitor
      </h1>

      {/* Main Status Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Token Usage</h2>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor()}`}>
            {status.toUpperCase()}
          </span>
        </div>

        {/* Large Gauge Display */}
        <div className="flex items-center justify-center mb-6">
          <div className="relative w-48 h-48">
            <svg className="w-48 h-48 transform -rotate-90">
              <circle
                cx="96"
                cy="96"
                r="88"
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                className="text-gray-200"
              />
              <circle
                cx="96"
                cy="96"
                r="88"
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${percentage * 5.53} 553`}
                className={getProgressColor()}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold">{percentage}%</span>
              <span className="text-sm text-gray-500">Used</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded">
            <p className="text-sm text-gray-600 dark:text-gray-400">Tokens Used</p>
            <p className="text-2xl font-bold">{context.usage.toLocaleString()}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded">
            <p className="text-sm text-gray-600 dark:text-gray-400">Remaining</p>
            <p className="text-2xl font-bold">{(context.total - context.usage).toLocaleString()}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCompact}
            className="flex-1 py-3 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors flex items-center justify-center"
          >
            <Archive className="w-5 h-5 mr-2" />
            Compact Context
          </button>
        </div>

        {/* Warnings */}
        {status !== 'healthy' && (
          <div className={`mt-4 p-4 rounded ${
            status === 'critical' ? 'bg-red-50 dark:bg-red-900' : 'bg-yellow-50 dark:bg-yellow-900'
          }`}>
            <div className="flex items-start">
              <AlertTriangle className={`w-5 h-5 mr-2 ${
                status === 'critical' ? 'text-red-600' : 'text-yellow-600'
              }`} />
              <div>
                <p className="font-semibold">
                  {status === 'critical' ? 'Critical Context Usage!' : 'Context Usage Warning'}
                </p>
                <p className="text-sm mt-1">
                  {status === 'critical' 
                    ? 'Immediate action required. Run /compact or archive completed work to files.'
                    : 'Consider running /compact soon to free up context space.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Token Breakdown */}
      {context.breakdown && Object.keys(context.breakdown).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Database className="w-5 h-5 mr-2" />
            Token Breakdown
          </h2>
          <div className="space-y-3">
            {Object.entries(context.breakdown).map(([category, tokens]) => {
              const categoryPercentage = Math.round((tokens / context.total) * 100);
              return (
                <div key={category}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm capitalize">{category.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="text-sm font-semibold">
                      {tokens.toLocaleString()} ({categoryPercentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full"
                      style={{ width: `${categoryPercentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2" />
          Optimization Tips
        </h2>
        <ul className="space-y-2">
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            <span>Archive completed Strategic Directives to external files</span>
          </li>
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            <span>Use file references instead of embedding large code blocks</span>
          </li>
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            <span>Summarize verbose discussions before handoffs</span>
          </li>
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            <span>Run /compact with focus parameter for targeted compression</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default ContextMonitor;