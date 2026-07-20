import { mcpWrapperFiles, openCodeMcpConfig } from "../common.ts"
import type { TargetAdapter } from "../types.ts"

export const opencodeAdapter: TargetAdapter = {
  name: "opencode",
  validate() { return { errors: [], warnings: [] } },
  plan() { return { outputs: [".opencode", "opencode.json"], copies: [...["agents", "commands", "skills"].map((folder) => ({ from: folder, to: `.opencode/${folder}` })), { from: "rules", to: ".opencode/rules", source: "builtin" }, { from: "skills/manage-agentsrc", to: ".opencode/skills/manage-agentsrc", source: "builtin" }] } },
  render(project) { return [{ path: "opencode.json", content: { instructions: [".opencode/rules/agentsrc-source-of-truth.md", ".agents/rules/**/*.md", ".agents/docs/INDEX.md"], mcp: openCodeMcpConfig(project.mcps, ".opencode/agentsrc-mcps") } }, ...mcpWrapperFiles(project.mcps, ".opencode/agentsrc-mcps")] },
}
