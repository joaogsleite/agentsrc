import fs from "node:fs/promises"
import path from "node:path"
import { fail } from "../errors.ts"
import { agentsPath, inside, isModuleConfigPath, isModulePayloadPath, isSafeRelativePath } from "./fs.ts"
import { loadProject, hasManagedGitignore } from "./manifest.ts"
import { installedModuleMetadata } from "../modules/index.ts"
import { discover } from "./discovery.ts"
import { adapters } from "../targets/index.ts"

export interface ValidationResult { errors: string[]; warnings: string[] }

async function validateSkillLayout(root: string) {
  const directory = path.join(agentsPath(root), "skills")
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null)
  if (entries === null) return ["Cannot read .agents/skills"]
  const errors: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skill = path.join(directory, entry.name, "SKILL.md")
    const stat = await fs.stat(skill).catch(() => null)
    if (!stat?.isFile()) errors.push(`Skill ${entry.name} is missing .agents/skills/${entry.name}/SKILL.md`)
  }
  return errors
}

export async function validateProject(root: string, strict = false): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const manifest = await loadProject(root)
  if (manifest instanceof Error) return { errors: [manifest.message], warnings }
  const modules = manifest.modules
  const moduleMetadata = await installedModuleMetadata(root, manifest)
  if (moduleMetadata instanceof Error) errors.push(moduleMetadata.message)
  if (!(await hasManagedGitignore(root))) errors.push("Missing or invalid agentsrc managed .gitignore block")
  if (await fs.lstat(path.join(agentsPath(root), "sessions")).then(() => true).catch(() => false)) errors.push("Legacy .agents/sessions is not supported; move module data to .agents/state/<module-name>/ or user-facing output to .agents/artifacts/")
  errors.push(...await validateSkillLayout(root))
  const names = new Set<string>()
  for (const module of modules) {
    if (names.has(module.name)) errors.push(`Duplicate module registry entry: ${module.name}`)
    names.add(module.name)
    if (module.source?.local && path.isAbsolute(module.source.local)) errors.push(`Local module source must be project-relative: ${module.name}`)
    if (moduleMetadata instanceof Error) continue
    const state = moduleMetadata.get(module.name)
    if (!state) { errors.push(`Missing module metadata: ${module.name}`); continue }
    for (const file of state.files) {
      if (!isSafeRelativePath(file) || !isModulePayloadPath(file)) errors.push(`Module payload is outside a canonical .agents directory: ${module.name}/${file}`)
      const destination = path.join(agentsPath(root), file)
      const stat = await fs.lstat(destination).catch(() => null)
      if (!stat) errors.push(`Missing module file: .agents/${file}`)
      if (isModuleConfigPath(file) && stat?.isSymbolicLink()) errors.push(`Module config must not be a symlink: .agents/${file}`)
      if (stat?.isSymbolicLink()) {
        const resolved = await fs.realpath(destination).catch(() => null)
        const sourceRoot = module.source?.local ? path.resolve(root, module.source.local, "modules", module.name) : null
        if (!resolved) errors.push(`Broken module link: .agents/${file}`)
        if (resolved && sourceRoot && !inside(sourceRoot, resolved)) errors.push(`Module link escapes source root: .agents/${file}`)
      }
    }
  }
  const canonical = await discover(root)
  if (canonical instanceof Error) errors.push(canonical.message)
  if (canonical instanceof Error) return { errors, warnings }
  for (const target of manifest.targets) {
    const diagnostics = adapters[target].validate(canonical)
    errors.push(...diagnostics.errors)
    if (strict) errors.push(...diagnostics.warnings)
    else warnings.push(...diagnostics.warnings)
  }
  return { errors, warnings }
}
