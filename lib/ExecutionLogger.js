/**
 * ExecutionLogger - Captures detailed logs during sync execution
 * Stores structured logs that can be displayed in the UI
 */

class ExecutionLogger {
  constructor() {
    this.logs = [];
  }

  /**
   * Add a log entry
   * @param {string} level - 'info', 'success', 'warning', 'error'
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  log(level, message, data = {}) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data
    });
  }

  info(message, data = {}) {
    this.log('info', message, data);
  }

  success(message, data = {}) {
    this.log('success', message, data);
  }

  warning(message, data = {}) {
    this.log('warning', message, data);
  }

  error(message, error, data = {}) {
    this.log('error', message, {
      ...data,
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Get all logs
   */
  getLogs() {
    return this.logs;
  }

  /**
   * Get logs as JSON string
   */
  getLogsJSON() {
    return JSON.stringify(this.logs);
  }

  /**
   * Clear all logs
   */
  clear() {
    this.logs = [];
  }
}

module.exports = ExecutionLogger;
