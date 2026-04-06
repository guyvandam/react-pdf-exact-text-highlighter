# Knowledge Log

## 🔍 Solutions

### PDF Text Search — Whitespace & Ligature Matching Fix

**Problem:** All 5 test cases in [`tests/findText.test.ts`](tests/findText.test.ts) were failing because `findTextInPDF` could not match query strings against extracted PDF text.

**Root Causes (2 bugs in [`src/index.ts`](src/index.ts#L46-L143)):**

1. **Whitespace mismatch** — The search needle was whitespace-normalized (`\s+` → single space) but the haystack (concatenated PDF text items) was **not** normalized. PDF text extraction via [pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist) produces irregular spacing — extra spaces around math variables (`cycle  k ,` instead of `cycle k,`), spaces before punctuation (`F ,` instead of `F,`), and double spaces between formatted elements. Simple whitespace collapsing (`\s+` → space) is insufficient because a space before punctuation (`k ,`) still won't match `k,`.

2. **Unicode ligature mismatch** — Browser text selection captures Unicode ligatures like `ﬁ` (U+FB01) as a single codepoint, but pdfjs extracts them as separate ASCII characters `fi`. So query `"ﬁxed"` never matches haystack `"fixed"`.

**Fix applied ([`src/index.ts`](src/index.ts#L37-L53)):**

- **Whitespace-free matching**: Both needle and haystack are completely stripped of all whitespace before comparison (not just collapsed). This makes matching fully whitespace-insensitive, which is appropriate for PDF text where whitespace is fundamentally unreliable.
- **Ligature expansion**: A `LIGATURES` map expands common Unicode ligatures (`ﬁ`→`fi`, `ﬂ`→`fl`, `ﬀ`→`ff`, `ﬃ`→`ffi`, `ﬄ`→`ffl`, `ﬆ`→`st`) to ASCII equivalents on both sides before matching.
- **Index mapping**: A `strippedToRaw` array maps each character in the stripped/expanded string back to its original position in the raw concatenated text, so highlight rectangle calculations remain accurate.

**Key insight:** PDF text extraction is inherently lossy with respect to whitespace and character encoding. Any robust text search over PDF content must normalize aggressively on both sides of the comparison while maintaining a mapping back to original coordinates for visual highlighting.

---

## 📦 Packages

### pdfjs-dist — Text Extraction Quirks

- **Whitespace is unreliable**: `getTextContent()` items have irregular spacing — math/formatted text gets extra spaces around variables and before punctuation. Don't assume the concatenated text has "normal" whitespace patterns.
- **Ligatures are not expanded**: pdfjs extracts ligature characters (like `ﬁ` U+FB01) as their component ASCII chars (`fi`), but text selected in a browser PDF viewer may preserve the original ligature codepoint. Always normalize ligatures when comparing browser-selected text against pdfjs-extracted text.
- **Text item boundaries are arbitrary**: PDF text items can split words at any point. The existing approach of concatenating items with space separators and tracking `{start, end, item}` ranges is sound — just ensure the search normalization accounts for the injected separator spaces.
