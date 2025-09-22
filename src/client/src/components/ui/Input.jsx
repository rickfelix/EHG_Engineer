/**
 * Unified Input Component
 * Provides consistent form input styling with validation states
 * Supports text inputs, textareas, and selects with real-time feedback
 */

import React, { useState, useEffect } from 'react';
import { Check, X, AlertCircle, Info } from 'lucide-react';

const Input = ({
  type = 'text',
  label,
  name,
  value,
  onChange,
  onBlur,
  placeholder,
  required = false,
  disabled = false,
  error,
  success,
  helpText,
  validationPattern,
  minLength,
  maxLength,
  rows = 4,
  options = [], // For select inputs
  autoComplete,
  className = '',
  fullWidth = true,
  showCharCount = false,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [internalError, setInternalError] = useState('');

  // Validate input on change
  useEffect(() => {
    if (isDirty && validationPattern) {
      const regex = new RegExp(validationPattern);
      if (!regex.test(value)) {
        setInternalError('Invalid format');
      } else {
        setInternalError('');
      }
    }
  }, [value, validationPattern, isDirty]);

  // Base input styles
  const baseInputStyles = `
    w-full px-4 py-3 
    border rounded-lg transition-all duration-200
    text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400
    min-h-[48px]
    focus:outline-none focus:ring-2 focus:ring-offset-1
    disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60
    bg-white dark:bg-gray-700
  `;

  // State-based styles
  const getStateStyles = () => {
    if (error || internalError) {
      return 'border-red-500 dark:border-red-400 focus:ring-red-500 dark:focus:ring-red-400 focus:border-red-500 dark:focus:border-red-400';
    }
    if (success) {
      return 'border-green-500 dark:border-green-400 focus:ring-green-500 dark:focus:ring-green-400 focus:border-green-500 dark:focus:border-green-400';
    }
    if (isFocused) {
      return 'border-blue-500 dark:border-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400';
    }
    return 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400';
  };

  const inputClassName = `${baseInputStyles} ${getStateStyles()} ${className}`;

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    setIsDirty(true);
    if (onBlur) onBlur(e);
  };

  const handleChange = (e) => {
    if (onChange) onChange(e);
    if (!isDirty) setIsDirty(true);
  };

  // Generate unique ID for accessibility
  const inputId = `input-${name || Math.random().toString(36).substr(2, 9)}`;
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;

  const renderInput = () => {
    switch (type) {
      case 'textarea':
        return (
          <textarea
            id={inputId}
            name={name}
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            rows={rows}
            minLength={minLength}
            maxLength={maxLength}
            className={inputClassName}
            aria-invalid={!!(error || internalError)}
            aria-describedby={`${error || internalError ? errorId : ''} ${helpText ? helpId : ''}`}
            {...props}
          />
        );
      
      case 'select':
        return (
          <select
            id={inputId}
            name={name}
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            required={required}
            disabled={disabled}
            className={inputClassName}
            aria-invalid={!!(error || internalError)}
            aria-describedby={`${error || internalError ? errorId : ''} ${helpText ? helpId : ''}`}
            {...props}
          >
            <option value="">Select an option</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      
      default:
        return (
          <input
            id={inputId}
            type={type}
            name={name}
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            minLength={minLength}
            maxLength={maxLength}
            autoComplete={autoComplete}
            className={inputClassName}
            aria-invalid={!!(error || internalError)}
            aria-describedby={`${error || internalError ? errorId : ''} ${helpText ? helpId : ''}`}
            {...props}
          />
        );
    }
  };

  const containerWidth = fullWidth ? 'w-full' : '';

  return (
    <div className={`${containerWidth} mb-4`}>
      {label && (
        <label 
          htmlFor={inputId}
          className="block mb-2 font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      
      <div className="relative">
        {renderInput()}
        
        {/* Status icons */}
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
          {success && !error && !internalError && (
            <Check className="w-5 h-5 text-green-500" aria-label="Valid input" />
          )}
          {(error || internalError) && (
            <X className="w-5 h-5 text-red-500" aria-label="Invalid input" />
          )}
        </div>
      </div>

      {/* Character count */}
      {showCharCount && maxLength && (
        <div className="mt-1 text-sm text-right text-gray-500 dark:text-gray-400">
          {value?.length || 0} / {maxLength}
        </div>
      )}

      {/* Error message */}
      {(error || internalError) && (
        <div id={errorId} className="mt-2 flex items-start text-sm text-red-600 dark:text-red-400" role="alert">
          <AlertCircle className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" />
          {error || internalError}
        </div>
      )}

      {/* Help text */}
      {helpText && !(error || internalError) && (
        <div id={helpId} className="mt-2 flex items-start text-sm text-gray-600 dark:text-gray-400">
          <Info className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" />
          {helpText}
        </div>
      )}
    </div>
  );
};

export default Input;