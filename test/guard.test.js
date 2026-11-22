import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ANSWER_LIMIT, CALL_LIMIT, COOKIE, createGuard } from '../server/guard.js';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bolo-guard-'));

test('only the exact code is accepted', () => {
  const dir = tempDir();
  const guard = createGuard(dir);
  const code = fs.readFileSync(path.join(dir, 'access-code'), 'utf8');
  assert.ok(guard.validCode(code));
  for (const bad of [undefined, '', code.slice(1), `${code}x`, 'x'.repeat(code.length), 'ह'.repeat(code.length)]) {
    assert.equal(guard.validCode(bad), false);
  }
  assert.equal(guard.codeFromCookie(`a=1; ${COOKIE}=${code}`), code);
});

test('calls stop at the limit, survive a restart, and can be refunded', () => {
  const dir = tempDir();
  const guard = createGuard(dir);
  for (let i = 0; i < CALL_LIMIT; i++) assert.ok(guard.takeCall());
  assert.equal(guard.takeCall(), false);
  assert.equal(createGuard(dir).takeCall(), false);
  guard.refundCall();
  assert.ok(guard.takeCall());
});

test('answers have their own limit', () => {
  const guard = createGuard(tempDir());
  for (let i = 0; i < ANSWER_LIMIT; i++) assert.ok(guard.takeAnswer());
  assert.equal(guard.takeAnswer(), false);
  assert.ok(guard.takeCall());
});

test('a damaged counter refuses', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'usage.json'), '{}');
  assert.equal(createGuard(dir).takeCall(), false);
});
