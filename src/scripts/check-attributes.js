const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: '72.60.99.32',
    port: 3306,
    user: 'root',
    password: '@saba2025@',
    database: 'saba-ecom',
  });

  const [colors] = await connection.query('SELECT * FROM color');
  console.log('Colors:', colors);

  const [sizes] = await connection.query('SELECT * FROM size');
  console.log('Sizes:', sizes);

  const [fabrics] = await connection.query('SELECT * FROM fabric');
  console.log('Fabrics:', fabrics);

  const [category] = await connection.query('SELECT * FROM category');
  console.log('Categories:', category);

  await connection.end();
}

main().catch(console.error);
