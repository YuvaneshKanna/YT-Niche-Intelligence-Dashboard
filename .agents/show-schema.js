const fs = require('fs');
const path = require('path');
const { Client } = require('@neondatabase/serverless');

const text = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const env = {};
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length > 1) v = v.slice(1, -1);
  env[m[1]] = v;
}

(async () => {
  const client = new Client(env.DATABASE_URL_UNPOOLED);
  await client.connect();
  const r = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  let lastTable = '';
  for (const row of r.rows) {
    if (row.table_name !== lastTable) { console.log('\n' + row.table_name + ':'); lastTable = row.table_name; }
    console.log('  ' + row.column_name + ' (' + row.data_type + ')');
  }
  await client.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
