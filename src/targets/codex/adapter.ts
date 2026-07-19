import { renderInstructions } from "../../core/discovery.ts"
import { codexMcpToml, mcpWrapperFiles } from "../common.ts"
import type { TargetAdapter } from "../types.ts"

export const codexAdapter: TargetAdapter = {
  name: "codex",
  validate(project) {
    const unsupported = project.agents.length + project.commands.length + project.skills.length
    return { errors: [], warnings: unsupported ? [`codex cannot represent ${unsupported} agent, command, or skill item(s)`] : [] }
  },
  plan() { return { outputs: [".codex"], copies: [] } },
  render(project) { return [{ path: ".codex/config.toml", content: codexMcpToml(project.mcps, ".codex/agentsrc-mcps") }, ...mcpWrapperFiles(project.mcps, ".codex/agentsrc-mcps")] },
}
