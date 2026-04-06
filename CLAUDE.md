# PDF Text Search

## Setup

```bash
bun install
```

## Running the Test Harness

```bash
bun harness
```

Opens at **http://localhost:3456**

### Usage

1. Drop PDF files into `tests/fixtures/pdfs/`
2. Select a PDF from the sidebar dropdown
3. Select text in the PDF viewer and pick a highlight color
4. The highlight is automatically saved as a test expectation in `tests/fixtures/expectations.json`
5. Click a highlight in the sidebar to scroll to it (with halo animation)
6. Click **Link** to copy a shareable URL that navigates directly to that highlight

### Highlight Links

Open a link like:

```
http://localhost:3456?pdf=my-file.pdf#highlight=<encoded-text>
```

This auto-loads the PDF, finds the text, scrolls to it, and plays a halo animation.

## Running Tests

```bash
bun test
```

## Project Structure

- `src/index.ts` — Core package: `findTextInPDF`, `createHighlightLink`, `parseHighlightLink`
- `app/` — Test harness (Bun server + React frontend)
- `tests/fixtures/pdfs/` — PDF files for testing
- `tests/fixtures/expectations.json` — Manual baseline expectations from the harness
- `tests/fixtures/ai-runs/` — Per-run AI-generated expectations and raw trajectories
