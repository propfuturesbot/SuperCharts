import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaEye, FaSync, FaFilter, FaRedo } from 'react-icons/fa';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import Layout from '../Layout/Layout';
import RequestDetailModal from './RequestDetailModal';
import axios from 'axios';
import './Traffic.css';

const Traffic = () => {
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    category: '',
    status: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0
  });

  // Fetch logs from API
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
        ...(filters.category && { category: filters.category }),
        ...(filters.status && { status: filters.status })
      });

      const response = await axios.get(`/api/traffic/logs?${params}`);

      if (response.data.success) {
        setLogs(response.data.data);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total,
          totalPages: response.data.pagination.totalPages
        }));
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch metrics from API
  const fetchMetrics = async () => {
    try {
      const params = new URLSearchParams({
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate })
      });

      const response = await axios.get(`/api/traffic/metrics?${params}`);

      if (response.data.success) {
        setMetrics(response.data.metrics);
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  };

  // Load data on mount and when filters/pagination change
  useEffect(() => {
    fetchLogs();
    fetchMetrics();
  }, [pagination.page, pagination.limit]);

  // Apply filters
  const handleFilter = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchLogs();
    fetchMetrics();
  };

  // Reset filters
  const handleReset = () => {
    setFilters({
      startDate: '',
      endDate: '',
      category: '',
      status: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
    setTimeout(() => {
      fetchLogs();
      fetchMetrics();
    }, 0);
  };

  // Refresh data
  const handleRefresh = () => {
    fetchLogs();
    fetchMetrics();
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    try {
      return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss');
    } catch {
      return timestamp;
    }
  };

  // Format time in GMT
  const formatGMTTime = (timestamp) => {
    try {
      const date = new Date(timestamp);
      return date.toUTCString().split(' ')[4]; // Returns HH:MM:SS
    } catch {
      return '-';
    }
  };

  // Prepare chart data
  const pieChartData = metrics ? [
    { name: 'Success', value: metrics.successCount, color: '#4ade80' },
    { name: 'Error', value: metrics.errorCount, color: '#f87171' }
  ] : [];

  return (
    <Layout title="Traffic Monitoring" subtitle="Monitor API requests and responses">
      <div className="traffic-container">
        {/* Filters Section */}
        <motion.div
          className="traffic-filters"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="filter-section">
            <h3>REQUEST DETAILS</h3>
            <div className="filter-inputs">
              <div className="date-filters">
                <label>
                  FROM:
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  />
                </label>
                <label>
                  TO:
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  />
                </label>
              </div>

              <button className="filter-button" onClick={handleFilter}>
                <FaFilter /> FILTER
              </button>
              <button className="reset-button" onClick={handleReset}>
                <FaRedo /> RESET
              </button>
              <button className="refresh-button" onClick={handleRefresh}>
                <FaSync /> REFRESH DASHBOARD
              </button>
            </div>
          </div>
        </motion.div>

        {/* Metrics and Charts */}
        <div className="traffic-metrics-row">
          {/* Performance Summary */}
          <motion.div
            className="metrics-card"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h3>PERFORMANCE SUMMARY</h3>
            {metrics && (
              <>
                <div className="metrics-grid">
                  <div className="metric-item">
                    <div className="metric-label">Total Requests</div>
                    <div className="metric-value">{metrics.totalRequests}</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-label">Success Rate</div>
                    <div className="metric-value">{metrics.successRate}%</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-label">Avg Time</div>
                    <div className="metric-value">{metrics.avgTime}ms</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-label">Fastest</div>
                    <div className="metric-value">{metrics.fastest}ms</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-label">Slowest</div>
                    <div className="metric-value">{metrics.slowest}ms</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-label">Buy Avg</div>
                    <div className="metric-value">{metrics.buyAvg}ms</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-label">Sell Avg</div>
                    <div className="metric-value">{metrics.sellAvg}ms</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-label">Close Avg</div>
                    <div className="metric-value">{metrics.closeAvg}ms</div>
                  </div>
                </div>

                {/* Charts */}
                <div className="charts-row">
                  <div className="chart-container">
                    <h4>Request Success Rate</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="value"
                          label
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="chart-container">
                    <h4>Average Request Duration by Hour</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={metrics.hourlyDistribution || []} barSize={30}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="hour" stroke="#a78bfa" />
                        <YAxis stroke="#a78bfa" />
                        <Tooltip
                          contentStyle={{ background: '#1a1a1a', border: '1px solid #a78bfa' }}
                          labelStyle={{ color: '#a78bfa' }}
                        />
                        <Bar dataKey="avgDuration" fill="#a78bfa" name="Avg Duration (ms)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </div>

        {/* Traffic Table */}
        <motion.div
          className="traffic-table-container"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="table-wrapper">
            <table className="traffic-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>WEBHOOK ALERT<br/>RECEIVED TIME (GMT)</th>
                  <th>ACCOUNT</th>
                  <th>SIDE</th>
                  <th>SYMBOL</th>
                  <th>QTY</th>
                  <th>LATENCY</th>
                  <th>STATUS</th>
                  <th>PRICE</th>
                  <th>REQUEST/RESPONSE</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="10" className="loading-cell">Loading...</td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="empty-cell">No traffic data available</td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatTimestamp(log.timestamp).split(' ')[0]}</td>
                      <td>{formatGMTTime(log.timestamp)}</td>
                      <td className="account-cell">{log.accountName}</td>
                      <td>
                        <span className={`action-badge action-${log.action?.toLowerCase()}`}>
                          {log.action}
                        </span>
                      </td>
                      <td>{log.symbol}</td>
                      <td>{log.quantity || '-'}</td>
                      <td>{log.latency ? `${log.latency}ms` : '-'}</td>
                      <td>
                        <span className={`status-badge status-${log.status?.toLowerCase()}`}>
                          {log.status}
                        </span>
                      </td>
                      <td>{log.price || '-'}</td>
                      <td>
                        <button
                          className="view-button"
                          onClick={() => setSelectedLog(log)}
                        >
                          <FaEye /> View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pagination">
            <span className="pagination-info">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} items)
            </span>
            <div className="pagination-buttons">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
                disabled={pagination.page === 1}
              >
                «
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
              >
                ‹
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
              >
                ›
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: pagination.totalPages }))}
                disabled={pagination.page === pagination.totalPages}
              >
                »
              </button>
            </div>
          </div>
        </motion.div>

        {/* Request Detail Modal */}
        {selectedLog && (
          <RequestDetailModal
            log={selectedLog}
            onClose={() => setSelectedLog(null)}
          />
        )}
      </div>
    </Layout>
  );
};

export default Traffic;
