# AI Citation Tests

## Setup

1. Drop PDFs into `tests/fixtures/pdfs/`
2. Write prompts in `tests/fixtures/prompts/*.md`

## Generate

```bash
bun run generate-ai-tests
bun run generate-ai-tests --provider claude --model opus
bun run generate-ai-tests --provider codex --model gpt-5.4
```

The generator does not append into the manual expectations file anymore. Each AI generation writes a new artifact tree under `tests/fixtures/ai-runs/<runId>/`.

## Output Layout

Each run gets its own folder and top-level `expectations.json` in the same shape as the manual file:

```json
[
  {
    "pdf": "example.pdf",
    "query": "exact snippet to search",
    "shouldFind": true
  }
]
```

Inside the run folder:

- `run.json` — run metadata
- `summary.json` — aggregate counts
- `expectations.json` — all expectations for that AI run
- `<pdf-name>/<prompt-name>/trajectory.jsonl` — raw agent event stream
- `<pdf-name>/<prompt-name>/stderr.txt` — subprocess stderr
- `<pdf-name>/<prompt-name>/response.md` — final assistant response
- `<pdf-name>/<prompt-name>/citations.json` — parsed citation calls/results
- `<pdf-name>/<prompt-name>/expectations.json` — expectations for that single PDF × prompt

## Agent Loop

For each PDF × prompt, the script spawns either Claude Code or Codex.

Claude Code:

```bash
claude -p --verbose --output-format stream-json \
  --model opus \
  --mcp-config .mcp.json \
  --strict-mcp-config \
  --system-prompt "..." \
  --allowed-tools mcp__pdf-cite__cite \
  --permission-mode bypassPermissions \
  --no-session-persistence \
  "<prompt text>"
```

Codex:

```bash
codex --dangerously-bypass-approvals-and-sandbox exec --json \
  --model gpt-5.4 \
  --cd . \
  --ephemeral \
  -c 'mcp_servers.pdf-cite.command="bun"' \
  -c 'mcp_servers.pdf-cite.args=["mcp/server.ts"]' \
  -c 'mcp_servers.pdf-cite.env={PDF_VIEWER_BASE_URL="http://localhost:3456"}' \
  "<prompt text plus PDF context>"
```

Both providers use the same local `cite` MCP server. The script captures the raw provider output, parses every `cite` call/result, and writes normalized expectations for the run.

## Verify

```bash
bun test
```

The test suite runs:

1. `tests/fixtures/expectations.json` as the manual baseline
2. every `tests/fixtures/ai-runs/*/expectations.json` file

## Notes

- The manual harness still writes only to `tests/fixtures/expectations.json`
- AI runs are isolated, so old generations remain reproducible and diffable
- If a citation misses (`shouldFind: false`), inspect that prompt folder’s `trajectory.jsonl` and `citations.json`
