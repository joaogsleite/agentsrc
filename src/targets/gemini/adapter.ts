import { renderInstructions } from "../../core/discovery.ts"
import { geminiMcpConfig, mcpWrapperFiles } from "../common.ts"
import type { TargetAdapter } from "../types.ts"

export const geminiAdapter: TargetAdapter = {
  name: "gemini",
  validate(project) {
    const errors = project.mcps.filter((mcp) => mcp.transport.type === "http" && Object.keys(mcp.transport.headers ?? {}).length).map((mcp) => `gemini cannot safely express environment-backed HTTP headers for ${mcp.name}`)
    const unsupported = project.agents.length + project.commands.length
    return { errors, warnings: unsupported ? [`gemini cannot natively represent ${unsupported} agent or command item(s)`] : [] }
  },
  plan() { return { outputs: [".gemini", "GEMINI.md"], copies: [{ from: "rules", to: ".gemini/rules", source: "builtin" }, { from: "skills/manage-agentsrc", to: ".gemini/skills/manage-agentsrc", source: "builtin" }] } },
  render(project) { return [{ path: "GEMINI.md", content: renderInstructions(project, "gemini") }, { path: ".gemini/settings.json", content: { mcpServers: geminiMcpConfig(project.mcps, ".gemini/agentsrc-mcps") } }, ...mcpWrapperFiles(project.mcps, ".gemini/agentsrc-mcps")] },
}
