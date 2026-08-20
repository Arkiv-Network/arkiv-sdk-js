/**
 * Transaction fields a write action passes through to the wallet, for the cases where the defaults
 * are not what you want.
 *
 * Fee style is either/or: give `gasPrice` for a legacy transaction, or `maxFeePerGas` /
 * `maxPriorityFeePerGas` for an EIP-1559 one. Mixing the two does not typecheck. Anything left out
 * is estimated.
 */
export type TxParams =
  | {
      gas?: bigint
      nonce?: number
      gasPrice?: bigint
      maxFeePerGas?: never
      maxPriorityFeePerGas?: never
    }
  | {
      gas?: bigint
      nonce?: number
      maxFeePerGas?: bigint
      maxPriorityFeePerGas?: bigint
      gasPrice?: never
    }
