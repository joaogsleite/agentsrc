import fs from "node:fs/promises"
import path from "node:path"
import * as errore from "errore"
import { fail } from "../errors.ts"

export const manifestPath = (root: string) => path.join(root, ".agents", ".agentsrc.json")
export const agentsPath = (root: string) => path.join(root, ".agents")

export function isSafeRelativePath(value: string) {
  return value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes("..")
}

export function inside(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

export async function readJson<T>(file: string): Promise<T | Error> {
  const raw = await fs.readFile(file, "utf8").catch((cause) => fail(`Cannot read ${file}`, cause))
  if (raw instanceof Error) return raw
  const parsed = errore.try(() => JSON.parse(raw) as T)
  return parsed instanceof Error ? fail(`Invalid JSON in ${file}`, parsed) : parsed
}

export async function writeJson(file: string, value: unknown): Promise<null | Error> {
  const result = await fs.mkdir(path.dirname(file), { recursive: true })
    .then(() => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`))
    .catch((cause) => fail(`Cannot write ${file}`, cause))
  return result instanceof Error ? result : null
}

export async function exists(file: string) {
  return await fs.lstat(file).then(() => true).catch(() => false)
}

export async function listPayload(root: string): Promise<string[] | Error> {
  const files: string[] = []
  async function visit(directory: string): Promise<null | Error> {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch((cause) => fail(`Cannot read ${directory}`, cause))
    if (entries instanceof Error) return entries
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(root, absolute)
      if (!isSafeRelativePath(relative)) return fail(`Unsafe module path ${relative}`)
      if (entry.isSymbolicLink()) {
        const resolved = await fs.realpath(absolute).catch((cause) => fail(`Broken module symlink ${relative}`, cause))
        if (resolved instanceof Error) return resolved
        if (!inside(root, resolved)) return fail(`Module symlink escapes source root: ${relative}`)
        const target = await fs.stat(absolute).catch((cause) => fail(`Cannot inspect ${relative}`, cause))
        if (target instanceof Error) return target
        if (target.isDirectory()) return fail(`Module symlinked directories are not supported: ${relative}`)
        files.push(relative)
        continue
      }
      if (entry.isDirectory()) {
        const result = await visit(absolute)
        if (result instanceof Error) return result
        continue
      }
      if (!entry.isFile()) return fail(`Unsupported module entry: ${relative}`)
      files.push(relative)
    }
    return null
  }
  const result = await visit(root)
  return result instanceof Error ? result : files.sort()
}

export async function removeEmptyParents(file: string, stopAt: string) {
  let current = path.dirname(file)
  while (inside(stopAt, current) && current !== stopAt) {
    const removed = await fs.rmdir(current).then(() => true).catch(() => false)
    if (!removed) return
    current = path.dirname(current)
  }
}

export async function copyTree(source: string, destination: string, dereference = false): Promise<null | Error> {
  const result = await fs.cp(source, destination, { recursive: true, dereference })
    .catch((cause) => fail(`Cannot copy ${source}`, cause))
  return result instanceof Error ? result : null
}

export async function replaceDirectory(directory: string, build: (stage: string) => Promise<null | Error>): Promise<null | Error> {
  const stage = path.join(path.dirname(directory), `.${path.basename(directory)}.agentsrc-stage-${process.pid}`)
  const backup = `${stage}-backup`
  const setup = await fs.rm(stage, { recursive: true, force: true }).then(() => fs.mkdir(stage, { recursive: true }))
    .catch((cause) => fail(`Cannot stage ${directory}`, cause))
  if (setup instanceof Error) return setup
  const rendered = await build(stage)
  if (rendered instanceof Error) {
    await fs.rm(stage, { recursive: true, force: true })
    return rendered
  }
  const moved = await fs.rename(directory, backup).catch(async (cause) => {
    if (!(await exists(directory))) return null
    return fail(`Cannot replace ${directory}`, cause)
  })
  if (moved instanceof Error) return moved
  const installed = await fs.rename(stage, directory).catch((cause) => fail(`Cannot install ${directory}`, cause))
  if (installed instanceof Error) {
    await fs.rename(backup, directory).catch(() => undefined)
    return installed
  }
  await fs.rm(backup, { recursive: true, force: true })
  return null
}
