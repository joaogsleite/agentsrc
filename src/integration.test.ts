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

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => await fs.rm(directory, { recursive: true, force: true })))
})

describe("agentsrc CLI", () => {
  test("initializes, installs a module, and detects generation drift", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-test-"))
    directories.push(project)
    await agentsrc(project, "init", "--targets", "agents-md,opencode")
    await agentsrc(project, "module", "add", "memory-system")
    await fs.writeFile(path.join(project, ".agents", "mcps", "github.json"), JSON.stringify({ name: "github", transport: { type: "stdio", command: "npx", args: ["-y", "@github/github-mcp-server"], env: ["GITHUB_TOKEN"] } }))
    await agentsrc(project, "generate")
    await agentsrc(project, "generate", "--check")
    const instructions = await fs.readFile(path.join(project, "AGENTS.md"), "utf8")
    expect(instructions).toContain("Project Memory")
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

  test("representative examples validate and regenerate cleanly", async () => {
    for (const name of ["typescript-web-app", "python-api-service", "go-cli-tool", "product-design-workflow"]) {
      const project = await fs.mkdtemp(path.join(os.tmpdir(), "agentsrc-example-"))
      directories.push(project)
      await fs.cp(path.resolve("examples", name), project, { recursive: true })
      await agentsrc(project, "validate", "--strict")
      await agentsrc(project, "generate")
      await agentsrc(project, "generate", "--check")
    }
  })
})
