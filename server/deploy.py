#!/usr/bin/env python3
"""Deploys the Zeeno Dental Worker through the Cloudflare REST API (D1 + Workers AI + embedded dashboard).

  python3 tools/build.py
  CF_API_TOKEN=... CF_ACCOUNT_ID=... BOOTSTRAP_ADMIN='admin@example.com:password' python3 server/deploy.py

BOOTSTRAP_ADMIN only creates the first admin when the users table is empty.
Does not deploy unless both CF_API_TOKEN and CF_ACCOUNT_ID are set.
"""
import json, os, ssl, sys
from pathlib import Path
import requests
from requests.adapters import HTTPAdapter

class _Ctx(HTTPAdapter):
    def _ctx(self):
        c = ssl.create_default_context(cafile=os.environ.get('REQUESTS_CA_BUNDLE') or None)
        c.verify_flags &= ~ssl.VERIFY_X509_STRICT
        return c
    def init_poolmanager(self, *a, **kw):
        kw['ssl_context'] = self._ctx(); return super().init_poolmanager(*a, **kw)
    def proxy_manager_for(self, *a, **kw):
        kw['ssl_context'] = self._ctx(); return super().proxy_manager_for(*a, **kw)

if not os.environ.get('CF_API_TOKEN') or not os.environ.get('CF_ACCOUNT_ID'):
    raise SystemExit('Set CF_API_TOKEN and CF_ACCOUNT_ID. This script does not deploy without them.')

S = requests.Session(); S.mount('https://', _Ctx())
ACCT = os.environ['CF_ACCOUNT_ID']
API = f'https://api.cloudflare.com/client/v4/accounts/{ACCT}'
H = {'Authorization': f"Bearer {os.environ['CF_API_TOKEN']}"}
NAME = os.environ.get('WORKER_NAME', 'zeeno-dental')
DBNAME = os.environ.get('D1_NAME', 'zeeno-dental')
here = Path(__file__).parent

def ok(r):
    j = r.json() if 'json' in r.headers.get('content-type', '') else {'raw': r.text[:300]}
    if not r.ok or (isinstance(j, dict) and j.get('success') is False):
        raise SystemExit(f'{r.request.method} {r.url.split("?")[0]} -> {r.status_code} {json.dumps(j.get("errors", j))[:600]}')
    return j

def statements(sql: str):
    buf, out = [], []
    for line in sql.splitlines():
        if line.strip().startswith('--'): continue
        buf.append(line)
        if line.rstrip().endswith(';'):
            s = '\n'.join(buf).strip()
            if s: out.append(s)
            buf = []
    tail = '\n'.join(buf).strip()
    if tail: out.append(tail)
    return out

dbs = ok(S.get(f'{API}/d1/database', headers=H, params={'name': DBNAME}))['result']
db = next((d for d in dbs if d['name'] == DBNAME), None) or ok(S.post(f'{API}/d1/database', headers=H, json={'name': DBNAME}))['result']
dbid = db['uuid']; print('d1:', dbid)
for stmt in statements((here / 'schema.sql').read_text()):
    ok(S.post(f'{API}/d1/database/{dbid}/query', headers=H, json={'sql': stmt}))
print('schema applied')

bindings = [{'type': 'd1', 'name': 'DB', 'id': dbid}, {'type': 'ai', 'name': 'AI'}]
if os.environ.get('BOOTSTRAP_ADMIN'): bindings.append({'type': 'secret_text', 'name': 'BOOTSTRAP_ADMIN', 'text': os.environ['BOOTSTRAP_ADMIN']})
else: bindings.append({'type': 'inherit', 'name': 'BOOTSTRAP_ADMIN'})
meta = {'main_module': 'index.js', 'compatibility_date': '2024-11-01', 'bindings': bindings, 'observability': {'enabled': True}}
parts = [('metadata', (None, json.dumps(meta), 'application/json')),
         ('index.js', ('index.js', (here / 'dist' / 'index.js').read_bytes(), 'application/javascript+module'))]
ok(S.put(f'{API}/workers/scripts/{NAME}', headers=H, files=parts)); print('worker uploaded')
ok(S.post(f'{API}/workers/scripts/{NAME}/subdomain', headers=H, json={'enabled': True, 'previews_enabled': False}))
sub = ok(S.get(f'{API}/workers/subdomain', headers=H))['result']['subdomain']
print(f'live: https://{NAME}.{sub}.workers.dev')
