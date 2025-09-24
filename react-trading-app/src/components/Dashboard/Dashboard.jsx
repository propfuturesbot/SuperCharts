import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FaSignOutAlt,
  FaUser,
  FaChartLine,
  FaCog,
  FaBolt,
  FaRocket,
  FaShieldAlt,
  FaDollarSign,
  FaChartBar,
  FaRobot
} from 'react-icons/fa';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const [activeStrategiesCount, setActiveStrategiesCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    } else {
      fetchStrategiesCount();
    }
  }, [isAuthenticated, navigate]);

  const fetchStrategiesCount = async () => {
    try {
      const response = await axios.get('http://localhost:8025/api/strategies');
      if (response.data.success && response.data.data) {
        // Count strategies with status 'active'
        const activeCount = response.data.data.filter(strategy => strategy.status === 'active').length;
        setActiveStrategiesCount(activeCount);
      }
    } catch (error) {
      console.error('Error fetching strategies:', error);
      // Keep default value of 0
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    {
      icon: <FaChartBar />,
      label: 'Dashboard',
      path: '/dashboard',
      active: location.pathname === '/dashboard'
    },
    {
      icon: <FaChartLine />,
      label: 'Strategies',
      path: '/strategies',
      active: location.pathname === '/strategies'
    }
  ];

  const quickActions = [
    {
      icon: <FaBolt />,
      title: 'Live Trading',
      description: 'Start automated trading with your configured strategies'
    },
    {
      icon: <FaShieldAlt />,
      title: 'Risk Management',
      description: 'Configure position sizing and risk parameters'
    },
    {
      icon: <FaChartBar />,
      title: 'Performance',
      description: 'Analyze your trading performance and metrics'
    },
    {
      icon: <FaRobot />,
      title: 'Trading Analytics',
      description: 'View detailed analytics and trading insights'
    }
  ];

  if (!user) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        Loading Dashboard...
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <motion.h1
            className="dashboard-logo"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            PROP FUTURES BOT
          </motion.h1>
          <div className="breadcrumb">Dashboard</div>
        </div>
        
        <div className="header-right">
          <motion.div 
            className="user-info"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="user-avatar">
              <FaUser />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                {user.provider.toUpperCase()}
              </div>
            </div>
          </motion.div>
          
          <motion.button 
            className="settings-button"
            onClick={() => navigate('/settings')}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <FaCog />
          </motion.button>

          <motion.button 
            className="logout-button"
            onClick={handleLogout}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <FaSignOutAlt />
            Logout
          </motion.button>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Sidebar */}
        <motion.aside 
          className="sidebar"
          initial={{ x: -280, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <div className="sidebar-header">
            <h2 className="sidebar-title">Navigation</h2>
            <p className="sidebar-subtitle">Trading Dashboard</p>
          </div>
          
          <nav className="sidebar-nav">
            <div className="nav-section">
              <h3 className="nav-section-title">Trading</h3>
              {navItems.map((item, index) => (
                <motion.div
                  key={item.path}
                  className={`nav-item ${item.active ? 'active' : ''}`}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 * index }}
                  whileHover={{ x: 5 }}
                  onClick={() => navigate(item.path)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </motion.div>
              ))}
            </div>
          </nav>
        </motion.aside>

        {/* Content Area */}
        <div className="content-area">
          <div className="content-wrapper">
            {/* Welcome Section */}
            <motion.section 
              className="welcome-section"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <h1 className="welcome-title">
                Welcome Back!
              </h1>
              <p className="welcome-text">
                Your trading system is ready. Monitor your strategies, analyze performance, 
                and optimize your trading approach with our advanced tools.
              </p>
              
              <div className="status-grid">
                <motion.div 
                  className="status-item"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                >
                  <div className="status-label">Active Strategies</div>
                  <div className="status-value">{activeStrategiesCount}</div>
                </motion.div>
                
                <motion.div 
                  className="status-item"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                >
                  <div className="status-label">System Status</div>
                  <div className="status-value">Online</div>
                </motion.div>
                
                <motion.div 
                  className="status-item"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                >
                  <div className="status-label">Provider</div>
                  <div className="status-value">{user.provider.toUpperCase()}</div>
                </motion.div>
                
                <motion.div 
                  className="status-item"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.7 }}
                >
                  <div className="status-label">Last Updated</div>
                  <div className="status-value">Now</div>
                </motion.div>
              </div>
            </motion.section>

            {/* Quick Actions */}
            <motion.section 
              className="quick-actions"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              {quickActions.map((action, index) => (
                <motion.div
                  key={index}
                  className="action-card"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.6 + (index * 0.1) }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="action-icon">{action.icon}</div>
                  <h3 className="action-title">{action.title}</h3>
                  <p className="action-description">{action.description}</p>
                </motion.div>
              ))}
            </motion.section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;