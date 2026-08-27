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
    SELECT 'channels' t, count(*) c, max(updated_at) mx FROM channels WHERE updated_at > now() - interval '3 hours'
    UNION ALL SELECT 'videos', count(*), max(first_seen_at) FROM videos WHERE first_seen_at > now() - interval '3 hours'
    UNION ALL SELECT 'video_meta', count(*), max(changed_at) FROM video_meta WHERE changed_at > now() - interval '3 hours'
    UNION ALL SELECT 'snapshots', count(*), max(fetched_at) FROM snapshots WHERE fetched_at > now() - interval '3 hours'
  `);
  console.log(JSON.stringify(r.rows, null, 2));
  await client.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
