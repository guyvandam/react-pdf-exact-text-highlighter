#!/usr/bin/env bun
/**
 * Generate citation test cases by having an LLM answer prompts about PDFs
 * using the `cite` MCP tool, then save a full per-run artifact tree.
 *
 * Output layout:
 *   tests/fixtures/ai-runs/<runId>/
 *     expectations.json
 *     summary.json
 *     run.json
 *     <pdf-name>/
 *       <prompt-name>/
 *         prompt.md
 *         system-prompt.txt
 *         invocation.json
 *         trajectory.jsonl
 *         stderr.txt
 *         response.md
 *         citations.json
 *         expectations.json
 *         result.json
 *
 * Usage:
 *   bun tests/generate-ai-citation-tests.ts
 *   bun tests/generate-ai-citation-tests.ts --provider claude --model opus
 *   bun tests/generate-ai-citation-tests.ts --provider codex --model gpt-5.4
 */

import { join } from "path";
import { mkdirSync, existsSync } from "fs";

const FIXTURES = join(import.meta.dir, "fixtures");
const PDFS_DIR = join(FIXTURES, "pdfs");
const PROMPTS_DIR = join(FIXTURES, "prompts");
const MANUAL_EXPECTATIONS_PATH = join(FIXTURES, "expectations.json");
const AI_RUNS_DIR = join(FIXTURES, "ai-runs");
const MCP_CONFIG = join(import.meta.dir, "../.mcp.json");
const PROJECT_ROOT = join(import.meta.dir, "..");
const PDF_VIEWER_BASE_URL = "http://localhost:3456";

type Provider = "claude" | "codex";
type Expectation = {
  pdf: string;
  query: string;
  shouldFind: boolean;
  note?: string;
};
type Citation = {
  text: string;
  found: boolean;
  highlightLink?: string;
  pageNumber?: number;
};

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

async function writeJson(path: string, value: unknown) {
  await Bun.write(path, JSON.stringify(value, null, 2));
}

function readFlagValue(args: string[], index: number, flag: string): [string, number] {
  const arg = args[index]!;
  if (arg.startsWith(`${flag}=`)) {
    return [arg.slice(flag.length + 1), index];
  }

  const value = args[index + 1];
  if (!value) {
    console.error(`Missing value for ${flag}`);
    process.exit(1);
  }
  return [value, index + 1];
}

function parseCliArgs(args: string[]): { provider: Provider; model?: string } {
  let provider: Provider = "claude";
  let model: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === "--help" || arg === "-h") {
      console.log("Usage:");
      console.log("  bun tests/generate-ai-citation-tests.ts [--provider claude|codex] [--model <name>]");
      process.exit(0);
    }

    if (arg === "--provider" || arg.startsWith("--provider=")) {
      const [value, nextIndex] = readFlagValue(args, i, "--provider");
      if (value !== "claude" && value !== "codex") {
        console.error(`Unsupported provider: ${value}`);
        process.exit(1);
      }
      provider = value;
      i = nextIndex;
      continue;
    }

    if (arg === "--model" || arg.startsWith("--model=")) {
      const [value, nextIndex] = readFlagValue(args, i, "--model");
      model = value;
      i = nextIndex;
      continue;
    }

    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }

  return { provider, model };
}

const cli = parseCliArgs(Bun.argv.slice(2));
const PROVIDER = cli.provider;
const MODEL = cli.model ?? (PROVIDER === "codex" ? "gpt-5.4" : "opus");
const CREATED_AT = new Date().toISOString();
const runId = `${CREATED_AT.replace(/[:.]/g, "-")}-${PROVIDER}-${MODEL}`;
const RUN_DIR = join(AI_RUNS_DIR, runId);

ensureDir(PROMPTS_DIR);
ensureDir(AI_RUNS_DIR);
ensureDir(RUN_DIR);

const promptFiles = await Array.fromAsync(new Bun.Glob("*.md").scan(PROMPTS_DIR));
if (promptFiles.length === 0) {
  console.error("No prompt files found in tests/fixtures/prompts/");
  console.error("Create .md files there with the prompts you want the LLM to answer.");
  process.exit(1);
}

const prompts: { name: string; text: string }[] = [];
for (const file of promptFiles.sort()) {
  const text = await Bun.file(join(PROMPTS_DIR, file)).text();
  prompts.push({ name: file.replace(".md", ""), text: text.trim() });
}

