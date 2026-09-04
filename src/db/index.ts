import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// prepare: false — required by transaction-mode connection poolers (the
// production target), harmless locally. One driver, one behaviour in both
// environments, so the approval flow's transaction semantics never differ
// between dev and prod.
const client = postgres(url, { prepare: false });

export const db = drizzle(client, { schema });
