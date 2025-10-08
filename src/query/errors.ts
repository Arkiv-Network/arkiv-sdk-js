export class NoMoreResultsError extends Error {
	constructor() {
		super("No more results")
	}
}

export class NoOffsetOrLimitError extends Error {
	constructor() {
		super("Offset and limit must be defined to fetch next or previous")
	}
}

export class OffsetCannotBeLessThanZeroError extends Error {
	constructor() {
		super("Offset cannot be less than 0")
	}
}
