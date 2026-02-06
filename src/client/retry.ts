/**
 * Retry utility with exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number
  baseDelay?: number
  maxDelay?: number
  onRetry?: (attempt: number, error: Error) => void
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  onRetry: () => {}
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: Error | undefined
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt === opts.maxAttempts) {
        break
      }
      
      opts.onRetry(attempt, lastError)
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt - 1),
        opts.maxDelay
      )
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError || new Error("Retry exhausted with unknown error")
}

/**
 * Check if an error is retryable (network errors, 5xx, rate limits)
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  
  // Network errors
  if (error.message.includes("ECONNREFUSED")) return true
  if (error.message.includes("ETIMEDOUT")) return true
  if (error.message.includes("ENOTFOUND")) return true
  
  // HTTP status codes (if available)
  const statusCode = (error as any).statusCode
  if (statusCode >= 500) return true // Server errors
  if (statusCode === 429) return true // Rate limit
  
  return false
}
