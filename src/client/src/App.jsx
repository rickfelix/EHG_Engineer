import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import { useUserPreferences, usePersistentState } from './hooks/useLocalStorage';
import AnimatedAppLayout from './components/AnimatedAppLayout';
import EnhancedOverview from './components/EnhancedOverview';
import SDManager from './components/SDManager';
import PRDManager from './components/PRDManager';
import HandoffCenter from './components/HandoffCenter';
import ContextMonitor from './components/ContextMonitor';
import DirectiveLab from './components/DirectiveLab';
import BacklogManager from './components/BacklogManager';
import PRReviews from './components/PRReviews';
import logger from './utils/logger';

function App() {
  const [state, setState] = useState({
    leoProtocol: {
      version: 'detecting...',
      activeRole: null,
      currentSD: null,
      currentPRD: null,
      phase: null
    },
    context: {
      usage: 0,
      total: 180000,
      breakdown: {}
    },
    handoffs: [],
    strategicDirectives: [],
    prds: [],
    checklists: {},
    progress: {
      overall: 0,
      byPhase: {}
    }
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { preferences, updatePreference } = useUserPreferences();
  const [savedChecklists, setSavedChecklists] = usePersistentState('checklists', {});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = usePersistentState('sidebarCollapsed', false);
  const [isCompactMode, setIsCompactMode] = usePersistentState('compactMode', false);

  // WebSocket connection
  const ws = useWebSocket('ws://localhost:3000', {
    onOpen: () => {
      setIsConnected(true);
      logger.log('Connected to dashboard server');
    },
    onMessage: (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'state') {
          setState(message.data);
        }
      } catch (error) {
        logger.error('Error parsing WebSocket message:', error);
      }
    },
    onClose: () => {
      setIsConnected(false);
      logger.log('Disconnected from dashboard server');
    },
    onError: (error) => {
      logger.error('WebSocket error:', error);
    }
  });

  // Load initial state
  useEffect(() => {
    fetch('/api/state')
      .then(res => res.json())
      .then(data => {
        // Merge saved checklists with server state
        const mergedData = {
          ...data,
          checklists: { ...data.checklists, ...savedChecklists }
        };
        setState(mergedData);
      })
      .catch(error => logger.error('Error loading state:', error));
  }, []);

  // Save checklists to local storage when they change
  useEffect(() => {
    if (Object.keys(state.checklists).length > 0) {
      setSavedChecklists(state.checklists);
    }
  }, [state.checklists]);

  // Apply theme preference
  useEffect(() => {
    if (preferences.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [preferences.theme]);

  const refreshData = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'refresh' }));
    }
  };

  const updateChecklist = (documentId, itemIndex, checked) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'updateChecklist',
        data: { documentId, itemIndex, checked }
      }));
    }
  };

  const requestHandoff = (type, checklist) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'requestHandoff',
        data: { type, checklist }
      }));
    }
  };

  const compactContext = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'compactContext' }));
    }
  };

  const setActiveSD = (sdId) => {
    // Update local state immediately for better UX
    setState(prevState => ({
      ...prevState,
      leoProtocol: {
        ...prevState.leoProtocol,
        currentSD: sdId
      }
    }));

    // Send to server to persist
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'setActiveSD',
        data: { sdId }
      }));
    }
  };

  const updateSDStatus = (sdId, newStatus) => {
    // Update local state immediately for better UX
    setState(prevState => ({
      ...prevState,
      strategicDirectives: prevState.strategicDirectives.map(sd => 
        sd.id === sdId ? { ...sd, status: newStatus } : sd
      )
    }));

    // Send to server to persist in database
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'updateSDStatus',
        data: { sdId, status: newStatus }
      }));
    }
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <AnimatedAppLayout
              state={state}
              isConnected={isConnected}
              isSidebarCollapsed={isSidebarCollapsed}
              setIsSidebarCollapsed={setIsSidebarCollapsed}
              isCompactMode={isCompactMode}
              setIsCompactMode={setIsCompactMode}
              isMobileMenuOpen={isMobileMenuOpen}
              setIsMobileMenuOpen={setIsMobileMenuOpen}
              updateChecklist={updateChecklist}
              requestHandoff={requestHandoff}
              compactContext={compactContext}
              refreshData={refreshData}
              setActiveSD={setActiveSD}
            />
          }
        >
          <Route 
            index 
            element={
              <EnhancedOverview 
                state={state} 
                onRefresh={refreshData}
                onSetActiveSD={setActiveSD}
                isCompact={isCompactMode}
              />
            } 
          />
          <Route path="strategic-directives">
            <Route 
              index 
              element={
                <SDManager 
                  strategicDirectives={state.strategicDirectives}
                  onUpdateChecklist={updateChecklist}
                  onSetActiveSD={setActiveSD}
                  onUpdateStatus={updateSDStatus}
                  currentSD={state.leoProtocol?.currentSD}
                  isCompact={isCompactMode}
                  onRefresh={refreshData}
                />
              } 
            />
            <Route 
              path=":id" 
              element={
                <SDManager 
                  strategicDirectives={state.strategicDirectives}
                  onUpdateChecklist={updateChecklist}
                  onSetActiveSD={setActiveSD}
                  onUpdateStatus={updateSDStatus}
                  currentSD={state.leoProtocol?.currentSD}
                  isCompact={isCompactMode}
                  detailMode={true}
                  onRefresh={refreshData}
                />
              } 
            />
          </Route>
          <Route path="prds">
            <Route 
              index 
              element={
                <PRDManager 
                  prds={state.prds}
                  isCompact={isCompactMode}
                />
              } 
            />
            <Route 
              path=":id" 
              element={
                <PRDManager 
                  prds={state.prds}
                  isCompact={isCompactMode}
                  detailMode={true}
                />
              } 
            />
          </Route>
          <Route path="backlog">
            <Route 
              index 
              element={
                <BacklogManager 
                  strategicDirectives={state.strategicDirectives}
                  isCompact={isCompactMode}
                  onRefresh={refreshData}
                />
              } 
            />
            <Route 
              path=":id" 
              element={
                <BacklogManager 
                  strategicDirectives={state.strategicDirectives}
                  isCompact={isCompactMode}
                  detailMode={true}
                  onRefresh={refreshData}
                />
              } 
            />
          </Route>
          <Route
            path="directive-lab"
            element={
              <DirectiveLab
                state={state}
                onRefresh={refreshData}
                isCompact={isCompactMode}
              />
            }
          />
          <Route
            path="pr-reviews"
            element={
              <PRReviews
                state={state}
                isConnected={isConnected}
                refreshData={refreshData}
              />
            }
          />
          {/* 404 Fallback Route */}
          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;