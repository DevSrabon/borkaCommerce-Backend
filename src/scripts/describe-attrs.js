const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: '72.60.99.32',
    port: 3306,
    user: 'root',
    password: '@saba2025@',
    database: 'saba-ecom',
  });

  const [sizeCols] = await connection.query('DESCRIBE size');
  console.log('size cols:', sizeCols);

  const [colorCols] = await connection.query('DESCRIBE color');
  console.log('color cols:', colorCols);

  const [sizes] = await connection.query('SELECT * FROM size');
  console.log('all sizes:', sizes);

  const [colors] = await connection.query('SELECT * FROM color');
  console.log('all colors:', colors);

  await connection.end();
}

main().catch(console.error);
