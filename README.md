# Aztec Standards

> ⚠️ **DEPRECATED – DO NOT USE**
>
> This repository is no longer maintained and is **deprecated**.
>
> It may contain **outdated, insecure, or vulnerable code** and should **not** be used in production or as a dependency in any project.
>
> The repository is retained solely for historical reference. No support, updates, or security patches will be provided.

Aztec Standards is a compilation of reusable, standardized contracts for the Aztec Network. It provides a foundation of token primitives and utilities supporting both private and public operations, enabling developers to build privacy-preserving applications.

## Table of Contents
- [Token Contract](#token-contract)
- [Future Contracts](#future-contracts)

## Token Contract
The `Token` contract implements an ERC-20-like token with Aztec-specific privacy extensions. It supports transfers and interactions explicitly through private balances and public balances, offering full coverage of Aztec’s confidentiality features.

### AIP-20: Aztec Token Standard
We published the AIP-20 Aztec Token Standard in our forum: https://forum.aztec.network/t/request-for-comments-aip-20-aztec-token-standard/7737
Feel free to review and discuss the specification there.

### Storage Fields
- `name: str<31>`: Token name (compressed).
- `symbol: str<31>`: Token symbol (compressed).
- `decimals: u8`: Decimal precision.
- `private_balances: Map<AztecAddress, BalanceSet>`: Private balances per account.
- `public_balances: Map<AztecAddress, u128>`: Public balances per account.
- `total_supply: u128`: Total token supply.
- `minter: AztecAddress`: Authorized minter address (if set).

### Initializer Functions
```rust
/// @notice Initializes the token with an initial supply
/// @dev Since this constructor doesn't set a minter address the mint functions will be disabled
/// @param name The name of the token
/// @param symbol The symbol of the token
/// @param decimals The number of decimals of the token
/// @param initial_supply The initial supply of the token
/// @param to The address to mint the initial supply to
#[public]
#[initializer]
fn constructor_with_initial_supply(
    name: str<31>,
    symbol: str<31>,
    decimals: u8,
    initial_supply: u128,
    to: AztecAddress,
) { /* ... */ }
```

```rust
/// @notice Initializes the token with a minter
/// @param name The name of the token
/// @param symbol The symbol of the token
/// @param decimals The number of decimals of the token
/// @param minter The address of the minter
#[public]
#[initializer]
fn constructor_with_minter(
    name: str<31>,
    symbol: str<31>,
    decimals: u8,
    minter: AztecAddress,
) { /* ... */ }
```

### Private Functions
```rust
/// @notice Transfer tokens from private balance to public balance
/// @dev Spends notes, emits a new note (UintNote) with any remaining change, and enqueues a public call
/// @param from The address of the sender
/// @param to The address of the recipient
/// @param amount The amount of tokens to transfer
/// @param nonce The nonce used for authwitness
#[private]
fn transfer_private_to_public(
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
    nonce: Field,
) { /* ... */ }

/// @notice Transfer tokens from private balance to public balance with a commitment
/// @dev Spends notes, emits a new note (UintNote) with any remaining change, enqueues a public call, and returns a partial note
/// @param from The address of the sender
/// @param to The address of the recipient
/// @param amount The amount of tokens to transfer
/// @param nonce The nonce used for authwitness
/// @return commitment The partial note utilized for the transfer commitment (privacy entrance)
#[private]
fn transfer_private_to_public_with_commitment(
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
    nonce: Field,
) -> PartialUintNote { /* ... */ }

/// @notice Transfer tokens from private balance to private balance
/// @dev Spends notes, emits a new note (UintNote) with any remaining change, and sends a note to the recipient
/// @param from The address of the sender
/// @param to The address of the recipient
/// @param amount The amount of tokens to transfer
/// @param nonce The nonce used for authwitness
#[private]
fn transfer_private_to_private(
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
    nonce: Field,
) { /* ... */ }

/// @notice Transfer tokens from private balance to the recipient commitment (recipient must create a commitment first)
/// @dev Spends notes, emits a new note (UintNote) with any remaining change, and enqueues a public call
/// @param from The address of the sender
/// @param amount The amount of tokens to transfer
/// @param commitment The partial note representing the commitment (privacy entrance that the recipient shares with the sender)
/// @param nonce The nonce used for authwitness
#[private]
fn transfer_private_to_commitment(
    from: AztecAddress,
    amount: u128,
    commitment: PartialUintNote,
    nonce: Field,
) { /* ... */ }

/// @notice Transfer tokens from public balance to private balance
/// @dev Enqueues a public call to decrease account balance and emits a new note with balance difference
/// @param from The address of the sender
/// @param to The address of the recipient
/// @param amount The amount of tokens to transfer
/// @param nonce The nonce used for authwitness
#[private]
fn transfer_public_to_private(
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
    nonce: Field,
) { /* ... */ }

/// @notice Initializes a transfer commitment to be used for transfers/mints
/// @dev Returns a partial note that can be used to execute transfers/mints
/// @param from The address of the sender
/// @param to The address of the recipient
/// @return commitment The partial note initialized for the transfer/mint commitment
#[private]
fn initialize_transfer_commitment(
    from: AztecAddress,
    to: AztecAddress,
) -> PartialUintNote { /* ... */ }

/// @notice Recursively subtracts balance from commitment
/// @dev Used to subtract balances that exceed the max notes limit
/// @param account The address of the account to subtract the balance from
/// @param amount The amount of tokens to subtract
/// @return The change to return to the owner
#[private]
#[internal]
fn recurse_subtract_balance_internal(
    account: AztecAddress,
    amount: u128,
) -> u128 { /* ... */ }

/// @notice Mints tokens to a commitment
/// @dev Mints tokens to a commitment and enqueues a public call to increase the total supply
/// @param from The address of the sender
/// @param to The address of the recipient
/// @param amount The amount of tokens to mint
#[private]
fn mint_to_private(
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
) { /* ... */ }
```

### Public Functions
```rust
/// @notice Transfers tokens from public balance to public balance
/// @dev Public call to decrease account balance and a public call to increase recipient balance
/// @param from The address of the sender
/// @param to The address of the recipient
/// @param amount The amount of tokens to transfer
/// @param nonce The nonce used for authwitness
#[public]
fn transfer_public_to_public(
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
    nonce: Field,
) { /* ... */ }

/// @notice Finalizes a transfer of token `amount` from public balance of `from` to a commitment of `to`
/// @dev The transfer must be prepared by calling `initialize_transfer_commitment` first and the resulting
/// `commitment` must be passed as an argument to this function
/// @param from The address of the sender
/// @param amount The amount of tokens to transfer
/// @param commitment The partial note representing the commitment (privacy entrance)
/// @param nonce The nonce used for authwitness
#[public]
fn transfer_public_to_commitment(
    from: AztecAddress,
    amount: u128,
    commitment: PartialUintNote,
    nonce: Field,
) { /* ... */ }

/// @notice Stores a partial note in storage
/// @dev Used to store the commitment (privacy entrance)
/// @param slot The partial note to store
#[public]
#[internal]
fn store_commitment_in_storage_internal(
    slot: PartialUintNote,
) { /* ... */ }

/// @notice Increases the public balance of `to` by `amount`
/// @param to The address of the recipient
/// @param amount The amount of tokens to increase the balance by
#[public]
#[internal]
fn increase_public_balance_internal(
    to: AztecAddress,
    amount: u128,
) { /* ... */ }

/// @notice Decreases the public balance of `from` by `amount`
/// @param from The address of the sender
/// @param amount The amount of tokens to decrease the balance by
#[public]
#[internal]
fn decrease_public_balance_internal(
    from: AztecAddress,
    amount: u128,
) { /* ... */ }

/// @notice Increases the balance of the commitment by `amount`
/// @param commitment The partial note representing the commitment
/// @param amount The amount of tokens to increase the balance by
#[public]
#[internal]
fn increase_commitment_balance_internal(
    commitment: PartialUintNote,
    amount: u128,
) { /* ... */ }

/// @notice Mints tokens to a public balance
/// @dev Increases the public balance of `to` by `amount` and the total supply
/// @param to The address of the recipient
/// @param amount The amount of tokens to mint
#[public]
fn mint_to_public(
    to: AztecAddress,
    amount: u128,
) { /* ... */ }

/// @notice Finalizes a mint to a commitment
/// @dev Finalizes a mint to a commitment and updates the total supply
/// @param amount The amount of tokens to mint
/// @param commitment The partial note representing the mint commitment (privacy entrance)
#[public]
fn mint_to_commitment(
    amount: u128,
    commitment: PartialUintNote,
) { /* ... */ }
```

### View Functions
```rust
/// @notice Returns the public balance of `owner`
/// @param owner The address of the owner
/// @return The balance of the public balance of `owner`
#[public]
#[view]
fn balance_of_public(owner: AztecAddress) -> u128 { /* ... */ }

/// @notice Returns the total supply of the token
#[public]
#[view]
fn total_supply() -> u128 { /* ... */ }
```

### Utility Functions
```rust
/// @notice Returns the private balance of `owner`
/// @param owner The address of the owner
/// @return The private balance of `owner`
#[utility]
unconstrained fn balance_of_private(owner: AztecAddress) -> u128 { /* ... */ }
```

## Future Contracts
Additional standardized contracts (e.g., staking, governance, pools) will be added under this repository, with descriptions and function lists.