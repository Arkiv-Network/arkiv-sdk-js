const ROOT_NAMESPACE = "arkiv"

// Debug logger type - returns a function that can be called to log messages
type DebugLogger = (...args: unknown[]) => void

// Get DEBUG environment variable (works in both Node.js and browser)
function getDebugEnv(): string {
  if (typeof process !== "undefined") {
    const debugEnv = process?.env?.DEBUG
    if (debugEnv) {
      return debugEnv
    }
  }
  // Browser: check localStorage
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    try {
      const storage = (globalThis as { localStorage?: Storage }).localStorage
      return storage?.getItem("DEBUG") || ""
    } catch {
      // localStorage might not be available
    }
  }
  return ""
}

// Parse debug patterns and check if a namespace matches
function matchesPattern(namespace: string, pattern: string): boolean {
  // Exact match
  if (pattern === namespace) return true

  // Wildcard match: "arkiv:*" matches "arkiv:query", "arkiv:rpc", etc.
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1)
    return namespace.startsWith(prefix)
  }

  // Negative match: "-arkiv:query" excludes "arkiv:query"
  if (pattern.startsWith("-")) {
    const excludePattern = pattern.slice(1)
    return !matchesPattern(namespace, excludePattern)
  }

  return false
}

// Check if a namespace is enabled for debugging
function isEnabled(namespace: string): boolean {
  const debugEnv = getDebugEnv()
  if (!debugEnv) return false

  // Split by comma/space and check each pattern
  const patterns = debugEnv.split(/[\s,]+/).filter((p) => p.length > 0)

  // If no patterns, nothing is enabled
  if (patterns.length === 0) return false

  // Check if any pattern matches (or if explicitly excluded)
  let enabled = false
  for (const pattern of patterns) {
    if (pattern.startsWith("-")) {
      // Exclude pattern - if it matches, disable
      if (matchesPattern(namespace, pattern)) {
        return false
      }
    } else if (matchesPattern(namespace, pattern)) {
      enabled = true
    }
  }

  return enabled
}

// Store enabled namespaces (for programmatic enable/disable)
const enabledNamespaces: Set<string> = new Set()
const disabledNamespaces: Set<string> = new Set()

// Color palette for namespace coloring (distinct, readable colors)
const COLOR_PALETTE = [
  "#0000FF", // blue
  "#008000", // green
  "#FF0000", // red
  "#FF00FF", // magenta
  "#FFA500", // orange
  "#800080", // purple
  "#00CED1", // dark turquoise
  "#FF1493", // deep pink
  "#32CD32", // lime green
  "#1E90FF", // dodger blue
  "#FF4500", // orange red
  "#9370DB", // medium purple
  "#00FA9A", // medium spring green
  "#FFD700", // gold
  "#DC143C", // crimson
  "#00BFFF", // deep sky blue
  "#FF69B4", // hot pink
  "#20B2AA", // light sea green
  "#DA70D6", // orchid
  "#4682B4", // steel blue
]

// Detect if we're in Node.js (for ANSI colors) or browser (for CSS colors)
const isNode = typeof process !== "undefined" && process.versions?.node != null

// ANSI color codes for Node.js (bright, distinct colors)
const ANSI_COLORS = [
  "\x1b[94m", // bright blue
  "\x1b[92m", // bright green
  "\x1b[91m", // bright red
  "\x1b[95m", // bright magenta
  "\x1b[93m", // bright yellow
  "\x1b[96m", // bright cyan
  "\x1b[35m", // magenta
  "\x1b[36m", // cyan
  "\x1b[32m", // green
  "\x1b[34m", // blue
  "\x1b[33m", // yellow
  "\x1b[31m", // red
  "\x1b[90m", // bright black (gray)
  "\x1b[37m", // white
  "\x1b[1m", // bold (as a color option)
]

const ANSI_RESET = "\x1b[0m"
const ANSI_BOLD = "\x1b[1m"

// Cache colors for namespaces (same namespace = same color)
const namespaceColors = new Map<string, { css: string; ansi: string }>()

// Generate a consistent color for a namespace based on its hash
function getColorForNamespace(namespace: string): { css: string; ansi: string } {
  // Check cache first
  const cachedColor = namespaceColors.get(namespace)
  if (cachedColor) {
    return cachedColor
  }

  // Simple hash function to convert string to number
  let hash = 0
  for (let i = 0; i < namespace.length; i++) {
    const char = namespace.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }

  // Use absolute value and modulo to get index
  const colorIndex = Math.abs(hash) % COLOR_PALETTE.length
  const cssColor = COLOR_PALETTE[colorIndex]
  const ansiColor = ANSI_COLORS[colorIndex % ANSI_COLORS.length]

  const color = { css: cssColor, ansi: ansiColor }

  // Cache the color
  namespaceColors.set(namespace, color)

  return color
}

// Create a debug logger function
function createDebugLogger(namespace: string): DebugLogger {
  // Get the color for this namespace (consistent across calls)
  const colors = getColorForNamespace(namespace)

  return (...args: unknown[]) => {
    // Check if enabled via environment variable or programmatically
    const envEnabled = isEnabled(namespace)
    const progEnabled = enabledNamespaces.has(namespace) && !disabledNamespaces.has(namespace)

    if (envEnabled || progEnabled) {
      if (isNode) {
        // Node.js: use ANSI color codes
        const coloredNamespace = `${ANSI_BOLD}${colors.ansi}${namespace}${ANSI_RESET}`
        console.log(coloredNamespace, ...args)
      } else {
        // Browser: use CSS styling with %c
        // The format is: console.log("%cstyled%cnormal", style1, style2, ...args)
        // This colors the namespace, then resets for the rest
        const style1 = `color: ${colors.css}; font-weight: bold`
        const style2 = "color: inherit; font-weight: normal"
        // Combine namespace with a space, then log with styles
        console.log(`%c${namespace}%c`, style1, style2, ...args)
      }
    }
  }
}

export const getLogger = (scope: string): DebugLogger => {
  const namespace = `${ROOT_NAMESPACE}:${scope}`
  return createDebugLogger(namespace)
}

export const enableDebug = (namespaces: string): void => {
  // Parse and add namespaces to enabled set
  const patterns = namespaces.split(/[\s,]+/).filter((p) => p.length > 0)
  for (const pattern of patterns) {
    if (pattern.startsWith("-")) {
      // Remove from enabled, add to disabled
      const namespace = pattern.slice(1)
      enabledNamespaces.delete(namespace)
      disabledNamespaces.add(namespace)
    } else {
      enabledNamespaces.add(pattern)
      disabledNamespaces.delete(pattern)
    }
  }
}

export const disableDebug = (): void => {
  enabledNamespaces.clear()
  disabledNamespaces.clear()
}
