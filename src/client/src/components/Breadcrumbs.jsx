import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

function Breadcrumbs({ isCompact }) {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter(x => x);

  const routeNames = {
    'strategic-directives': 'Strategic Directives',
    'prds': 'PRDs',
    'handoffs': 'Handoffs',
    'context': 'Context Monitor',
    'progress': 'Progress Tracker'
  };

  return (
    <nav className={`flex items-center ${isCompact ? 'py-1 px-2' : 'py-2 px-4'}`}>
      <Link
        to="/"
        className="flex items-center text-purple-100 hover:text-white transition-colors drop-shadow-sm"
      >
        <Home className={isCompact ? 'w-3 h-3' : 'w-4 h-4'} />
        <span className={`${isCompact ? 'ml-1 text-xs' : 'ml-2 text-sm'}`}>Dashboard</span>
      </Link>

      {pathnames.map((pathname, index) => {
        const routeTo = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;
        const name = routeNames[pathname] || pathname;

        return (
          <React.Fragment key={pathname}>
            <ChevronRight className={`${isCompact ? 'w-3 h-3 mx-1' : 'w-4 h-4 mx-2'} text-purple-200`} />
            {isLast ? (
              <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-medium text-white drop-shadow-sm`}>
                {name}
              </span>
            ) : (
              <Link
                to={routeTo}
                className={`${isCompact ? 'text-xs' : 'text-sm'} text-purple-100 hover:text-white transition-colors drop-shadow-sm`}
              >
                {name}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export default Breadcrumbs;