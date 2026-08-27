// Replace one Code node's jsCode in an n8n workflow, straight from a local
// file. Avoids re-typing a large node body through a tool call, which is where
// truncation creeps in.
//
//   node .agents/push-node-code.js <workflowId> "<Node Name>" <path-to-js>
//
// Credentials come from the project's .mcp.json and are never printed.

const fs = require('fs');
const path = require('path');

const [workflowId, nodeName, codeFile] = process.argv.slice(2);
if (!workflowId || !nodeName || !codeFile) {
  console.error('usage: push-node-code.js <workflowId> "<Node Name>" <file.js>');
  process.exit(1);
}

function creds() {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.mcp.json'), 'utf8'));
  const servers = cfg.mcpServers || cfg.servers || {};
  for (const s of Object.values(servers)) {
    const env = s.env || {};
    if (env.N8N_API_URL && env.N8N_API_KEY) {
      return { url: env.N8N_API_URL.replace(/\/+$/, ''), key: env.N8N_API_KEY };
    }
  }
  throw new Error('N8N_API_URL / N8N_API_KEY not found in .mcp.json');
}

async function main() {
  const { url, key } = creds();
  const headers = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' };

  const getRes = await fetch(`${url}/workflows/${workflowId}`, { headers });
  if (!getRes.ok) throw new Error('GET failed: ' + getRes.status + ' ' + await getRes.text());
  const wf = await getRes.json();

  const node = (wf.nodes || []).find(n => n.name === nodeName);
  if (!node) throw new Error('node not found: ' + nodeName);
  if (!node.parameters || typeof node.parameters.jsCode !== 'string') {
    throw new Error('node has no jsCode parameter: ' + nodeName);
  }

  const before = node.parameters.jsCode;
  const after  = fs.readFileSync(codeFile, 'utf8');
  node.parameters.jsCode = after;

  console.log('node    : ' + nodeName);
  console.log('before  : ' + before.length + ' chars');
  console.log('after   : ' + after.length + ' chars');

  // n8n's PUT accepts only these top-level fields.
  const body = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
  };

  const putRes = await fetch(`${url}/workflows/${workflowId}`, {
    method: 'PUT', headers, body: JSON.stringify(body),
  });
  if (!putRes.ok) throw new Error('PUT failed: ' + putRes.status + ' ' + await putRes.text());

  // Read back and compare, so "saved" is proven rather than assumed.
  const verifyRes = await fetch(`${url}/workflows/${workflowId}`, { headers });
  const verify = await verifyRes.json();
  const live = (verify.nodes || []).find(n => n.name === nodeName);
  const ok = live && live.parameters.jsCode === after;

  console.log('verified: ' + (ok ? 'MATCHES the local file' : 'MISMATCH — not saved correctly'));
  if (!ok) process.exit(1);
}

main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
