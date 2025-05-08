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
    

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        registry_root: PublicMutable<Field, Context>,
        // Map: address -> AuthNote
        address_authorised: Map<AztecAddress, PrivateMutable<AuthNote, Context>, Context>,
        //Map: epoch -> zk_id -> bool
        epoch_zk_id: Map<u64, Map<Field, PublicMutable<bool, Context>, Context>, Context>,
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

        //check existing note for address, have logic for if its the same epoch, if its a new one replace it.

        let address = context.msg_sender();

        //check that the note exists
        let location = storage.address_authorised.at(address);

        //safety: no good
        let auth_note_exists = unsafe { check_nullifier_exists(location.compute_initialization_nullifier()) };
        // let auth_note_exists = unsafe { location.is_initialized() }

        // let storage_slot = derive_storage_slot_in_map(location, address);

        // let (prev_retrieved_note, note_hash_for_read_request): (RetrievedNote<AuthNote>, Field) = get_note(context, storage_slot);


        if auth_note_exists {
            let auth_note = location.get_note().note;
            let epoch_from_auth_note = auth_note.epoch;

            let epoch = _calculate_epoch(timestamp);

            assert(epoch_from_auth_note == epoch, "address has already registered for this epoch");
        }
        // let auth_note_exists = storage.address_authorised.at(address).get_note().note;
        //do i need to check if this fails?,

        let epoch = _calculate_epoch(timestamp);

        //check the public inputs are equal
        //verify the proofs,
        //check registry root and all that fun jazz

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
        //will need to update depending on the size of the public inputs for each circuit
        assert(circuitInputs.public_inputs.input_a[1] == circuitInputs.public_inputs.input_b[0], "comm_out of proof_a does not match comm_in of proof_b");
        assert(circuitInputs.public_inputs.input_b[1] == circuitInputs.public_inputs.input_c[0], "comm_out of proof_c does not match comm_in of proof_d");
        // assert(circuitInputs.public_inputs.input_c[1] == circuitInputs.public_inputs.input_d[0], "comm_out of proof_d does not match comm_in of proof_c");
        assert(circuitInputs.public_inputs.input_d[1] == zk_id, "scoped nullifier of proof_d does not match zk_id");

        //assert that the registry root is correct


        //assert that the scoped nullifier is obsidion, for demo purposes, hardcode this check, could be storage for allowed websites
        //change this to whatever the correct value is
        //comment out for testing
        // assert(circuitInputs.public_inputs.input_d[1] == OBSIDION_SCOPE, "scoped nullifier is not obsidion");

        //create the note for the user if all checks pass
        //transfer total is 0 for new registrations
        //can include the timestamp, it will be asseted in the public call later.
        let new_auth_note = AuthNote::new(address, zk_id, true, epoch, 0);
        location.initialize_or_replace(new_auth_note).emit(encode_and_encrypt_note(
            &mut context,
            address,
            address,
        ));

        let root_hash = circuitInputs.public_inputs.input_a[0];

        //enqueue the public epoch check
        ComplianceCheck::at(context.this_address())._check_epoch_and_root_and_zk_id(timestamp, root_hash, zk_id).enqueue(&mut context);
    }

    #[contract_library_method]
    fn _calculate_epoch(timestamp: u64) -> u64 {
        timestamp / SECONDS_PER_MONTH

        //include some rounding logic for the epoch
        //fixed point math if there are rounding errors
        //safe math noir or something
    }

    // #[utility]
    // unconstrained fn _check_auth_note_exists(address: AztecAddress) -> bool {
    //     let location = storage.address_authorised.at(address);
    //     let auth_note_exists = location.is_initialized();
    //     auth_note_exists
    // }

    #[public]
    #[internal]
    fn _check_epoch_and_root_and_zk_id(timestamp: u64, root_hash: Field, zk_id: Field) {
        let network_timestamp = context.timestamp();
        let epoch = _calculate_epoch(network_timestamp);
        
        //assert the network timestamp and user provided timestamp are within 10 minutes of each other
        //60000 for testing, comment out for testing
        // if (timestamp >= network_timestamp) {
        //     assert((network_timestamp + 600 as u64) >= timestamp, "timestamp is too far in the past");
        // } else {
        //     assert((timestamp + 600 as u64) >= network_timestamp, "timestamp is too far in the future");
        // }

        let network_epoch = _calculate_epoch(network_timestamp);
        let user_epoch = _calculate_epoch(timestamp);

        // assert(network_epoch == user_epoch, "epoch is not the same");

        //assert the root hash is valid
        //change to the correct value
        assert(root_hash == storage.registry_root.read(), "root hash is not valid");

        //check the zk_id is valid
        let zk_id_exists = storage.epoch_zk_id.at(user_epoch).at(zk_id).read();
        assert(zk_id_exists == false, "zk_id has already been registered for this epoch");

        //store the zk_id in the epoch
        //using user_epoch for network consistency
        storage.epoch_zk_id.at(user_epoch).at(zk_id).write(true);
    }

    #[private]
    fn authorize_transfer_private(_sender: AztecAddress, _from: AztecAddress, _amount: u128) {

        //better way to get the epoch


        //check fetch the note for the user
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
        //check the epoch from the note.

        //check the provided timestamp is correct
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
