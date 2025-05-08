
use aztec::{
    macros::notes::note, 
    oracle::random::random, 
    protocol_types::{
        address::AztecAddress, 
        traits::{ToField, FromField, Serialize},
        constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL
    },
    prelude::{Map, PrivateContext, SharedMutable, PrivateImmutable, PrivateSet, PublicImmutable, NoteGetterOptions, RetrievedNote}
};

global ZERO_FIELD: Field = 0x0000000000000000000000000000000000000000000000000000000000000000;
global ZERO_ADDRESS: AztecAddress = AztecAddress::from_field(
        0x0000000000000000000000000000000000000000000000000000000000000000,
    );

//need to explore if there needs to be an owner of the note or it can be an email hash as the owner
//will have an owner which will be the escrow contract for now
#[note]
#[derive(Eq)]
pub struct AuthNote {
    owner: AztecAddress,
    zk_id: Field,
    epoch: u64,
    authenticated: bool,
    transfer_total: u128,
    randomness: Field,
}


impl AuthNote {
    pub fn new(owner: AztecAddress, zk_id: Field, authenticated: bool, epoch: u64, transfer_total: u128) -> Self {
        let randomness = unsafe { random() };

        AuthNote { owner, zk_id, epoch, authenticated, transfer_total, randomness }
    }

    pub fn owner(self) -> AztecAddress {
        self.owner
    }

    pub fn zk_id(self) -> Field {
        self.zk_id
    }

    pub fn authenticated(self) -> bool {
        self.authenticated
    }

    pub fn epoch(self) -> u64 {
        self.epoch
    }

    pub fn transfer_total(self) -> u128 {
        self.transfer_total
    }

    pub fn default() -> Self {
        AuthNote { owner: ZERO_ADDRESS, zk_id: ZERO_FIELD, epoch: 0, authenticated: false, transfer_total: 0, randomness: ZERO_FIELD }
    }
}
