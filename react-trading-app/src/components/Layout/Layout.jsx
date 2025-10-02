import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FaSignOutAlt,
  FaUser,
  FaChartLine,
  FaBook,
  FaChartBar,
  FaCalendarAlt,
  FaCode,
  FaCogs,
  FaNetworkWired
} from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';
import './Layout.css';

const Layout = ({ children, title = 'Dashboard', subtitle = '' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

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
      icon: <FaCalendarAlt />,
      label: 'Trading Schedule',
      path: '/trading-schedule',
      active: location.pathname === '/trading-schedule'
    },
    {
      icon: <FaCode />,
      label: 'Webhook Generator',
      path: '/webhook-generator',
      active: location.pathname === '/webhook-generator'
    },
    {
      icon: <FaCogs />,
      label: 'Trade Options',
      path: '/trade-options',
      active: location.pathname === '/trade-options'
    },
    {
      icon: <FaNetworkWired />,
      label: 'Traffic',
      path: '/traffic',
      active: location.pathname === '/traffic'
    }
  ];

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
            TradingBot
          </motion.h1>
          <div className="breadcrumb">{title}</div>
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
            className="docs-button"
            onClick={() => window.open('http://localhost:8025/api/docs', '_blank')}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="API Documentation"
          >
            <FaBook />
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
                <motion.button
                  key={item.path}
                  className={`nav-item ${item.active ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </motion.button>
              ))}
            </div>
          </nav>
        </motion.aside>

        {/* Content Area */}
        <motion.section 
          className="content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {children}
        </motion.section>
      </main>
    </div>
  );
};

export default Layout;