const pdfs = (await Array.fromAsync(new Bun.Glob("*.pdf").scan(PDFS_DIR))).sort();
if (pdfs.length === 0) {
  console.error("No PDFs found in tests/fixtures/pdfs/");
  process.exit(1);
}

const manualExpectationsCount = (await Bun.file(MANUAL_EXPECTATIONS_PATH).exists())
  ? ((await Bun.file(MANUAL_EXPECTATIONS_PATH).json()) as unknown[]).length
  : 0;

console.log(`Run: ${runId}`);
console.log(`Provider: ${PROVIDER}`);
console.log(`Model: ${MODEL}`);
console.log(`Run dir: ${RUN_DIR}`);
console.log(`PDFs: ${pdfs.length}`);
console.log(`Prompts: ${prompts.map((p) => p.name).join(", ")}`);
console.log(`Total generations: ${pdfs.length * prompts.length}`);
console.log(`Manual expectations: ${manualExpectationsCount}\n`);

await writeJson(join(RUN_DIR, "run.json"), {
  runId,
  createdAt: CREATED_AT,
  provider: PROVIDER,
  model: MODEL,
  pdfs,
  prompts: prompts.map((prompt) => prompt.name),
});

function parseClaudeOutput(stdout: string): {
  responseText: string;
  citations: Citation[];
} {
  const citations: Citation[] = [];
  let responseText = "";
  const toolUseMap = new Map<string, number>();

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;

    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "tool_use" && block.name === "mcp__pdf-cite__cite") {
          const idx = citations.length;
          citations.push({ text: block.input?.text ?? "", found: false });
          toolUseMap.set(block.id, idx);
        }
      }
    }

    if (event.type === "user" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "tool_result" && block.tool_use_id) {
          const idx = toolUseMap.get(block.tool_use_id);
          if (idx !== undefined) {
            try {
              const content = Array.isArray(block.content) ? block.content[0]?.text : block.content;
              const parsed = JSON.parse(content);
              citations[idx].found = parsed.found ?? false;
              if (parsed.highlightLink) citations[idx].highlightLink = parsed.highlightLink;
              if (parsed.pageNumber) citations[idx].pageNumber = parsed.pageNumber;
            } catch {}
          }
        }
      }
    }

    if (event.type === "result") {
      responseText = event.result ?? "";
    }
  }

  return { responseText, citations };
}

function isCitationToolName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  return name === "cite" || name.endsWith("__cite") || name.includes("pdf-cite");
}

function tryParseJson(value: unknown): any {
  if (typeof value !== "string") return value;

  const candidates = [value.trim()];
  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(value.slice(firstBrace, lastBrace + 1).trim());
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        try {
          return JSON.parse(parsed);
        } catch {
          return parsed;
        }
      }
      return parsed;
    } catch {}
  }

  return undefined;
}

function applyCitationResult(citation: Citation, rawResult: unknown) {
  const parsed = tryParseJson(rawResult);
  if (!parsed || typeof parsed !== "object") return;

  citation.found = parsed.found ?? false;
  if (typeof parsed.highlightLink === "string") citation.highlightLink = parsed.highlightLink;
  if (typeof parsed.pageNumber === "number") citation.pageNumber = parsed.pageNumber;
}

function extractCodexMcpResult(rawResult: unknown): unknown {
  if (!rawResult || typeof rawResult !== "object") {
    return rawResult;
  }

  if (Array.isArray((rawResult as any).content)) {
    const text = (rawResult as any).content
      .filter((block: any) => block?.type === "text" && typeof block.text === "string")
      .map((block: any) => block.text)
      .join("\n");

    return text || rawResult;
  }

  return rawResult;
}

