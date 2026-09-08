/**
 * Wraps the artifact-authored console into a standalone document for the web app.
 *
 * console/front-office-console.html is authored as a fragment, because the Artifact tool
 * supplies the doctype/head/body skeleton at publish time. Served by Next it needs a real
 * document. One source, two envelopes — run after editing the console.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "console/front-office-console.html";
const DST = "public/console.html";
const MARK = '\n<div class="shell">';

const src = readFileSync(SRC, "utf8");
const at = src.indexOf(MARK);
if (at === -1) {
  console.error(`Could not find the page body marker in ${SRC}`);
  process.exit(1);
}

const head = src.slice(0, at);
const body = src.slice(at + 1);

const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;

writeFileSync(DST, doc);
console.log(`wrapped ${SRC} -> ${DST}`);
