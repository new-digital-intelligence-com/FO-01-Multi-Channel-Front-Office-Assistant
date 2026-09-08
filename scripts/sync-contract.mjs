/**
 * Copies the behaviour contract into the plugin so the skill ships a byte-identical copy.
 *
 * lib/core/contract.md is the original. The server reads it directly; the plugin gets this
 * copy. Run after editing the contract. `--check` fails instead of writing, for CI.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "lib/core/contract.md";
const DST = "plugin/skills/front-office/references/contract.md";

const src = readFileSync(SRC, "utf8");
let dst = null;
try { dst = readFileSync(DST, "utf8"); } catch {}

if (process.argv.includes("--check")) {
  if (src !== dst) {
    console.error(`DRIFT: ${DST} differs from ${SRC}. Run: npm run sync:contract`);
    process.exit(1);
  }
  console.log("contract in sync");
} else if (src === dst) {
  console.log("contract already in sync");
} else {
  writeFileSync(DST, src);
  console.log(`synced ${SRC} -> ${DST}`);
}
