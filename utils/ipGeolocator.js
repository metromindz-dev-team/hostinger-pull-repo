import axios from 'axios';

/**
 * Extracts the clean client IP from request headers or socket.
 * Handles reverse proxy forwarding.
 */
export const getClientIp = (req) => {
  if (!req) return '127.0.0.1';
  let ip = (req.headers && req.headers['x-forwarded-for']) ||
    (req.socket && req.socket.remoteAddress) ||
    req.ip;
  if (ip && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  return ip;
};

/**
 * Checks if the given IP address is a private loopback or local LAN address.
 */
export const isPrivateIp = (ip) => {
  if (!ip) return true;
  const normalized = ip.replace(/^::ffff:/, '');

  if (normalized === '::1' || normalized === '127.0.0.1' || normalized === 'localhost') {
    return true;
  }

  const parts = normalized.split('.');
  if (parts.length === 4) {
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    if (p1 === 10) return true;
    if (p1 === 192 && p2 === 168) return true;
    if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;
  }
  return false;
};

/**
 * Resolves location string from the client's IP.
 * Detects private LAN/local network addresses automatically.
 */
export const resolveLocationFromIp = async (ip) => {
  if (!ip) return 'Location Unknown';

  const normalized = ip.replace(/^::ffff:/, '');

  if (isPrivateIp(normalized)) {
    return `Office LAN / Local Network (IP: ${normalized})`;
  }

  try {
    const response = await axios.get(`https://freeipapi.com/api/json/${normalized}`, { timeout: 3000 });
    const data = response.data;
    const parts = [];
    if (data.cityName) parts.push(data.cityName);
    if (data.regionName) parts.push(data.regionName);
    if (data.countryName) parts.push(data.countryName);

    if (parts.length > 0) {
      return `${parts.join(', ')} (IP: ${normalized})`;
    }
    return `Public Network (IP: ${normalized})`;
  } catch (err) {
    console.error(`IP Geolocation error for ${normalized}:`, err.message);
    return `Public Network (IP: ${normalized})`;
  }
};
