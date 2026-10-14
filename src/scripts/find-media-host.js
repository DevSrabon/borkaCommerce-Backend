const http = require('http');
const https = require('https');

const paths = [
  'banner_files/1777189394199-394486986.webp',
  'product_files/1757967416930-354027406.jpg',
  'website_settings_files/1777029127576-390261898.png',
];

const bases = [
  'https://media.sabaalwadi.com/',
  'https://media.sabaalwadi.com/media/',
  'https://media.sabaalwadi.com/uploads/',
  'https://sabaalwadi.com/',
  'https://sabaalwadi.com/media/',
  'https://sabaalwadi.com/uploads/',
  'http://72.60.99.32/',
  'http://72.60.99.32/media/',
  'http://72.60.99.32/uploads/',
  'http://72.60.99.32:8000/',
  'http://72.60.99.32:5000/',
  'http://72.60.99.32:3000/',
];

function check(url) {
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
  for (const base of bases) {
    const url = base + paths[0];
    const res = await check(url);
    console.log(JSON.stringify(res));
  }
}

main();
