## [0.5.2] - 2025-11-21

### Added
- `chainFromName` - utility function allowing to get a predefined chain by its name, convenient to get chain based on env variable (https://github.com/Arkiv-Network/arkiv-sdk-js/issues/12)
- `QueryOptions` for `query(rawQuery: string)` public client's function allowing to setup what will be returned and more things like pagination
- Results for `query(...)` function with raw query now returns not only entities but also cursor and block number


### Changed
- Replaced `debug` module dependency with custom logger implementation that works in both Node.js and browser environments without bundler configuration issues
- Consolidated error classes exported from main index: `EntityMutationError`, `NoMoreResultsError`, `NoCursorOrLimitError`, `NoEntityFoundError`

### Fixed
- Fixed browser compatibility issue with `debug` module causing "exports is not defined" errors in browser environments
- Improved error handling for reverted transactions when using MetaMask as transport - now throws more descriptive errors (https://github.com/Arkiv-Network/arkiv-sdk-js/issues/16)
- Fix error while using value=0 with numeric attributes