/**
 * @fileoverview Arkiv TypeScript SDK - Main entry point for interacting with the Arkiv L2 network.
 *
 * This module provides comprehensive functionality for decentralized data storage and management
 * on Arkiv, including entity CRUD operations, real-time event monitoring, and blockchain interactions.
 *
 * @author Arkiv Team
 * @version 1.0.0
 * @see {@link https://docs.arkiv.network/} - Official Arkiv Documentation
 */

import {
  getAbiItem,
  parseAbi,
  toEventHash,
} from "viem"

// Export all high-level client functionality
export * from "./client"

// Export internal implementation for advanced use cases
export * as internal from "./internal/client"

// Re-export useful viem utilities
export { formatEther } from "viem"

/**
 * The Application Binary Interface (ABI) for Arkiv storage contract events.
 *
 * This ABI defines the event signatures emitted by the Arkiv storage contract
 * for all entity lifecycle operations. These events are used to track entity creation,
 * updates, deletions, and BTL extensions on the blockchain.
 *
 * @public
 */
export const arkivABI = parseAbi([
  // TODO: Update these when we update them in op-geth
  "event GolemBaseStorageEntityCreated(uint256 indexed entityKey, uint256 expirationBlock)",
  "event GolemBaseStorageEntityUpdated(uint256 indexed entityKey, uint256 expirationBlock)",
  "event GolemBaseStorageEntityDeleted(uint256 indexed entityKey)",
  "event GolemBaseStorageEntityBTLExtended(uint256 indexed entityKey, uint256 oldExpirationBlock, uint256 newExpirationBlock)",
])

/**
 * Pre-computed event signature hash for ArkivStorageEntityCreated events.
 * Used for efficient event filtering and monitoring in blockchain queries.
 * @public
 */
export const arkivStorageEntityCreatedSignature =
  toEventHash(getAbiItem({ abi: arkivABI, name: "GolemBaseStorageEntityCreated" }))

/**
 * Pre-computed event signature hash for ArkivStorageEntityUpdated events.
 * Used for efficient event filtering and monitoring in blockchain queries.
 * @public
 */
export const arkivStorageEntityUpdatedSignature =
  toEventHash(getAbiItem({ abi: arkivABI, name: "GolemBaseStorageEntityUpdated" }))

/**
 * Pre-computed event signature hash for ArkivStorageEntityDeleted events.
 * Used for efficient event filtering and monitoring in blockchain queries.
 * @public
 */
export const arkivStorageEntityDeletedSignature =
  toEventHash(getAbiItem({ abi: arkivABI, name: "GolemBaseStorageEntityDeleted" }))

/**
 * Pre-computed event signature hash for ArkivStorageEntityBTLExtended events.
 * Used for efficient event filtering and monitoring in blockchain queries.
 * @public
 */
export const arkivStorageEntityBTLExtendedSignature =
  toEventHash(getAbiItem({ abi: arkivABI, name: "GolemBaseStorageEntityBTLExtended" }))


/**
 * Generic annotation class for attaching metadata to Arkiv entities.
 *
 * Annotations provide a key-value mechanism for adding searchable metadata
 * to entities, enabling efficient querying and categorization of stored data.
 * They are essential for building database-like functionality on top of Arkiv.
 *
 * @template V - The type of the annotation value (string, number, etc.)
 * @public
 *
 * @example
 * ```typescript
 * // String annotations for categorization
 * const typeAnnotation = new Annotation("type", "user-profile");
 * const statusAnnotation = new Annotation("status", "active");
 *
 * // Numeric annotations for indexing and filtering
 * const priorityAnnotation = new Annotation("priority", 1);
 * const timestampAnnotation = new Annotation("created_at", Date.now());
 * ```
 */
export class Annotation<V> {
  /** The annotation key identifier */
  readonly key: string
  /** The annotation value */
  readonly value: V

  /**
   * Create a new annotation with the specified key and value.
   *
   * @param key - The string identifier for this annotation
   * @param value - The value to associate with the key
   */
  constructor(key: string, value: V) {
    this.key = key
    this.value = value
  }
}

/**
 * Type alias for string-valued annotations, commonly used for categorization and tagging.
 * @public
 */
export type StringAnnotation = Annotation<string>

/**
 * Type alias for numeric-valued annotations, commonly used for scoring and indexing.
 * @public
 */
export type NumericAnnotation = Annotation<number>

/**
 * Generic tagged union helper class for type-safe discrimination.
 *
 * This utility class provides a way to create discriminated unions with
 * compile-time type safety, commonly used in functional programming patterns.
 *
 * @template Tag - The discriminant tag type
 * @template Data - The associated data type
 * @public
 */
export class Tagged<Tag, Data> {
  /** The discriminant tag for this tagged value */
  readonly tag: Tag
  /** The associated data payload */
  readonly data: Data

