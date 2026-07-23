import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import * as errore from "errore"
import { agentsPath, exists, isSafeRelativePath, listPayload, removeEmptyParents } from "../core/fs.ts"
import { loadModule, loadProject, parseModule } from "../core/manifest.ts"
import { fail } from "../errors.ts"
import type { InstalledModule, ModuleManifest, ModuleSource, ProjectManifest } from "../types.ts"

const run = promisify(execFile)
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

interface ResolvedModule {
  manifest: ModuleManifest
  root: string
  source: ModuleSource | undefined
  link: boolean
  revision: string
}

export interface InstalledModuleMetadata {
  files: string[]
  dependencies: string[]
}

function sourceLabel(source?: ModuleSource) { return source?.local ?? source?.github ?? "the agentsrc catalog" }

function sameSourceLocation(left?: ModuleSource, right?: ModuleSource) {
  return left?.local === right?.local && left?.github === right?.github
}

async function gitOutput(cwd: string, args: string[], label: string): Promise<string | Error> {
  const result = await run("git", args, { cwd }).catch((cause) => fail(`Cannot inspect Git source ${label}`, cause))
  return result instanceof Error ? result : result.stdout.trim()
}

async function gitRevision(cwd: string, label: string, requireClean: boolean): Promise<string | Error> {
  const repository = await gitOutput(cwd, ["rev-parse", "--show-toplevel"], label)
  if (repository instanceof Error) return repository
  if (requireClean) {
    const changes = await gitOutput(repository, ["status", "--porcelain"], label)
    if (changes instanceof Error) return changes
    if (changes) return fail(`Local module source ${label} has uncommitted changes; commit or stash them before installing or updating`)
  }
  return await gitOutput(repository, ["rev-parse", "HEAD"], label)
}

async function githubCommit(repository: string, ref = "HEAD"): Promise<{ revision: string; tree: string } | Error> {
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/${ref}`, { headers: { Accept: "application/vnd.github+json" } }).catch((cause) => fail(`Cannot fetch ${repository}`, cause))
  if (response instanceof Error) return response
  if (!response.ok) return fail(`Cannot fetch ${repository}: HTTP ${response.status}`)
  const body = await response.json().catch((cause) => fail(`Invalid GitHub response for ${repository}`, cause)) as { sha?: string; commit?: { tree?: { sha?: string } } } | Error
  if (body instanceof Error) return body
  if (!body.sha || !/^[0-9a-f]{40}$/.test(body.sha) || !body.commit?.tree?.sha) return fail(`Cannot resolve an immutable revision for ${repository}`)
  return { revision: body.sha, tree: body.commit.tree.sha }
}

async function downloadGithubModule(repository: string, name: string, revision?: string): Promise<ResolvedModule | Error> {
  const commit = await githubCommit(repository, revision)
  if (commit instanceof Error) return commit
  const sha = commit.revision
  const prefix = `modules/${name}/`
  const response = await fetch(`https://api.github.com/repos/${repository}/git/trees/${commit.tree}?recursive=1`, { headers: { Accept: "application/vnd.github+json" } }).catch((cause) => fail(`Cannot fetch ${repository}`, cause))
  if (response instanceof Error) return response
  if (!response.ok) return fail(`Cannot fetch ${repository}: HTTP ${response.status}`)
  const tree = await response.json().catch((cause) => fail(`Invalid GitHub response for ${repository}`, cause)) as { tree?: Array<{ path?: string; type?: string }> } | Error
  if (tree instanceof Error) return tree
  const files = tree.tree?.flatMap((entry) => entry.type === "blob" && entry.path?.startsWith(prefix) ? [entry.path] : []) ?? []
  if (!files.includes(`${prefix}module.json`)) return fail(`Module ${name} is not available in ${repository} at ${sha}`)
  const root = await fs.mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "agentsrc-module-")).catch((cause) => fail(`Cannot stage ${repository}`, cause))
  if (root instanceof Error) return root
  for (const remote of files) {
    const local = path.join(root, remote.slice(prefix.length))
    const raw = await fetch(`https://raw.githubusercontent.com/${repository}/${sha}/${remote}`).catch((cause) => fail(`Cannot download ${remote}`, cause))
    if (raw instanceof Error) return raw
    if (!raw.ok) return fail(`Cannot download ${remote}: HTTP ${raw.status}`)
    const content = await raw.arrayBuffer().catch((cause) => fail(`Cannot read ${remote}`, cause))
    if (content instanceof Error) return content
    const written = await fs.mkdir(path.dirname(local), { recursive: true }).then(() => fs.writeFile(local, Buffer.from(content))).catch((cause) => fail(`Cannot stage ${remote}`, cause))
    if (written instanceof Error) return written
  }
  const manifest = await loadModule(path.join(root, "module.json"))
  return manifest instanceof Error ? manifest : { manifest, root, source: { github: repository }, link: false, revision: sha }
}

