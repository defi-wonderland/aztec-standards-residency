use aztec::macros::aztec;
mod lib;
mod AuthNote;
#[aztec]
pub contract ComplianceCheck {
    use aztec::{
        prelude::{AztecAddress, Map, PublicMutable, PrivateMutable},
        macros::{
            functions::{private, public, initializer, internal},
            storage::storage,
        },
        messages::logs::{note::{encode_and_encrypt_note, encode_and_encrypt_note_unconstrained}},
    };
    use crate::lib::{SubProofInputs};
    use crate::AuthNote::AuthNote;
    use std::{verify_proof_with_type};


    global SECONDS_PER_MONTH: u64 = 2628000; //divide by the timestamp to get the epoch
    global TRANSFER_LIMIT: u128 = 100000000000000; // 100,000 with 9 decimals
    global OBSIDION_SCOPE: Field = 0x0000000000000000000000000000000000000000000000000000000000000000; 
    global HONK_IDENTIFIER: u32 = 1;
    global KEY_HASH: Field = 0;
    

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        registry_root: PublicMutable<Field, Context>,
        // Map: address -> epoch -> AuthNote
        address_authorised: Map<AztecAddress, Map<u64, PrivateMutable<AuthNote, Context>, Context>, Context>,
    }

    //each month is 2628000 seconds
    //each day is 86400 seconds
    // divide timestamp by month, 
    // pass in the timestamp, assert the timestamp in public function

    #[public]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        storage.admin.write(admin);
    }

    #[public]
    fn update_registry_root(new_root: Field) {
        assert(storage.admin.read() == context.msg_sender(), "Not authorized");
        storage.registry_root.write(new_root);
    }

    #[private]
    fn register(circuitInputs: SubProofInputs, zk_id: Field, timestamp: u64) {

        let address = context.msg_sender();

        //check the public inputs are equal
        //verify the proofs,
        //check registry root and all that fun jazz

        verify_proof_with_type(
            circuitInputs.vkeys.vkey_a,
            circuitInputs.proofs.proof_a,
            circuitInputs.public_inputs.input_a,
            KEY_HASH,
            HONK_IDENTIFIER,
        );

        verify_proof_with_type(
            circuitInputs.vkeys.vkey_b,
            circuitInputs.proofs.proof_b,
            circuitInputs.public_inputs.input_b,
            KEY_HASH,
            HONK_IDENTIFIER,
        );
        verify_proof_with_type(
            circuitInputs.vkeys.vkey_c,
            circuitInputs.proofs.proof_c,
            circuitInputs.public_inputs.input_c,
            KEY_HASH,
            HONK_IDENTIFIER,
        );
        verify_proof_with_type(
            circuitInputs.vkeys.vkey_d,
            circuitInputs.proofs.proof_d,
            circuitInputs.public_inputs.input_d,
            KEY_HASH,
            HONK_IDENTIFIER,
        );

        //assert the commitments in and out are equal for each circuit
        //will need to update depending on the size of the public inputs for each circuit
        assert(circuitInputs.public_inputs.input_a[1] == circuitInputs.public_inputs.input_b[0], "comm_out of proof_a does not match comm_in of proof_b");
        assert(circuitInputs.public_inputs.input_b[1] == circuitInputs.public_inputs.input_c[0], "comm_out of proof_c does not match comm_in of proof_d");
        assert(circuitInputs.public_inputs.input_c[1] == circuitInputs.public_inputs.input_d[0], "comm_out of proof_d does not match comm_in of proof_c");
        assert(circuitInputs.public_inputs.input_d[1] == zk_id, "scoped nullifier of proof_d does not match zk_id");

        //assert that the registry root is correct


        //assert that the scoped nullifier is obsidion, for demo purposes, hardcode this check, could be storage for allowed websites
        //change this to whatever the correct value is
        assert(circuitInputs.public_inputs.input_d[1] == OBSIDION_SCOPE, "scoped nullifier is not obsidion");

        let epoch = _calculate_epoch(timestamp);

        //create the note for the user if all checks pass
        //transfer total is 0 for new registrations
        //can include the timestamp, it will be asseted in the public call later.
        let auth_note = AuthNote::new(address, zk_id, true, 0);
        storage.address_authorised.at(address).at(epoch).initialize(auth_note).emit(encode_and_encrypt_note(
            &mut context,
            address,
            address,
        ));

        let root_hash = circuitInputs.public_inputs.input_d[0];

        //enqueue the public epoch check
        ComplianceCheck::at(context.this_address())._check_epoch_and_root(timestamp, root_hash).enqueue(&mut context);
    }

    #[contract_library_method]
    fn _calculate_epoch(timestamp: u64) -> u64 {
        timestamp / SECONDS_PER_MONTH

        //include some rounding logic for the epoch
        //fixed point math if there are rounding errors
        //safe math noir or something
    }

    #[public]
    #[internal]
    fn _check_epoch_and_root(timestamp: u64, root_hash: Field) {
        let network_timestamp = context.timestamp();
        let epoch = _calculate_epoch(network_timestamp);
        
        //assert the network timestamp and user provided timestamp are within 10 minutes of each other
        assert(network_timestamp - timestamp < 600 as u64, "timestamp is too far in the future");
        assert(timestamp - network_timestamp < 600 as u64, "timestamp is too far in the past"); 

        //assert the root hash is valid
        //change to the correct value
        assert(root_hash == storage.registry_root.read(), "root hash is not valid");
    }

    #[private]
    fn authorize_transfer_private(_sender: AztecAddress, _from: AztecAddress, _amount: u128) {}

    //Not needed right?
    #[public]
    fn authorize_transfer_public(_sender: AztecAddress, _from: AztecAddress, _amount: u128) {}
}
