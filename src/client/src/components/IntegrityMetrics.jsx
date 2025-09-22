import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, TrendingDown, TrendingUp, CheckCircle2, AlertCircle } from 'lucide-react';

function IntegrityMetrics({ metrics, source = 'all' }) {
  const [latestMetrics, setLatestMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Filter metrics by source if specified
    if (metrics) {
      const filtered = source === 'all' 
        ? metrics 
        : metrics.filter(m => m.source === source);
      
      // Get the most recent metrics
      const latest = filtered.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      )[0];
      
      setLatestMetrics(latest);
      setLoading(false);
    }
  }, [metrics, source]);

  if (loading || !latestMetrics) {
    return (
      <div className="card animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-surface-light rounded"></div>
          <div className="h-6 bg-surface-light rounded w-32"></div>
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-surface-light rounded"></div>
          <div className="h-4 bg-surface-light rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  const getDeltaIcon = (delta) => {
    if (delta < 0) return <TrendingDown className="w-4 h-4 text-success" />;
    if (delta > 0) return <TrendingUp className="w-4 h-4 text-warning" />;
    return <Activity className="w-4 h-4 text-text-secondary" />;
  };

  const getDeltaColor = (delta) => {
    if (delta < 0) return 'text-success';
    if (delta > 0) return 'text-warning';
    return 'text-text-secondary';
  };

  const getStatusIcon = () => {
    if (latestMetrics.total_gaps === 0) {
      return <CheckCircle2 className="w-5 h-5 text-success" />;
    }
    if (latestMetrics.total_gaps > 50) {
      return <AlertTriangle className="w-5 h-5 text-danger" />;
    }
    return <AlertCircle className="w-5 h-5 text-warning" />;
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const hours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const gapCategories = [
    { key: 'sd_metadata_gaps', label: 'SD Metadata', icon: '📋' },
    { key: 'prd_contract_gaps', label: 'PRD Contract', icon: '📝' },
    { key: 'backlog_shape_issues', label: 'Backlog Shape', icon: '🎯' },
    { key: 'orphan_items', label: 'Orphans', icon: '🔗' },
    { key: 'dependency_issues', label: 'Dependencies', icon: '🔄' },
    { key: 'stage_coverage_gaps', label: 'Stage Coverage', icon: '📊' },
    { key: 'ventures_without_governance', label: 'Ungovern Ventures', icon: '⚠️' },
  ];

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="text-lg font-medium">
              Integrity Status
              {source !== 'all' && (
                <span className="ml-2 text-sm text-text-secondary">
                  ({source})
                </span>
              )}
            </h3>
            <p className="text-sm text-text-secondary">
              {formatTime(latestMetrics.created_at)}
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-primary hover:underline"
        >
          {expanded ? 'Less' : 'More'}
        </button>
      </div>

      {/* Summary */}
      <div className="bg-surface-light rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold">
              {latestMetrics.total_gaps}
              <span className="text-sm text-text-secondary ml-2">total gaps</span>
            </p>
          </div>
          {latestMetrics.gap_delta !== null && latestMetrics.gap_delta !== undefined && (
            <div className={`flex items-center gap-2 ${getDeltaColor(latestMetrics.gap_delta)}`}>
              {getDeltaIcon(latestMetrics.gap_delta)}
              <span className="font-medium">
                {latestMetrics.gap_delta > 0 ? '+' : ''}{latestMetrics.gap_delta}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Categories (shown when expanded) */}
      {expanded && (
        <div className="space-y-2 mb-4">
          {gapCategories.map(cat => {
            const value = latestMetrics[cat.key];
            if (value === null || value === undefined || value === 0) return null;
            
            return (
              <div key={cat.key} className="flex items-center justify-between py-2 border-b border-surface-light">
                <div className="flex items-center gap-2">
                  <span>{cat.icon}</span>
                  <span className="text-sm">{cat.label}</span>
                </div>
                <span className="text-sm font-medium">{value}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Top Recommendations */}
      {latestMetrics.top_recommendations && latestMetrics.top_recommendations.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">Top Recommendations</h4>
          <div className="space-y-1">
            {latestMetrics.top_recommendations.slice(0, 3).map((rec, idx) => (
              <div key={idx} className="text-xs bg-surface-light rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    rec.urgency === 'high' ? 'bg-danger/20 text-danger' :
                    rec.urgency === 'medium' ? 'bg-warning/20 text-warning' :
                    'bg-surface text-text-secondary'
                  }`}>
                    {rec.urgency}
                  </span>
                  <span className="text-text-secondary">{rec.type}</span>
                </div>
                <p className="text-text-primary truncate">{rec.title}</p>
                {rec.venture && (
                  <p className="text-text-secondary mt-1">For: {rec.venture}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflow Info */}
      {latestMetrics.workflow_run_id && (
        <div className="mt-4 pt-4 border-t border-surface-light">
          <a 
            href={`https://github.com/${process.env.REACT_APP_GITHUB_REPO || 'rickfelix/EHG_Engineer'}/actions/runs/${latestMetrics.workflow_run_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            View Workflow Run →
          </a>
        </div>
      )}
    </div>
  );
}

export default IntegrityMetrics;