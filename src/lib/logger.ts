export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  timestamp: string;
}

class Logger {
  private log(level: LogLevel, message: string, context?: Record<string, any>) {
    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
    };

    // In a real enterprise app, this would send to DataDog, Sentry, or LogRocket
    // For now, we beautifully format it for the console.
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(`[${entry.timestamp}] 🔍 DEBUG: ${message}`, context || '');
        break;
      case LogLevel.INFO:
        console.info(`[${entry.timestamp}] ℹ️ INFO: ${message}`, context || '');
        break;
      case LogLevel.WARN:
        console.warn(`[${entry.timestamp}] ⚠️ WARN: ${message}`, context || '');
        break;
      case LogLevel.ERROR:
        console.error(`[${entry.timestamp}] ❌ ERROR: ${message}`, context || '');
        break;
    }
  }

  debug(message: string, context?: Record<string, any>) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>) {
    this.log(LogLevel.ERROR, message, { 
      ...context, 
      errorName: error?.name,
      errorMessage: error?.message, 
      stack: error?.stack 
    });
    // Here we would also typically push to error tracking services like Sentry.
  }
}

export const logger = new Logger();
