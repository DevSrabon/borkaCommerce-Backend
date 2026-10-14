const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: '72.60.99.32',
    port: 3306,
    user: 'root',
    password: '@saba2025@',
    database: 'saba-ecom',
  });

  const [settings] = await connection.query('SELECT * FROM website_settings');
  console.log('Website settings:', JSON.stringify(settings, null, 2));

  const [banners] = await connection.query('SELECT * FROM banner');
  console.log('Banners:', JSON.stringify(banners, null, 2));

  const [colorImgs] = await connection.query('SELECT * FROM color_image LIMIT 5');
  console.log('Color images:', JSON.stringify(colorImgs, null, 2));

  await connection.end();
}

main().catch(console.error);
