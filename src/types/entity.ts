import { bytesToString, type Hex } from "viem"
import type { Annotation } from "./annotation"

export class Entity {
	key: Hex
	owner: Hex
	expiresAtBlock: bigint
	payload: Uint8Array
	annotations: Annotation[]

	constructor(
		key: Hex,
		owner: Hex,
		expiresAtBlock: bigint,
		payload: Uint8Array,
		annotations: Annotation[],
	) {
		this.key = key
		this.owner = owner
		this.expiresAtBlock = expiresAtBlock
		this.payload = payload
		this.annotations = annotations
	}

	toText(): string {
		return bytesToString(this.payload)
	}

	toJson(): any {
		return JSON.parse(bytesToString(this.payload))
	}
}
