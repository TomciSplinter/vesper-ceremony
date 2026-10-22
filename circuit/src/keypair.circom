pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

// Spending key -> public key. Knowing privateKey is what lets you spend a note.
template Keypair() {
    signal input privateKey;
    signal output publicKey;

    component hasher = Poseidon(1);
    hasher.inputs[0] <== privateKey;
    publicKey <== hasher.out;
}

// Spending key -> nullifier key (Zcash-style "nk").
// The nullifier key lets its holder compute a note's nullifier, so they can tell
// whether it has been spent, but it can't spend: spending still needs privateKey
// to open publicKey. It is shared inside the view key.
// The domain constant = uint256(keccak256("vesper-nullifier-key")) mod p and must
// match NK_DOMAIN in src/keypair.js.
template NullifierKey() {
    signal input privateKey;
    signal output nk;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== privateKey;
    hasher.inputs[1] <== 9138734446240830184135411227826300358252081083897174942417128196357121645964;
    nk <== hasher.out;
}
