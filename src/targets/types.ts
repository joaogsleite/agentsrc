import type { CanonicalProject, TargetName } from "../types.ts"

export interface RenderedFile {
  path: string
  content: string | object
}

export interface TargetPlan {
  outputs: string[]
  copies: Array<{ from: string; to: string }>
}

export interface TargetAdapter {
  name: TargetName
  validate(project: CanonicalProject): { errors: string[]; warnings: string[] }
  plan(project: CanonicalProject): TargetPlan
  render(project: CanonicalProject): RenderedFile[]
}
