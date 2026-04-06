# react-pdf-exact-text-highlighter

Exact text search utilities for PDFs, plus an MCP server for verifying and linking citations against real PDF text.

## Install

```bash
bun add react-pdf-exact-text-highlighter
```

Peer dependency:

```bash
bun add pdfjs-dist
```

## Library usage

```ts
import { findTextInPDF } from "react-pdf-exact-text-highlighter";
```

## MCP server

Run the MCP server directly with Bun:

```bash
bun x react-pdf-exact-text-highlighter-mcp
```

Or invoke the installed server file from your own app if you need an absolute path.

## Publish

```bash
bun publish
```
