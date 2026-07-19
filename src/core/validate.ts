import fs from "node:fs/promises"
import path from "node:path"
import { fail } from "../errors.ts"
import { agentsPath, exists, inside, isSafeRelativePath } from "./fs.ts"
import { loadProject, hasManagedGitignore } from "./manifest.ts"
import { discover } from "./discovery.ts"

export interface ValidationResult { errors: string[]; warnings: string[] }

export async function validateProject(root: string, strict = false): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const manifest = await loadProject(root)
  if (manifest instanceof Error) return { errors: [manifest.message], warnings }
  const modules = manifest.modules
  if (!(await hasManagedGitignore(root))) errors.push("Missing or invalid agentsrc managed .gitignore block")
  const names = new Set<string>()
  const files = new Set<string>()
  for (const module of modules) {
    if (names.has(module.name)) errors.push(`Duplicate module registry entry: ${module.name}`)
    names.add(module.name)
    for (const dependency of module.dependencies) if (!modules.some((candidate) => candidate.name === dependency)) errors.push(`${module.name} depends on missing module ${dependency}`)
    for (const file of module.files) {
      if (!isSafeRelativePath(file) || file === ".agentsrc.json" || file.startsWith("state/")) errors.push(`Unsafe installed module path: ${module.name}/${file}`)
      if (files.has(file)) errors.push(`Module destination collision: ${file}`)
      files.add(file)
      const destination = path.join(agentsPath(root), file)
      const stat = await fs.lstat(destination).catch(() => null)
      if (!stat) errors.push(`Missing module file: .agents/${file}`)
      if (stat?.isSymbolicLink()) {
        const resolved = await fs.realpath(destination).catch(() => null)
        if (!resolved || !inside(root, resolved)) errors.push(`Broken or escaping module link: .agents/${file}`)
      }
    }
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  function walk(name: string) {
    if (visiting.has(name)) { errors.push(`Module dependency cycle includes ${name}`); return }
    if (visited.has(name)) return
    visiting.add(name)
    const entry = modules.find((module) => module.name === name)
    entry?.dependencies.forEach(walk)
    visiting.delete(name); visited.add(name)
  }
  modules.forEach((module) => walk(module.name))
  const canonical = await discover(root)
  if (canonical instanceof Error) errors.push(canonical.message)
  if (canonical instanceof Error) return { errors, warnings }
  for (const target of manifest.targets) {
    const unsupported = target === "agents-md" ? canonical.mcps.length + canonical.agents.length + canonical.commands.length : 0
    if (unsupported) (strict ? errors : warnings).push(`${target} cannot represent ${unsupported} canonical item(s)`)
  }
  return { errors, warnings }
}
