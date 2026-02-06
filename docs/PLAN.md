# opencode-pilotdeck Plugin Implementation Plan

## 0. Executive Summary

`opencode-pilotdeck` is an OpenCode plugin that integrates OpenCode sessions with PilotDeck's AgentOps × ProjectOps platform. The plugin captures session lifecycle, token usage, and agent actions, while providing custom tools for agents to report progress in a structured, auditable way.

**Key Objectives:**
1. **Full Coverage Token Attribution**: Capture all OpenCode usage regardless of entry point
2. **Structured Progress Reporting**: Provide custom tools for agents to write events/actions
3. **Non-Intrusive Protocol Injection**: Guide agent behavior through Rules without disrupting UX
4. **Idempotent API Integration**: Reliably report to PilotDeck Server with retry/deduplication

---

## 1. Plugin Architecture (Based on OpenCode Plugin API)

### 1.1 Plugin Structure

```typescript
// src/index.ts
import type { Plugin } from "@opencode-ai/plugin"

export const PilotDeckPlugin: Plugin = async (ctx) => {
  const { client, $, directory, worktree, project } = ctx
  
  // Initialize PilotDeck client
  const pilotdeck = createPilotDeckClient(config)
  
  return {
    // Event handlers
    event: async ({ event }) => { /* lifecycle tracking */ },
    
    // Custom tools
    tool: {
      "pilotdeck.event": createEventTool(pilotdeck),
      "pilotdeck.action": createActionTool(pilotdeck),
      "pilotdeck.run.start": createRunStartTool(pilotdeck),
      "pilotdeck.run.finish": createRunFinishTool(pilotdeck)
    },
    
    // Session compaction hook (for protocol injection)
    "experimental.session.compacting": async (input, output) => {
      output.context.push(getPilotDeckProtocol())
    }
  }
}
```

### 1.2 Key OpenCode APIs Used

**Event System:**
- `session.idle` - Session completion trigger for usage settlement
- `session.created` - Session start tracking
- `session.error` - Error tracking
- `session.status` - Status updates
- `message.updated` - Track agent/user messages

**Context Access:**
- `context.directory` - Current working directory
- `context.worktree` - Git worktree root
- `context.sessionID` - Unique session identifier
- `context.agent` - Current agent name

**Client SDK:**
- `client.app.log()` - Structured logging
- `client.session.get()` - Retrieve session details
- `client.project.getCurrent()` - Get project metadata

---

## 2. Implementation Phases

### Phase 0: Project Setup (Day 1)

**Deliverables:**
- TypeScript project structure with `@opencode-ai/plugin` dependency
- Build configuration (tsup/esbuild for ESM output)
- Configuration system (env vars + opencode config)
- Basic plugin loading with version logging

**File Structure:**
```
opencode-pilotdeck/
├── src/
│   ├── index.ts              # Plugin entry point
│   ├── config.ts             # Configuration loading
│   ├── client/               # PilotDeck API client
│   │   ├── index.ts
│   │   ├── types.ts
│   │   └── retry.ts
│   ├── handlers/             # Event handlers
│   │   ├── session.ts
│   │   └── usage.ts
│   ├── tools/                # Custom tools
│   │   ├── event.ts
│   │   ├── action.ts
│   │   └── run.ts
│   └── utils/
│       ├── idempotency.ts
│       └── logger.ts
├── docs/
│   ├── PLAN.md
│   ├── PROTOCOL.md           # PilotDeck Protocol for agents
│   └── TICKETS.md
├── package.json
├── tsconfig.json
└── README.md
```

**Acceptance Criteria:**
- Plugin loads successfully in OpenCode
- Configuration validation with clear error messages
- Version and config logged on startup

---

### Phase 1: Session Lifecycle & Run Reporting (Day 2-4)

**Implementation:**

