const https = require('https');
const http = require('http');

const file = 'blog_files/1777051032609-723842101.webp';
const file2 = 'banner_files/1769185578268-613556077.webp';

const hosts = [
  'https://media.sabaalwadi.com/',
  'https://media.sabaalwadi.com/media/',
  'https://media.sabaalwadi.com/uploads/',
  'https://media.sabaalwadi.com/public/',
  'https://media.sabaalwadi.com/storage/',
  'https://sabaalwadi.com/',
  'https://sabaalwadi.com/media/',
  'https://sabaalwadi.com/uploads/',
  'https://sabaalwadi.com/storage/',
  'https://api.sabaalwadi.com/',
  'https://api.sabaalwadi.com/media/',
  'https://api.sabaalwadi.com/uploads/',
  'http://72.60.99.32/',
  'http://72.60.99.32/media/',
  'http://72.60.99.32/uploads/',
  'http://72.60.99.32/storage/',
  'http://72.60.99.32:8080/',
  'http://72.60.99.32:8080/uploads/',
  'http://72.60.99.32:8080/media/',
];

async function check(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 3000 }, (res) => {
      resolve({ url, status: res.statusCode });
    });
    req.on('error', (err) => resolve({ url, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ url, error: 'timeout' }); });
  });
}

async function main() {
  for (const h of hosts) {
    const res = await check(h + file);
    if (res.status === 200) {
      console.log('FOUND 200!', res);
    } else {
      console.log(res);
    }
  }
}

main();
