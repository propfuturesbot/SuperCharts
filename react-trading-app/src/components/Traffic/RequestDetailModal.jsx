import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes } from 'react-icons/fa';
import './Traffic.css';

const RequestDetailModal = ({ log, onClose }) => {
  const [activeTab, setActiveTab] = useState('request');

  if (!log) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="modal-content"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>Request Details</h2>
            <button className="modal-close" onClick={onClose}>
              <FaTimes />
            </button>
          </div>

          <div className="modal-tabs">
            <button
              className={`modal-tab ${activeTab === 'request' ? 'active' : ''}`}
              onClick={() => setActiveTab('request')}
            >
              Request Payload
            </button>
            <button
              className={`modal-tab ${activeTab === 'response' ? 'active' : ''}`}
              onClick={() => setActiveTab('response')}
            >
              Response Data
            </button>
          </div>

          <div className="modal-body">
            {activeTab === 'request' && (
              <pre className="json-display">
                {JSON.stringify(log.requestPayload, null, 2)}
              </pre>
            )}
            {activeTab === 'response' && (
              <pre className="json-display">
                {JSON.stringify(log.responseData, null, 2)}
              </pre>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default RequestDetailModal;
