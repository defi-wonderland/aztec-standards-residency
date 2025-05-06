use dep::aztec::macros::aztec;

#[aztec]
pub contract Dripper {
    use dep::aztec::{
        macros::{functions::{private, public}, storage::storage},
    };
    use dep::aztec::prelude::{AztecAddress};
    use uint_note::uint_note::{PartialUintNote};
    use token::Token;

    #[public]
    fn drip_to_public(token_address: AztecAddress, amount: u64) {
        let token = Token::at(token_address);
        let msg_sender = context.msg_sender();
        token.mint_to_public(msg_sender, amount as u128).call(&mut context);
    }

    #[public]
    fn mint_to_commitment(token_address: AztecAddress, amount: u64, commitment: PartialUintNote) {
        let token = Token::at(token_address);
        token.mint_to_commitment(amount as u128, commitment).call(&mut context);
    }

    #[private]
    fn drip_to_private(token_address: AztecAddress, amount: u64) {
        let token = Token::at(token_address);
        let msg_sender = context.msg_sender();
        token.mint_to_private(msg_sender, msg_sender, amount as u128).call(&mut context);
    }

}
