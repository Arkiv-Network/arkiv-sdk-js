import { BaseError, ContractFunctionRevertedError, type Hex, hexToString } from "viem"

/**
 * Turns a decoded engine revert into a sentence that says what to change.
 *
 * viem decodes the error and then renders it positionally — `Ident32InvalidByte(uint256 position,
 * bytes1 value)` arrives as `(5, 0x41)`, which is the right data and no help at all. The engine's
 * errors carry enough to name the actual problem, so this spends the args rather than printing
 * them.
 *
 * @param error - Anything thrown by a write action.
 * @returns The explanation, or `undefined` if this was not a decodable engine revert — in which
 * case the caller should fall back to whatever the transport said.
 */
export function describeEntityRevert(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
  if (!(reverted instanceof ContractFunctionRevertedError)) return undefined

  const name = reverted.data?.errorName
  if (name === undefined) return undefined
  const args = (reverted.data?.args ?? []) as readonly unknown[]

  return explain(name, args) ?? `the engine rejected the batch with ${name}`
}

/** The attribute-name charset, quoted the way an error message should read. */
const CHARSET = '"A"-"Z", "a"-"z", "0"-"9", ".", "-" and "_", with a letter first'

function explain(name: string, args: readonly unknown[]): string | undefined {
  switch (name) {
    // ── attribute names ──────────────────────────────────────────────────────
    case "Ident32InvalidByte": {
      const position = Number(args[0] ?? 0)
      const char = printable(String(args[1] ?? "0x00"))
      return (
        `an attribute name holds ${char} at byte ${position}, which is outside the ` +
        `name charset (${CHARSET})`
      )
    }
    case "Ident32Empty":
      return "an attribute name is empty"

    // ── the attribute list ───────────────────────────────────────────────────
    case "SystemAttributeNotWritable":
      return (
        `"${identName(args[0])}" is owned by the engine and cannot be written. Only $payload and ` +
        "$contentType are yours to set"
      )
    case "TombstoneInCreate":
      return (
        `a create cannot unset "${identName(args[0])}" — nothing exists yet, so leave the name ` +
        "out instead"
      )
    case "TombstoneValueNotEmpty":
      return `the tombstone for "${identName(args[0])}" carries a value; unsetting takes no value`
    case "InvalidValueType":
      return `"${identName(args[0])}" names type id ${String(args[1])}, which is not a known type`
    case "AttributesNotSorted":
      return "attributes must be strictly ascending by name, which also makes each name unique"
    case "TooManyAttributes":
      return `${String(args[0])} attributes exceeds the limit of ${String(args[1])}`
    case "EmptyMutations":
      return `the patch of ${short(args[0])} has no mutations, so it would do nothing`

    // ── entity state and authorisation ───────────────────────────────────────
    case "EntityNotFound":
      return `no entity ${short(args[0])} — it may have been deleted, or have expired`
    case "EntityExpired":
      return `entity ${short(args[0])} expired at block ${String(args[1])}`
    case "NotOwner":
      return `entity ${short(args[0])} is owned by ${String(args[2])}, not ${String(args[1])}`
    case "ReadOnlyEntity":
      return (
        `entity ${short(args[0])} was created readonly, so its contents can never change. Its ` +
        "expiry can still be extended, and it can be transferred or deleted"
      )
    case "ReservedCreationFlags":
      return (
        `creation flags 0b${Number(args[0] ?? 0)
          .toString(2)
          .padStart(8, "0")} set a reserved ` +
        "bit; only readonly and permissionlessExtension are defined"
      )

    // ── expiry ───────────────────────────────────────────────────────────────
    case "ExpiryDeadOnArrival":
      return (
        `the expiry resolves to block ${String(args[0])}, which is not after the current block ` +
        `${String(args[1])}`
      )
    case "ExpiryNotExtended":
      return (
        `entity ${short(args[0])} already expires at block ${String(args[2])}, so extending it ` +
        `to ${String(args[1])} would shorten its life`
      )

    // ── ownership ────────────────────────────────────────────────────────────
    case "TransferToZeroAddress":
      return `entity ${short(args[0])} cannot be transferred to the zero address`
    case "TransferToSelf":
      return `entity ${short(args[0])} is already owned by that account`

    // ── batch framing ────────────────────────────────────────────────────────
    case "EmptyBatch":
      return "the batch has no operations"
    case "InvalidOpType":
      return `operation tag ${String(args[0])} is not one the engine knows`
    case "NonCanonicalOperationData":
      return (
        `the payload for operation tag ${String(args[0])} is not its canonical encoding, so the ` +
        "engine refused it rather than accept a second spelling of the same operation"
      )

    default:
      return undefined
  }
}

/** A `bytes32` Ident32 cell as the name it holds — left-aligned, null-padded. */
function identName(raw: unknown): string {
  if (typeof raw !== "string") return String(raw)
  try {
    // Cut at the first null rather than trimming with a regex: the padding is whatever follows
    // the name, so everything before it is the name and nothing after it is. Written as an escape
    // because a literal NUL byte in source is invisible to every reader after you.
    return hexToString(raw as Hex).split("\u0000")[0] ?? ""
  } catch {
    return raw
  }
}

/** An entity key, abbreviated */
function short(raw: unknown): string {
  const text = String(raw)
  return text.length > 18 ? `${text.slice(0, 10)}…${text.slice(-6)}` : text
}

/** A `bytes1` as something readable: the character it is, plus the byte it was. */
function printable(byte: string): string {
  const code = Number.parseInt(byte.replace(/^0x/, ""), 16)
  if (!Number.isFinite(code)) return `byte ${byte}`
  const char = String.fromCharCode(code)
  return code >= 0x21 && code <= 0x7e ? `"${char}" (${byte})` : `byte ${byte}`
}