async function resolveModule(root: string, name: string, source?: ModuleSource): Promise<ResolvedModule | Error> {
  if (source?.local && path.isAbsolute(source.local)) return fail(`Local module source must be relative to the client project: ${source.local}`)
  const sourceRoot = source?.local ? path.resolve(root, source.local) : null
  const local = sourceRoot ? path.join(sourceRoot, "modules", name) : null
  if (sourceRoot && source?.local && local && await exists(local)) {
    const manifest = await loadModule(path.join(local, "module.json"))
    if (manifest instanceof Error && !source?.github) return manifest
    if (!(manifest instanceof Error)) {
      const revision = await gitRevision(sourceRoot, source.local, true)
      return revision instanceof Error ? revision : { manifest, root: local, source, link: true, revision }
    }
  }
  if (source?.github) {
    const downloaded = await downloadGithubModule(source.github, name)
    if (downloaded instanceof Error) return downloaded
    return { ...downloaded, source: { github: source.github } }
  }
  if (source) return fail(`Cannot resolve module ${name} from ${sourceLabel(source)}`)
  const catalog = path.join(packageRoot, "modules", name)
  if (!(await exists(catalog))) return fail(`Cannot resolve module ${name} from the agentsrc catalog`)
  const manifest = await loadModule(path.join(catalog, "module.json"))
  if (manifest instanceof Error) return manifest
  const revision = await gitRevision(packageRoot, "the agentsrc catalog", false)
  return revision instanceof Error ? revision : { manifest, root: catalog, source: undefined, link: false, revision }
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
    const module = candidate instanceof Error && next !== name && source && /(?:Cannot resolve module|is not available)/.test(candidate.message) ? await resolveModule(root, next) : candidate
    if (module instanceof Error) return module
    if (module.manifest.name !== next) return fail(`Module manifest name ${module.manifest.name} does not match requested ${next}`)
    for (const dependency of module.manifest.dependencies) {
      const result = await visit(dependency)
      if (result instanceof Error) return result
    }
    visiting.delete(next)
    seen.add(next)
    resolved.push(module)
    return null
  }
  const result = await visit(name)
  return result instanceof Error ? result : resolved
}

async function loadModuleAtRevision(root: string, installed: InstalledModule): Promise<ModuleManifest | Error> {
  if (installed.source?.github) {
    const response = await fetch(`https://raw.githubusercontent.com/${installed.source.github}/${installed.revision}/modules/${installed.name}/module.json`).catch((cause) => fail(`Cannot fetch ${installed.name} at ${installed.revision}`, cause))
    if (response instanceof Error) return response
    if (!response.ok) return fail(`Cannot fetch ${installed.name} at ${installed.revision}: HTTP ${response.status}`)
    const value = await response.json().catch((cause) => fail(`Invalid module manifest for ${installed.name}`, cause))
    if (value instanceof Error) return value
    return parseModule(value, `${installed.source.github}@${installed.revision}:modules/${installed.name}/module.json`)
  }
  const repository = installed.source?.local ? path.resolve(root, installed.source.local) : packageRoot
  const raw = await gitOutput(repository, ["show", `${installed.revision}:modules/${installed.name}/module.json`], sourceLabel(installed.source))
  if (raw instanceof Error) return raw
  const value = errore.try(() => JSON.parse(raw) as unknown)
  if (value instanceof Error) return fail(`Invalid module manifest for ${installed.name}`, value)
  const label = `${sourceLabel(installed.source)}@${installed.revision}:modules/${installed.name}/module.json`
  const parsed = parseModule(value, label)
  if (!(parsed instanceof Error)) return parsed
  if (!value || typeof value !== "object" || Array.isArray(value) || "files" in value) return parsed
  const tree = await gitOutput(repository, ["ls-tree", "-r", "--name-only", installed.revision, "--", `modules/${installed.name}`], sourceLabel(installed.source))
  if (tree instanceof Error) return tree
  const prefix = `modules/${installed.name}/`
  const files = tree.split("\n").filter((file) => file.startsWith(prefix) && file !== `${prefix}module.json`).map((file) => file.slice(prefix.length))
  return parseModule({ ...value, files }, label)
}

