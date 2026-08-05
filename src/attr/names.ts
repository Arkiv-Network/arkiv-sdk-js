import { InvalidAttributeNameError } from "./errors"

/** The longest attribute name, in bytes — the width of the on-chain `Ident32` name cell. */
export const MAX_NAME_BYTES = 32

/**
 * The attribute-name grammar (`Ident32`): a leading letter, then letters, digits, `.`, `-` or `_`.
 *
 * Names are **case-sensitive** — `Level` and `level` are two different attributes.
 *
 * The charset is ASCII-only, so a name's length in characters is also its length in bytes.
 */
const NAME_RE = /^[A-Za-z][A-Za-z0-9._-]*$/

/**
 * Words the query language reserves. They are rejected as attribute names because an attribute
 * named `not` or `str` could be written but never queried — the parser would read the name as an
 * operator or a type tag.
 *
 * Matched **case-insensitively**: query keywords are case-insensitive, so `NOT` and `not` are the
 * same operator, and the type tags are held to the same rule so that what is reserved does not
 * depend on how you happen to capitalise it.
 */
const RESERVED = new Set([
  // operators and keywords
  "and",
  "or",
  "not",
  "true",
  "false",
  "startswith",
  "exists",
  "typeof",
  // type tags
  "bool",
  "i32",
  "u64",
  "u256",
  "dec",
  "bytes32",
  "bytes",
  "str",
  "addr",
  "key",
])

/**
 * Validates an attribute name against the engine's `Ident32` grammar and the query language's
 * reserved words.
 *
 * @param name - The attribute name.
 * @throws {InvalidAttributeNameError} If the name is empty, too long, uses characters outside the
 * grammar, or collides with a reserved word.
 */
export function validateAttributeName(name: string): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new InvalidAttributeNameError(String(name), "the name is empty")
  }
  if (name.startsWith("$")) {
    throw new InvalidAttributeNameError(
      name,
      '"$" is reserved for system attributes, which the engine sets and you cannot write',
    )
  }
  if (!NAME_RE.test(name)) {
    const chars = [...name]
    const at = chars.findIndex(
      (char, index) => !(index === 0 ? /[A-Za-z]/ : /[A-Za-z0-9._-]/).test(char),
    )
    throw new InvalidAttributeNameError(
      name,
      at === 0
        ? `it starts with "${chars[0]}" rather than a letter`
        : `it contains "${chars[at]}" at position ${at}`,
    )
  }
  if (name.length > MAX_NAME_BYTES) {
    throw new InvalidAttributeNameError(name, `the name is ${name.length} bytes long`)
  }
  // `-` is a legal name character and `--` opens a comment that runs to the end of the line, so a
  // name containing one renders a query whose whole remainder is discarded
  if (name.includes("--")) {
    throw new InvalidAttributeNameError(
      name,
      '"--" opens a comment in the query language, so everything after it in a query would be ' +
        "discarded — an attribute with this name could be written but never safely queried",
    )
  }
  if (RESERVED.has(name.toLowerCase())) {
    throw new InvalidAttributeNameError(
      name,
      `"${name}" is reserved by the query language, so an attribute with this name could never ` +
        "be queried",
    )
  }
}

/** Whether `name` is a valid attribute name — the non-throwing form of {@link validateAttributeName}. */
export function isValidAttributeName(name: string): boolean {
  try {
    validateAttributeName(name)
    return true
  } catch {
    return false
  }
}
