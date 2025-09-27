import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, User, Shield, AlertCircle } from 'lucide-react';

/**
 * LEAD Agent Approval Dialog Component
 * Prevents autonomous SD status/priority changes
 * Requires explicit human confirmation for all LEAD decisions
 */
function LEADApprovalDialog({ approvalRequest, onApprove, onReject, onClose }) {
  const [selectedOption, setSelectedOption] = useState(null);
  const [manualScores, setManualScores] = useState({});
  const [customChanges, setCustomChanges] = useState({});
  const [rejectReason, setRejectReason] = useState('');

  if (!approvalRequest) return null;

  const handleApprove = () => {
    const response = {
      action: selectedOption?.action || 'APPROVE_RECOMMENDATION',
      evaluation: approvalRequest.evaluation,
      manualScores: selectedOption?.action === 'MODIFY_SCORES' ? manualScores : null,
      changes: selectedOption?.action === 'MANUAL_DECISION' ? customChanges : null,
      reason: `Human approved: ${selectedOption?.description || 'LEAD recommendation'}`
    };
    onApprove(response);
  };

  const handleReject = () => {
    onReject({
      action: 'REJECT',
      reason: rejectReason || 'Human rejected LEAD recommendation'
    });
  };

  const getWarningIcon = (type) => {
    switch (type) {
      case 'USER_SELECTION_OVERRIDE':
        return <User className="w-4 h-4 text-orange-600" />;
      case 'HIGH_PRIORITY_OVER_ENGINEERED':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getScoreColor = (score) => {
    if (score <= 2) return 'text-red-600 bg-red-50';
    if (score <= 3) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="bg-blue-600 text-white p-6 rounded-t-lg">
          <div className="flex items-center space-x-3">
            <Shield className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">LEAD Agent Approval Required</h2>
              <p className="text-blue-100">Review and approve proposed changes to Strategic Directive</p>
            </div>
          </div>
        </div>

        {/* SD Info */}
        <div className="p-6 border-b">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">{approvalRequest.sdTitle}</h3>
              <p className="text-sm text-gray-600">ID: {approvalRequest.sdId}</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Current Status</div>
              <div className="font-medium">{approvalRequest.currentStatus} / {approvalRequest.currentPriority}</div>
            </div>
          </div>
        </div>

        {/* Evaluation Results */}
        <div className="p-6 border-b">
          <h4 className="font-semibold mb-4 flex items-center">
            📊 Over-Engineering Evaluation Results
          </h4>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Overall Score */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {approvalRequest.evaluation.totalScore}
                </div>
                <div className="text-sm text-gray-600">Overall Score ({approvalRequest.evaluation.percentage}%)</div>
                <div className={`mt-2 px-3 py-1 rounded-full text-sm font-medium ${
                  approvalRequest.evaluation.isOverEngineered ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }`}>
                  {approvalRequest.evaluation.isOverEngineered ? 'Over-Engineered' : 'Acceptable'}
                </div>
              </div>
            </div>

            {/* Recommendation */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="font-medium text-gray-900 mb-2">LEAD Recommendation</div>
              <div className="text-sm text-gray-700 mb-2">
                {approvalRequest.evaluation.recommendation}
              </div>
              {approvalRequest.evaluation.warningFlags.length > 0 && (
                <div className="space-y-1">
                  {approvalRequest.evaluation.warningFlags.map((flag, index) => (
                    <div key={index} className="text-xs text-red-600 flex items-center space-x-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>{flag}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Detailed Scores */}
          <div className="mt-6">
            <h5 className="font-medium mb-3">Detailed Assessment Scores</h5>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {approvalRequest.scores.map((score, index) => {
                const scoreNum = parseInt(score.score.split('/')[0]);
                return (
                  <div key={index} className={`p-3 rounded-lg border ${getScoreColor(scoreNum)}`}>
                    <div className="font-medium text-sm">{score.criterion}</div>
                    <div className="text-lg font-bold">{score.score}</div>
                    <div className="text-xs mt-1">{score.description}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reasoning */}
          <div className="mt-4">
            <h5 className="font-medium mb-2">Assessment Reasoning</h5>
            <ul className="text-sm text-gray-700 space-y-1">
              {approvalRequest.reasoning.map((reason, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="text-gray-400">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Warnings */}
        {approvalRequest.warnings && approvalRequest.warnings.length > 0 && (
          <div className="p-6 border-b bg-orange-50">
            <h4 className="font-semibold mb-3 flex items-center text-orange-800">
              ⚠️ Important Warnings
            </h4>
            <div className="space-y-3">
              {approvalRequest.warnings.map((warning, index) => (
                <div key={index} className="bg-white p-3 rounded border border-orange-200">
                  <div className="flex items-start space-x-3">
                    {getWarningIcon(warning.type)}
                    <div className="flex-1">
                      <div className="font-medium text-orange-800">{warning.message}</div>
                      <div className="text-sm text-orange-700 mt-1">{warning.recommendation}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Options */}
        <div className="p-6 border-b">
          <h4 className="font-semibold mb-4">Choose Your Response</h4>
          <div className="space-y-3">
            {approvalRequest.options.map((option, index) => (
              <label key={index} className="block">
                <input
                  type="radio"
                  name="approval-option"
                  value={option.action}
                  checked={selectedOption?.action === option.action}
                  onChange={() => setSelectedOption(option)}
                  className="mr-3"
                />
                <span className="font-medium">{option.description}</span>
                <div className="text-sm text-gray-600 ml-6 mt-1">
                  Consequences: {option.consequences}
                </div>
              </label>
            ))}
          </div>

          {/* Conditional Inputs */}
          {selectedOption?.action === 'MODIFY_SCORES' && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <h5 className="font-medium mb-3">Provide Manual Scores (1-5)</h5>
              <div className="grid md:grid-cols-2 gap-3">
                {['complexity', 'resourceIntensity', 'strategicAlignment', 'marketTiming', 'riskAssessment', 'roiProjection'].map(criterion => (
                  <div key={criterion}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {criterion.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      className="w-full p-2 border rounded"
                      value={manualScores[criterion] || ''}
                      onChange={(e) => setManualScores({
                        ...manualScores,
                        [criterion]: parseInt(e.target.value)
                      })}
                      placeholder="1-5"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedOption?.action === 'MANUAL_DECISION' && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <h5 className="font-medium mb-3">Specify Manual Changes</h5>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
                  <select
                    className="w-full p-2 border rounded"
                    value={customChanges.status || ''}
                    onChange={(e) => setCustomChanges({
                      ...customChanges,
                      status: e.target.value
                    })}
                  >
                    <option value="">No Change</option>
                    <option value="active">Active</option>
                    <option value="deferred">Deferred</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Priority</label>
                  <select
                    className="w-full p-2 border rounded"
                    value={customChanges.priority || ''}
                    onChange={(e) => setCustomChanges({
                      ...customChanges,
                      priority: e.target.value
                    })}
                  >
                    <option value="">No Change</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rejection Reason */}
        <div className="p-6 border-b">
          <h4 className="font-semibold mb-3">Rejection Reason (Optional)</h4>
          <textarea
            className="w-full p-3 border rounded h-20"
            placeholder="Explain why you're rejecting the LEAD recommendation..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </div>

        {/* Action Buttons */}
        <div className="p-6 bg-gray-50 flex space-x-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReject}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center space-x-2"
          >
            <XCircle className="w-4 h-4" />
            <span>Reject Recommendation</span>
          </button>
          <button
            onClick={handleApprove}
            disabled={!selectedOption}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Approve & Execute</span>
          </button>
        </div>

        {/* Audit Notice */}
        <div className="p-3 bg-blue-50 text-blue-800 text-sm text-center rounded-b-lg">
          🔍 This decision will be logged in the audit trail for governance and compliance
        </div>
      </div>
    </div>
  );
}

export default LEADApprovalDialog;