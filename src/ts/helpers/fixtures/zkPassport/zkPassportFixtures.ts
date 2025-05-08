import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
//@ts-ignore
import { type ProofResult, getCommitmentFromDSCProof, getCommitmentInFromDisclosureProof, getCommitmentInFromIDDataProof, getCommitmentInFromIntegrityProof, getCommitmentOutFromIDDataProof, getCommitmentOutFromIntegrityProof, getMerkleRootFromDSCProof, getNullifierFromDisclosureProof, proofToFields, ultraVkToFields } from "@zkpassport/utils"
import { ZKPassportHelper } from "../../identity/ZkPassportHelper.js"
import { ContractProofData } from "../../identity/identityRegistryService.js"

//public inputs
//proof_a: [0] - certificate_registry_root
//         [1] - comm_out

//proof_b: [0] - comm_in
//         [1] - comm_out

//proof_c: [0]-[7] - date
//         [8] - comm_in
//         [9] - comm_out

//issue is that proof_c and d do not match

//proof_d: [0] - comm_in
//         [n-1] - scoped_nullifier



/**
 * Format proofs for contract without using ZKPassportHelper
 */
export async function getContractProofDataFromFixture(): Promise<ContractProofData> {
  // Get the raw proof data structures
  const { proofs, public_inputs } = await getProofsFromFixture()
  const vkeys = await getVkeysFromFixture()
  
  // Create the contract proof data structure directly
  const contractProofData: ContractProofData = {
    vkeys: {
      vkey_a: vkeys.vkey_a,
      vkey_b: vkeys.vkey_b,
      vkey_c: vkeys.vkey_c,
      vkey_d: vkeys.vkey_d
    },
    proofs: {
      proof_a: proofs.proof_a,
      proof_b: proofs.proof_b,
      proof_c: proofs.proof_c,
      proof_d: proofs.proof_d
    },
    public_inputs: {
      input_a: public_inputs.input_a,
      input_b: public_inputs.input_b,
      input_c: public_inputs.input_c,
      input_d: public_inputs.input_d
    }
  }
  
  return contractProofData
}

/**
 * Get verification keys from fixture files
 */
export async function getVkeysFromFixture() {
  // Define the paths to the fixture files
  const __filename = fileURLToPath(import.meta.url)
  const fixtureDir = path.dirname(__filename)
  const vkeyPaths = {
    vkey_a: path.join(fixtureDir, '1_vkey_sig_check_dsc_tbs_700_rsa_pkcs_4096_sha512.json'),
    vkey_b: path.join(fixtureDir, '2_vkey_sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256.json'),
    vkey_c: path.join(fixtureDir, '3_vkey_data_check_integrity_sha256.json'),
    vkey_d: path.join(fixtureDir, '4_vkey_disclose_bytes.json')
  }

  // Read and parse each vkey file
  const vkeyData = {
    vkey_a: JSON.parse(fs.readFileSync(vkeyPaths.vkey_a, 'utf8')),
    vkey_b: JSON.parse(fs.readFileSync(vkeyPaths.vkey_b, 'utf8')),
    vkey_c: JSON.parse(fs.readFileSync(vkeyPaths.vkey_c, 'utf8')),
    vkey_d: JSON.parse(fs.readFileSync(vkeyPaths.vkey_d, 'utf8'))
  }

  // Convert base64 vkeys to Uint8Array
  const vkeyBytes = {
    vkey_a: ZKPassportHelper.base64ToUint8Array(vkeyData.vkey_a.vkey),
    vkey_b: ZKPassportHelper.base64ToUint8Array(vkeyData.vkey_b.vkey),
    vkey_c: ZKPassportHelper.base64ToUint8Array(vkeyData.vkey_c.vkey),
    vkey_d: ZKPassportHelper.base64ToUint8Array(vkeyData.vkey_d.vkey)
  }

  // Process vkeys using ultraVkToFields
  const vkeyFields = {
    vkey_a: ultraVkToFields(vkeyBytes.vkey_a),
    vkey_b: ultraVkToFields(vkeyBytes.vkey_b),
    vkey_c: ultraVkToFields(vkeyBytes.vkey_c),
    vkey_d: ultraVkToFields(vkeyBytes.vkey_d)
  }

  console.log(`Processed vkey_a: ${vkeyFields.vkey_a.length} fields`);
  console.log(`Processed vkey_b: ${vkeyFields.vkey_b.length} fields`);
  console.log(`Processed vkey_c: ${vkeyFields.vkey_c.length} fields`);
  console.log(`Processed vkey_d: ${vkeyFields.vkey_d.length} fields`);

  // Convert to BigInt and ensure they match contract's expected size (128)
  const vkeys = {
    vkey_a: vkeyFields.vkey_a.map((f: any) => BigInt(f.startsWith('0x') ? f : '0x' + f)),
    vkey_b: vkeyFields.vkey_b.map((f: any) => BigInt(f.startsWith('0x') ? f : '0x' + f)),
    vkey_c: vkeyFields.vkey_c.map((f: any) => BigInt(f.startsWith('0x') ? f : '0x' + f)),
    vkey_d: vkeyFields.vkey_d.map((f: any) => BigInt(f.startsWith('0x') ? f : '0x' + f))
  }

  return vkeys
}


