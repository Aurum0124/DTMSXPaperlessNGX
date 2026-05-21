/**
 * useConnectionState Hook
 * 
 * Manages API connection state and session management.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { testApiConnection } from '../services/api.js';
import { sessionManager } from '../services/session.js';

export function useConnectionState() {
  const navigate = useNavigate();
  // Connection State
  const [apiConnected, setApiConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');

  /**
   * Check API connection status
   */
  const checkConnection = useCallback(async () => {
    try {
      const connected = await testApiConnection();
      setApiConnected(connected);
      setConnectionError('');
      
      if (!connected) {
        setConnectionError('Unable to connect to backend server');
      }
      
      return connected;
    } catch (err) {
      setApiConnected(false);
      setConnectionError('Backend connection failed');
      console.error('Connection check failed:', err);
      return false;
    }
  }, []);

  /**
   * Validate session and redirect if needed
   */
  const validateSession = useCallback(() => {
    if (!sessionManager.isSessionValid()) {
      sessionManager.clearSession();
      window.location.href = '/login';
      return false;
    }
    
    sessionManager.updateActivity();
    return true;
  }, []);

  /**
   * Logout user and clear session
   */
  const logout = useCallback(() => {
    sessionManager.clearSession();
    setApiConnected(false);
    setConnectionError('');
    navigate('/login', { replace: true });
  }, [navigate]);

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  return {
    // State
    apiConnected,
    connectionError,
    
    // Actions
    checkConnection,
    validateSession,
    logout,
    
    // Setters
    setApiConnected,
    setConnectionError,
  };
} 