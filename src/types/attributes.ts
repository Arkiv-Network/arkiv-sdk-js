/**
 * An entity attribute (key/value pair).
 *
 * Arkiv supports both string and number values. Numeric values **must be
 * integers** — passing a non-integer number (e.g. `1.5`) throws an
 * {@link InvalidAttributeError} at mutation time. To store a non-integer value:
 * - Scale it to an integer (e.g. `1.5` -> `1500`, dividing by the same factor on
 *   read) to keep numeric ordering and range queries working.
 * - Or pass it as a string (e.g. `"1.5"`), which sorts lexicographically and so
 *   does not support numeric comparisons.
 */
export type Attribute = {
  key: string
  /** Attribute value. A `number` must be an integer (scale non-integers, e.g. `1.5` -> `1500`, or use a string). Throws {@link InvalidAttributeError} otherwise. */
  value: string | number
}
