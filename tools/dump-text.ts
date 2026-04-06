/**
 * Dump raw text content from a PDF as pdf.js sees it.
 * Useful for understanding what text items exist and debugging search failures.
 *
 * Usage: bun tools/dump-text.ts <path-to-pdf> [page-number]
 */
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
GlobalWorkerOptions.workerSrc = "";

const pdfPath = process.argv[2];
const pageFilter = process.argv[3] ? parseInt(process.argv[3]) : null;

if (!pdfPath) {
  console.error("Usage: bun tools/dump-text.ts <path-to-pdf> [page-number]");
  process.exit(1);
}

const doc = await getDocument(pdfPath).promise;

for (let p = 1; p <= doc.numPages; p++) {
  if (pageFilter && p !== pageFilter) continue;

  const page = await doc.getPage(p);
  const { items } = await page.getTextContent();

  console.log(`\n=== Page ${p} ===`);
  let full = "";
  for (const item of items) {
    if (!("str" in item)) continue;
    const i = item as any;
    console.log(`  [${JSON.stringify(i.str)}]`);
    full += i.str + " ";
  }
  console.log(`\n--- Concatenated ---`);
  console.log(full);
}
