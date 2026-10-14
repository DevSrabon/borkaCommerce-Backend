const https = require('https');

https.get('https://media.sabaalwadi.com/', (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Body:', data.slice(0, 300)));
}).on('error', console.error);
