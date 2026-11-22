// Writes the QR and link for judges. Usage: node scripts/make-qr.js https://<app>.up.railway.app
// Both files contain the access code, so they go in data/ (git-ignored) and the link is never printed.
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { ROOT } from '../server/config.js';

const base = process.argv[2];
if (!/^https:\/\/[a-z0-9-]+\.(trycloudflare\.com|up\.railway\.app)$/.test(base ?? '')) {
  console.error('Usage: node scripts/make-qr.js https://<public-tunnel>.trycloudflare.com');
  process.exit(1);
}
const link = `${base}/j/${fs.readFileSync(path.join(ROOT, 'data/access-code'), 'utf8').trim()}`;
await QRCode.toFile(path.join(ROOT, 'data/bolo-qr.png'), link, { width: 900, margin: 3, errorCorrectionLevel: 'M' });
fs.writeFileSync(path.join(ROOT, 'data/bolo-link.txt'), `${link}\n`, { mode: 0o600 });
// The presenter page, published as a private Artifact. Republish it to the same URL after every new QR.
const qr = await QRCode.toDataURL(link, { width: 900, margin: 3, errorCorrectionLevel: 'M' });
const page = fs.readFileSync(path.join(ROOT, 'scripts/qr-page.html'), 'utf8').replace('{{QR}}', qr);
fs.writeFileSync(path.join(ROOT, 'data/bolo-qr-page.html'), page, { mode: 0o600 });
console.log('Wrote data/bolo-qr.png, data/bolo-link.txt and data/bolo-qr-page.html');
