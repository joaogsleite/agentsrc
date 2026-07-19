import * as errore from "errore"

export class AgentSrcError extends errore.createTaggedError({
  name: "AgentSrcError",
  message: "$message",
}) {}

export function fail(message: string, cause?: unknown): Error {
  return new AgentSrcError({ message, ...(cause === undefined ? {} : { cause }) })
}
