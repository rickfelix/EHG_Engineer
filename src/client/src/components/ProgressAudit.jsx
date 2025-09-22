import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, 
  Square, 
  AlertTriangle, 
  CheckCircle,
  XCircle,
  FileText,
  Calculator,
  TrendingUp,
  ClipboardCheck,
  X
} from 'lucide-react';

function ProgressAudit({ sdId, onClose }) {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAudit();
  }, [sdId]);

  const fetchAudit = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/progress/audit/${sdId || ''}`);
      if (!response.ok) throw new Error('Failed to fetch audit');
      const data = await response.json();
      setAudit(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <p className="text-red-500">Error: {error}</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-500 text-white rounded">
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!audit) return null;

  const getPhaseColor = (phase) => {
    if (phase.complete) return 'text-green-500';
    if (phase.progress > 0) return 'text-yellow-500';
    return 'text-gray-400';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center">
            <ClipboardCheck className="w-6 h-6 mr-2 text-blue-500" />
            <h2 className="text-xl font-semibold">Progress Validation Audit</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">{audit.title}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Calculated Progress</p>
                <p className="text-2xl font-bold">{audit.summary.calculatedProgress}%</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Current Phase</p>
                <p className="text-2xl font-bold">{audit.summary.currentPhase}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Database Status</p>
                <p className="text-2xl font-bold">{audit.summary.databaseStatus}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Can Complete</p>
                <div className="text-2xl font-bold">
                  {audit.summary.canComplete ? (
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  ) : (
                    <XCircle className="w-8 h-8 text-red-500" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Phase Breakdown */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Phase Breakdown
            </h3>
            <div className="space-y-4">
              {Object.entries(audit.phaseBreakdown).map(([phase, data]) => (
                <div key={phase} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <span className={`text-lg font-semibold ${getPhaseColor(data)}`}>
                        {phase} Agent
                      </span>
                      <span className="ml-2 text-sm text-gray-500">
                        (Weight: {data.weight}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold">{data.progress}%</span>
                      {data.complete && <CheckCircle className="w-5 h-5 text-green-500" />}
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3">
                    <div 
                      className={`h-2 rounded-full ${
                        data.complete ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${data.progress}%` }}
                    />
                  </div>

                  {/* Checklist items */}
                  {data.checklist && data.checklist.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium mb-2">Checklist Items:</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {data.checklist.map((item, idx) => (
                          <div key={idx} className="flex items-start text-sm">
                            {item.checked ? (
                              <CheckSquare className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                            )}
                            <span className={item.checked ? 'text-gray-600 line-through' : ''}>
                              {item.text}
                              {item.source && (
                                <span className="ml-2 text-xs text-gray-500">({item.source})</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* EXEC Indicators */}
                  {phase === 'EXEC' && data.indicators && (
                    <div className="mt-3">
                      <p className="text-sm font-medium mb-2">Implementation Indicators:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(data.indicators.indicators).map(([key, ind]) => (
                          <div key={key} className="flex items-center text-sm">
                            {ind.status ? (
                              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500 mr-2" />
                            )}
                            <span>{key}: {ind.details || 'Not found'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Calculation Breakdown */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              <Calculator className="w-5 h-5 mr-2" />
              Progress Calculation
            </h3>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              {/* Add clarification about PLAN phase calculation issue */}
              {audit.phaseBreakdown?.PLAN?.checklist && 
               audit.phaseBreakdown.PLAN.checklist.filter(i => 
                 i.text.includes('PRD created and saved') || 
                 i.text.includes('requirements mapped') ||
                 i.text.includes('specifications complete') ||
                 i.text.includes('Prerequisites verified') ||
                 i.text.includes('Risk mitigation') ||
                 i.text.includes('Context usage')).every(i => i.checked) && (
                <div className="mb-4 p-3 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded">
                  <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                    ⚠️ Progress Calculation Note:
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    The PLAN phase handoff checklist is complete (PRD created with all handoff items done), 
                    but the system is incorrectly counting implementation acceptance criteria as PLAN phase items. 
                    According to LEO Protocol v4.0, PLAN phase should be 100% complete when the PRD is created 
                    with the handoff checklist done. The actual progress should be approximately 66% (LEAD + PLAN complete).
                  </p>
                </div>
              )}
              <p className="font-mono text-sm mb-2">{audit.calculations.formula}</p>
              <div className="space-y-1">
                {audit.calculations.breakdown.map((line, idx) => (
                  <p key={idx} className={`font-mono text-sm ${
                    line.startsWith('Total') ? 'font-bold text-blue-600 dark:text-blue-400' : ''
                  }`}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* Validation Status */}
          {audit.validation.uncompletedItems > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-yellow-500" />
                Validation Issues
              </h3>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="font-semibold mb-2">
                  {audit.validation.uncompletedItems} uncompleted items preventing completion:
                </p>
                {audit.validation.details.map((group, idx) => (
                  <div key={idx} className="mb-2">
                    <p className="font-medium text-sm">
                      {group.source} ({group.phase}): {group.items.length} items
                    </p>
                    <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 ml-4">
                      {group.items.map((item, itemIdx) => (
                        <li key={itemIdx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {audit.recommendations.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Recommendations
              </h3>
              <div className="space-y-2">
                {audit.recommendations.map((rec, idx) => (
                  <div key={idx} className={`flex items-start p-3 rounded-lg ${
                    rec.includes('WARNING') 
                      ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
                      : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                  }`}>
                    {rec.includes('WARNING') ? (
                      <AlertTriangle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm">{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Generated: {new Date(audit.timestamp).toLocaleString()}
          </p>
          <div className="flex gap-2">
            <button
              onClick={fetchAudit}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProgressAudit;