export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
  pageNumber: number;
}

export interface SearchResult {
  found: true;
  boundingRect: Rect;
  rects: Rect[];
  /** The raw text extracted from the PDF at the match location */
  matchedText: string;
  /** Characters in the matched text that are non-standard (ligatures, special unicode, etc.) */
  oddCharacters: string[];
}

export interface SearchFailure {
  found: false;
}

export type FindResult = SearchResult | SearchFailure;

// Printable ASCII + common whitespace; anything outside this is "odd"
const NORMAL_CHARS = /^[\x20-\x7E\t\n\r]$/;

function detectOddCharacters(text: string): string[] {
  const odd = new Set<string>();
  for (const ch of text) {
    if (!NORMAL_CHARS.test(ch)) odd.add(ch);
  }
  return [...odd];
}

// Common Unicode ligatures → their ASCII expansions
const LIGATURES: Record<string, string> = {
  "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl",
  "\ufb03": "ffi", "\ufb04": "ffl", "\ufb06": "st",
};

/** Expand ligatures and lowercase */
function expandAndLower(text: string): string {
  let out = "";
  for (const ch of text) {
    const lig = LIGATURES[ch];
    out += lig ?? ch;
  }
  return out.toLowerCase();
}

/**
 * Search for exact text across all pages of a PDF document.
 * Returns position data with character quality info, or a failure result.
 *
 * - Case-insensitive
 * - Whitespace-normalized (all whitespace collapsed to single space)
 * - Works across PDF text items that may split words arbitrarily
 */
export async function findTextInPDF(
  pdfDocument: { numPages: number; getPage: (n: number) => Promise<any> },
  searchText: string,
): Promise<FindResult> {
  // Strip all whitespace from needle for whitespace-insensitive matching
  const needle = expandAndLower(searchText).replace(/\s+/g, "");
  if (needle.length === 0) return { found: false };

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const { items } = await page.getTextContent();

    // Concatenate text items, tracking their byte ranges in raw text
    let raw = "";
    const ranges: { start: number; end: number; item: any }[] = [];
    for (const item of items) {
      if (!("str" in item)) continue;
      ranges.push({ start: raw.length, end: raw.length + item.str.length, item });
      raw += item.str;
      if (!item.str.endsWith(" ")) raw += " ";
    }

    // Build a whitespace-stripped, ligature-expanded, lowercased version of raw,
    // tracking each output char back to its position in raw
    let stripped = "";
    const strippedToRaw: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      const lig = LIGATURES[ch];
      if (lig) {
        for (const c of lig) {
          stripped += c.toLowerCase();
          strippedToRaw.push(i);
        }
      } else if (/\s/.test(ch)) {
        // skip whitespace
      } else {
        stripped += ch.toLowerCase();
        strippedToRaw.push(i);
      }
    }

    const idx = stripped.indexOf(needle);
    if (idx === -1) continue;

    const end = idx + needle.length;
    // Map back to raw indices for rect calculation
    const rawIdx = strippedToRaw[idx];
    const rawEnd = end < strippedToRaw.length ? strippedToRaw[end] : raw.length;
    const matched = ranges.filter((r) => r.start < rawEnd && r.end > rawIdx);
    if (!matched.length) continue;

    // Convert PDF item coords (origin: bottom-left) → viewport coords (origin: top-left)
    const toRect = (r: {
      left: number; top: number; width: number; height: number;
    }): Rect => ({
      x1: r.left,
      y1: r.top,
      x2: r.left + r.width,
      y2: r.top + r.height,
      width: viewport.width,
      height: viewport.height,
      pageNumber: pageNum,
    });

    const rects = matched.map(({ item, start }) => {
      const [, , , , x, y] = item.transform;
      const h = item.height || Math.abs(item.transform[3]) || 10;
      const itemLen = item.str.length;
      if (itemLen === 0) return toRect({ left: x, top: viewport.height - y - h, width: item.width, height: h });

      // Clip to the portion of the item that is actually within the match (using raw indices)
      const matchStart = Math.max(0, rawIdx - start);
      const matchEnd = Math.min(itemLen, rawEnd - start);
      const charWidth = item.width / itemLen;
      const left = x + matchStart * charWidth;
      const width = (matchEnd - matchStart) * charWidth;
      return toRect({ left, top: viewport.height - y - h, width, height: h });
    });

    const x1 = Math.min(...rects.map((r) => r.x1));
    const y1 = Math.min(...rects.map((r) => r.y1));
    const x2 = Math.max(...rects.map((r) => r.x2));
    const y2 = Math.max(...rects.map((r) => r.y2));

    const matchedText = raw.slice(rawIdx, rawEnd);
    const oddCharacters = detectOddCharacters(matchedText);

    return {
      found: true,
      boundingRect: { x1, y1, x2, y2, width: viewport.width, height: viewport.height, pageNumber: pageNum },
      rects,
      matchedText,
      oddCharacters,
    };
  }

  return { found: false };
}

/**
 * Generate a URL hash fragment that encodes a text highlight.
 * When appended to a PDF viewer URL, navigating to it will scroll to and highlight the text.
 *
 * Format: #highlight=<base64url-encoded-query>
 */
export function createHighlightLink(baseUrl: string, searchText: string): string {
  return `${baseUrl}#highlight=${encodeURIComponent(searchText)}`;
}

/**
 * Parse a highlight link hash fragment back into a search query.
 * Returns null if the hash doesn't contain a valid highlight.
 */
export function parseHighlightLink(hash: string): string | null {
  const match = hash.match(/^#?highlight=(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
