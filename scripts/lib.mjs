// Shared helpers for the Vesper phase-2 ceremony.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";

// In GitHub Actions, show failures as annotations.
if (process.env.CI) {
  process.on("uncaughtException", (e) => { console.log(`::error::${e?.message || e}`); console.error(e); process.exit(1); });
  process.on("unhandledRejection", (e) => { console.log(`::error::${e?.message || e}`); console.error(e); process.exit(1); });
}

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const R1CS = path.join(ROOT, "circuit", "transaction2.r1cs");
export const CONTRIB_DIR = path.join(ROOT, "contributions");
export const ATTEST_DIR = path.join(ROOT, "attestations");
export const FINAL_DIR = path.join(ROOT, "final");

// Phase 1: the public Perpetual Powers of Tau (PSE / Ethereum Foundation), response 0080:
// 80 contributors, truncated to 2^15 points and prepared for phase 2. It extends the Hermez
// file (whose old download links now return 403). The first time it's used (the Start
// ceremony Action) the whole file is checked with `snarkjs powersoftau verify`, and its hash
// is pinned in phase1/ptau.json; every later use must match that pinned hash.
export const PTAU = {
  url: "https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_15.ptau",
  file: path.join(ROOT, "ptau", "ppot_0080_15.ptau"),
  pinFile: path.join(ROOT, "phase1", "ptau.json"),
};

/** Path of the ptau to use. DEV_PTAU=<file> is only for dry runs and is never accepted by CI. */
export function ptauPath() {
  if (process.env.DEV_PTAU) {
    console.warn(`!! DRY RUN: using ${process.env.DEV_PTAU} instead of the public phase-1 file`);
    return process.env.DEV_PTAU;
  }
  return PTAU.file;
}

export function fileHash(file, algo) {
  const h = crypto.createHash(algo);
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(1 << 20);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest("hex");
}

/**
 * Downloads the phase-1 file if missing and checks it against the pinned hash.
 * With { pin: true } and no pin yet (Start ceremony only), fully verifies it and pins it.
 */
export async function ensurePtau({ pin = false } = {}) {
  if (process.env.DEV_PTAU) return ptauPath();
  if (process.env.CI && process.env.DEV_PTAU) throw new Error("DEV_PTAU is not allowed in CI");
  if (!fs.existsSync(PTAU.file)) {
    fs.mkdirSync(path.dirname(PTAU.file), { recursive: true });
    console.log(`Downloading phase-1 file (36 MB) from ${PTAU.url}`);
    const res = await fetch(PTAU.url).catch((e) => ({ ok: false, status: e.message }));
    if (!res.ok) throw new Error(`phase-1 download failed: ${PTAU.url} -> ${res.status}`);
    fs.writeFileSync(PTAU.file + ".part", Buffer.from(await res.arrayBuffer()));
    fs.renameSync(PTAU.file + ".part", PTAU.file);
  }
  const got = fileHash(PTAU.file, "blake2b512");
  if (fs.existsSync(PTAU.pinFile)) {
    const pinned = JSON.parse(fs.readFileSync(PTAU.pinFile, "utf8")).blake2b;
    if (got !== pinned) {
      fs.rmSync(PTAU.file);
      throw new Error(`phase-1 file doesn't match the pinned hash in phase1/ptau.json (got ${got.slice(0, 16)}...), deleted it`);
    }
    console.log("Phase-1 file matches the pinned hash ✔");
    return PTAU.file;
  }
  if (!pin) throw new Error("phase-1 file isn't pinned yet: run the Start ceremony Action first");
  console.log("Verifying every contribution in the phase-1 file (several minutes) ...");
  const log = [];
  const logger = { info: (m) => log.push(String(m)), warn: (m) => log.push("WARN " + m), error: (m) => log.push("ERROR " + m), debug() {} };
  const ok = await snarkjs.powersOfTau.verify(PTAU.file, logger);
  fs.mkdirSync(path.dirname(PTAU.pinFile), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(PTAU.pinFile), "verify-log.txt"), log.join("\n") + "\n");
  if (!ok) throw new Error("phase-1 file FAILED snarkjs powersoftau verify (see phase1/verify-log.txt)");
  fs.writeFileSync(PTAU.pinFile, JSON.stringify({ url: PTAU.url, blake2b: got, verifiedWith: "snarkjs 0.7.6 powersoftau verify", date: new Date().toISOString() }, null, 2) + "\n");
  console.log(`Phase-1 file verified and pinned: blake2b ${got.slice(0, 32)}...`);
  return PTAU.file;
}

/** ["0000.zkey", "0001.zkey", ...] sorted. */
export function listZkeys(dir = CONTRIB_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}\.zkey$/.test(f))
    .sort();
}

export const numberOf = (f) => Number(path.basename(f).slice(0, 4));
export const nameFor = (n) => String(n).padStart(4, "0") + ".zkey";

/**
 * Fully verifies a zkey against the circuit and phase 1 (every contribution in its chain).
 * Returns { ok, contributions: [{ index, name, hash }] }.
 */
export async function verifyZkey(zkeyFile, ptau = ptauPath()) {
  const contributions = [];
  const logger = {
    info(msg) {
      const m = /^contribution #(\d+) (.*):\n([\s\S]*)$/.exec(String(msg));
      if (m) contributions.push({ index: Number(m[1]), name: m[2].trim(), hash: m[3].replace(/\s+/g, "") });
    },
    warn: (m) => console.warn("  snarkjs:", m),
    error: (m) => console.error("  snarkjs:", m),
    debug() {},
  };
  const ok = await snarkjs.zKey.verifyFromR1cs(R1CS, ptau, zkeyFile, logger);
  contributions.sort((a, b) => a.index - b.index); // snarkjs logs newest first
  return { ok: Boolean(ok), contributions };
}

export const short = (h) => h.match(/.{1,8}/g).slice(0, 4).join(" ") + " …";
