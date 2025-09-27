import React, { useState, useEffect } from 'react';
import { Play, Pause, CheckCircle, XCircle, AlertCircle, Clock, GitBranch, Shield, Package } from 'lucide-react';

const PipelineMonitor = () => {
  const [pipelines, setPipelines] = useState([
    {
      id: 'pipe-001',
      name: 'Main Branch Build',
      branch: 'main',
      status: 'success',
      duration: 245,
      stages: [
        { name: 'Build', status: 'success', duration: 45 },
        { name: 'Test', status: 'success', duration: 120 },
        { name: 'Security', status: 'success', duration: 30 },
        { name: 'Deploy', status: 'success', duration: 50 }
      ],
      timestamp: '2025-01-27T10:30:00Z',
      commit: 'feat(SD-PIPELINE-001): Add security scanning',
      author: 'CI Bot'
    },
    {
      id: 'pipe-002',
      name: 'Feature Branch Build',
      branch: 'feature/pipeline-gates',
      status: 'running',
      duration: 180,
      stages: [
        { name: 'Build', status: 'success', duration: 45 },
        { name: 'Test', status: 'running', duration: 135 },
        { name: 'Security', status: 'pending', duration: 0 },
        { name: 'Deploy', status: 'pending', duration: 0 }
      ],
      timestamp: '2025-01-27T10:45:00Z',
      commit: 'test: Add pipeline gate tests',
      author: 'Developer'
    },
    {
      id: 'pipe-003',
      name: 'Production Deployment',
      branch: 'main',
      status: 'failed',
      duration: 95,
      stages: [
        { name: 'Build', status: 'success', duration: 40 },
        { name: 'Test', status: 'success', duration: 50 },
        { name: 'Security', status: 'failed', duration: 5 },
        { name: 'Deploy', status: 'skipped', duration: 0 }
      ],
      timestamp: '2025-01-27T10:15:00Z',
      commit: 'fix: Resolve security vulnerabilities',
      author: 'Security Bot'
    }
  ]);

  const [metrics, setMetrics] = useState({
    successRate: 87,
    avgBuildTime: 190,
    deploymentsToday: 12,
    activeBuilds: 2,
    queuedBuilds: 3,
    failureRate: 13
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'running':
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-gray-400" />;
      case 'skipped':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'running':
        return 'bg-blue-100 text-blue-800 animate-pulse';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      case 'skipped':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center">
          <GitBranch className="h-6 w-6 mr-2 text-blue-600" />
          CI/CD Pipeline Monitor
        </h2>
        <p className="text-gray-600">Real-time pipeline execution and monitoring</p>
        <div className="mt-2">
          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            SD-PIPELINE-001
          </span>
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="grid grid-cols-6 gap-4 mb-6">
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{metrics.successRate}%</div>
          <div className="text-xs text-gray-600">Success Rate</div>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{formatDuration(metrics.avgBuildTime)}</div>
          <div className="text-xs text-gray-600">Avg Build Time</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{metrics.deploymentsToday}</div>
          <div className="text-xs text-gray-600">Deployments Today</div>
        </div>
        <div className="bg-indigo-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-indigo-600">{metrics.activeBuilds}</div>
          <div className="text-xs text-gray-600">Active Builds</div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-orange-600">{metrics.queuedBuilds}</div>
          <div className="text-xs text-gray-600">Queued</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{metrics.failureRate}%</div>
          <div className="text-xs text-gray-600">Failure Rate</div>
        </div>
      </div>

      {/* Pipeline List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold mb-3">Recent Pipeline Executions</h3>

        {pipelines.map(pipeline => (
          <div key={pipeline.id} className="border rounded-lg p-4 hover:bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                {getStatusIcon(pipeline.status)}
                <div className="ml-3">
                  <h4 className="font-semibold">{pipeline.name}</h4>
                  <p className="text-sm text-gray-500">
                    <GitBranch className="inline h-3 w-3 mr-1" />
                    {pipeline.branch} • {pipeline.commit}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(pipeline.status)}`}>
                  {pipeline.status}
                </span>
                <p className="text-xs text-gray-500 mt-1">
                  {formatDuration(pipeline.duration)} • by {pipeline.author}
                </p>
              </div>
            </div>

            {/* Pipeline Stages */}
            <div className="flex items-center space-x-2">
              {pipeline.stages.map((stage, index) => (
                <React.Fragment key={stage.name}>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{stage.name}</span>
                      <span className="text-xs text-gray-500">
                        {stage.duration > 0 ? formatDuration(stage.duration) : '-'}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          stage.status === 'success' ? 'bg-green-500' :
                          stage.status === 'running' ? 'bg-blue-500 animate-pulse' :
                          stage.status === 'failed' ? 'bg-red-500' :
                          stage.status === 'skipped' ? 'bg-yellow-500' :
                          'bg-gray-300'
                        }`}
                        style={{
                          width: stage.status === 'pending' ? '0%' : '100%'
                        }}
                      />
                    </div>
                  </div>
                  {index < pipeline.stages.length - 1 && (
                    <div className="text-gray-400">→</div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Action Buttons */}
            {pipeline.status === 'failed' && (
              <div className="mt-3 flex gap-2">
                <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                  <Play className="inline h-3 w-3 mr-1" />
                  Retry Pipeline
                </button>
                <button className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50">
                  View Logs
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="mt-6 flex justify-between items-center pt-4 border-t">
        <div className="text-sm text-gray-500">
          Auto-refresh in 30s
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center">
            <Play className="h-4 w-4 mr-2" />
            Trigger Build
          </button>
          <button className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">
            View All Pipelines
          </button>
        </div>
      </div>
    </div>
  );
};

export default PipelineMonitor;