```typescript
// src/handlers/session.ts
export async function handleSessionEvent(
  event: SessionEvent,
  pilotdeck: PilotDeckClient,
  context: PluginContext
) {
  switch (event.type) {
    case "session.created":
      await pilotdeck.createRun({
        source: "opencode",
        sessionId: event.properties.sessionID,
        projectId: mapWorktreeToProject(context.worktree),
        agent: context.agent,
        startedAt: new Date().toISOString(),
        status: "running"
      })
      break
      
    case "session.idle":
      const sessionId = event.properties.sessionID
      
      // Fetch session details for usage data
      const session = await context.client.session.get({ sessionId })
      
      // Update run with completion status and usage
      await pilotdeck.updateRun(sessionId, {
        status: "completed",
        finishedAt: new Date().toISOString(),
        usage: extractUsage(session),
        summary: session.summary
      })
      break
      
    case "session.error":
      await pilotdeck.updateRun(event.properties.sessionID, {
        status: "failed",
        error: event.properties.error
      })
      break
  }
}
```

**Key Design Decisions:**
- Run idempotency key: `source=opencode + sessionId`
- Project mapping: `worktree path → projectId` (configurable via env)
- Fallback: Create "Inbox" project if mapping not found

**Acceptance Criteria:**
- Every OpenCode session creates exactly one run in PilotDeck
- Run status accurately reflects session lifecycle
- Duplicate session events don't create duplicate runs

---

### Phase 2: Token Usage Attribution (Day 5-7)

**Implementation:**

```typescript
// src/handlers/usage.ts
export async function extractUsage(session: SessionDetails) {
  // OpenCode session object structure (from API research)
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cost: 0,
    model: session.model || "unknown"
  }
  
  // Aggregate from messages
  for (const message of session.messages || []) {
    if (message.usage) {
      usage.inputTokens += message.usage.input_tokens || 0
      usage.outputTokens += message.usage.output_tokens || 0
    }
  }
  
  usage.totalTokens = usage.inputTokens + usage.outputTokens
  usage.cost = calculateCost(usage, session.model)
  
  return usage
}

function calculateCost(usage: Usage, model: string): number {
  // Cost calculation based on model pricing
  // TODO: Integrate with OpenCode's cost tracking if available
  const pricing = MODEL_PRICING[model] || { input: 0, output: 0 }
  return (
    (usage.inputTokens / 1000000) * pricing.input +
    (usage.outputTokens / 1000000) * pricing.output
  )
}
```

**Project Attribution Strategy:**

```typescript
// src/config.ts
export interface ProjectMapping {
  worktree: string
  projectId: string
}

export function loadConfig(): PluginConfig {
  return {
    serverUrl: process.env.PILOTDECK_SERVER_URL || "http://localhost:3000",
    token: process.env.PILOTDECK_AGENT_TOKEN,
    projectMappings: JSON.parse(
      process.env.PILOTDECK_PROJECT_MAPPINGS || "[]"
    ) as ProjectMapping[],
    inboxProjectId: process.env.PILOTDECK_INBOX_PROJECT_ID || "inbox"
  }
}

export function mapWorktreeToProject(
  worktree: string,
  config: PluginConfig
): string {
  const mapping = config.projectMappings.find(m => 
    worktree.includes(m.worktree)
  )
  return mapping?.projectId || config.inboxProjectId
}
```

**Acceptance Criteria:**
- Usage data captured for all sessions with valid token counts
- Cost calculation accurate for major models (GPT, Claude, Gemini)
- Graceful degradation when usage data unavailable (log reason, report "unknown")

---

### Phase 3: Custom Tools for Agent Reporting (Day 8-10)

**Implementation:**

```typescript
// src/tools/event.ts
import { tool } from "@opencode-ai/plugin"

export function createEventTool(pilotdeck: PilotDeckClient) {
  return tool({
    description: `Write an append-only event to PilotDeck timeline.
Use this to record significant progress milestones:
- Task started with clear intent
- Blocked on external dependency
- Major milestone reached (e.g., "API endpoint functional")
- Task completed with summary

