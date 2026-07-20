import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { fail } from "../errors.ts"
import { agentsPath, exists, isSafeRelativePath, listPayload, removeEmptyParents } from "../core/fs.ts"
import { loadModule, loadProject } from "../core/manifest.ts"
import type { InstalledModule, ModuleManifest, ModuleSource, ProjectManifest } from "../types.ts"

interface ResolvedModule { manifest: ModuleManifest; root: string; source: ModuleSource | undefined; link: boolean }
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

function sourceLabel(source?: ModuleSource) { return source?.local ?? source?.github ?? "the agentsrc catalog" }

function sameSourceLocation(left?: ModuleSource, right?: ModuleSource) {
  return left?.local === right?.local && left?.github === right?.github
}


async function downloadGithubModule(repository: string, name: string): Promise<ResolvedModule | Error> {
  const prefix = `modules/${name}/`
  const response = await fetch(`https://api.github.com/repos/${repository}/git/trees/HEAD?recursive=1`, { headers: { Accept: "application/vnd.github+json" } }).catch((cause) => fail(`Cannot fetch ${repository}`, cause))
  if (response instanceof Error) return response
  if (!response.ok) return fail(`Cannot fetch ${repository}: HTTP ${response.status}`)
  const tree = await response.json().catch((cause) => fail(`Invalid GitHub response for ${repository}`, cause)) as { tree?: Array<{ path?: string; type?: string }> } | Error
  if (tree instanceof Error) return tree
  const files = tree.tree?.filter((entry) => entry.type === "blob" && entry.path?.startsWith(prefix)).map((entry) => entry.path!) ?? []
  if (!files.includes(`${prefix}module.json`)) return fail(`Module ${name} is not available in ${repository}`)
  const root = await fs.mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "agentsrc-module-"))
  for (const remote of files) {
    const local = path.join(root, remote.slice(prefix.length))
    const raw = await fetch(`https://raw.githubusercontent.com/${repository}/HEAD/${remote}`).catch((cause) => fail(`Cannot download ${remote}`, cause))
    if (raw instanceof Error) return raw
    if (!raw.ok) return fail(`Cannot download ${remote}: HTTP ${raw.status}`)
    const content = await raw.arrayBuffer().catch((cause) => fail(`Cannot read ${remote}`, cause))
    if (content instanceof Error) return content
    const written = await fs.mkdir(path.dirname(local), { recursive: true }).then(() => fs.writeFile(local, Buffer.from(content))).catch((cause) => fail(`Cannot stage ${remote}`, cause))
    if (written instanceof Error) return written
  }
  const manifest = await loadModule(path.join(root, "module.json"))
  return manifest instanceof Error ? manifest : { manifest, root, source: { github: repository }, link: false }
}

async function resolveModule(root: string, name: string, source?: ModuleSource): Promise<ResolvedModule | Error> {
  if (source?.local && path.isAbsolute(source.local)) return fail(`Local module source must be relative to the client project: ${source.local}`)
  const local = source?.local ? path.resolve(root, source.local, "modules", name) : null
  if (local && await exists(local)) {
    const manifest = await loadModule(path.join(local, "module.json"))
    if (manifest instanceof Error && !source?.github) return manifest
    if (!(manifest instanceof Error)) return { manifest, root: local, source, link: true }
  }
  if (source?.github) {
    const downloaded = await downloadGithubModule(source.github, name)
    if (downloaded instanceof Error) return downloaded
    return { ...downloaded, source }
  }
  if (source) return fail(`Cannot resolve module ${name} from ${sourceLabel(source)}`)
  const catalog = path.join(packageRoot, "modules", name)
  if (await exists(catalog)) {
    const manifest = await loadModule(path.join(catalog, "module.json"))
    if (manifest instanceof Error) return manifest
    return { manifest, root: catalog, source: undefined, link: false }
  }
  return fail(`Cannot resolve module ${name} from ${sourceLabel(source)}`)
}

