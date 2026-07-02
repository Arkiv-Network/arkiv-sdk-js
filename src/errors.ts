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
export class InvalidAttributeError extends Error {
  constructor(key: string, value: number) {
    super(
      `Invalid numeric value for attribute "${key}": ${String(value)}. Numeric attribute values must be integers. To keep numeric ordering/range queries, scale it to an integer (e.g. Math.round(${String(value)} * 1000), dividing by 1000 on read); otherwise store it as a string (e.g. "${String(value)}").`,
    )
    this.name = "InvalidAttributeError"
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
