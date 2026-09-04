import { sql } from "drizzle-orm";
import { beforeEach } from "vitest";

import { db } from "@/db";

// Every test starts from an empty database. TRUNCATE is fast and resets
// everything the FK graph touches in one statement.
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE submission_metrics, submissions, campaigns, users CASCADE`,
  );
});
