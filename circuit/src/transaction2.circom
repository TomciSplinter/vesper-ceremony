pragma circom 2.1.6;

include "./transaction.circom";

// 2-in / 2-out, note tree depth 20 (~1M notes), association-set depth 20 (~1M approved deposits).
component main {public [root, publicAmount, extDataHash, asset, newLabel, aspRoot, exitLabel, inputNullifier, outputCommitment]} = Transaction(20, 20, 2, 2);
