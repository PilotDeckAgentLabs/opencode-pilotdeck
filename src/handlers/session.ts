/**
 * Session event handlers for run tracking
 */

import type { PilotDeckClient } from "../client/index.js"
import type { PluginConfig } from "../config.js"
import { mapWorktreeToProject } from "../config.js"
import { Logger } from "../utils/logger.js"

export interface SessionEvent {
  type: string
  properties?: Record<string, unknown>
}

export interface PluginContext {
  sessionID?: string
  agent?: string
  directory: string
  worktree?: string
}

/**
 * Handle session lifecycle events
 */
export async function handleSessionEvent(
  event: SessionEvent,
  client: PilotDeckClient,
  context: PluginContext,
  config: PluginConfig,
  logger: Logger
): Promise<void> {
  try {
    switch (event.type) {
      case "session.created":
        await handleSessionCreated(event, client, context, config, logger)
        break
        
      case "session.idle":
        await handleSessionIdle(event, client, context, config, logger)
        break
        
      case "session.error":
        await handleSessionError(event, client, context, logger)
        break
        
      default:
        // Ignore other event types
        break
    }
  } catch (error) {
    // Log but don't crash OpenCode
    logger.error("Error handling session event", {
      eventType: event.type,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

async function handleSessionCreated(
  event: SessionEvent,
  client: PilotDeckClient,
  context: PluginContext,
  config: PluginConfig,
  logger: Logger
): Promise<void> {
  const sessionId = event.properties?.sessionID as string | undefined
  if (!sessionId) {
    logger.warn("session.created event missing sessionID")
    return
  }
  
  const projectId = mapWorktreeToProject(
    context.worktree || context.directory,
    config
  )
  
  logger.debug("Creating run for session", {
    sessionId,
    projectId,
    agent: context.agent,
    worktree: context.worktree
  })
  
  try {
    await client.createRun({
      source: "opencode",
      sessionId,
      projectId,
      agent: context.agent || "unknown",
      startedAt: new Date().toISOString(),
      status: "running"
    })
    
    logger.info("Run created", { sessionId, projectId })
  } catch (error) {
    logger.error("Failed to create run", {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

async function handleSessionIdle(
  event: SessionEvent,
  client: PilotDeckClient,
  _context: PluginContext,
  _config: PluginConfig,
  logger: Logger
): Promise<void> {
  const sessionId = event.properties?.sessionID as string | undefined
  if (!sessionId) {
    logger.warn("session.idle event missing sessionID")
    return
  }
  
  logger.debug("Session idle, updating run", { sessionId })
  
  try {
    // TODO: Fetch session details to get usage data
    // This will be implemented in Phase 2 (token usage)
    await client.updateRun(sessionId, {
      status: "completed",
      finishedAt: new Date().toISOString()
    })
    
    logger.info("Run completed", { sessionId })
  } catch (error) {
    logger.error("Failed to update run on idle", {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

async function handleSessionError(
  event: SessionEvent,
  client: PilotDeckClient,
  _context: PluginContext,
  logger: Logger
): Promise<void> {
  const sessionId = event.properties?.sessionID as string | undefined
  if (!sessionId) {
    logger.warn("session.error event missing sessionID")
    return
  }
  
  const errorMessage = event.properties?.error as string | undefined
  
  logger.debug("Session error, marking run as failed", {
    sessionId,
    error: errorMessage
  })
  
  try {
    await client.updateRun(sessionId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: errorMessage || "Unknown session error"
    })
    
    logger.info("Run marked as failed", { sessionId })
  } catch (error) {
    logger.error("Failed to update run on error", {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
