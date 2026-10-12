const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the actual TypeScript adapter with an isolated HTTP boundary.
function loadApi(fetch, mock = false) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = (name) => {
      if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
      let target = name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : path.resolve(path.dirname(file), name);
      if (!path.extname(target)) target += '.ts';
      return load(target);
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, fetch,
      process: { env: { NEXT_PUBLIC_USE_MOCK: mock ? '1' : '0' } },
      structuredClone, URL, AbortSignal, Date, setTimeout, clearTimeout });
    return module.exports;
  }
  return load(path.join(__dirname, '../lib/api.ts'));
}

test('trust and evidence use the Operator API, not static snapshots', async () => {
  const urls = [];
  const api = loadApi(async (url) => { urls.push(url); return Response.json({}); });
  await api.getTrust(); await api.getEvidence();
  assert.deepEqual(urls, ['/api/antibody/trust', '/api/antibody/evidence']);
});

test('gate 404 is an empty state; backend failures remain errors', async () => {
  const api = loadApi(async () => Response.json({ error: 'No gate report yet' }, { status: 404 }));
  assert.equal((await api.getGate()).data, null);
  const down = loadApi(async () => Response.json({ error: 'Unavailable' }, { status: 503 }));
  await assert.rejects(down.getGate(), /Unavailable/);
});

test('validation errors are readable and mock provenance survives requests', async () => {
  const bad = loadApi(async () => Response.json({ detail: [{ msg: 'Field required' }] }, { status: 422 }));
  await assert.rejects(bad.getIncidents(), /Field required/);
  const api = loadApi(async () => Response.json([], { headers: { 'x-antibody-mock': '1' } }));
  assert.equal((await api.getIncidents()).mock, true);
});

test('approval forwards exactly the supplied phrase and typed channel', async () => {
  let sent;
  const api = loadApi(async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return Response.json({ merged: true }); });
  await api.approveFix('inc/a', { fix_id: 'fix_2', phrase: 'APPROVE fix 2', channel: 'typed' });
  assert.equal(sent.url, '/api/antibody/incidents/inc%2Fa/approve');
  assert.deepEqual(sent.body, { fix_id: 'fix_2', phrase: 'APPROVE fix 2', channel: 'typed' });
});

test('explicit mock mode uses captured backend samples without network calls', async () => {
  const api = loadApi(async () => { throw new Error('Unexpected network'); }, true);
  const incidents = await api.getIncidents();
  assert.equal(incidents.mock, true);
  const detail = await api.getIncident(incidents.data[0].id);
  assert.ok(detail.data.attempts[0].fix.diff);
  assert.equal((await api.getTrust()).data.seeded_bugs.length, 3);
  await assert.rejects(api.approveFix(incidents.data[0].id, { fix_id: 'fix_1', phrase: 'approve fix 1', channel: 'typed' }), /awaiting approval/);
});
