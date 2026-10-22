// Coordinator only, run once: builds contributions/0000.zkey from the circuit and the
// public phase-1 file. Deterministic, so anyone can rerun it and get the same hash.
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { CONTRIB_DIR, R1CS, ensurePtau, fileHash, listZkeys } from "./lib.mjs";

const out = path.join(CONTRIB_DIR, "0000.zkey");
if (listZkeys().length) throw new Error("ceremony already started (contributions/ isn't empty)");
const ptau = await ensurePtau({ pin: true });
if (process.env.CI) console.log("::notice::phase 1 verified and pinned");
console.log("Building the starting key (no randomness yet) ...");
await snarkjs.zKey.newZKey(R1CS, ptau, out, console);
console.log(`\nWrote ${out}\nsha256 ${fileHash(out, "sha256")}`);
process.exit(0);
