/**
 * Structured logging utilities
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogContext {
  [key: string]: unknown
}

/**
 * Simple structured logger for plugin
 */
export class Logger {
  private service = "opencode-pilotdeck"
  private debugEnabled: boolean
  
  constructor(debug = false) {
    this.debugEnabled = debug
  }
  
  log(level: LogLevel, message: string, context?: LogContext): void {
    if (level === "debug" && !this.debugEnabled) return
    
    const prefix = `[${this.service}] [${level.toUpperCase()}]`
    
    if (context && Object.keys(context).length > 0) {
      console.log(`${prefix} ${message}`, context)
    } else {
      console.log(`${prefix} ${message}`)
    }
  }
  
  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context)
  }
  
  info(message: string, context?: LogContext): void {
    this.log("info", message, context)
  }
  
  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context)
  }
  
  error(message: string, context?: LogContext): void {
    this.log("error", message, context)
  }
}
