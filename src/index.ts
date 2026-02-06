/**
 * opencode-pilotdeck - OpenCode plugin for PilotDeck integration
 * 
 * This plugin provides:
 * - Session lifecycle tracking and run reporting
 * - Token usage attribution
 * - Custom tools for agent progress reporting (pilotdeck.event, pilotdeck.action)
 * - Protocol injection for agent behavior guidance
 */

import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig, mapWorktreeToProject } from "./config.js"
import { PilotDeckClient } from "./client/index.js"
import { handleSessionEvent } from "./handlers/session.js"
import { createEventTool } from "./tools/event.js"
import { createActionTool } from "./tools/action.js"
import { Logger } from "./utils/logger.js"
import { PILOTDECK_PROTOCOL } from "./protocol.js"

export const PilotDeckPlugin: Plugin = async (ctx) => {
  const { directory, worktree } = ctx
  
  // Load configuration
  let config
  try {
    config = loadConfig()
  } catch (error) {
    console.error(
      "[opencode-pilotdeck] Failed to load configuration:",
      error instanceof Error ? error.message : error
    )
    // Return empty plugin if config invalid
    return {}
  }
  
  const logger = new Logger(config.debug)
  const pilotdeck = new PilotDeckClient(config)
  
  // Log plugin initialization
  logger.info("Plugin initialized", {
    version: "0.1.0",
    serverUrl: config.serverUrl,
    authenticated: !!config.token,
    injectProtocol: config.injectProtocol,
    projectMappings: config.projectMappings.length,
    worktree,
    directory
  })
  
  // Determine current project
  const currentProjectId = mapWorktreeToProject(
    worktree || directory,
    config
  )
  
  if (worktree) {
    logger.debug("Mapped worktree to project", {
      worktree,
      projectId: currentProjectId
    })
  }
  
  return {
    /**
     * Handle session lifecycle events
     */
    event: async ({ event }) => {
      const props = event.properties as Record<string, unknown> | undefined
      const sessionId = props?.sessionID as string | undefined
      
      const pluginContext = {
        sessionID: sessionId,
        agent: props?.agent as string | undefined,
        directory,
        worktree
      }
      
      await handleSessionEvent(event, pilotdeck, pluginContext, config, logger)
    },
    
    /**
     * Custom tools for agent progress reporting
     */
    tool: {
      "pilotdeck.event": createEventTool(pilotdeck, logger),
      "pilotdeck.action": createActionTool(pilotdeck, logger)
    },
    
    /**
     * Inject PilotDeck protocol into session context (compaction hook)
     */
    "experimental.session.compacting": async (_input, output) => {
      if (!config.injectProtocol) {
        logger.info("Protocol injection disabled, skipping")
        return
      }
      
      logger.info("Injecting PilotDeck protocol into session context")
      
      output.context.push(`
## PilotDeck Progress Reporting

${PILOTDECK_PROTOCOL}

Use \`pilotdeck.event\` and \`pilotdeck.action\` tools at key checkpoints only.
`)
    }
  }
}

// Export as default for OpenCode plugin loading
export default PilotDeckPlugin
