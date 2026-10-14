const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: '72.60.99.32',
    port: 3306,
    user: 'root',
    password: '@saba2025@',
    database: 'saba-ecom',
  });

  const [blogs] = await connection.query('SELECT * FROM blogs LIMIT 2');
  console.log('Blog sample:', JSON.stringify(blogs[0], null, 2));

  const [blogMedia] = await connection.query('SELECT * FROM blog_media LIMIT 5');
  console.log('Blog media sample:', JSON.stringify(blogMedia, null, 2));

  await connection.end();
}

main().catch(console.error);
