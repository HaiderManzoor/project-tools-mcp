#!/usr/bin/env node

/**
 * project-tools-mcp
 *
 * MCP server that provides handy project utilities for Cursor:
 *   - file_stats    → line counts and file counts by language
 *   - todo_scan     → find TODO / FIXME / HACK comments
 *   - dep_check     → list dependencies and flag outdated ones
 *   - git_summary   → recent commits, current branch, changed files
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const server = new McpServer({
  name: "project-tools-mcp",
  version: "1.0.0",
});

// ── Helpers ──────────────────────────────────────────────────────

function run(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", timeout: 15000, maxBuffer: 1024 * 1024 }).trim();
  } catch {
    return null;
  }
}

function walkFiles(dir, ext, maxDepth = 5, depth = 0) {
  if (depth > maxDepth) return [];
  let results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "vendor") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(walkFiles(full, ext, maxDepth, depth + 1));
      } else if (!ext || full.endsWith(ext)) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}

function countLines(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8").split("\n").length;
  } catch {
    return 0;
  }
}

// ── Tool: file_stats ─────────────────────────────────────────────

server.tool(
  "file_stats",
  "Count files and lines of code grouped by language/extension",
  { directory: z.string().describe("Absolute path to the project directory") },
  async ({ directory }) => {
    const files = walkFiles(directory);
    const stats = {};

    for (const f of files) {
      const ext = path.extname(f) || "(no ext)";
      if (!stats[ext]) stats[ext] = { files: 0, lines: 0 };
      stats[ext].files++;
      stats[ext].lines += countLines(f);
    }

    const sorted = Object.entries(stats)
      .sort((a, b) => b[1].lines - a[1].lines)
      .map(([ext, s]) => `${ext.padEnd(12)} ${String(s.files).padStart(5)} files  ${String(s.lines).padStart(8)} lines`)
      .join("\n");

    const totalFiles = Object.values(stats).reduce((a, s) => a + s.files, 0);
    const totalLines = Object.values(stats).reduce((a, s) => a + s.lines, 0);

    return {
      content: [{
        type: "text",
        text: `File statistics for ${directory}\n${"─".repeat(45)}\n${sorted}\n${"─".repeat(45)}\nTotal: ${totalFiles} files, ${totalLines} lines`,
      }],
    };
  }
);

// ── Tool: todo_scan ──────────────────────────────────────────────

server.tool(
  "todo_scan",
  "Scan project for TODO, FIXME, HACK, and XXX comments",
  { directory: z.string().describe("Absolute path to the project directory") },
  async ({ directory }) => {
    const patterns = ["TODO", "FIXME", "HACK", "XXX"];
    const files = walkFiles(directory);
    const results = [];

    for (const f of files) {
      try {
        const lines = fs.readFileSync(f, "utf-8").split("\n");
        lines.forEach((line, i) => {
          for (const p of patterns) {
            if (line.includes(p)) {
              const rel = path.relative(directory, f);
              results.push(`${rel}:${i + 1}  ${line.trim()}`);
              break;
            }
          }
        });
      } catch {}
    }

    if (results.length === 0) {
      return { content: [{ type: "text", text: "No TODO/FIXME/HACK/XXX comments found." }] };
    }

    return {
      content: [{
        type: "text",
        text: `Found ${results.length} items:\n\n${results.slice(0, 50).join("\n")}${results.length > 50 ? `\n\n... and ${results.length - 50} more` : ""}`,
      }],
    };
  }
);

// ── Tool: dep_check ──────────────────────────────────────────────

server.tool(
  "dep_check",
  "List project dependencies from package.json, go.mod, or requirements.txt",
  { directory: z.string().describe("Absolute path to the project directory") },
  async ({ directory }) => {
    const sections = [];

    // package.json
    const pkgPath = path.join(directory, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const deps = Object.entries(pkg.dependencies || {}).map(([k, v]) => `  ${k}: ${v}`);
        const devDeps = Object.entries(pkg.devDependencies || {}).map(([k, v]) => `  ${k}: ${v}`);
        sections.push(`package.json\n  Dependencies (${deps.length}):\n${deps.join("\n")}`);
        if (devDeps.length) sections.push(`  Dev Dependencies (${devDeps.length}):\n${devDeps.join("\n")}`);
      } catch {}
    }

    // go.mod
    const goModPath = path.join(directory, "go.mod");
    if (fs.existsSync(goModPath)) {
      try {
        const gomod = fs.readFileSync(goModPath, "utf-8");
        const requires = gomod.match(/require \([\s\S]*?\)/g);
        if (requires) {
          const deps = requires[0].split("\n").filter(l => l.trim() && !l.includes("require") && !l.includes(")")).map(l => `  ${l.trim()}`);
          sections.push(`go.mod\n  Dependencies (${deps.length}):\n${deps.join("\n")}`);
        }
      } catch {}
    }

    // requirements.txt
    const reqPath = path.join(directory, "requirements.txt");
    if (fs.existsSync(reqPath)) {
      try {
        const reqs = fs.readFileSync(reqPath, "utf-8").split("\n").filter(l => l.trim() && !l.startsWith("#"));
        sections.push(`requirements.txt\n  Dependencies (${reqs.length}):\n${reqs.map(r => `  ${r}`).join("\n")}`);
      } catch {}
    }

    if (sections.length === 0) {
      return { content: [{ type: "text", text: "No dependency files found (package.json, go.mod, requirements.txt)." }] };
    }

    return { content: [{ type: "text", text: sections.join("\n\n") }] };
  }
);

// ── Tool: git_summary ────────────────────────────────────────────

server.tool(
  "git_summary",
  "Show current branch, recent commits, and changed files",
  { directory: z.string().describe("Absolute path to the project directory") },
  async ({ directory }) => {
    const branch = run("git rev-parse --abbrev-ref HEAD", directory);
    if (!branch) {
      return { content: [{ type: "text", text: "Not a git repository or git not available." }] };
    }

    const log = run('git log --oneline -10 --pretty=format:"%h %s (%cr)"', directory) || "(no commits)";
    const status = run("git status --short", directory) || "(clean working tree)";
    const remoteUrl = run("git remote get-url origin", directory) || "(no remote)";

    return {
      content: [{
        type: "text",
        text: [
          `Git Summary for ${directory}`,
          `${"─".repeat(45)}`,
          `Branch:  ${branch}`,
          `Remote:  ${remoteUrl}`,
          ``,
          `Recent commits:`,
          log,
          ``,
          `Working tree:`,
          status,
        ].join("\n"),
      }],
    };
  }
);

// ── Start ────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
