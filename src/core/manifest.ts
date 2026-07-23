import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { fail } from "../errors.ts"
import { targetNames, type McpServer, type ModuleManifest, type ProjectManifest } from "../types.ts"
import { isSafeRelativePath, manifestPath, readJson } from "./fs.ts"

const moduleSourceSchema = z.object({ local: z.string().min(1).optional(), github: z.string().regex(/^[^/]+\/[^/]+$/).optional() }).strict()
const installedModuleSchema = z.object({ name: z.string().regex(/^[a-z0-9-]+$/), source: moduleSourceSchema.optional(), revision: z.string().regex(/^[0-9a-f]{40}$/) }).strict()
const projectSchema = z.object({
  $schema: z.string().optional(),
  formatVersion: z.literal(1),
  targets: z.array(z.enum(targetNames)).default([]),
  modules: z.array(installedModuleSchema).default([]),
}).strict()
const moduleSchema = z.object({ $schema: z.string().optional(), name: z.string().regex(/^[a-z0-9-]+$/), description: z.string(), dependencies: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]), files: z.array(z.string().refine(isSafeRelativePath, "must be a safe relative path")) }).strict()
const mcpSchema = z.object({
  $schema: z.string().optional(), name: z.string().regex(/^[a-z0-9-]+$/), enabled: z.boolean().optional(),
  transport: z.discriminatedUnion("type", [
    z.object({ type: z.literal("stdio"), command: z.string().min(1), args: z.array(z.string()).optional(), env: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).optional(), cwd: z.string().optional() }).strict(),
    z.object({ type: z.literal("http"), url: z.string().url(), headers: z.record(z.string(), z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).optional() }).strict(),
  ]), timeoutMs: z.number().int().positive().optional(),
}).strict()

export async function loadProject(root: string): Promise<ProjectManifest | Error> {
  const parsed = await readJson<unknown>(manifestPath(root))
  if (parsed instanceof Error) return parsed
  const result = projectSchema.safeParse(parsed)
  if (!result.success) return fail(`Invalid ${path.relative(root, manifestPath(root))}: ${result.error.issues.map((issue) => issue.message).join(", ")}`)
  return result.data
}

export async function loadModule(file: string): Promise<ModuleManifest | Error> {
  const parsed = await readJson<unknown>(file)
  if (parsed instanceof Error) return parsed
  return parseModule(parsed, file)
}

export function parseModule(value: unknown, label: string): ModuleManifest | Error {
  const result = moduleSchema.safeParse(value)
  return result.success ? result.data : fail(`Invalid ${label}: ${result.error.issues.map((issue) => issue.message).join(", ")}`)
}

export async function loadMcp(file: string): Promise<McpServer | Error> {
  const parsed = await readJson<unknown>(file)
  if (parsed instanceof Error) return parsed
  const result = mcpSchema.safeParse(parsed)
  return result.success ? result.data : fail(`Invalid ${file}: ${result.error.issues.map((issue) => issue.message).join(", ")}`)
}

export async function writeManagedGitignore(root: string): Promise<null | Error> {
  const file = path.join(root, ".gitignore")
  const block = managedGitignoreBlock
  const current = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? "" : fail(`Cannot read ${file}`, error))
  if (current instanceof Error) return current
  const next = current.replace(/(?:^|\n)# BEGIN agentsrc generated[\s\S]*?# END agentsrc generated\n?/, "").replace(/\s*$/, "")
  const result = await fs.writeFile(file, `${next ? `${next}\n\n` : ""}${block}\n`).catch((cause) => fail(`Cannot write ${file}`, cause))
  return result instanceof Error ? result : null
}

export async function hasManagedGitignore(root: string): Promise<boolean> {
  const file = path.join(root, ".gitignore")
  const text = await fs.readFile(file, "utf8").catch(() => "")
  const blocks = text.match(/# BEGIN agentsrc generated\n[\s\S]*?# END agentsrc generated/g) ?? []
  return blocks.length === 1 && blocks[0] === managedGitignoreBlock
}

export const managedGitignoreBlock = ["# BEGIN agentsrc generated", ".agents/sessions/", ".agents/state/", ".claude/", ".codex/", ".gemini/", ".opencode/", "AGENTS.md", "CLAUDE.md", "GEMINI.md", "opencode.json", ".mcp.json", "# END agentsrc generated"].join("\n")
