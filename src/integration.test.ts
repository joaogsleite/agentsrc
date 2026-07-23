import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { afterEach, describe, expect, test } from "vitest"

const run = promisify(execFile)
const directories: string[] = []

async function agentsrc(root: string, ...args: string[]) {
  return await run(process.execPath, [path.resolve("bin.mjs"), ...args], { cwd: root })
}

async function localModule(project: string, name: string, files: Record<string, string>, dependencies: string[] = []) {
  const moduleRoot = path.join(project, "shared", "modules", name)
  await fs.mkdir(moduleRoot, { recursive: true })
  await fs.writeFile(path.join(moduleRoot, "module.json"), JSON.stringify({ name, description: name, dependencies, files: Object.keys(files).sort() }))
  for (const [file, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(moduleRoot, file)), { recursive: true })
    await fs.writeFile(path.join(moduleRoot, file), content)
  }
  await commitLocalModules(project)
}

async function commitLocalModules(project: string) {
  const source = path.join(project, "shared")
  const gitDirectory = path.join(source, ".git")
  const initialized = await fs.stat(gitDirectory).then(() => true).catch(() => false)
  if (!initialized) {
    await run("git", ["init"], { cwd: source })
    await run("git", ["config", "user.email", "agentsrc@example.test"], { cwd: source })
    await run("git", ["config", "user.name", "agentsrc test"], { cwd: source })
  }
  await run("git", ["add", "."], { cwd: source })
  await run("git", ["commit", "-m", "Update modules"], { cwd: source })
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => await fs.rm(directory, { recursive: true, force: true })))
})

