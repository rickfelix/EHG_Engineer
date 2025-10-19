import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { 
  Home, 
  FileText, 
  GitBranch, 
  Activity, 
  Gauge, 
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Settings,
  Maximize2,
  Minimize2,
  Menu,
  X
} from 'lucide-react';
import Breadcrumbs from './Breadcrumbs';
import DarkModeToggle from './DarkModeToggle';

function AppLayout({ 
  state, 
  isConnected, 
  isSidebarCollapsed, 
  setIsSidebarCollapsed,
  isCompactMode,
  setIsCompactMode,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  updateChecklist,
  requestHandoff,
  compactContext,
  refreshData,
  setActiveSD
}) {
  const location = useLocation();
  
  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard', tooltip: 'Dashboard' },
    { path: '/strategic-directives', icon: FileText, label: 'Strategic Directives', tooltip: 'SDs' },
    { path: '/prds', icon: FileText, label: 'PRDs', tooltip: 'PRDs' },
    { path: '/handoffs', icon: GitBranch, label: 'Handoffs', tooltip: 'Handoffs' },
    { path: '/context', icon: Gauge, label: 'Context Monitor', tooltip: 'Context' },
    { path: '/progress', icon: Activity, label: 'Progress Tracker', tooltip: 'Progress' }
  ];

  const sidebarWidth = isSidebarCollapsed ? 'w-16' : 'w-64';
  const contentPadding = isCompactMode ? 'p-2' : 'p-6';

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 relative">
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="mobile-menu-button fixed top-4 left-4 z-50 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg md:hidden"
      >
        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:static inset-y-0 left-0 ${sidebarWidth} bg-white dark:bg-gray-800 shadow-lg 
        transform transition-all duration-300 z-50 flex flex-col
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className={`${isCompactMode ? 'p-2' : 'p-4'} border-b border-gray-200 dark:border-gray-700`}>
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!isSidebarCollapsed && (
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">
                LEO Protocol
              </h1>
            )}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden md:block p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>
          </div>
          {!isSidebarCollapsed && (
            <>
              <div className="mt-2 flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <span className="text-xs px-2 py-1 bg-primary-100 text-primary-800 rounded-full inline-block mt-2">
                v{state.leoProtocol.version}
              </span>
            </>
          )}
        </div>

        <nav className={`flex-1 ${isCompactMode ? 'p-2' : 'p-4'}`}>
          <ul className="space-y-1">
            {navItems.map(({ path, icon: Icon, label, tooltip }) => (
              <li key={path}>
                <NavLink
                  to={path}
                  className={({ isActive }) =>
                    `flex items-center ${isCompactMode ? 'p-1.5' : 'p-2'} rounded-lg transition-colors group relative ${
                      isActive
                        ? 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`
                  }
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon className={`${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'} ${isSidebarCollapsed ? '' : 'mr-3'}`} />
                  {!isSidebarCollapsed && <span className={isCompactMode ? 'text-sm' : ''}>{label}</span>}
                  {isSidebarCollapsed && (
                    <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                      {tooltip}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Settings section */}
        <div className={`border-t border-gray-200 dark:border-gray-700 ${isCompactMode ? 'p-2' : 'p-4'}`}>
          <button
            onClick={() => setIsCompactMode(!isCompactMode)}
            className={`w-full flex items-center ${isCompactMode ? 'p-1.5' : 'p-2'} rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors group relative`}
            title={isCompactMode ? 'Standard view' : 'Compact view'}
          >
            {isCompactMode ? 
              <Maximize2 className={`${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'} ${isSidebarCollapsed ? '' : 'mr-3'}`} /> : 
              <Minimize2 className={`${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'} ${isSidebarCollapsed ? '' : 'mr-3'}`} />
            }
            {!isSidebarCollapsed && <span className={isCompactMode ? 'text-sm' : ''}>
              {isCompactMode ? 'Standard View' : 'Compact View'}
            </span>}
            {isSidebarCollapsed && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {isCompactMode ? 'Standard' : 'Compact'}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Breadcrumbs and Dark Mode Toggle */}
        <div className="flex items-center justify-between bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex-1">
            <Breadcrumbs isCompact={isCompactMode} />
          </div>
          <div className="flex items-center px-4 py-2">
            <DarkModeToggle />
          </div>
        </div>
        
        {/* Page content */}
        <main className={`flex-1 overflow-y-auto ${contentPadding}`}>
          <Outlet context={{ 
            state, 
            isCompactMode,
            updateChecklist,
            requestHandoff,
            compactContext,
            refreshData
          }} />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;