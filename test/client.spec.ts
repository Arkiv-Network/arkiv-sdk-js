import { readFileSync } from "fs"
import { join } from "path"
import {
  expect
} from "chai"
import { describe, it } from "node:test"
import {
  type ILogObj,
  Logger
} from "tslog"
import xdg from "xdg-portable"
import { Wallet, getBytes } from "ethers"
import {
  createClient,
  type ArkivClient,
  type Hex,
  type ArkivCreate,
  Annotation,
  Tagged,
  type AccountData,
} from "../src/index.ts"
import {
  generateRandomBytes,
  generateRandomString,
} from "./utils.ts"

const log = new Logger<ILogObj>({
  name: "client spec",
  type: "pretty",
  minLevel: 3,
})

// Path to a golembase wallet
const walletPath = join(xdg.config(), 'golembase', 'wallet.json');
// The password that the test wallet was encrypted with
const walletTestPassword = "password";
const keystore = readFileSync(walletPath, 'utf8');
const wallet = Wallet.fromEncryptedJsonSync(keystore, walletTestPassword);

let entitiesOwnedCount = 0
let entityKey: Hex = "0x"
let expiryBlock: number
let client: ArkivClient

describe("the arkiv client", () => {
  it("can be created", async () => {
    const key: AccountData = new Tagged("privatekey", getBytes(wallet.privateKey))
    client = await {
      local: async () => await createClient(
        1337,
        key,
        'http://localhost:8545',
        'ws://localhost:8545',
        log),
      demo: async () => await createClient(
        1337,
        key,
        'https://api.golembase.demo.golem-base.io',
        'wss://ws-api.golembase.demo.golem-base.io',
        log),
      kaolin: async () => await createClient(
        600606,
        key,
        'https://rpc.kaolin.holesky.golem-base.io',
        'wss://ws.rpc.kaolin.holesky.golem-base.io',
      ),
    }.local()

    expect(client).to.exist
  })

  const data = generateRandomBytes(32)
  const stringAnnotation = generateRandomString(32)

  async function getEntitiesOwned(client: ArkivClient): Promise<Hex[]> {
    return client.getEntitiesOfOwner(await client.getOwnerAddress())
  }

  async function numOfEntitiesOwned(client: ArkivClient): Promise<number> {
    const entitiesOwned = await getEntitiesOwned(client)
    log.debug("Entities owned:", entitiesOwned)
    log.debug("Number of entities owned:", entitiesOwned.length)
    return entitiesOwned.length
  }

  async function deleteAllEntitiesWithIndex(
    client: ArkivClient,
    index: number,
    txHashCallback: (txHash: Hex) => void,
  ): Promise<void[]> {
    log.debug("Deleting entities with index", index)
    const queryResult = await client.queryEntities(`ix = ${index}`)
    log.debug("deleteEntitiesWithIndex, queryResult", queryResult)
    return Promise.all(
      queryResult.map(async (res) => {
        log.debug("Deleting entity with key", res.entityKey)
        await client.deleteEntities([res.entityKey], { txHashCallback })
      })
    )
  }

  it("should delete all our existing entities", async () => {
    await client.deleteEntities(await getEntitiesOwned(client))
  })

  it("should be able to create entities", async () => {
    const receipt = await client.createEntities([{
      data: generateRandomBytes(32),
      btl: 25,
      stringAnnotations: [new Annotation("key", generateRandomString(32))],
      numericAnnotations: [new Annotation("ix", 1)]
    }])
    expect(receipt).to.exist

    entitiesOwnedCount += 1
    expect(await numOfEntitiesOwned(client)).to.eql(entitiesOwnedCount)
  })

  it("should be able to create multiple entities", async () => {
    const creates: ArkivCreate[] = [
      {
        data,
        btl: 25,
        stringAnnotations: [new Annotation("key", stringAnnotation)],
        numericAnnotations: [new Annotation("ix", 2)]
      },
      {
        data,
        btl: 15,
        stringAnnotations: [new Annotation("key", generateRandomString(32))],
        numericAnnotations: [new Annotation("ix", 3)]
      },
      {
        data,
        btl: 15,
        stringAnnotations: [new Annotation("key", generateRandomString(32))],
        numericAnnotations: [new Annotation("ix", 3)]
      }
    ]
    const receipts = await client.createEntities(creates, {
      txHashCallback: (txHash) => {
        expect(txHash).to.exist
        entitiesOwnedCount += creates.length
      }
    })
    // Save this key for later
    entityKey = receipts[0].entityKey

    expiryBlock = receipts[0].expirationBlock

    expect(await numOfEntitiesOwned(client)).to.eql(entitiesOwnedCount)
    expect(expiryBlock).to.be.greaterThan(0)
  })

  it("should have the right amount of entities", async () => {
    const entityCount = await numOfEntitiesOwned(client)
    expect(entityCount).to.eql(entitiesOwnedCount, "wrong number of entities in DB")
  })

  it("should have the right entity keys", async () => {
    const allEntityKeys = await getEntitiesOwned(client)
    expect(allEntityKeys).to.have.a.lengthOf(entitiesOwnedCount, "wrong number of entities in DB")
    expect(allEntityKeys).to.include(entityKey, "expected entity not in DB")
  })

  it("should be able to query entities based on string annotations", async () => {
    const entities = await client.queryEntities(`key = "${stringAnnotation}"`)
    expect(entities).to.eql([{
      entityKey: entityKey,
      storageValue: data,
    }])
  })

  it("should be able to query entities based on numeric annotations", async () => {
    const entities = await client.queryEntities(`ix = 2`)
    expect(entities).to.eql([{
      entityKey: entityKey,
      storageValue: data,
    }])
  })

  it("should be able to query entities based on multiple annotations", async () => {
    const entities = await client.queryEntities(`key = "${stringAnnotation}" && ix = 2`)
    expect(entities).to.eql([{
      entityKey: entityKey,
      storageValue: data,
    }])
  })

  it("should be able to retrieve the stored value", async () => {
    const value = await client.getStorageValue(entityKey)
    expect(value).to.eql(data)
  })

  it("should be able to retrieve the entity metadata", async () => {
    const value = await client.getEntityMetaData(entityKey)
    expect(value).to.deep.include({
      expiresAtBlock: expiryBlock,
      stringAnnotations: [{ key: "key", value: stringAnnotation }],
      numericAnnotations: [{ key: "ix", value: 2 }],
      // We get back a non-checksum-encoded address, so we convert back to all lower case here
      owner: (await client.getOwnerAddress()).toLowerCase(),
    })
    expect(value).to.have.property("createdAtBlock")
    expect(value).to.have.property("lastModifiedAtBlock")
    expect(value).to.have.property("transactionIndex")
    expect(value).to.have.property("operationIndex")
  })

  it("should be able to retrieve the entities that expire at a given block", async () => {
    const entities = await client.getEntitiesToExpireAtBlock(BigInt(expiryBlock))
    expect(entities).to.eql([
      entityKey
    ])
  })

  let callbackCanary: Boolean

  it("should be able to update entities", async () => {
    const newData = generateRandomBytes(32)
    const newStringAnnotation = generateRandomString(32)
    callbackCanary = false
    const [result] = await client.updateEntities(
      [{
        entityKey,
        btl: 10,
        data: newData,
        stringAnnotations: [new Annotation("key", newStringAnnotation)],
        numericAnnotations: [new Annotation("ix", 2)],
      }],
      {
        txHashCallback: (txHash) => {
          expect(txHash).to.exist
          callbackCanary = true
        }
      }
    )
    expect(callbackCanary).to.eql(true)
    expect(result).to.exist
    log.debug(result)
    expect(await numOfEntitiesOwned(client)).to.eql(entitiesOwnedCount, "wrong number of entities owned")
  })

  it("should be able to extend entities", async () => {
    const numberOfBlocks = 20
    callbackCanary = false
    const [result] = await client.extendEntities(
      [{
        entityKey,
        numberOfBlocks,
      }],
      {
        txHashCallback: (txHash) => {
          expect(txHash).to.exist
          callbackCanary = true
        }
      }
    )
    expect(callbackCanary).to.eql(true)
    expect(result).to.exist
    log.debug(`Extend result: ${JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`)
    expect(await numOfEntitiesOwned(client)).to.eql(entitiesOwnedCount, "wrong number of entities owned")
    expect(result.newExpirationBlock - result.oldExpirationBlock).to.eql(numberOfBlocks)
  })

  it("should be able to extend entities using a duration", async () => {
    const numberOfSeconds = 20
    callbackCanary = false
    const [result] = await client.extendEntities(
      [{
        entityKey,
        duration: numberOfSeconds,
      }],
      {
        txHashCallback: (txHash) => {
          expect(txHash).to.exist
          callbackCanary = true
        }
      }
    )
    expect(callbackCanary).to.eql(true)
    expect(result).to.exist
    log.debug(`Extend result: ${JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`)
    expect(await numOfEntitiesOwned(client)).to.eql(entitiesOwnedCount, "wrong number of entities owned")
    // hard-coded 2 as the chain cadence, this might need to be updated in the future
    // we can use the new RPC method to fetch this once it exists
    expect(result.newExpirationBlock - result.oldExpirationBlock).to.eql(numberOfSeconds / 2)
  })

  it("should be able to delete entities", async () => {
    log.info("Number of entities owned:", await numOfEntitiesOwned(client))
    await deleteAllEntitiesWithIndex(client, 1, (txHash) => {
      expect(txHash).to.exist
      entitiesOwnedCount--
    })
    expect(await numOfEntitiesOwned(client)).to.eql(entitiesOwnedCount, "wrong number of entities owned")

    log.info("Number of entities owned:", await numOfEntitiesOwned(client))
    await deleteAllEntitiesWithIndex(client, 2, (txHash) => {
      expect(txHash).to.exist
      entitiesOwnedCount--
    })
    expect(await numOfEntitiesOwned(client)).to.eql(entitiesOwnedCount, "wrong number of entities owned")

    log.info("Number of entities owned:", await numOfEntitiesOwned(client))
    await deleteAllEntitiesWithIndex(client, 3, (txHash) => {
      expect(txHash).to.exist
      entitiesOwnedCount--
    })
    expect(await numOfEntitiesOwned(client)).to.eql(entitiesOwnedCount, "wrong number of entities owned")

    log.info("Number of entities owned:", await numOfEntitiesOwned(client))
  })

})
