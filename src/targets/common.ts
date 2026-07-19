import type { McpServer } from "../types.ts"
import type { RenderedFile } from "./types.ts"

type StdioTransport = Extract<McpServer["transport"], { type: "stdio" }>

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`
}

function usesWrapper(mcp: McpServer): mcp is McpServer & { transport: StdioTransport } {
  return mcp.enabled !== false && mcp.transport.type === "stdio" && (Boolean(mcp.transport.env?.length) || Boolean(mcp.transport.cwd && mcp.transport.cwd !== "."))
}

export function stdioCommand(mcp: McpServer, wrapperDirectory: string) {
  if (mcp.transport.type !== "stdio") return null
  return usesWrapper(mcp)
    ? { command: "sh", args: [`${wrapperDirectory}/${mcp.name}.sh`] }
    : { command: mcp.transport.command, args: mcp.transport.args ?? [] }
}

export function mcpWrapperFiles(mcps: McpServer[], directory: string): RenderedFile[] {
  return mcps.filter(usesWrapper).map((mcp) => {
    const transport = mcp.transport
    const environment = (transport.env ?? []).map((name) => `export ${name}`).join("\n")
    const command = [transport.command, ...(transport.args ?? [])].map(shellQuote).join(" ")
    const changeDirectory = transport.cwd && transport.cwd !== "." ? `cd "$PROJECT_ROOT"/${shellQuote(transport.cwd)}` : "cd \"$PROJECT_ROOT\""
    return {
      path: `${directory}/${mcp.name}.sh`,
      content: `#!/bin/sh\nset -e\n\nSCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nPROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)\n${environment ? `\n# Load only declared MCP variables from the project-local dotenv file.\nif [ -f "$PROJECT_ROOT/.env" ]; then\n  . "$PROJECT_ROOT/.env"\nfi\n${environment}\n` : ""}\n${changeDirectory}\n\nexec ${command}\n`,
    }
  })
}

export function claudeMcpConfig(mcps: McpServer[], wrapperDirectory: string) {
  return Object.fromEntries(mcps.filter((mcp) => mcp.enabled !== false).map((mcp) => [mcp.name, mcp.transport.type === "stdio"
    ? { type: "stdio", ...stdioCommand(mcp, wrapperDirectory), timeout: mcp.timeoutMs }
    : { type: "http", url: mcp.transport.url, headers: Object.fromEntries(Object.entries(mcp.transport.headers ?? {}).map(([key, env]) => [key, `\${${env}}`])), timeout: mcp.timeoutMs },
  ]))
}

export function geminiMcpConfig(mcps: McpServer[], wrapperDirectory: string) {
  return Object.fromEntries(mcps.filter((mcp) => mcp.enabled !== false).map((mcp) => [mcp.name, mcp.transport.type === "stdio"
    ? { ...stdioCommand(mcp, wrapperDirectory), timeout: mcp.timeoutMs }
    : { httpUrl: mcp.transport.url, timeout: mcp.timeoutMs },
  ]))
}

export function openCodeMcpConfig(mcps: McpServer[], wrapperDirectory: string) {
  return Object.fromEntries(mcps.filter((mcp) => mcp.enabled !== false).map((mcp) => [mcp.name, mcp.transport.type === "stdio"
    ? { type: "local", command: [stdioCommand(mcp, wrapperDirectory)!.command, ...stdioCommand(mcp, wrapperDirectory)!.args], timeout: mcp.timeoutMs }
    : { type: "remote", url: mcp.transport.url, headers: Object.fromEntries(Object.entries(mcp.transport.headers ?? {}).map(([key, env]) => [key, `{env:${env}}`])), timeout: mcp.timeoutMs },
  ]))
}

function tomlString(value: string) { return JSON.stringify(value) }
function tomlKey(value: string) { return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value) }

export function codexMcpToml(mcps: McpServer[], wrapperDirectory: string) {
  const entries: string[] = []
  for (const mcp of mcps.filter((item) => item.enabled !== false)) {
    const section = `[mcp_servers.${tomlKey(mcp.name)}]`
    if (mcp.transport.type === "stdio") {
      const command = stdioCommand(mcp, wrapperDirectory)!
      entries.push(section, `command = ${tomlString(command.command)}`, `args = [${command.args.map(tomlString).join(", ")}]`)
    } else {
      entries.push(section, `url = ${tomlString(mcp.transport.url)}`)
      if (mcp.transport.headers && Object.keys(mcp.transport.headers).length) entries.push(`env_http_headers = { ${Object.entries(mcp.transport.headers).map(([header, env]) => `${tomlKey(header)} = ${tomlString(env)}`).join(", ")} }`)
    }
    if (mcp.timeoutMs) entries.push(`tool_timeout_sec = ${Math.ceil(mcp.timeoutMs / 1000)}`)
    entries.push("")
  }
  return `${entries.join("\n").trim()}\n`
}
