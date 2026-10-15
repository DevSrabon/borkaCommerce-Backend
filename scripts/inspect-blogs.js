const mysql = require('mysql2/promise');

async function main() {
  try {
    const conn = await mysql.createConnection({
      host: '72.60.99.32',
      port: 3306,
      user: 'root',
      password: '@saba2025@',
      database: 'saba-ecom'
    });

    const [bmDesc] = await conn.query('DESCRIBE blog_media');
    console.log('blog_media columns:', bmDesc.map(c => `${c.Field} (${c.Type})`));

    const [bmRows] = await conn.query('SELECT * FROM blog_media LIMIT 5');
    console.log('blog_media sample rows:', bmRows);

    const [bcDesc] = await conn.query('DESCRIBE blog_comments');
    console.log('\nblog_comments columns:', bcDesc.map(c => `${c.Field} (${c.Type})`));

    const [bcRows] = await conn.query('SELECT * FROM blog_comments LIMIT 5');
    console.log('blog_comments count:', bcRows.length);

    await conn.end();
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
