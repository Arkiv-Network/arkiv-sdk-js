import { describe, expect, test } from "bun:test"
import { and, eq, gt, gte, lt, lte, neq, not, or, type Predicate } from "./predicate"

describe("Predicate Factory Functions", () => {
	describe("eq()", () => {
		test("creates equality predicate with string value", () => {
			const result = eq("name", "john")

			expect(result).toEqual({
				type: "eq",
				key: "name",
				value: "john",
			})
		})

		test("creates equality predicate with numeric value", () => {
			const result = eq("age", 25)

			expect(result).toEqual({
				type: "eq",
				key: "age",
				value: 25,
			})
		})

		test("creates equality predicate with zero", () => {
			const result = eq("count", 0)

			expect(result).toEqual({
				type: "eq",
				key: "count",
				value: 0,
			})
		})

		test("creates equality predicate with empty string", () => {
			const result = eq("name", "")

			expect(result).toEqual({
				type: "eq",
				key: "name",
				value: "",
			})
		})
	})

	describe("neq()", () => {
		test("creates not equal predicate with string value", () => {
			const result = neq("status", "inactive")

			expect(result).toEqual({
				type: "neq",
				key: "status",
				value: "inactive",
			})
		})

		test("creates not equal predicate with numeric value", () => {
			const result = neq("count", 0)

			expect(result).toEqual({
				type: "neq",
				key: "count",
				value: 0,
			})
		})
	})

	describe("gt()", () => {
		test("creates greater than predicate with numeric value", () => {
			const result = gt("age", 18)

			expect(result).toEqual({
				type: "gt",
				key: "age",
				value: 18,
			})
		})

		test("creates greater than predicate with negative number", () => {
			const result = gt("balance", -100)

			expect(result).toEqual({
				type: "gt",
				key: "balance",
				value: -100,
			})
		})

		test("creates greater than predicate with string value", () => {
			const result = gt("name", "abc")

			expect(result).toEqual({
				type: "gt",
				key: "name",
				value: "abc",
			})
		})
	})

	describe("gte()", () => {
		test("creates greater than or equal predicate with numeric value", () => {
			const result = gte("age", 18)

			expect(result).toEqual({
				type: "gte",
				key: "age",
				value: 18,
			})
		})

		test("creates greater than or equal predicate with negative number", () => {
			const result = gte("temperature", -10)

			expect(result).toEqual({
				type: "gte",
				key: "temperature",
				value: -10,
			})
		})

		test("creates greater than or equal predicate with string value", () => {
			const result = gte("version", "1.0.0")

			expect(result).toEqual({
				type: "gte",
				key: "version",
				value: "1.0.0",
			})
		})
	})

	describe("lt()", () => {
		test("creates less than predicate with numeric value", () => {
			const result = lt("age", 65)

			expect(result).toEqual({
				type: "lt",
				key: "age",
				value: 65,
			})
		})

		test("creates less than predicate with string value", () => {
			const result = lt("priority", "high")

			expect(result).toEqual({
				type: "lt",
				key: "priority",
				value: "high",
			})
		})
	})

	describe("lte()", () => {
		test("creates less than or equal predicate with numeric value", () => {
			const result = lte("score", 100)

			expect(result).toEqual({
				type: "lte",
				key: "score",
				value: 100,
			})
		})

		test("creates less than or equal predicate with string value", () => {
			const result = lte("date", "2023-12-31")

			expect(result).toEqual({
				type: "lte",
				key: "date",
				value: "2023-12-31",
			})
		})
	})

	describe("not()", () => {
		test("creates not predicate", () => {
			const result = not("deleted")

			expect(result).toEqual({
				type: "not",
				key: "deleted",
				value: "",
			})
		})

		test("creates not predicate with different key", () => {
			const result = not("archived")

			expect(result).toEqual({
				type: "not",
				key: "archived",
				value: "",
			})
		})
	})

	describe("or()", () => {
		test("creates or predicate with two simple predicates", () => {
			const predicates = [eq("type", "admin"), eq("type", "moderator")]
			const result = or(predicates)

			expect(result).toEqual({
				type: "or",
				predicates: [
					{ type: "eq", key: "type", value: "admin" },
					{ type: "eq", key: "type", value: "moderator" },
				],
			})
		})

		test("creates or predicate with mixed predicate types", () => {
			const predicates = [eq("status", "active"), gte("score", 100), neq("role", "guest")]
			const result = or(predicates)

			expect(result).toEqual({
				type: "or",
				predicates: [
					{ type: "eq", key: "status", value: "active" },
					{ type: "gte", key: "score", value: 100 },
					{ type: "neq", key: "role", value: "guest" },
				],
			})
		})

		test("creates or predicate with single predicate", () => {
			const predicates = [eq("enabled", 1)]
			const result = or(predicates)

			expect(result).toEqual({
				type: "or",
				predicates: [{ type: "eq", key: "enabled", value: 1 }],
			})
		})

		test("creates or predicate with empty array", () => {
			const predicates: Predicate[] = []
			const result = or(predicates)

			expect(result).toEqual({
				type: "or",
				predicates: [],
			})
		})

		test("creates or predicate with nested and", () => {
			const nestedAnd = and([eq("verified", 1), gte("age", 18)])
			const predicates = [eq("status", "premium"), nestedAnd]
			const result = or(predicates)

			expect(result).toEqual({
				type: "or",
				predicates: [
					{ type: "eq", key: "status", value: "premium" },
					{
						type: "and",
						predicates: [
							{ type: "eq", key: "verified", value: 1 },
							{ type: "gte", key: "age", value: 18 },
						],
					},
				],
			})
		})
	})

	describe("and()", () => {
		test("creates and predicate with two simple predicates", () => {
			const predicates = [eq("status", "active"), eq("verified", 1)]
			const result = and(predicates)

			expect(result).toEqual({
				type: "and",
				predicates: [
					{ type: "eq", key: "status", value: "active" },
					{ type: "eq", key: "verified", value: 1 },
				],
			})
		})

		test("creates and predicate with mixed predicate types", () => {
			const predicates = [eq("active", 1), gte("age", 18), lt("age", 65), neq("role", "guest")]
			const result = and(predicates)

			expect(result).toEqual({
				type: "and",
				predicates: [
					{ type: "eq", key: "active", value: 1 },
					{ type: "gte", key: "age", value: 18 },
					{ type: "lt", key: "age", value: 65 },
					{ type: "neq", key: "role", value: "guest" },
				],
			})
		})

		test("creates and predicate with single predicate", () => {
			const predicates = [eq("enabled", 1)]
			const result = and(predicates)

			expect(result).toEqual({
				type: "and",
				predicates: [{ type: "eq", key: "enabled", value: 1 }],
			})
		})

		test("creates and predicate with empty array", () => {
			const predicates: Predicate[] = []
			const result = and(predicates)

			expect(result).toEqual({
				type: "and",
				predicates: [],
			})
		})

		test("creates and predicate with nested or", () => {
			const nestedOr = or([eq("type", "admin"), eq("type", "moderator")])
			const predicates = [eq("active", 1), nestedOr]
			const result = and(predicates)

			expect(result).toEqual({
				type: "and",
				predicates: [
					{ type: "eq", key: "active", value: 1 },
					{
						type: "or",
						predicates: [
							{ type: "eq", key: "type", value: "admin" },
							{ type: "eq", key: "type", value: "moderator" },
						],
					},
				],
			})
		})
	})

	describe("Complex Nested Predicates", () => {
		test("creates deeply nested predicate structure", () => {
			const innerOr = or([eq("role", "admin"), eq("role", "moderator")])
			const innerAnd = and([eq("verified", 1), gte("reputation", 1000)])
			const outerOr = or([innerAnd, innerOr])
			const result = and([eq("active", 1), outerOr, neq("banned", 1)])

			expect(result).toEqual({
				type: "and",
				predicates: [
					{ type: "eq", key: "active", value: 1 },
					{
						type: "or",
						predicates: [
							{
								type: "and",
								predicates: [
									{ type: "eq", key: "verified", value: 1 },
									{ type: "gte", key: "reputation", value: 1000 },
								],
							},
							{
								type: "or",
								predicates: [
									{ type: "eq", key: "role", value: "admin" },
									{ type: "eq", key: "role", value: "moderator" },
								],
							},
						],
					},
					{ type: "neq", key: "banned", value: 1 },
				],
			})
		})

		test("creates predicate with multiple comparison types", () => {
			const result = and([
				gte("age", 18),
				lt("age", 65),
				lte("score", 100),
				neq("status", "suspended"),
				not("deleted"),
			])

			expect(result).toEqual({
				type: "and",
				predicates: [
					{ type: "gte", key: "age", value: 18 },
					{ type: "lt", key: "age", value: 65 },
					{ type: "lte", key: "score", value: 100 },
					{ type: "neq", key: "status", value: "suspended" },
					{ type: "not", key: "deleted", value: "" },
				],
			})
		})
	})

	describe("Type Safety", () => {
		test("predicates maintain correct type information", () => {
			const stringPred = eq("name", "test")
			const numPred = eq("count", 42)
			const orPred = or([stringPred, numPred])
			const andPred = and([stringPred, numPred])

			// Type assertions to ensure TypeScript types are correct
			expect(stringPred.type).toBe("eq")
			expect(numPred.type).toBe("eq")
			expect(orPred.type).toBe("or")
			expect(andPred.type).toBe("and")

			// Verify container predicates have predicates array
			if (orPred.type === "or" || orPred.type === "and") {
				expect(Array.isArray(orPred.predicates)).toBe(true)
			}

			if (andPred.type === "or" || andPred.type === "and") {
				expect(Array.isArray(andPred.predicates)).toBe(true)
			}
		})
	})
})
