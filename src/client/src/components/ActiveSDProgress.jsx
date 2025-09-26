import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import { Target, CheckCircle, Clock, AlertTriangle, ChevronDown, Check, ArrowRight, Sparkles, Copy, ClipboardCheck, RefreshCw, Search, ChevronRight, ExternalLink, FileText, ListChecks, Info } from 'lucide-react';
import { useReducedMotion } from '../animations/hooks/useReducedMotion';
import ProgressAudit from './ProgressAudit';

function ActiveSDProgress({ strategicDirectives, prds, currentSD, onSetActiveSD, isCompact }) {
  const shouldReduceMotion = useReducedMotion();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [promptVersion, setPromptVersion] = useState(0); // For refresh
  const [auditData, setAuditData] = useState(null); // Store audit data
  const [searchQuery, setSearchQuery] = useState(''); // Search functionality
  const [expandedSections, setExpandedSections] = useState({}); // Expandable sections
  const [progressData, setProgressData] = useState(null); // Progress calculation data
  const [showProgressTooltip, setShowProgressTooltip] = useState(false); // Tooltip for progress breakdown
  const dropdownRef = useRef(null);
  const promptRef = useRef(null);
  const searchInputRef = useRef(null);
  const progressBarRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);
  
  // Toggle expanded sections
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  // Get phase description
  const getPhaseDescription = (phase) => {
    const descriptions = {
      LEAD_PLANNING: 'Strategic planning and directive creation',
      PLAN_DESIGN: 'Technical planning and PRD creation',
      EXEC_IMPLEMENTATION: 'Implementation and development work',
      PLAN_VERIFICATION: 'Testing and verification',
      LEAD_APPROVAL: 'Final approval and deployment',
      COMPLETE: 'All phases completed'
    };
    return descriptions[phase] || 'Unknown phase';
  };
  
  // Get pending checklist items using fresh data calculation
  const getPendingItems = (sd) => {
    if (!sd) return [];
    
    const pendingItems = [];
    
    // Add SD checklist items (LEAD_PLANNING phase)
    if (sd.checklist) {
      sd.checklist.filter(item => !item.checked).forEach(item => {
        pendingItems.push({
          type: 'SD',
          text: item.text,
          phase: 'LEAD_PLANNING'
        });
      });
    }
    
    // Get associated PRD for this SD (fresh data, not cached metadata)
    // First try to find PRD data embedded in the SD object
    const associatedPRD = sd.prds?.[0] || 
      // Look in the global prds array passed as prop
      prds?.find(prd => prd.directiveId === sd.id || prd.id === `PRD-${sd.id}`) ||
      // Fallback: look in the parent strategic directives array
      strategicDirectives.find(dir => dir.id === sd.id)?.prds?.[0];
    
    if (associatedPRD) {
      // PLAN_DESIGN phase - check plan_checklist directly
      const planChecklist = associatedPRD.plan_checklist || [];
      const pendingPlanItems = planChecklist.filter(item => 
        typeof item === 'object' ? !item.checked : true
      );
      
      if (pendingPlanItems.length > 0) {
        pendingItems.push({
          type: 'PLAN_DESIGN',
          text: `Complete ${pendingPlanItems.length} planning checklist items`,
          phase: 'PLAN_DESIGN',
          details: pendingPlanItems.slice(0, 3).map(item => 
            typeof item === 'object' ? item.text : item
          )
        });
      }
      
      // EXEC_IMPLEMENTATION phase - check exec_checklist directly
      const execChecklist = associatedPRD.exec_checklist || [];
      const pendingExecItems = execChecklist.filter(item => 
        typeof item === 'object' ? !item.checked : true
      );
      
      if (pendingExecItems.length > 0) {
        pendingItems.push({
          type: 'EXEC_IMPLEMENTATION',
          text: `Complete ${pendingExecItems.length} implementation tasks`,
          phase: 'EXEC_IMPLEMENTATION',
          details: pendingExecItems.slice(0, 3).map(item => 
            typeof item === 'object' ? item.text : item
          )
        });
      }
      
      // PLAN_VERIFICATION phase - check validation_checklist directly
      const verificationChecklist = associatedPRD.validation_checklist || [];
      const pendingVerificationItems = verificationChecklist.filter(item => 
        typeof item === 'object' ? !item.checked : true
      );
      
      if (pendingVerificationItems.length > 0) {
        pendingItems.push({
          type: 'PLAN_VERIFICATION',
          text: `Complete ${pendingVerificationItems.length} verification items`,
          phase: 'PLAN_VERIFICATION',
          details: pendingVerificationItems.slice(0, 3).map(item => 
            typeof item === 'object' ? item.text : item
          )
        });
      }
    }
    
    // Final safety check: if SD shows 100% progress, don't show pending items
    // This prevents stale data issues from showing false positives
    const progressValue = typeof sd.progress === 'object' ? sd.progress.total : sd.progress;
    if (progressValue >= 100 && pendingItems.length > 0) {
      console.log('⚠️ Progress/Pending Mismatch Detected:', {
        sdId: sd.id,
        sdProgress: progressValue,
        pendingCount: pendingItems.length,
        message: 'SD shows 100% but has pending items - clearing pending list to match progress'
      });
      return []; // Clear pending items if SD is 100% complete
    }
    
    // Debug logging to help identify issues
    if (pendingItems.length > 0) {
      console.log('🔍 Pending Items Debug:', {
        sdId: sd.id,
        sdProgress: progressValue,
        totalPendingItems: pendingItems.length,
        pendingByPhase: pendingItems.reduce((acc, item) => {
          acc[item.phase] = (acc[item.phase] || 0) + 1;
          return acc;
        }, {}),
        associatedPRDId: associatedPRD?.id,
        prdSource: associatedPRD ? (
          sd.prds?.[0] ? 'SD.prds' : 
          prds?.find(prd => prd.directiveId === sd.id) ? 'global prds prop' : 
          'strategicDirectives fallback'
        ) : 'none',
        sdChecklist: sd.checklist?.length,
        uncheckedSDItems: sd.checklist?.filter(item => !item.checked).length,
        prdChecklists: associatedPRD ? {
          plan: associatedPRD.plan_checklist?.length,
          exec: associatedPRD.exec_checklist?.length,
          validation: associatedPRD.validation_checklist?.length
        } : null
      });
    }
    
    return pendingItems;
  };
  
  // Fetch audit data will happen after displaySD is defined
  
  // Generate detailed AI prompt
  const generateDetailedPrompt = (sd, progress, audit) => {
    if (!sd) return '';
    
    const uncheckedSD = sd.checklist?.filter(item => !item.checked) || [];
    const validationIssues = sd.leoPhase?.validation?.details || [];
    const remainingTasks = sd.leoPhase?.remainingTasks || [];
    const phaseProgress = sd.leoPhase?.phaseProgress || {};
    
    // Categorize PRD tasks properly
    // PLAN phase handoff checklist items should be marked complete
    // Implementation acceptance criteria belong to EXEC phase
    const prdTasks = audit?.phaseBreakdown?.PLAN?.checklist || [];
    const planHandoffItems = prdTasks.filter(item => 
      item.text.includes('PRD created and saved') ||
      item.text.includes('SD requirements mapped') ||
      item.text.includes('Technical specifications complete') ||
      item.text.includes('Prerequisites verified') ||
      item.text.includes('Test requirements') ||
      item.text.includes('Acceptance criteria') ||
      item.text.includes('Risk mitigation') ||
      item.text.includes('Context usage') ||
      item.text.includes('summary created') ||
      item.text.includes('architecture documented') ||
      item.text.includes('phases clearly defined') ||
      item.text.includes('Documentation requirements')
    );
    
    const execImplementationItems = prdTasks.filter(item => 
      !planHandoffItems.includes(item) && !item.checked
    );
    
    const timestamp = new Date().toLocaleString();
    
    return `# Strategic Directive Completion Request
Generated: ${timestamp}

## Context
**Project**: LEO Protocol Dashboard Implementation
**SD ID**: ${sd.id}
**Title**: ${sd.title}
**Priority**: ${sd.metadata?.priority || 'Normal'}
**Owner**: ${sd.metadata?.owner || 'System Administrator'}

## Current Status
- **Overall Progress**: ${progress}% complete
- **Active Phase**: ${sd.leoPhase?.current || 'LEAD'} Agent
- **Phase Status**: ${sd.leoPhase?.status || 'In Progress'}
- **Database Status**: ${sd.metadata?.Status || 'In Progress'}

## Phase Breakdown
### LEAD Phase (Strategic Planning) - ${phaseProgress.LEAD?.progress || 0}%
Status: ${phaseProgress.LEAD?.complete ? '✅ Complete' : '⏳ In Progress'}

### PLAN Phase (Technical Planning) - ${phaseProgress.PLAN?.progress || 0}%
Status: ${phaseProgress.PLAN?.complete ? '✅ Complete' : phaseProgress.PLAN?.progress > 0 ? '⏳ In Progress' : '⏸️ Not Started'}

### EXEC Phase (Implementation) - ${phaseProgress.EXEC?.progress || 0}%
Status: ${phaseProgress.EXEC?.complete ? '✅ Complete' : phaseProgress.EXEC?.progress > 0 ? '⏳ In Progress' : '⏸️ Not Started'}

## Remaining Tasks

### Strategic Directive Checklist (${uncheckedSD.length} items)
${uncheckedSD.length > 0 ? uncheckedSD.map(item => `- [ ] ${item.text}`).join('\n') : '✅ All SD checklist items complete'}

${execImplementationItems.length > 0 ? `### Implementation Tasks (EXEC Phase - ${execImplementationItems.length} items)
Note: PLAN phase handoff checklist is complete. These are EXEC phase implementation acceptance criteria.
${execImplementationItems.slice(0, 10).map(task => `- [ ] ${task.text}`).join('\n')}
${execImplementationItems.length > 10 ? `\n... and ${execImplementationItems.length - 10} more implementation tasks` : ''}`  : ''}

${remainingTasks.length > 0 ? `### Phase-Specific Tasks
${remainingTasks.map(task => `
**${task.phase} Phase**: ${task.description}
${task.tasks ? task.tasks.map(t => `  - ${t}`).join('\n') : ''}`).join('\n')}` : ''}

## Validation Issues
${validationIssues.length > 0 ? validationIssues.map(issue => 
  `- **${issue.source}** (${issue.phase}): ${issue.items.length} unchecked items`
).join('\n') : '✅ No validation issues'}

${audit ? `## Progress Audit Analysis

### Important Note on Progress Calculation
The dashboard currently shows ${progress}% overall progress. However, according to LEO Protocol v4.0:
- LEAD Phase (33.33%): ${phaseProgress.LEAD?.complete ? '✅ COMPLETE' : 'In Progress'} 
- PLAN Phase (33.33%): ${phaseProgress.PLAN?.complete || planHandoffItems.every(i => i.checked) ? '✅ COMPLETE (PRD created with handoff checklist done)' : 'In Progress'}
- EXEC Phase (33.34%): ${phaseProgress.EXEC?.progress > 0 ? `In Progress (${phaseProgress.EXEC?.progress}%)` : 'Not Started'}

**Actual Progress**: ${phaseProgress.LEAD?.complete && (phaseProgress.PLAN?.complete || planHandoffItems.every(i => i.checked)) ? '66%' : progress + '%'} - PLAN phase should be marked complete when PRD is created with handoff checklist done.

### Calculation Breakdown
${audit.calculations?.breakdown?.join('\n') || 'No calculation data available'}

### Audit Recommendations
${audit.recommendations?.length > 0 ? audit.recommendations.map(rec => `- ${rec}`).join('\n') : '✅ No issues found in audit'}

### Implementation Indicators
${audit.phaseBreakdown?.EXEC?.indicators ? 
  Object.entries(audit.phaseBreakdown.EXEC.indicators.indicators || {})
    .map(([key, val]) => `- ${key}: ${val.status ? '✅' : '❌'} ${val.details || ''}`)
    .join('\n') 
  : 'No implementation indicators available'}
` : ''}

## Next Steps
${sd.leoPhase?.current === 'LEAD' && phaseProgress.LEAD?.complete ? 
`1. Create a Product Requirements Document (PRD) for technical planning
2. Perform LEAD-to-PLAN handoff` : ''}
${sd.leoPhase?.current === 'PLAN' && phaseProgress.PLAN?.complete ? 
`1. Begin implementation phase
2. Perform PLAN-to-EXEC handoff` : ''}
${sd.leoPhase?.current === 'EXEC' && phaseProgress.EXEC?.complete ? 
`1. Complete final testing and validation
2. Perform EXEC-to-COMPLETE handoff` : ''}
${uncheckedSD.length > 0 || prdTasks.length > 0 ? 
`Priority: Complete all unchecked items listed above` : ''}

## Instructions
Please help me complete the remaining tasks for this Strategic Directive following LEO Protocol v4.0 standards. Focus on:
1. Completing all unchecked checklist items
2. Ensuring proper handoffs between phases
3. Maintaining documentation and test coverage
4. Following the established project patterns and conventions

${sd.metadata?.PRD ? `PRD Location: ${sd.metadata.PRD}` : 'Note: No PRD linked yet'}

Please proceed with the implementation.`;
  };
  // Find the active Strategic Directive
  const activeSD = currentSD ? strategicDirectives.find(sd => sd.id === currentSD) : null;
  
  // If no currentSD is set, find the most recently created or first incomplete SD
  const fallbackActiveSD = !activeSD && strategicDirectives.length > 0
    ? strategicDirectives.find(sd => {
        // Skip completed SDs
        if (sd.status === 'completed' || sd.status === 'complete') {
          return false;
        }
        const completedItems = sd.checklist?.filter(item => item.checked).length || 0;
        const totalItems = sd.checklist?.length || 0;
        return totalItems > 0 && completedItems < totalItems; // Find first incomplete SD
      }) || strategicDirectives.find(sd => sd.status !== 'completed' && sd.status !== 'complete') // Fallback to first non-completed SD
    : null;
  
  const displaySD = activeSD || fallbackActiveSD;
  
  // Fetch audit data when prompt is shown or refreshed
  useEffect(() => {
    if ((showPrompt || promptVersion > 0) && displaySD) {
      fetch(`/api/progress/audit/${displaySD.id}`)
        .then(res => res.json())
        .then(data => setAuditData(data))
        .catch(err => console.error('Failed to fetch audit:', err));
    }
  }, [showPrompt, promptVersion, displaySD?.id]);
  
  if (!displaySD) {
    return (
      <div className={`bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 border-l-4 border-gray-400 ${isCompact ? 'p-3' : 'p-4'} mb-6 rounded-lg`}>
        <div className="flex items-center">
          <AlertTriangle className={`${isCompact ? 'w-5 h-5' : 'w-6 h-6'} text-gray-500 mr-3`} />
          <div>
            <h3 className={`${isCompact ? 'text-sm' : 'text-base'} font-semibold text-gray-700 dark:text-gray-300`}>
              No Active Strategic Directive
            </h3>
            <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400 mt-1`}>
              Create a new Strategic Directive to start tracking progress
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate progress - use the SD's progress value which accounts for LEO Protocol phases
  const checkedItems = displaySD.checklist?.filter(item => item.checked).length || 0;
  const totalItems = displaySD.checklist?.length || 0;
  // Use the SD's calculated progress if available (accounts for LEAD/PLAN/EXEC phases)
  const progressPercentage = displaySD.progress !== undefined
    ? (typeof displaySD.progress === 'object' ? displaySD.progress.total : displaySD.progress)
    : (totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0);
  
  // Determine status and colors
  const getStatusInfo = () => {
    if (progressPercentage === 100) {
      return {
        status: 'Complete',
        color: 'text-green-700 dark:text-green-300',
        bgColor: 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20',
        borderColor: 'border-green-400',
        progressColor: 'bg-green-500',
        icon: CheckCircle
      };
    } else if (progressPercentage >= 50) {
      return {
        status: 'In Progress',
        color: 'text-blue-700 dark:text-blue-300',
        bgColor: 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20',
        borderColor: 'border-blue-400',
        progressColor: 'bg-blue-500',
        icon: Target
      };
    } else {
      return {
        status: 'Just Started',
        color: 'text-amber-700 dark:text-amber-300',
        bgColor: 'from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20',
        borderColor: 'border-amber-400',
        progressColor: 'bg-amber-500',
        icon: Clock
      };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  // Filter SDs based on search query
  const filteredSDs = strategicDirectives.filter(sd => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      sd.id.toLowerCase().includes(query) ||
      (sd.title && sd.title.toLowerCase().includes(query)) ||
      (sd.metadata?.Status && sd.metadata.Status.toLowerCase().includes(query)) ||
      (sd.metadata?.Priority && sd.metadata.Priority.toLowerCase().includes(query))
    );
  });

  // Handle dropdown open with focus
  const handleDropdownToggle = () => {
    setIsDropdownOpen(!isDropdownOpen);
    if (!isDropdownOpen) {
      // Focus search input when opening
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  // Handle keyboard navigation
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      setSearchQuery('');
    } else if (e.key === 'Enter' && filteredSDs.length > 0) {
      // Select first filtered SD
      const firstSD = filteredSDs[0];
      if (onSetActiveSD && firstSD.id !== currentSD) {
        onSetActiveSD(firstSD.id);
        window.dispatchEvent(new CustomEvent('activeSDChanged', { 
          detail: { sdId: firstSD.id, sd: firstSD }
        }));
      }
      setIsDropdownOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <div className={`bg-gradient-to-r ${statusInfo.bgColor} border-l-4 ${statusInfo.borderColor} ${isCompact ? 'p-2 sm:p-3' : 'p-3 sm:p-4'} mb-4 sm:mb-6 rounded-lg shadow-sm`}>
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center min-w-0 flex-1">
          <StatusIcon className={`${isCompact ? 'w-4 sm:w-5 h-4 sm:h-5' : 'w-5 sm:w-6 h-5 sm:h-6'} ${statusInfo.color} mr-2 sm:mr-3 flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <div className="relative" ref={dropdownRef}>
              <motion.button
                onClick={handleDropdownToggle}
                className={`flex items-center justify-between w-full text-left ${isCompact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'} font-semibold ${statusInfo.color} hover:bg-white/10 rounded px-1 sm:px-2 py-1 transition-colors min-w-0`}
                whileHover={{ scale: shouldReduceMotion ? 1 : 1.02 }}
                whileTap={{ scale: shouldReduceMotion ? 1 : 0.98 }}
                aria-label="Select Strategic Directive"
                aria-expanded={isDropdownOpen}
                aria-haspopup="listbox"
              >
                <span className="truncate">Active: {displaySD.title && displaySD.title !== '[Enter Strategic Directive Title]' ? displaySD.title : displaySD.id}</span>
                <motion.div
                  animate={{ rotate: isDropdownOpen ? 180 : 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: "easeOut" }}
                  className="flex-shrink-0 ml-1"
                >
                  <ChevronDown className={`${isCompact ? 'w-3 sm:w-4 h-3 sm:h-4' : 'w-4 sm:w-5 h-4 sm:h-5'}`} />
                </motion.div>
              </motion.button>
              
              <AnimatePresence>
                {isDropdownOpen && strategicDirectives.length > 0 && (
                  <motion.div 
                    className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-80 flex flex-col"
                    initial={{ opacity: 0, y: shouldReduceMotion ? 0 : -10, scale: shouldReduceMotion ? 1 : 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -10, scale: shouldReduceMotion ? 1 : 0.95 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: "easeOut" }}
                  >
                    {/* Search Input */}
                    <div className="p-2 border-b border-gray-200 dark:border-gray-600">
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search Strategic Directives..."
                        value={searchQuery}
                        onChange={handleSearchChange}
                        onKeyDown={handleSearchKeyDown}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-500 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        aria-label="Search Strategic Directives"
                      />
                      {searchQuery && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {filteredSDs.length} of {strategicDirectives.length} results
                        </div>
                      )}
                    </div>
                    
                    {/* Results */}
                    <div className="max-h-60 overflow-y-auto">
                      {filteredSDs.length === 0 && searchQuery ? (
                        <div className="p-3 text-center text-gray-500 dark:text-gray-400 text-sm">
                          No Strategic Directives found for "{searchQuery}"
                        </div>
                      ) : (
                        filteredSDs.map((sd, index) => {
                    const isActive = sd.id === currentSD || (sd.id === displaySD.id && !currentSD);
                    // Use the SD's calculated progress which accounts for LEO Protocol phases
                    const sdProgress = sd.progress !== undefined
                      ? (typeof sd.progress === 'object' ? sd.progress.total : sd.progress)
                      : 0;
                    
                    return (
                      <button
                        key={sd.id}
                            onClick={() => {
                              // Update active SD without causing navigation
                              if (onSetActiveSD) {
                                onSetActiveSD(sd.id);
                                // Emit custom event for other components to listen
                                window.dispatchEvent(new CustomEvent('activeSDChanged', { 
                                  detail: { sdId: sd.id, sd: sd }
                                }));
                              }
                              setIsDropdownOpen(false);
                              setSearchQuery(''); // Clear search on selection
                              // Prevent any default navigation behavior
                              return false;
                            }}
                        className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                          isActive ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center">
                              {isActive && <Check className="w-4 h-4 text-primary-600 mr-2 flex-shrink-0" />}
                              <p className={`${isCompact ? 'text-xs' : 'text-sm'} font-medium text-gray-900 dark:text-white truncate ${isActive ? 'ml-0' : 'ml-6'}`}>
                                {sd.title && sd.title !== '[Enter Strategic Directive Title]' ? sd.title : sd.id}
                              </p>
                            </div>
                            <div className="flex items-center mt-1">
                              <div className="flex-1">
                                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1 overflow-hidden">
                                  <motion.div 
                                    className={`h-1 rounded-full ${
                                      sdProgress === 100 ? 'bg-green-500' :
                                      sdProgress >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                                    }`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${sdProgress}%` }}
                                    transition={{ 
                                      duration: shouldReduceMotion ? 0 : 0.8, 
                                      ease: "easeOut",
                                      delay: shouldReduceMotion ? 0 : (index * 0.1)
                                    }}
                                  />
                                </div>
                              </div>
                              <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400 ml-2`}>
                                <CountUp 
                                  end={sdProgress} 
                                  duration={shouldReduceMotion ? 0 : 1}
                                  preserveValue
                                  suffix="%"
                                />
                              </span>
                            </div>
                            {sd.leoPhase && (
                              <div className="flex items-center space-x-2 mt-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                  sd.leoPhase.phases.LEAD ? 'bg-green-500' : 'bg-gray-300'
                                }`}></div>
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                  sd.leoPhase.phases.PLAN ? 'bg-green-500' : 
                                  sd.leoPhase.current === 'PLAN' ? 'bg-blue-500' : 'bg-gray-300'
                                }`}></div>
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                  sd.leoPhase.phases.EXEC ? 'bg-green-500' :
                                  sd.leoPhase.current === 'EXEC' ? 'bg-blue-500' : 'bg-gray-300'
                                }`}></div>
                                <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400`}>
                                  {sd.leoPhase.current}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                            );
                          })
                        )}
                      </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <p className={`${isCompact ? 'text-xs' : 'text-xs sm:text-sm'} text-gray-600 dark:text-gray-400 mt-1`}>
              {displaySD.leoPhase ? (
                <>
                  <span className="font-medium">LEO Protocol:</span> {displaySD.leoPhase.status}
                </>
              ) : (
                `${statusInfo.status} • ${checkedItems} of ${totalItems} items completed`
              )}
            </p>
            {displaySD.leoPhase && (
              <div className="flex items-center space-x-2 sm:space-x-4 mt-2">
                <div className={`flex items-center text-xs ${
                  displaySD.leoPhase.phases.LEAD ? 'text-green-600 font-medium' : 'text-gray-400'
                }`}>
                  <div className={`w-2 h-2 rounded-full mr-1 ${
                    displaySD.leoPhase.phases.LEAD ? 'bg-green-500' : 'bg-gray-300'
                  }`}></div>
                  LEAD
                </div>
                <div className={`flex items-center text-xs ${
                  displaySD.leoPhase.phases.PLAN ? 'text-green-600 font-medium' : 
                  displaySD.leoPhase.current === 'PLAN' ? 'text-blue-600 font-medium' : 'text-gray-400'
                }`}>
                  <div className={`w-2 h-2 rounded-full mr-1 ${
                    displaySD.leoPhase.phases.PLAN ? 'bg-green-500' : 
                    displaySD.leoPhase.current === 'PLAN' ? 'bg-blue-500' : 'bg-gray-300'
                  }`}></div>
                  PLAN
                </div>
                <div className={`flex items-center text-xs ${
                  displaySD.leoPhase.phases.EXEC ? 'text-green-600 font-medium' :
                  displaySD.leoPhase.current === 'EXEC' ? 'text-blue-600 font-medium' : 'text-gray-400'
                }`}>
                  <div className={`w-2 h-2 rounded-full mr-1 ${
                    displaySD.leoPhase.phases.EXEC ? 'bg-green-500' :
                    displaySD.leoPhase.current === 'EXEC' ? 'bg-blue-500' : 'bg-gray-300'
                  }`}></div>
                  EXEC
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 sm:gap-2 flex-shrink-0">
          <div className="text-right">
            <div className={`${isCompact ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'} font-bold ${statusInfo.color}`}>
              <CountUp 
                end={progressPercentage} 
                duration={shouldReduceMotion ? 0 : 2}
                preserveValue
                suffix="%"
              />
            </div>
            {displaySD.metadata?.priority && (
              <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400`}>
                Priority: {displaySD.metadata.priority}
              </div>
            )}
          </div>
          <div className="flex gap-1 flex-wrap justify-end">
            <motion.button
              onClick={() => setShowAudit(true)}
              className={`flex items-center ${isCompact ? 'px-2 py-1 text-xs' : 'px-2 py-1 text-xs'} bg-blue-500/20 dark:bg-blue-400/20 hover:bg-blue-500/30 dark:hover:bg-blue-400/30 rounded transition-all`}
              title="View progress validation audit"
              whileHover={{ scale: shouldReduceMotion ? 1 : 1.05, y: shouldReduceMotion ? 0 : -1 }}
              whileTap={{ scale: shouldReduceMotion ? 1 : 0.95 }}
            >
              <ClipboardCheck className="w-3 h-3 mr-1" />
              <span>Audit</span>
            </motion.button>
            <motion.button
              onClick={() => setShowPrompt(!showPrompt)}
              className={`flex items-center ${isCompact ? 'px-2 py-1 text-xs' : 'px-2 py-1 text-xs'} bg-purple-500/20 dark:bg-purple-400/20 hover:bg-purple-500/30 dark:hover:bg-purple-400/30 rounded transition-all`}
              title="Generate AI prompt for remaining tasks"
              whileHover={{ scale: shouldReduceMotion ? 1 : 1.05, y: shouldReduceMotion ? 0 : -1 }}
              whileTap={{ scale: shouldReduceMotion ? 1 : 0.95 }}
            >
              <Sparkles className="w-3 h-3 mr-1" />
              <span>AI Prompt</span>
            </motion.button>
          </div>
        </div>
      </div>
      
      {/* Enhanced Animated Progress Bar with Tooltip */}
      <div
        className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden relative"
        onMouseEnter={() => setShowProgressTooltip(true)}
        onMouseLeave={() => setShowProgressTooltip(false)}
        ref={progressBarRef}
      >
        {/* Progress Tooltip with LEO Phase Breakdown */}
        <AnimatePresence>
          {showProgressTooltip && (
            <motion.div
              className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.2 }}
            >
              <div className="bg-gray-800 dark:bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl border border-gray-700 min-w-[250px]">
                <div className="font-semibold mb-2 flex items-center">
                  <Info className="w-3 h-3 mr-1" />
                  LEO Protocol Phase Breakdown
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-green-300">LEAD Planning:</span>
                    <span className="font-mono">20%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-300">PLAN Design:</span>
                    <span className="font-mono">20%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-300">EXEC Implementation:</span>
                    <span className="font-mono">30%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-orange-300">VERIFICATION:</span>
                    <span className="font-mono">15%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-300">APPROVAL:</span>
                    <span className="font-mono">15%</span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <div className="flex justify-between font-semibold">
                    <span>Current Progress:</span>
                    <span className="text-green-400">{progressPercentage}%</span>
                  </div>
                </div>
                {/* Arrow pointing down */}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-gray-800 dark:border-t-gray-900"></div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className={`h-3 ${statusInfo.progressColor} rounded-full relative`}
          initial={{ width: 0 }}
          animate={{ width: `${progressPercentage}%` }}
          transition={{
            duration: shouldReduceMotion ? 0 : 1.2,
            ease: "easeOut",
            delay: shouldReduceMotion ? 0 : 0.2
          }}
        >
          {!shouldReduceMotion && (
            <>
              {/* Shimmer effect */}
              <motion.div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear"
                }}
              />
              {/* Pulse effect */}
              <motion.div 
                className="absolute inset-0 bg-white/20 rounded-full"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </>
          )}
        </motion.div>
      </div>
      
      {/* Enhanced Progress Details Section */}
      <div className="mt-4 space-y-3">
        {/* Phase Context & Current Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`${isCompact ? 'text-sm' : 'text-base'} font-semibold ${statusInfo.color}`}>
              Current Phase: {displaySD.metadata?.['Current Phase'] || 'LEAD_PLANNING'}
            </div>
            <button
              onClick={() => toggleSection('phaseInfo')}
              className="flex items-center text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <Info className="w-3 h-3 mr-1" />
              Info
            </button>
          </div>
          {displaySD.metadata?.date && (
            <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400`}>
              Created: {new Date(displaySD.metadata.date).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Phase Description (expandable) */}
        <AnimatePresence>
          {expandedSections.phaseInfo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-blue-800 dark:text-blue-200`}>
                  <strong>LEO Protocol Flow:</strong> LEAD → PLAN → EXEC → VERIFICATION → APPROVAL
                </p>
                <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-blue-700 dark:text-blue-300 mt-1`}>
                  {getPhaseDescription(displaySD.metadata?.['Current Phase'] || 'LEAD_PLANNING')}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Completion Overview */}
        {displaySD.metadata?.['Phase Progress'] && typeof displaySD.metadata['Phase Progress'] === 'object' && (
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(displaySD.metadata['Phase Progress']).map(([phase, percentage]) => {
              const numericPercentage = typeof percentage === 'number' ? percentage : parseInt(percentage) || 0;
              const isComplete = numericPercentage === 100;
              const isCurrent = phase === displaySD.metadata?.['Current Phase'];
              
              return (
                <div key={phase} className={`text-center p-2 rounded ${
                  isComplete ? 'bg-green-50 dark:bg-green-900/20' : 
                  isCurrent ? 'bg-blue-50 dark:bg-blue-900/20' : 
                  'bg-gray-50 dark:bg-gray-800'
                }`}>
                  <div className={`${isCompact ? 'text-xs' : 'text-sm'} font-medium ${
                    isComplete ? 'text-green-700 dark:text-green-300' :
                    isCurrent ? 'text-blue-700 dark:text-blue-300' :
                    'text-gray-500 dark:text-gray-400'
                  }`}>
                    {phase.split('_')[0]}
                  </div>
                  <div className={`${isCompact ? 'text-xs' : 'text-sm'} font-bold ${
                    isComplete ? 'text-green-600 dark:text-green-400' :
                    isCurrent ? 'text-blue-600 dark:text-blue-400' :
                    'text-gray-400'
                  }`}>
                    {isComplete ? (
                      <Check className="w-4 h-4 mx-auto" />
                    ) : (
                      `${numericPercentage}%`
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pending Work Details */}
        {(() => {
          const pendingItems = getPendingItems(displaySD);
          if (pendingItems.length === 0) return null;

          return (
            <div className="space-y-2">
              <button
                onClick={() => toggleSection('pendingWork')}
                className="flex items-center justify-between w-full p-2 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-700 transition-colors"
              >
                <div className="flex items-center">
                  <ListChecks className="w-4 h-4 text-amber-600 dark:text-amber-400 mr-2" />
                  <span className={`${isCompact ? 'text-sm' : 'text-base'} font-medium text-amber-800 dark:text-amber-200`}>
                    {pendingItems.length} Pending Task{pendingItems.length > 1 ? 's' : ''}
                  </span>
                </div>
                <ChevronRight className={`w-4 h-4 text-amber-600 dark:text-amber-400 transform transition-transform ${
                  expandedSections.pendingWork ? 'rotate-90' : ''
                }`} />
              </button>

              <AnimatePresence>
                {expandedSections.pendingWork && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 pl-4">
                      {pendingItems.slice(0, 5).map((item, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <div className="w-2 h-2 rounded-full bg-amber-400 mt-2 flex-shrink-0"></div>
                          <div className="flex-1">
                            <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-700 dark:text-gray-300`}>
                              {item.text}
                            </p>
                            <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400`}>
                              {item.phase.replace('_', ' ')} Phase • {item.type}
                            </p>
                            {/* Show specific pending item details if available */}
                            {item.details && item.details.length > 0 && (
                              <div className="mt-1 pl-2 border-l-2 border-amber-200 dark:border-amber-700">
                                {item.details.map((detail, detailIndex) => (
                                  <p key={detailIndex} className={`${isCompact ? 'text-xs' : 'text-xs'} text-gray-600 dark:text-gray-400 truncate`}>
                                    • {detail}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {pendingItems.length > 5 && (
                        <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400 italic pl-4`}>
                          ... and {pendingItems.length - 5} more items
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* Quick Navigation Links */}
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/strategic-directives/${displaySD.id}`}
            className="inline-flex items-center px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full transition-colors"
          >
            <FileText className="w-3 h-3 mr-1" />
            View SD Document
            <ExternalLink className="w-3 h-3 ml-1" />
          </Link>
          
          {displaySD.prds && displaySD.prds.length > 0 && (
            <Link
              to={`/prds/${displaySD.prds[0].id}`}
              className="inline-flex items-center px-3 py-1 text-xs bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded-full transition-colors"
            >
              <FileText className="w-3 h-3 mr-1" />
              View PRD Document
              <ExternalLink className="w-3 h-3 ml-1" />
            </Link>
          )}
          
        </div>
      </div>
      
      {/* AI Prompt Modal */}
      {showPrompt && (
        <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center">
              <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400 mr-2" />
              <h3 className="font-semibold text-purple-900 dark:text-purple-100">AI Prompt for Remaining Tasks</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPromptVersion(v => v + 1)}
                className="flex items-center px-2 py-1 text-xs bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-700 rounded transition-all"
                title="Refresh prompt with latest data"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Refresh
              </button>
              <button
                onClick={() => setShowPrompt(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl"
              >
                ×
              </button>
            </div>
          </div>
          
          <div className="relative">
            <pre 
              ref={promptRef}
              key={promptVersion} // Force re-render on refresh
              className="bg-white dark:bg-gray-800 p-3 rounded border border-purple-200 dark:border-purple-700 text-sm overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto"
            >
{generateDetailedPrompt(displaySD, progressPercentage, auditData)}</pre>
            
            <button
              onClick={() => {
                const text = promptRef.current?.innerText || '';
                navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className={`absolute top-2 right-2 flex items-center px-2 py-1 text-xs rounded transition-all ${
                copied 
                  ? 'bg-green-500 text-white' 
                  : 'bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-700'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </>
              )}
            </button>
          </div>
          
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            Copy this prompt and paste it into Claude Code to get help completing the remaining tasks.
          </p>
        </div>
      )}
      
      {/* Progress Audit Modal */}
      {showAudit && (
        <ProgressAudit 
          sdId={displaySD.id}
          onClose={() => setShowAudit(false)}
        />
      )}
    </div>
  );
}

export default ActiveSDProgress;