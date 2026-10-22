// Adds your randomness to the ceremony.
//   npm run contribute -- "Your name or handle"
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import * as snarkjs from "snarkjs";
import { ATTEST_DIR, CONTRIB_DIR, listZkeys, nameFor, numberOf } from "./lib.mjs";

const name = (process.argv[2] || "").trim();
if (!name) {
  console.error('Usage: npm run contribute -- "Your name or handle"');
  process.exit(1);
}
const keys = listZkeys();
if (!keys.length) throw new Error("no contributions/0000.zkey yet: the ceremony hasn't started");
const prev = keys[keys.length - 1];
const n = numberOf(prev) + 1;
const out = path.join(CONTRIB_DIR, nameFor(n));

console.log(`\nVesper ceremony: contribution #${n}, building on ${prev}.`);
console.log("Make sure you pulled the latest version of this repo first (git pull).\n");

// Your secret randomness: the computer's random generator plus anything you type.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const typed = await rl.question("Type some random keys, then press Enter (optional): ");
rl.close();
let entropy = crypto.randomBytes(64).toString("hex") + crypto.createHash("sha256").update(typed + Date.now()).digest("hex");

console.log("\nWorking (about a minute) ...");
const hash = await snarkjs.zKey.contribute(path.join(CONTRIB_DIR, prev), out, name, entropy, { info() {}, debug() {}, warn: console.warn, error: console.error });
entropy = null; // the randomness only ever lived in this process's memory
const hex = Buffer.from(hash).toString("hex");
const pretty = hex.match(/.{1,8}/g).join(" ");

fs.mkdirSync(ATTEST_DIR, { recursive: true });
const attest = path.join(ATTEST_DIR, nameFor(n).replace(".zkey", ".md"));
fs.writeFileSync(
  attest,
  `# Contribution #${n}\n\n- Name: ${name}\n- Date: ${new Date().toISOString().slice(0, 10)}\n- Built on: ${prev}\n- Contribution hash:\n\n\`\`\`\n${pretty}\n\`\`\`\n\n` +
    `I generated this contribution on my own machine and did not keep the randomness.\n`
);

console.log(`\nDone! Your contribution hash (save it, and post it somewhere public like X):\n\n  ${pretty}\n`);
console.log(`Now upload these two files in a pull request:\n  contributions/${nameFor(n)}\n  attestations/${path.basename(attest)}\n`);
console.log("Then close this terminal window. Your randomness was never written to disk.");
process.exit(0);
