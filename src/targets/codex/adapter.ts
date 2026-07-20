import { renderInstructions } from "../../core/discovery.ts"
import { codexMcpToml, mcpWrapperFiles } from "../common.ts"
import type { TargetAdapter } from "../types.ts"

export const codexAdapter: TargetAdapter = {
  name: "codex",
  validate(project) {
    const unsupported = project.agents.length + project.commands.length
    return { errors: [], warnings: unsupported ? [`codex cannot natively represent ${unsupported} agent or command item(s)`] : [] }
  },
  plan() { return { outputs: [".codex"], copies: [{ from: "rules", to: ".codex/rules", source: "builtin" }, { from: "skills/manage-agentsrc", to: ".codex/skills/manage-agentsrc", source: "builtin" }] } },
  render(project) { return [{ path: ".codex/config.toml", content: codexMcpToml(project.mcps, ".codex/agentsrc-mcps") }, ...mcpWrapperFiles(project.mcps, ".codex/agentsrc-mcps")] },
}
