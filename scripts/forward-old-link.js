// Optional: forwards the old laptop tunnel link (already shared on 22 Nov) to Railway while this Mac is online.
// The code in /j/<code> is passed along, and Railway still checks it.
import http from 'node:http';

const CLOUD = 'https://bolo-production-65e3b42a.up.railway.app';

http.createServer((req, res) => {
  const join = (req.url ?? '').match(/^\/j\/[\w-]+$/);
  res.writeHead(302, { location: `${CLOUD}${join ? join[0] : '/'}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  res.end();
}).listen(3002, '127.0.0.1', () => console.log('forwarding the old link to Railway'));
