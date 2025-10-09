export type PredicateType = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "not"
export type PredicateContainerType = "or" | "and"

export type Predicate =
	| {
			type: PredicateType
			key: string
			value: string | number
	  }
	| {
			type: PredicateContainerType
			predicates: Predicate[]
	  }

/**
 * Creates an OR predicate
 * @param predicates - The predicates to combine
 * @returns The OR predicate
 *
 * @example
 * const predicates = [eq("name", "John"), eq("age", 30)]
 * const result = or(predicates)
 * // result = { type: "or", predicates: [eq("name", "John"), eq("age", 30)] }
 *
 */
export function or(predicates: Predicate[]): Predicate {
	return { type: "or", predicates }
}

/**
 * Creates an AND predicate
 * @param predicates - The predicates to combine
 * @returns The AND predicate
 *
 * @example
 * const predicates = [eq("name", "John"), eq("age", 30)]
 * const result = and(predicates)
 * // result = { type: "and", predicates: [eq("name", "John"), eq("age", 30)] }
 *
 */
export function and(predicates: Predicate[]): Predicate {
	return { type: "and", predicates }
}

/**
 * Creates an equality predicate
 * @param key - The key to compare
 * @param value - The value to compare
 * @returns The equality predicate
 *
 * @example
 * const predicate = eq("name", "John")
 * // result = { type: "eq", key: "name", value: "John" }
 */
export function eq(key: string, value: string | number): Predicate {
	return { type: "eq", key, value }
}

/**
 * Creates a not equal predicate
 * @param key - The key to compare
 * @param value - The value to compare
 * @returns The not equal predicate
 *
 * @example
 * const predicate = neq("name", "John")
 * // result = { type: "neq", key: "name", value: "John" }
 */
export function neq(key: string, value: string | number): Predicate {
	return { type: "neq", key, value }
}

/**
 * Creates a greater than predicate
 * @param key - The key to compare
 * @param value - The value to compare
 * @returns The greater than predicate
 *
 * @example
 * const predicate = gt("name", "John")
 * // result = { type: "gt", key: "name", value: "John" }
 */
export function gt(key: string, value: string | number): Predicate {
	return { type: "gt", key, value }
}

/**
 * Creates a greater than or equal predicate
 * @param key - The key to compare
 * @param value - The value to compare
 * @returns The greater than or equal predicate
 *
 * @example
 * const predicate = gte("name", "John")
 * // result = { type: "gte", key: "name", value: "John" }
 */
export function gte(key: string, value: string | number): Predicate {
	return { type: "gte", key, value }
}

/**
 * Creates a less than predicate
 * @param key - The key to compare
 * @param value - The value to compare
 * @returns The less than predicate
 *
 * @example
 * const predicate = lt("name", "John")
 * // result = { type: "lt", key: "name", value: "John" }
 */
export function lt(key: string, value: string | number): Predicate {
	return { type: "lt", key, value }
}

/**
 * Creates a less than or equal predicate
 * @param key - The key to compare
 * @param value - The value to compare
 * @returns The less than or equal predicate
 *
 * @example
 * const predicate = lte("name", "John")
 * // result = { type: "lte", key: "name", value: "John" }
 */
export function lte(key: string, value: string | number): Predicate {
	return { type: "lte", key, value }
}

/**
 * Creates a not predicate
 * @param key - The key to compare
 * @returns The not predicate
 *
 * @example
 * const predicate = not("name")
 * // result = { type: "not", key: "name", value: "" }
 */
export function not(key: string): Predicate {
	return { type: "not", key, value: "" }
}
