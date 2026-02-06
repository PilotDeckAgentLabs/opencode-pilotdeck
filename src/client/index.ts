/**
 * PilotDeck API client
 */

import type { PluginConfig } from "../config.js"
import type {
  RunCreateRequest,
  RunUpdateRequest,
  EventCreateRequest,
  ActionCreateRequest,
  ApiResponse,
  ApiError
} from "./types.js"
import { withRetry, isRetryableError } from "./retry.js"

export class PilotDeckClient {
  private baseUrl: string
  private token?: string
  private debug: boolean
  
  constructor(config: PluginConfig) {
    this.baseUrl = config.serverUrl.replace(/\/$/, "")
    this.token = config.token
    this.debug = config.debug
  }
  
  /**
   * Create or update a run (idempotent)
   */
  async createRun(data: RunCreateRequest): Promise<ApiResponse> {
    return this.request<ApiResponse>("POST", "/api/agent/runs", data)
  }
  
  /**
   * Update an existing run
   */
  async updateRun(sessionId: string, data: RunUpdateRequest): Promise<ApiResponse> {
    return this.request<ApiResponse>("PATCH", `/api/agent/runs/${sessionId}`, data)
  }
  
  /**
   * Create an event (idempotent)
   */
  async createEvent(data: EventCreateRequest): Promise<ApiResponse> {
    return this.request<ApiResponse>("POST", "/api/agent/events", data)
  }
  
  /**
   * Create an action proposal (idempotent)
   */
  async createAction(data: ActionCreateRequest): Promise<ApiResponse> {
    return this.request<ApiResponse>("POST", "/api/agent/actions", data)
  }
  
  /**
   * Make an authenticated API request with retry logic
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    
    const makeRequest = async (): Promise<T> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      }
      
      if (this.token) {
        headers["X-PM-Agent-Token"] = this.token
      }
      
      if (this.debug) {
        console.log(`[pilotdeck-client] ${method} ${url}`, body)
      }
      
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      })
      
      const responseData = await response.json()
      
      if (!response.ok) {
        const error = responseData as ApiError
        const err = new Error(error.message || `HTTP ${response.status}`)
        ;(err as any).statusCode = response.status
        ;(err as any).response = error
        throw err
      }
      
      if (this.debug) {
        console.log(`[pilotdeck-client] Response:`, responseData)
      }
      
      return responseData as T
    }
    
    try {
      return await withRetry(makeRequest, {
        maxAttempts: 3,
        baseDelay: 1000,
        onRetry: (attempt, error) => {
          if (this.debug || isRetryableError(error)) {
            console.warn(
              `[pilotdeck-client] Retry ${attempt}/3 after error:`,
              error.message
            )
          }
        }
      })
    } catch (error) {
      // Log final failure but don't crash OpenCode
      console.error(
        `[pilotdeck-client] Failed to ${method} ${path}:`,
        error instanceof Error ? error.message : error
      )
      throw error
    }
  }
}
