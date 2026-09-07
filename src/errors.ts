import type { Hex } from "viem"

export class EntityMutationError extends Error {
  readonly txHash: Hex | undefined

  constructor(message: string, options?: { cause?: unknown; txHash?: Hex | undefined }) {
    super(message, { cause: options?.cause })
    this.name = "EntityMutationError"
    this.txHash = options?.txHash
  }
}
export class NoMoreResultsError extends Error {
  constructor() {
    super("No more results — the last page carried no cursor. Check hasNextPage() before next().")
    this.name = "NoMoreResultsError"
  }
}

export class NoEntityFoundError extends Error {
  /** The key that matched nothing, when the lookup was by key. */
  readonly entityKey: string | undefined

  constructor(entityKey?: string) {
    super(
      entityKey === undefined
        ? "No entity found"
        : `No live entity with key ${entityKey}. It was never created, or it has been deleted or ` +
            "has expired.",
    )
    this.name = "NoEntityFoundError"
    this.entityKey = entityKey
  }
}

export class EmptyPatchError extends Error {
  readonly entityKey: string

  constructor(entityKey: string) {
    super(
      `The patch for entity ${entityKey} has nothing to apply. Pass "set" to write attributes, ` +
        '"unset" to remove them, or "payload"/"contentType" to replace the contents.',
    )
    this.name = "EmptyPatchError"
    this.entityKey = entityKey
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
