/**
 * auditLogService.js
 * 
 * Centralized service for logging security events, API access, and user actions.
 * Logs are stored in memory or database depending on configuration.
 */

const securityLogs = [];
const MAX_LOG_SIZE = 10000; // Keep last 10k logs in memory

/**
 * Log a security event
 * @param {Object} event - Event details
 * @param {string} event.userId - User ID
 * @param {string} event.action - Action name (e.g., MAPSERVER_QUERY, BLOCKED_EXPORT)
 * @param {string} event.resource - Resource accessed
 * @param {string} event.ip - Client IP address
 * @param {string} event.reason - Reason for the action (if blocked)
 * @param {Object} event.params - Query parameters (if any)
 */
export const logSecurityEvent = async (event) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...event,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[SECURITY LOG]', logEntry);
  }

  // Store in memory
  securityLogs.push(logEntry);
  
  // Prevent memory overflow
  if (securityLogs.length > MAX_LOG_SIZE) {
    securityLogs.shift();
  }

  // TODO: Implement persistent storage
  // - Write to database
  // - Write to file system
  // - Send to logging service (ELK, Splunk, etc.)
  
  return logEntry;
};

/**
 * Get recent security logs (in-memory only)
 * @param {number} limit - Number of logs to return
 * @returns {Array} Recent logs
 */
export const getSecurityLogs = (limit = 100) => {
  return securityLogs.slice(-limit).reverse();
};

/**
 * Filter logs by criteria
 * @param {Object} filter - Filter criteria
 * @returns {Array} Filtered logs
 */
export const filterSecurityLogs = (filter = {}) => {
  return securityLogs.filter(log => {
    if (filter.userId && log.userId !== filter.userId) return false;
    if (filter.action && log.action !== filter.action) return false;
    if (filter.startDate && new Date(log.timestamp) < new Date(filter.startDate)) return false;
    if (filter.endDate && new Date(log.timestamp) > new Date(filter.endDate)) return false;
    return true;
  });
};

/**
 * Clear all logs (use with caution)
 */
export const clearSecurityLogs = () => {
  securityLogs.length = 0;
};

export default {
  logSecurityEvent,
  getSecurityLogs,
  filterSecurityLogs,
  clearSecurityLogs,
};