DO NOT use for every tool execution - only key checkpoints.`,
    
    args: {
      type: tool.schema.enum([
        "task_started",
        "milestone",
        "blocked",
        "scope_change",
        "task_completed"
      ]).describe("Event type category"),
      
      title: tool.schema.string()
        .describe("Brief event title (max 100 chars)"),
      
      description: tool.schema.string()
        .describe("Detailed description with context"),
      
      evidence: tool.schema.array(tool.schema.string()).optional()
        .describe("File paths, commit hashes, URLs as evidence"),
      
      idempotencyKey: tool.schema.string().optional()
        .describe("Optional key to prevent duplicate events")
    },
    
    async execute(args, context) {
      const key = args.idempotencyKey || 
        generateKey(context.sessionID, args.type, args.title)
      
      await pilotdeck.createEvent({
        runId: context.sessionID,
        type: args.type,
        title: args.title,
        description: args.description,
        evidence: args.evidence,
        createdBy: context.agent,
        idempotencyKey: key
      })
      
      return `Event recorded: ${args.title}`
    }
  })
}
```

```typescript
// src/tools/action.ts
export function createActionTool(pilotdeck: PilotDeckClient) {
  return tool({
    description: `Propose a semantic action that updates project state.
Actions are PROPOSALS that require human review before taking effect.
Use for changes like:
- Update project status (e.g., "blocked" → "in_progress")
- Add/update milestone
- Change priority
- Document decision

The action will appear in PilotDeck UI for review.`,
    
    args: {
      actionType: tool.schema.enum([
        "update_status",
        "update_milestone",
        "update_priority",
        "add_note"
      ]),
      
      payload: tool.schema.record(tool.schema.string(), tool.schema.any())
        .describe("Action-specific data (e.g., {status: 'blocked', reason: '...'})"),
      
      rationale: tool.schema.string()
        .describe("Why this action is recommended"),
      
      idempotencyKey: tool.schema.string().optional()
    },
    
    async execute(args, context) {
      await pilotdeck.createAction({
        runId: context.sessionID,
        type: args.actionType,
        payload: args.payload,
        rationale: args.rationale,
        status: "pending_review",
        proposedBy: context.agent,
        idempotencyKey: args.idempotencyKey || 
          generateKey(context.sessionID, args.actionType, args.rationale)
      })
      
      return `Action proposed for review: ${args.actionType}`
    }
  })
}
```

