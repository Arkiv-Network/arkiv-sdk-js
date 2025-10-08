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

export function or(predicates: Predicate[]): Predicate {
	return { type: "or", predicates }
}

export function and(predicates: Predicate[]): Predicate {
	return { type: "and", predicates }
}

export function eq(key: string, value: string | number): Predicate {
	return { type: "eq", key, value }
}

export function neq(key: string, value: string | number): Predicate {
	return { type: "neq", key, value }
}

export function gte(key: string, value: string | number): Predicate {
	return { type: "gte", key, value }
}

export function lt(key: string, value: string | number): Predicate {
	return { type: "lt", key, value }
}

export function lte(key: string, value: string | number): Predicate {
	return { type: "lte", key, value }
}

export function not(key: string): Predicate {
	return { type: "not", key, value: "" }
}
