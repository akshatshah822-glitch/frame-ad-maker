import { loadEnvConfig } from "@next/env";
import { localPedagogyErrorMessage, parseLocalPedagogyRenderArgs, renderPedagogyBriefLocally } from "@/lib/pedagogy-local-renderer";

async function main() {
  loadEnvConfig(process.cwd());
  const args = parseLocalPedagogyRenderArgs(process.argv.slice(2));
  const result = await renderPedagogyBriefLocally(args);
  console.log(`Local pedagogy MP4: ${result.outputPath}`);
  console.log(`Timing audit CSV: ${result.auditPath}`);
  console.log(`Completed local render: ${result.rowCount} rows; ${result.qa.duration.toFixed(3)} seconds.`);
}

void main().catch((error) => {
  console.error(`Local pedagogy render failed: ${localPedagogyErrorMessage(error)}`);
  process.exitCode = 1;
});
