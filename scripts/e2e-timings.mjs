import { readFile } from "node:fs/promises";

const file = process.argv[2] ?? "playwright-report/results.json";
let report;
try {
  report = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  console.error(`Cannot read ${file}: ${error.message}`);
  console.error("Run npm run test:e2e first to generate the timing report.");
  process.exit(1);
}

const rows = [];
function visit(suite) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      for (const [attempt, result] of test.results.entries()) {
        if (result.status === "skipped") continue;
        rows.push({
          project: test.projectName,
          title: spec.title,
          seconds: result.duration / 1000,
          status: result.status,
          attempt: attempt + 1,
        });
      }
    }
  }
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of report.suites) visit(suite);

console.log(`Suite wall time: ${(report.stats.duration / 1000).toFixed(1)}s`);
console.log("Browser totals are summed test time; parallel tests overlap.");
for (const project of new Set(rows.map((row) => row.project))) {
  const tests = rows.filter((row) => row.project === project);
  const seconds = tests.reduce((sum, row) => sum + row.seconds, 0);
  console.log(
    `${project}: ${seconds.toFixed(1)}s across ${tests.length} attempts`,
  );
}
console.log("\nSlowest test attempts:");
for (const row of rows.sort((a, b) => b.seconds - a.seconds).slice(0, 15)) {
  console.log(
    `${row.seconds.toFixed(1)}s [${row.project}] ${row.status} (attempt ${row.attempt}) ${row.title}`,
  );
}
