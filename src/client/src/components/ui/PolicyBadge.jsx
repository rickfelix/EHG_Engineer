/**
 * PolicyBadge Component
 * Displays policy badges with color coding and tooltips
 * Used in Step 5 Synthesis to show complexity/risk indicators
 */

import React, { useState } from 'react';
import { Info } from 'lucide-react';

const PolicyBadge = ({ type, level, showTooltip = true }) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  
  // Policy type configurations
  const policyConfig = {
    UI: {
      label: 'UI',
      description: 'User Interface complexity',
      colors: {
        HIGH: 'bg-blue-600 text-white',
        MEDIUM: 'bg-blue-400 text-white',
        LOW: 'bg-blue-200 text-blue-900'
      }
    },
    DB: {
      label: 'DB',
      description: 'Database impact and complexity',
      colors: {
        HIGH: 'bg-purple-600 text-white',
        MEDIUM: 'bg-purple-400 text-white',
        LOW: 'bg-purple-200 text-purple-900'
      }
    },
    COMPLEX: {
      label: 'COMPLEX',
      description: 'Overall implementation complexity',
      colors: {
        HIGH: 'bg-orange-600 text-white',
        MEDIUM: 'bg-orange-400 text-white',
        LOW: 'bg-orange-200 text-orange-900'
      }
    },
    ACCESS: {
      label: 'ACCESS',
      description: 'Access control and permissions',
      colors: {
        HIGH: 'bg-green-600 text-white',
        MEDIUM: 'bg-green-400 text-white',
        LOW: 'bg-green-200 text-green-900'
      }
    },
    SECURITY: {
      label: 'SECURITY',
      description: 'Security implications',
      colors: {
        HIGH: 'bg-red-600 text-white',
        MEDIUM: 'bg-red-400 text-white',
        LOW: 'bg-red-200 text-red-900'
      }
    },
    PROCESS: {
      label: 'PROCESS',
      description: 'Business process impact',
      colors: {
        HIGH: 'bg-yellow-600 text-white',
        MEDIUM: 'bg-yellow-400 text-gray-900',
        LOW: 'bg-yellow-200 text-yellow-900'
      }
    }
  };

  const config = policyConfig[type];
  if (!config) return null;
  
  const colorClass = config.colors[level] || config.colors.LOW;
  
  return (
    <div className="inline-flex items-center relative">
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass} cursor-help transition-opacity hover:opacity-90`}
        onMouseEnter={() => setIsTooltipVisible(true)}
        onMouseLeave={() => setIsTooltipVisible(false)}
      >
        {config.label}:{level}
        {showTooltip && (
          <Info className="w-3 h-3 ml-1 opacity-70" />
        )}
      </span>
      
      {showTooltip && isTooltipVisible && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
          <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
            <div className="font-semibold">{config.description}</div>
            <div className="text-gray-300 mt-1">
              {level === 'HIGH' && 'Significant impact - careful review needed'}
              {level === 'MEDIUM' && 'Moderate impact - standard review'}
              {level === 'LOW' && 'Minimal impact - routine change'}
            </div>
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
};

// Component to render all badges for an item
export const PolicyBadgeSet = ({ badges }) => {
  if (!badges) return null;
  
  const badgeTypes = ['UI', 'DB', 'COMPLEX', 'ACCESS', 'SECURITY', 'PROCESS'];
  
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {badgeTypes.map(type => {
        const level = badges[type];
        if (!level) return null;
        return <PolicyBadge key={type} type={type} level={level} />;
      })}
    </div>
  );
};

// Utility function to generate badges based on text analysis
export const generatePolicyBadges = (text) => {
  const badges = {};
  const lowerText = text.toLowerCase();
  
  // UI complexity
  if (lowerText.includes('ui') || lowerText.includes('interface') || lowerText.includes('component')) {
    badges.UI = lowerText.includes('complex') || lowerText.includes('major') ? 'HIGH' : 
                lowerText.includes('update') || lowerText.includes('modify') ? 'MEDIUM' : 'LOW';
  }
  
  // Database impact
  if (lowerText.includes('database') || lowerText.includes('schema') || lowerText.includes('migration')) {
    badges.DB = lowerText.includes('migration') || lowerText.includes('schema') ? 'HIGH' :
                lowerText.includes('query') || lowerText.includes('index') ? 'MEDIUM' : 'LOW';
  }
  
  // Overall complexity
  if (lowerText.includes('architecture') || lowerText.includes('refactor') || lowerText.includes('system')) {
    badges.COMPLEX = 'HIGH';
  } else if (lowerText.includes('feature') || lowerText.includes('implement')) {
    badges.COMPLEX = 'MEDIUM';
  } else if (lowerText.includes('fix') || lowerText.includes('update')) {
    badges.COMPLEX = 'LOW';
  }
  
  // Access control
  if (lowerText.includes('permission') || lowerText.includes('role') || lowerText.includes('access')) {
    badges.ACCESS = lowerText.includes('admin') || lowerText.includes('role') ? 'HIGH' : 'MEDIUM';
  }
  
  // Security
  if (lowerText.includes('security') || lowerText.includes('auth') || lowerText.includes('encrypt')) {
    badges.SECURITY = lowerText.includes('auth') || lowerText.includes('encrypt') ? 'HIGH' : 'MEDIUM';
  } else if (lowerText.includes('api') || lowerText.includes('endpoint')) {
    badges.SECURITY = 'LOW';
  }
  
  // Process impact
  if (lowerText.includes('workflow') || lowerText.includes('process') || lowerText.includes('business')) {
    badges.PROCESS = lowerText.includes('workflow') ? 'HIGH' : 'MEDIUM';
  }
  
  // Default LOW badges for common items
  if (Object.keys(badges).length === 0) {
    badges.COMPLEX = 'LOW';
  }
  
  return badges;
};

export default PolicyBadge;