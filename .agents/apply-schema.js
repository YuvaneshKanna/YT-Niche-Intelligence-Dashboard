// Applies .agents/schema.sql to Neon. Uses DATABASE_URL_UNPOOLED (direct
// connection) — Neon's own guidance is that pooled (-pooler) connections
// don't support the session-level operations schema migrations need.
//
// Usage: node .agents/apply-schema.js

const fs = require('fs');
const path = require('path');
const { Client } = require('@neondatabase/serverless');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env.local');
  const text = fs.readFileSync(file, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length > 1) {
      v = v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
    env[m[1]] = v;
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const connectionString = env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error('DATABASE_URL_UNPOOLED not found in .env.local — run `vercel env pull` first.');
  }

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  const client = new Client(connectionString);
  await client.connect();
  try {
    await client.query(sql);
    console.log('Schema applied.');

    // Verify by reading back — don't trust a success response.
    const res = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    console.log('Tables now present: ' + res.rows.map(r => r.table_name).join(', '));
  } finally {
    await client.end();
  }
}

main().catch(e => {
  console.error('ERROR: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