  /**
   * Create a new tagged value with the specified tag and data.
   *
   * @param tag - The discriminant tag
   * @param data - The associated data payload
   */
  constructor(tag: Tag, data: Data) {
    this.tag = tag
    this.data = data
  }
}

/**
 * Account data discriminated union for different authentication methods.
 *
 * Arkiv supports two primary authentication mechanisms:
 * - Private key accounts for server-side applications and testing
 * - Ethereum provider integration for browser wallets (MetaMask, WalletConnect, etc.)
 *
 * @public
 *
 * @example
 * Private key account:
 * ```typescript
 * const privateKeyAccount: AccountData = new Tagged(
 *   "privatekey",
 *   new Uint8Array([...]) // 32-byte private key
 * );
 * ```
 *
 * @example
 * Browser wallet provider:
 * ```typescript
 * const providerAccount: AccountData = new Tagged(
 *   "ethereumprovider",
 *   window.ethereum // MetaMask provider
 * );
 * ```
 */
export type AccountData =
  Tagged<"privatekey", Uint8Array> |
  Tagged<"ethereumprovider", { request(...args: any): Promise<any> }>

/**
 * Type representing hexadecimal-encoded values used throughout the Arkiv protocol.
 *
 * This type ensures type safety for Ethereum addresses, entity keys, transaction hashes,
 * and other blockchain-related hexadecimal values that must start with '0x'.
 *
 * @public
 *
 * @example
 * ```typescript
 * const entityKey: Hex = "0x1234567890abcdef1234567890abcdef12345678";
 * const address: Hex = "0x742d35Cc9e1e3FbD000de0e98a3b8b8c0d3b2F8e";
 * ```
 */
export type Hex = `0x${string}`

/**
 * Builder class for creating expiration time values with convenient conversion methods.
 *
 * Arkiv uses a block-based expiration system where each block is produced every 2 seconds.
 * This class provides type-safe builders to convert various time units to block counts.
 *
 * @public
 *
 * @example
 * ```typescript
 * // Create from seconds (recommended for new code)
 * const exp1 = ExpirationTime.fromSeconds(3600); // 1 hour
 *
 * // Create from blocks (legacy method)
 * const exp2 = ExpirationTime.fromBlocks(1800); // 1 hour (1800 blocks * 2s)
 *
 * // Create from hours
 * const exp3 = ExpirationTime.fromHours(24); // 1 day
 *
 * // Create from days
 * const exp4 = ExpirationTime.fromDays(7); // 1 week
 *
 * // Get the block count
 * console.log(exp1.blocks); // 1800
 * ```
 */
export class ExpirationTime {
  /** Number of blocks representing this expiration time */
  readonly blocks: number;

  /**
   * Block time in seconds (Arkiv produces blocks every 2 seconds)
   * TODO: replace with new RPC method
   */
  private static readonly BLOCK_TIME_SECONDS = 2;

  private constructor(blocks: number) {
    if (blocks <= 0) {
      throw new Error("Expiration time must be positive");
    }
    this.blocks = Math.floor(blocks);
  }

  /**
   * Create expiration time from seconds
   * @param seconds - Duration in seconds
   * @returns ExpirationTime instance
   */
  static fromSeconds(seconds: number): ExpirationTime {
    return new ExpirationTime(seconds / ExpirationTime.BLOCK_TIME_SECONDS);
  }

  /**
   * Create expiration time from block count
   * @param blocks - Number of blocks
   * @returns ExpirationTime instance
   */
  static fromBlocks(blocks: number): ExpirationTime {
    return new ExpirationTime(blocks);
  }

  /**
   * Create expiration time from hours
   * @param hours - Duration in hours
   * @returns ExpirationTime instance
   */
  static fromHours(hours: number): ExpirationTime {
    return ExpirationTime.fromSeconds(hours * 3600);
  }

  /**
   * Create expiration time from days
   * @param days - Duration in days
   * @returns ExpirationTime instance
   */
  static fromDays(days: number): ExpirationTime {
    return ExpirationTime.fromSeconds(days * 86400);
  }

  /**
   * Convert expiration time to seconds
   * @returns Duration in seconds
   */
  toSeconds(): number {
    return this.blocks * ExpirationTime.BLOCK_TIME_SECONDS;
  }
}

/**
 * Internal helper to resolve expiration time from either new API or legacy BTL.
 * Priority: expires_in > btl
 * @internal
 */
export function resolveExpirationBlocks(options: {
  expires_in?: number | ExpirationTime;
  btl?: number;
}): number {
  const { expires_in, btl } = options;
  return getBTL(expires_in, btl)
}

/**
 * Internal helper to resolve extension duration from either new API or legacy numberOfBlocks.
 * Priority: duration > numberOfBlocks
 * @internal
 */
