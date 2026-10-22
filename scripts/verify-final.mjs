// Anyone: checks final/transaction2_final.zkey against the circuit and phase 1, and that it
// builds on the last contribution plus the beacon.
import path from "node:path";
import { CONTRIB_DIR, FINAL_DIR, ensurePtau, listZkeys, short, verifyZkey } from "./lib.mjs";

const ptau = await ensurePtau();
const keys = listZkeys();
const prev = await verifyZkey(path.join(CONTRIB_DIR, keys[keys.length - 1]), ptau);
const fin = await verifyZkey(path.join(FINAL_DIR, "transaction2_final.zkey"), ptau);
const ok = prev.ok && fin.ok && fin.contributions.length === prev.contributions.length + 1 &&
  prev.contributions.every((c, i) => fin.contributions[i].hash === c.hash);
for (const c of fin.contributions) console.log(`  #${c.index}  ${c.name.padEnd(28)} ${short(c.hash)}`);
console.log(ok ? "\n✔ Final key verified." : "\n✘ Final key does NOT check out.");
process.exit(ok ? 0 : 1);
