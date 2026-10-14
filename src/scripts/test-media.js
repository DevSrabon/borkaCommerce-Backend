const https = require('https');

function testUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      console.log(`URL: ${url} -> Status: ${res.statusCode}`);
      resolve(res.statusCode);
    }).on('error', (err) => {
      console.log(`URL: ${url} -> Error: ${err.message}`);
      resolve(null);
    });
  });
}

async function main() {
  await testUrl('https://media.sabaalwadi.com/product_files/1761763355767-718539367.webp');
  await testUrl('https://sabaalwadi.com/product_files/1761763355767-718539367.webp');
}

main();
