import type { Address, Hex } from "viem"
import { getChainId } from "viem/actions"
import type { ArkivClient } from "../../clients/baseClient"
import {
  NO_SALT,
  predictEntityKey,
  randomSalt,
  resolveSalt,
  type SaltInput,
} from "../../entity/key"
import { getEntityNonce } from "./getEntityNonce"

/**
 * A key a create will be given, together with the salt that mints it.
 *
 * The two travel as a pair because neither is any use alone: a create defaults to a *random* salt,
 * so the key only comes out as predicted if that same create carries this salt.
 */
export type PredictedEntityKey = {
  /** The key the create will be given. */
  key: Hex
  /**
   * The salt the create must carry for its key to come out as {@link PredictedEntityKey.key}.
   * Always a plain `uint128` — a requested {@link NO_SALT} comes back as the `0n` it resolves to,
   * which a create accepts just the same.
   */
  salt: bigint
}

/** Parameters for `client.predictEntityKeys`. */
export type PredictEntityKeysParameters<
  TCount extends number = number,
  TSalts extends readonly SaltInput[] | undefined = readonly SaltInput[] | undefined,
> = {
  /** The account that will sign the creates. Its nonce is what the keys are derived from. */
  owner: Address
  /**
   * How many creates the batch will carry. Ignored when `salts` is given, which already says how
   * many there are.
   *
   * A literal count comes back as a fixed-length tuple, so `count: 2` destructures into two named
   * pairs without a cast.
   */
  count?: TCount | undefined
  /**
   * The salt each create will carry, in batch order. Defaults to `count` fresh random salts —
   * either way each key comes back paired with the salt that mints it. Pass {@link NO_SALT} in a
   * slot whose create opts out of salting.
   */
  salts?: TSalts
}

/**
 * The keys a batch would mint, in batch order, each paired with its salt.
 *
 * The length follows the request whenever it is known statically: a literal `count`, or a `salts`
 * tuple, gives a fixed-length tuple; a count computed at runtime gives a plain array.
 *
 * `TSalts` is wrapped in a tuple to stop the conditional distributing over it. Left naked, the
 * `readonly SaltInput[] | undefined` default would take both branches and union a tuple with an
 * array, which widens the length straight back to `number`.
 */
export type PredictEntityKeysReturnType<
  TCount extends number = number,
  TSalts extends readonly SaltInput[] | undefined = readonly SaltInput[] | undefined,
> = [TSalts] extends [readonly SaltInput[]]
  ? { -readonly [Index in keyof TSalts]: PredictedEntityKey }
  : Repeat<PredictedEntityKey, TCount>

/**
 * A tuple of `TLength` × `T`, or a plain array when the length is only known at runtime.
 *
 * Written tail-recursively so TypeScript can build the batch sizes anyone would actually send.
 */
type Repeat<T, TLength extends number, TAcc extends T[] = []> = number extends TLength
  ? T[]
  : TAcc["length"] extends TLength
    ? TAcc
    : Repeat<T, TLength, [...TAcc, T]>

/**
 * Works out the keys an account's next creates will be given, before sending them.
 *
 * A key is `keccak256(chainId ++ registry ++ owner ++ nonce ++ salt)`. Everything but the nonce is
 * known to the caller, and the nonce is read here — so a batch can reference a key it is about to
 * mint, storing it as a `key` attribute on a sibling entity created in the same transaction.
 *
 * Each key arrives paired with its salt, and the create must be given that salt: a create left to
 * pick its own salt picks a random one, which mints a different key.
 *
 * The prediction is valid only while nothing else from this owner is in flight. Every create that
 * lands first takes the nonce with it and moves these keys. For a key you can rely on
 * unconditionally, read it back from the create instead — `createEntity` and `mutateEntities`
 * report the keys the engine actually minted.
 *
 * @param parameters - Owner, and either a count or the salts. {@link PredictEntityKeysParameters}
 * @returns One `{ key, salt }` pair per create, in batch order. {@link PredictEntityKeysReturnType}
 *
 * @example A batch whose second entity points at its first.
 * import { key } from "@arkiv-network/sdk/attr"
 *
 * const [parent, child] = await client.predictEntityKeys({ owner: account.address, count: 2 })
 * await client.mutateEntities({
 *   creates: [
 *     { payload, contentType, expires, salt: parent.salt },
 *     {
 *       payload,
 *       contentType,
 *       expires,
 *       salt: child.salt,
 *       attributes: { parent: key(parent.key) },
 *     },
 *   ],
 * })
 */
export async function predictEntityKeys<
  const TCount extends number = number,
  const TSalts extends readonly SaltInput[] | undefined = undefined,
>(
  client: ArkivClient,
  { owner, count, salts }: PredictEntityKeysParameters<TCount, TSalts>,
): Promise<PredictEntityKeysReturnType<TCount, TSalts>> {
  const resolvedSalts = resolveSalts(count, salts)

  const chainId = client.chain?.id ?? (await getChainId(client))
  const nonce = await getEntityNonce(client, owner)

  return resolvedSalts.map((salt, index) => ({
    key: predictEntityKey({ owner, nonce: nonce + BigInt(index), salt, chainId }),
    salt,
  })) as PredictEntityKeysReturnType<TCount, TSalts>
}

/** The salts to derive from: the ones given, or `count` fresh random ones. */
function resolveSalts(
  count: number | undefined,
  salts: readonly SaltInput[] | undefined,
): bigint[] {
  if (salts !== undefined) {
    if (salts.length === 0) {
      throw new Error("predictEntityKeys: `salts` is empty — there is nothing to predict")
    }
    return salts.map(resolveSalt)
  }
  if (count === undefined) {
    throw new Error("predictEntityKeys: pass either `count` or `salts`")
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`predictEntityKeys: \`count\` must be a positive whole number, got ${count}`)
  }
  return Array.from({ length: count }, () => randomSalt())
}
