#!/usr/bin/env bun
/**
 * MCP server exposing tools for loading PDF text and verifying/linking
 * text selections inside a PDF.
 *
 * Usage (stdio transport — launched by Claude Code or any MCP client):
 *   bun mcp/server.ts
 *
 * Usage (manual shared HTTP server):
 *   bun mcp/server.ts --transport http --port 3101
 *
 * The tool expects the LLM to have the PDF content in its context already
 * (via native PDF ingestion). It only needs a *path* to the PDF so it can
 * run findTextInPDF against the actual pdf.js representation.
 */

import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  isInitializeRequest,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { findTextInPDF } from "../src/index";

// Cache loaded documents so repeated tool calls on the same PDF are fast
const docCache = new Map<string, any>();

async function loadDoc(pdfPath: string) {
  if (docCache.has(pdfPath)) return docCache.get(pdfPath)!;
  const doc = await getDocument(pdfPath).promise;
  docCache.set(pdfPath, doc);
  return doc;
}

async function extractPdfText(doc: any, pageNumber?: number) {
  let text = "";
  const pageStart = pageNumber ?? 1;
  const pageEnd = pageNumber ?? doc.numPages;

  for (let p = pageStart; p <= pageEnd; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    text += `\n--- Page ${p} ---\n`;
    for (const item of items) {
      if ("str" in item) text += (item as any).str + " ";
    }
  }

  return text.trim();
}

function createServer() {
  const server = new Server(
    { name: "pdf-select", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "read_pdf_text",
        description:
          "Load readable text from a PDF path so the agent can inspect the document before citing. " +
          "Returns the extracted text as pdf.js sees it, with page separators.",
        inputSchema: {
          type: "object" as const,
          properties: {
            pdf_path: {
              type: "string",
              description: "Absolute path to the PDF file",
            },
            page_number: {
              type: "number",
              description: "Optional 1-based page number to extract instead of the full document",
            },
          },
          required: ["pdf_path"],
        },
      },
      {
        name: "cite",
        description:
          "Cite a text snippet from a PDF — verifies it exists and returns a highlight link. " +
          "Returns whether the text was found, the matched text, any odd characters " +
          "(ligatures, special unicode), and a clickable link that scrolls to and " +
          "highlights the text in the PDF viewer. If the text is not found, adjust " +
          "your snippet (check whitespace, special characters, or try a shorter excerpt) " +
          "and call again.",
        inputSchema: {
          type: "object" as const,
          properties: {
            pdf_path: {
              type: "string",
              description: "Absolute path to the PDF file",
            },
            text: {
              type: "string",
              description:
                "The exact text snippet to find in the PDF. Matching is case-insensitive " +
                "and whitespace-normalized. Ligatures (fi, fl, ff, etc.) are expanded automatically.",
            },
          },
          required: ["pdf_path", "text"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "read_pdf_text") {
      const { pdf_path, page_number } = request.params.arguments as {
        pdf_path: string;
        page_number?: number;
      };

      if (!pdf_path) {
        return { content: [{ type: "text", text: "pdf_path is required." }], isError: true };
      }

      try {
        const doc = await loadDoc(pdf_path);
        const text = await extractPdfText(doc, page_number);

        const payload = {
          pdfPath: pdf_path,
          pageCount: doc.numPages,
          pageNumber: page_number ?? null,
          text,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          structuredContent: payload,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }

    if (request.params.name !== "cite") {
      return { content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }], isError: true };
    }

    const { pdf_path, text } = request.params.arguments as { pdf_path: string; text: string };

    if (!pdf_path || !text) {
      return { content: [{ type: "text", text: "Both pdf_path and text are required." }], isError: true };
    }

    try {
      const doc = await loadDoc(pdf_path);
      const result = await findTextInPDF(doc, text);

      const payload = result.found
        ? {
            found: true,
            matchedText: result.matchedText,
            oddCharacters: result.oddCharacters,
            pageNumber: result.boundingRect.pageNumber,
            highlightLink: `pdf://${encodeURIComponent(text)}`,
          }
        : {
            found: false,
            queriedText: text,
          };

      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function jsonRpcError(status: number, message: string) {
  return json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  }, { status });
}

async function startHttpServer() {
  const port = Number(getArg("--port") || process.env.PDF_MCP_PORT || "3101");
  const mcpPath = getArg("--path") || process.env.PDF_MCP_PATH || "/mcp";
  const healthPath = getArg("--health-path") || process.env.PDF_MCP_HEALTH_PATH || "/health";
  const sessions = new Map<string, { server: Server; transport: WebStandardStreamableHTTPServerTransport }>();

  async function handleMcpRequest(request: Request) {
    const sessionId = request.headers.get("mcp-session-id")?.trim() || undefined;
    let session = sessionId ? sessions.get(sessionId) : undefined;
    let parsedBody: unknown;

    if (request.method === "POST") {
      try {
        parsedBody = await request.clone().json();
      } catch {
        return jsonRpcError(400, "Invalid JSON body");
      }
    }

    if (!session) {
      if (request.method !== "POST" || !isInitializeRequest(parsedBody)) {
        return jsonRpcError(400, "No valid MCP session. Initialize with POST first.");
      }

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          if (session) sessions.set(id, session);
        },
        onsessionclosed: async (id) => {
          const active = sessions.get(id);
          sessions.delete(id);
          if (active) await active.server.close().catch(() => {});
        },
      });
      const server = createServer();
      session = { server, transport };
      transport.onclose = () => {
        const id = transport.sessionId;
        if (!id) return;
        sessions.delete(id);
        server.close().catch(() => {});
      };
      await server.connect(transport);
    }

    return session.transport.handleRequest(request, { parsedBody });
  }

  const httpServer = Bun.serve({
    port,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === healthPath) {
        return json({
          ok: true,
          service: "pdf-select",
          mcp_path: mcpPath,
          sessions: sessions.size,
          cached_pdfs: docCache.size,
        });
      }
      if (pathname === mcpPath) return handleMcpRequest(request);
      return new Response("Not found", { status: 404 });
    },
  });

  console.log(`[pdf-mcp] listening on http://127.0.0.1:${httpServer.port}${mcpPath}`);
  console.log(`[pdf-mcp] health at http://127.0.0.1:${httpServer.port}${healthPath}`);
}

const transport = getArg("--transport") || "stdio";

if (transport === "http") {
  await startHttpServer();
} else {
  const server = createServer();
  const stdio = new StdioServerTransport();
  await server.connect(stdio);
}