async function payload(module: ResolvedModule): Promise<string[] | Error> {
  const actual = await listPayload(module.root)
  if (actual instanceof Error) return actual
  const files = [...new Set(module.manifest.files)].sort()
  if (files.length !== module.manifest.files.length || files.includes("module.json")) return fail(`Module ${module.manifest.name} has duplicate or invalid file declarations`)
  for (const file of files) {
    if (!isSafeRelativePath(file) || file === ".agentsrc.json" || file.startsWith(".agentsrc/") || file.startsWith("config/") || file.startsWith("docs/") || file.startsWith("sessions/") || file.startsWith("state/")) return fail(`Module ${module.manifest.name} has reserved destination ${file}`)
  }
  const expected = actual.filter((file) => file !== "module.json")
  if (files.length !== expected.length || files.some((file, index) => file !== expected[index])) return fail(`Module ${module.manifest.name} files must list every payload path exactly`)
  return files
}

async function installPayload(root: string, module: ResolvedModule, files: string[]): Promise<null | Error> {
  for (const file of files) {
    const from = path.join(module.root, file)
    const to = path.join(agentsPath(root), file)
    if (await exists(to)) continue
    const result = await fs.mkdir(path.dirname(to), { recursive: true }).then(async () => module.link ? await fs.symlink(path.relative(path.dirname(to), from), to) : await fs.copyFile(from, to)).catch((cause) => fail(`Cannot install .agents/${file}`, cause))
    if (result instanceof Error) return result
  }
  return null
}

function resolvedEntries(resolved: ResolvedModule[]): InstalledModule[] {
  return resolved.map(({ manifest, source, revision }) => ({ name: manifest.name, ...(source ? { source } : {}), revision }))
}

function mergeEntries(...groups: InstalledModule[][]): InstalledModule[] {
  const entries = new Map<string, InstalledModule>()
  for (const group of groups) for (const entry of group) entries.set(entry.name, entry)
  return [...entries.values()]
}

function nextProject(project: ProjectManifest, modules: InstalledModule[]): ProjectManifest {
  return { $schema: "https://raw.githubusercontent.com/joaogsleite/agentsrc/main/schemas/project-v1.json", formatVersion: 1, targets: project.targets, modules }
}

async function saveManifest(root: string, manifest: ProjectManifest): Promise<null | Error> {
  const result = await fs.writeFile(path.join(agentsPath(root), ".agentsrc.json"), `${JSON.stringify(nextProject(manifest, manifest.modules), null, 2)}\n`).catch((cause) => fail("Cannot write module registry", cause))
  return result instanceof Error ? result : null
}

