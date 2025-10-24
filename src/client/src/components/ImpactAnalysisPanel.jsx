/**
 * Impact Analysis Panel Component
 * Displays comprehensive impact analysis results for directive submissions
 * Shows risk assessment, affected components, and consistency validation
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  TrendingUp,
  TrendingDown,
  Shield,
  Layers,
  Clock,
  Users,
  Database,
  Globe,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Zap,
  Target
} from 'lucide-react';

const ImpactAnalysisPanel = ({ impactAnalysis, consistencyValidation, submission }) => {
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    components: false,
    consistency: false,
    recommendations: false,
    mitigation: false
  });

  if (!impactAnalysis && !consistencyValidation) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center">
        <Info className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-400">
          No impact analysis available for this submission
        </p>
      </div>
    );
  }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleKeyDown = (event, callback) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback();
    }
  };

  // Risk level styling
  const getRiskStyling = (riskLevel) => {
    switch (riskLevel) {
      case 'critical':
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          text: 'text-red-900 dark:text-red-100',
          accent: 'text-red-600 dark:text-red-400',
          icon: AlertTriangle
        };
      case 'high':
        return {
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          border: 'border-orange-200 dark:border-orange-800',
          text: 'text-orange-900 dark:text-orange-100',
          accent: 'text-orange-600 dark:text-orange-400',
          icon: AlertCircle
        };
      case 'medium':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          text: 'text-yellow-900 dark:text-yellow-100',
          accent: 'text-yellow-600 dark:text-yellow-400',
          icon: Info
        };
      case 'low':
        return {
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
          text: 'text-green-900 dark:text-green-100',
          accent: 'text-green-600 dark:text-green-400',
          icon: CheckCircle
        };
      default:
        return {
          bg: 'bg-gray-50 dark:bg-gray-800',
          border: 'border-gray-200 dark:border-gray-700',
          text: 'text-gray-900 dark:text-gray-100',
          accent: 'text-gray-600 dark:text-gray-400',
          icon: Info
        };
    }
  };

  const riskStyling = getRiskStyling(impactAnalysis?.risk_level || consistencyValidation?.risk_level);
  const RiskIcon = riskStyling.icon;

  // Component icons mapping
  const getComponentIcon = (componentName) => {
    const iconMap = {
      ui: Layers,
      api: Globe,
      database: Database,
      authentication: Shield,
      navigation: Target,
      performance: TrendingUp,
      'design-system': Layers
    };
    return iconMap[componentName] || Info;
  };

  return (
    <div className="space-y-6">
      {/* Overview Section */}
      <div className={`rounded-lg border ${riskStyling.bg} ${riskStyling.border} p-6`}>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('overview')}
          onKeyDown={(e) => handleKeyDown(e, () => toggleSection('overview'))}
          tabIndex="0"
          role="button"
          aria-expanded={expandedSections.overview}
          aria-label="Toggle impact analysis overview"
        >
          <div className="flex items-center space-x-3">
            <RiskIcon className={`w-6 h-6 ${riskStyling.accent}`} />
            <div>
              <h3 className={`text-lg font-semibold ${riskStyling.text}`}>
                Impact Analysis Overview
              </h3>
              <p className={`text-sm ${riskStyling.text} opacity-75`}>
                Risk Level: {(impactAnalysis?.risk_level || consistencyValidation?.risk_level || 'unknown').toUpperCase()}
              </p>
            </div>
          </div>
          {expandedSections.overview ?
            <ChevronDown className={`w-5 h-5 ${riskStyling.accent}`} /> :
            <ChevronRight className={`w-5 h-5 ${riskStyling.accent}`} />
          }
        </div>

        {expandedSections.overview && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            {impactAnalysis && (
              <>
                <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg">
                  <div className={`text-2xl font-bold ${riskStyling.accent}`}>
                    {impactAnalysis.impact_score}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Impact Score
                  </div>
                </div>

                <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg">
                  <div className={`text-2xl font-bold ${riskStyling.accent}`}>
                    {impactAnalysis.effort_multiplier}x
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Effort Multiplier
                  </div>
                </div>

                <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg">
                  <div className={`text-2xl font-bold ${riskStyling.accent}`}>
                    {impactAnalysis.affected_components?.length || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Affected Components
                  </div>
                </div>
              </>
            )}

            {consistencyValidation && (
              <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg">
                <div className={`text-2xl font-bold ${consistencyValidation.passed ? 'text-green-600' : 'text-red-600'}`}>
                  {consistencyValidation.score}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Consistency Score
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Affected Components */}
      {impactAnalysis?.affected_components && impactAnalysis.affected_components.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('components')}
            onKeyDown={(e) => handleKeyDown(e, () => toggleSection('components'))}
            tabIndex="0"
            role="button"
            aria-expanded={expandedSections.components}
            aria-label="Toggle affected components section"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <Layers className="w-5 h-5 mr-2" />
              Affected Components
            </h3>
            {expandedSections.components ?
              <ChevronDown className="w-5 h-5 text-gray-400" /> :
              <ChevronRight className="w-5 h-5 text-gray-400" />
            }
          </div>

          {expandedSections.components && (
            <div className="mt-4 space-y-3">
              {impactAnalysis.affected_components.map((component, index) => {
                const ComponentIcon = getComponentIcon(component.name);
                const componentRisk = getRiskStyling(component.risk_level);

                return (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${componentRisk.bg} ${componentRisk.border}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <ComponentIcon className={`w-5 h-5 ${componentRisk.accent}`} />
                        <div>
                          <h4 className={`font-medium ${componentRisk.text}`}>
                            {component.name}
                          </h4>
                          <p className={`text-sm ${componentRisk.text} opacity-75`}>
                            Risk: {component.risk_level} • Confidence: {Math.round((component.confidence || 0) * 100)}%
                          </p>
                        </div>
                      </div>
                    </div>

                    {component.dependencies && component.dependencies.length > 0 && (
                      <div className="mt-2">
                        <p className={`text-xs ${componentRisk.text} opacity-60 mb-1`}>Dependencies:</p>
                        <div className="flex flex-wrap gap-1">
                          {component.dependencies.map((dep, depIndex) => (
                            <span
                              key={depIndex}
                              className={`px-2 py-1 rounded text-xs ${componentRisk.accent} bg-white dark:bg-gray-700`}
                            >
                              {dep}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Consistency Validation */}
      {consistencyValidation && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('consistency')}
            onKeyDown={(e) => handleKeyDown(e, () => toggleSection('consistency'))}
            tabIndex="0"
            role="button"
            aria-expanded={expandedSections.consistency}
            aria-label="Toggle consistency validation section"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              Consistency Validation
              {!consistencyValidation.passed && (
                <XCircle className="w-5 h-5 ml-2 text-red-500" />
              )}
            </h3>
            {expandedSections.consistency ?
              <ChevronDown className="w-5 h-5 text-gray-400" /> :
              <ChevronRight className="w-5 h-5 text-gray-400" />
            }
          </div>

          {expandedSections.consistency && (
            <div className="mt-4 space-y-4">
              {/* Validation Status */}
              <div className={`p-4 rounded-lg ${consistencyValidation.passed ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                <div className="flex items-center">
                  {consistencyValidation.passed ? (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
                  )}
                  <span className={`font-medium ${consistencyValidation.passed ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'}`}>
                    {consistencyValidation.passed ? 'Validation Passed' : 'Validation Failed'}
                  </span>
                </div>

                {consistencyValidation.blocking_issues && consistencyValidation.blocking_issues.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">Blocking Issues:</p>
                    {consistencyValidation.blocking_issues.map((issue, index) => (
                      <div key={index} className="text-sm text-red-800 dark:text-red-200 mb-1">
                        • {issue.message}
                        {issue.suggestion && (
                          <div className="text-xs text-red-600 dark:text-red-300 ml-4 mt-1">
                            Suggestion: {issue.suggestion}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Category Scores */}
              {consistencyValidation.category_scores && (
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Category Breakdown</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(consistencyValidation.category_scores).map(([category, score]) => (
                      <div key={category} className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                            {category.replace('_', ' ')}
                          </span>
                          <span className={`text-sm font-bold ${score >= 70 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {score}
                          </span>
                        </div>
                        <div className="mt-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${score >= 70 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {(impactAnalysis?.recommendations || consistencyValidation?.recommendations) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('recommendations')}
            onKeyDown={(e) => handleKeyDown(e, () => toggleSection('recommendations'))}
            tabIndex="0"
            role="button"
            aria-expanded={expandedSections.recommendations}
            aria-label="Toggle recommendations section"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <Target className="w-5 h-5 mr-2" />
              Recommendations
            </h3>
            {expandedSections.recommendations ?
              <ChevronDown className="w-5 h-5 text-gray-400" /> :
              <ChevronRight className="w-5 h-5 text-gray-400" />
            }
          </div>

          {expandedSections.recommendations && (
            <div className="mt-4 space-y-3">
              {impactAnalysis?.recommendations?.map((rec, index) => (
                <div key={`impact-${index}`} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        {rec.type}: {rec.description}
                      </p>
                      {rec.effort_reduction && (
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          Effort reduction: {rec.effort_reduction}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {consistencyValidation?.recommendations?.map((rec, index) => (
                <div key={`consistency-${index}`} className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-start">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        {rec.message}
                      </p>
                      {rec.priority && (
                        <span className={`inline-block px-2 py-1 rounded text-xs mt-1 ${
                          rec.priority === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                          rec.priority === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' :
                          rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {rec.priority} priority
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mitigation Strategies */}
      {impactAnalysis?.mitigation_strategies && impactAnalysis.mitigation_strategies.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('mitigation')}
            onKeyDown={(e) => handleKeyDown(e, () => toggleSection('mitigation'))}
            tabIndex="0"
            role="button"
            aria-expanded={expandedSections.mitigation}
            aria-label="Toggle mitigation strategies section"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <Zap className="w-5 h-5 mr-2" />
              Mitigation Strategies
            </h3>
            {expandedSections.mitigation ?
              <ChevronDown className="w-5 h-5 text-gray-400" /> :
              <ChevronRight className="w-5 h-5 text-gray-400" />
            }
          </div>

          {expandedSections.mitigation && (
            <div className="mt-4 space-y-2">
              {impactAnalysis.mitigation_strategies.map((strategy, index) => (
                <div key={index} className="flex items-start p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5 mr-2 flex-shrink-0" />
                  <span className="text-sm text-gray-900 dark:text-gray-100">{strategy}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Breaking Changes Alert */}
      {impactAnalysis?.breaking_changes && impactAnalysis.breaking_changes.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <div className="flex items-center mb-3">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 mr-2" />
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">
              Breaking Changes Detected
            </h3>
          </div>
          <div className="space-y-2">
            {impactAnalysis.breaking_changes.map((change, index) => (
              <div key={index} className="text-sm text-red-800 dark:text-red-200">
                <strong>{change.type}:</strong> {change.description}
                {change.keyword && <span className="ml-2 text-xs bg-red-200 dark:bg-red-800 px-2 py-1 rounded">"{change.keyword}"</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImpactAnalysisPanel;
