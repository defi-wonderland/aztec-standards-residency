import {
  createLogger,
  Fr,
  waitForPXE,
  AztecAddress,
  UniqueNote,
  AccountWallet,
  createPXEClient,
  FieldLike,
  PXE,
  Wallet,
  Logger,
  deriveKeys,
  Contract,
  deriveMasterIncomingViewingSecretKey,
  AccountManager,
} from '@aztec/aztec.js';
import { TokenContract, TokenContractArtifact } from '../../artifacts/Token.js';
import { getSponsoredFeePaymentMethod, SponsoredFeePaymentMethod } from '../helpers/fee/sponsored_fee_payment.js';
import { computePartialAddress } from "@aztec/stdlib/contract"
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { SingleKeyAccountContract } from '@aztec/accounts/single_key';


export const logger = createLogger('aztec:aztec-standards');

const INITIAL_SUPPLY = 1000000000000000000n


export const createPXE = async (id: number = 0) => {
  const { BASE_PXE_URL = `http://localhost` } = process.env;
  const url = `${BASE_PXE_URL}:${8080 + id}`;
  const pxe = createPXEClient(url);
  logger.info(`Waiting for PXE to be ready at ${url}`);
  await waitForPXE(pxe);
  return pxe;
};

export const setupSandbox = async () => {
  return createPXE();
};

export const expectUintNote = (note: UniqueNote, amount: bigint, owner: AztecAddress) => {
  expect(note.note.items[0]).toEqual(new Fr(owner.toBigInt()));
  expect(note.note.items[2]).toEqual(new Fr(amount));
};

export const expectAddressNote = (note: UniqueNote, address: AztecAddress, owner: AztecAddress) => {
  logger.info('checking address note {} {}', [address, owner]);
  expect(note.note.items[0]).toEqual(new Fr(address.toBigInt()));
  expect(note.note.items[1]).toEqual(new Fr(owner.toBigInt()));
};

export const expectAccountNote = (note: UniqueNote, owner: AztecAddress, secret?: FieldLike) => {
  logger.info('checking address note {} {}', [owner, secret]);
  expect(note.note.items[0]).toEqual(new Fr(owner.toBigInt()));
  if (secret !== undefined) {
    expect(note.note.items[1]).toEqual(secret);
  }
};

export const expectTokenBalances = async (
  token: TokenContract,
  address: AztecAddress,
  publicBalance: bigint,
  privateBalance: bigint,
  caller?: AccountWallet,
) => {
  logger.info('checking balances for', address.toString());
  const t = caller ? token.withWallet(caller) : token;
  expect(await t.methods.balance_of_public(address).simulate()).toBe(publicBalance);
  expect(await t.methods.balance_of_private(address).simulate()).toBe(privateBalance);
};

export const AMOUNT = 1000n;
export const wad = (n: number = 1) => AMOUNT * BigInt(n);

export async function deployToken(
  adminWallet: AccountWallet,
  complianceCheckAddress: AztecAddress,
  initialAdminBalance: bigint,
  initialSupply: bigint,
  logger: Logger,
  name: string,
  symbol: string,
  decimals: number,
  pxe: PXE,
) {
  logger.info(`Deploying Token contract...`)
  const secretKey = Fr.random()
  const publicKeys = (await deriveKeys(secretKey)).publicKeys
  const paymentMethod = await getSponsoredFeePaymentMethod(pxe)

  const contract = await deployTokenWithMinter(adminWallet, paymentMethod, complianceCheckAddress)

  // const artifact = TokenContractArtifact
  // const tokenInstance = await deployment.getInstance()
  // await pxe.registerAccount(secretKey, await computePartialAddress(tokenInstance))

  // Create payment method using feeMan parameter

  // const contract = await deployment.send({ fee: { paymentMethod } }).deployed()

  if (initialAdminBalance > 0n) {
    // Minter is minting to herself so contract as minter is the same as contract as recipient
    await mintTokensToPrivate(
      contract,
      adminWallet,
      adminWallet.getAddress(),
      initialAdminBalance,
      pxe,
    )
  }

  logger.info("L2 contract deployed")

  return { contract }
}

export async function mintTokensToPrivate(
  token: Contract,
  minterWallet: AccountWallet,
  recipient: AztecAddress,
  amount: bigint,
  pxe: PXE,
) {
  const tokenAsMinter = await TokenContract.at(token.address, minterWallet)
  const from = minterWallet.getAddress() // we are setting from to minter here because of TODO(#9887)
  const paymentMethod = await getSponsoredFeePaymentMethod(pxe)
  await tokenAsMinter.methods
    .mint_to_private(from, recipient, amount)
    .send({ fee: { paymentMethod } })
    .wait()
}


export async function deployTokenWithMinter(deployer: AccountWallet, paymentMethod: SponsoredFeePaymentMethod, complianceCheckAddress: AztecAddress) {
  const contract = await Contract.deploy(
    deployer,
    TokenContractArtifact,
    ['PrivateToken', 'PT', 18, deployer.getAddress(), deployer.getAddress(), complianceCheckAddress],
    'constructor_with_minter',
  )
    .send({ fee: { paymentMethod } })
    .deployed();
  return contract;
} 

export const createAccountWithoutSecretKey = async (pxe: PXE) => {
  // Generate a new secret key for each wallet
  const secretKey = Fr.random()
  const encryptionPrivateKey = deriveMasterIncomingViewingSecretKey(secretKey)
  const accountContract = new SingleKeyAccountContract(encryptionPrivateKey)

  // Use the AccountManager.create static factory method with optional salt
  const account = await AccountManager.create(pxe, secretKey, accountContract)

  // Register the account and get the wallet
  const wallet = await account.register() // Returns AccountWalletWithSecretKey

  console.log("registered account")
  return wallet as AccountWallet
}

export async function deployTokenWithInitialSupply(deployer: AccountWallet, paymentMethod: SponsoredFeePaymentMethod, complianceCheckAddress: AztecAddress) {
  const contract = await Contract.deploy(
    deployer,
    TokenContractArtifact,
    ['PrivateToken', 'PT', 18, INITIAL_SUPPLY, deployer.getAddress(), deployer.getAddress(), complianceCheckAddress],
    'constructor_with_initial_supply',
  )
    .send({ fee: { paymentMethod } })
    .deployed();
  return contract;
}