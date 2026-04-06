import { join } from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = join(import.meta.dir, "fixtures/pdfs/heirachical-reasoning-model-p6.pdf");
const doc = await getDocument(pdfPath).promise;

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  let full = "";
  for (const item of content.items) {
    if ("str" in item) {
      full += item.str;
      if (!item.str.endsWith(" ")) full += " ";
    }
  }
  console.log(`--- Page ${i} (${full.length} chars) ---`);
  console.log(full.slice(0, 500));
  console.log("...");

  // Search for "behavior where"
  const idx = full.toLowerCase().indexOf("behavior where");
  if (idx !== -1) {
    console.log(`\nFOUND "behavior where" at index ${idx}`);
    console.log("Context:", JSON.stringify(full.slice(idx, idx + 120)));
  }
}
