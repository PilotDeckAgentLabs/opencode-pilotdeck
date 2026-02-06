/**
 * pilotdeck.event tool - Record timeline events
 */

import { tool } from "@opencode-ai/plugin"
import type { PilotDeckClient } from "../client/index.js"
import { generateIdempotencyKey } from "../utils/idempotency.js"
import { Logger } from "../utils/logger.js"

export function createEventTool(client: PilotDeckClient, logger: Logger) {
  return tool({
    description: `Write an append-only event to PilotDeck timeline.

Use this to record SIGNIFICANT PROGRESS MILESTONES:
- Task started with clear intent
- Blocked on external dependency
- Major milestone reached (e.g., "API endpoint functional")
- Scope changed significantly
- Task completed with summary

DO NOT use for:
- Every tool execution (read/write/bash)
- Intermediate thinking or exploration
- Routine file edits unless they represent a milestone

Always include evidence (file paths, commits, URLs) when available.`,
    
    args: {
      type: tool.schema.enum([
        "task_started",
        "milestone",
        "blocked",
        "scope_change",
        "task_completed"
      ]).describe("Event type category"),
      
      title: tool.schema.string()
        .max(100)
        .describe("Brief event title (max 100 chars)"),
      
      description: tool.schema.string()
        .describe("Detailed description with context"),
      
      evidence: tool.schema.array(tool.schema.string()).optional()
        .describe("File paths, commit hashes, URLs as evidence"),
      
      idempotencyKey: tool.schema.string().optional()
        .describe("Optional key to prevent duplicate events (auto-generated if not provided)")
    },
    
    async execute(args, context) {
      const sessionId = context.sessionID
      if (!sessionId) {
        throw new Error("Session ID not available in context")
      }
      
      const idempotencyKey = args.idempotencyKey || generateIdempotencyKey(
        sessionId,
        args.type,
        args.title
      )
      
      logger.debug("Creating event", {
        sessionId,
        type: args.type,
        title: args.title
      })
      
      try {
        await client.createEvent({
          runId: sessionId,
          type: args.type,
          title: args.title,
          description: args.description,
          evidence: args.evidence,
          createdBy: context.agent || "unknown",
          idempotencyKey
        })
        
        logger.info("Event recorded", {
          type: args.type,
          title: args.title
        })
        
        return `✓ Event recorded: ${args.title}`
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        logger.error("Failed to create event", {
          error: errorMsg,
          type: args.type,
          title: args.title
        })
        
        return `✗ Failed to record event: ${errorMsg}`
      }
    }
  })
}
