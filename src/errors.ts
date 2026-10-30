import type { Hex } from "viem"
import { ACCESS_KEYS_URL } from "./consts"

export class EntityMutationError extends Error {
  readonly txHash: Hex | undefined

  constructor(message: string, options?: { cause?: unknown; txHash?: Hex | undefined }) {
    super(message, { cause: options?.cause })
    this.name = "EntityMutationError"
    this.txHash = options?.txHash
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
      `The patch for entity ${entityKey} has nothing to apply. Pass "set" to write columns, or ` +
        '"unset" to remove optional ones.',
    )
    this.name = "EmptyPatchError"
    this.entityKey = entityKey
  }
}

export class MissingAccessKeyError extends Error {
  /** The chain that was asked for without a key. */
  readonly chain: string

  constructor(chain: string) {
    super(
      `${chain} needs an Arkiv access key: pass it as ${chain.toLowerCase()}({ accessKey }). Get a ` +
        `free one at ${ACCESS_KEYS_URL}, or pass accessKey: "" to use the heavily rate-limited ` +
        "public endpoint.",
    )
    this.name = "MissingAccessKeyError"
    this.chain = chain
  }
}
