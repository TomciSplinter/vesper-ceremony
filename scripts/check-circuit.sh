#!/usr/bin/env bash
# Recompiles the circuit from circuit/src with circom 2.1.9 and checks it matches circuit/transaction2.r1cs.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
circom circuit/src/transaction2.circom --r1cs -o "$tmp" -l node_modules >/dev/null
a=$(sha256sum "$tmp/transaction2.r1cs" | cut -d' ' -f1)
b=$(sha256sum circuit/transaction2.r1cs | cut -d' ' -f1)
echo "compiled  $a"; echo "committed $b"
[ "$a" = "$b" ] && echo "✔ circuit/transaction2.r1cs matches the source" || { echo "✘ mismatch"; exit 1; }
