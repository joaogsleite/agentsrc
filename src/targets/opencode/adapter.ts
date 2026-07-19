import { mcpWrapperFiles, openCodeMcpConfig } from "../common.ts"
import type { TargetAdapter } from "../types.ts"

export const opencodeAdapter: TargetAdapter = {
  name: "opencode",
  validate() { return { errors: [], warnings: [] } },
  plan() { return { outputs: [".opencode", "opencode.json"], copies: ["agents", "commands", "skills"].map((folder) => ({ from: folder, to: `.opencode/${folder}` })) } },
  render(project) { return [{ path: "opencode.json", content: { instructions: [".agents/rules/**/*.md", ".agents/memories/**/*.md"], mcp: openCodeMcpConfig(project.mcps, ".opencode/agentsrc-mcps") } }, ...mcpWrapperFiles(project.mcps, ".opencode/agentsrc-mcps")] },
}
