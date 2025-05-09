//need to add in some fixture data,
//will use my own originally
//can have a test later that includes the helper functions
//that process the data.

import { AccountWallet, AccountWalletWithSecretKey, AztecAddress, Contract, createPXEClient, deriveKeys, Fr, PXE } from "@aztec/aztec.js"
import { describe, expect, it, beforeAll } from "@jest/globals"
import { ComplianceCheckContract } from "../../artifacts/ComplianceCheck.js"
import { getProofsFromFixture, getVkeysFromFixture } from "../helpers/fixtures/zkPassport/zkPassportFixtures.js"
import { getSponsoredFeePaymentMethod, SponsoredFeePaymentMethod } from "../helpers/fee/sponsored_fee_payment.js"
import { sendEmptyTxs } from "../helpers/utils.js"
import { createAccountWithoutSecretKey, deployTokenWithInitialSupply, deployTokenWithMinter, logger } from "./utils.js"


//or maybe can grab from the packaged circuit on the server

describe("ZkPassport Proof Verification", () => {
  let pxe: PXE;
  let complianceCheckContract: ComplianceCheckContract;
  let complianceCheckAddress: AztecAddress;
  let complianceToken: Contract;
  let complianceTokenAddress: AztecAddress;
  let user: AccountWallet;
  let deployer: AccountWallet;
  let userContract: ComplianceCheckContract;
  let passportId: bigint;
  let proofa: any;
  let proofb: any;
  let proofc: any;
  let proofd: any;
  let vkey_a: any;
  let vkey_b: any;
  let vkey_c: any;
  let vkey_d: any;
  let public_inputs_a: any;
  let public_inputs_b: any;
  let public_inputs_c: any;
  let public_inputs_d: any;
  let paymentMethod: SponsoredFeePaymentMethod;
  let circuitInputs: any;
  let zk_id: bigint;
  let timestamp: number;
  let alice: AccountWallet;
  let epoch2: number;

  const EPOCH_TIME2 = 2628000*2;


  const SANDBOX_URL = "http://localhost:8080";
  const INITIAL_SUPPLY = 1000000000000000000n
  const INITIAL_ADMIN_BALANCE = 1000000000000000n

  beforeAll(async () => {
    pxe = createPXEClient(SANDBOX_URL); 
    paymentMethod = await getSponsoredFeePaymentMethod(pxe);

    user = await createAccountWithoutSecretKey(pxe);

    deployer = await createAccountWithoutSecretKey(pxe);
    const deployerAddress = deployer.getAddress();
    console.log("deployer address: ", deployerAddress);
    console.log("payment method: ", paymentMethod);


    const secretKey = Fr.random();
    const pubKeys = (await deriveKeys(secretKey)).publicKeys;

    console.log("deploying contract");
    const contract = ComplianceCheckContract.deployWithPublicKeys(
      pubKeys,
      deployer,
      deployerAddress
    );

    console.log("sending contract");
    complianceCheckContract = await contract.send({ fee: { paymentMethod } }).deployed();
    // const contract = await ComplianceCheckContract.deploy(deployer, deployerAddress).send({ fee: { paymentMethod } }).deployed();
    complianceCheckAddress = complianceCheckContract.address;

    const complianceTokenContract = await deployTokenWithMinter(deployer, paymentMethod, complianceCheckAddress);
    complianceToken = complianceTokenContract;
    complianceTokenAddress = complianceTokenContract.address;

    alice = await createAccountWithoutSecretKey(pxe);

  });

  it("should deploy the contract and token", async () => {
    expect(complianceCheckAddress).toBeDefined();
    expect(complianceTokenAddress).toBeDefined();
  })

  it("should extract the vkeys from the fixture data", async () => {
    const vkeys = await getVkeysFromFixture();
    console.log("vkeys: ", vkeys);
    vkey_a = vkeys.vkey_a;
    vkey_b = vkeys.vkey_b;
    vkey_c = vkeys.vkey_c;
    vkey_d = vkeys.vkey_d;

    expect(vkeys).toBeDefined();
    expect(vkeys.vkey_a).toHaveLength(128);
    expect(vkeys.vkey_b).toHaveLength(128);
    expect(vkeys.vkey_c).toHaveLength(128);
    expect(vkeys.vkey_d).toHaveLength(128);
  })

  it("should load and format the proof data correctly", async () => {
    // Get the proof data
    const { proofs, public_inputs } = await getProofsFromFixture();
    proofa = proofs.proof_a;
    proofb = proofs.proof_b;
    proofc = proofs.proof_c;
    proofd = proofs.proof_d;

    expect(proofa.length).toBe(456);
    expect(proofb.length).toBe(456);
    expect(proofc.length).toBe(456);
    expect(proofd.length).toBe(456);

    public_inputs_a = public_inputs.input_a;
    public_inputs_b = public_inputs.input_b;
    public_inputs_c = public_inputs.input_c;
    public_inputs_d = public_inputs.input_d;

    expect(public_inputs_a.length).toBe(2);
    expect(public_inputs_b.length).toBe(2);
    expect(public_inputs_c.length).toBe(2);
    expect(public_inputs_d.length).toBe(2);
    
  })

  it("adds the root to the compliance contract", async () => {
    const root = public_inputs_a[0]
    console.log("root: ", root);

    //add to the contract
    await complianceCheckContract.withWallet(deployer).methods.update_registry_root(root).send({ fee: { paymentMethod } }).wait()

    //get the root from the contract
    const contractRoot = await complianceCheckContract.methods.get_registry_root().simulate()
    console.log("contract root: ", contractRoot.toString());
    const hexString = BigInt(contractRoot).toString(16);
    console.log("hex string: ", hexString);

    expect(contractRoot).toBe(root);
  })

  it("registers our user to the contract", async () => {

     circuitInputs = {
          vkeys: {
            vkey_a: vkey_a,
            vkey_b: vkey_b,
            vkey_c: vkey_c,
            vkey_d: vkey_d
          },
          proofs: {
            proof_a: proofa,
            proof_b: proofb,
            proof_c: proofc,
            proof_d: proofd
          },
          public_inputs: {
            input_a: public_inputs_a,
            input_b: public_inputs_b,
            input_c: public_inputs_c,
            input_d: public_inputs_d
          }
    }

    zk_id = public_inputs_d[1]

    //register the user to compliance check
    timestamp = Date.now();
    console.log("timestamp: ", timestamp);
    const receipt = await complianceCheckContract.withWallet(user).methods.register(circuitInputs, zk_id, timestamp).send({ fee: { paymentMethod } }).wait()
    expect(receipt).toBeDefined();
  })

  it.skip("cannot register the same user again", async () => {
    await expect(complianceCheckContract.withWallet(user).methods.register(circuitInputs, zk_id, timestamp).send({ fee: { paymentMethod } }).wait()).rejects.toThrow();
  })

  it("mints the user 200,000 tokens", async () => {
    const amount = 2000000000000000n;
    const receipt = await complianceToken.withWallet(deployer).methods.mint_to_private(deployer.getAddress(), user.getAddress(), amount).send({ fee: { paymentMethod } }).wait()

    const userBalance = await complianceToken.withWallet(user).methods.balance_of_private(user.getAddress()).simulate()
    expect(userBalance).toBe(amount);
  })

  it.skip("user transfers 10,000 tokens", async () => {
    const amount = 10000000000000n;
    const receipt = await complianceToken.withWallet(user).methods.transfer_private_to_private(user.getAddress(), alice.getAddress(), amount, 0).send({ fee: { paymentMethod } }).wait()
    expect(receipt).toBeDefined();
  })

  it.skip("user transfers 60,000 tokens", async () => {
    const amount = 60000000000000n;
    const receipt = await complianceToken.withWallet(user).methods.transfer_private_to_private(user.getAddress(), alice.getAddress(), amount, 0).send({ fee: { paymentMethod } }).wait()
    expect(receipt).toBeDefined();
  })

  it.skip("user transfers 60,000 more to alice", async () => {
    const amount = 60000000000000n;
    await expect(complianceToken.withWallet(user).methods.transfer_private_to_private(user.getAddress(), alice.getAddress(), amount, 0).send({ fee: { paymentMethod } }).wait()).rejects.toThrow();
  })

  it.skip("user calls authorize_transfer_private, below the limit", async () => {
    const amount = 90000000000000;
    const receipt = await complianceCheckContract.withWallet(user).methods.authorize_transfer_private(user.getAddress(), user.getAddress(), amount).send({ fee: { paymentMethod } }).wait()
    expect(receipt).toBeDefined();
  })

  it.skip("user calls authorize_transfer_private, above the limit", async () => {
    const amount = 100000000000001;
    await expect(complianceCheckContract.withWallet(user).methods.authorize_transfer_private(user.getAddress(), user.getAddress(), amount).send({ fee: { paymentMethod } }).wait()).rejects.toThrow();
  })

  //alice
  it.skip("alice cannot call authorize_without_registering", async () => {
    await expect(complianceCheckContract.withWallet(alice).methods.authorize_transfer_private(alice.getAddress(), alice.getAddress(), 100000000000000).send({ fee: { paymentMethod } }).wait()).rejects.toThrow();
  })
  //tests i need are registering another user with the same zk_id
  it.skip("cannot register another user with the same zk_id", async () => {

    await expect(complianceCheckContract.withWallet(alice).methods.register(circuitInputs, zk_id, timestamp).send({ fee: { paymentMethod } }).wait()).rejects.toThrow();
  })

  it("registers the same user for the next epoch", async () => {
    epoch2 = timestamp + EPOCH_TIME2;
    const receipt = await complianceCheckContract.withWallet(user).methods.register(circuitInputs, zk_id, epoch2).send({ fee: { paymentMethod } }).wait()
    expect(receipt).toBeDefined();
  })

  it("user transfers 50,000 tokens to alice", async () => {
    const amount = 50000000000000n;
    const receipt = await complianceToken.withWallet(user).methods.transfer_private_to_private(user.getAddress(), alice.getAddress(), amount, 0).send({ fee: { paymentMethod } }).wait()
    expect(receipt).toBeDefined();
  })

  it("user transfers 50,000 tokens to alice", async () => {
    const amount = 40000000000000n;
    const receipt = await complianceToken.withWallet(user).methods.transfer_private_to_private(user.getAddress(), alice.getAddress(), amount, 0).send({ fee: { paymentMethod } }).wait()
    expect(receipt).toBeDefined();
  })






  //doing multiple small amounts, see if they are ok

  //then integrating it into the token contract, check it it works

  //then i am done.

})