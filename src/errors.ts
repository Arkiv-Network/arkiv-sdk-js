export class EntityMutationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "EntityMutationError"
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
