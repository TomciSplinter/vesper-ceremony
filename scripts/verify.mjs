// Checks the ceremony.
//   npm run verify            -> verifies the latest key (which contains the whole chain)
//   npm run verify -- --all   -> verifies every key and that each one builds on the one before
//   npm run verify -- --pr <base-ref>  -> CI: the PR adds exactly one valid next contribution
import { execFileSync } from "node:child_process";
import path from "node:path";
import { CONTRIB_DIR, ROOT, ensurePtau, listZkeys, nameFor, numberOf, short, verifyZkey } from "./lib.mjs";

const args = process.argv.slice(2);
const fail = (msg) => {
  console.error(`\n✘ ${msg}`);
  if (process.env.CI) console.log(`::error::${msg}`);
  process.exit(1);
};
if (process.env.CI && process.env.DEV_PTAU) fail("DEV_PTAU is not allowed in CI");
const ptau = await ensurePtau();

async function check(file) {
  process.stdout.write(`Verifying ${path.basename(file)} (about a minute) ... `);
  const r = await verifyZkey(file, ptau);
  if (!r.ok) fail(`${path.basename(file)} is NOT a valid key for this circuit and phase 1`);
  console.log("ok");
  return r.contributions;
}

function extends_(prev, next, label) {
  if (next.length !== prev.length + 1) fail(`${label} should add exactly one contribution (has ${next.length}, previous has ${prev.length})`);
  prev.forEach((c, i) => {
    if (next[i].hash !== c.hash) fail(`${label} doesn't build on the previous key (contribution #${i + 1} differs). Pull the latest and redo your contribution.`);
  });
}

function print(contribs) {
  console.log("\nContributions in the chain:");
  for (const c of contribs) console.log(`  #${c.index}  ${c.name.padEnd(28)} ${short(c.hash)}`);
}

const keys = listZkeys();
if (!keys.length) {
  if (args[0] === "--all") { console.log("Ceremony not started yet (no keys)."); process.exit(0); }
  fail("no keys in contributions/");
}
keys.forEach((k, i) => numberOf(k) !== i && fail(`files must be numbered 0000, 0001, ... without gaps (found ${k})`));

if (args[0] === "--pr") {
  const base = args[1] || "origin/main";
  const changed = execFileSync("git", ["diff", "--name-status", `${base}...HEAD`], { cwd: ROOT, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(/\s+/));
  const latest = keys[keys.length - 1];
  const n = numberOf(latest);
  const allowed = new Set([`contributions/${latest}`, `attestations/${latest.replace(".zkey", ".md")}`]);
  for (const [status, file] of changed) {
    if (!allowed.has(file)) fail(`a contribution PR may only add contributions/${latest} and its attestation (it also touches ${file})`);
    if (status !== "A") fail(`${file} must be a new file, not a change to an existing one`);
  }
  if (!changed.some(([, f]) => f === `contributions/${latest}`)) fail("this PR doesn't add a contribution");
  if (n === 0) fail("0000.zkey is made by the coordinator");
  const prev = await check(path.join(CONTRIB_DIR, nameFor(n - 1)));
  const next = await check(path.join(CONTRIB_DIR, latest));
  extends_(prev, next, latest);
  print(next);
  console.log(`\n✔ ${latest} is a valid new contribution by "${next[next.length - 1].name}"`);
} else if (args[0] === "--all") {
  let prev = null;
  for (const k of keys) {
    const c = await check(path.join(CONTRIB_DIR, k));
    if (prev) extends_(prev, c, k);
    else if (c.length) fail("0000.zkey must have no contributions");
    prev = c;
  }
  print(prev);
  console.log(`\n✔ All ${keys.length} keys verified; each builds on the one before.`);
} else {
  const c = await check(path.join(CONTRIB_DIR, keys[keys.length - 1]));
  print(c);
  console.log(`\n✔ Latest key verified (${c.length} contributions).`);
}
process.exit(0);
