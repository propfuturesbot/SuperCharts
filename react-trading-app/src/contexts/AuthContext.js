import React, { createContext, useState, useContext, useEffect } from 'react';
import authService from '../services/auth.service';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if user is already logged in
    if (authService.isAuthenticated()) {
      setUser({
        username: authService.getUsername(),
        provider: authService.getProvider()
      });
    }
    setLoading(false);
  }, []);

  const login = async (username, credential, provider, rememberMe = false, usePassword = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.login(username, credential, provider, rememberMe, usePassword);
      setUser({
        username: result.username,
        provider: result.provider
      });
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setError(null);
  };

  const value = {
    user,
    login,
    logout,
    loading,
    error,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};