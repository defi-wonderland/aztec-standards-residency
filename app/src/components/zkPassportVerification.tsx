import { useState, useEffect, useRef } from "react"
import { ProofResult, QueryResult, QueryResultErrors, ZKPassport } from "@zkpassport/sdk"
import { QRCodeSVG } from "qrcode.react"
import { ZKPassportHelper, ContractProofData } from "@obsidion/kernel"
import { useIdentityRegistry } from "src/hooks/useIdentityRegistry"
import { useAccountContext, useNetworkContext } from "src/contexts"
import { getPaymentOptions } from "src/utils/paymentOptions"
import { AccountStorage, AddressStorage, IdentityStorage, TransactionService } from "src/backend"
import { ChevronDown, RefreshCw, Shield, Trash2, QrCode, X, Check } from "lucide-react"
import { ZKPassportInfo, ZKPassportInfoButton } from "./Info"
import { TransactionQueueService } from "src/backend/services/TransactionQueueService"
import { useServiceStatus } from "src/hooks"
import { EventEmitter } from "eventemitter3"
import { IdentityTransactionResult } from "@obsidion/kernel"

export function ZKPassportVerification() {
  const { kernelAccount } = useAccountContext()
  const [showQRCode, setShowQRCode] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<{
    verified: boolean
    zkID: bigint
    completed: boolean
  }>({ verified: false, zkID: BigInt(0), completed: false })
  const [verificationUrl, setVerificationUrl] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contractProofData, setContractProofData] = useState<ContractProofData | null>(null)
  const { identityRegistryService } = useIdentityRegistry()
  const [zkIDAdded, setZkIDAdded] = useState(false)
  const [showRemoveOptions, setShowRemoveOptions] = useState(false)
  const [isRemovingZkID, setIsRemovingZkID] = useState(false)
  const [isAddingZkID, setIsAddingZkID] = useState(false)
  const { pxe } = useNetworkContext()
  const [removalSuccess, setRemovalSuccess] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [queueId, setQueueId] = useState<string | null>(null)

  // Use our hook to subscribe to service status events
  useServiceStatus(
    identityRegistryService as unknown as EventEmitter<string | symbol, any> | null,
    queueId,
  )

  // Use refs to store proofs to avoid state update issues
  const proofsRef = useRef<ProofResult[]>([])

  useEffect(() => {
    const initZKPassport = async () => {
      try {
        setIsLoading(true)
        // const siteUrl = "localhost"
        const zkPassport = new ZKPassport()
        const serviceScope = "obsidion-wallet-personhood"

        const queryBuilder = await zkPassport.request({
          name: "Obsidion Wallet",
          logo: window.location.origin + "/wallet-logo.png",
          purpose: "Prove your personhood",
          scope: serviceScope,
        })

        const {
          url,
          requestId,
          onRequestReceived,
          onGeneratingProof,
          onProofGenerated,
          onResult,
          onReject,
          onError,
        } = queryBuilder.done()

        setVerificationUrl(url)

        onRequestReceived(() => {
          console.log("Request received")
        })

        onGeneratingProof(() => {
          console.log("Generating proof")
        })

        onProofGenerated((proofResult: ProofResult) => {
          // Store the complete proof in the ref
          if (proofResult.name && proofResult.vkeyHash) {
            // Add to proofs array, replacing any existing proof with the same name
            proofsRef.current = [
              ...proofsRef.current.filter((p) => p.name !== proofResult.name),
              proofResult,
            ]
            console.log("Updated proofs ref:", proofsRef.current)
          }
        })

        onResult(
          async ({
            uniqueIdentifier,
            verified,
            result,
            queryResultErrors,
          }: {
            uniqueIdentifier?: string
            verified: boolean
            result: QueryResult
            queryResultErrors?: QueryResultErrors
          }) => {
            console.log("proofs are valid", verified)
            console.log("unique identifier", uniqueIdentifier)

            // Set verification status
            setVerificationStatus({
              verified,
              zkID: BigInt(uniqueIdentifier ?? "0"),
              completed: true,
            })

            // Auto close QR code after successful verification
            if (verified) {
              console.log("Verification successful, closing QR code")
              setTimeout(() => setShowQRCode(false), 1000)
            }

            // Use the proofs from our ref
            const proofs = proofsRef.current

            if (verified && proofs && proofs.length > 0) {
              try {
                // Use the helper class to format proofs
                console.log("Formatting proofs for contract")
                console.log("Proofs:", proofs)
                const contractProofData = await ZKPassportHelper.formatProofsForContract(proofs)
                if (contractProofData) {
                  setContractProofData(contractProofData)
                  console.log("Formatted proof data for contract:", contractProofData)
                }
              } catch (error) {
                console.error("Error formatting proofs for contract:", error)
                // Log more details about the error
                if (error instanceof Error) {
                  console.error("Error message:", error.message)
                  console.error("Error stack:", error.stack)
                }
              }
            }
          },
        )

        onError((err: any) => {
          console.error("ZKPassport error:", err)
          setError("Failed to initialize ZKPassport verification")
        })

        setIsLoading(false)
      } catch (err) {
        console.error("Error initializing ZKPassport:", err)
        setError("Failed to initialize ZKPassport verification")
        setIsLoading(false)
      }
    }

    initZKPassport()
  }, [])

  // Check if the user already has a zkID when component loads
  useEffect(() => {
    checkExistingZkID()
  }, [identityRegistryService, kernelAccount, pxe])

  useEffect(() => {
    // Only run this effect when verification status changes
    if (verificationStatus.verified && verificationStatus.completed) {
      console.log("Verification successful, current QR code state:", showQRCode)

      // Close QR code on successful verification
      if (showQRCode) {
        console.log("Auto-closing QR code after successful verification")
        setTimeout(() => {
          setShowQRCode(false)
        }, 500) // Small delay to ensure state updates properly
      }
    }
  }, [verificationStatus.verified, verificationStatus.completed])

  const checkExistingZkID = async () => {
    try {
      if (!identityRegistryService || !kernelAccount || !pxe) return

      // First check the cache using IdentityStorage
      const accountAddress = kernelAccount.getAddress().toString()
      const storedIdentity = await IdentityStorage.getIdentity(accountAddress)

      if (storedIdentity) {
        setZkIDAdded(storedIdentity.hasZkID)
        return
      }

      // If not in cache, check contract
      const isValid = await identityRegistryService.checkExistingzkID(kernelAccount)

      // Save result to cache
      IdentityStorage.saveIdentityToCache(accountAddress, isValid)

      // If zkID exists, set zkIDAdded to true
      if (isValid) {
        console.log("Found existing zkID for current account:", isValid)
        setZkIDAdded(true)
      } else {
        console.log("No zkID found for current account")
        setZkIDAdded(false)
      }
    } catch (error) {
      console.warn("Error checking existing zkID:", error)
    }
  }

  // Function to handle refresh button click
  const handleRefresh = async () => {
    setError(null)
    await checkExistingZkID()
  }

  const addZkIDtoRegistry = async () => {
    let queueService: TransactionQueueService | undefined
    let newQueueId: string | undefined

    try {
      setIsAddingZkID(true)
      if (!identityRegistryService || !contractProofData || !kernelAccount || !pxe) {
        console.error("Identity registry service or contract proof data not found")
        setError(
          "Missing required data: " +
            (!identityRegistryService ? "Identity registry service not found. " : "") +
            (!contractProofData ? "Contract proof data not found. " : "") +
            (!kernelAccount ? "Kernel account not found. " : "") +
            (!pxe ? "PXE not found. " : ""),
        )
        setIsAddingZkID(false)
        return
      }

      // Initialize queue service
      queueService = TransactionQueueService.getInstance()
      const actionType = "Add ZKID"
      newQueueId = queueService.addToQueue(`${actionType} to Registry`, 180000)
      // Set the queueId in state so useServiceStatus can track it
      setQueueId(newQueueId)

      // Verify that the Identity Registry address exists
      const identityRegistryAddress = await AddressStorage.getIdentityRegistryAddress()
      if (!identityRegistryAddress) {
        console.error("Identity registry address not found in storage")
        setError(
          "Identity registry not deployed yet. Please reload the application to initialize it.",
        )
        setIsAddingZkID(false)
        if (queueService && newQueueId) {
          queueService.updateStatus(newQueueId, "failed", 100, "Identity registry not deployed yet")
        }
        return
      }
      const paymentOptions = await getPaymentOptions(pxe)

      const addZKID: IdentityTransactionResult = await identityRegistryService.add_zkID(
        kernelAccount,
        contractProofData,
        verificationStatus.zkID,
        paymentOptions,
      )

      const txHash1 = (await addZKID.txHash).toString()
      TransactionService.createIdentityRegistryTransaction(
        newQueueId,
        txHash1,
        actionType,
        verificationStatus.zkID.toString(),
      )
      queueService.updateStatus(newQueueId, "mining", 80, undefined, txHash1)

      const txResult = await addZKID.txPromise
      // Update status to completed
      queueService.updateStatus(newQueueId, "success", 100, undefined, txResult.txHash)

      const completionTime = Date.now()

      // Update transaction with completion information
      TransactionService.updateTransactionCompletion(newQueueId, "success", completionTime)

      if (addZKID) {
        // Update local cache
        const accountAddress = kernelAccount.getAddress().toString()
        IdentityStorage.saveIdentityToCache(accountAddress, true, verificationStatus.zkID)

        setZkIDAdded(true)
        setError(null) // Clear any previous errors
      }

      setIsAddingZkID(false)
    } catch (error) {
      console.error("Error adding zkID to registry:", error)

      // Update queue status if queue service was initialized
      if (queueService && newQueueId) {
        queueService.updateStatus(
          newQueueId,
          "failed",
          100,
          error instanceof Error ? error.message : "Unknown error",
        )
      }

      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes("Identity registry address not found")) {
          setError("Identity registry not initialized. Please reload the application.")
        } else {
          setError(`Failed to add zkID: ${error.message}`)
        }
      } else {
        setError("An unknown error occurred while adding zkID to registry")
      }
      setIsAddingZkID(false)
    }
  }

  const removeZkIDWithAddress = async () => {
    let queueService: TransactionQueueService | undefined
    let newQueueId: string | undefined

    try {
      setIsRemovingZkID(true)
      setRemovalSuccess(false)

      if (!identityRegistryService || !kernelAccount || !pxe) {
        console.error("Identity registry service not found")
        setError("Missing required data for removal")
        setIsRemovingZkID(false)
        return
      }

      // Initialize queue service
      queueService = TransactionQueueService.getInstance()
      const actionType = "Remove ZKID"
      newQueueId = queueService.addToQueue(`${actionType} from Registry`, 180000)
      // Set the queueId in state so useServiceStatus can track it
      setQueueId(newQueueId)

      // Verify that the Identity Registry address exists
      const identityRegistryAddress = await AddressStorage.getIdentityRegistryAddress()
      if (!identityRegistryAddress) {
        console.error("Identity registry address not found in storage")
        setError(
          "Identity registry not deployed yet. Please reload the application to initialize it.",
        )
        setIsRemovingZkID(false)
        if (queueService && newQueueId) {
          queueService.updateStatus(newQueueId, "failed", 100, "Identity registry not deployed yet")
        }
        return
      }

      console.log("Using Identity Registry at address:", identityRegistryAddress.toString())
      const paymentOptions = await getPaymentOptions(pxe)

      const removeZKID: IdentityTransactionResult =
        await identityRegistryService.remove_zkID_with_address(kernelAccount, paymentOptions)
      console.log("ZKID removed from registry:", removeZKID)
      const txHash2 = (await removeZKID.txHash).toString()
      // Create transaction record
      TransactionService.createIdentityRegistryTransaction(
        newQueueId,
        txHash2,
        actionType,
        "0", // We don't have a specific zkID when removing by address, using "0" as placeholder
      )
      queueService.updateStatus(newQueueId, "mining", 80, undefined, txHash2)
      const txResult = await removeZKID.txPromise

      // Update status to completed
      queueService.updateStatus(newQueueId, "success", 100, undefined, txResult.txHash)

      const completionTime = Date.now()

      // Update transaction with completion information
      TransactionService.updateTransactionCompletion(newQueueId, "success", completionTime)

      if (removeZKID) {
        // Update local cache
        const accountAddress = kernelAccount.getAddress().toString()
        IdentityStorage.clearIdentityCache(accountAddress)

        setZkIDAdded(false)
        setRemovalSuccess(true)
        setShowRemoveOptions(false)
        setError(null) // Clear any previous errors

        // Reset removal success message after 5 seconds
        setTimeout(() => {
          setRemovalSuccess(false)
        }, 5000)
      }
      setIsRemovingZkID(false)
    } catch (error) {
      console.error("Error removing zkID with address:", error)

      // Update queue status if queue service was initialized
      if (queueService && newQueueId) {
        queueService.updateStatus(
          newQueueId,
          "failed",
          100,
          error instanceof Error ? error.message : "Unknown error",
        )
      }

      if (error instanceof Error) {
        setError(`Failed to remove zkID: ${error.message}`)
      } else {
        setError("An unknown error occurred while removing zkID")
      }
      setIsRemovingZkID(false)
    }
  }

  const removeZkIDWithProof = async () => {
    let queueService: TransactionQueueService | undefined
    let newQueueId: string | undefined

    try {
      setIsRemovingZkID(true)
      setRemovalSuccess(false)

      if (!identityRegistryService || !kernelAccount || !pxe || !contractProofData) {
        // If we don't have proof data yet, just reset verification to get new proof
        setVerificationStatus({ verified: false, zkID: BigInt(0), completed: false })
        setContractProofData(null)
        proofsRef.current = []
        setShowQRCode(true)
        setShowRemoveOptions(false)
        setIsRemovingZkID(false)
        return
      }

      // Initialize queue service
      queueService = TransactionQueueService.getInstance()
      const actionType = "Remove ZKID"
      newQueueId = queueService.addToQueue(`${actionType} from Registry with Proof`, 180000)
      // Set the queueId in state so useServiceStatus can track it
      setQueueId(newQueueId)

      const identityRegistryAddress = await AddressStorage.getIdentityRegistryAddress()
      if (!identityRegistryAddress) {
        console.error("Identity registry address not found in storage")
        setError(
          "Identity registry not deployed yet. Please reload the application to initialize it.",
        )
        setIsRemovingZkID(false)
        if (queueService && newQueueId) {
          queueService.updateStatus(newQueueId, "failed", 100, "Identity registry not deployed yet")
        }
        return
      }

      console.log("Using Identity Registry at address:", identityRegistryAddress.toString())
      const paymentOptions = await getPaymentOptions(pxe)

      // Call the actual removal function with proof
      const removeZKID: IdentityTransactionResult =
        await identityRegistryService.remove_zkID_with_proof(
          kernelAccount,
          contractProofData,
          verificationStatus.zkID,
          paymentOptions,
        )
      console.log("ZKID removed from registry with proof:", removeZKID)
      const txHash3 = (await removeZKID.txHash).toString()
      // Create transaction record
      TransactionService.createIdentityRegistryTransaction(
        newQueueId,
        txHash3,
        actionType,
        verificationStatus.zkID.toString(),
      )
      queueService.updateStatus(newQueueId, "mining", 80, undefined, txHash3)
      const txResult = await removeZKID.txPromise

      // Update status to completed
      queueService.updateStatus(newQueueId, "success", 100, undefined, txResult.txHash)

      const completionTime = Date.now()

      // Update transaction with completion information
      TransactionService.updateTransactionCompletion(newQueueId, "success", completionTime)

      if (removeZKID) {
        // Update local cache
        const accountAddress = kernelAccount.getAddress().toString()
        IdentityStorage.clearIdentityCache(accountAddress)

        setZkIDAdded(false)
        setRemovalSuccess(true)
        setShowRemoveOptions(false)
        setError(null) // Clear any previous errors

        // Reset verification state
        setVerificationStatus({ verified: false, zkID: BigInt(0), completed: false })
        setContractProofData(null)
        proofsRef.current = []
      }
      setIsRemovingZkID(false)
    } catch (error) {
      console.error("Error removing zkID with proof:", error)

      // Update queue status if queue service was initialized
      if (queueService && newQueueId) {
        queueService.updateStatus(
          newQueueId,
          "failed",
          100,
          error instanceof Error ? error.message : "Unknown error",
        )
      }

      if (error instanceof Error) {
        setError(`Failed to remove zkID: ${error.message}`)
      } else {
        setError("An unknown error occurred while removing zkID")
      }
      setIsRemovingZkID(false)
    }
  }

  //add a handle Qr code, if it is open and verified becomes true, then close it
  const handleQrCode = () => {
    if (showQRCode && verificationStatus.verified) {
      setShowQRCode(false)
    }
  }

  if (isLoading) {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6 px-4 flex flex-col mb-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex flex-col">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
              ZKPassport Verification
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading verification...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6 px-4 flex flex-col mb-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex flex-col">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
              ZKPassport Verification
            </h3>
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 px-4 py-2 bg-purple-500 dark:bg-blue-600 text-white rounded-md hover:bg-purple-600 dark:hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Replace the return statement with this updated version that includes the info button
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-6 px-4 flex flex-col mb-6">
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
            ZKPassport Verification
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Verify your identity with ZKPassport
          </p>

          {verificationStatus.completed && (
            <div
              className={`mt-2 flex items-center text-sm ${
                verificationStatus.verified
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {verificationStatus.verified ? (
                <>
                  <Check className="w-4 h-4 mr-1" /> Verification successful
                </>
              ) : (
                <>
                  <X className="w-4 h-4 mr-1" /> Verification failed
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQRCode(!showQRCode)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 dark:bg-blue-600 text-white rounded-md hover:bg-purple-700 dark:hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900"
          >
            <p>{showQRCode ? "Hide QR" : "Show QR"}</p>
            <QrCode className="w-5 h-5" />
          </button>
          <div className="flex items-center">
            <ZKPassportInfoButton onClick={() => setShowInfoModal(true)} />
          </div>
        </div>
      </div>

      {/* Info Modal */}
      <ZKPassportInfo isOpen={showInfoModal} onClose={() => setShowInfoModal(false)} />

      {showQRCode && (
        <div className="flex flex-col items-center mt-4 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between w-full mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Scan this QR code with your ZKPassport app to verify your identity
            </p>
            <button
              onClick={() => setShowQRCode(false)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="bg-white p-4 rounded-lg">
            <QRCodeSVG value={verificationUrl} size={200} />
          </div>
          {verificationStatus.completed && !verificationStatus.verified && (
            <p className="mt-4 text-sm text-red-500 dark:text-red-400">
              Verification failed. Please try again.
            </p>
          )}
          {verificationStatus.completed && verificationStatus.verified && (
            <p className="mt-4 text-sm text-green-500 dark:text-green-400 flex items-center">
              <Check className="w-4 h-4 mr-1" /> Verification successful
            </p>
          )}
        </div>
      )}

      {/* Removal Success Message */}
      {removalSuccess && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/30 rounded-lg">
          <div className="flex items-center">
            <Check className="w-5 h-5 text-green-500 dark:text-green-400 mr-2" />
            <span className="text-green-700 dark:text-green-400 font-medium">
              zkID Successfully Removed
            </span>
          </div>
          <p className="text-sm text-green-600 dark:text-green-500 mt-1">
            Your zkID has been successfully removed from the registry.
          </p>
        </div>
      )}

      {/* zkID Management Section */}
      <div className="mt-6">
        {zkIDAdded ? (
          <div className="flex flex-col">
            <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div>
                <div className="flex items-center">
                  <Shield className="w-5 h-5 text-green-500 dark:text-green-400 mr-2" />
                  <span className="text-gray-800 dark:text-gray-200 font-medium">
                    zkID Added to Registry
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Your zkID has been successfully added to the registry
                </p>
              </div>

              <div className="relative">
                <button
                  onClick={() => setShowRemoveOptions(!showRemoveOptions)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                  disabled={isRemovingZkID}
                >
                  {isRemovingZkID ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Remove zkID
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          showRemoveOptions ? "rotate-180" : ""
                        }`}
                      />
                    </>
                  )}
                </button>

                {showRemoveOptions && !isRemovingZkID && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                    <div className="p-2">
                      <button
                        onClick={removeZkIDWithAddress}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                      >
                        Remove with Address
                      </button>
                      <button
                        onClick={removeZkIDWithProof}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                      >
                        Remove with Proof
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : contractProofData && verificationStatus.verified ? (
          <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div>
              <div className="flex items-center">
                <Shield className="w-5 h-5 text-green-500 dark:text-green-400 mr-2" />
                <span className="text-gray-800 dark:text-gray-200 font-medium">
                  Verification Complete
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Your identity has been verified. Add your zkID to the registry.
              </p>
            </div>
            <button
              onClick={addZkIDtoRegistry}
              disabled={isAddingZkID}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 dark:bg-blue-600 text-white rounded-md hover:bg-purple-600 dark:hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900"
            >
              {isAddingZkID ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Add zkID to Registry
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <Shield className="w-5 h-5 text-gray-400 dark:text-gray-500 mr-2" />
              <span className="text-gray-800 dark:text-gray-200 font-medium">
                Verification Required
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Scan the QR code with your ZKPassport app to verify your identity.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