export async function installedModuleMetadata(root: string, project: ProjectManifest): Promise<Map<string, InstalledModuleMetadata> | Error> {
  const metadata = new Map<string, InstalledModuleMetadata>()
  for (const module of project.modules) {
    const manifest = await loadModuleAtRevision(root, module)
    if (manifest instanceof Error) return manifest
    metadata.set(module.name, { files: manifest.files, dependencies: manifest.dependencies })
  }
  return metadata
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

async function installPreflight(root: string, project: ProjectManifest, metadata: Map<string, InstalledModuleMetadata>, planned: Array<{ module: ResolvedModule; files: string[] }>, replacing = new Set<string>()) {
  const destinations = new Set<string>()
  for (const item of planned) {
    const installed = project.modules.find((entry) => entry.name === item.module.manifest.name)
    if (installed && !replacing.has(installed.name) && !sameSourceLocation(installed.source, item.module.source)) return fail(`Module ${installed.name} is already installed from a different source`)
    if (installed && !replacing.has(installed.name)) continue
    for (const file of item.files) {
      if (destinations.has(file)) return fail(`Module destination collision: ${file}`)
      destinations.add(file)
      const installedFile = project.modules.some((entry) => !replacing.has(entry.name) && metadata.get(entry.name)?.files.includes(file))
      if (installedFile) continue
      const destination = path.join(agentsPath(root), file)
      const replaced = project.modules.some((entry) => replacing.has(entry.name) && metadata.get(entry.name)?.files.includes(file))
      if (await exists(destination) && !replaced) return fail(`Module destination is already occupied: .agents/${file}`)
    }
  }
  return null
}

function storedClosure(project: ProjectManifest, metadata: Map<string, InstalledModuleMetadata>, name: string): string[] | Error {
  const entries = new Set(project.modules.map((module) => module.name))
  const seen = new Set<string>()
  const visit = (next: string): Error | null => {
    if (seen.has(next)) return null
    if (!entries.has(next)) return fail(`Module ${name} references missing installed dependency ${next}`)
    seen.add(next)
    for (const dependency of metadata.get(next)?.dependencies ?? []) {
      const result = visit(dependency)
      if (result instanceof Error) return result
    }
    return null
  }
  const result = visit(name)
  return result instanceof Error ? result : [...seen]
}

function dependenciesOutside(metadata: Map<string, InstalledModuleMetadata>, outside: string[], candidates: Set<string>) {
  const required = new Set<string>()
  const visit = (name: string) => {
    if (required.has(name)) return
    required.add(name)
    for (const dependency of metadata.get(name)?.dependencies ?? []) visit(dependency)
  }
  for (const name of outside) visit(name)
  return new Set([...required].filter((name) => candidates.has(name)))
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
  const metadata = await installedModuleMetadata(root, project)
  if (metadata instanceof Error) return metadata
  const preflight = await installPreflight(root, project, metadata, planned)
  if (preflight instanceof Error) return preflight
  const next = nextProject(project, mergeEntries(project.modules, resolvedEntries(closure)))
  return await transaction(root, async () => {
    for (const item of planned) {
      if (project.modules.some((entry) => entry.name === item.module.manifest.name)) continue
      const installed = await installPayload(root, item.module, item.files)
      if (installed instanceof Error) return installed
    }
    return await saveManifest(root, next)
  })
}

export async function removeModule(root: string, name: string): Promise<null | Error> {
  const project = await loadProject(root)
  if (project instanceof Error) return project
  if (!project.modules.some((module) => module.name === name)) return fail(`Module ${name} is not installed`)
  const metadata = await installedModuleMetadata(root, project)
  if (metadata instanceof Error) return metadata
  const closure = storedClosure(project, metadata, name)
  if (closure instanceof Error) return closure
  const removedNames = new Set(closure)
  const outside = project.modules.map((module) => module.name).filter((module) => !removedNames.has(module))
  const required = dependenciesOutside(metadata, outside, removedNames)
  if (required.has(name)) return fail(`Module ${name} is required by ${outside.find((module) => metadata.get(module)?.dependencies.includes(name)) ?? "another installed module"}`)
  const retainedFiles = new Set(project.modules.filter((module) => !removedNames.has(module.name) || required.has(module.name)).flatMap((module) => metadata.get(module.name)?.files ?? []))
  const entries = project.modules.filter((module) => !removedNames.has(module.name) || required.has(module.name))
  return await transaction(root, async () => {
    for (const module of closure) {
      if (required.has(module)) continue
      for (const file of metadata.get(module)?.files ?? []) {
        if (retainedFiles.has(file)) continue
        const destination = path.join(agentsPath(root), file)
        const removed = await fs.rm(destination, { force: true }).catch((cause) => fail(`Cannot remove .agents/${file}`, cause))
        if (removed instanceof Error) return removed
        await removeEmptyParents(destination, agentsPath(root))
      }
    }
    return await saveManifest(root, nextProject(project, entries))
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
  const metadata = await installedModuleMetadata(root, project)
  if (metadata instanceof Error) return metadata
  const oldClosure = storedClosure(project, metadata, name)
  if (oldClosure instanceof Error) return oldClosure
  const oldNames = new Set(oldClosure)
  const preflight = await installPreflight(root, project, metadata, planned, oldNames)
  if (preflight instanceof Error) return preflight
  const outside = project.modules.map((module) => module.name).filter((module) => !oldNames.has(module))
  const required = dependenciesOutside(metadata, outside, oldNames)
  const retainedFiles = new Set(project.modules.filter((module) => !oldNames.has(module.name) || required.has(module.name)).flatMap((module) => metadata.get(module.name)?.files ?? []))
  const base = project.modules.filter((module) => !oldNames.has(module.name) || required.has(module.name))
  const next = nextProject(project, mergeEntries(base, resolvedEntries(closure)))
  return await transaction(root, async () => {
    for (const module of oldClosure) {
      if (required.has(module)) continue
      for (const file of metadata.get(module)?.files ?? []) {
        if (retainedFiles.has(file)) continue
        const removed = await fs.rm(path.join(agentsPath(root), file), { force: true }).catch((cause) => fail(`Cannot replace .agents/${file}`, cause))
        if (removed instanceof Error) return removed
      }
    }
    for (const item of planned) {
      const copied = await installPayload(root, item.module, item.files)
      if (copied instanceof Error) return copied
    }
    return await saveManifest(root, next)
  })
}