export function resolveExtensionBlocks(options: {
  duration?: number | ExpirationTime;
  numberOfBlocks?: number;
}): number {
  const { duration, numberOfBlocks } = options;
  return getBTL(duration, numberOfBlocks)
}

export function getBTL(duration: number | ExpirationTime | undefined, numberOfBlocks: number | undefined) {
  // Priority: duration takes precedence
  if (duration !== undefined) {
    // If it's a number, treat it as seconds and convert to blocks
    if (typeof duration === 'number') {
      return ExpirationTime.fromSeconds(duration).blocks;
    }
    // Otherwise it's an ExpirationTime object
    return duration.blocks;
  }

  if (numberOfBlocks !== undefined) {
    // Warn about deprecated numberOfBlocks
    console.warn(
      "⚠️  numberOfBlocks is deprecated and will be removed in a future version. " +
      "Please use 'duration' instead. " +
      "Example: duration: 86400 (seconds) or duration: ExpirationTime.fromDays(1)"
    );
    return numberOfBlocks;
  }

  throw new Error("Either 'duration' or 'numberOfBlocks' must be specified");
}

/**
 * Specification for creating new entities in Arkiv.
 *
 * This type defines all the parameters needed to create a new entity,
 * including the data payload, expiration time, and metadata annotations
 * for efficient querying and categorization.
 *
 * @public
 *
 * @example
 * Using the new expires_in API with seconds (recommended):
 * ```typescript
 * const createSpec: ArkivCreate = {
 *   data: new TextEncoder().encode(JSON.stringify({ message: "Hello Arkiv" })),
 *   expires_in: 86400, // Expires in 24 hours (86400 seconds)
 *   stringAnnotations: [
 *     new Annotation("type", "message"),
 *     new Annotation("category", "greeting")
 *   ],
 *   numericAnnotations: [
 *     new Annotation("priority", 1),
 *     new Annotation("timestamp", Date.now())
 *   ]
 * };
 * ```
 *
 * @example
 * Using ExpirationTime builder (also recommended):
 * ```typescript
 * const createSpec: ArkivCreate = {
 *   data: new TextEncoder().encode("Data"),
 *   expires_in: ExpirationTime.fromHours(24), // More readable
 *   stringAnnotations: [],
 *   numericAnnotations: []
 * };
 * ```
 *
 * @example
 * Using legacy BTL (deprecated):
 * ```typescript
 * const createSpec: ArkivCreate = {
 *   data: new TextEncoder().encode(JSON.stringify({ message: "Hello Arkiv" })),
 *   btl: 1000, // Deprecated: use expires_in instead
 *   stringAnnotations: [],
 *   numericAnnotations: []
 * };
 * ```
 */
export type ArkivCreate = {
  /** The binary data to store in the entity */
  readonly data: Uint8Array,
  /**
   * @deprecated Use `expires_in` instead. BTL will be removed in a future version.
   * Block-to-Live: number of blocks after which the entity expires
   */
  readonly btl?: number,
  /**
   * Expiration time for the entity in seconds, or ExpirationTime object (preferred over btl).
   * When using number, it represents duration in seconds (not blocks).
   */
  readonly expires_in?: number | ExpirationTime,
  /** String-valued metadata annotations for querying and categorization */
  readonly stringAnnotations: StringAnnotation[]
  /** Numeric-valued metadata annotations for indexing and filtering */
  readonly numericAnnotations: NumericAnnotation[],
}
/**
 * Specification for updating existing entities in Arkiv.
 *
 * Updates replace the entire entity content including data and annotations.
 * The entity owner can modify the expiration time to extend or reduce the entity's lifetime.
 * Only the entity owner can perform update operations.
 *
 * @public
 *
 * @example
 * Using the new expires_in API (recommended):
 * ```typescript
 * const updateSpec: ArkivUpdate = {
 *   entityKey: "0x1234567890abcdef12345678",
 *   data: new TextEncoder().encode(JSON.stringify({ message: "Updated content" })),
 *   expires_in: ExpirationTime.fromDays(7),
 *   stringAnnotations: [
 *     new Annotation("status", "updated"),
 *     new Annotation("version", "2.0")
 *   ],
 *   numericAnnotations: [
 *     new Annotation("last_modified", Date.now())
 *   ]
 * };
 * ```
 *
 * @example
 * Using legacy BTL (deprecated):
 * ```typescript
 * const updateSpec: ArkivUpdate = {
 *   entityKey: "0x1234567890abcdef12345678",
 *   data: new TextEncoder().encode(JSON.stringify({ message: "Updated content" })),
 *   btl: 2000, // Deprecated: use expires_in instead
 *   stringAnnotations: [],
 *   numericAnnotations: []
 * };
 * ```
 */
