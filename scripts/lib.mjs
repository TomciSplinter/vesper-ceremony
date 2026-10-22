// Shared helpers for the Vesper phase-2 ceremony.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const R1CS = path.join(ROOT, "circuit", "transaction2.r1cs");
export const CONTRIB_DIR = path.join(ROOT, "contributions");
export const ATTEST_DIR = path.join(ROOT, "attestations");
export const FINAL_DIR = path.join(ROOT, "final");

// Phase 1: the public Hermez / Polygon powers of tau (54 contributors + beacon),
// 2^15 points. Hash published in the snarkjs README.
export const PTAU = {
  url: "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_15.ptau",
  file: path.join(ROOT, "ptau", "powersOfTau28_hez_final_15.ptau"),
  blake2b:
    "982372c867d229c236091f767e703253249a9b432c1710b4f326306bfa2428a1" +
    "7b06240359606cfe4d580b10a5a1f63fbed499527069c18ae17060472969ae6e",
};

/** Path of the ptau to use. DEV_PTAU=<file> is only for dry runs and is never accepted by CI. */
export function ptauPath() {
  if (process.env.DEV_PTAU) {
    console.warn(`!! DRY RUN: using ${process.env.DEV_PTAU} instead of the public Hermez ptau`);
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

/** Downloads the Hermez ptau if missing and checks it byte for byte against the published hash. */
export async function ensurePtau() {
  if (process.env.DEV_PTAU) return ptauPath();
  if (!fs.existsSync(PTAU.file)) {
    fs.mkdirSync(path.dirname(PTAU.file), { recursive: true });
    console.log(`Downloading phase-1 file (36 MB) from ${PTAU.url}`);
    const res = await fetch(PTAU.url);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    fs.writeFileSync(PTAU.file + ".part", Buffer.from(await res.arrayBuffer()));
    fs.renameSync(PTAU.file + ".part", PTAU.file);
  }
  const got = fileHash(PTAU.file, "blake2b512");
  if (got !== PTAU.blake2b) {
    fs.rmSync(PTAU.file);
    throw new Error(`phase-1 file has the wrong hash (${got.slice(0, 16)}...), deleted it`);
  }
  console.log("Phase-1 file matches the published Hermez hash ✔");
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