async function resolveClosure(root: string, name: string, source?: ModuleSource): Promise<ResolvedModule[] | Error> {
  const resolved: ResolvedModule[] = []
  const visiting = new Set<string>()
  const seen = new Set<string>()
  async function visit(next: string): Promise<null | Error> {
    if (visiting.has(next)) return fail(`Module dependency cycle includes ${next}`)
    if (seen.has(next)) return null
    visiting.add(next)
    const candidate = await resolveModule(root, next, source)
    const module = candidate instanceof Error && next !== name && source && /(?:Cannot resolve module|is not available)/.test(candidate.message)
      ? await resolveModule(root, next)
      : candidate
    if (module instanceof Error) return module
    if (module.manifest.name !== next) return fail(`Module manifest name ${module.manifest.name} does not match requested ${next}`)
    for (const dependency of module.manifest.dependencies) {
      const result = await visit(dependency)
      if (result instanceof Error) return result
    }
    visiting.delete(next); seen.add(next); resolved.push(module)
    return null
  }
  const result = await visit(name)
  return result instanceof Error ? result : resolved
}

async function payload(module: ResolvedModule): Promise<string[] | Error> {
  const files = await listPayload(module.root)
  if (files instanceof Error) return files
  const result = files.filter((file) => file !== "module.json")
  for (const file of result) if (!isSafeRelativePath(file) || file === ".agentsrc.json" || file.startsWith("docs/") || file.startsWith("sessions/") || file.startsWith("state/")) return fail(`Module ${module.manifest.name} has reserved destination ${file}`)
  return result
}

async function installPayload(root: string, module: ResolvedModule, files: string[]): Promise<null | Error> {
  for (const file of files) {
    const from = path.join(module.root, file)
    const to = path.join(agentsPath(root), file)
    if (await exists(to)) continue
    const result = await fs.mkdir(path.dirname(to), { recursive: true }).then(async () => {
      if (module.link) return fs.symlink(path.relative(path.dirname(to), from), to)
      return fs.copyFile(from, to)
    }).catch((cause) => fail(`Cannot install .agents/${file}`, cause))
    if (result instanceof Error) return result
  }
  return null
}

async function saveManifest(root: string, manifest: ProjectManifest) {
  const result = await fs.writeFile(path.join(agentsPath(root), ".agentsrc.json"), `${JSON.stringify(manifest, null, 2)}\n`).catch((cause) => fail("Cannot write module registry", cause))
  return result instanceof Error ? result : null
}

async function transaction(root: string, operation: () => Promise<null | Error>): Promise<null | Error> {
  const agents = agentsPath(root)
  const backup = path.join(root, `.agentsrc-module-backup-${process.pid}`)
  const stage = path.join(root, `.agentsrc-module-stage-${process.pid}`)
  const copied = await fs.rm(backup, { recursive: true, force: true }).then(() => fs.rm(stage, { recursive: true, force: true })).then(() => fs.cp(agents, stage, { recursive: true, dereference: false })).catch((cause) => fail("Cannot stage module transaction", cause))
  if (copied instanceof Error) return copied
  const snapshot = await fs.rename(agents, backup).then(() => fs.rename(stage, agents)).catch((cause) => fail("Cannot activate module transaction stage", cause))
  if (snapshot instanceof Error && !(await exists(agents))) await fs.rename(backup, agents).catch(() => undefined)
  if (snapshot instanceof Error) return snapshot
  const result = await operation()
  if (!(result instanceof Error)) {
    await fs.rm(backup, { recursive: true, force: true })
    return null
  }
  const restored = await fs.rm(agents, { recursive: true, force: true }).then(() => fs.rename(backup, agents)).catch((cause) => fail("Cannot restore module transaction backup", cause))
  return restored instanceof Error ? restored : result
}

async function installPreflight(root: string, project: ProjectManifest, planned: Array<{ module: ResolvedModule; files: string[] }>, replacing = new Set<string>()) {
  const destinations = new Set<string>()
  for (const item of planned) {
    const installed = project.modules.find((entry) => entry.name === item.module.manifest.name)
    if (installed && !replacing.has(installed.name) && !sameSourceLocation(installed.source, item.module.source)) return fail(`Module ${installed.name} is already installed from a different source`)
    if (installed && !replacing.has(installed.name)) continue
    for (const file of item.files) {
      if (destinations.has(file)) return fail(`Module destination collision: ${file}`)
      destinations.add(file)
      const installedFile = project.modules.some((entry) => !replacing.has(entry.name) && entry.files.includes(file))
      if (installedFile) continue
      const destination = path.join(agentsPath(root), file)
      const replacedDestination = project.modules.some((entry) => replacing.has(entry.name) && entry.files.includes(file))
      if (await exists(destination) && !replacedDestination) return fail(`Module destination is already occupied: .agents/${file}`)
    }
  }
  return null
}

