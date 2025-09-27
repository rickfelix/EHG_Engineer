import React, { useState } from 'react';
import { Shield, AlertTriangle, CheckShield, XOctagon, Scan, FileSearch, Key, Package, Database } from 'lucide-react';

const SecurityScanning = () => {
  const [scanResults, setScanResults] = useState({
    lastScan: '2025-01-27T11:00:00Z',
    status: 'completed',
    summary: {
      critical: 0,
      high: 2,
      medium: 5,
      low: 12,
      info: 23
    },
    vulnerabilities: [
      {
        id: 'CVE-2024-1234',
        severity: 'high',
        type: 'dependency',
        package: 'lodash',
        version: '4.17.20',
        fixVersion: '4.17.21',
        description: 'Prototype pollution vulnerability',
        cwe: 'CWE-1321',
        cvss: 7.5
      },
      {
        id: 'CVE-2024-5678',
        severity: 'high',
        type: 'dependency',
        package: 'axios',
        version: '0.21.1',
        fixVersion: '1.6.0',
        description: 'Server-side request forgery (SSRF)',
        cwe: 'CWE-918',
        cvss: 8.1
      },
      {
        id: 'SEC-001',
        severity: 'medium',
        type: 'code',
        file: 'src/api/auth.js',
        line: 45,
        description: 'Hardcoded API key detected',
        cwe: 'CWE-798',
        cvss: 5.3
      },
      {
        id: 'SEC-002',
        severity: 'medium',
        type: 'container',
        image: 'node:14-alpine',
        description: 'Base image contains known vulnerabilities',
        cwe: 'CWE-937',
        cvss: 5.9
      },
      {
        id: 'SEC-003',
        severity: 'medium',
        type: 'code',
        file: 'src/utils/crypto.js',
        line: 12,
        description: 'Weak cryptographic algorithm (MD5)',
        cwe: 'CWE-327',
        cvss: 4.8
      }
    ],
    scanTypes: {
      sast: { enabled: true, lastRun: '10 min ago', findings: 8 },
      dast: { enabled: true, lastRun: '2 hours ago', findings: 3 },
      dependency: { enabled: true, lastRun: '5 min ago', findings: 15 },
      container: { enabled: true, lastRun: '30 min ago', findings: 4 },
      secrets: { enabled: true, lastRun: '5 min ago', findings: 2 },
      iac: { enabled: false, lastRun: 'Never', findings: 0 }
    }
  });

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedSeverity, setSelectedSeverity] = useState('all');

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-600 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-white';
      case 'low':
        return 'bg-blue-500 text-white';
      case 'info':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return <XOctagon className="h-5 w-5" />;
      case 'high':
        return <AlertTriangle className="h-5 w-5" />;
      case 'medium':
        return <Shield className="h-5 w-5" />;
      case 'low':
        return <CheckShield className="h-5 w-5" />;
      default:
        return <Shield className="h-5 w-5" />;
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'dependency':
        return <Package className="h-4 w-4" />;
      case 'code':
        return <FileSearch className="h-4 w-4" />;
      case 'container':
        return <Database className="h-4 w-4" />;
      case 'secret':
        return <Key className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const filteredVulnerabilities = selectedSeverity === 'all'
    ? scanResults.vulnerabilities
    : scanResults.vulnerabilities.filter(v => v.severity === selectedSeverity);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center">
          <Shield className="h-6 w-6 mr-2 text-red-600" />
          Security Scanning Dashboard
        </h2>
        <p className="text-gray-600">Comprehensive security vulnerability detection and management</p>
        <div className="mt-2">
          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            SD-PIPELINE-001
          </span>
        </div>
      </div>

      {/* Security Score */}
      <div className="mb-6 p-6 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold mb-2">Security Score: B+</h3>
            <p className="text-gray-600">Last scan: {new Date(scanResults.lastScan).toLocaleString()}</p>
          </div>
          <div className="text-right">
            <div className="flex gap-4">
              <div>
                <div className="text-3xl font-bold text-red-600">{scanResults.summary.critical}</div>
                <div className="text-xs text-gray-500">Critical</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-orange-600">{scanResults.summary.high}</div>
                <div className="text-xs text-gray-500">High</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-yellow-600">{scanResults.summary.medium}</div>
                <div className="text-xs text-gray-500">Medium</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-blue-600">{scanResults.summary.low}</div>
                <div className="text-xs text-gray-500">Low</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scan Types Grid */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">Security Scan Types</h3>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(scanResults.scanTypes).map(([type, data]) => (
            <div key={type} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium uppercase text-sm">{type}</h4>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  data.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {data.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="text-2xl font-bold mb-1">{data.findings}</div>
              <div className="text-xs text-gray-500">
                Last run: {data.lastRun}
              </div>
              {data.enabled && (
                <button className="mt-2 text-xs text-blue-600 hover:text-blue-800">
                  Run Now →
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 border-b">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2 px-1 ${
              activeTab === 'overview'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('vulnerabilities')}
            className={`pb-2 px-1 ${
              activeTab === 'vulnerabilities'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Vulnerabilities ({scanResults.vulnerabilities.length})
          </button>
          <button
            onClick={() => setActiveTab('remediation')}
            className={`pb-2 px-1 ${
              activeTab === 'remediation'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Remediation
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'vulnerabilities' && (
        <div>
          {/* Severity Filter */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setSelectedSeverity('all')}
              className={`px-3 py-1 rounded ${
                selectedSeverity === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100'
              }`}
            >
              All ({scanResults.vulnerabilities.length})
            </button>
            {['critical', 'high', 'medium', 'low'].map(severity => (
              <button
                key={severity}
                onClick={() => setSelectedSeverity(severity)}
                className={`px-3 py-1 rounded capitalize ${
                  selectedSeverity === severity
                    ? getSeverityColor(severity)
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {severity} ({scanResults.vulnerabilities.filter(v => v.severity === severity).length})
              </button>
            ))}
          </div>

          {/* Vulnerabilities List */}
          <div className="space-y-3">
            {filteredVulnerabilities.map(vuln => (
              <div key={vuln.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium mr-2 ${getSeverityColor(vuln.severity)}`}>
                        {vuln.severity.toUpperCase()}
                      </span>
                      <span className="flex items-center text-sm text-gray-600">
                        {getTypeIcon(vuln.type)}
                        <span className="ml-1">{vuln.type}</span>
                      </span>
                      <span className="ml-3 text-sm font-mono text-gray-500">{vuln.id}</span>
                    </div>
                    <h4 className="font-semibold mb-1">{vuln.description}</h4>
                    <div className="text-sm text-gray-600">
                      {vuln.package && (
                        <p>Package: {vuln.package} v{vuln.version} → v{vuln.fixVersion}</p>
                      )}
                      {vuln.file && (
                        <p>File: {vuln.file}:{vuln.line}</p>
                      )}
                      {vuln.image && (
                        <p>Image: {vuln.image}</p>
                      )}
                      <p>CWE: {vuln.cwe} • CVSS: {vuln.cvss}</p>
                    </div>
                  </div>
                  <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                    Fix Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="py-8 text-center">
          <Scan className="h-16 w-16 text-blue-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Security Scanning Active</h3>
          <p className="text-gray-600 mb-4">All security scans are running on schedule</p>
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Run Full Security Scan
          </button>
        </div>
      )}

      {activeTab === 'remediation' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold mb-2">Auto-Remediation Available</h3>
            <p className="text-sm text-gray-600 mb-3">
              15 vulnerabilities can be automatically fixed by updating dependencies.
            </p>
            <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Apply Auto-Fix
            </button>
          </div>
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">Manual Review Required</h3>
            <p className="text-sm text-gray-600">
              2 high-severity issues require manual code review and fixes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecurityScanning;