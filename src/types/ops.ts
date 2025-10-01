import type { Annotation } from "./annotation"

export type CreateEntity = {
	payload: Uint8Array
	annotations: Annotation[]
	btl: number
}
