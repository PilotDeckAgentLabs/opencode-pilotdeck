/**
 * PilotDeck Protocol for agent behavior
 */

export const PILOTDECK_PROTOCOL = `
## PilotDeck Progress Reporting Protocol

### When to Report

Report progress to PilotDeck at these KEY CHECKPOINTS only:

1. **Task Start**: Use \`pilotdeck.event\` with type "task_started"
   - Include clear intent and expected outcome
   - Mention files/systems involved

2. **Status Change**: Use \`pilotdeck.event\` when:
   - Blocked on external dependency (type: "blocked")
   - Major milestone reached (type: "milestone")
   - Scope needs adjustment (type: "scope_change")

3. **Task Completion**: Use \`pilotdeck.event\` with type "task_completed"
   - Summarize what was accomplished
   - List changed files as evidence
   - Note any next steps or follow-up needed

### DO NOT Report

- ❌ Every tool execution (read/write/bash)
- ❌ Intermediate thinking or exploration
- ❌ Routine file edits unless they represent a milestone
- ❌ Speculative actions not yet taken

### Action Proposals

Use \`pilotdeck.action\` when recommending project-level changes:
- Updating project status (e.g., blocked → in_progress)
- Adjusting priority or milestones
- Documenting key decisions

Actions are PROPOSALS reviewed by humans before taking effect.

### Evidence Format

Always include evidence when available:
- File paths: \`src/auth/login.ts\`
- Commit hashes: \`a1b2c3d\`
- PR/Issue URLs: \`https://github.com/org/repo/pull/123\`
- Command outputs: (brief excerpts only)

### Idempotency

If you need to retry an operation, pass the same \`idempotencyKey\` to prevent duplicates.
`.trim()
