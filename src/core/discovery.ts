import fs from "node:fs/promises"
import path from "node:path"
import { fail } from "../errors.ts"
import type { CanonicalProject, TargetName } from "../types.ts"
import { isSafeRelativePath } from "./fs.ts"
import { loadMcp } from "./manifest.ts"

async function filesUnder(root: string, directory: string): Promise<string[] | Error> {
  const base = path.join(root, ".agents", directory)
  const entries = await fs.readdir(base, { recursive: true, withFileTypes: true }).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : fail(`Cannot read ${base}`, error))
  if (entries instanceof Error) return entries
  const files: string[] = []
  for (const entry of entries) {
    const file = path.join(entry.parentPath, entry.name)
    if (entry.isFile()) { files.push(path.relative(path.join(root, ".agents"), file)); continue }
    if (!entry.isSymbolicLink()) continue
    const target = await fs.stat(file).catch((cause) => fail(`Cannot resolve ${file}`, cause))
    if (target instanceof Error) return target
    if (!target.isFile()) return fail(`Canonical symlink must reference a file: ${file}`)
    files.push(path.relative(path.join(root, ".agents"), file))
  }
  return files.sort()
}

async function textFiles(root: string, directory: string): Promise<Array<{ path: string; content: string }> | Error> {
  const files = await filesUnder(root, directory)
  if (files instanceof Error) return files
  const loaded = await Promise.all(files.map(async (relative) => {
    const content = await fs.readFile(path.join(root, ".agents", relative), "utf8").catch((cause) => fail(`Cannot read .agents/${relative}`, cause))
    return content instanceof Error ? content : { path: relative, content }
  }))
  const text: Array<{ path: string; content: string }> = []
  for (const value of loaded) {
    if (value instanceof Error) return value
    text.push(value)
  }
  return text
}

async function documentationIndex(root: string): Promise<{ path: string; content: string } | Error> {
  const relative = "docs/INDEX.md"
  const content = await fs.readFile(path.join(root, ".agents", relative), "utf8").catch((cause: NodeJS.ErrnoException) => cause.code === "ENOENT" ? fail("Missing required .agents/docs/INDEX.md") : fail("Cannot read .agents/docs/INDEX.md", cause))
  return content instanceof Error ? content : { path: relative, content }
}

export async function discover(root: string): Promise<CanonicalProject | Error> {
  const [rules, skillsRaw, agentsRaw, commandsRaw, docsIndex, mcpFiles] = await Promise.all([
    textFiles(root, "rules"), textFiles(root, "skills"), textFiles(root, "agents"), textFiles(root, "commands"), documentationIndex(root), filesUnder(root, "mcps"),
  ])
  if (rules instanceof Error) return rules
  if (skillsRaw instanceof Error) return skillsRaw
  if (agentsRaw instanceof Error) return agentsRaw
  if (commandsRaw instanceof Error) return commandsRaw
  if (docsIndex instanceof Error) return docsIndex
  if (mcpFiles instanceof Error) return mcpFiles
  const skills = skillsRaw.filter((item) => path.basename(item.path) === "SKILL.md").map((item) => ({ ...item, name: path.basename(path.dirname(item.path)) }))
  const agents = agentsRaw.map((item) => ({ ...item, name: path.basename(item.path, path.extname(item.path)) }))
  const commands = commandsRaw.map((item) => ({ ...item, name: path.basename(item.path, path.extname(item.path)) }))
  const mcps = await Promise.all(mcpFiles.map(async (relative) => {
    if (!relative.startsWith("mcps/") || path.extname(relative) !== ".json") return fail(`MCP fragments must be .agents/mcps/<name>.json: ${relative}`)
    const mcp = await loadMcp(path.join(root, ".agents", relative))
    if (mcp instanceof Error) return mcp
    const expected = path.basename(relative, ".json")
    if (mcp.name !== expected) return fail(`MCP filename ${relative} must match server name ${mcp.name}`)
    if (mcp.transport.type === "stdio" && mcp.transport.cwd && !isSafeRelativePath(mcp.transport.cwd) && mcp.transport.cwd !== ".") return fail(`MCP cwd must be project-relative: ${mcp.name}`)
    return mcp
  }))
  const validMcps: CanonicalProject["mcps"] = []
  for (const mcp of mcps) {
    if (mcp instanceof Error) return mcp
    validMcps.push(mcp)
  }
  return { rules, skills, agents, commands, docsIndex, mcps: validMcps }
}

export function renderInstructions(_project: CanonicalProject, target?: TargetName) {
  const rule = target ? `\`.${target}/rules/agentsrc-source-of-truth.md\`` : "the generated target-local `rules/agentsrc-source-of-truth.md` file"
  const skill = target ? `\`.${target}/skills/manage-agentsrc/SKILL.md\`` : "the generated target-local `skills/manage-agentsrc/SKILL.md` file"
  const sections = [
    "# Project Agent Instructions",
    "",
    "`.agents/` is the canonical source for project agent configuration. Do not edit generated target files.",
    "",
    "Before substantive project work:",
    "",
    "- Read `.agents/docs/INDEX.md`, then load only the linked documentation relevant to the task.",
    "- Read every Markdown file under `.agents/rules/` and treat it as project instruction.",
    "- When the user explicitly requests a workflow, load the relevant `.agents/skills/*/SKILL.md` file.",
    "",
    "When changing agentsrc-managed configuration, first read " + rule + " and " + skill + ".",
    "",
    "Keep durable project documentation in `.agents/docs/`, session reports in `.agents/sessions/`, and temporary scratch state in `.agents/state/`. Do not create agent runtime data in generated target directories or the repository root.",
  ]
  return `${sections.join("\n").trim()}\n`
}
