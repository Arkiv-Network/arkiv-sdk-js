/**
 * Max uint64 value
 */
export const MAX_EXPIRES_AT = 2n ** 64n - 1n

/** The operation tags of the `execute` ABI's tagged union. */
export const OperationType = {
  Create: 1,
  Patch: 2,
  ExtendExpiry: 3,
  TransferOwnership: 4,
  Delete: 5,
} as const

export type OperationType = (typeof OperationType)[keyof typeof OperationType]
