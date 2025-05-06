use dep::aztec::macros::aztec;

#[aztec]
pub contract Dripper {
    use dep::aztec::{
        macros::{functions::{private, public, initializer}, storage::storage},
    };
    use dep::aztec::prelude::{AztecAddress};
    use token::Token;

    #[private]
    #[initializer]
    fn constructor() {}

    #[public]
    fn drip_to_public(token_address: AztecAddress, amount: u64) {
        let token = Token::at(token_address);
        let msg_sender = context.msg_sender();
        token.mint_to_public(msg_sender, amount as u128).call(&mut context);
    }

    #[private]
    fn drip_to_private(token_address: AztecAddress, amount: u64) {
        let token = Token::at(token_address);
        let msg_sender = context.msg_sender();
        token.mint_to_private(msg_sender, msg_sender, amount as u128).call(&mut context);
    }

}
