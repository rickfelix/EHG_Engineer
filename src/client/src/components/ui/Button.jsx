/**
 * Unified Button Component
 * Provides consistent button styling with 3 variants: primary, secondary, ghost
 * Ensures accessibility and consistent interaction patterns
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'medium',
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  fullWidth = false,
  icon: Icon,
  iconPosition = 'left',
  ariaLabel,
  className = '',
  ...props
}) => {
  // Base styles - consistent for all buttons
  const baseStyles = `
    inline-flex items-center justify-center
    font-medium transition-all duration-200
    rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    min-h-[44px] min-w-[44px]
  `;

  // Size variants
  const sizeStyles = {
    small: 'px-3 py-1.5 text-sm',
    medium: 'px-6 py-3 text-base',
    large: 'px-8 py-4 text-lg'
  };

  // Visual variants
  const variantStyles = {
    primary: `
      bg-blue-600 dark:bg-blue-600 text-white dark:text-white
      hover:bg-blue-700 dark:hover:bg-blue-700 active:bg-blue-800 dark:active:bg-blue-800
      focus:ring-blue-500 dark:focus:ring-blue-400
    `,
    secondary: `
      bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100
      hover:bg-gray-300 dark:hover:bg-gray-600 active:bg-gray-400 dark:active:bg-gray-500
      focus:ring-gray-500 dark:focus:ring-gray-400
    `,
    ghost: `
      bg-transparent dark:bg-transparent text-gray-700 dark:text-gray-300
      hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700
      focus:ring-gray-500 dark:focus:ring-gray-400
    `,
    danger: `
      bg-red-600 dark:bg-red-600 text-white dark:text-white
      hover:bg-red-700 dark:hover:bg-red-700 active:bg-red-800 dark:active:bg-red-800
      focus:ring-red-500 dark:focus:ring-red-400
    `,
    success: `
      bg-green-600 dark:bg-green-600 text-white dark:text-white
      hover:bg-green-700 dark:hover:bg-green-700 active:bg-green-800 dark:active:bg-green-800
      focus:ring-green-500 dark:focus:ring-green-400
    `
  };

  const widthStyles = fullWidth ? 'w-full' : '';

  const combinedClassName = `
    ${baseStyles}
    ${sizeStyles[size]}
    ${variantStyles[variant]}
    ${widthStyles}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  const handleClick = (e) => {
    if (!disabled && !loading && onClick) {
      onClick(e);
    }
  };

  return (
    <button
      type={type}
      className={combinedClassName}
      disabled={disabled || loading}
      onClick={handleClick}
      aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
      aria-busy={loading}
      aria-disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {!loading && Icon && iconPosition === 'left' && <Icon className="w-4 h-4 mr-2" />}
      {children}
      {!loading && Icon && iconPosition === 'right' && <Icon className="w-4 h-4 ml-2" />}
    </button>
  );
};

export default Button;