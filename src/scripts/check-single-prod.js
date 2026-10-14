const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: '72.60.99.32',
    port: 3306,
    user: 'root',
    password: '@saba2025@',
    database: 'saba-ecom',
  });

  const productId = 449;
  const [product] = await connection.query('SELECT * FROM product WHERE p_id = ?', [productId]);
  console.log('Product 449:', product[0]);

  const [vp] = await connection.query('SELECT * FROM variant_product WHERE p_id = ?', [productId]);
  console.log('variant_product:', vp);

  const [sizes] = await connection.query(
    'SELECT ps.*, s.size_name_en, s.size_code FROM p_size ps JOIN size s ON ps.size_id = s.id WHERE ps.p_id = ?',
    [productId]
  );
  console.log('p_size:', sizes);

  const [colors] = await connection.query(
    'SELECT pc.*, c.color_name_en, c.color_code FROM p_color pc JOIN color c ON pc.color_id = c.id WHERE pc.p_id = ?',
    [productId]
  );
  console.log('p_color:', colors);

  const [colorImages] = await connection.query('SELECT * FROM color_image WHERE p_id = ?', [productId]);
  console.log('color_images count:', colorImages.length, colorImages.slice(0, 3));

  const [inv] = await connection.query('SELECT * FROM inventory WHERE i_p_id = ?', [productId]);
  console.log('inventory:', inv);

  await connection.end();
}

main().catch(console.error);
