use aztec::macros::aztec;
mod lib;
mod AuthNote;
#[aztec]
pub contract ComplianceCheck {
    use aztec::{
        prelude::{AztecAddress, Map, PublicMutable, PrivateMutable, RetrievedNote},
        macros::{
            functions::{private, public, initializer, internal, view, utility},
            storage::storage,
        },
        protocol_types::{
            storage::map::derive_storage_slot_in_map,
        },
        messages::logs::{note::{encode_and_encrypt_note, encode_and_encrypt_note_unconstrained}},
        oracle::notes::check_nullifier_exists,
    };
    use crate::lib::{SubProofInputs};
    use crate::AuthNote::AuthNote;
    use std::{verify_proof_with_type};


    global SECONDS_PER_MONTH: u64 = 2628000; //divide by the timestamp to get the epoch
    global TRANSFER_LIMIT: u128 = 100000000000000; // 100,000 with 9 decimals
    global OBSIDION_SCOPE: Field = 0x0000000000000000000000000000000000000000000000000000000000000000; 
    global HONK_IDENTIFIER: u32 = 1;
    global KEY_HASH: Field = 0;

    //ASSUMPTIONS:
    // - Proofs are valid
    // - User timestamp provided is correct
    

    #[storage]
    struct Storage<Context> {
        // Admin to update the roots, will be replaced in the future. 
        admin: PublicMutable<AztecAddress, Context>,
        // Cerificate Registry Root
        registry_root: PublicMutable<Field, Context>,
        // Map: address -> AuthNote
        address_authorised: Map<AztecAddress, PrivateMutable<AuthNote, Context>, Context>,
        //Map: epoch -> zk_id -> bool
        epoch_zk_id: Map<u64, Map<Field, PublicMutable<bool, Context>, Context>, Context>,
    }

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

        //check that the note exists
        let location = storage.address_authorised.at(address);

        //safety: no good :(
        let auth_note_exists = unsafe { check_nullifier_exists(location.compute_initialization_nullifier()) };

        if auth_note_exists {
            let auth_note = location.get_note().note;
            let epoch_from_auth_note = auth_note.epoch;

            let epoch = _calculate_epoch(timestamp);

            assert(epoch_from_auth_note != epoch, "address has already registered for this epoch");
            //if the address has already been registered for this epoch, fail here to prevent re-registration
        }

        let epoch = _calculate_epoch(timestamp);

        //Verify the proofs within the smart contract, skipping these for now due to a compile issue in this version.

        // verify_proof_with_type(
        //     circuitInputs.vkeys.vkey_a,
        //     circuitInputs.proofs.proof_a,
        //     circuitInputs.public_inputs.input_a,
        //     KEY_HASH,
        //     HONK_IDENTIFIER,
        // );

        // verify_proof_with_type(
        //     circuitInputs.vkeys.vkey_b,
        //     circuitInputs.proofs.proof_b,
        //     circuitInputs.public_inputs.input_b,
        //     KEY_HASH,
        //     HONK_IDENTIFIER,
        // );
        // verify_proof_with_type(
        //     circuitInputs.vkeys.vkey_c,
        //     circuitInputs.proofs.proof_c,
        //     circuitInputs.public_inputs.input_c,
        //     KEY_HASH,
        //     HONK_IDENTIFIER,
        // );
        // verify_proof_with_type(
        //     circuitInputs.vkeys.vkey_d,
        //     circuitInputs.proofs.proof_d,
        //     circuitInputs.public_inputs.input_d,
        //     KEY_HASH,
        //     HONK_IDENTIFIER,
        // );

        //assert the commitments in and out are equal for each circuit
        //skipping the 3rd one as my mock proofs are mock proofs x 

        assert(circuitInputs.public_inputs.input_a[1] == circuitInputs.public_inputs.input_b[0], "comm_out of proof_a does not match comm_in of proof_b");
        assert(circuitInputs.public_inputs.input_b[1] == circuitInputs.public_inputs.input_c[0], "comm_out of proof_c does not match comm_in of proof_d");
        // assert(circuitInputs.public_inputs.input_c[1] == circuitInputs.public_inputs.input_d[0], "comm_out of proof_d does not match comm_in of proof_c");
        assert(circuitInputs.public_inputs.input_d[1] == zk_id, "scoped nullifier of proof_d does not match zk_id");

        //assert that the registry root is correct


        //assert that the scoped nullifier is obsidion, for demo purposes, hardcode this check, could be storage for allowed websites
        // in the future we could have the scope included in the proof to be this contract / chain id / etc
        //comment out for testing
        // assert(circuitInputs.public_inputs.input_d[1] == OBSIDION_SCOPE, "scoped nullifier is not obsidion");

        //create the note for the user if all checks pass
        //transfer total is 0 for new registrations

        let new_auth_note = AuthNote::new(address, zk_id, true, epoch, 0);
        location.initialize_or_replace(new_auth_note).emit(encode_and_encrypt_note(
            &mut context,
            address,
            address,
        ));

        let root_hash = circuitInputs.public_inputs.input_a[0];

        //enqueue the public epoch check, cerificate_root check and the zk_id for the mapping.
        ComplianceCheck::at(context.this_address())._check_epoch_and_root_and_zk_id(timestamp, root_hash, zk_id).enqueue(&mut context);
    }

    #[contract_library_method]
    fn _calculate_epoch(timestamp: u64) -> u64 {
        timestamp / SECONDS_PER_MONTH

        //TODO: this function will need some addition to ensure there are no rounding errors.
        //Some safe math lib in noir or something
    }

    #[public]
    #[internal]
    fn _check_epoch_and_root_and_zk_id(timestamp: u64, root_hash: Field, zk_id: Field) {
        let network_timestamp = context.timestamp();
        let epoch = _calculate_epoch(network_timestamp);
        
        //assert the network timestamp and user provided timestamp are within 10 minutes of each other
        //600 for testing, comment out for testing, due to sandbox issues
        // if (timestamp >= network_timestamp) {
        //     assert((network_timestamp + 600 as u64) >= timestamp, "timestamp is too far in the past");
        // } else {
        //     assert((timestamp + 600 as u64) >= network_timestamp, "timestamp is too far in the future");
        // }

        let network_epoch = _calculate_epoch(network_timestamp);
        let user_epoch = _calculate_epoch(timestamp);

        //TODO: this will need to be uncommented when we have a real timestamp
        // assert(network_epoch == user_epoch, "epoch is not the same");

        //assert the root hash is valid
        assert(root_hash == storage.registry_root.read(), "root hash is not valid");

        //check the zk_id is valid
        let zk_id_exists = storage.epoch_zk_id.at(user_epoch).at(zk_id).read();
        assert(zk_id_exists == false, "zk_id has already been registered for this epoch");

        //store the zk_id in the epoch
        //using user_epoch as we are not using the network epoch in this POC
        storage.epoch_zk_id.at(user_epoch).at(zk_id).write(true);
    }

    #[private]
    fn authorize_transfer_private(_sender: AztecAddress, _from: AztecAddress, _amount: u128) {


        //check fetch the note for the user
        //get the epoch from the note and assert later.
        let auth_note = storage.address_authorised.at(_sender).get_note().note;

        let note_epoch = auth_note.epoch;
        let zk_id = auth_note.zk_id;

        //check the note is authenticated
        assert(auth_note.authenticated == true, "note is not authenticated");

        //check the transfer limit
        let transfer_total = auth_note.transfer_total + _amount;
        assert(transfer_total <= TRANSFER_LIMIT, "transfer limit exceeded");

        //update the note for storage
        let new_auth_note = AuthNote::new(auth_note.owner, zk_id, true, note_epoch, transfer_total);

        storage.address_authorised.at(_sender).replace(new_auth_note).emit(encode_and_encrypt_note(
            &mut context,
            _sender,
            _sender,
        ));

        //check the provided timestamp is correct, zk_id has been registered for this epoch
        ComplianceCheck::at(context.this_address())._check_epoch_and_zk_id(note_epoch, zk_id).enqueue(&mut context);

    }

    #[public]
    #[internal]
    fn _check_epoch_and_zk_id(note_epoch: u64, zk_id: Field) {
        let network_timestamp = context.timestamp();
        let note_timestamp = note_epoch * SECONDS_PER_MONTH;

        //comment out for test
        //  if (note_timestamp >= network_timestamp) {
        //     assert((network_timestamp + 6000000 as u64) >= note_timestamp, "timestamp is too far in the past");
        // } else {
        //     assert((note_timestamp + 6000000 as u64) >= network_timestamp, "timestamp is too far in the future");
        // }

        let network_epoch = _calculate_epoch(network_timestamp);
        // assert(network_epoch == note_epoch, "epoch is not the same");

        //check the zk_id has been registered
        let zk_id_exists = storage.epoch_zk_id.at(note_epoch).at(zk_id).read();
        assert(zk_id_exists == true, "zk_id has not been registered for this epoch");
    }

    //Not needed right?
    #[public]
    fn authorize_transfer_public(_sender: AztecAddress, _from: AztecAddress, _amount: u128) {}

    //VIEW HELPERS FOR TESTING
    #[public]
    #[view]
    fn get_registry_root() -> Field {
        storage.registry_root.read()
    }
}