export async function addModule(root: string, name: string, source?: ModuleSource): Promise<null | Error> {
  const project = await loadProject(root)
  if (project instanceof Error) return project
  const closure = await resolveClosure(root, name, source)
  if (closure instanceof Error) return closure
  const planned: Array<{ module: ResolvedModule; files: string[] }> = []
  for (const module of closure) {
    const files = await payload(module)
    if (files instanceof Error) return files
    planned.push({ module, files })
  }
  const preflight = await installPreflight(root, project, planned)
  if (preflight instanceof Error) return preflight
  const requested = planned.find((item) => item.module.manifest.name === name)
  if (!requested) return fail(`Module ${name} was not resolved`)
  const installedFiles = [...new Set(planned.flatMap((item) => item.files))].sort()
  const next: ProjectManifest = structuredClone(project)
  return await transaction(root, async () => {
    for (const item of planned) {
      const existing = next.modules.find((entry) => entry.name === item.module.manifest.name)
      const installed = await installPayload(root, item.module, item.files)
      if (installed instanceof Error) return installed
      if (existing || item.module.manifest.name !== name) continue
      next.modules.push({ name, source: requested.module.source, dependencies: requested.module.manifest.dependencies, files: installedFiles })
    }
    return await saveManifest(root, next)
  })
}

export async function removeModule(root: string, name: string): Promise<null | Error> {
  const project = await loadProject(root)
  if (project instanceof Error) return project
  const target = project.modules.find((module) => module.name === name)
  if (!target) {
    const dependents = project.modules.filter((module) => module.dependencies.includes(name))
    if (dependents.length) return fail(`Cannot remove ${name}; required by ${dependents.map((module) => module.name).join(", ")}`)
    return fail(`Module ${name} is not installed`)
  }
  const dependents = project.modules.filter((module) => module.dependencies.includes(name))
  if (dependents.length) return fail(`Cannot remove ${name}; required by ${dependents.map((module) => module.name).join(", ")}`)
  const retainedFiles = new Set(project.modules.filter((module) => module.name !== name).flatMap((module) => module.files))
  return await transaction(root, async () => {
    for (const file of target.files) {
      if (retainedFiles.has(file)) continue
      const destination = path.join(agentsPath(root), file)
      const removed = await fs.rm(destination, { force: true }).catch((cause) => fail(`Cannot remove .agents/${file}`, cause))
      if (removed instanceof Error) return removed
      await removeEmptyParents(destination, agentsPath(root))
    }
    return await saveManifest(root, { ...project, modules: project.modules.filter((module) => module.name !== name) })
  })
}

export async function updateModule(root: string, name: string): Promise<null | Error> {
  const project = await loadProject(root)
  if (project instanceof Error) return project
  const installed = project.modules.find((module) => module.name === name)
  if (!installed) return fail(`Module ${name} is not installed`)
  const closure = await resolveClosure(root, name, installed.source)
  if (closure instanceof Error) return closure
  const planned: Array<{ module: ResolvedModule; files: string[] }> = []
  for (const module of closure) {
    const files = await payload(module)
    if (files instanceof Error) return files
    planned.push({ module, files })
  }
  const preflight = await installPreflight(root, project, planned, new Set([name]))
  if (preflight instanceof Error) return preflight
  const requested = planned.find((item) => item.module.manifest.name === name)
  if (!requested) return fail(`Module ${name} was not resolved`)
  const installedFiles = [...new Set(planned.flatMap((item) => item.files))].sort()
  const retainedFiles = new Set(project.modules.filter((module) => module.name !== name).flatMap((module) => module.files))
  const next = structuredClone(project)
  return await transaction(root, async () => {
    for (const file of installed.files) {
      if (retainedFiles.has(file)) continue
      const removed = await fs.rm(path.join(agentsPath(root), file), { force: true }).catch((cause) => fail(`Cannot replace .agents/${file}`, cause))
      if (removed instanceof Error) return removed
    }
    next.modules = next.modules.filter((module) => module.name !== name)
    for (const item of planned) {
      const copied = await installPayload(root, item.module, item.files)
      if (copied instanceof Error) return copied
      if (item.module.manifest.name !== name) continue
      next.modules.push({ name, source: requested.module.source, dependencies: requested.module.manifest.dependencies, files: installedFiles })
    }
    return await saveManifest(root, next)
  })
}
