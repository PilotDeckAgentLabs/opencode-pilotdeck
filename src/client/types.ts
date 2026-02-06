/**
 * Type definitions for PilotDeck API
 */

export interface RunCreateRequest {
  source: string
  sessionId: string
  projectId: string
  agent: string
  startedAt: string
  status: "running" | "completed" | "failed"
  finishedAt?: string
  usage?: UsageData
  summary?: string
  error?: string
}

export interface RunUpdateRequest {
  status?: "running" | "completed" | "failed"
  finishedAt?: string
  usage?: UsageData
  summary?: string
  error?: string
}

export interface UsageData {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
  model: string
}

export interface EventCreateRequest {
  runId: string
  type: "task_started" | "milestone" | "blocked" | "scope_change" | "task_completed"
  title: string
  description: string
  evidence?: string[]
  createdBy: string
  idempotencyKey: string
}

export interface ActionCreateRequest {
  runId: string
  type: "update_status" | "update_milestone" | "update_priority" | "add_note"
  payload: Record<string, unknown>
  rationale: string
  status: "pending_review"
  proposedBy: string
  idempotencyKey: string
}

export interface ApiResponse<T = unknown> {
  id: string
  created?: boolean
  data?: T
}

export interface ApiError {
  error: string
  message: string
  statusCode: number
}
