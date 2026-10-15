import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import fs from "fs";
import path from "path";

type Row = {
  flow: string;
  title: string;
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
  durationMs: number;
  error?: string;
};

class ValidationReporter implements Reporter {
  private rows: Row[] = [];
  private startedAt = new Date();

  onBegin(_config: FullConfig, _suite: Suite) {
    this.startedAt = new Date();
    fs.mkdirSync("reports", { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent?.project()?.name || "chromium";
    const flow =
      test.titlePath().find((t) => t && !t.includes(".spec.")) ||
      test.parent?.title ||
      "general";
    this.rows.push({
      flow: String(flow),
      title: test.title,
      status: result.status,
      durationMs: result.duration,
      error: result.error?.message?.split("\n")[0],
    });
    void project;
  }

  async onEnd(result: FullResult) {
    const endedAt = new Date();
    const passed = this.rows.filter((r) => r.status === "passed").length;
    const failed = this.rows.filter((r) => r.status === "failed" || r.status === "timedOut").length;
    const skipped = this.rows.filter((r) => r.status === "skipped").length;
    const total = this.rows.length;

    const byFlow = new Map<string, Row[]>();
    for (const row of this.rows) {
      const list = byFlow.get(row.flow) || [];
      list.push(row);
      byFlow.set(row.flow, list);
    }

    const payload = {
      title: "CropGuard 2.0 Regression Validation Report",
      generatedAt: endedAt.toISOString(),
      startedAt: this.startedAt.toISOString(),
      durationMs: endedAt.getTime() - this.startedAt.getTime(),
      status: result.status,
      summary: { total, passed, failed, skipped },
      flows: [...byFlow.entries()].map(([name, tests]) => ({
        name,
        passed: tests.filter((t) => t.status === "passed").length,
        failed: tests.filter((t) => t.status === "failed" || t.status === "timedOut").length,
        tests,
      })),
      environment: {
        baseURL: process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.E2E_PORT || "5055"}`,
        node: process.version,
        database: process.env.DATABASE_URL ? "configured" : "missing",
      },
    };

    fs.writeFileSync("reports/validation-report.json", JSON.stringify(payload, null, 2));

    const rowsHtml = this.rows
      .map(
        (r) => `<tr class="${r.status}">
        <td>${escapeHtml(r.flow)}</td>
        <td>${escapeHtml(r.title)}</td>
        <td><span class="badge ${r.status}">${r.status}</span></td>
        <td>${r.durationMs} ms</td>
        <td>${escapeHtml(r.error || "")}</td>
      </tr>`,
      )
      .join("\n");

    const flowCards = [...byFlow.entries()]
      .map(([name, tests]) => {
        const ok = tests.every((t) => t.status === "passed" || t.status === "skipped");
        return `<div class="card ${ok ? "ok" : "bad"}">
          <h3>${escapeHtml(name)}</h3>
          <p>${tests.filter((t) => t.status === "passed").length}/${tests.length} passed</p>
        </div>`;
      })
      .join("\n");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>CropGuard 2.0 Validation Report</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #f6f3eb; color: #17241c; }
  header { padding: 28px 32px; background: #0f6b43; color: white; }
  header h1 { margin: 0 0 6px; font-size: 28px; }
  main { padding: 24px 32px 48px; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 16px 0 24px; }
  .stat { background: white; border-radius: 12px; padding: 16px; border: 1px solid #e4ddd0; }
  .stat b { display: block; font-size: 28px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: white; border-radius: 12px; padding: 14px; border: 1px solid #e4ddd0; }
  .card.ok { border-color: #0f6b43; }
  .card.bad { border-color: #9d2c2c; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 14px; vertical-align: top; }
  th { background: #eef6f1; }
  .badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .badge.passed { background: #e5f6ec; color: #0f6b43; }
  .badge.failed, .badge.timedOut { background: #fde8e8; color: #9d2c2c; }
  .badge.skipped { background: #fff3d6; color: #8a5a10; }
  .meta { color: #5c6b62; font-size: 14px; }
</style>
</head>
<body>
<header>
  <h1>CropGuard 2.0 Regression Validation Report</h1>
  <div class="meta">Generated ${payload.generatedAt} · overall ${payload.status} · ${payload.environment.baseURL}</div>
</header>
<main>
  <div class="stats">
    <div class="stat"><b>${total}</b><span>Total tests</span></div>
    <div class="stat"><b>${passed}</b><span>Passed</span></div>
    <div class="stat"><b>${failed}</b><span>Failed</span></div>
    <div class="stat"><b>${skipped}</b><span>Skipped</span></div>
  </div>
  <h2>Flows</h2>
  <div class="grid">${flowCards}</div>
  <h2>All results</h2>
  <table>
    <thead><tr><th>Flow</th><th>Test</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</main>
</body>
</html>`;

    fs.writeFileSync("reports/validation-report.html", html);
    console.log(`\nValidation report: ${path.resolve("reports/validation-report.html")}`);
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default ValidationReporter;
