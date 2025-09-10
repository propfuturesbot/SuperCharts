import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './components/Login/Login';
import Dashboard from './components/Dashboard/Dashboard';
import StrategyManagement from './components/StrategyManagement/StrategyManagement';
import ThemeCustomizer from './components/ThemeCustomizer/ThemeCustomizer';
import './App.css';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="App">
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              
              {/* Protected routes */}
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/strategies" 
                element={
                  <ProtectedRoute>
                    <StrategyManagement />
                  </ProtectedRoute>
                } 
              />
              
              {/* Default route - redirect to dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              
              {/* Catch all route - redirect to dashboard */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            
            {/* Theme Customizer - Available on all pages */}
            <ThemeCustomizer />
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;