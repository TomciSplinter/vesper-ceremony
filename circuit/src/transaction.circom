pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "./merkleproof.circom";
include "./keypair.circom";

/*
Vesper shielded transaction: spend nIns notes, create nOuts notes, all of one asset
and one deposit LABEL.

Note (UTXO) = { amount, pubkey, blinding, asset, label }
  commitment = Poseidon(amount, pubkey, blinding, asset, label)
  nk         = Poseidon(privKey, NK_DOMAIN)          (nullifier key, shared in the view key)
  nullifier  = Poseidon(commitment, merklePath, nk)

Labels (Privacy Pools style compliance):
  - Every deposit gets a fresh label chosen by the pool contract (public `newLabel`).
    A deposit may not spend existing notes, so new money can't hide under an old label.
  - Every other transaction keeps the label of the notes it spends (private `inLabel`);
    all real inputs must share it, and every output carries it. So a label follows the
    money through private transfers, to whoever receives it.
  - Withdrawals prove one of:
      aspRoot != 0:   the label is in the association set (approved deposits) whose
                      Merkle root is `aspRoot`. Private: doesn't reveal which label.
      exitLabel != 0: the label equals `exitLabel`. Public: the contract then only pays
                      the original depositor of that label (exit for unapproved money).
    The contract decides which of these each transaction must use.

Value conservation:  sum(inputs) + publicAmount == sum(outputs)
where publicAmount = extAmount - fee (mod p) is checked by the pool contract.

PUBLIC SIGNAL ORDER (must match VesperPool._verify) = declaration order below:
  root, publicAmount, extDataHash, asset, newLabel, aspRoot, exitLabel,
  inputNullifier[0..nIns), outputCommitment[0..nOuts)
*/
template Transaction(levels, aspLevels, nIns, nOuts) {
    // ---- public ----
    signal input root;
    signal input publicAmount;
    signal input extDataHash;
    signal input asset;
    signal input newLabel;
    signal input aspRoot;
    signal input exitLabel;
    signal input inputNullifier[nIns];
    signal input outputCommitment[nOuts];

    // ---- private ----
    signal input inLabel;
    signal input inAmount[nIns];
    signal input inPrivateKey[nIns];
    signal input inBlinding[nIns];
    signal input inPathIndices[nIns];
    signal input inPathElements[nIns][levels];

    signal input outAmount[nOuts];
    signal input outPubkey[nOuts];
    signal input outBlinding[nOuts];

    signal input aspPathIndices;
    signal input aspPathElements[aspLevels];

    // ---- the transaction's label ----
    // isDeposit = (newLabel != 0); label = isDeposit ? newLabel : inLabel
    component newLabelZero = IsZero();
    newLabelZero.in <== newLabel;
    signal isDeposit <== 1 - newLabelZero.out;
    signal label <== inLabel + isDeposit * (newLabel - inLabel);

    // ---- inputs ----
    component inKeypair[nIns];
    component inNullifierKey[nIns];
    component inCommitmentHasher[nIns];
    component inNullifierHasher[nIns];
    component inTree[nIns];
    component inCheckRoot[nIns];
    var sumIns = 0;

    for (var tx = 0; tx < nIns; tx++) {
        inKeypair[tx] = Keypair();
        inKeypair[tx].privateKey <== inPrivateKey[tx];

        inCommitmentHasher[tx] = Poseidon(5);
        inCommitmentHasher[tx].inputs[0] <== inAmount[tx];
        inCommitmentHasher[tx].inputs[1] <== inKeypair[tx].publicKey;
        inCommitmentHasher[tx].inputs[2] <== inBlinding[tx];
        inCommitmentHasher[tx].inputs[3] <== asset;
        inCommitmentHasher[tx].inputs[4] <== inLabel;

        inNullifierKey[tx] = NullifierKey();
        inNullifierKey[tx].privateKey <== inPrivateKey[tx];

        inNullifierHasher[tx] = Poseidon(3);
        inNullifierHasher[tx].inputs[0] <== inCommitmentHasher[tx].out;
        inNullifierHasher[tx].inputs[1] <== inPathIndices[tx];
        inNullifierHasher[tx].inputs[2] <== inNullifierKey[tx].nk;
        inNullifierHasher[tx].out === inputNullifier[tx];

        inTree[tx] = MerkleProof(levels);
        inTree[tx].leaf <== inCommitmentHasher[tx].out;
        inTree[tx].pathIndices <== inPathIndices[tx];
        for (var i = 0; i < levels; i++) {
            inTree[tx].pathElements[i] <== inPathElements[tx][i];
        }

        // Zero-amount (dummy) inputs don't need to be in the tree.
        inCheckRoot[tx] = ForceEqualIfEnabled();
        inCheckRoot[tx].in[0] <== root;
        inCheckRoot[tx].in[1] <== inTree[tx].root;
        inCheckRoot[tx].enabled <== inAmount[tx];

        // Input amounts were range-checked when they were created as outputs.
        sumIns += inAmount[tx];
    }

    // A deposit can't also spend notes (else fresh money could take an old, approved label).
    newLabel * sumIns === 0;

    // ---- outputs ----
    component outCommitmentHasher[nOuts];
    component outAmountCheck[nOuts];
    var sumOuts = 0;

    for (var tx = 0; tx < nOuts; tx++) {
        outCommitmentHasher[tx] = Poseidon(5);
        outCommitmentHasher[tx].inputs[0] <== outAmount[tx];
        outCommitmentHasher[tx].inputs[1] <== outPubkey[tx];
        outCommitmentHasher[tx].inputs[2] <== outBlinding[tx];
        outCommitmentHasher[tx].inputs[3] <== asset;
        outCommitmentHasher[tx].inputs[4] <== label;
        outCommitmentHasher[tx].out === outputCommitment[tx];

        // Prevent field overflow: every new note is < 2^248.
        outAmountCheck[tx] = Num2Bits(248);
        outAmountCheck[tx].in <== outAmount[tx];

        sumOuts += outAmount[tx];
    }

    // The same note can't be spent twice in one transaction.
    component sameNullifiers[nIns * (nIns - 1) / 2];
    var index = 0;
    for (var i = 0; i < nIns - 1; i++) {
        for (var j = i + 1; j < nIns; j++) {
            sameNullifiers[index] = IsEqual();
            sameNullifiers[index].in[0] <== inputNullifier[i];
            sameNullifiers[index].in[1] <== inputNullifier[j];
            sameNullifiers[index].out === 0;
            index++;
        }
    }

    // Value conservation.
    sumIns + publicAmount === sumOuts;

    // ---- compliance ----
    // If aspRoot is set: the label is a leaf of the association set.
    component aspTree = MerkleProof(aspLevels);
    aspTree.leaf <== label;
    aspTree.pathIndices <== aspPathIndices;
    for (var i = 0; i < aspLevels; i++) {
        aspTree.pathElements[i] <== aspPathElements[i];
    }
    component aspCheck = ForceEqualIfEnabled();
    aspCheck.in[0] <== aspRoot;
    aspCheck.in[1] <== aspTree.root;
    aspCheck.enabled <== aspRoot;

    // If exitLabel is set: it is this transaction's label.
    component exitCheck = ForceEqualIfEnabled();
    exitCheck.in[0] <== exitLabel;
    exitCheck.in[1] <== label;
    exitCheck.enabled <== exitLabel;

    // Bind extDataHash into the proof (recipient, relayer, fee, encrypted notes)
    // so a front-runner can't swap them. Squaring forces it into a constraint.
    signal extDataSquare <== extDataHash * extDataHash;
}
