"""Turn a clinical-content CSV (or a Google Sheet exported to CSV) into seed content JSON.

Usage: python3 tools/sheet_to_seed.py samples/clinical-content.csv > content.json

Column names match the dashboard importer. See the header of samples/clinical-content.csv.
No customer sheet URL is configured; set one per clinic in the dashboard later.
"""
import csv, json, sys
path = sys.argv[1]
rows = []
with open(path, encoding='utf-8') as f:
    for r in csv.DictReader(f):
        def g(*keys):
            for k in keys:
                if r.get(k): return r[k]
            return ''
        rows.append({
            'kind': g('kind') or 'faq', 'slug': g('slug'), 'category': g('category'),
            'sort_order': int(g('sort_order') or 0), 'version_label': g('version_label') or '1.0',
            'reviewer': g('reviewer'), 'approved': int(g('approved') or 1),
            'media_kind': g('media_kind') or 'text', 'media_url': g('media_url'),
            'title': {'en': g('title_en'), 'es': g('title_es'), 'zh-Hans': g('title_zh_hans', 'title_zh-Hans'), 'zh-Hant': g('title_zh_hant', 'title_zh-Hant')},
            'body': {'en': g('body_en'), 'es': g('body_es'), 'zh-Hans': g('body_zh_hans', 'body_zh-Hans'), 'zh-Hant': g('body_zh_hant', 'body_zh-Hant')},
        })
json.dump(rows, sys.stdout, ensure_ascii=False, indent=1)
print()
