/** `pnpm ingest` — fakes the daily third-party metric sync. */
import { runIngest } from "@/server/services/ingest";

async function main() {
  const summary = await runIngest();
  console.log(
    `ingest ${summary.day}: ${summary.written} written, ${summary.skipped} skipped (already ingested today), ${summary.failed.length} failed of ${summary.total} tracked submissions`,
  );
  for (const f of summary.failed) {
    console.error(`  FAILED ${f.submissionId}: ${f.message}`);
  }
  process.exit(summary.failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
