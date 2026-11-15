"""Load server/seed.json into a deployed Zeeno Dental worker.

  ZEENO_API=https://zeeno-dental.<account>.workers.dev ZEENO_EMAIL=... ZEENO_PASSWORD=... python3 tools/seed.py
"""
import json, os, requests
from pathlib import Path
API = os.environ.get('ZEENO_API', '').rstrip('/')
if not API: raise SystemExit('Set ZEENO_API')
s = requests.Session()
def call(m, p, **kw):
    r = s.request(m, API + p, timeout=60, **kw)
    if not r.ok: raise SystemExit(f'{m} {p} -> {r.status_code} {r.text[:400]}')
    return r.json()
tok = call('POST', '/api/auth/login', json={'email': os.environ['ZEENO_EMAIL'], 'password': os.environ['ZEENO_PASSWORD']})['token']
s.headers['Authorization'] = 'Bearer ' + tok
seed = json.load(open(Path(__file__).resolve().parents[1] / 'server' / 'seed.json', encoding='utf-8'))
clinics = call('GET', '/api/clinics')['clinics']
g = next((x for x in clinics if x['name'] == seed['clinic']['name']), None)
cid = g['id'] if g else call('POST', '/api/admin/clinics', json=seed['clinic'])['id']
call('PATCH', f'/api/clinics/{cid}', json=seed['clinic'])
have = {d['name'] for d in call('GET', f'/api/clinics/{cid}')['dentists']}
for d in seed['dentists']:
    if d['name'] not in have: call('POST', f'/api/clinics/{cid}/dentists', json=d)
dests = {d['location_name'] for d in call('GET', f'/api/clinics/{cid}')['destinations']}
for d in seed['destinations']:
    if d['location_name'] not in dests: call('POST', f'/api/clinics/{cid}/destinations', json=d)
csv_text = (Path(__file__).resolve().parents[1] / 'samples' / 'clinical-content.csv').read_text(encoding='utf-8')
print('import', call('POST', f'/api/clinics/{cid}/import', json={'csv': csv_text, 'mode': 'merge'}))
robots = call('GET', f'/api/robots?clinic={cid}')['robots']
if not robots: print('robot', call('POST', '/api/robots', json={'clinic_id': cid, 'name': 'temi Northline'}))
else: print('robots', [(r['name'], r.get('pair_code')) for r in robots])
print('clinic', cid)
