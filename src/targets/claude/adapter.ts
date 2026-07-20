import { renderInstructions } from "../../core/discovery.ts"
import { claudeMcpConfig, mcpWrapperFiles } from "../common.ts"
import type { TargetAdapter } from "../types.ts"

export const claudeAdapter: TargetAdapter = {
  name: "claude",
  validate() { return { errors: [], warnings: [] } },
  plan() { return { outputs: [".claude", "CLAUDE.md", ".mcp.json"], copies: [...["agents", "commands", "skills"].map((folder) => ({ from: folder, to: `.claude/${folder}` })), { from: "rules", to: ".claude/rules", source: "builtin" }, { from: "skills/manage-agentsrc", to: ".claude/skills/manage-agentsrc", source: "builtin" }] } },
  render(project) { return [{ path: "CLAUDE.md", content: renderInstructions(project, "claude") }, { path: ".mcp.json", content: { mcpServers: claudeMcpConfig(project.mcps, ".claude/agentsrc-mcps") } }, ...mcpWrapperFiles(project.mcps, ".claude/agentsrc-mcps")] },
}
