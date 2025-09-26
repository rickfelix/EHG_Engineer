import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Progress Mismatch Alert Component
 * Shows when database status and calculated progress don't align
 * Provides options to auto-remediate or manually override
 */
export function ProgressMismatchAlert({ sd, onRemediate, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  const [remediating, setRemediating] = useState(false);

  if (!sd.reconciliation_status || sd.reconciliation_status === 'synchronized') {
    return null;
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'border-red-500 bg-red-50';
      case 'medium': return 'border-yellow-500 bg-yellow-50';
      case 'low': return 'border-blue-500 bg-blue-50';
      default: return 'border-gray-500 bg-gray-50';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'medium': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'low': return <CheckCircle className="w-5 h-5 text-blue-500" />;
      default: return <AlertTriangle className="w-5 h-5 text-gray-500" />;
    }
  };

  const handleRemediate = async () => {
    setRemediating(true);
    try {
      await onRemediate(sd.id);
    } finally {
      setRemediating(false);
    }
  };

  const report = sd.reconciliation_report || {};
  const severity = report.severity || 'medium';

  return (
    <div className={`border-l-4 p-4 mb-4 ${getSeverityColor(severity)} rounded-r-lg`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {getSeverityIcon(severity)}
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-gray-800">
            Progress Mismatch Detected
          </h3>
          <div className="mt-2 text-sm text-gray-600">
            <p>
              Database shows <strong>{sd.status}</strong> ({sd.progress || 0}%)
              but calculated progress is <strong>{report.calculated_progress || 0}%</strong>
            </p>
            {report.type === 'incomplete_marked_complete' && (
              <p className="mt-1 text-red-600">
                ⚠️ Quality gates may have been bypassed
              </p>
            )}
          </div>

          {/* Expandable Details */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center text-sm text-blue-600 hover:text-blue-800"
          >
            {expanded ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
            {expanded ? 'Hide Details' : 'Show Details'}
          </button>

          {expanded && report.missing_items && (
            <div className="mt-3 bg-white p-3 rounded border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Missing Items:</h4>
              <ul className="space-y-2">
                {report.missing_items.map((item, idx) => (
                  <li key={idx} className="text-sm">
                    <span className="font-medium">{item.phase}:</span>
                    <span className="ml-2 text-gray-600">{item.reason}</span>
                    {item.percentage !== undefined && (
                      <span className="ml-2 text-gray-500">({item.percentage}% complete)</span>
                    )}
                    {item.critical && (
                      <span className="ml-2 text-red-600 font-medium">CRITICAL</span>
                    )}
                    {item.action_required && (
                      <div className="mt-1 ml-4 text-xs text-gray-500">
                        Action: {item.action_required}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-4 flex space-x-3">
            {sd.reconciliation_status === 'mismatch_detected' && (
              <>
                <button
                  onClick={handleRemediate}
                  disabled={remediating}
                  className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {remediating ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                      Remediating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Auto-Remediate
                    </>
                  )}
                </button>
                <button
                  onClick={() => onDismiss(sd.id)}
                  className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Dismiss
                </button>
              </>
            )}

            {sd.reconciliation_status === 'remediation_in_progress' && (
              <div className="text-sm text-blue-600">
                <RefreshCw className="w-4 h-4 inline mr-1 animate-spin" />
                Remediation in progress...
              </div>
            )}

            {sd.reconciliation_status === 'resolved' && (
              <div className="text-sm text-green-600">
                <CheckCircle className="w-4 h-4 inline mr-1" />
                Resolved
                {report.manual_override && (
                  <span className="ml-2 text-gray-500">
                    (Manual Override: {report.justification})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProgressMismatchAlert;