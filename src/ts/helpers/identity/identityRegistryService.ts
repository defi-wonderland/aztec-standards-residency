import { AccountWallet, AztecAddress, deriveKeys, Fr, SendMethodOptions } from "@aztec/aztec.js"
import { IdentityRegistryContract, IdentityRegistryContractArtifact } from "../artifacts/IdentityRegistry.js"
import { GasSettings } from "@aztec/stdlib/gas"
import { FEE_MULTIPLIER, RETRY_TRANSACTION_WAIT_OPTIONS, TESTNET_TIMEOUT } from "../utils/constants.js"
import { EventEmitter } from "eventemitter3"
import { createAsyncTransaction, isValidBool, retryTransactionWait } from "../utils/helper.js"
import { IdentityTransactionResult } from "../utils/types.js"
import { simulatePublicCall } from "../utils/simulatePublic.js"
import { KernelAccountWalletWithKey } from "../kernel/KernelAccountWalletWithKey.js"

export interface ContractProofData {
  vkeys: {
    vkey_a: bigint[]
    vkey_b: bigint[]
    vkey_c: bigint[]
    vkey_d: bigint[]
  }
  proofs: {
    proof_a: bigint[]
    proof_b: bigint[]
    proof_c: bigint[]
    proof_d: bigint[]
  }
  public_inputs: {
    input_a: bigint[]
    input_b: bigint[]
    input_c: bigint[]
    input_d: bigint[]
  }
}

export class IdentityRegistryService extends EventEmitter {
  private admin: AccountWallet
  private identityRegistryAddress: AztecAddress | undefined

  constructor(admin: AccountWallet, identityRegistryAddress?: AztecAddress) {
    super()
    this.admin = admin
    this.identityRegistryAddress = identityRegistryAddress
  }

  public async getIdentityRegistry(): Promise<IdentityRegistryContract> {
    if (!this.identityRegistryAddress) {
      throw new Error("Identity registry address not found")
    }
    return await IdentityRegistryContract.at(this.identityRegistryAddress, this.admin)
  }

  public async deployIdentityRegistry(): Promise<IdentityRegistryContract> {
    try {
      const identityRegistrySecretKey = Fr.random()
      const identityRegistryPublicKeys = (await deriveKeys(identityRegistrySecretKey)).publicKeys

      const contract = IdentityRegistryContract.deployWithPublicKeys(
        identityRegistryPublicKeys,
        this.admin,
        this.admin.getAddress(),
      )

      const deployed = await contract.send().deployed({
        timeout: TESTNET_TIMEOUT,
      })
      this.identityRegistryAddress = deployed.address
      return deployed
    } catch (error) {
      console.error("Error deploying identity registry:", error)
      throw error
    }
  }

  public async checkOtherUserZkID(account: KernelAccountWalletWithKey , address: AztecAddress): Promise<boolean> {
    const identityRegistry = await this.getIdentityRegistry()
    const args = [address.toField()]
    const valid = await this.simulateIsValidAddress(args, account, identityRegistry.address)
    return valid
  }

  public async checkExistingzkID(account: KernelAccountWalletWithKey): Promise<boolean> {
    try {
      const identityRegistry = await this.getIdentityRegistry()
      const args = [account.getAddress().toField()]
      const valid = await this.simulateIsValidAddress(args, account, identityRegistry.address)
      console.log("does zkid exist: ", valid)
      return valid
    } catch (error) {
      console.error("Error checking if zkID is valid:", error)
      throw error
    }
  }

  public async add_zkID(
    account: AccountWallet,
    contractProofData: ContractProofData,
    zk_id: bigint,
    options?: SendMethodOptions,
  ): Promise<IdentityTransactionResult> {
    this.emit("status", "initializing", 10)
    const identityRegistry = await this.getIdentityRegistry()

    return createAsyncTransaction(
      // Initialize and send transaction
      async () => {
        try {
          console.log("Adding user to identity registry...")
          const sendOptions: SendMethodOptions = options ?? (await this.sendOptionsAdmin())

          this.emit("status", "proving and sending", 40)
          
          const tx = identityRegistry
            .withWallet(account)
            .methods.verify_zkID(contractProofData, zk_id, true, false)
            .send(sendOptions)
          
          const txHash = (await tx.getTxHash()).toString()
          
          return { tx, txHash }
        } catch (error: unknown) {
          if (error instanceof Error && error.message?.includes("authenticator not installed")) {
            throw new Error(
              "This account needs to be set up with authentication before registering an email. Please create a new account first.",
            )
          }
          console.error("Error adding zkID to registry initialization:", error)
          this.emit("status", "failed", 100, undefined)
          throw error
        }
      },
      // Wait for transaction completion
      async ({ tx, txHash }) => {
        try {
          this.emit("status", "mining", 80)
          
          await retryTransactionWait(
            async () => {
              await tx.wait({
                timeout: TESTNET_TIMEOUT,
              })
            },
            RETRY_TRANSACTION_WAIT_OPTIONS
          )
          
          this.emit("status", "success", 100, txHash)
          
          return { txHash }
        } catch (error) {
          console.error("Error adding zkID to registry during wait:", error)
          this.emit("status", "failed", 100, txHash)
          throw error
        }
      }
    );
  }

  public async remove_zkID_with_proof(
    account: AccountWallet,
    contractProofData: ContractProofData,
    zk_id: bigint,
    options?: SendMethodOptions,
  ): Promise<IdentityTransactionResult> {
    this.emit("status", "initializing", 10)
    const identityRegistry = await this.getIdentityRegistry()

    return createAsyncTransaction(
      // Initialize and send transaction
      async () => {
        try {
          console.log("Removing user from identity registry...")
          const sendOptions: SendMethodOptions = options ?? (await this.sendOptionsAdmin())

          this.emit("status", "proving and sending", 40)
          
          const tx = identityRegistry
            .withWallet(account)
            .methods.verify_zkID(contractProofData, zk_id, false, true)
            .send(sendOptions)
          
          const txHash = (await tx.getTxHash()).toString()
          
          return { tx, txHash }
        } catch (error) {
          console.error("Error removing zkID from registry initialization:", error)
          this.emit("status", "failed", 100, undefined)
          throw error
        }
      },
      // Wait for transaction completion
      async ({ tx, txHash }) => {
        try {
          this.emit("status", "mining", 80)
          
          await retryTransactionWait(
            async () => {
              await tx.wait({
                timeout: TESTNET_TIMEOUT,
              })
            },
            RETRY_TRANSACTION_WAIT_OPTIONS
          )
          
          this.emit("status", "success", 100, txHash)
          
          return { txHash }
        } catch (error) {
          console.error("Error removing zkID from registry during wait:", error)
          this.emit("status", "failed", 100, txHash)
          throw error
        }
      }
    );
  }

  public async remove_zkID_with_address(
    account: AccountWallet, 
    options?: SendMethodOptions
  ): Promise<IdentityTransactionResult> {
    this.emit("status", "initializing", 10)
    const identityRegistry = await this.getIdentityRegistry()

    return createAsyncTransaction(
      // Initialize and send transaction
      async () => {
        try {
          console.log("Removing user from identity registry...")
          const sendOptions: SendMethodOptions = options ?? (await this.sendOptionsAdmin())

          this.emit("status", "proving and sending", 40)
          
          const tx = identityRegistry
            .withWallet(account)
            .methods.remove_zkID_with_address()
            .send(sendOptions)
          
          const txHash = (await tx.getTxHash()).toString()
          
          return { tx, txHash }
        } catch (error) {
          console.error("Error removing zkID from registry initialization:", error)
          this.emit("status", "failed", 100, undefined)
          throw error
        }
      },
      // Wait for transaction completion
      async ({ tx, txHash }) => {
        try {
          this.emit("status", "mining", 80)
          
          await retryTransactionWait(
            async () => {
              await tx.wait({
                timeout: TESTNET_TIMEOUT,
              })
            },
            RETRY_TRANSACTION_WAIT_OPTIONS
          )
          
          this.emit("status", "success", 100, txHash)
          
          return { txHash }
        } catch (error) {
          console.error("Error removing zkID from registry during wait:", error)
          this.emit("status", "failed", 100, txHash)
          throw error
        }
      }
    );
  }

  public async is_valid_zkID(account: KernelAccountWalletWithKey, zk_id: bigint): Promise<boolean> {
    const identityRegistry = await this.getIdentityRegistry()
    try {
      //turn zkid from string to 0x bigint
      const args = [Fr.fromString(zk_id.toString())]
      const isValid = await this.simulatePublicIsValidZkID(args, account, identityRegistry.address)
      console.log("isValid: ", isValid)

      return isValid
    } catch (error) {
      console.error("Error checking if zkID is valid:", error)
      throw error
    }
  }

  public async get_address_from_zkID(account: AccountWallet, zk_id: bigint): Promise<AztecAddress> {
    const identityRegistry = await this.getIdentityRegistry()

    try {
      const zkID = await identityRegistry
        .withWallet(account)
        .methods.get_address_from_zkID(zk_id)
        .simulate()
      console.log("address: ", zkID)
      return zkID
    } catch (error) {
      console.error("Error getting address from zkID:", error)
      throw error
    }
  }

  public async get_zkID_from_address(account: AccountWallet): Promise<bigint> {
    const identityRegistry = await this.getIdentityRegistry()

    try {
      const address = account.getAddress()
      const zkID = await identityRegistry
        .withWallet(account)
        .methods.get_zkID_from_address(address)
        .simulate()
      console.log("zkID: ", zkID)
      return zkID
    } catch (error) {
      console.error("Error getting zkID from address:", error)
      throw error
    }
  }

  private async simulatePublicIsValidZkID(args: Fr[], account: KernelAccountWalletWithKey, contractAddress: AztecAddress): Promise<boolean> {
    const functionSignature = "is_valid_zkID(Field)"
    const response = await retryTransactionWait(
      async () => {
        return await simulatePublicCall(account, IdentityRegistryContractArtifact, functionSignature, contractAddress, args)
      },
      RETRY_TRANSACTION_WAIT_OPTIONS
    )
    if (!response) {
      throw new Error("Failed to simulate public is_valid_zkID")
    }
    const valid = isValidBool(response)
    return valid
  }

  private async simulateIsValidAddress(args: Fr[], account: KernelAccountWalletWithKey, contractAddress: AztecAddress): Promise<boolean> {
    const functionSignature = "is_valid_address((Field))"
    const response = await retryTransactionWait(
      async () => {
        return await simulatePublicCall(account, IdentityRegistryContractArtifact, functionSignature, contractAddress, args)
      },
      RETRY_TRANSACTION_WAIT_OPTIONS
    )
    if (!response) {
      throw new Error("Failed to simulate public is_valid_address")
    }
    const valid = isValidBool(response)
    return valid
  }

  private async sendOptionsAdmin(options?: SendMethodOptions) {
    const sendOptions: SendMethodOptions = options ?? {
      fee: {
        gasSettings: GasSettings.default({
          maxFeesPerGas: (await this.admin.getCurrentBaseFees()).mul(FEE_MULTIPLIER),
        }),
      },
      nonce: Fr.random(),
      cancellable: true,
    }

    return sendOptions
  }
}
