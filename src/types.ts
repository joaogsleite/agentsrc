export const targetNames = ["claude", "codex", "gemini", "opencode"] as const
export type TargetName = (typeof targetNames)[number]

export interface ModuleSource {
  local?: string
  github?: string
}

export interface InstalledModule {
  name: string
  direct: boolean
  source?: ModuleSource
  dependencies: string[]
  files: string[]
}

export interface ProjectManifest {
  $schema?: string
  formatVersion: 1
  targets: TargetName[]
  modules: InstalledModule[]
}

export interface ModuleManifest {
  $schema?: string
  name: string
  description: string
  dependencies: string[]
}

export interface McpServer {
  name: string
  enabled?: boolean
  transport:
    | { type: "stdio"; command: string; args?: string[]; env?: string[]; cwd?: string }
    | { type: "http"; url: string; headers?: Record<string, string> }
  timeoutMs?: number
}

export interface CanonicalProject {
  rules: Array<{ path: string; content: string }>
  skills: Array<{ name: string; path: string; content: string }>
  agents: Array<{ name: string; path: string; content: string }>
  commands: Array<{ name: string; path: string; content: string }>
  memories: Array<{ path: string; content: string }>
  mcps: McpServer[]
}