function parseCodexOutput(stdout: string): {
  responseText: string;
  citations: Citation[];
} {
  const citations: Citation[] = [];
  const toolUseMap = new Map<string, number>();
  const responseParts: string[] = [];

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;

    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if ((event.type === "item.started" || event.type === "item.completed") && event.item?.type === "mcp_tool_call") {
      const item = event.item;

      if (item.tool === "cite" && item.server === "pdf-cite" && item.id && event.type === "item.started") {
        const idx = citations.length;
        citations.push({ text: item.arguments?.text ?? "", found: false });
        toolUseMap.set(item.id, idx);
        continue;
      }

      if (item.tool === "cite" && item.server === "pdf-cite" && item.id && event.type === "item.completed") {
        const idx = toolUseMap.get(item.id);
        if (idx !== undefined && item.result) {
          applyCitationResult(citations[idx]!, extractCodexMcpResult(item.result));
        }
        continue;
      }
    }

    if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
      responseParts.push(event.item.text);
      continue;
    }

    const item = event.type === "response_item" ? event.payload : undefined;
    if (!item) continue;

    if (item.type === "function_call" && isCitationToolName(item.name) && item.call_id) {
      const args = tryParseJson(item.arguments);
      const idx = citations.length;
      citations.push({ text: args?.text ?? "", found: false });
      toolUseMap.set(item.call_id, idx);
      continue;
    }

    if (item.type === "function_call_output" && item.call_id) {
      const idx = toolUseMap.get(item.call_id);
      if (idx !== undefined) {
        applyCitationResult(citations[idx]!, item.output);
      }
      continue;
    }

    if (item.type === "message" && item.role === "assistant" && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (block.type === "output_text" && typeof block.text === "string") {
          responseParts.push(block.text);
        }
      }
    }
  }

  return {
    responseText: responseParts.join("\n"),
    citations,
  };
}

function buildSystemPrompt(provider: Provider, pdfPath: string): string {
  const readInstructions = provider === "claude"
    ? [
        `Before answering, use the Read tool to read the PDF file at: ${pdfPath}`,
        "The Read tool natively supports PDFs and will show you the document contents.",
      ]
    : [
        "Before answering, call the `read_pdf_text` MCP tool on the PDF path so you can inspect the document.",
      ];

  return [
    "You are answering questions about a PDF document.",
    ...readInstructions,
    "You MUST call the cite tool for EVERY factual claim. Do NOT construct highlight links yourself.",
    "The cite tool will verify the text exists in the PDF and return a highlightLink.",
    "After each cite call, include the returned highlightLink in your response as a markdown link: [short description](highlightLink)",
    "If a cite call returns found: false, try a shorter or slightly different snippet and call cite again.",
    "Do NOT skip the cite tool.",
    "Do NOT use web search.",
    `The PDF path is: ${pdfPath}`,
  ].join("\n");
}

function buildClaudeArgs(systemPrompt: string, promptText: string): string[] {
  return [
    "claude",
    "-p",
    "--verbose",
    "--output-format", "stream-json",
    "--model", MODEL,
    "--mcp-config", MCP_CONFIG,
    "--strict-mcp-config",
    "--system-prompt", systemPrompt,
    "--allowed-tools", "Read,mcp__pdf-cite__cite",
    "--permission-mode", "bypassPermissions",
    "--no-session-persistence",
    promptText,
  ];
}

function buildCodexArgs(systemPrompt: string, promptText: string): string[] {
  const combinedPrompt = [
    systemPrompt,
    "",
    "Question to answer:",
    promptText,
  ].join("\n");

  return [
    "codex",
    "--dangerously-bypass-approvals-and-sandbox",
    "exec",
    "--json",
    "--model", MODEL,
    "--cd", PROJECT_ROOT,
    "--skip-git-repo-check",
    "--ephemeral",
    "-c", 'mcp_servers.pdf-cite.command="bun"',
    "-c", 'mcp_servers.pdf-cite.args=["mcp/server.ts"]',
    "-c", `mcp_servers.pdf-cite.env={PDF_VIEWER_BASE_URL="${PDF_VIEWER_BASE_URL}"}`,
    combinedPrompt,
  ];
}

function parseAgentOutput(provider: Provider, stdout: string) {
  return provider === "codex" ? parseCodexOutput(stdout) : parseClaudeOutput(stdout);
}

function sanitizeArtifactText(text: string, pdfName: string): string {
  const pdfPath = join(PDFS_DIR, pdfName);
  const relativePdfPath = join("tests", "fixtures", "pdfs", pdfName);
  const homeDir = process.env.HOME;

  let sanitized = text;
  sanitized = sanitized.replaceAll(pdfPath, relativePdfPath);
  sanitized = sanitized.replaceAll(encodeURIComponent(pdfPath), encodeURIComponent(relativePdfPath));
  sanitized = sanitized.replaceAll(MCP_CONFIG, join("<PROJECT_ROOT>", ".mcp.json"));
  sanitized = sanitized.replaceAll(PROJECT_ROOT, "<PROJECT_ROOT>");
  if (homeDir) {
    sanitized = sanitized.replaceAll(homeDir, "<HOME>");
  }
  return sanitized;
}

