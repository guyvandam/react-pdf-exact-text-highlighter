import index from "./index.html";
import { join } from "path";

const PDFS_DIR = join(import.meta.dir, "../tests/fixtures/pdfs");
const MANUAL_EXPECTATIONS_PATH = join(import.meta.dir, "../tests/fixtures/expectations.json");

function isManualExpectation(value: any) {
  return Boolean(
    value &&
    typeof value.pdf === "string" &&
    typeof value.query === "string" &&
    typeof value.shouldFind === "boolean" &&
    !("runId" in value) &&
    !("prompt" in value),
  );
}

Bun.serve({
  port: 3456,
  routes: {
    "/": index,
    "/api/pdfs": async () => {
      const dir = await Array.fromAsync(new Bun.Glob("*.pdf").scan(PDFS_DIR));
      return Response.json(dir.sort());
    },
    "/api/pdfs/:name": async (req) => {
      const file = Bun.file(join(PDFS_DIR, req.params.name));
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      return new Response(file, { headers: { "Content-Type": "application/pdf" } });
    },
    "/api/expectations": {
      GET: async () => {
        const file = Bun.file(MANUAL_EXPECTATIONS_PATH);
        if (!(await file.exists())) return Response.json([]);
        const raw = await file.json();
        return Response.json(Array.isArray(raw) ? raw.filter(isManualExpectation) : []);
      },
      POST: async (req) => {
        const body = await req.json();
        const file = Bun.file(MANUAL_EXPECTATIONS_PATH);
        const existingRaw = (await file.exists()) ? await file.json() : [];
        const existing = Array.isArray(existingRaw) ? existingRaw.filter(isManualExpectation) : [];
        existing.push(body);
        await Bun.write(MANUAL_EXPECTATIONS_PATH, JSON.stringify(existing, null, 2));
        return Response.json({ ok: true, count: existing.length });
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Test harness running at http://localhost:3456");
