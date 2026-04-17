const { Client } = require('pg');

const client = new Client({
    user: 'avnadmin',
    password: 'AVNS_AazIL3hwPdF-kj732bR',
    host: 'pg-387773d7-neighbroo.k.aivencloud.com',
    port: 24625,
    database: 'defaultdb',
    ssl: {
        rejectUnauthorized: false
    }
});

async function test() {
    try {
        await client.connect();
        console.log('✅ Connected successfully!');
        const res = await client.query('SELECT NOW()');
        console.log('Current time:', res.rows[0].now);
        await client.end();
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        console.error('Full error:', err);
    }
}

test();