function sanitizeArtifactJson<T>(value: T, pdfName: string): T {
  return JSON.parse(sanitizeArtifactText(JSON.stringify(value), pdfName));
}

const runExpectations: Expectation[] = [];
let testNum = 0;
const totalTests = pdfs.length * prompts.length;

for (const pdfName of pdfs) {
  const pdfPath = join(PDFS_DIR, pdfName);
  const pdfDir = join(RUN_DIR, pdfName);
  ensureDir(pdfDir);

  for (const prompt of prompts) {
    testNum++;
    console.log(`\n--- [${testNum}/${totalTests}] ${pdfName} × ${prompt.name} ---`);

    const promptDir = join(pdfDir, prompt.name);
    ensureDir(promptDir);

    const systemPrompt = buildSystemPrompt(PROVIDER, pdfPath);
    const args = PROVIDER === "codex"
      ? buildCodexArgs(systemPrompt, prompt.text)
      : buildClaudeArgs(systemPrompt, prompt.text);

    await Bun.write(join(promptDir, "prompt.md"), `${prompt.text}\n`);
    await Bun.write(join(promptDir, "system-prompt.txt"), sanitizeArtifactText(systemPrompt, pdfName));
    await writeJson(join(promptDir, "invocation.json"), {
      provider: PROVIDER,
      model: MODEL,
      args: sanitizeArtifactJson(args, pdfName),
      pdf: pdfName,
      prompt: prompt.name,
      createdAt: CREATED_AT,
    });

    const proc = Bun.spawn(args, {
      cwd: PROJECT_ROOT,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]).then(([stdoutText, stderrText]) => [stdoutText as string, stderrText as string]);

    await Bun.write(join(promptDir, "trajectory.jsonl"), sanitizeArtifactText(stdout, pdfName));
    await Bun.write(join(promptDir, "stderr.txt"), sanitizeArtifactText(stderr, pdfName));

    let responseText = "";
    let citations: Citation[] = [];

    if (proc.exitCode === 0) {
      const parsed = parseAgentOutput(PROVIDER, stdout);
      responseText = parsed.responseText;
      citations = parsed.citations;
    }

    const promptExpectations = citations.map<Expectation>((citation) => ({
      pdf: pdfName,
      query: citation.text,
      shouldFind: citation.found,
    }));

    runExpectations.push(...promptExpectations);

    await Bun.write(join(promptDir, "response.md"), sanitizeArtifactText(responseText, pdfName));
    await writeJson(join(promptDir, "citations.json"), sanitizeArtifactJson(citations, pdfName));
    await writeJson(join(promptDir, "expectations.json"), promptExpectations);
    await writeJson(join(promptDir, "result.json"), {
      ok: proc.exitCode === 0,
      exitCode: proc.exitCode,
      citations: citations.length,
      found: citations.filter((citation) => citation.found).length,
      failed: citations.filter((citation) => !citation.found).length,
    });

    if (proc.exitCode !== 0) {
      console.error(`  FAILED (exit ${proc.exitCode})`);
      console.error(`  stderr: ${stderr.slice(0, 300)}`);
      continue;
    }

    console.log(`  Citations: ${promptExpectations.filter((exp) => exp.shouldFind).length}/${promptExpectations.length} found`);
  }
}

await writeJson(join(RUN_DIR, "expectations.json"), runExpectations);
await writeJson(join(RUN_DIR, "summary.json"), {
  runId,
  createdAt: CREATED_AT,
  provider: PROVIDER,
  model: MODEL,
  pdfs,
  prompts: prompts.map((prompt) => prompt.name),
  totalExpectations: runExpectations.length,
  found: runExpectations.filter((expectation) => expectation.shouldFind).length,
  failed: runExpectations.filter((expectation) => !expectation.shouldFind).length,
});

console.log(`\n=== Run complete: ${runId} ===`);
console.log(`Artifacts written to: ${RUN_DIR}`);
console.log(`Added ${runExpectations.length} expectations (${runExpectations.filter((expectation) => expectation.shouldFind).length} found, ${runExpectations.filter((expectation) => !expectation.shouldFind).length} failed)`);
console.log(`Run expectation file: ${join(RUN_DIR, "expectations.json")}`);
console.log("Run `bun test` to verify the manual expectations plus every AI run.");
