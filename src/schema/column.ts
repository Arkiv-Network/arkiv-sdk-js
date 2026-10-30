import type { Hex } from "viem"
import { SchemaDefinitionError } from "./errors"
import type { ArkivValue, IndexableTypeTag, TypeTag, ValueOf } from "./types"

/**
 * What each type's constructor accepts as a value — `dec("4.1")`, `addr("0x…")`, `bytes(buf)`.
 * A column's `.default(...)` takes the same thing, or an already-typed value.
 */
export type ValueArgument<T extends TypeTag> = {
  bool: boolean
  i32: number | bigint
  u64: bigint | number | string
  u256: bigint | number | string
  dec: string | number | bigint
  bytes: Hex | Uint8Array
  str: string
  addr: string
  key: Hex | Uint8Array
}[T]

/**
 * A column: the declaration of one attribute in a schema — its type, whether the node indexes it,
 * whether an entity may leave it unset, and the value the SDK writes when a create leaves it out.
 *
 * Built by calling a type constructor with no arguments — `str()`, `dec()`, `bytes()` — and refined
 * by chaining. Every refinement returns a new column; a column is never modified in place.
 *
 * @typeParam T - The attribute's type tag.
 * @typeParam I - Whether the attribute is indexed.
 * @typeParam O - Whether the attribute may be absent.
 * @typeParam D - Whether the column has a default.
 *
 * @example
 * str()                          // stored, not indexed, required
 * str().indexed()                // filterable with eq / ne / startsWith
 * dec().indexed().optional()     // filterable, and an entity may leave it unset
 * str().default("text/markdown") // filled in on create when left out
 * bytes()                        // a blob; bytes has no .indexed()
 */
export type Column<
  T extends TypeTag = TypeTag,
  I extends boolean = boolean,
  O extends boolean = boolean,
  D extends boolean = boolean,
> = ColumnProperties<T, I, O, D> & (T extends IndexableTypeTag ? IndexableColumn<T, O, D> : unknown)

/**
 * Any column, whatever its type and flags — the shape a schema is built from. Written out rather
 * than derived from {@link Column}, whose refinement methods would make every column's type
 * invariant in its tag.
 */
export type AnyColumn = {
  readonly type: TypeTag
  readonly isIndexed: boolean
  readonly isOptional: boolean
  readonly defaultValue: ArkivValue | undefined
}

type ColumnProperties<
  T extends TypeTag,
  I extends boolean,
  O extends boolean,
  D extends boolean,
> = {
  /** The attribute's type tag. */
  readonly type: T
  /** Whether the node indexes the attribute, which is what makes it usable in `where`. */
  readonly isIndexed: I
  /**
   * Whether an entity may leave the attribute unset. A create may then omit it, a patch may unset
   * it, and a read gives back `undefined` where it is missing.
   */
  readonly isOptional: O
  /** The value a create writes when the attribute is left out, if the column has one. */
  readonly defaultValue: D extends true ? ValueOf<T> : undefined

  /** The same column, allowed to be absent. */
  optional(): Column<T, I, true, D>

  /**
   * The same column, with a value that a create writes whenever the attribute is left out. The
   * default is applied by the SDK, not the node, and only on create.
   *
   * @param value - What the type's constructor would accept — `dec().default("4.1")` — or a value
   * of the column's type.
   * @throws {InvalidValueError} If the value does not fit the column's type.
   */
  default(value: ValueArgument<T> | ValueOf<T>): Column<T, I, O, true>
}

type IndexableColumn<T extends IndexableTypeTag, O extends boolean, D extends boolean> = {
  /**
   * The same column, indexed by the node. Only indexed attributes can be filtered on in `where`;
   * an unindexed one can be stored and selected, and does not pay for an index.
   */
  indexed(): Column<T, true, O, D>
}

/**
 * Marks a column. A registry symbol rather than `instanceof`, so a column made by one copy of the
 * SDK — its ESM build, say — is still recognised by another, such as the CJS build a dependency
 * loaded.
 */
const COLUMN_BRAND = Symbol.for("@arkiv-network/sdk/column")

/** Resolves the input to `.default(...)` into a value of the column's type. */
type Coerce = (tag: TypeTag, input: unknown) => ArkivValue

class ColumnDefinition {
  readonly type: TypeTag
  readonly isIndexed: boolean
  readonly isOptional: boolean
  readonly defaultValue: ArkivValue | undefined
  readonly #coerce: Coerce

  constructor(
    type: TypeTag,
    isIndexed: boolean,
    isOptional: boolean,
    defaultValue: ArkivValue | undefined,
    coerce: Coerce,
  ) {
    this.type = type
    this.isIndexed = isIndexed
    this.isOptional = isOptional
    this.defaultValue = defaultValue
    this.#coerce = coerce
    Object.defineProperty(this, COLUMN_BRAND, { value: true })
    Object.freeze(this)
  }

  indexed(): ColumnDefinition {
    // Unreachable from typed code — a bytes column has no `indexed` — so this is for the callers
    // the type system does not cover.
    if (this.type === "bytes") {
      throw new SchemaDefinitionError(
        "a bytes column cannot be indexed. Bytes are stored, never indexed, so they can be " +
          "selected but not filtered on — index a hash of them, as a hex str, instead",
      )
    }
    return this.#with({ isIndexed: true })
  }

  optional(): ColumnDefinition {
    return this.#with({ isOptional: true })
  }

  default(...args: unknown[]): ColumnDefinition {
    // Counted rather than compared to undefined: `.default(undefined)` is a mistake to report, not
    // a request for no default.
    if (args.length === 0) {
      throw new SchemaDefinitionError(
        `.default() needs a value — e.g. ${this.type}().default(...). Leave .default() off for a ` +
          "column the create must always provide",
      )
    }
    return this.#with({ defaultValue: this.#coerce(this.type, args[0]) })
  }

  #with(
    changes: Partial<Pick<ColumnDefinition, "isIndexed" | "isOptional" | "defaultValue">>,
  ): ColumnDefinition {
    return new ColumnDefinition(
      this.type,
      changes.isIndexed ?? this.isIndexed,
      changes.isOptional ?? this.isOptional,
      changes.defaultValue ?? this.defaultValue,
      this.#coerce,
    )
  }
}

/**
 * A fresh column of type `tag`: unindexed, required, no default. Internal seam for the type
 * constructors, which return one when called with no arguments.
 */
export function createColumn<T extends TypeTag>(
  tag: T,
  coerce: Coerce,
): Column<T, false, false, false> {
  return new ColumnDefinition(tag, false, false, undefined, coerce) as unknown as Column<
    T,
    false,
    false,
    false
  >
}

/** Whether `input` is a column, as opposed to a value or anything else. */
export function isColumn(input: unknown): input is AnyColumn {
  return typeof input === "object" && input !== null && COLUMN_BRAND in input
}
