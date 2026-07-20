import fs from "node:fs/promises"
import path from "node:path"
import { fail } from "../errors.ts"
import type { CanonicalProject } from "../types.ts"
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

export async function discover(root: string): Promise<CanonicalProject | Error> {
  const [rules, skillsRaw, agentsRaw, commandsRaw, memories, mcpFiles] = await Promise.all([
    textFiles(root, "rules"), textFiles(root, "skills"), textFiles(root, "agents"), textFiles(root, "commands"), textFiles(root, "memories"), filesUnder(root, "mcps"),
  ])
  if (rules instanceof Error) return rules
  if (skillsRaw instanceof Error) return skillsRaw
  if (agentsRaw instanceof Error) return agentsRaw
  if (commandsRaw instanceof Error) return commandsRaw
  if (memories instanceof Error) return memories
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
  return { rules, skills, agents, commands, memories, mcps: validMcps }
}

export function renderInstructions(project: CanonicalProject) {
  const sections = [
    "# Project Agent Instructions",
    "",
    "Agent configuration, durable memory, and scratch state belong under `.agents/`. Do not create agent runtime data in generated target directories or the repository root.",
    ...project.rules.flatMap((rule) => ["", `## ${rule.path}`, "", rule.content.trim()]),
    ...(project.memories.length ? ["", "## Durable Memory", "", ...project.memories.map((memory) => `- \.agents/${memory.path}`)] : []),
    ...(project.skills.length ? ["", "## Skills", "", ...project.skills.map((skill) => `- **${skill.name}**: \.agents/${skill.path}`)] : []),
  ]
  return `${sections.join("\n").trim()}\n`
}
