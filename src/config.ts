/**
 * Configuration management for opencode-pilotdeck plugin
 */

export interface ProjectMapping {
  worktree: string
  projectId: string
}

export interface PluginConfig {
  /** PilotDeck server URL */
  serverUrl: string
  
  /** Agent authentication token */
  token?: string
  
  /** Mapping from worktree paths to PilotDeck project IDs */
  projectMappings: ProjectMapping[]
  
  /** Fallback project ID for unmapped worktrees */
  inboxProjectId: string
  
  /** Whether to inject PilotDeck protocol into agent context */
  injectProtocol: boolean
  
  /** Enable debug logging */
  debug: boolean
}

const DEFAULT_CONFIG: Partial<PluginConfig> = {
  serverUrl: "http://localhost:3000",
  projectMappings: [],
  inboxProjectId: "inbox",
  injectProtocol: true,
  debug: false
}

/**
 * Load plugin configuration from environment variables
 */
export function loadConfig(): PluginConfig {
  const config: PluginConfig = {
    serverUrl: process.env.PILOTDECK_SERVER_URL || DEFAULT_CONFIG.serverUrl!,
    token: process.env.PILOTDECK_AGENT_TOKEN,
    projectMappings: parseProjectMappings(
      process.env.PILOTDECK_PROJECT_MAPPINGS
    ),
    inboxProjectId: process.env.PILOTDECK_INBOX_PROJECT_ID || DEFAULT_CONFIG.inboxProjectId!,
    injectProtocol: process.env.PILOTDECK_INJECT_PROTOCOL !== "false",
    debug: process.env.PILOTDECK_DEBUG === "true"
  }
  
  validateConfig(config)
  
  return config
}

function parseProjectMappings(json?: string): ProjectMapping[] {
  if (!json) return []
  
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) {
      throw new Error("PILOTDECK_PROJECT_MAPPINGS must be a JSON array")
    }
    return parsed
  } catch (error) {
    console.error("[opencode-pilotdeck] Failed to parse project mappings:", error)
    return []
  }
}

function validateConfig(config: PluginConfig): void {
  if (!config.serverUrl) {
    throw new Error(
      "[opencode-pilotdeck] PILOTDECK_SERVER_URL is required. " +
      "Set it in your environment or opencode config."
    )
  }
  
  if (!config.token) {
    console.warn(
      "[opencode-pilotdeck] PILOTDECK_AGENT_TOKEN not set. " +
      "Plugin will not be able to authenticate with PilotDeck server."
    )
  }
  
  // Validate URL format
  try {
    new URL(config.serverUrl)
  } catch {
    throw new Error(
      `[opencode-pilotdeck] Invalid PILOTDECK_SERVER_URL: ${config.serverUrl}`
    )
  }
}

/**
 * Map a worktree path to a PilotDeck project ID
 */
export function mapWorktreeToProject(
  worktree: string,
  config: PluginConfig
): string {
  // Normalize path separators for cross-platform compatibility
  const normalizedWorktree = worktree.replace(/\\/g, "/")
  
  const mapping = config.projectMappings.find(m => {
    const normalizedMapping = m.worktree.replace(/\\/g, "/")
    return normalizedWorktree.includes(normalizedMapping)
  })
  
  return mapping?.projectId || config.inboxProjectId
}
