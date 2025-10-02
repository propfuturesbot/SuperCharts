/**
 * API Configuration
 *
 * Automatically detects if running locally or through Cloudflare tunnel
 * and adjusts API base URL accordingly
 */

// Check if we're running through Cloudflare tunnel
const isCloudflare = window.location.hostname.includes('trycloudflare.com');
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Determine API base URL
let API_BASE_URL;

if (isCloudflare) {
  // When accessed through Cloudflare tunnel, use relative URLs
  // The React dev server proxy will forward /api/* to localhost:8025
  API_BASE_URL = '';
} else if (isLocalhost) {
  // Local development - use relative URLs (proxy handles routing)
  API_BASE_URL = '';
} else {
  // Production - assume backend is on same host, port 8025
  API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8025`;
}

export const API_CONFIG = {
  BASE_URL: API_BASE_URL,
  IS_CLOUDFLARE: isCloudflare,
  IS_LOCALHOST: isLocalhost
};

console.log('[API Config]', API_CONFIG);

export default API_CONFIG;