const axios = require('axios');
const pool = require('../database');

// Single purpose: Send webhook when signal occurs
async function sendPayload(action, ticker, strategyId) {
  try {
    // Get strategy config (status + webhook)
    const { rows } = await pool.query(
      'SELECT status, webhook_url, webhook_payload FROM strategies WHERE id = $1',
      [strategyId]
    );

    if (!rows[0] || rows[0].status !== 'active') {
      return { success: false, reason: 'Strategy not active' };
    }

    const { webhook_url, webhook_payload } = rows[0];
    if (!webhook_url || !webhook_payload) {
      return { success: false, reason: 'No webhook configured' };
    }

    // Simple substitution
    const payload = JSON.parse(
      JSON.stringify(webhook_payload)
        .replace(/\{\{action\}\}/g, action)
        .replace(/\{\{ticker\}\}/g, ticker)
    );

    // Send it
    await axios.post(webhook_url, payload);
    console.log(`✓ ${action} webhook sent for ${ticker}`);
    return { success: true };

  } catch (error) {
    console.error(`✗ Webhook failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = { sendPayload };