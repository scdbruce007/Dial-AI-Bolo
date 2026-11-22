import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Railway sets PORT, and gives the keys as variables. With no PORT we are on the Mac, using .env and data/.
export const CLOUD_PORT = process.env.PORT ? Number(process.env.PORT) : null;

try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* tests run without keys */ }

export const dataDir = () => process.env.DATA_DIR ?? path.join(ROOT, 'data');

export const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

export function agentId() {
  try { return readJSON('agent/agent.json').app_id; } catch { return null; }
}
