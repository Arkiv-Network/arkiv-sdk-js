import createDebug from "debug"

const ROOT_NAMESPACE = "arkiv"

export const getLogger = (scope: string) => createDebug(`${ROOT_NAMESPACE}:${scope}`)

export const enableDebug = (namespaces: string): void => {
  createDebug.enable(namespaces)
}

export const disableDebug = (): void => {
  createDebug.disable()
}
