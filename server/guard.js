// Limits for the public link. State lives in data/, which is git-ignored and survives restarts.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ROOT } from './config.js';

export const CALL_LIMIT = 30;
// The call limit alone does not bound Anthropic spend: one caller can ask many questions, quickly.
export const ANSWER_LIMIT = 300;
export const COOKIE = 'bolo_code';

export function createGuard(dir = process.env.DATA_DIR ?? path.join(ROOT, 'data')) {
  fs.mkdirSync(dir, { recursive: true });
  const usageFile = path.join(dir, 'usage.json');
  const codeFile = path.join(dir, 'access-code');

  if (!fs.existsSync(codeFile)) fs.writeFileSync(codeFile, randomBytes(16).toString('base64url'), { mode: 0o600 });
  const code = fs.readFileSync(codeFile, 'utf8').trim();
  if (code.length < 20) throw new Error('data/access-code is too short. Delete it to generate a new one.');

  // Read on every use, so a manual reset needs no restart. An unreadable file throws, which refuses the call.
  const read = () => (fs.existsSync(usageFile) ? JSON.parse(fs.readFileSync(usageFile, 'utf8')) : { calls: 0, answers: 0 });
  const write = (usage) => {
    fs.writeFileSync(`${usageFile}.tmp`, JSON.stringify(usage), { mode: 0o600 });
    fs.renameSync(`${usageFile}.tmp`, usageFile);
  };

  // Synchronous, so two simultaneous requests cannot both take the last one.
  function take(name, limit) {
    const usage = read();
    if (!Number.isInteger(usage[name]) || usage[name] >= limit) return false;
    usage[name] += 1;
    write(usage);
    return true;
  }

  return {
    validCode(given) {
      const a = Buffer.from(String(given ?? ''));
      const b = Buffer.from(code);
      return a.length === b.length && timingSafeEqual(a, b);
    },
    codeFromCookie(header = '') {
      return header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    },
    takeCall: () => take('calls', CALL_LIMIT),
    takeAnswer: () => take('answers', ANSWER_LIMIT),
    refundCall() {
      const usage = read();
      usage.calls = Math.max(0, usage.calls - 1);
      write(usage);
    },
  };
}
