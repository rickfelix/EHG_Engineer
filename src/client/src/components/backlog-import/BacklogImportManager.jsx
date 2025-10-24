import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileJson, FileText, CheckCircle, AlertCircle, Loader2, Database, Tag, GitBranch } from 'lucide-react';
import { supabase } from '../../config/supabase';

const BacklogImportManager = () => {
  const [file, setFile] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [importStatus, setImportStatus] = useState('idle');
  const [importResults, setImportResults] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [duplicateHandling, setDuplicateHandling] = useState('skip');
  const [categoryMapping, setCategoryMapping] = useState({});
  const fileInputRef = useRef(null);

  // File type detection
  const detectFileType = (filename) => {
    const extension = filename.split('.').pop().toLowerCase();
    return extension === 'csv' || extension === 'json' ? extension : null;
  };

  // Parse CSV content
  const parseCSV = (content) => {
    const lines = content.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());

    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const item = {};
      headers.forEach((header, index) => {
        item[header] = values[index] || '';
      });
      return item;
    });
  };

  // Parse JSON content
  const parseJSON = (content) => {
    try {
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error('JSON parsing error:', error);
      return [];
    }
  };

  // Handle file selection
  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      const fileType = detectFileType(selectedFile.name);
      if (!fileType) {
        alert('Please select a CSV or JSON file');
        return;
      }

      setFile(selectedFile);
      const reader = new FileReader();

      reader.onload = (e) => {
        const content = e.target.result;
        setFileContent(content);

        const parsedData = fileType === 'csv'
          ? parseCSV(content)
          : parseJSON(content);

        setPreviewData(parsedData.slice(0, 5));
      };

      reader.readAsText(selectedFile);
    }
  };

  // Validate backlog items
  const validateItems = (items) => {
    const requiredFields = ['title', 'description', 'priority'];
    const validItems = [];
    const invalidItems = [];

    items.forEach((item, index) => {
      const missingFields = requiredFields.filter(field => !item[field]);
      if (missingFields.length === 0) {
        validItems.push({
          ...item,
          id: item.id || `imported-${Date.now()}-${index}`,
          category: item.category || 'uncategorized',
          status: item.status || 'pending',
          estimated_effort: item.estimated_effort || 'medium',
          created_at: new Date().toISOString()
        });
      } else {
        invalidItems.push({
          item,
          reason: `Missing fields: ${missingFields.join(', ')}`
        });
      }
    });

    return { validItems, invalidItems };
  };

  // Check for duplicates
  const checkDuplicates = async (items) => {
    try {
      const titles = items.map(item => item.title);
      const { data: existing, error } = await supabase
        .from('backlog_items')
        .select('title')
        .in('title', titles);

      if (error) throw error;

      const existingTitles = new Set(existing.map(e => e.title));
      const duplicates = items.filter(item => existingTitles.has(item.title));
      const unique = items.filter(item => !existingTitles.has(item.title));

      return { duplicates, unique };
    } catch (error) {
      console.error('Error checking duplicates:', error);
      return { duplicates: [], unique: items };
    }
  };

  // Import backlog items
  const handleImport = async () => {
    if (!fileContent) {
      alert('Please select a file first');
      return;
    }

    setImportStatus('processing');

    try {
      const fileType = detectFileType(file.name);
      const parsedData = fileType === 'csv'
        ? parseCSV(fileContent)
        : parseJSON(fileContent);

      // Validate items
      const { validItems, invalidItems } = validateItems(parsedData);

      if (validItems.length === 0) {
        setImportStatus('error');
        setImportResults({
          success: false,
          message: 'No valid items to import',
          invalidItems
        });
        return;
      }

      // Check for duplicates
      const { duplicates, unique } = await checkDuplicates(validItems);

      let itemsToImport = unique;
      if (duplicates.length > 0 && duplicateHandling === 'merge') {
        // Update existing items
        for (const dup of duplicates) {
          const { error } = await supabase
            .from('backlog_items')
            .update(dup)
            .eq('title', dup.title);

          if (error) console.error('Error updating duplicate:', error);
        }
      }

      // Import new items
      if (itemsToImport.length > 0) {
        const { data, error } = await supabase
          .from('backlog_items')
          .insert(itemsToImport)
          .select();

        if (error) throw error;

        setImportStatus('success');
        setImportResults({
          success: true,
          imported: data.length,
          duplicates: duplicates.length,
          invalid: invalidItems.length,
          message: `Successfully imported ${data.length} items`
        });
      } else {
        setImportStatus('warning');
        setImportResults({
          success: true,
          imported: 0,
          duplicates: duplicates.length,
          invalid: invalidItems.length,
          message: 'All items were duplicates'
        });
      }
    } catch (error) {
      console.error('Import error:', error);
      setImportStatus('error');
      setImportResults({
        success: false,
        message: `Import failed: ${error.message}`
      });
    }
  };

  const handleKeyDown = (event, callback) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback();
    }
  };

  // Reset import
  const resetImport = () => {
    setFile(null);
    setFileContent(null);
    setImportStatus('idle');
    setImportResults(null);
    setPreviewData([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Backlog Import Manager</h2>
        <p className="text-gray-600">Import backlog items from CSV or JSON files</p>
      </div>

      {/* File Upload Section */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-6">
        <input
          ref={fileInputRef}
          type="file" id="backlog-file-input" aria-label="Upload CSV or JSON file"
          accept=".csv,.json"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div
          className="flex flex-col items-center cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => handleKeyDown(e, () => fileInputRef.current?.click())}
          tabIndex="0"
          role="button"
          aria-label="Upload file"
        >
          <Upload className="h-12 w-12 text-gray-400 mb-3" />
          <p className="text-sm font-medium text-gray-700">
            Click to upload or drag and drop
          </p>
          <p className="text-xs text-gray-500 mt-1">
            CSV or JSON files only
          </p>
        </div>

        {file && (
          <div className="mt-4 p-3 bg-blue-50 rounded-md flex items-center">
            {file.name.endsWith('.csv') ? (
              <FileText className="h-5 w-5 text-blue-600 mr-2" />
            ) : (
              <FileJson className="h-5 w-5 text-blue-600 mr-2" />
            )}
            <span className="text-sm text-gray-700">{file.name}</span>
            <button
              onClick={resetImport}
              aria-label="Remove selected file" className="ml-auto text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Preview Section */}
      {previewData.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Preview (First 5 items)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(previewData[0]).map(key => (
                    <th key={key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {previewData.map((item, index) => (
                  <tr key={index}>
                    {Object.values(item).map((value, idx) => (
                      <td key={idx} className="px-4 py-2 text-sm text-gray-900">
                        {String(value).substring(0, 50)}
                        {String(value).length > 50 && '...'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Options */}
      {file && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">Import Options</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duplicate Handling
              </label>
              <select id="duplicate-handling-select"
                value={duplicateHandling}
                onChange={(e) => setDuplicateHandling(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="skip">Skip Duplicates</option>
                <option value="merge">Merge/Update Existing</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Import Button */}
      {file && importStatus === 'idle' && (
        <button
          onClick={handleImport}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center"
        >
          <Database className="h-5 w-5 mr-2" />
          Import Backlog Items
        </button>
      )}

      {/* Import Status */}
      {importStatus === 'processing' && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          <span className="ml-3 text-gray-700">Processing import...</span>
        </div>
      )}

      {/* Import Results */}
      {importResults && (
        <div className={`p-4 rounded-lg ${
          importStatus === 'success' ? 'bg-green-50 border border-green-200' :
          importStatus === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
          'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-start">
            {importStatus === 'success' ? (
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2" />
            ) : (
              <AlertCircle className={`h-5 w-5 mt-0.5 mr-2 ${
                importStatus === 'warning' ? 'text-yellow-500' : 'text-red-500'
              }`} />
            )}
            <div className="flex-1">
              <p className="font-semibold">{importResults.message}</p>

              {importResults.success && (
                <div className="mt-2 space-y-1 text-sm">
                  <p>✅ Imported: {importResults.imported} items</p>
                  {importResults.duplicates > 0 && (
                    <p>⚠️ Duplicates: {importResults.duplicates} items</p>
                  )}
                  {importResults.invalid > 0 && (
                    <p>❌ Invalid: {importResults.invalid} items</p>
                  )}
                </div>
              )}

              <button
                onClick={resetImport}
                className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Import Another File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BacklogImportManager;