/**
 * Simple logger utility for Task Master Lite
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const LOG_COLORS = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m'  // Red
};

const RESET_COLOR = '\x1b[0m';

const currentLevel = process.env.LOG_LEVEL || 'info';

export function log(level, message, data = null) {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
    return;
  }

  const timestamp = new Date().toISOString();
  const color = LOG_COLORS[level] || '';
  
  const logMessage = `${color}[${timestamp}] ${level.toUpperCase()}: ${message}${RESET_COLOR}`;
  
  if (level === 'error') {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }
  
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

export default { log };