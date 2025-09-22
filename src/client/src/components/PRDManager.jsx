import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  FileText, 
  ChevronRight, 
  CheckSquare,
  Square,
  Target,
  Plus,
  Wand2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

function PRDManager({ prds, isCompact, detailMode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('list'); 
  const [selectedPRD, setSelectedPRD] = useState(null);
  
  // Handle URL-based detail view
  useEffect(() => {
    if (detailMode && id) {
      const prd = prds.find(p => p.id === id);
      if (prd) {
        setSelectedPRD(prd);
        setViewMode('detail');
        document.title = `${prd.title || prd.id} - LEO Protocol Dashboard`;
      } else {
        console.warn(`PRD with id '${id}' not found, redirecting to list`);
        navigate('/prds', { replace: true });
      }
    } else if (!detailMode) {
      setViewMode('list');
      setSelectedPRD(null);
      document.title = 'PRDs - LEO Protocol Dashboard';
    }
  }, [id, detailMode, prds, navigate]);

  const viewDetail = (prd) => {
    if (!prd || !prd.id) {
      console.error('Invalid PRD for navigation:', prd);
      return;
    }
    
    try {
      navigate(`/prds/${prd.id}`);
    } catch (error) {
      console.error('Navigation error:', error);
    }
  };

  if (viewMode === 'detail' && selectedPRD) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate('/prds')}
          className="mb-4 text-primary-600 hover:text-primary-700 flex items-center"
        >
          <ChevronRight className="w-4 h-4 mr-1 rotate-180" />
          Back to PRDs
        </button>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {selectedPRD.title}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {selectedPRD.directiveTitle && `Strategic Directive: ${selectedPRD.directiveTitle}`}
            </p>
          </div>
          
          {/* PRD Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
              <p className="font-semibold text-gray-900 dark:text-white">{selectedPRD.status}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">Priority</p>
              <p className="font-semibold text-gray-900 dark:text-white">{selectedPRD.priority}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">Phase</p>
              <p className="font-semibold text-gray-900 dark:text-white">{selectedPRD.phase}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">Progress</p>
              <p className="font-semibold text-gray-900 dark:text-white">{selectedPRD.progress}%</p>
            </div>
          </div>

          {/* Full Content */}
          <div className="prose prose-lg dark:prose-invert max-w-none mb-6">
            <ReactMarkdown>{selectedPRD.content || 'No content available'}</ReactMarkdown>
          </div>

          {/* Interactive Checklist */}
          {selectedPRD.checklist && selectedPRD.checklist.length > 0 && (
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">Implementation Checklist</h3>
              <div className="space-y-2">
                {selectedPRD.checklist.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-start p-3 rounded bg-gray-50 dark:bg-gray-700"
                  >
                    {item.checked ? (
                      <CheckSquare className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400 mt-0.5 mr-3 flex-shrink-0" />
                    )}
                    <span className={`flex-1 ${item.checked ? 'line-through text-gray-500' : ''}`}>
                      {item.text}
                    </span>
                    {item.phase && (
                      <span className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded ml-2">
                        {item.phase}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={isCompact ? 'p-3' : 'p-6'}>
      <div className={isCompact ? 'mb-3' : 'mb-6'}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`${isCompact ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white`}>
              PRDs
            </h1>
            <p className={`text-gray-600 dark:text-gray-400 ${isCompact ? 'text-sm mt-1' : 'mt-2'}`}>
              Product Requirements Documents - Technical implementation details
            </p>
          </div>
        </div>
      </div>

      {prds.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            No PRDs found
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {prds.map((prd) => (
            <div
              key={prd.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-start space-x-3">
                      <FileText className="w-6 h-6 text-blue-600 mt-1" />
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {prd.title}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {prd.directiveTitle && `SD: ${prd.directiveTitle}`}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                          {prd.description}
                        </p>
                        
                        <div className="flex items-center space-x-4 mt-3">
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
                          <span className="text-xs text-gray-500">
                            Phase: {prd.phase}
                          </span>
                          <span className="text-xs text-gray-500">
                            Progress: {prd.progress}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="ml-4 flex flex-col items-end space-y-2">
                    <button
                      onClick={() => viewDetail(prd)}
                      className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
                    >
                      View Full
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PRDManager;