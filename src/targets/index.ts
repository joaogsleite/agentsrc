import fs from "node:fs/promises"
import path from "node:path"
import { fail } from "../errors.ts"
import { renderInstructions } from "../core/discovery.ts"
import { copyTree, exists } from "../core/fs.ts"
import type { CanonicalProject, TargetName } from "../types.ts"
import { claudeAdapter } from "./claude/adapter.ts"
import { codexAdapter } from "./codex/adapter.ts"
import { geminiAdapter } from "./gemini/adapter.ts"
import { opencodeAdapter } from "./opencode/adapter.ts"
import type { RenderedFile, TargetAdapter, TargetPlan } from "./types.ts"

export const adapters: Record<TargetName, TargetAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter,
  opencode: opencodeAdapter,
}

async function write(file: string, content: string | object) {
  const value = typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`
  const result = await fs.mkdir(path.dirname(file), { recursive: true }).then(() => fs.writeFile(file, value)).catch((cause) => fail(`Cannot write ${file}`, cause))
  return result instanceof Error ? result : null
}

async function materialize(root: string, stage: string, plan: TargetPlan, files: RenderedFile[]) {
  for (const output of plan.outputs) {
    if (path.extname(output)) continue
    const result = await fs.mkdir(path.join(stage, output), { recursive: true }).catch((cause) => fail(`Cannot create ${output}`, cause))
    if (result instanceof Error) return result
  }
  for (const copy of plan.copies) {
    const source = path.join(root, ".agents", copy.from)
    if (!(await exists(source))) continue
    const result = await copyTree(source, path.join(stage, copy.to))
    if (result instanceof Error) return result
  }
  for (const file of files) {
    const result = await write(path.join(stage, file.path), file.content)
    if (result instanceof Error) return result
  }
  return null
}

async function treeSnapshot(root: string): Promise<Map<string, string> | Error> {
  const entries = await fs.readdir(root, { recursive: true, withFileTypes: true }).catch((cause) => fail(`Cannot read ${root}`, cause))
  if (entries instanceof Error) return entries
  const snapshot = new Map<string, string>()
  for (const entry of entries) {
    const file = path.join(entry.parentPath, entry.name)
    const relative = path.relative(root, file)
    const stat = await fs.lstat(file).catch((cause) => fail(`Cannot inspect ${file}`, cause))
    if (stat instanceof Error) return stat
    if (stat.isDirectory()) { snapshot.set(relative, "directory"); continue }
    if (stat.isSymbolicLink()) {
      const link = await fs.readlink(file).catch((cause) => fail(`Cannot read link ${file}`, cause))
      if (link instanceof Error) return link
      snapshot.set(relative, `symlink:${link}`)
      continue
    }
    if (!stat.isFile()) return fail(`Unsupported generated output entry ${relative}`)
    const content = await fs.readFile(file).catch((cause) => fail(`Cannot read ${file}`, cause))
    if (content instanceof Error) return content
    snapshot.set(relative, `file:${content.toString("base64")}`)
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
  for (const [file, content] of expectedTree) if (actualTree.get(file) !== content) return false
  return true
}

async function renderPlan(root: string, name: string, plan: TargetPlan, files: RenderedFile[], check: boolean) {
  const temporary = path.join(root, `.agentsrc-render-${name}-${process.pid}`)
  await fs.rm(temporary, { recursive: true, force: true })
  const rendered = await materialize(root, temporary, plan, files)
  if (rendered instanceof Error) return rendered
  if (check) {
    for (const output of plan.outputs) {
      const same = await matches(path.join(temporary, output), path.join(root, output))
      if (!same) { await fs.rm(temporary, { recursive: true, force: true }); return fail(`Generated ${output} is missing or out of date`) }
    }
    await fs.rm(temporary, { recursive: true, force: true })
    return null
  }
  for (const output of plan.outputs) {
    const source = path.join(temporary, output)
    const destination = path.join(root, output)
    await fs.rm(destination, { recursive: true, force: true })
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.rename(source, destination)
  }
  await fs.rm(temporary, { recursive: true, force: true })
  return null
}

async function renderTarget(root: string, adapter: TargetAdapter, project: CanonicalProject, check: boolean) {
  const diagnostics = adapter.validate(project)
  if (diagnostics.errors.length) return fail(diagnostics.errors.join("\n"))
  return await renderPlan(root, adapter.name, adapter.plan(project), adapter.render(project), check)
}

export async function generateTargets(root: string, targets: TargetName[], project: CanonicalProject, check: boolean) {
  const base = await renderPlan(root, "agents", { outputs: ["AGENTS.md"], copies: [] }, [{ path: "AGENTS.md", content: renderInstructions(project) }], check)
  if (base instanceof Error) return base
  for (const target of targets) {
    const result = await renderTarget(root, adapters[target], project, check)
    if (result instanceof Error) return result
  }
  return null
}
