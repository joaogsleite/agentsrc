import * as errore from "errore"

export class AgentsrcError extends errore.createTaggedError({
  name: "AgentsrcError",
  message: "$message",
}) {}

export function fail(message: string, cause?: unknown): Error {
  return new AgentsrcError({ message, ...(cause === undefined ? {} : { cause }) })
}
