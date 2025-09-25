import type { Annotation } from "./annotation";

export type Entity = {
	key: string;
	payload: Uint8Array;
	annotations: Annotation[];
};
