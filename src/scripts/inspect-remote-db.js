const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: '72.60.99.32',
    port: 3306,
    user: 'root',
    password: '@saba2025@',
    database: 'saba-ecom',
  });

  const [categories] = await connection.query('SELECT * FROM category');
  console.log('Categories count:', categories.length);
  console.log('Category sample:', categories[0]);

  const [products] = await connection.query('SELECT * FROM product LIMIT 2');
  console.log('Product sample:', products[0]);

  const [images] = await connection.query('SELECT * FROM product_image LIMIT 5');
  console.log('Product image sample:', images);

  const [variants] = await connection.query('SELECT * FROM variant_product LIMIT 3');
  console.log('Variant product sample:', variants);

  const [pSizes] = await connection.query('SELECT * FROM p_size LIMIT 5');
  console.log('p_size sample:', pSizes);

  const [pColors] = await connection.query('SELECT * FROM p_color LIMIT 5');
  console.log('p_color sample:', pColors);

  const [inventory] = await connection.query('SELECT * FROM inventory LIMIT 5');
  console.log('inventory sample:', inventory);

  await connection.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
