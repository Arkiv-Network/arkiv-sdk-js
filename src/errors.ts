import { BLOCK_TIME } from "./consts"

export class EntityMutationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EntityMutationError"
  }
}
export class InvalidExpirationError extends Error {
  constructor(expiresIn: unknown) {
    super(
      `Invalid expiresIn: ${String(expiresIn)}. expiresIn must be a positive integer and a multiple of the Arkiv block time (${BLOCK_TIME} seconds), because expiration is measured in whole blocks (1 block = ${BLOCK_TIME} seconds).`,
    )
    this.name = "InvalidExpirationError"
  }
}
export class NoMoreResultsError extends Error {
  constructor() {
    super("No more results")
    this.name = "NoMoreResultsError"
  }
}

export class NoCursorOrLimitError extends Error {
  constructor() {
    super("Cursor and limit must be defined to fetch next")
    this.name = "NoCursorOrLimitError"
  }
}

export class NoEntityFoundError extends Error {
  constructor() {
    super("No entity found")
    this.name = "NoEntityFoundError"
  }
}

export class InvalidContentTypeError extends Error {
  constructor(contentType: string) {
    super(
      `Invalid content type "${contentType}". Must follow RFC 2045 MIME grammar and be lowercase only (e.g. "text/plain").`,
    )
    this.name = "InvalidContentTypeError"
  }
}
