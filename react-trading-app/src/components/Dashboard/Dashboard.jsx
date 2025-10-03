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
  FaRobot,
  FaCalendarAlt,
  FaCode,
  FaCogs,
  FaNetworkWired,
  FaBook,
  FaSync
} from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAuthenticated } = useAuth();

  // State for accounts and positions
  const [selectedAccount, setSelectedAccount] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [positions, setPositions] = useState([]);
  const [accountInfo, setAccountInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  // State for chart data
  const [dailyPnlData, setDailyPnlData] = useState([]);
  const [profitLossDistribution, setProfitLossDistribution] = useState([]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    } else {
      fetchAccounts();
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (selectedAccount) {
      fetchPositions(selectedAccount);
      fetchAccountInfo(selectedAccount);
    }
  }, [selectedAccount]);

  // Fetch accounts from backend
  const fetchAccounts = async () => {
    try {
      const response = await axios.get('/api/accounts/file');
      if (response.data.success && response.data.data.accounts) {
        const accountList = response.data.data.accounts;
        setAccounts(accountList);

        // Auto-select first tradable account
        const tradableAccount = accountList.find(acc => acc.canTrade);
        if (tradableAccount) {
          setSelectedAccount(tradableAccount.name);
        }
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  // Fetch positions for selected account
  const fetchPositions = async (accountName) => {
    if (!accountName) return;

    try {
      setLoading(true);
      const response = await axios.get(`/api/positions/${accountName}`);
      if (response.data.success) {
        setPositions(response.data.positions || []);
      }
    } catch (error) {
      console.error('Error fetching positions:', error);
      setPositions([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch account info (P&L, balance, etc.)
  const fetchAccountInfo = async (accountName) => {
    if (!accountName) return;

    try {
      const response = await axios.get(`/api/profit-loss/account/${accountName}`);
      if (response.data.success) {
        setAccountInfo(response.data.tradingAccount);
      }
    } catch (error) {
      console.error('Error fetching account info:', error);
      setAccountInfo(null);
    }
  };

  // Handle account change
  const handleAccountChange = (event) => {
    setSelectedAccount(event.target.value);
  };

  // Refresh data
  const handleRefresh = () => {
    if (selectedAccount) {
      fetchPositions(selectedAccount);
      fetchAccountInfo(selectedAccount);
    }
  };

  // Format currency
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  // Format percentage
  const formatPercentage = (value) => {
    if (value === null || value === undefined) return '0.00%';
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  // Format datetime
  const formatDateTime = (timestamp) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  // Get position type text based on position size
  const getPositionType = (positionSize) => {
    return positionSize > 0 ? 'Long' : positionSize < 0 ? 'Short' : 'Unknown';
  };

  // Generate chart data based on account info
  useEffect(() => {
    if (accountInfo) {
      generateChartData();
    }
  }, [accountInfo]);

  const generateChartData = () => {
    // Generate daily P&L data for the last 7 days
    // Note: Provider API doesn't expose historical P&L, so we show current open P&L for today
    // and zero for previous days
    const dailyData = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      // Show current open P&L for today, zero for past days (no historical data available)
      const isToday = i === 0;
      const pnl = isToday && accountInfo ? accountInfo.openPnl : 0;

      dailyData.push({
        date: dateStr,
        pnl: parseFloat(pnl.toFixed(2)),
        trades: isToday ? 1 : 0
      });
    }

    setDailyPnlData(dailyData);

    // Generate profit/loss distribution from account data
    // Note: Provider API doesn't expose win rate or trade counts
    // Show 50/50 split as placeholder when no real data is available
    if (accountInfo) {
      const winRate = accountInfo.winRate || 0.5;
      const totalTrades = accountInfo.totalTrades || 0;

      if (totalTrades > 0) {
        const profitableTrades = Math.round(totalTrades * winRate);
        const losingTrades = totalTrades - profitableTrades;

        setProfitLossDistribution([
          { name: 'Profitable Trades', value: profitableTrades, color: '#4ade80' },
          { name: 'Losing Trades', value: losingTrades, color: '#f87171' }
        ]);
      } else {
        // Show placeholder data when no trade history available
        setProfitLossDistribution([
          { name: 'No Trade Data', value: 1, color: '#888' }
        ]);
      }
    }
  };

  const handleLogout = async () => {
    await logout();
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
            WebhookBot
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
            className="docs-button"
            onClick={() => window.open('http://localhost:9025/api/docs', '_blank')}
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
            <p className="sidebar-subtitle">Webhook Bot Dashboard</p>
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
                Your webhook bot is ready. Configure webhooks, manage contracts,
                and monitor your automated trading system.
              </p>

              <div className="status-grid">
                <motion.div
                  className="status-item"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                >
                  <div className="status-label">Webhook Status</div>
                  <div className="status-value">Active</div>
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

            {/* Account Selection & Balance Section */}
            <motion.section
              className="account-section"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <div className="account-header">
                <h2>Account Overview</h2>
                <button className="refresh-btn" onClick={handleRefresh} title="Refresh Data">
                  <FaSync /> Refresh
                </button>
              </div>

              <div className="account-details">
                <div className="account-selector">
                  <label>SELECT ACCOUNT:</label>
                  <select value={selectedAccount} onChange={handleAccountChange}>
                    <option value="">-- Select Account --</option>
                    {accounts.filter(acc => acc.canTrade).map(acc => (
                      <option key={acc.id} value={acc.name}>
                        {acc.name} ({formatCurrency(acc.balance)})
                      </option>
                    ))}
                  </select>
                </div>

                {accountInfo && (
                  <div className="balance-cards">
                    <div className="balance-card">
                      <div className="balance-card-label">CURRENT BALANCE</div>
                      <div className={`balance-card-value ${accountInfo.balance >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(accountInfo.balance)}
                      </div>
                    </div>
                    <div className="balance-card">
                      <div className="balance-card-label">OPEN P&L</div>
                      <div className={`balance-card-value ${accountInfo.openPnl >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(accountInfo.openPnl)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.section>

            {/* P&L Metrics Section */}
            {accountInfo && (
              <motion.section
                className="pnl-section"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                <h3>Performance Metrics</h3>
                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-label">Daily P&L</div>
                    <div className={`metric-value ${accountInfo.realizedDayPnl >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(accountInfo.realizedDayPnl)}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">Total P&L</div>
                    <div className={`metric-value ${accountInfo.profitAndLoss >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(accountInfo.profitAndLoss)}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">Open P&L</div>
                    <div className={`metric-value ${accountInfo.openPnl >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(accountInfo.openPnl)}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">Win Rate</div>
                    <div className="metric-value">
                      {formatPercentage(accountInfo.winRate)}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">Total Trades</div>
                    <div className="metric-value">
                      {accountInfo.totalTrades || 0}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">Starting Balance</div>
                    <div className="metric-value">
                      {formatCurrency(accountInfo.startingBalance)}
                    </div>
                  </div>
                </div>
              </motion.section>
            )}

            {/* Charts Section */}
            {accountInfo && dailyPnlData.length > 0 && (
              <motion.section
                className="charts-section"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.7 }}
              >
                <div className="charts-grid">
                  {/* Daily P&L Bar Chart */}
                  <div className="chart-container">
                    <h4>Daily P&L Breakdown</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dailyPnlData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                          dataKey="date"
                          stroke="#888"
                          style={{ fontSize: '12px' }}
                        />
                        <YAxis
                          stroke="#888"
                          style={{ fontSize: '12px' }}
                          tickFormatter={(value) => `$${value}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1a1a1a',
                            border: '1px solid #333',
                            borderRadius: '8px',
                            color: '#fff'
                          }}
                          formatter={(value) => [`$${value.toFixed(2)}`, 'P&L']}
                        />
                        <Bar
                          dataKey="pnl"
                          fill="#4ade80"
                          radius={[8, 8, 0, 0]}
                        >
                          {dailyPnlData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.pnl >= 0 ? '#4ade80' : '#f87171'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Profit vs Loss Pie Chart */}
                  {profitLossDistribution.length > 0 && (
                    <div className="chart-container">
                      <h4>Trade Distribution</h4>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={profitLossDistribution}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {profitLossDistribution.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#1a1a1a',
                              border: '1px solid #333',
                              borderRadius: '8px',
                              color: '#fff'
                            }}
                          />
                          <Legend
                            wrapperStyle={{ color: '#fff', fontSize: '12px' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </motion.section>
            )}

            {/* Positions Table Section */}
            {selectedAccount && (
              <motion.section
                className="positions-section"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.7 }}
              >
                <h3>Open Positions</h3>
                {loading ? (
                  <div className="loading-state">Loading positions...</div>
                ) : positions.length === 0 ? (
                  <div className="no-positions">No open positions</div>
                ) : (
                  <div className="table-wrapper">
                    <table className="positions-table">
                      <thead>
                        <tr>
                          <th>Position ID</th>
                          <th>Symbol</th>
                          <th>Type</th>
                          <th>Size</th>
                          <th>Avg Price</th>
                          <th>P&L</th>
                          <th>Entry Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map(pos => (
                          <tr key={pos.id}>
                            <td>{pos.id}</td>
                            <td className="symbol-cell">{pos.symbolName || pos.contractId}</td>
                            <td>
                              <span className={`position-type ${pos.positionSize > 0 ? 'long' : 'short'}`}>
                                {getPositionType(pos.positionSize)}
                              </span>
                            </td>
                            <td className={pos.positionSize >= 0 ? 'positive' : 'negative'}>{Math.abs(pos.positionSize)}</td>
                            <td>{formatCurrency(pos.averagePrice)}</td>
                            <td className={pos.profitAndLoss >= 0 ? 'positive' : 'negative'}>
                              {formatCurrency(pos.profitAndLoss)}
                            </td>
                            <td>{formatDateTime(pos.entryTime)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;