/**
 * Get proofs from fixture files
 */
export async function getProofsFromFixture() {
  // Define the paths to the fixture files
  const __filename = fileURLToPath(import.meta.url)
  const fixtureDir = path.dirname(__filename)
  const proofPaths = {
    proof_a: path.join(fixtureDir, '1_sig_check_dsc_tbs_700_rsa_pkcs_4096_sha512_proof.json'),
    proof_b: path.join(fixtureDir, '2_sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256_proof (1).json'),
    proof_c: path.join(fixtureDir, '3_data_check_integrity_sha256_proof.json'),
    proof_d: path.join(fixtureDir, '4_disclose_some_bytes_proof.json')
  }

  // Read and parse each proof file
  const proofData = {
    proof_a: JSON.parse(fs.readFileSync(proofPaths.proof_a, 'utf8')),
    proof_b: JSON.parse(fs.readFileSync(proofPaths.proof_b, 'utf8')),
    proof_c: JSON.parse(fs.readFileSync(proofPaths.proof_c, 'utf8')),
    proof_d: JSON.parse(fs.readFileSync(proofPaths.proof_d, 'utf8'))
  }

  // Extract the proofs
  // Process the hex strings with proofToFields
  const fieldsA = proofToFields(proofData.proof_a.proof).map((f: string) => BigInt(f.startsWith('0x') ? f : '0x' + f));
  const fieldsB = proofToFields(proofData.proof_b.proof).map((f: string) => BigInt(f.startsWith('0x') ? f : '0x' + f));
  const fieldsC = proofToFields(proofData.proof_c.proof).map((f: string) => BigInt(f.startsWith('0x') ? f : '0x' + f));
  const fieldsD = proofToFields(proofData.proof_d.proof).map((f: string) => BigInt(f.startsWith('0x') ? f : '0x' + f));
  //pad to length 456
  while (fieldsA.length < 456) {
    fieldsA.push(BigInt(0));
  }
  while (fieldsB.length < 456) {
    fieldsB.push(BigInt(0));
  }
  while (fieldsC.length < 456) {
    fieldsC.push(BigInt(0));
  }
  while (fieldsD.length < 456) {
    fieldsD.push(BigInt(0));
  }
  
  console.log("Fields A:", fieldsA.length);
  console.log("Fields B:", fieldsB.length);
  console.log("Fields C:", fieldsC.length);
  console.log("Fields D:", fieldsD.length);

  

  // Extract proofs and public inputs
  // proofToFields already gives us field elements in hex format
  // We need to convert these to BigInt for the contract
  const proofs = {
    proof_a: fieldsA.map((f: any) => typeof f === 'string' ? BigInt(f.startsWith('0x') ? f : '0x' + f) : BigInt(f)),
    proof_b: fieldsB.map((f: any) => typeof f === 'string' ? BigInt(f.startsWith('0x') ? f : '0x' + f) : BigInt(f)),
    proof_c: fieldsC.map((f: any) => typeof f === 'string' ? BigInt(f.startsWith('0x') ? f : '0x' + f) : BigInt(f)),
    proof_d: fieldsD.map((f: any) => typeof f === 'string' ? BigInt(f.startsWith('0x') ? f : '0x' + f) : BigInt(f))
  }

  // Log the raw public inputs data
  console.log("Raw public inputs for proof_a:", proofData.proof_a.publicInputs);
  console.log("Raw public inputs for proof_b:", proofData.proof_b.publicInputs);
  console.log("Raw public inputs for proof_c:", proofData.proof_c.publicInputs);
  console.log("Raw public inputs for proof_d:", proofData.proof_d.publicInputs);
  
  // Extract the input values from the actual JSON files
  // From the files, we can see the actual public input values:
  // Proof A: [0] = 0x02879f386073af7114642d136f1e03acc8e9f9e24b865c7fbf9b2f95f0354373
  //          [1] = 0x2f8a00b3644fdca8dd2fbc2c8c8ffe82a8997d572ef8c4aec58d65c5a9d17f9c
  //  
  // Proof B: [0] = 0x2f8a00b3644fdca8dd2fbc2c8c8ffe82a8997d572ef8c4aec58d65c5a9d17f9c
  //          [1] = 0x2cd4f22bbe539d18de10d774ef29dd406d457de749bce33e7046719e1d5aaebb
  //
  // Proof C: [8] = 0x2cd4f22bbe539d18de10d774ef29dd406d457de749bce33e7046719e1d5aaebb
  //          [9] = 0x1102c14325466be09944ff382d86afe46bc9cb90e6e0312219303d96887e164b
  //  
  // Proof D: [0] = 0x24fa479c285778358a30940a56c6e35504cdb53d62a16ec0a15cc27f8e1a27b2
  //          [last] = 0x1bfd265994cb65a416919af9caa803b6e2c80f96a6b83a1354b37b932576829c

  // Extract the scoped nullifier from the last element of proof D public inputs
  

  // The proof chain according to the contract (main.nr) should be:
  // assert(circuitInputs.public_inputs.input_a[1] == circuitInputs.public_inputs.input_b[0]);
  // assert(circuitInputs.public_inputs.input_b[1] == circuitInputs.public_inputs.input_c[0]);
  // Note: There is a comment in the contract, but the assert is commented out
  // // assert(circuitInputs.public_inputs.input_c[1] == circuitInputs.public_inputs.input_d[0]);
  // assert(circuitInputs.public_inputs.input_d[1] == zk_id);
  
  // Format the public inputs as required by the contract
  const input_a = [
    getMerkleRootFromDSCProof(proofData.proof_a),
    getCommitmentFromDSCProof(proofData.proof_a),
  ];
  
  const input_b = [
    getCommitmentInFromIDDataProof(proofData.proof_b),
    getCommitmentOutFromIDDataProof(proofData.proof_b),
  ];
  
  // For proof C, there are more than 2 elements - we need element 8 and 9
  // because the first 8 elements are date-related
  const input_c = [
    getCommitmentInFromIntegrityProof(proofData.proof_c),
    getCommitmentOutFromIntegrityProof(proofData.proof_c),
  ];
  
  // Extract the scoped nullifier from the last element of proof D public inputs
  const dInputsLength = proofData.proof_d.publicInputs.length;
  const scopedNullifier = dInputsLength > 0 ? 
    BigInt(proofData.proof_d.publicInputs[dInputsLength - 1]) : 
    BigInt(1); // Default to 1 if not found

  // For proof D, we need the first element and the last element (scoped nullifier)
  const input_d = [
    getCommitmentInFromDisclosureProof(proofData.proof_d),
    getNullifierFromDisclosureProof(proofData.proof_d),
  ];

  const public_inputs = {
    input_a,
    input_b,
    input_c,
    input_d
  }

  console.log("Final public inputs being sent to contract:", {
    input_a: public_inputs.input_a.map(v => "0x" + v.toString(16)),
    input_b: public_inputs.input_b.map(v => "0x" + v.toString(16)),
    input_c: public_inputs.input_c.map(v => "0x" + v.toString(16)),
    input_d: public_inputs.input_d.map(v => "0x" + v.toString(16))
  });

  // Verify the chained inputs match as required by the contract
  console.log("Verification of linkage:");
  console.log("1. proof_a[1] === proof_b[0]:", public_inputs.input_a[1] === public_inputs.input_b[0]);
  console.log("2. proof_b[1] === proof_c[0]:", public_inputs.input_b[1] === public_inputs.input_c[0]);
  // Third check is commented out in contract
  console.log("3. (Not checked in contract) proof_c[1] === proof_d[0]:", public_inputs.input_c[1] === public_inputs.input_d[0]);
  console.log("4. proof_d[1] === scopedNullifier:", public_inputs.input_d[1] === scopedNullifier);

  return { proofs, public_inputs, scopedNullifier }
}



