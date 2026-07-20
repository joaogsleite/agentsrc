import { describe, expect, test } from "vitest"
import { adapters } from "./index.ts"
import type { CanonicalProject, TargetName } from "../types.ts"

const project: CanonicalProject = {
  rules: [{ path: "rules/style.md", content: "# Style\n" }],
  skills: [{ name: "release", path: "skills/release/SKILL.md", content: "# Release\n" }],
  agents: [{ name: "reviewer", path: "agents/reviewer.md", content: "# Reviewer\n" }],
  commands: [{ name: "ship", path: "commands/ship.md", content: "# Ship\n" }],
  docsIndex: { path: "docs/INDEX.md", content: "# Project Documentation\n\n- [Context](context.md)\n" },
  mcps: [{ name: "github", transport: { type: "stdio", command: "npx", args: ["-y", "@github/github-mcp-server"], env: ["GITHUB_TOKEN"] } }],
}

const expectedOutputs: Record<TargetName, string[]> = {
  claude: [".claude", "CLAUDE.md", ".mcp.json"],
  codex: [".codex"],
  gemini: [".gemini", "GEMINI.md"],
  opencode: [".opencode", "opencode.json"],
}

describe("target adapters", () => {
  test.each(Object.keys(adapters) as TargetName[])("%s exposes a complete target plan", (target) => {
    const adapter = adapters[target]
    expect(adapter.validate(project)).toEqual({ errors: [], warnings: target === "codex" || target === "gemini" ? [expect.any(String)] : [] })
    expect(adapter.plan(project).outputs).toEqual(expectedOutputs[target])
    expect(adapter.render(project).length).toBeGreaterThan(0)
  })

  test("projects declared stdio variables through a dotenv wrapper", () => {
    const rendered = adapters.opencode.render(project)
    const config = rendered.find((file) => file.path === "opencode.json")?.content
    const wrapper = rendered.find((file) => file.path === ".opencode/agentsrc-mcps/github.sh")?.content
    expect(config).toEqual(expect.objectContaining({ mcp: { github: expect.objectContaining({ type: "local", command: ["sh", ".opencode/agentsrc-mcps/github.sh"] }) } }))
    expect(wrapper).toContain('. "$PROJECT_ROOT/.env"')
    expect(wrapper).toContain("export GITHUB_TOKEN")
    expect(wrapper).not.toContain("GITHUB_TOKEN=")
  })

  test("loads only the documentation index in OpenCode", () => {
    const config = adapters.opencode.render(project).find((file) => file.path === "opencode.json")?.content
    expect(config).toEqual(expect.objectContaining({ instructions: [".opencode/rules/agentsrc-source-of-truth.md", ".agents/rules/**/*.md", ".agents/docs/INDEX.md"] }))
  })

  test.each(Object.keys(adapters) as TargetName[])("%s projects built-in agentsrc guidance", (target) => {
    const copies = adapters[target].plan(project).copies
    expect(copies).toEqual(expect.arrayContaining([{ from: "rules", to: `.${target}/rules`, source: "builtin" }, { from: "skills/manage-agentsrc", to: `.${target}/skills/manage-agentsrc`, source: "builtin" }]))
  })

  test.each(["codex", "gemini"] as const)("%s supports canonical skill fallback", (target) => {
    const skillOnlyProject = { ...project, agents: [], commands: [] }
    expect(adapters[target].validate(skillOnlyProject)).toEqual({ errors: [], warnings: [] })
  })

  test("uses each target's native MCP configuration shape", () => {
    const claude = adapters.claude.render(project).find((file) => file.path === ".mcp.json")?.content
    const codex = adapters.codex.render(project).find((file) => file.path === ".codex/config.toml")?.content
    const gemini = adapters.gemini.render(project).find((file) => file.path === ".gemini/settings.json")?.content
    expect(claude).toEqual(expect.objectContaining({ mcpServers: { github: expect.objectContaining({ type: "stdio" }) } }))
    expect(codex).toContain("[mcp_servers.github]")
    expect(gemini).toEqual(expect.objectContaining({ mcpServers: { github: expect.objectContaining({ command: "sh" }) } }))
  })
})
