#!/usr/bin/env node
import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"
import { goke } from "goke"
import { z } from "zod"
import { discover } from "./core/discovery.ts"
import { agentsPath, exists, manifestPath, writeJson } from "./core/fs.ts"
import { loadProject, writeManagedGitignore } from "./core/manifest.ts"
import { validateProject } from "./core/validate.ts"
import { addModule, removeModule, updateModule } from "./modules/index.ts"
import { generateTargets } from "./targets/index.ts"
import { targetNames, type ModuleSource, type TargetName } from "./types.ts"

const require = createRequire(import.meta.url)
const packageJson = require("../package.json") as { version: string }

function targets(value?: string): TargetName[] | Error {
  const selected = value ? value.split(",").filter(Boolean) : [...targetNames]
  const invalid = selected.find((target) => !targetNames.includes(target as TargetName))
  return invalid ? new Error(`Unknown target ${invalid}. Use: ${targetNames.join(", ")}`) : selected as TargetName[]
}

async function initialize(root: string, selected: TargetName[]) {
  const agents = agentsPath(root)
  const result = await fs.mkdir(agents, { recursive: true }).then(async () => {
    for (const directory of ["agents", "commands", "docs", "mcps", "rules", "sessions", "skills", "state"]) await fs.mkdir(path.join(agents, directory), { recursive: true })
  }).catch((error) => error as Error)
  if (result instanceof Error) return result
  if (!(await exists(manifestPath(root)))) {
    const written = await writeJson(manifestPath(root), { $schema: "https://raw.githubusercontent.com/joaogsleite/agentsrc/main/schemas/project-v1.json", formatVersion: 1, targets: selected, modules: [] })
    if (written instanceof Error) return written
  }
  const index = path.join(agents, "docs", "INDEX.md")
  if (!(await exists(index))) await fs.writeFile(index, "# Project Documentation\n\nUse this index to navigate durable project knowledge. Add links to documentation that will help future coding sessions.\n")
  const rule = path.join(agents, "rules", "agentsrc-storage.md")
  if (!(await exists(rule))) await fs.writeFile(rule, "# agentsrc Storage\n\nStore durable project documentation in `.agents/docs/`, session reports in `.agents/sessions/`, and temporary scratch data in `.agents/state/`. Do not write agent runtime data to generated target directories or the repository root.\n")
  return await writeManagedGitignore(root)
}

function printValidation(result: Awaited<ReturnType<typeof validateProject>>, console: { log(message: string): void; error(message: string): void }) {
  result.warnings.forEach((warning) => console.error(`warning: ${warning}`))
  result.errors.forEach((error) => console.error(`error: ${error}`))
}

export function createCli() {
  const cli = goke("agentsrc")
  cli.command("init", "Initialize canonical agent configuration in the current project")
    .option("--targets [targets]", z.string().optional().describe("Comma-separated target list"))
    .action(async (options, { console, process }) => {
      const selected = targets(options.targets)
      if (selected instanceof Error) { console.error(selected.message); process.exit(1); return }
      const result = await initialize(process.cwd, selected)
      if (result instanceof Error) { console.error(result.message); process.exit(1); return }
      console.log("Initialized .agents/")
    })
  cli.command("validate", "Validate canonical configuration without writing")
    .option("--strict", "Treat target compatibility warnings as errors")
    .action(async (options, { console, process }) => {
      const result = await validateProject(process.cwd, options.strict ?? false)
      printValidation(result, console)
      if (result.errors.length) { process.exit(1); return }
      console.log("Configuration is valid")
    })
  cli.command("generate [...targets]", "Rebuild selected generated target output")
    .option("--check", "Check for output drift without writing")
    .option("--strict", "Treat target compatibility warnings as errors")
    .action(async (requested, options, { console, process }) => {
      const project = await loadProject(process.cwd)
      if (project instanceof Error) { console.error(project.message); process.exit(1); return }
      const selected = requested.length ? targets(requested.join(",")) : project.targets
      if (selected instanceof Error) { console.error(selected.message); process.exit(1); return }
      const validation = await validateProject(process.cwd, options.strict ?? false)
      printValidation(validation, console)
      if (validation.errors.length) { process.exit(1); return }
      const canonical = await discover(process.cwd)
      if (canonical instanceof Error) { console.error(canonical.message); process.exit(1); return }
      const result = await generateTargets(process.cwd, selected, canonical, options.check ?? false)
      if (result instanceof Error) { console.error(result.message); process.exit(1); return }
      console.log(options.check ? "Generated output is current" : `Generated ${selected.join(", ")}`)
    })
  cli.command("status", "Report modules and generated-output drift")
    .action(async (_options, { console, process }) => {
      const project = await loadProject(process.cwd)
      if (project instanceof Error) { console.error(project.message); process.exit(1); return }
      console.log(project.modules.length ? project.modules.map((module) => module.name).join("\n") : "No modules installed")
      const validation = await validateProject(process.cwd)
      printValidation(validation, console)
      if (validation.errors.length) { process.exit(1); return }
      const canonical = await discover(process.cwd)
      if (canonical instanceof Error) { console.error(canonical.message); process.exit(1); return }
      const check = await generateTargets(process.cwd, project.targets, canonical, true)
      if (check instanceof Error) { console.error(`Output drift: ${check.message}`); process.exit(1); return }
      console.log("Generated output is current")
    })
  cli.command("module add <name>", "Install a module and its dependencies")
    .option("--local [path]", z.string().optional().describe("Local source repository"))
    .option("--github [repository]", z.string().optional().describe("GitHub owner/repository source"))
    .action(async (name, options, { console, process }) => {
      const source: ModuleSource | undefined = options.local || options.github ? { ...(options.local ? { local: options.local } : {}), ...(options.github ? { github: options.github } : {}) } : undefined
      const result = await addModule(process.cwd, name, source)
      if (result instanceof Error) { console.error(result.message); process.exit(1); return }
      await writeManagedGitignore(process.cwd)
      console.log(`Installed ${name}`)
    })
  cli.command("module list", "List installed modules")
    .action(async (_options, { console, process }) => {
      const project = await loadProject(process.cwd)
      if (project instanceof Error) { console.error(project.message); process.exit(1); return }
      console.log(project.modules.length ? project.modules.map((module) => `${module.name}\t${module.files.length} files`).join("\n") : "No modules installed")
    })
  cli.command("module remove <name>", "Remove a module when no installed module depends on it")
    .action(async (name, _options, { console, process }) => {
      const result = await removeModule(process.cwd, name)
      if (result instanceof Error) { console.error(result.message); process.exit(1); return }
      await writeManagedGitignore(process.cwd)
      console.log(`Removed ${name}`)
    })
  cli.command("module update <name>", "Refresh a module from its configured source")
    .action(async (name, _options, { console, process }) => {
      const result = await updateModule(process.cwd, name)
      if (result instanceof Error) { console.error(result.message); process.exit(1); return }
      await writeManagedGitignore(process.cwd)
      console.log(`Updated ${name}`)
    })
  cli.help()
  cli.version(packageJson.version)
  return cli
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createCli().parse().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
