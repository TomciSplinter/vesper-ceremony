// Coordinator only, at the end: seals the ceremony with a public random beacon that nobody
// could know in advance (announced before the ceremony closes), then exports the verifier.
//   npm run finalize -- <beacon hex> "<where the beacon came from>"
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { CONTRIB_DIR, FINAL_DIR, ROOT, ensurePtau, fileHash, listZkeys, short, verifyZkey } from "./lib.mjs";

const [beacon, source] = process.argv.slice(2);
if (!/^(0x)?[0-9a-fA-F]{64}$/.test(beacon || "") || !source) {
  console.error('Usage: npm run finalize -- <32-byte beacon hex> "<beacon source, e.g. drand quicknet round 1234567>"');
  process.exit(1);
}
const ITER = 10; // 2^10 hash iterations, the snarkjs default
const ptau = await ensurePtau();
const keys = listZkeys();
const last = path.join(CONTRIB_DIR, keys[keys.length - 1]);
fs.mkdirSync(FINAL_DIR, { recursive: true });
const zkey = path.join(FINAL_DIR, "transaction2_final.zkey");

console.log(`Applying beacon to ${path.basename(last)} ...`);
await snarkjs.zKey.beacon(last, zkey, "Final beacon", beacon.replace(/^0x/, ""), ITER, console);
const { ok, contributions } = await verifyZkey(zkey, ptau);
if (!ok) throw new Error("final key failed verification");

const vkey = await snarkjs.zKey.exportVerificationKey(zkey);
fs.writeFileSync(path.join(FINAL_DIR, "transaction2_vkey.json"), JSON.stringify(vkey, null, 2) + "\n");
const snarkjsBin = path.join(ROOT, "node_modules", ".bin", "snarkjs");
execFileSync(snarkjsBin, ["zkey", "export", "solidityverifier", zkey, path.join(FINAL_DIR, "Verifier.sol")], { stdio: "inherit" });

const lines = contributions.map((c) => `| ${c.index} | ${c.name} | \`${short(c.hash)}\` |`).join("\n");
fs.writeFileSync(
  path.join(FINAL_DIR, "README.md"),
  `# Final key\n\nSealed with beacon \`${beacon}\` (${source}), ${2 ** ITER} iterations.\n\n` +
    `| # | Contributor | Contribution hash |\n|---|---|---|\n${lines}\n\n` +
    `- transaction2_final.zkey sha256: \`${fileHash(zkey, "sha256")}\`\n` +
    `- Verifier.sol sha256: \`${fileHash(path.join(FINAL_DIR, "Verifier.sol"), "sha256")}\`\n\n` +
    `Check it yourself: \`npm ci && npm run verify:final\`. Compare Verifier.sol with the verified\n` +
    `source of the verifier contract on the Robinhood Chain explorer.\n`
);
console.log(`\n✔ Final key, verification key and Verifier.sol are in final/ (${contributions.length} contributions incl. beacon).`);
process.exit(0);