export type ArkivUpdate = {
  /** The hexadecimal key of the entity to update */
  readonly entityKey: Hex,
  /** The new binary data to store in the entity */
  readonly data: Uint8Array,
  /**
   * @deprecated Use `expires_in` instead. BTL will be removed in a future version.
   * New Block-to-Live value for the entity
   */
  readonly btl?: number,
  /**
   * New expiration time for the entity in seconds, or ExpirationTime object (preferred over btl).
   * When using number, it represents duration in seconds (not blocks).
   */
  readonly expires_in?: number | ExpirationTime,
  /** New string-valued metadata annotations */
  readonly stringAnnotations: StringAnnotation[]
  /** New numeric-valued metadata annotations */
  readonly numericAnnotations: NumericAnnotation[],
}
/**
 * Specification for extending the lifetime of existing entities.
 *
 * Extension allows entity owners to prolong the lifetime of their entities
 * without modifying the data or annotations. This is useful for maintaining
 * important data that should not expire.
 *
 * @public
 *
 * @example
 * Using the new duration API (recommended):
 * ```typescript
 * const extendSpec: ArkivExtend = {
 *   entityKey: "0x1234567890abcdef12345678",
 *   duration: ExpirationTime.fromHours(48) // Extend by 48 hours
 * };
 * ```
 *
 * @example
 * Using legacy numberOfBlocks (deprecated):
 * ```typescript
 * const extendSpec: ArkivExtend = {
 *   entityKey: "0x1234567890abcdef12345678",
 *   numberOfBlocks: 500 // Deprecated: use duration instead
 * };
 * ```
 */
export type ArkivExtend = {
  /** The hexadecimal key of the entity to extend */
  readonly entityKey: Hex,
  /**
   * @deprecated Use `duration` instead. numberOfBlocks will be removed in a future version.
   * Number of additional blocks to add to the entity's current expiration
   */
  readonly numberOfBlocks?: number,
  /**
   * Duration to extend the entity's lifetime in seconds, or ExpirationTime object (preferred over numberOfBlocks).
   * When using number, it represents duration in seconds (not blocks).
   */
  readonly duration?: number | ExpirationTime,
}
/**
 * Comprehensive transaction specification for atomic Arkiv operations.
 *
 * This type allows combining multiple entity operations (create, update, delete, extend)
 * into a single atomic blockchain transaction. All operations within a transaction
 * either succeed together or fail together, ensuring data consistency.
 *
 * @public
 *
 * @example
 * ```typescript
 * const transaction: ArkivTransaction = {
 *   creates: [{
 *     data: new TextEncoder().encode("New entity 1"),
 *     btl: 1000,
 *     stringAnnotations: [new Annotation("type", "document")],
 *     numericAnnotations: []
 *   }],
 *   updates: [{
 *     entityKey: "0xabcd1234567890ef",
 *     data: new TextEncoder().encode("Updated content"),
 *     btl: 1500,
 *     stringAnnotations: [new Annotation("status", "modified")],
 *     numericAnnotations: []
 *   }],
 *   deletes: ["0x567890abcdef1234", "0x901234567890abcd"],
 *   extensions: [{
 *     entityKey: "0xef34567890abcdef",
 *     numberOfBlocks: 200
 *   }]
 * };
 * ```
 */
export type ArkivTransaction = {
  /** Array of entity creation specifications */
  readonly creates?: ArkivCreate[],
  /** Array of entity update specifications */
  readonly updates?: ArkivUpdate[],
  /** Array of entity keys to delete */
  readonly deletes?: Hex[],
  /** Array of BTL extension specifications */
  readonly extensions?: ArkivExtend[],
}

/**
 * Complete metadata information for an entity stored in Arkiv.
 *
 * This type contains all the information about an entity including its expiration,
 * data payload, annotations, and ownership details. It's returned by query operations
 * to provide comprehensive entity information.
 *
 * @public
 *
 * @example
 * ```typescript
 * const metadata: EntityMetaData = await client.getEntityMetaData("0x1234567890abcdef");
 *
 * console.log(`Entity expires at block: ${metadata.expiresAtBlock}`);
 * console.log(`Entity owner: ${metadata.owner}`);
 * console.log(`Data payload: ${metadata.payload}`);
 *
 * // Access annotations
 * metadata.stringAnnotations.forEach(ann => {
 *   console.log(`${ann.key}: ${ann.value}`);
 * });
 * ```
 */
export type EntityMetaData = {
  /** The block number at which this entity will expire and be automatically deleted */
  readonly expiresAtBlock: bigint,
  /** The base64-encoded data payload stored in the entity */
  readonly payload: string,
  /** String-valued metadata annotations attached to the entity */
  readonly stringAnnotations: StringAnnotation[],
  /** Numeric-valued metadata annotations attached to the entity */
  readonly numericAnnotations: NumericAnnotation[],
  /** The Ethereum address of the entity owner */
  readonly owner: Hex,
}
