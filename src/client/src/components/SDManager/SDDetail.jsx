import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText, Target } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

/**
 * SDDetail Component
 * Displays full details of a Strategic Directive including:
 * - Complete metadata
 * - Full content (no truncation)
 * - Interactive checklist
 * - Associated PRDs
 * - Associated EES items
 */
function SDDetail({
  sd,
  onUpdateChecklist
}) {
  const navigate = useNavigate();

  const handleChecklistToggle = (itemIndex) => {
    if (sd && sd.checklist && sd.checklist[itemIndex]) {
      onUpdateChecklist(sd.id, itemIndex, !sd.checklist[itemIndex].checked);
    }
  };

  if (!sd) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading strategic directive...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <button
        onClick={() => navigate('/strategic-directives')}
        className="mb-4 text-primary-600 hover:text-primary-700 flex items-center"
      >
        <ChevronRight className="w-4 h-4 mr-1" />
        Back to List
      </button>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          {sd.id}: {sd.title || 'Untitled'}
        </h1>

        {/* Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {sd.metadata && Object.entries(sd.metadata).map(([key, value]) => (
            <div key={key} className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">{key}</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
              </p>
            </div>
          ))}
        </div>

        {/* Full Content - No Truncation */}
        <div className="prose prose-lg dark:prose-invert max-w-none mb-6">
          <ReactMarkdown>{sd.content || 'No content available'}</ReactMarkdown>
        </div>

        {/* Interactive Checklist */}
        {sd.checklist && sd.checklist.length > 0 && (
          <div className="border-t pt-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Requirements Checklist</h3>
            <div className="space-y-2">
              {sd.checklist.map((item, index) => (
                <label
                  key={index}
                  className="flex items-start p-3 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => handleChecklistToggle(index)}
                    className="mt-1 mr-3 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className={`flex-1 ${item.checked ? 'line-through text-gray-500' : ''}`}>
                    {item.text}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Associated PRDs */}
        {sd.prds && sd.prds.length > 0 && (
          <div className="border-t pt-6 mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-blue-600" />
              Product Requirements Documents ({sd.prds.length})
            </h3>
            <div className="space-y-4">
              {sd.prds.map((prd) => (
                <div key={prd.id} className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                        {prd.title}
                      </h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        ID: {prd.id}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        prd.status === 'approved' ? 'bg-green-100 text-green-800' :
                        prd.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {prd.status}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        prd.priority === 'high' ? 'bg-red-100 text-red-800' :
                        prd.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {prd.priority}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <strong>Phase:</strong> {prd.phase}
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <strong>Progress:</strong> {prd.progress}%
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <strong>Created:</strong> {new Date(prd.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                    <button
                      onClick={() => navigate(`/prds/${prd.id}`)}
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center"
                    >
                      View Full PRD <ChevronRight className="w-4 h-4 ml-1" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Associated EES Items */}
        {sd.executionSequences && sd.executionSequences.length > 0 && (
          <div className="border-t pt-6 mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Target className="w-5 h-5 mr-2 text-green-600" />
              Execution Sequence Steps ({sd.executionSequences.length})
            </h3>
            <div className="space-y-3">
              {sd.executionSequences.map((ees) => (
                <div key={ees.id} className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        ees.status === 'completed' ? 'bg-green-500 text-white' :
                        ees.status === 'in_progress' ? 'bg-blue-500 text-white' :
                        'bg-gray-300 text-gray-600'
                      }`}>
                        {ees.sequenceNumber}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-green-900 dark:text-green-100">
                          {ees.description}
                        </p>
                        <div className="mt-2 flex items-center space-x-4 text-sm text-green-700 dark:text-green-300">
                          <span>
                            <strong>Executor:</strong> {ees.executorRole}
                          </span>
                          {ees.completedAt && (
                            <span>
                              <strong>Completed:</strong> {new Date(ees.completedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      ees.status === 'completed' ? 'bg-green-100 text-green-800' :
                      ees.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {ees.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SDDetail;
