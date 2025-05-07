use aztec::macros::aztec;

#[aztec]
pub contract ComplianceCheck {
    use aztec::{
        prelude::AztecAddress,
        macros::{
            functions::{private, public},
        },
    };

    #[private]
    fn authorize_transfer_private(_sender: AztecAddress, _from: AztecAddress, _amount: u128) {}

    #[public]
    fn authorize_transfer_public(_sender: AztecAddress, _from: AztecAddress, _amount: u128) {}
}
