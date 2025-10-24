import React, { useState } from 'react';
import { GitBranch, CheckCircle, XCircle, AlertTriangle, Clock, ArrowRight } from 'lucide-react';

const HANDOFF_CHECKLISTS = {
  'LEAD-to-PLAN': [
    'SD created and saved to /docs/strategic-directives/',
    'Business objectives clearly defined',
    'Success metrics are measurable',
    'Constraints documented',
    'Risks identified',
    'Feasibility confirmed',
    'Environment health checked',
    'Context usage < 30%',
    'Summary created (500 tokens max)'
  ],
  'PLAN-to-EXEC': [
    'PRD created and saved to /docs/prds/',
    'All SD requirements mapped to PRD items',
    'Technical specifications complete',
    'Prerequisites verified and available',
    'Test requirements defined',
    'Acceptance criteria clear',
    'Risk mitigation planned',
    'Context usage < 40%',
    'Summary created (500 tokens max)'
  ],
  'EXEC-to-COMPLETE': [
    'All PRD requirements implemented',
    'Tests written and passing',
    'Lint checks passing (npm run lint)',
    'Type checks passing (npx tsc --noEmit)',
    'Build successful (npm run build)',
    'CI/CD pipeline green',
    'Documentation updated',
    'Context usage < 60%',
    'Summary created (500 tokens max)'
  ]
};

function HandoffCenter({ handoffs, leoProtocol, onRequestHandoff }) {
  const [selectedHandoff, setSelectedHandoff] = useState('LEAD-to-PLAN');
  const [checklist, setChecklist] = useState(
    HANDOFF_CHECKLISTS['LEAD-to-PLAN'].map(item => ({ text: item, checked: false }))
  );
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');

  const handleHandoffTypeChange = (type) => {
    setSelectedHandoff(type);
    setChecklist(HANDOFF_CHECKLISTS[type].map(item => ({ text: item, checked: false })));
    setShowExceptionForm(false);
  };

  const toggleChecklistItem = (index) => {
    const newChecklist = [...checklist];
    newChecklist[index].checked = !newChecklist[index].checked;
    setChecklist(newChecklist);
  };

  const handleRequestHandoff = () => {
    const completedCount = checklist.filter(item => item.checked).length;
    if (completedCount < checklist.length) {
      setShowExceptionForm(true);
    } else {
      onRequestHandoff(selectedHandoff, checklist);
      alert('Handoff approved!');
    }
  };

  const handleExceptionSubmit = () => {
    if (exceptionReason.trim()) {
      onRequestHandoff(selectedHandoff, checklist, exceptionReason);
      setShowExceptionForm(false);
      setExceptionReason('');
      alert('Exception request submitted for review');
    }
  };

  const completedCount = checklist.filter(item => item.checked).length;
  const progress = Math.round((completedCount / checklist.length) * 100);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        Handoff Control Center
      </h1>

      {/* Workflow Visualization */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className={`text-center flex-1 ${leoProtocol.activeRole === 'LEAD' ? 'text-primary-600 font-bold' : 'text-gray-400'}`}>
            <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              LEAD
            </div>
            <p>Strategic</p>
          </div>
          <ArrowRight className="w-6 h-6 text-gray-400" />
          <div className={`text-center flex-1 ${leoProtocol.activeRole === 'PLAN' ? 'text-primary-600 font-bold' : 'text-gray-400'}`}>
            <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              PLAN
            </div>
            <p>Planning</p>
          </div>
          <ArrowRight className="w-6 h-6 text-gray-400" />
          <div className={`text-center flex-1 ${leoProtocol.activeRole === 'EXEC' ? 'text-primary-600 font-bold' : 'text-gray-400'}`}>
            <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              EXEC
            </div>
            <p>Execution</p>
          </div>
        </div>
      </div>

      {/* Handoff Checklist */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Handoff Checklist</h2>

        <div className="mb-4">
          <label htmlFor="handoff-type-select" className="block text-sm font-medium mb-2">
            Select Handoff Type
          </label>
          <select
            id="handoff-type-select"
            value={selectedHandoff}
            onChange={(e) => handleHandoffTypeChange(e.target.value)}
            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="LEAD-to-PLAN">LEAD → PLAN</option>
            <option value="PLAN-to-EXEC">PLAN → EXEC</option>
            <option value="EXEC-to-COMPLETE">EXEC → COMPLETE</option>
          </select>
        </div>

        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-600">Progress: {completedCount}/{checklist.length}</span>
            <span className={`text-sm font-bold ${progress === 100 ? 'text-green-600' : 'text-yellow-600'}`}>
              {progress}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${progress === 100 ? 'bg-green-500' : 'bg-yellow-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {checklist.map((item, index) => {
            const checkboxId = `checklist-item-${index}`;
            return (
              <label key={index} htmlFor={checkboxId} className="flex items-center p-3 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleChecklistItem(index)}
                  className="mr-3 w-5 h-5 text-primary-600 rounded"
                />
                <span className={item.checked ? 'line-through text-gray-500' : ''}>
                  {item.text}
                </span>
              </label>
            );
          })}
        </div>

        <button
          onClick={handleRequestHandoff}
          className={`w-full py-3 rounded font-semibold transition-colors ${
            progress === 100
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-yellow-600 hover:bg-yellow-700 text-white'
          }`}
          aria-label={progress === 100 ? 'Request handoff' : 'Request exception for incomplete handoff'}
        >
          {progress === 100 ? 'Request Handoff' : 'Request Exception'}
        </button>

        {showExceptionForm && (
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900 rounded">
            <h3 className="font-semibold mb-2 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Exception Request
            </h3>
            <p className="text-sm mb-3">
              {checklist.length - completedCount} items incomplete. Provide justification:
            </p>
            <label htmlFor="exception-reason" className="sr-only">
              Exception justification
            </label>
            <textarea
              id="exception-reason"
              value={exceptionReason}
              onChange={(e) => setExceptionReason(e.target.value)}
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              rows="3"
              placeholder="Explain why these items cannot be completed..."
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleExceptionSubmit}
                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                aria-label="Submit exception request"
              >
                Submit Exception
              </button>
              <button
                onClick={() => setShowExceptionForm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                aria-label="Cancel exception request"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recent Handoffs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Handoff History</h2>
        {handoffs.length > 0 ? (
          <div className="space-y-3">
            {handoffs.slice(-10).reverse().map((handoff, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <div className="flex items-center">
                  <GitBranch className="w-4 h-4 mr-2" />
                  <span className="font-medium">{handoff.type}</span>
                </div>
                <div className="flex items-center gap-3">
                  {handoff.status === 'approved' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="text-sm text-gray-500">
                    {new Date(handoff.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No handoffs recorded yet</p>
        )}
      </div>
    </div>
  );
}

export default HandoffCenter;
