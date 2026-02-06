# opencode-pilotdeck

OpenCode plugin for **PilotDeck AgentOps × ProjectOps** integration.

## Features

- **📊 Full Session Tracking**: Automatically captures all OpenCode sessions as runs in PilotDeck
- **💰 Token Usage Attribution**: Reports token consumption and costs to PilotDeck for accurate project accounting
- **🎯 Custom Progress Tools**: Provides `pilotdeck.event` and `pilotdeck.action` tools for agents to report structured progress
- **📋 Protocol Injection**: Guides agent behavior to report at key checkpoints (not every step)
- **🔄 Idempotent API**: Retry-safe with deduplication to prevent duplicate records

## Installation

### From npm (recommended)

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-pilotdeck"]
}
```

### From local directory

For development, link the plugin:

```bash
cd ~/.config/opencode/plugins
ln -s /path/to/opencode-pilotdeck/dist/index.js pilotdeck.js
```

## Configuration

### Environment Variables

```bash
# Required: PilotDeck server URL
export PILOTDECK_SERVER_URL="https://pilotdeck.example.com"

# Required: Agent authentication token
export PILOTDECK_AGENT_TOKEN="pd_agent_xxxxxxxxxxxxx"

# Optional: Project mappings (JSON array)
export PILOTDECK_PROJECT_MAPPINGS='[
  {"worktree": "/home/user/projects/myapp", "projectId": "proj_123"},
  {"worktree": "/home/user/projects/webapp", "projectId": "proj_456"}
]'

# Optional: Fallback project for unmapped worktrees (default: "inbox")
export PILOTDECK_INBOX_PROJECT_ID="inbox"

# Optional: Disable protocol injection (default: true)
export PILOTDECK_INJECT_PROTOCOL="true"

# Optional: Enable debug logging (default: false)
export PILOTDECK_DEBUG="true"
```

### Alternative: opencode.json

You can also configure via `opencode.json` (less secure for tokens):

```json
{
  "plugin": ["opencode-pilotdeck"],
  "pilotdeck": {
    "serverUrl": "https://pilotdeck.example.com",
    "projectMappings": [
      {"worktree": "/home/user/myapp", "projectId": "proj_123"}
    ],
    "inboxProjectId": "inbox",
    "injectProtocol": true
  }
}
```

**Note:** `PILOTDECK_AGENT_TOKEN` should always be set via environment variable for security.

## Usage

### Automatic Session Tracking

Once configured, the plugin automatically:

1. **Creates a run** when an OpenCode session starts
2. **Updates the run** with completion status and token usage when the session ends
3. **Maps sessions to projects** based on worktree path

No additional action required from users or agents.

### Custom Tools for Agents

Agents can use these tools to report structured progress:

#### `pilotdeck.event`

Record append-only timeline events at key checkpoints:

```typescript
// Task started
await tools.pilotdeck.event({
  type: "task_started",
  title: "Implement user authentication",
  description: "Building JWT-based login system with refresh tokens",
  evidence: ["src/auth/login.ts", "src/auth/jwt.ts"]
})

// Major milestone
await tools.pilotdeck.event({
  type: "milestone",
  title: "Login endpoint functional",
  description: "POST /api/auth/login accepts credentials and returns JWT",
  evidence: ["tests/auth.test.ts", "commit:a1b2c3d"]
})

// Blocked
await tools.pilotdeck.event({
  type: "blocked",
  title: "Waiting for OAuth credentials",
  description: "Cannot proceed with Google login integration without client ID/secret",
  evidence: ["https://github.com/org/repo/issues/123"]
})

// Task completed
await tools.pilotdeck.event({
  type: "task_completed",
  title: "Authentication system complete",
  description: "Implemented login, logout, token refresh, and password reset flows",
  evidence: ["src/auth/", "tests/auth.test.ts", "docs/auth.md"]
})
```

#### `pilotdeck.action`

Propose semantic project updates (require human review):

```typescript
// Propose status change
await tools.pilotdeck.action({
  actionType: "update_status",
  payload: { status: "blocked", reason: "Missing API credentials" },
  rationale: "Cannot proceed with OAuth integration until credentials are provided"
})

