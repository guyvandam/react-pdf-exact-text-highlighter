import * as pdfjsLib from "pdfjs-dist";
(globalThis as any).pdfjsLib = pdfjsLib;

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  PdfLoader,
  PdfHighlighter,
  TextHighlight,
  AreaHighlight,
  useHighlightContainerContext,
  usePdfHighlighterContext,
  type IHighlight,
  type PdfHighlighterUtils,
} from "react-pdf-highlighter-extended";
import "react-pdf-highlighter-extended/dist/esm/style/PdfHighlighter.css";
import "react-pdf-highlighter-extended/dist/esm/style/TextHighlight.css";
import "react-pdf-highlighter-extended/dist/esm/style/AreaHighlight.css";
import "react-pdf-highlighter-extended/dist/esm/style/MouseSelection.css";
import "react-pdf-highlighter-extended/dist/esm/style/pdf_viewer.css";
import "./styles.css";
import { findTextInPDF, parseHighlightLink, createHighlightLink } from "../src/index";

// --- Types ---

type HighlightColor = "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "gray";
type ColoredHighlight = IHighlight & { color?: HighlightColor };

interface Expectation {
  pdf: string;
  query: string;
  shouldFind: boolean;
  note?: string;
}

// --- Colors ---

const HIGHLIGHT_COLORS: Record<HighlightColor, { bg: string; chip: string; border: string }> = {
  red:    { bg: "rgba(252,165,165,0.6)", chip: "#fee2e2", border: "#dc2626" },
  orange: { bg: "rgba(253,186,116,0.6)", chip: "#ffedd5", border: "#ea580c" },
  yellow: { bg: "rgba(255,226,143,0.6)", chip: "#fef9c3", border: "#ca8a04" },
  green:  { bg: "rgba(134,239,172,0.6)", chip: "#dcfce7", border: "#16a34a" },
  blue:   { bg: "rgba(147,197,253,0.6)", chip: "#dbeafe", border: "#2563eb" },
  purple: { bg: "rgba(196,181,253,0.6)", chip: "#ede9fe", border: "#7c3aed" },
  gray:   { bg: "rgba(156,163,175,0.35)", chip: "#f3f4f6", border: "#6b7280" },
};

// --- Highlight Container (renders each highlight in PDF) ---

function HighlightContainer({ onDelete, haloId }: { onDelete?: (id: string) => void; haloId?: string | null }) {
  const { highlight } = useHighlightContainerContext();
  const { setTip } = usePdfHighlighterContext();
  const colored = highlight as ColoredHighlight;
  const color = colored.color ?? "yellow";
  const bgColor = HIGHLIGHT_COLORS[color].bg;
  const isHalo = haloId === highlight.id;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = highlight.content?.text ?? "";
    setTip({
      position: highlight.position,
      content: (
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 8px", background: "#fff", borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
          <span style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
          {onDelete && (
            <button
              onClick={() => { onDelete(highlight.id); setTip(null); }}
              style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
            >Delete</button>
          )}
        </div>
      ),
    });
  };

  if (highlight.content?.image) return <AreaHighlight highlight={highlight} style={{ background: bgColor }} />;
  return (
    <div onMouseDown={handleMouseDown} className={isHalo ? "highlight-halo" : ""}>
      <TextHighlight highlight={highlight} style={{ background: bgColor }} />
    </div>
  );
}

// --- Selection Tip (shown when user selects text) ---

function SelectionTip({ onConfirm }: { onConfirm: (h: ColoredHighlight) => void }) {
  const { getCurrentSelection, setTip } = usePdfHighlighterContext();

  const confirm = useCallback((color: HighlightColor) => {
    const sel = getCurrentSelection();
    if (!sel?.content?.text) return;
    const h: ColoredHighlight = {
      id: crypto.randomUUID(),
      content: { ...sel.content, text: sel.content.text.trim() },
      position: sel.position,
      color,
    };
    onConfirm(h);
    setTip(null);
  }, [getCurrentSelection, onConfirm, setTip]);

  return (
    <div style={{ display: "flex", gap: 4, padding: "4px 8px", background: "#fff", borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
      {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((c) => (
        <button
          key={c}
          onClick={() => confirm(c)}
          title={c}
          style={{
            width: 20, height: 20, borderRadius: "50%",
            backgroundColor: HIGHLIGHT_COLORS[c].chip,
            border: `2px solid ${HIGHLIGHT_COLORS[c].border}`,
            cursor: "pointer", padding: 0,
          }}
        />
      ))}
    </div>
  );
}


// --- Main App ---

function App() {
  const [pdfs, setPdfs] = useState<string[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<ColoredHighlight[]>([]);
  const [expectations, setExpectations] = useState<Expectation[]>([]);
  const [haloId, setHaloId] = useState<string | null>(null);
  const [pendingHighlightQuery, setPendingHighlightQuery] = useState<string | null>(null);
  const utilsRef = useRef<PdfHighlighterUtils | null>(null);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    fetch("/api/pdfs").then(r => r.json()).then(setPdfs);
    fetch("/api/expectations").then(r => r.json()).then(setExpectations);

    // Parse highlight link from URL hash
    const query = parseHighlightLink(window.location.hash);
    if (query) {
      setPendingHighlightQuery(query);
      // Extract PDF name from URL params if present
      const params = new URLSearchParams(window.location.search);
      const pdf = params.get("pdf");
      if (pdf) setSelectedPdf(pdf);
    }
  }, []);

  // Reset highlights when switching PDFs
  useEffect(() => {
    setHighlights([]);
  }, [selectedPdf]);

  const addHighlight = useCallback((h: ColoredHighlight) => {
    setHighlights(prev => {
      if (prev.some(x => x.content?.text === h.content?.text)) return prev;
      return [...prev, h];
    });

    // Auto-append as test expectation
    if (selectedPdf && h.content?.text) {
      const expectation: Expectation = { pdf: selectedPdf, query: h.content.text, shouldFind: true };
      fetch("/api/expectations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expectation),
      });
      setExpectations(prev => [...prev, expectation]);
    }
  }, [selectedPdf]);

  const deleteHighlight = useCallback((id: string) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
  }, []);

  const scrollToHighlight = useCallback((h: ColoredHighlight) => {
    utilsRef.current?.scrollToHighlight(h);
    setHaloId(h.id);
    setTimeout(() => setHaloId(null), 2000);
  }, []);

  // When a PDF doc loads, check for pending highlight link query
  const onPdfDocumentLoad = useCallback(async (pdfDocument: any) => {
    pdfDocRef.current = pdfDocument;
    if (!pendingHighlightQuery) return;

    const result = await findTextInPDF(pdfDocument, pendingHighlightQuery);
    if (!result.found) return;

    const id = crypto.randomUUID();
    const h: ColoredHighlight = {
      id,
      content: { text: pendingHighlightQuery },
      position: {
        boundingRect: result.boundingRect,
        rects: result.rects,
        pageNumber: result.boundingRect.pageNumber,
      },
      color: "blue",
    };
    setHighlights([h]);
    setPendingHighlightQuery(null);
    // Scroll after a short delay to let the highlighter render
    setTimeout(() => {
      utilsRef.current?.scrollToHighlight(h);
      setHaloId(id);
      setTimeout(() => setHaloId(null), 2000);
    }, 500);
  }, [pendingHighlightQuery]);

  const showExpectationHighlight = useCallback(async (query: string) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;

    const result = await findTextInPDF(pdfDoc, query);
    if (!result.found) return;

    const id = crypto.randomUUID();
    const h: ColoredHighlight = {
      id,
      content: { text: query },
      position: {
        boundingRect: result.boundingRect,
        rects: result.rects,
        pageNumber: result.boundingRect.pageNumber,
      },
      color: "blue",
    };
    setHighlights(prev => {
      // Replace any existing highlight with the same text, or add new
      const filtered = prev.filter(x => x.content?.text !== query);
      return [...filtered, h];
    });
    setTimeout(() => {
      utilsRef.current?.scrollToHighlight(h);
      setHaloId(id);
      setTimeout(() => setHaloId(null), 2000);
    }, 100);
  }, []);

  const pdfExpectations = expectations.filter(e => e.pdf === selectedPdf);

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <h2>PDF Text Search</h2>
        <h3>Test Harness</h3>

        {/* PDF selector */}
        <div className="section">
          <label>PDF File</label>
          <select
            value={selectedPdf ?? ""}
            onChange={(e) => setSelectedPdf(e.target.value || null)}
            style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
          >
            <option value="">Select a PDF...</option>
            {pdfs.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {pdfs.length === 0 && (
            <p className="hint">Drop PDFs into <code>tests/fixtures/pdfs/</code></p>
          )}
        </div>

{/* Existing expectations for this PDF */}
        {pdfExpectations.length > 0 && (
          <div className="section">
            <label>Expectations ({pdfExpectations.length})</label>
            <div className="expectation-list">
              {pdfExpectations.map((e, i) => (
                <div
                  key={i}
                  className={`expectation-item ${e.shouldFind ? "expect-find" : "expect-miss"}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => showExpectationHighlight(e.query)}
                >
                  <span className="expect-badge">{e.shouldFind ? "FIND" : "MISS"}</span>
                  <span className="expect-query">"{e.query}"</span>
                  {e.note && <span className="expect-note">{e.note}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Highlights list */}
        <div className="section">
          <label>Highlights ({highlights.length})</label>
          <div className="highlight-list">
            {highlights.map((h) => (
              <div
                key={h.id}
                className="highlight-item"
                onClick={() => scrollToHighlight(h)}
              >
                <span
                  className="color-dot"
                  style={{ backgroundColor: HIGHLIGHT_COLORS[h.color ?? "yellow"].chip, borderColor: HIGHLIGHT_COLORS[h.color ?? "yellow"].border }}
                />
                <span className="highlight-text">{h.content?.text}</span>
                <button
                  className="btn-sm"
                  style={{ background: "#4f46e5", color: "#fff" }}
                  title="Copy highlight link"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!selectedPdf || !h.content?.text) return;
                    const link = createHighlightLink(
                      `${window.location.origin}?pdf=${encodeURIComponent(selectedPdf)}`,
                      h.content.text,
                    );
                    navigator.clipboard.writeText(link);
                  }}
                >Link</button>
                <button
                  className="delete-btn"
                  onClick={(e) => { e.stopPropagation(); deleteHighlight(h.id); }}
                >×</button>
              </div>
            ))}
            {highlights.length === 0 && selectedPdf && (
              <p className="hint">Select text in the PDF or use search above</p>
            )}
          </div>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="pdf-area">
        {selectedPdf ? (
          <PdfLoader document={`/api/pdfs/${selectedPdf}`} workerSrc="https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs">
            {(pdfDocument) => {
              // Trigger highlight link navigation when PDF loads
              if (pdfDocRef.current !== pdfDocument) onPdfDocumentLoad(pdfDocument);
              return (
                <PdfHighlighter
                  pdfDocument={pdfDocument}
                  highlights={highlights}
                  enableAreaSelection={(e) => e.altKey}
                  utilsRef={(utils) => { if (utils) utilsRef.current = utils; }}
                  selectionTip={<SelectionTip onConfirm={addHighlight} />}
                >
                  <HighlightContainer onDelete={deleteHighlight} haloId={haloId} />
                </PdfHighlighter>
              );
            }}
          </PdfLoader>
        ) : (
          <div className="empty-state">
            <p>Select a PDF from the sidebar to begin</p>
          </div>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
