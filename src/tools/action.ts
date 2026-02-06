/**
 * pilotdeck.action tool - Propose semantic project actions
 */

import { tool } from "@opencode-ai/plugin"
import type { PilotDeckClient } from "../client/index.js"
import { generateIdempotencyKey } from "../utils/idempotency.js"
import { Logger } from "../utils/logger.js"

export function createActionTool(client: PilotDeckClient, logger: Logger) {
  return tool({
    description: `Propose a semantic action that updates project state.

Actions are PROPOSALS that require human review before taking effect.

Use for changes like:
- Update project status (e.g., "blocked" → "in_progress")
- Add/update milestone
- Change priority
- Document important decision

The action will appear in PilotDeck UI for review and confirmation.`,
    
    args: {
      actionType: tool.schema.enum([
        "update_status",
        "update_milestone",
        "update_priority",
        "add_note"
      ]).describe("Type of action being proposed"),
      
      payload: tool.schema.record(tool.schema.string(), tool.schema.any())
        .describe("Action-specific data (e.g., {status: 'blocked', reason: '...'})"),
      
      rationale: tool.schema.string()
        .describe("Why this action is recommended"),
      
      idempotencyKey: tool.schema.string().optional()
        .describe("Optional key to prevent duplicate actions")
    },
    
    async execute(args, context) {
      const sessionId = context.sessionID
      if (!sessionId) {
        throw new Error("Session ID not available in context")
      }
      
      const idempotencyKey = args.idempotencyKey || generateIdempotencyKey(
        sessionId,
        args.actionType,
        args.rationale.substring(0, 50)
      )
      
      logger.debug("Creating action proposal", {
        sessionId,
        actionType: args.actionType
      })
      
      try {
        await client.createAction({
          runId: sessionId,
          type: args.actionType,
          payload: args.payload,
          rationale: args.rationale,
          status: "pending_review",
          proposedBy: context.agent || "unknown",
          idempotencyKey
        })
        
        logger.info("Action proposed", {
          actionType: args.actionType
        })
        
        return `✓ Action proposed for review: ${args.actionType}\n\nThis proposal will appear in PilotDeck for human confirmation.`
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        logger.error("Failed to create action", {
          error: errorMsg,
          actionType: args.actionType
        })
        
        return `✗ Failed to propose action: ${errorMsg}`
      }
    }
  })
}
