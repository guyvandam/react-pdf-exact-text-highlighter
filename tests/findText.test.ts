import { describe, test, expect } from "bun:test";
import { join } from "path";
import { existsSync } from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { findTextInPDF } from "../src/index";

const FIXTURES = join(import.meta.dir, "fixtures");
const MANUAL_EXPECTATIONS_PATH = join(FIXTURES, "expectations.json");
const AI_RUNS_DIR = join(FIXTURES, "ai-runs");

type Expectation = {
  pdf: string;
  query: string;
  shouldFind: boolean;
  note?: string;
};

type LoadedExpectation = Expectation & {
  source: string;
};

function isBaseExpectation(value: any): value is Expectation {
  return Boolean(
    value &&
    typeof value.pdf === "string" &&
    typeof value.query === "string" &&
    typeof value.shouldFind === "boolean",
  );
}

function isManualExpectation(value: any): value is Expectation {
  return isBaseExpectation(value) && !("runId" in value) && !("prompt" in value);
}

async function loadExpectationFile(path: string, source: string): Promise<LoadedExpectation[]> {
  const raw = await Bun.file(path).json();
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(isBaseExpectation)
    .map((exp) => ({
      ...exp,
      source,
    }));
}

async function loadAllExpectations(): Promise<LoadedExpectation[]> {
  const loaded: LoadedExpectation[] = [];

  if (await Bun.file(MANUAL_EXPECTATIONS_PATH).exists()) {
    const raw = await Bun.file(MANUAL_EXPECTATIONS_PATH).json();
    if (Array.isArray(raw)) {
      loaded.push(
        ...raw
          .filter(isManualExpectation)
          .map((exp) => ({
            ...exp,
            source: "manual",
          })),
      );
    }
  }

  if (existsSync(AI_RUNS_DIR)) {
    const aiFiles = await Array.fromAsync(new Bun.Glob("*/expectations.json").scan(AI_RUNS_DIR));
    for (const relativePath of aiFiles.sort()) {
      const runId = relativePath.split("/")[0]!;
      const fullPath = join(AI_RUNS_DIR, relativePath);
      loaded.push(...await loadExpectationFile(fullPath, `ai:${runId}`));
    }
  }

  return loaded;
}

const expectations = await loadAllExpectations();
const docCache = new Map<string, Promise<any>>();

describe("findTextInPDF expectations", () => {
  for (const exp of expectations) {
    const label = `${exp.source} ${exp.shouldFind ? "FIND" : "MISS"}: "${exp.query.slice(0, 60)}..."`;

    test(label, async () => {
      const pdfPath = join(FIXTURES, "pdfs", exp.pdf);
      if (!docCache.has(pdfPath)) {
        docCache.set(pdfPath, getDocument(pdfPath).promise);
      }
      const doc = await docCache.get(pdfPath)!;
      const result = await findTextInPDF(doc, exp.query);

      if (exp.shouldFind) {
        expect(result.found).toBe(true);
        if (result.found) {
          expect(result.rects.length).toBeGreaterThan(0);
        }
      } else {
        expect(result.found).toBe(false);
      }
    });
  }
});
