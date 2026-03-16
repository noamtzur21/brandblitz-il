/**
 * Load .env.local and .env before any other script reads process.env.
 * Must be imported first in worker entry points (ESM hoists imports).
 */
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();