**Acceptance Criteria:**
- Tools callable by agents with proper schema validation
- Idempotency enforced (duplicate calls don't create duplicate records)
- Events/actions appear in PilotDeck timeline immediately
- Clear error messages when PilotDeck server unreachable

---

### Phase 4: Protocol Injection & Throttling (Day 11-14)

**Protocol Template:**

```markdown
<!-- docs/PROTOCOL.md -->
# PilotDeck Progress Reporting Protocol

## When to Report

Report progress to PilotDeck at these KEY CHECKPOINTS only:

1. **Task Start**: Use `pilotdeck.event` with type "task_started"
   - Include clear intent and expected outcome
   - Mention files/systems involved

2. **Status Change**: Use `pilotdeck.event` when:
   - Blocked on external dependency (type: "blocked")
   - Major milestone reached (type: "milestone")
   - Scope needs adjustment (type: "scope_change")

3. **Task Completion**: Use `pilotdeck.event` with type "task_completed"
   - Summarize what was accomplished
   - List changed files as evidence
   - Note any next steps or follow-up needed

## DO NOT Report

- ❌ Every tool execution (read/write/bash)
- ❌ Intermediate thinking or exploration
- ❌ Routine file edits unless they represent a milestone
- ❌ Speculative actions not yet taken

## Action Proposals

Use `pilotdeck.action` when recommending project-level changes:
- Updating project status (e.g., blocked → in_progress)
- Adjusting priority or milestones
- Documenting key decisions

Actions are PROPOSALS reviewed by humans before taking effect.

## Evidence Format

Always include evidence when available:
- File paths: `src/auth/login.ts`
- Commit hashes: `a1b2c3d`
- PR/Issue URLs: `https://github.com/org/repo/pull/123`
- Command outputs: (brief excerpts only)

## Idempotency

If you need to retry an operation, pass the same `idempotencyKey` to prevent duplicates.
```

**Injection Mechanism:**

```typescript
// src/index.ts (plugin hooks)
export const PilotDeckPlugin: Plugin = async (ctx) => {
  const config = loadConfig()
  const pilotdeck = createPilotDeckClient(config)
  
  return {
    event: async ({ event }) => {
      await handleSessionEvent(event, pilotdeck, ctx)
    },
    
    tool: {
      "pilotdeck.event": createEventTool(pilotdeck),
      "pilotdeck.action": createActionTool(pilotdeck)
    },
    
    // Protocol injection via session compaction hook
    "experimental.session.compacting": async (input, output) => {
      if (config.injectProtocol !== false) {
        output.context.push(`
## PilotDeck Progress Reporting

${PILOTDECK_PROTOCOL_TEXT}

Use \`pilotdeck.event\` and \`pilotdeck.action\` tools at key checkpoints only.
`)
      }
    }
  }
}
```

**Configuration:**

```json
// opencode.json (user can disable protocol)
{
  "plugin": ["opencode-pilotdeck"],
  "pilotdeck": {
    "injectProtocol": true,  // Set to false to disable
    "serverUrl": "https://pilotdeck.example.com",
    "projectMappings": [
      { "worktree": "/home/user/projects/myapp", "projectId": "proj_123" }
    ]
  }
}
```

**Acceptance Criteria:**
- Protocol injected into agent context without disrupting existing behavior
- Protocol can be disabled via config
- Agents naturally follow protocol guidelines (verified through manual testing)
- Event frequency reduced compared to unconstrained reporting

---

## 3. PilotDeck Server API Contract

The plugin consumes these endpoints (assumed to exist in PilotDeck Server):

### 3.1 Runs API

**Create/Update Run (Idempotent)**
```
POST /api/agent/runs
Headers:
  X-PM-Agent-Token: {token}
  Content-Type: application/json

Body:
{
  "source": "opencode",
  "sessionId": "ses_abc123",      // Unique key
  "projectId": "proj_xyz",
  "agent": "build",
  "startedAt": "2026-02-06T10:00:00Z",
  "status": "running" | "completed" | "failed",
  "finishedAt": "2026-02-06T10:30:00Z",
  "usage": {
    "inputTokens": 12000,
    "outputTokens": 3000,
    "totalTokens": 15000,
    "cost": 0.045,
    "model": "claude-sonnet-4"
  },
  "summary": "Implemented user authentication",
  "error": "..." // if failed
}

Response 200:
{
  "id": "run_abc123",
  "sessionId": "ses_abc123",
  "created": true | false  // false if already exists
}
```

### 3.2 Events API

**Create Event (Idempotent)**
```
POST /api/agent/events
Headers:
  X-PM-Agent-Token: {token}

Body:
{
  "runId": "ses_abc123",
  "type": "task_started" | "milestone" | "blocked" | "scope_change" | "task_completed",
  "title": "Implemented login endpoint",
  "description": "Created POST /api/auth/login with JWT token generation",
  "evidence": ["src/auth/login.ts", "tests/auth.test.ts"],
  "createdBy": "build",
  "idempotencyKey": "ses_abc123:milestone:login-endpoint"
}

Response 201:
{
  "id": "evt_xyz789",
  "created": true
}

Response 200 (duplicate):
{
  "id": "evt_xyz789",
  "created": false
}
```

### 3.3 Actions API

**Create Action (Idempotent)**
```
POST /api/agent/actions
Headers:
  X-PM-Agent-Token: {token}

Body:
{
  "runId": "ses_abc123",
  "type": "update_status" | "update_milestone" | "update_priority" | "add_note",
  "payload": { "status": "blocked", "reason": "Waiting for API key" },
  "rationale": "Cannot proceed with OAuth integration without credentials",
  "status": "pending_review",
  "proposedBy": "build",
  "idempotencyKey": "ses_abc123:update_status:blocked"
}

Response 201:
{
  "id": "act_123",
  "status": "pending_review"
}
```

---

## 4. Quality & Observability

### 4.1 Logging

Use OpenCode's structured logging:

```typescript
await client.app.log({
  body: {
    service: "opencode-pilotdeck",
    level: "info" | "debug" | "warn" | "error",
    message: "Run created",
    extra: { sessionId, projectId, runId }
  }
})
```

### 4.2 Error Handling

```typescript
// src/client/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts || 3
  const baseDelay = options.baseDelay || 1000
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxAttempts) throw error
      
      const delay = baseDelay * Math.pow(2, attempt - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw new Error("Retry exhausted")
}
```

### 4.3 Failure Modes

- **PilotDeck Server Unreachable**: Log error, continue OpenCode session normally
- **Authentication Failure**: Log clear error with config instructions
- **Idempotency Key Collision**: Accept existing record, log debug message
- **Network Timeout**: Retry with exponential backoff (max 3 attempts)

### 4.4 Testing

**Unit Tests:**
- Configuration loading and validation
- Usage calculation from session data
- Idempotency key generation
- Project mapping logic

**Integration Tests (Manual):**
1. Start OpenCode session → Verify run created in PilotDeck
2. Complete session → Verify run updated with usage
3. Call `pilotdeck.event` → Verify event appears in timeline
4. Retry with same key → Verify no duplicate records

---

## 5. Deployment & Distribution

### 5.1 NPM Package

```json
// package.json
{
  "name": "opencode-pilotdeck",
  "version": "0.1.0",
  "description": "OpenCode plugin for PilotDeck AgentOps integration",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch"
  },
  "keywords": ["opencode", "plugin", "pilotdeck", "agentops"],
  "dependencies": {
    "@opencode-ai/plugin": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsup": "^8.0.0"
  }
}
```

### 5.2 Installation Instructions

**For npm distribution:**
```json
// opencode.json
{
  "plugin": ["opencode-pilotdeck"]
}
```

**For local development:**
```bash
# Link plugin locally
cd ~/.config/opencode/plugins
ln -s /path/to/opencode-pilotdeck/dist/index.js pilotdeck.js
```

### 5.3 Configuration

```bash
# Environment variables (recommended for secrets)
export PILOTDECK_SERVER_URL="https://pilotdeck.example.com"
export PILOTDECK_AGENT_TOKEN="pd_agent_xxx"
export PILOTDECK_PROJECT_MAPPINGS='[{"worktree":"/home/user/myapp","projectId":"proj_123"}]'
export PILOTDECK_INBOX_PROJECT_ID="inbox"
```

OR

```json
// opencode.json (less secure for tokens)
{
  "pilotdeck": {
    "serverUrl": "https://pilotdeck.example.com",
    "projectMappings": [...]
  }
}
```

---

## 6. Success Metrics

**MVP Success (End of Phase 3):**
- ✅ Plugin loads without errors
- ✅ Every OpenCode session creates exactly one run
- ✅ Token usage captured and reported
- ✅ `pilotdeck.event` and `pilotdeck.action` tools functional
- ✅ Idempotency prevents duplicate records
- ✅ Clear error messages for misconfigurations

**V1 Success (End of Phase 4):**
- ✅ Protocol reduces event frequency by 70%+ vs. unconstrained
- ✅ Agents naturally follow protocol without explicit instruction
- ✅ No crashes or performance degradation in OpenCode
- ✅ PilotDeck Desktop can display run timelines accurately

---

## 7. Non-Goals (Out of Scope)

- ❌ PilotDeck Server schema/business logic
- ❌ Desktop app installation automation
- ❌ Complete conversation UI replication
- ❌ Real-time streaming of agent thoughts (only key checkpoints)
- ❌ Modifying OpenCode core behavior
- ❌ Complex multi-user permission systems

---

## 8. Next Steps

1. **Approve this plan** - Confirm architecture aligns with PilotDeck Server capabilities
2. **Initialize project** - Set up TypeScript build and OpenCode plugin structure
3. **Implement Phase 0-1** - Get basic plugin loading and run reporting working
4. **Test with PilotDeck Server** - Verify API contract matches implementation
5. **Iterate on protocol** - Refine throttling rules based on agent behavior

---

**Document Version:** 2.0  
**Last Updated:** 2026-02-06  
**Owner:** PilotDeck Engineering
