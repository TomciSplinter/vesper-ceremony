# Beacon announcement

Announced 2026-10-23 17:35 UTC, before the beacon exists.

The ceremony will be sealed on top of the latest contribution at that time (currently
`0003.zkey`, 3 contributions) using the public randomness of:

- **drand quicknet, round 33325012**, published at **2026-10-23 18:00:00 UTC**
- chain hash `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`
- https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/33325012

Nobody, including the coordinator, can know this value before 18:00 UTC. The *Finalize
ceremony* GitHub Action fetches it from two independent drand endpoints, requires them to agree,
and applies it with `snarkjs zkey beacon` (2^10 iterations).
