/**
 * ChairmanApprovalPanel Component
 * Review and approve/reject AI-generated blueprints
 *
 * SD: AI-Generated Venture Idea Discovery
 * Auto-approval: ≥85% approved, 70-84% pending Chairman review
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

interface PendingBlueprint {
  id: string;
  title: string;
  summary: string;
  problem: string;
  solution: string;
  target_market: string;
  opportunity_box: 'green' | 'yellow' | 'red';
  confidence_score: number;
  gap_analysis: {
    primary_dimension?: string;
    impact?: string;
    evidence?: string;
  };
  ai_metadata: {
    generated_at?: string;
    source_opportunity?: {
      title?: string;
      dimension?: string;
    };
  };
  differentiation?: string;
}

interface ChairmanApprovalPanelProps {
  onApprovalComplete?: () => void;
}

const getBoxConfig = (box: string) => {
  switch (box) {
    case 'green':
      return {
        label: 'Quick Win',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        textColor: 'text-green-700 dark:text-green-300',
        borderColor: 'border-green-500',
      };
    case 'yellow':
      return {
        label: 'Strategic',
        bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
        textColor: 'text-yellow-700 dark:text-yellow-300',
        borderColor: 'border-yellow-500',
      };
    case 'red':
      return {
        label: 'Defensive',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        textColor: 'text-red-700 dark:text-red-300',
        borderColor: 'border-red-500',
      };
    default:
      return {
        label: 'Unknown',
        bgColor: 'bg-gray-100 dark:bg-gray-700',
        textColor: 'text-gray-700 dark:text-gray-300',
        borderColor: 'border-gray-500',
      };
  }
};

const ChairmanApprovalPanel: React.FC<ChairmanApprovalPanelProps> = ({
  onApprovalComplete,
}) => {
  const [blueprints, setBlueprints] = useState<PendingBlueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPendingBlueprints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/blueprints?source=ai_generated&status=pending');
      if (!res.ok) throw new Error('Failed to fetch pending blueprints');
      const data = await res.json();
      setBlueprints(data.blueprints || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingBlueprints();
  }, [fetchPendingBlueprints]);

  const handleDecision = async (
    blueprintId: string,
    decision: 'approved' | 'rejected'
  ) => {
    setProcessingId(blueprintId);
    try {
      const res = await fetch('/api/discovery/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprint_id: blueprintId,
          decision,
          feedback: feedbackText[blueprintId] || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Decision failed');
      }

      // Remove from list
      setBlueprints((prev) => prev.filter((bp) => bp.id !== blueprintId));
      setFeedbackText((prev) => {
        const next = { ...prev };
        delete next[blueprintId];
        return next;
      });

      onApprovalComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      setProcessingId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
          <span className="text-gray-600 dark:text-gray-400">
            Loading pending reviews...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Pending Chairman Review
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                AI-generated blueprints awaiting approval (70-84% confidence)
              </p>
            </div>
          </div>
          <button
            onClick={fetchPendingBlueprints}
            disabled={loading}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100
              dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="m-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {blueprints.length === 0 && !error && (
        <div className="p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
            All Caught Up!
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No AI-generated blueprints pending review
          </p>
        </div>
      )}

      {/* Blueprints List */}
      {blueprints.length > 0 && (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {blueprints.map((blueprint) => {
            const boxConfig = getBoxConfig(blueprint.opportunity_box);
            const isExpanded = expandedId === blueprint.id;
            const isProcessing = processingId === blueprint.id;

            return (
              <div key={blueprint.id} className="p-4">
                {/* Card Header */}
                <div className="flex items-start gap-4">
                  {/* Box Indicator */}
                  <div
                    className={`w-1 h-16 rounded-full flex-shrink-0 ${boxConfig.borderColor.replace('border', 'bg')}`}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {blueprint.title}
                        </h3>
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30">
                          <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                          <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            {blueprint.confidence_score}%
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${boxConfig.bgColor} ${boxConfig.textColor}`}
                        >
                          {boxConfig.label}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleExpand(blueprint.id)}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </button>
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {blueprint.summary}
                    </p>

                    {/* Gap Evidence */}
                    {blueprint.gap_analysis?.evidence && (
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                        <span className="font-medium">Evidence:</span>{' '}
                        {blueprint.gap_analysis.evidence}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-4 ml-5 pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-3">
                    {blueprint.problem && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                          Problem
                        </h4>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {blueprint.problem}
                        </p>
                      </div>
                    )}
                    {blueprint.solution && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                          Solution
                        </h4>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {blueprint.solution}
                        </p>
                      </div>
                    )}
                    {blueprint.target_market && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                          Target Market
                        </h4>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {blueprint.target_market}
                        </p>
                      </div>
                    )}
                    {blueprint.differentiation && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                          Differentiation
                        </h4>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {blueprint.differentiation}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Feedback Input */}
                <div className="mt-4 ml-5">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Optional feedback
                    </span>
                  </div>
                  <textarea
                    value={feedbackText[blueprint.id] || ''}
                    onChange={(e) =>
                      setFeedbackText((prev) => ({
                        ...prev,
                        [blueprint.id]: e.target.value,
                      }))
                    }
                    placeholder="Add notes for your decision..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600
                      bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100
                      placeholder-gray-400 dark:placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                      resize-none"
                    disabled={isProcessing}
                  />
                </div>

                {/* Action Buttons */}
                <div className="mt-3 ml-5 flex items-center gap-3">
                  <button
                    onClick={() => handleDecision(blueprint.id, 'approved')}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white
                      bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                      transition-colors text-sm"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Approve
                  </button>
                  <button
                    onClick={() => handleDecision(blueprint.id, 'rejected')}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium
                      text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700
                      hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors text-sm"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer with count */}
      {blueprints.length > 0 && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            {blueprints.length} blueprint{blueprints.length !== 1 ? 's' : ''} pending review
          </p>
        </div>
      )}
    </div>
  );
};

export default ChairmanApprovalPanel;
