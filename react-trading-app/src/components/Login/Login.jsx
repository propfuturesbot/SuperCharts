import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaUser, FaKey, FaServer, FaEye, FaEyeSlash, FaExclamationCircle, FaCheckCircle, FaTrash } from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';
import { PROVIDERS } from '../../config/providers';
import authService from '../../services/auth.service';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, loading: authLoading, error: authError } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    apiKey: '',
    provider: 'topstepx'
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    // Load saved credentials if available
    const loadSavedCredentials = () => {
      const savedCredentials = authService.getSavedCredentials();
      if (savedCredentials) {
        setFormData({
          username: savedCredentials.username,
          apiKey: savedCredentials.apiKey,
          provider: savedCredentials.provider
        });
        setRememberMe(true);
        setHasSavedCredentials(true);
        setSuccess('Saved credentials loaded successfully!');
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setHasSavedCredentials(false);
      }
    };

    loadSavedCredentials();
  }, []);

  useEffect(() => {
    // Generate floating particles
    const particleContainer = document.querySelector('.login-bg');
    if (particleContainer) {
      for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 20 + 's';
        particle.style.animationDuration = (15 + Math.random() * 10) + 's';
        particleContainer.appendChild(particle);
      }
    }

    return () => {
      // Cleanup particles
      const particles = document.querySelectorAll('.particle');
      particles.forEach(p => p.remove());
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear errors when user types
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.username || !formData.apiKey) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await login(formData.username, formData.apiKey, formData.provider, rememberMe);
      
      if (result.success) {
        setSuccess('Login successful! Redirecting...');
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
      } else {
        setError(result.error || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClearCredentials = () => {
    authService.clearSavedCredentials();
    setFormData({
      username: '',
      apiKey: '',
      provider: 'topstepx'
    });
    setRememberMe(false);
    setHasSavedCredentials(false);
    setSuccess('Saved credentials cleared successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="login-container">
      <div className="login-bg">
        <div className="grid-overlay"></div>
      </div>
      
      <motion.div
        className="login-card"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="login-card-inner">
          <motion.h1 
            className="login-title"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Trading System
          </motion.h1>
          
          <motion.p 
            className="login-subtitle"
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Access Your Trading Dashboard
          </motion.p>

          <form className="login-form" onSubmit={handleSubmit}>
            <motion.div 
              className="form-group"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <label className="form-label">
                <FaUser />
                Username
              </label>
              <input
                type="text"
                name="username"
                className="form-input"
                placeholder="Enter your username"
                value={formData.username}
                onChange={handleChange}
                disabled={loading}
                autoComplete="username"
              />
            </motion.div>

            <motion.div 
              className="form-group"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <label className="form-label">
                <FaKey />
                API Key
              </label>
              <div className="input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="apiKey"
                  className="form-input"
                  placeholder="Enter your API key"
                  value={formData.apiKey}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={togglePasswordVisibility}
                  tabIndex={-1}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </motion.div>

            <motion.div 
              className="form-group"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <label className="form-label">
                <FaServer />
                Provider
              </label>
              <select
                name="provider"
                className="form-select"
                value={formData.provider}
                onChange={handleChange}
                disabled={loading}
              >
                {Object.entries(PROVIDERS).map(([key, provider]) => (
                  <option key={key} value={key}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </motion.div>

            {/* Remember Me and Clear Credentials */}
            <motion.div 
              className="form-group remember-section"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <div className="remember-controls">
                <label className="remember-checkbox">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={loading}
                  />
                  <span className="checkmark"></span>
                  Remember my credentials
                </label>
                
                {hasSavedCredentials && (
                  <button
                    type="button"
                    className="clear-credentials-btn"
                    onClick={handleClearCredentials}
                    disabled={loading}
                    title="Clear saved credentials"
                  >
                    <FaTrash />
                    Clear Saved
                  </button>
                )}
              </div>
            </motion.div>

            {error && (
              <motion.div 
                className="error-message"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <FaExclamationCircle />
                {error}
              </motion.div>
            )}

            {success && (
              <motion.div 
                className="success-message"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <FaCheckCircle />
                {success}
              </motion.div>
            )}

            <motion.button
              type="submit"
              className="submit-button"
              disabled={loading || !formData.username || !formData.apiKey}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Authenticating...
                </>
              ) : (
                'Login'
              )}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;