describe("agentsrc CLI", () => {
  test("initializes, installs a module, and detects generation drift", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await agentsrc(project, "init", "--targets", "opencode")
    expect((await fs.stat(path.join(project, ".agents", "artifacts"))).isDirectory()).toBe(true)
    expect((await fs.stat(path.join(project, ".agents", "config"))).isDirectory()).toBe(true)
    expect((await fs.stat(path.join(project, ".agents", "docs", "INDEX.md"))).isFile()).toBe(true)
    await expect(fs.stat(path.join(project, ".agents", "sessions"))).rejects.toMatchObject({ code: "ENOENT" })
    await agentsrc(project, "module", "add", "memory-system")
    await fs.writeFile(path.join(project, ".agents", "docs", "architecture.md"), "# Architecture\n\nThis must not be startup context.\n")
    await fs.writeFile(path.join(project, ".agents", "docs", "INDEX.md"), "# Project Documentation\n\n- [Architecture](architecture.md)\n")
    const registry = JSON.parse(await fs.readFile(path.join(project, ".agents", ".agentsrc.json"), "utf8")) as { formatVersion: number; modules: Array<{ name: string; source?: unknown; revision?: unknown; dependencies?: unknown; files?: unknown }> }
    const installed = registry.modules.find((module) => module.name === "memory-system")
    expect(registry.formatVersion).toBe(1)
    expect(installed?.source).toBeUndefined()
    expect(installed?.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(installed?.dependencies).toBeUndefined()
    expect(installed?.files).toBeUndefined()
    await expect(fs.stat(path.join(project, ".agents", ".agentsrc"))).rejects.toMatchObject({ code: "ENOENT" })
    await fs.writeFile(path.join(project, ".env"), "GITHUB_TOKEN=example-token\n")
    await fs.writeFile(path.join(project, ".agents", "mcps", "github.json"), JSON.stringify({ name: "github", transport: { type: "stdio", command: "npx", args: ["-y", "@github/github-mcp-server"], env: ["GITHUB_TOKEN"] } }))
    await agentsrc(project, "generate")
    await agentsrc(project, "generate", "--check")
    const instructions = await fs.readFile(path.join(project, "AGENTS.md"), "utf8")
    const config = JSON.parse(await fs.readFile(path.join(project, "opencode.json"), "utf8")) as { instructions: string[] }
    const gitignore = await fs.readFile(path.join(project, ".gitignore"), "utf8")
    const storageRule = await fs.readFile(path.join(project, ".agents", "rules", "agentsrc-storage.md"), "utf8")
    const wrapper = await fs.readFile(path.join(project, ".opencode", "agentsrc-mcps", "github.sh"), "utf8")
    expect(instructions).toContain("Read `.agents/docs/INDEX.md`")
    expect(instructions).toContain("Read every Markdown file under `.agents/rules/`")
    expect(instructions).not.toContain("This must not be startup context")
    expect(config.instructions).toEqual([".opencode/rules/agentsrc-source-of-truth.md", ".agents/rules/**/*.md", ".agents/docs/INDEX.md"])
    expect(gitignore).not.toContain(".agents/config/")
    expect(gitignore).toContain(".agents/artifacts/")
    expect(storageRule).toContain(".agents/artifacts/")
    expect((await fs.stat(path.join(project, ".opencode", "rules", "agentsrc-source-of-truth.md"))).isFile()).toBe(true)
    expect((await fs.stat(path.join(project, ".opencode", "skills", "manage-agentsrc", "SKILL.md"))).isFile()).toBe(true)
    expect(gitignore).not.toContain(".agents/sessions/")
    expect(wrapper).toContain('. "$PROJECT_ROOT/.env"')
    expect(wrapper).not.toContain("example-token")
    await fs.appendFile(path.join(project, "AGENTS.md"), "drift\n")
    await expect(agentsrc(project, "generate", "--check")).rejects.toMatchObject({ stderr: expect.stringContaining("out of date") })
  })

  test("installs local module payloads as relative symlinks", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    const moduleRoot = path.join(project, "shared", "modules", "local-workflow")
    await fs.mkdir(path.join(moduleRoot, "rules"), { recursive: true })
    await fs.writeFile(path.join(moduleRoot, "module.json"), JSON.stringify({ name: "local-workflow", description: "Local workflow", dependencies: [], files: ["rules/local.md"] }))
    await fs.writeFile(path.join(moduleRoot, "rules", "local.md"), "# Local\n")
    await commitLocalModules(project)
    await agentsrc(project, "init")
    await agentsrc(project, "module", "add", "local-workflow", "--local", "./shared")
    const installed = await fs.lstat(path.join(project, ".agents", "rules", "local.md"))
    expect(installed.isSymbolicLink()).toBe(true)
    await agentsrc(project, "validate", "--strict")
  })

  test("discovers local module links and materializes them in target output", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "workflow", { "rules/workflow.md": "# Linked Workflow\n", "skills/workflow/SKILL.md": "# Linked Skill\n" })
    await agentsrc(project, "init", "--targets", "claude")
    await agentsrc(project, "module", "add", "workflow", "--local", "./shared")
    await agentsrc(project, "generate")
    const instructions = await fs.readFile(path.join(project, "AGENTS.md"), "utf8")
    const projectedSkill = await fs.lstat(path.join(project, ".claude", "skills", "workflow", "SKILL.md"))
    const projectedSkillContent = await fs.readFile(path.join(project, ".claude", "skills", "workflow", "SKILL.md"), "utf8")
    expect(instructions).toContain("Read every Markdown file under `.agents/rules/`")
    expect(projectedSkillContent).toContain("Linked Skill")
    expect(projectedSkill.isSymbolicLink()).toBe(false)
  })

  test("replaces existing non-config files during module installation", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "dependency", { "rules/dependency.md": "# Dependency\n" })
    await localModule(project, "workflow", { "rules/existing.md": "# Workflow\n" }, ["dependency"])
    await agentsrc(project, "init")
    await fs.writeFile(path.join(project, ".agents", "rules", "existing.md"), "# User-owned\n")
    await agentsrc(project, "module", "add", "workflow", "--local", "./shared")
    expect(await fs.readFile(path.join(project, ".agents", "rules", "existing.md"), "utf8")).toBe("# Workflow\n")
    expect((await fs.lstat(path.join(project, ".agents", "rules", "dependency.md"))).isSymbolicLink()).toBe(true)
  })

  test("copies config payloads once and preserves them through update and removal", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "workflow", {
      "config/workflow.json": "{\"version\":1}\n",
      "rules/workflow.md": "# Workflow\n",
    })
    await agentsrc(project, "init")
    await agentsrc(project, "module", "add", "workflow", "--local", "./shared")
    const config = path.join(project, ".agents", "config", "workflow.json")
    expect((await fs.lstat(config)).isSymbolicLink()).toBe(false)
    expect(await fs.readFile(config, "utf8")).toBe("{\"version\":1}\n")
    await fs.writeFile(config, "{\"version\":2}\n")
    await fs.writeFile(path.join(project, "shared", "modules", "workflow", "config", "workflow.json"), "{\"version\":3}\n")
    await fs.writeFile(path.join(project, "shared", "modules", "workflow", "config", "additional.json"), "{\"enabled\":true}\n")
    await fs.writeFile(path.join(project, "shared", "modules", "workflow", "module.json"), JSON.stringify({ name: "workflow", description: "workflow", dependencies: [], files: ["config/additional.json", "config/workflow.json", "rules/workflow.md"] }))
    await commitLocalModules(project)
    await agentsrc(project, "module", "update", "workflow")
    expect(await fs.readFile(config, "utf8")).toBe("{\"version\":2}\n")
    expect(await fs.readFile(path.join(project, ".agents", "config", "additional.json"), "utf8")).toBe("{\"enabled\":true}\n")
    await agentsrc(project, "module", "remove", "workflow")
    expect(await fs.readFile(config, "utf8")).toBe("{\"version\":2}\n")
    expect(await fs.readFile(path.join(project, ".agents", "config", "additional.json"), "utf8")).toBe("{\"enabled\":true}\n")
  })

  test("rejects collisions with payloads owned by another module", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "first", { "rules/shared.md": "# First\n" })
    await localModule(project, "second", { "rules/shared.md": "# Second\n" })
    await agentsrc(project, "init")
    await agentsrc(project, "module", "add", "first", "--local", "./shared")
    await expect(agentsrc(project, "module", "add", "second", "--local", "./shared")).rejects.toMatchObject({ stderr: expect.stringContaining("Module destination collision") })
    expect(await fs.readFile(path.join(project, ".agents", "rules", "shared.md"), "utf8")).toBe("# First\n")
  })

  test("rejects module payloads outside canonical directories", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "workflow", { "output/result.txt": "result\n" })
    await agentsrc(project, "init")
    await expect(agentsrc(project, "module", "add", "workflow", "--local", "./shared")).rejects.toMatchObject({ stderr: expect.stringContaining("must be inside a canonical .agents directory") })
  })

  test("rejects legacy sessions directories", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await agentsrc(project, "init")
    await fs.mkdir(path.join(project, ".agents", "sessions"))
    await expect(agentsrc(project, "validate")).rejects.toMatchObject({ stderr: expect.stringContaining("Legacy .agents/sessions is not supported") })
  })

  test("validates memory-system workflows across all targets", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await agentsrc(project, "init", "--targets", "claude,codex,gemini,opencode")
    await agentsrc(project, "module", "add", "memory-system")
    await agentsrc(project, "validate", "--strict")
    await agentsrc(project, "generate")
    for (const target of ["claude", "codex", "gemini", "opencode"]) {
      expect((await fs.stat(path.join(project, `.${target}`, "rules", "agentsrc-source-of-truth.md"))).isFile()).toBe(true)
      expect((await fs.stat(path.join(project, `.${target}`, "skills", "manage-agentsrc", "SKILL.md"))).isFile()).toBe(true)
    }
    expect(await fs.readFile(path.join(project, "AGENTS.md"), "utf8")).toContain(".codex/rules/agentsrc-source-of-truth.md")
    expect(await fs.readFile(path.join(project, "GEMINI.md"), "utf8")).toContain(".gemini/rules/agentsrc-source-of-truth.md")
  })

  test("installs the GitHub issues workflow with editable configuration", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "github-issues", {
      "config/github-issues.json": await fs.readFile(path.resolve("modules/github-issues/config/github-issues.json"), "utf8"),
      "skills/github-issues/SKILL.md": await fs.readFile(path.resolve("modules/github-issues/skills/github-issues/SKILL.md"), "utf8"),
      "skills/github-issues/references/github-issues-config-v1.schema.json": await fs.readFile(path.resolve("modules/github-issues/skills/github-issues/references/github-issues-config-v1.schema.json"), "utf8"),
    })
    await agentsrc(project, "init", "--targets", "opencode")
    await agentsrc(project, "module", "add", "github-issues", "--local", "./shared")
    const config = path.join(project, ".agents", "config", "github-issues.json")
    const skill = path.join(project, ".agents", "skills", "github-issues", "SKILL.md")
    const schema = path.join(project, ".agents", "skills", "github-issues", "references", "github-issues-config-v1.schema.json")
    expect(JSON.parse(await fs.readFile(config, "utf8"))).toMatchObject({ formatVersion: 1, gh: { tokenEnv: "GH_TOKEN" }, branchPrefix: "issue" })
    expect((await fs.lstat(config)).isSymbolicLink()).toBe(false)
    expect(await fs.readFile(skill, "utf8")).toContain("gh_with_token")
    expect((await fs.stat(schema)).isFile()).toBe(true)
    await agentsrc(project, "validate", "--strict")
    await agentsrc(project, "generate")
    await agentsrc(project, "generate", "--check")
  })

  test("updates a local module transactionally and removes stale payload files", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "workflow", { "rules/old.md": "# Old\n" })
    await agentsrc(project, "init")
    await agentsrc(project, "module", "add", "workflow", "--local", "./shared")
    await fs.rm(path.join(project, "shared", "modules", "workflow", "rules", "old.md"))
    await fs.writeFile(path.join(project, "shared", "modules", "workflow", "rules", "new.md"), "# New\n")
    await fs.writeFile(path.join(project, "shared", "modules", "workflow", "module.json"), JSON.stringify({ name: "workflow", description: "workflow", dependencies: [], files: ["rules/new.md"] }))
    await commitLocalModules(project)
    await agentsrc(project, "module", "update", "workflow")
    await expect(fs.lstat(path.join(project, ".agents", "rules", "old.md"))).rejects.toMatchObject({ code: "ENOENT" })
    expect((await fs.lstat(path.join(project, ".agents", "rules", "new.md"))).isSymbolicLink()).toBe(true)
  })

  test("prunes dependencies no longer declared by an updated module", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "dependency", { "rules/dependency.md": "# Dependency\n" })
    await localModule(project, "workflow", { "rules/workflow.md": "# Workflow\n" }, ["dependency"])
    await agentsrc(project, "init")
    await agentsrc(project, "module", "add", "workflow", "--local", "./shared")
    await fs.writeFile(path.join(project, "shared", "modules", "workflow", "module.json"), JSON.stringify({ name: "workflow", description: "workflow", dependencies: [], files: ["rules/workflow.md"] }))
    await commitLocalModules(project)
    await agentsrc(project, "module", "update", "workflow")
    const manifest = JSON.parse(await fs.readFile(path.join(project, ".agents", ".agentsrc.json"), "utf8")) as { modules: Array<{ name: string }> }
    expect(manifest.modules.map((module) => module.name)).toEqual(["workflow"])
    await expect(fs.lstat(path.join(project, ".agents", "rules", "dependency.md"))).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("refuses module removal while another module depends on it", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "dependency", { "rules/dependency.md": "# Dependency\n" })
    await localModule(project, "workflow", { "rules/workflow.md": "# Workflow\n" }, ["dependency"])
    await agentsrc(project, "init")
    await agentsrc(project, "module", "add", "workflow", "--local", "./shared")
    await expect(agentsrc(project, "module", "remove", "dependency")).rejects.toMatchObject({ stderr: expect.stringContaining("required by workflow") })
  })

  test("falls back to the catalog for dependencies absent from a local source", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "workflow", { "rules/workflow.md": "# Workflow\n" }, ["memory-system"])
    await agentsrc(project, "init")
    await agentsrc(project, "module", "add", "workflow", "--local", "./shared")
    const manifest = JSON.parse(await fs.readFile(path.join(project, ".agents", ".agentsrc.json"), "utf8")) as { formatVersion: number; modules: Array<{ name: string; source?: unknown; revision?: unknown }> }
    expect(manifest.formatVersion).toBe(1)
    expect(manifest.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "workflow", source: { local: "./shared" }, revision: expect.stringMatching(/^[0-9a-f]{40}$/) }),
      expect.objectContaining({ name: "memory-system", revision: expect.stringMatching(/^[0-9a-f]{40}$/) }),
    ]))
  })

  test("rejects uncommitted local module sources", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "workflow", { "rules/workflow.md": "# Workflow\n" })
    await fs.writeFile(path.join(project, "shared", "modules", "workflow", "rules", "workflow.md"), "# Changed\n")
    await agentsrc(project, "init")
    await expect(agentsrc(project, "module", "add", "workflow", "--local", "./shared")).rejects.toMatchObject({ stderr: expect.stringContaining("uncommitted changes") })
    await commitLocalModules(project)
    await agentsrc(project, "module", "add", "workflow", "--local", "./shared")
    await fs.writeFile(path.join(project, "shared", "modules", "workflow", "rules", "workflow.md"), "# Changed again\n")
    await expect(agentsrc(project, "module", "update", "workflow")).rejects.toMatchObject({ stderr: expect.stringContaining("uncommitted changes") })
  })

  test("rejects skill directories without SKILL.md", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await agentsrc(project, "init")
    await fs.mkdir(path.join(project, ".agents", "skills", "incomplete"))
    await fs.writeFile(path.join(project, ".agents", "skills", "incomplete", "notes.md"), "# Incomplete\n")
    await expect(agentsrc(project, "validate")).rejects.toMatchObject({ stderr: expect.stringContaining("missing .agents/skills/incomplete/SKILL.md") })
  })

  test("Next.js Cloudflare Tunnel example validates and regenerates cleanly", async () => {
    for (const name of ["nextjs-app"]) {
      const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-example-"))
      directories.push(project)
      await fs.cp(path.resolve("examples", name), project, { recursive: true, dereference: true })
      await fs.cp(path.resolve("modules"), path.join(project, "modules"), { recursive: true, dereference: true })
      await run("git", ["init"], { cwd: project })
      await run("git", ["config", "user.email", "agentsrc@example.test"], { cwd: project })
      await run("git", ["config", "user.name", "agentsrc test"], { cwd: project })
      await run("git", ["add", "modules"], { cwd: project })
      await run("git", ["commit", "-m", "Add module source"], { cwd: project })
      const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd: project })
      const manifestPath = path.join(project, ".agents", ".agentsrc.json")
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { modules: Array<{ name: string; source?: { local?: string }; revision: string }> }
      manifest.modules = manifest.modules.map((module) => ({ ...module, source: { local: "." }, revision: stdout.trim() }))
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
      await agentsrc(project, "validate", "--strict")
      await agentsrc(project, "generate")
      await agentsrc(project, "generate", "--check")
    }
  })
})
