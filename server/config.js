import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* tests run without keys */ }

export const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

export function agentId() {
  try { return readJSON('agent/agent.json').app_id; } catch { return null; }
}