// Propose milestone update
await tools.pilotdeck.action({
  actionType: "update_milestone",
  payload: { milestone: "Beta Launch", progress: 75 },
  rationale: "Authentication and core features complete, only UI polish remaining"
})
```

### Protocol: When to Report

The plugin injects a protocol that guides agents to report **only at key checkpoints**:

✅ **Do Report:**
- Task start with clear intent
- Blocked on external dependency
- Major milestone reached
- Scope change
- Task completion

❌ **Don't Report:**
- Every tool execution (read/write/bash)
- Intermediate thinking
- Routine file edits
- Speculative actions not taken

This keeps the PilotDeck timeline clean and focused on meaningful progress.

## Architecture

### Session Lifecycle Flow

```
OpenCode Session Start
  ↓
[Plugin] Listen to "session.created" event
  ↓
[Plugin] Create run in PilotDeck
  ↓
Agent works... (may call pilotdeck.event/action)
  ↓
[Plugin] Listen to "session.idle" event
  ↓
[Plugin] Fetch session details & usage
  ↓
[Plugin] Update run with completion status & tokens
  ↓
PilotDeck Timeline Updated
```

### File Structure

```
opencode-pilotdeck/
├── src/
│   ├── index.ts              # Plugin entry point
│   ├── config.ts             # Configuration loading
│   ├── protocol.ts           # PilotDeck protocol text
│   ├── client/               # PilotDeck API client
│   │   ├── index.ts
│   │   ├── types.ts
│   │   └── retry.ts
│   ├── handlers/             # Event handlers
│   │   └── session.ts
│   ├── tools/                # Custom tools
│   │   ├── event.ts
│   │   └── action.ts
│   └── utils/
│       ├── idempotency.ts
│       └── logger.ts
├── docs/
│   └── PLAN.md               # Implementation plan
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Build

```bash
# Install dependencies
bun install

# Build plugin
bun run build

# Watch mode for development
bun run dev
```

### Testing

```bash
# Type check
bun run typecheck

# Run tests (not yet implemented)
bun run test
```

### Local Development

1. Build the plugin: `bun run build`
2. Link to OpenCode: `ln -s $(pwd)/dist/index.js ~/.config/opencode/plugins/pilotdeck.js`
3. Set environment variables
4. Start OpenCode and verify plugin loads: look for `[opencode-pilotdeck] [INFO] Plugin initialized`

## Troubleshooting

### Plugin not loading

Check OpenCode logs for errors. Common issues:

- **Missing `@opencode-ai/plugin` dependency**: Run `bun install` in the plugin directory
- **Invalid configuration**: Check that `PILOTDECK_SERVER_URL` is set and valid
- **Build errors**: Run `bun run build` and fix any TypeScript errors

### No runs appearing in PilotDeck

1. **Check authentication**: Ensure `PILOTDECK_AGENT_TOKEN` is set and valid
2. **Check server URL**: Verify `PILOTDECK_SERVER_URL` is correct and reachable
3. **Enable debug logging**: Set `PILOTDECK_DEBUG=true` and check OpenCode logs
4. **Verify project mapping**: Check that worktree is mapped to a valid project ID

### Duplicate runs/events

The plugin uses idempotency keys to prevent duplicates. If you see duplicates:

1. Check that session IDs are unique
2. Verify PilotDeck server implements idempotency correctly
3. Check for multiple plugin instances running

## PilotDeck Server Requirements

The plugin expects these API endpoints:

- `POST /api/agent/runs` - Create/update run (idempotent by sessionId)
- `PATCH /api/agent/runs/:sessionId` - Update run status/usage
- `POST /api/agent/events` - Create event (idempotent by idempotencyKey)
- `POST /api/agent/actions` - Create action proposal (idempotent by idempotencyKey)

Authentication: `X-PM-Agent-Token` header

See [`docs/PLAN.md`](docs/PLAN.md) for detailed API contract.

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## License

MIT © PilotDeckAgentLabs

## Links

- [PilotDeck](https://github.com/PilotDeckAgentLabs)
- [OpenCode](https://opencode.ai)
- [Issue Tracker](https://github.com/PilotDeckAgentLabs/opencode-pilotdeck/issues)
