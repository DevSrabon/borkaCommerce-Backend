const https = require('https');

https.get('https://media.sabaalwadi.com/saba-media/product_files/1782232880061-652333169.webp', (res) => {
  console.log('Status code:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  console.log('Content-Length:', res.headers['content-length']);
}).on('error', console.error);
