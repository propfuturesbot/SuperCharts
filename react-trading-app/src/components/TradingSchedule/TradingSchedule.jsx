import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FaClock,
  FaGlobe,
  FaCheckCircle,
  FaTimesCircle,
  FaSave,
  FaCalendarAlt,
  FaChartLine,
  FaPlus,
  FaDownload,
  FaTrash
} from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../Layout/Layout';
import './TradingSchedule.css';

const TradingSchedule = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Trading Hours State
  const [startHour, setStartHour] = useState(0);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState(23);
  const [endMinute, setEndMinute] = useState(59);
  const [restrictHours, setRestrictHours] = useState(false);

  // Trading Sessions State
  const [sessionsEnabled, setSessionsEnabled] = useState(false);
  const [allowedSessions, setAllowedSessions] = useState([]);
  const [restrictedSessions, setRestrictedSessions] = useState([]);

  // Economic Calendar State
  const [events, setEvents] = useState([]);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [impactFilter, setImpactFilter] = useState('ALL');
  const [showRestrictionModal, setShowRestrictionModal] = useState(false);
  const [restrictionBeforeMinutes, setRestrictionBeforeMinutes] = useState(30);
  const [restrictionAfterMinutes, setRestrictionAfterMinutes] = useState(30);

  // Status State
  const [tradingAllowed, setTradingAllowed] = useState(true);
  const [currentTimeGMT, setCurrentTimeGMT] = useState('--:--');
  const [currentTimeLocal, setCurrentTimeLocal] = useState('--:--:--');
  const [activeSessions, setActiveSessions] = useState([]);

  // UI State
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(true);

  // Predefined sessions
  const predefinedSessions = {
    '2300-0800': 'Asia (Tokyo)',
    '0700-1600': 'Europe (London)',
    '1200-2100': 'U.S. (New York)',
    '0700-0800': 'Asia↔London Overlap',
    '1200-1600': 'London↔New York Overlap'
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    loadTradingStatus();
    loadSessionsConfig();
    loadEconomicCalendarConfig();

    const statusInterval = setInterval(loadTradingStatus, 30000);
    const timeInterval = setInterval(updateTimeDisplay, 1000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(timeInterval);
    };
  }, []);

  const updateTimeDisplay = () => {
    const now = new Date();
    const gmtTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;
    const localTime = now.toLocaleTimeString();

    setCurrentTimeGMT(gmtTime);
    setCurrentTimeLocal(localTime);
  };

  const loadTradingStatus = async () => {
    try {
      const response = await fetch('/api/trading-hours/status');
      const data = await response.json();

      if (data.success) {
        setTradingAllowed(data.trading_allowed);
        setCurrentTimeGMT(data.current_time_gmt);
        setCurrentTimeLocal(data.current_time_local);
        setActiveSessions(data.sessions.active_sessions || []);

        if (data.trading_hours) {
          const [startH, startM] = data.trading_hours.start.split(':').map(Number);
          const [endH, endM] = data.trading_hours.end.split(':').map(Number);
          setStartHour(startH);
          setStartMinute(startM);
          setEndHour(endH);
          setEndMinute(endM);
          setRestrictHours(data.trading_hours.restrict_enabled);
        }

        if (data.sessions) {
          setSessionsEnabled(data.sessions.enabled);
          setAllowedSessions(data.sessions.allowed_sessions || []);
          setRestrictedSessions(data.sessions.restricted_sessions || []);
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading trading status:', error);
      showMessage('Error loading trading status', 'error');
      setLoading(false);
    }
  };

  const loadSessionsConfig = async () => {
    try {
      const response = await fetch('/api/trading-hours/sessions');
      const data = await response.json();

      if (data.success) {
        setSessionsEnabled(data.enabled);
        setAllowedSessions(data.allowed_sessions || []);
        setRestrictedSessions(data.restricted_sessions || []);
        setActiveSessions(data.active_sessions || []);
      }
    } catch (error) {
      console.error('Error loading sessions config:', error);
    }
  };

  const loadEconomicCalendarConfig = async () => {
    try {
      const response = await fetch('/api/economic-calendar/config');
      const data = await response.json();

      if (data.success && data.config) {
        setEvents(data.config.events || []);
      }
    } catch (error) {
      console.error('Error loading economic calendar config:', error);
    }
  };

  const saveTradingHours = async () => {
    try {
      const response = await fetch('/api/trading-hours/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_hour: startHour,
          start_minute: startMinute,
          end_hour: endHour,
          end_minute: endMinute,
          restrict_hours: restrictHours
        })
      });

      const data = await response.json();
      if (data.success) {
        showMessage('Trading hours saved successfully', 'success');
        loadTradingStatus();
      } else {
        showMessage(data.error || 'Failed to save trading hours', 'error');
      }
    } catch (error) {
      console.error('Error saving trading hours:', error);
      showMessage('Error saving trading hours', 'error');
    }
  };

  const saveSessionsConfig = async () => {
    try {
      const response = await fetch('/api/trading-hours/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: sessionsEnabled,
          allowed_sessions: allowedSessions,
          restricted_sessions: restrictedSessions
        })
      });

      const data = await response.json();
      if (data.success) {
        showMessage('Session configuration saved successfully', 'success');
        loadTradingStatus();
      } else {
        showMessage(data.error || 'Failed to save session configuration', 'error');
      }
    } catch (error) {
      console.error('Error saving sessions config:', error);
      showMessage('Error saving session configuration', 'error');
    }
  };

  const handleEventSelection = (eventId) => {
    setSelectedEvents(prev => {
      if (prev.includes(eventId)) {
        return prev.filter(id => id !== eventId);
      } else {
        return [...prev, eventId];
      }
    });
  };

  const handleAddToRestrictions = () => {
    if (selectedEvents.length === 0) {
      showMessage('Please select at least one event', 'error');
      return;
    }
    setShowRestrictionModal(true);
  };

  const handleSaveRestrictions = async () => {
    try {
      const selectedEventObjects = events.filter(e => selectedEvents.includes(e.id));

      const response = await fetch('/api/economic-calendar/add-restrictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_ids: selectedEvents,
          before_minutes: restrictionBeforeMinutes,
          after_minutes: restrictionAfterMinutes,
          enabled: true
        })
      });

      const data = await response.json();
      if (data.success) {
        showMessage(`Added ${selectedEvents.length} events to restrictions`, 'success');
        setShowRestrictionModal(false);
        setSelectedEvents([]);
        await loadEconomicCalendarConfig();
      } else {
        showMessage(data.error || 'Failed to save restrictions', 'error');
      }
    } catch (error) {
      console.error('Error saving restrictions:', error);
      showMessage('Error saving restrictions', 'error');
    }
  };

  const handleClearRestrictions = async (eventIds = null) => {
    const idsToUse = eventIds || selectedEvents;
    if (!idsToUse || idsToUse.length === 0) {
      showMessage('No events selected', 'error');
      return;
    }

    try {
      const response = await fetch('/api/economic-calendar/clear-restrictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_ids: idsToUse
        })
      });

      const data = await response.json();
      if (data.success) {
        showMessage(`Cleared restrictions for ${idsToUse.length} event${idsToUse.length > 1 ? 's' : ''}`, 'success');
        setShowRestrictionModal(false);
        setSelectedEvents([]);
        await loadEconomicCalendarConfig();
      } else {
        showMessage(data.error || 'Failed to clear restrictions', 'error');
      }
    } catch (error) {
      console.error('Error clearing restrictions:', error);
      showMessage('Error clearing restrictions', 'error');
    }
  };

  const fetchExternalEvents = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/economic-calendar/fetch-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      if (data.success) {
        showMessage(data.message, 'success');
        await loadEconomicCalendarConfig();
      } else {
        showMessage(data.error || 'Failed to fetch events', 'error');
      }
    } catch (error) {
      console.error('Error fetching external events:', error);
      showMessage('Error fetching external events', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredEvents = () => {
    if (impactFilter === 'ALL') {
      return events;
    }
    return events.filter(event => event.impact === impactFilter);
  };

  const getActiveRestrictions = () => {
    // Only show events that are enabled AND have been explicitly added by user
    // Events fetched have enabled=false by default, only user-added restrictions have enabled=true
    return events.filter(event => event.enabled === true);
  };

  const handleClearAllRestrictions = async () => {
    const activeRestrictions = getActiveRestrictions();
    if (activeRestrictions.length === 0) {
      showMessage('No active restrictions to clear', 'error');
      return;
    }

    if (!window.confirm(`Clear all ${activeRestrictions.length} active restrictions?`)) {
      return;
    }

    const eventIds = activeRestrictions.map(e => e.id);
    await handleClearRestrictions(eventIds);
  };

  const formatDateOnly = (datetime) => {
    const date = new Date(datetime);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isSameDay = (date1, date2) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };


  const handleSessionToggle = (sessionTime, type) => {
    if (type === 'allow') {
      if (allowedSessions.includes(sessionTime)) {
        setAllowedSessions(allowedSessions.filter(s => s !== sessionTime));
      } else {
        setAllowedSessions([...allowedSessions, sessionTime]);
        setRestrictedSessions(restrictedSessions.filter(s => s !== sessionTime));
      }
    } else {
      if (restrictedSessions.includes(sessionTime)) {
        setRestrictedSessions(restrictedSessions.filter(s => s !== sessionTime));
      } else {
        setRestrictedSessions([...restrictedSessions, sessionTime]);
        setAllowedSessions(allowedSessions.filter(s => s !== sessionTime));
      }
    }
  };

  const formatEventTime = (datetime) => {
    const date = new Date(datetime);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const getEventStatus = (event) => {
    const now = new Date();
    const eventTime = new Date(event.datetime);
    const timeDiff = (eventTime - now) / (1000 * 60);

    if (timeDiff < 0) {
      return { status: 'past', text: 'Past', class: 'past' };
    } else if (timeDiff >= 0 && timeDiff <= 1440) { // Within 24 hours
      return { status: 'active', text: 'Upcoming', class: 'active' };
    } else {
      return { status: 'upcoming', text: 'Future', class: 'upcoming' };
    }
  };

  const showMessage = (msg, type) => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => {
      setMessage('');
      setMessageType('');
    }, 3000);
  };

  if (loading) {
    return (
      <Layout>
        <div className="loading-container">
          <div className="loader"></div>
          <p>Loading trading schedule...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="trading-schedule-container">
        {/* Page Header */}
        <div className="page-header">
          <h1 className="page-title">
            <FaCalendarAlt className="title-icon" />
            Trading Schedule
          </h1>
          <p className="page-subtitle">Configure time-based, session-based, and event-based trading restrictions</p>
        </div>

        {message && (
          <motion.div
            className={`alert-message ${messageType}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {message}
          </motion.div>
        )}

        {/* Main Grid */}
        <div className="schedule-grid">
          {/* Trading Status Card */}
          <motion.div
            className="schedule-card status-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="card-header">
              <div className="card-icon">
                <FaClock />
              </div>
              <div className="card-title-section">
                <h2>Trading Status</h2>
                <p>Current system status and active sessions</p>
              </div>
            </div>
            <div className="card-content">
              <div className={`status-indicator ${tradingAllowed ? 'allowed' : 'restricted'}`}>
                {tradingAllowed ? <FaCheckCircle /> : <FaTimesCircle />}
                <span>{tradingAllowed ? 'TRADING ALLOWED' : 'TRADING RESTRICTED'}</span>
              </div>

              <div className="time-grid">
                <div className="time-item">
                  <FaGlobe />
                  <div>
                    <span className="time-label">GMT Time</span>
                    <span className="time-value">{currentTimeGMT}</span>
                  </div>
                </div>
                <div className="time-item">
                  <FaClock />
                  <div>
                    <span className="time-label">Local Time</span>
                    <span className="time-value">{currentTimeLocal}</span>
                  </div>
                </div>
              </div>

              {activeSessions.length > 0 && (
                <div className="active-sessions">
                  <span className="sessions-label">Active Sessions:</span>
                  <div className="sessions-tags">
                    {activeSessions.map((session, index) => (
                      <span key={index} className="session-tag">{session}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Trading Hours Card */}
          <motion.div
            className="schedule-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="card-header">
              <div className="card-icon">
                <FaClock />
              </div>
              <div className="card-title-section">
                <h2>Trading Hours</h2>
                <p>Set daily time restrictions (GMT)</p>
              </div>
            </div>
            <div className="card-content">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={restrictHours}
                  onChange={(e) => setRestrictHours(e.target.checked)}
                />
                <span>Enable Hours Restriction</span>
              </label>

              {restrictHours && (
                <motion.div
                  className="time-config"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <div className="time-row">
                    <div className="time-group">
                      <label>Start Time</label>
                      <div className="time-inputs">
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={startHour}
                          onChange={(e) => setStartHour(parseInt(e.target.value) || 0)}
                        />
                        <span>:</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={startMinute}
                          onChange={(e) => setStartMinute(parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div className="time-group">
                      <label>End Time</label>
                      <div className="time-inputs">
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={endHour}
                          onChange={(e) => setEndHour(parseInt(e.target.value) || 0)}
                        />
                        <span>:</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={endMinute}
                          onChange={(e) => setEndMinute(parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="time-preview">
                    Trading: {startHour.toString().padStart(2, '0')}:{startMinute.toString().padStart(2, '0')} - {endHour.toString().padStart(2, '0')}:{endMinute.toString().padStart(2, '0')} GMT
                  </div>
                </motion.div>
              )}

              <button className="save-btn" onClick={saveTradingHours}>
                <FaSave /> Save Hours
              </button>
            </div>
          </motion.div>

          {/* Trading Sessions Card */}
          <motion.div
            className="schedule-card sessions-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="card-header">
              <div className="card-icon">
                <FaGlobe />
              </div>
              <div className="card-title-section">
                <h2>Trading Sessions</h2>
                <p>Configure session-based restrictions</p>
              </div>
            </div>
            <div className="card-content">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={sessionsEnabled}
                  onChange={(e) => setSessionsEnabled(e.target.checked)}
                />
                <span>Enable Session Restrictions</span>
              </label>

              {sessionsEnabled && (
                <motion.div
                  className="sessions-config"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <div className="sessions-columns">
                    <div className="session-column">
                      <h4 className="column-title allow">✓ Allow Sessions</h4>
                      {Object.entries(predefinedSessions).map(([time, name]) => (
                        <label key={time} className="session-item">
                          <input
                            type="checkbox"
                            checked={allowedSessions.includes(time)}
                            onChange={() => handleSessionToggle(time, 'allow')}
                          />
                          <span className="session-name">{name}</span>
                          <span className="session-time">{time}</span>
                        </label>
                      ))}
                    </div>

                    <div className="session-column">
                      <h4 className="column-title restrict">✕ Restrict Sessions</h4>
                      {Object.entries(predefinedSessions).map(([time, name]) => (
                        <label key={time} className="session-item">
                          <input
                            type="checkbox"
                            checked={restrictedSessions.includes(time)}
                            onChange={() => handleSessionToggle(time, 'restrict')}
                          />
                          <span className="session-name">{name}</span>
                          <span className="session-time">{time}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              <button className="save-btn" onClick={saveSessionsConfig}>
                <FaSave /> Save Sessions
              </button>
            </div>
          </motion.div>
        </div>

        {/* Economic Calendar Section */}
        <motion.div
          className="economic-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="section-header">
            <h2>
              <FaChartLine /> Economic Calendar
            </h2>
            <p>Filter events by impact and add them to trading restrictions</p>
          </div>

          {/* Active Restrictions Card */}
          {getActiveRestrictions().length > 0 && (
            <div className="schedule-card restrictions-card">
              <div className="card-header">
                <div className="card-icon">🔒</div>
                <div className="card-title-section">
                  <h2>Active Restrictions ({getActiveRestrictions().length})</h2>
                  <p>Events currently blocking trading</p>
                </div>
                <div className="card-header-actions">
                  <button className="clear-all-btn" onClick={handleClearAllRestrictions} title="Clear all restrictions">
                    <FaTrash /> Clear All
                  </button>
                </div>
              </div>
              <div className="card-content">
                <div className="active-restrictions-grid">
                  {getActiveRestrictions()
                    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
                    .map(event => (
                      <div key={event.id} className="restriction-item">
                        <div className="restriction-header">
                          <span className={`impact-badge impact-${event.impact.toLowerCase()}`}>
                            {event.impact === 'HIGH' && '🔴'}
                            {event.impact === 'MEDIUM' && '🟡'}
                            {event.impact === 'LOW' && '🟢'}
                            {event.impact}
                          </span>
                          <button
                            className="remove-restriction-btn"
                            onClick={() => handleClearRestrictions([event.id])}
                            title="Remove restriction"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="restriction-title">{event.title}</div>
                        <div className="restriction-time">{formatEventTime(event.datetime)}</div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Events List with Filter */}
          <div className="schedule-card events-card">
            <div className="card-header">
              <div className="card-icon">📋</div>
              <div className="card-title-section">
                <h2>Economic Events ({getFilteredEvents().length})</h2>
                <p>Select events to add to trading restrictions</p>
              </div>
              <div className="card-header-actions">
                <button className="fetch-btn" onClick={fetchExternalEvents} title="Fetch events from external source">
                  <FaDownload /> Fetch Events
                </button>
              </div>
            </div>
            <div className="card-content">
              {/* Impact Filter */}
              <div className="impact-filter-container">
                <label>Filter by Impact:</label>
                <div className="impact-filter-buttons">
                  <button
                    className={`impact-filter-btn ${impactFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setImpactFilter('ALL')}
                  >
                    All ({events.length})
                  </button>
                  <button
                    className={`impact-filter-btn high ${impactFilter === 'HIGH' ? 'active' : ''}`}
                    onClick={() => setImpactFilter('HIGH')}
                  >
                    🔴 High ({events.filter(e => e.impact === 'HIGH').length})
                  </button>
                  <button
                    className={`impact-filter-btn medium ${impactFilter === 'MEDIUM' ? 'active' : ''}`}
                    onClick={() => setImpactFilter('MEDIUM')}
                  >
                    🟡 Medium ({events.filter(e => e.impact === 'MEDIUM').length})
                  </button>
                  <button
                    className={`impact-filter-btn low ${impactFilter === 'LOW' ? 'active' : ''}`}
                    onClick={() => setImpactFilter('LOW')}
                  >
                    🟢 Low ({events.filter(e => e.impact === 'LOW').length})
                  </button>
                </div>
              </div>

              {/* Selection Actions */}
              {selectedEvents.length > 0 && (
                <div className="selection-actions">
                  <span className="selection-count">{selectedEvents.length} events selected</span>
                  <button className="add-restrictions-btn" onClick={handleAddToRestrictions}>
                    <FaPlus /> Add to Restrictions
                  </button>
                </div>
              )}

              {/* Events Table */}
              {getFilteredEvents().length === 0 ? (
                <div className="empty-state">
                  <p>No events available</p>
                  <small>Click "Fetch Events" to import economic calendar events</small>
                </div>
              ) : (
                <div className="events-table-container">
                  <table className="events-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEvents(getFilteredEvents().map(ev => ev.id));
                              } else {
                                setSelectedEvents([]);
                              }
                            }}
                            checked={selectedEvents.length === getFilteredEvents().length && getFilteredEvents().length > 0}
                          />
                        </th>
                        <th>Event</th>
                        <th>Date & Time</th>
                        <th>Impact</th>
                        <th>Status</th>
                        <th>Restricted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredEvents()
                        .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
                        .map((event, index, array) => {
                          const status = getEventStatus(event);
                          const prevEvent = index > 0 ? array[index - 1] : null;
                          const showDateSeparator = !prevEvent || !isSameDay(event.datetime, prevEvent.datetime);

                          return (
                            <React.Fragment key={event.id}>
                              {showDateSeparator && (
                                <tr className="date-separator-row">
                                  <td colSpan="6" className="date-separator">
                                    <div className="date-separator-content">
                                      <span className="date-separator-line"></span>
                                      <span className="date-separator-text">{formatDateOnly(event.datetime)}</span>
                                      <span className="date-separator-line"></span>
                                    </div>
                                  </td>
                                </tr>
                              )}
                              <tr className={`event-row ${status.class}`}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={selectedEvents.includes(event.id)}
                                    onChange={() => handleEventSelection(event.id)}
                                  />
                                </td>
                                <td className="event-title">
                                  {event.title}
                                </td>
                                <td className="event-time">{formatEventTime(event.datetime)}</td>
                                <td>
                                  <span className={`impact-badge impact-${event.impact.toLowerCase()}`}>
                                    {event.impact === 'HIGH' && '🔴'}
                                    {event.impact === 'MEDIUM' && '🟡'}
                                    {event.impact === 'LOW' && '🟢'}
                                    {event.impact}
                                  </span>
                                </td>
                                <td>
                                  <span className={`status-badge ${status.class}`}>
                                    {status.text}
                                  </span>
                                </td>
                                <td>
                                  {event.enabled ? (
                                    <span className="restricted-badge">✓ Active</span>
                                  ) : (
                                    <span className="not-restricted-badge">—</span>
                                  )}
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Restriction Configuration Modal */}
        {showRestrictionModal && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowRestrictionModal(false)}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>Configure Event Restrictions</h2>
                <button className="modal-close" onClick={() => setShowRestrictionModal(false)}>×</button>
              </div>

              <div className="modal-body">
                <div className="selected-events-list">
                  <h3>Selected Events ({selectedEvents.length})</h3>
                  <div className="events-preview">
                    {events.filter(e => selectedEvents.includes(e.id)).map(event => (
                      <div key={event.id} className="event-preview-item">
                        <span className={`impact-badge impact-${event.impact.toLowerCase()}`}>
                          {event.impact === 'HIGH' && '🔴'}
                          {event.impact === 'MEDIUM' && '🟡'}
                          {event.impact === 'LOW' && '🟢'}
                        </span>
                        <span className="event-preview-title">{event.title}</span>
                        <span className="event-preview-time">{formatEventTime(event.datetime)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="restriction-settings">
                  <h3>Time Restrictions</h3>
                  <div className="buffer-settings">
                    <div className="buffer-group">
                      <label>Before Event (minutes)</label>
                      <input
                        type="number"
                        value={restrictionBeforeMinutes}
                        onChange={(e) => setRestrictionBeforeMinutes(parseInt(e.target.value) || 0)}
                        min="0"
                        max="120"
                      />
                    </div>
                    <div className="buffer-group">
                      <label>After Event (minutes)</label>
                      <input
                        type="number"
                        value={restrictionAfterMinutes}
                        onChange={(e) => setRestrictionAfterMinutes(parseInt(e.target.value) || 0)}
                        min="0"
                        max="120"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="clear-btn" onClick={handleClearRestrictions}>
                  Clear Restrictions
                </button>
                <button className="save-btn" onClick={handleSaveRestrictions}>
                  <FaSave /> Save Settings
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
};

export default TradingSchedule;