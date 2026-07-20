import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { afterEach, describe, expect, test } from "vitest"

const run = promisify(execFile)
const directories: string[] = []

async function agentsrc(root: string, ...args: string[]) {
  return await run(process.execPath, [path.resolve("dist/cli.js"), ...args], { cwd: root })
}

async function localModule(project: string, name: string, files: Record<string, string>, dependencies: string[] = []) {
  const moduleRoot = path.join(project, "shared", "modules", name)
  await fs.mkdir(moduleRoot, { recursive: true })
  await fs.writeFile(path.join(moduleRoot, "module.json"), JSON.stringify({ name, description: name, dependencies }))
  for (const [file, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(moduleRoot, file)), { recursive: true })
    await fs.writeFile(path.join(moduleRoot, file), content)
  }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => await fs.rm(directory, { recursive: true, force: true })))
})

describe("agentsrc CLI", () => {
  test("initializes, installs a module, and detects generation drift", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await agentsrc(project, "init", "--targets", "opencode")
    await agentsrc(project, "module", "add", "memory-system")
    const registry = JSON.parse(await fs.readFile(path.join(project, ".agents", ".agentsrc.json"), "utf8")) as { modules: Array<{ name: string; source?: unknown }> }
    expect(registry.modules.find((module) => module.name === "memory-system")?.source).toBeUndefined()
    await fs.writeFile(path.join(project, ".env"), "GITHUB_TOKEN=example-token\n")
    await fs.writeFile(path.join(project, ".agents", "mcps", "github.json"), JSON.stringify({ name: "github", transport: { type: "stdio", command: "npx", args: ["-y", "@github/github-mcp-server"], env: ["GITHUB_TOKEN"] } }))
    await agentsrc(project, "generate")
    await agentsrc(project, "generate", "--check")
    const instructions = await fs.readFile(path.join(project, "AGENTS.md"), "utf8")
    const wrapper = await fs.readFile(path.join(project, ".opencode", "agentsrc-mcps", "github.sh"), "utf8")
    expect(instructions).toContain("Project Memory")
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
    await fs.writeFile(path.join(moduleRoot, "module.json"), JSON.stringify({ name: "local-workflow", description: "Local workflow", dependencies: [] }))
    await fs.writeFile(path.join(moduleRoot, "rules", "local.md"), "# Local\n")
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
    expect(instructions).toContain("Linked Workflow")
    expect(projectedSkill.isSymbolicLink()).toBe(false)
  })

  test("preflights collisions before installing any dependency payload", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "dependency", { "rules/dependency.md": "# Dependency\n" })
    await localModule(project, "workflow", { "rules/existing.md": "# Workflow\n" }, ["dependency"])
    await agentsrc(project, "init")
    await fs.writeFile(path.join(project, ".agents", "rules", "existing.md"), "# User-owned\n")
    await expect(agentsrc(project, "module", "add", "workflow", "--local", "./shared")).rejects.toMatchObject({ stderr: expect.stringContaining("already occupied") })
    await expect(fs.lstat(path.join(project, ".agents", "rules", "dependency.md"))).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("updates a local module transactionally and removes stale payload files", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await localModule(project, "workflow", { "rules/old.md": "# Old\n" })
    await agentsrc(project, "init")
    await agentsrc(project, "module", "add", "workflow", "--local", "./shared")
    await fs.rm(path.join(project, "shared", "modules", "workflow", "rules", "old.md"))
    await fs.writeFile(path.join(project, "shared", "modules", "workflow", "rules", "new.md"), "# New\n")
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
    await fs.writeFile(path.join(project, "shared", "modules", "workflow", "module.json"), JSON.stringify({ name: "workflow", description: "workflow", dependencies: [] }))
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
    const manifest = JSON.parse(await fs.readFile(path.join(project, ".agents", ".agentsrc.json"), "utf8")) as { modules: Array<{ name: string; files: string[] }> }
    expect(manifest.modules).toEqual([expect.objectContaining({ name: "workflow", files: expect.arrayContaining(["rules/project-memory.md", "rules/workflow.md"]) })])
  })

  test("rejects skill directories without SKILL.md", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await agentsrc(project, "init")
    await fs.mkdir(path.join(project, ".agents", "skills", "incomplete"))
    await fs.writeFile(path.join(project, ".agents", "skills", "incomplete", "notes.md"), "# Incomplete\n")
    await expect(agentsrc(project, "validate")).rejects.toMatchObject({ stderr: expect.stringContaining("missing .agents/skills/incomplete/SKILL.md") })
  })

  test("representative examples validate and regenerate cleanly", async () => {
    for (const name of ["typescript-web-app", "python-api-service", "go-cli-tool", "product-design-workflow"]) {
      const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-example-"))
      directories.push(project)
      await fs.cp(path.resolve("examples", name), project, { recursive: true, dereference: true })
      await agentsrc(project, "validate", "--strict")
      await agentsrc(project, "generate")
      await agentsrc(project, "generate", "--check")
    }
  })
})
