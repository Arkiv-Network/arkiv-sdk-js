export class NoMoreResultsError extends Error {
  constructor() {
    super("No more results")
  }
}

export class NoCursorOrLimitError extends Error {
  constructor() {
    super("Cursor and limit must be defined to fetch next")
  }
}

export class NoEntityFoundError extends Error {
  constructor() {
    super("No entity found")
  }
}
