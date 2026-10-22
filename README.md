# Vesper trusted setup ceremony

Vesper is a private pool for tokenized stocks on Robinhood Chain. Its zero-knowledge proofs
use **Groth16**, which needs a one-time setup that creates some secret randomness. Anyone who
knew *all* of that randomness could forge proofs and drain the pool.

This ceremony makes sure nobody knows it. Each contributor mixes in their own randomness and
throws it away. **If even one contributor is honest, the final key is safe.** Add yours and
you don't have to trust anyone else, including the Vesper team.

## How it works

| Part | What | Who |
|---|---|---|
| Phase 1 | The public [Hermez / Polygon powers of tau](https://github.com/iden3/snarkjs#7-prepare-phase-2) (54 contributors), 2^15 file. Its blake2b hash is checked against the one published by snarkjs. | Already done, reused |
| Phase 2 | Contributions specific to Vesper's circuit, one after another, in `contributions/0001.zkey`, `0002.zkey`, ... | **You** |
| Seal | A public random beacon nobody could predict, announced in advance | Coordinator |

Every contribution is checked automatically by GitHub Actions: it must be a valid key for this
exact circuit and phase 1, and it must build on the previous one (so nobody can drop earlier
contributions).

## Contribute (about 5 minutes)

You need [Node.js](https://nodejs.org) 18 or newer and git.

1. **Get your turn.** Comment on the pinned *Contribution queue* issue. Contributions go one at
   a time, because each builds on the last. Wait until you're told it's your turn.
2. **Run it:**
   ```bash
   git clone https://github.com/TomciSplinter/vesper-ceremony
   cd vesper-ceremony
   npm ci
   npm run contribute -- "Your name or handle"
   ```
   Type some random keys when asked. It takes about a minute and prints your **contribution
   hash**.
3. **Send it in.** Fork this repo and open a pull request that adds the two new files it made:
   `contributions/NNNN.zkey` and `attestations/NNNN.md`. (Using the GitHub website: on your fork,
   *Add file → Upload files*, drop both files in the right folders, then *Contribute → Open pull
   request*.) The check runs by itself in a few minutes.
4. **Post your hash publicly** (X, Farcaster, a blog...). That is your public proof that your
   contribution is in the final key.
5. **Close the terminal.** Your randomness only ever existed in memory. For extra paranoia,
   contribute from a machine you then restart.

## Check it yourself

```bash
npm ci
npm run check-circuit   # needs circom 2.1.9: the committed .r1cs matches the circuit source
npm run verify:all      # every key verifies and builds on the one before
npm run verify:final    # after the seal: the final key includes every contribution + the beacon
```

The verify scripts list every contribution and its hash, so you can find yours.

## After the ceremony

The coordinator announces in advance which beacon will seal it (for example a specific future
[drand](https://drand.love) round), then runs `npm run finalize`. That writes `final/`:
the final proving key, verification key, and `Verifier.sol`. The Vesper pool on mainnet uses that
verifier; compare it with the verified contract source on the Robinhood Chain explorer.

## What's in this repo

- `circuit/src/` – the Vesper transaction circuit (circom 2.1.9, circomlib 2.0.5)
- `circuit/transaction2.r1cs` – the compiled circuit the keys are for
- `contributions/` – the chain of keys; `0000.zkey` is the starting key, made in public by the
  *Start ceremony* GitHub Action
- `attestations/` – a short note from each contributor
- `scripts/` – contribute / verify / finalize, built on [snarkjs](https://github.com/iden3/snarkjs) 0.7.6
