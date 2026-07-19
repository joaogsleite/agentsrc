import fs from "node:fs/promises"
import path from "node:path"
import { fail } from "../errors.ts"
import { renderInstructions } from "../core/discovery.ts"
import { copyTree, exists } from "../core/fs.ts"
import type { CanonicalProject, McpServer, TargetName } from "../types.ts"

function mcpConfig(mcps: McpServer[]) {
  return Object.fromEntries(mcps.filter((mcp) => mcp.enabled !== false).map((mcp) => [mcp.name, mcp.transport.type === "stdio"
    ? { command: mcp.transport.command, args: mcp.transport.args ?? [], env: Object.fromEntries((mcp.transport.env ?? []).map((key) => [key, `{env:${key}}`])), cwd: mcp.transport.cwd, timeout: mcp.timeoutMs }
    : { type: "http", url: mcp.transport.url, headers: Object.fromEntries(Object.entries(mcp.transport.headers ?? {}).map(([key, env]) => [key, `{env:${env}}`])), timeout: mcp.timeoutMs },
  ]))
}

async function write(file: string, content: string | object) {
  const value = typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`
  const result = await fs.mkdir(path.dirname(file), { recursive: true }).then(() => fs.writeFile(file, value)).catch((cause) => fail(`Cannot write ${file}`, cause))
  return result instanceof Error ? result : null
}

async function copyCanonical(root: string, stage: string, project: CanonicalProject, folders: string[]) {
  for (const folder of folders) {
    const from = path.join(root, ".agents", folder)
    if (!(await exists(from))) continue
    const copied = await copyTree(from, path.join(stage, folder))
    if (copied instanceof Error) return copied
  }
  return null
}

async function treeSnapshot(root: string): Promise<Map<string, Buffer> | Error> {
  const entries = await fs.readdir(root, { recursive: true, withFileTypes: true }).catch((cause) => fail(`Cannot read ${root}`, cause))
  if (entries instanceof Error) return entries
  const files = entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name))
  const snapshot = new Map<string, Buffer>()
  for (const file of files) {
    const content = await fs.readFile(file).catch((cause) => fail(`Cannot read ${file}`, cause))
    if (content instanceof Error) return content
    snapshot.set(path.relative(root, file), content)
  }
  return snapshot
}

async function matches(expected: string, actual: string) {
  const expectedStat = await fs.stat(expected).catch(() => null)
  const actualStat = await fs.stat(actual).catch(() => null)
  if (!expectedStat || !actualStat || expectedStat.isDirectory() !== actualStat.isDirectory()) return false
  if (expectedStat.isFile()) {
    const [expectedContent, actualContent] = await Promise.all([fs.readFile(expected), fs.readFile(actual)])
    return expectedContent.equals(actualContent)
  }
  const [expectedTree, actualTree] = await Promise.all([treeSnapshot(expected), treeSnapshot(actual)])
  if (expectedTree instanceof Error || actualTree instanceof Error) return false
  if (expectedTree.size !== actualTree.size) return false
  for (const [file, content] of expectedTree) if (!actualTree.get(file)?.equals(content)) return false
  return true
}

export interface TargetRenderer { name: TargetName; output: string[]; render(root: string, stage: string, project: CanonicalProject): Promise<null | Error> }

const agentsMd: TargetRenderer = {
  name: "agents-md", output: ["AGENTS.md"],
  async render(_root, stage, project) { return await write(path.join(stage, "AGENTS.md"), renderInstructions(project)) },
}
const claude: TargetRenderer = {
  name: "claude", output: [".claude", "CLAUDE.md"],
  async render(root, stage, project) {
    const content = await write(path.join(stage, "CLAUDE.md"), renderInstructions(project)); if (content instanceof Error) return content
    const copied = await copyCanonical(root, path.join(stage, ".claude"), project, ["agents", "commands", "skills"]); if (copied instanceof Error) return copied
    return await write(path.join(stage, ".claude", "mcp.json"), { mcpServers: mcpConfig(project.mcps) })
  },
}
const codex: TargetRenderer = {
  name: "codex", output: [".codex"],
  async render(root, stage, project) {
    const copied = await copyCanonical(root, path.join(stage, ".codex"), project, ["agents", "commands", "skills"]); if (copied instanceof Error) return copied
    const instructions = await write(path.join(stage, ".codex", "AGENTS.md"), renderInstructions(project)); if (instructions instanceof Error) return instructions
    return await write(path.join(stage, ".codex", "config.json"), { mcpServers: mcpConfig(project.mcps) })
  },
}
const gemini: TargetRenderer = {
  name: "gemini", output: [".gemini", "GEMINI.md"],
  async render(root, stage, project) {
    const content = await write(path.join(stage, "GEMINI.md"), renderInstructions(project)); if (content instanceof Error) return content
    const copied = await copyCanonical(root, path.join(stage, ".gemini"), project, ["agents", "commands", "skills"]); if (copied instanceof Error) return copied
    return await write(path.join(stage, ".gemini", "settings.json"), { mcpServers: mcpConfig(project.mcps) })
  },
}
const opencode: TargetRenderer = {
  name: "opencode", output: [".opencode", "opencode.json"],
  async render(root, stage, project) {
    const created = await fs.mkdir(path.join(stage, ".opencode"), { recursive: true }).catch((cause) => fail("Cannot create OpenCode output", cause))
    if (created instanceof Error) return created
    const copied = await copyCanonical(root, path.join(stage, ".opencode"), project, ["agents", "commands", "skills"]); if (copied instanceof Error) return copied
    const config = { instructions: [".agents/rules/**/*.md", ".agents/memories/**/*.md"], mcp: mcpConfig(project.mcps) }
    return await write(path.join(stage, "opencode.json"), config)
  },
}
export const adapters: Record<TargetName, TargetRenderer> = { "agents-md": agentsMd, claude, codex, gemini, opencode }

async function renderTarget(root: string, target: TargetRenderer, project: CanonicalProject, check: boolean) {
  const temporary = path.join(root, `.agentsrc-render-${target.name}-${process.pid}`)
  await fs.rm(temporary, { recursive: true, force: true })
  const rendered = await target.render(root, temporary, project)
  if (rendered instanceof Error) return rendered
  if (check) {
    for (const output of target.output) {
      const expected = path.join(temporary, output)
      const actual = path.join(root, output)
      const same = await fs.stat(expected).then(() => fs.stat(actual)).then(async () => await matches(expected, actual)).catch(() => false)
      if (!same) { await fs.rm(temporary, { recursive: true, force: true }); return fail(`Generated ${output} is missing or out of date`) }
    }
    await fs.rm(temporary, { recursive: true, force: true })
    return null
  }
  for (const output of target.output) {
    const source = path.join(temporary, output)
    const destination = path.join(root, output)
    await fs.rm(destination, { recursive: true, force: true })
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.rename(source, destination)
  }
  await fs.rm(temporary, { recursive: true, force: true })
  return null
}

export async function generateTargets(root: string, targets: TargetName[], project: CanonicalProject, check: boolean) {
  for (const target of targets) {
    const result = await renderTarget(root, adapters[target], project, check)
    if (result instanceof Error) return result
  }
  return null
}
