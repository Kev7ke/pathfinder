import pdfplumber, re, json, collections

PDF = '/mnt/user-data/uploads/MISSIONCHIEF_COM_-_Create_your_own_911-Dispatch-Center_and_manage_your_city_.pdf'
COLS = [('name', 40, 193), ('poi', 193, 264), ('cr', 264, 318),
        ('req', 318, 483), ('type', 483, 900)]
LINK = re.compile(r'\(/einsaetze/(\d+)(\?[a-z_]+=[a-z0-9]+)?\)')

def col_of(x):
    for n, a, b in COLS:
        if a <= x < b:
            return n

records = []
pdf = pdfplumber.open(PDF)
for pi, page in enumerate(pdf.pages):
    ws = [w for w in page.extract_words() if 60 < w['top'] < 800]
    for w in ws:
        w['col'] = col_of(w['x0'])

    lines = []
    for w in sorted([w for w in ws if w['col'] == 'name'], key=lambda w: (w['top'], w['x0'])):
        if lines and abs(w['top'] - lines[-1][0]) < 5:
            lines[-1][1].append(w)
        else:
            lines.append([w['top'], [w]])

    starts, acc, open_rec = [], '', False
    for top, lw in lines:
        if not open_rec:
            starts.append(top); acc = ''; open_rec = True
        acc += ''.join(x['text'] for x in lw)
        if LINK.search(acc):
            open_rec = False

    for i, s in enumerate(starts):
        e = starts[i + 1] if i + 1 < len(starts) else 10_000
        lo, hi = s - 4, e - 4
        bucket = collections.defaultdict(list)
        for w in ws:
            if w['col'] and lo <= w['top'] < hi:
                bucket[w['col']].append(w)
        g = lambda c: ' '.join(x['text'] for x in sorted(bucket[c], key=lambda w: (round(w['top']), w['x0'])))
        records.append({'page': pi + 1, 'name': g('name'), 'poi': g('poi'),
                        'cr': g('cr'), 'req': g('req'), 'type': g('type')})

out, bad = [], []
for r in records:
    m = LINK.search(r['name'].replace(' ', ''))
    nm = LINK.sub('', r['name'].replace(' (/einsaetze/', ' (/einsaetze/')).strip()
    nm = re.sub(r'\s*\(/einsaetze/\S*\s*\S*$', '', r['name']).strip()
    nm = re.sub(r'\s+', ' ', nm)
    if not m or not nm:
        bad.append(r); continue
    cr = r['cr'].strip()
    out.append({'id': int(m.group(1)), 'var': (m.group(2) or '').replace('?additive_overlays=','').replace('?overlay_index=','ov'),
                'name': nm, 'poi': re.sub(r'\s+', ' ', r['poi'].strip()),
                'cr': int(cr) if re.fullmatch(r'\d+', cr) else None,
                'req': re.sub(r'\s+', ' ', r['req'].strip()),
                'type': re.sub(r'\s+', ' ', r['type'].strip())})

print('records:', len(records), 'parsed:', len(out), 'bad:', len(bad))
for b in bad[:8]:
    print('BAD p%s' % b['page'], repr(b['name'])[:110])

seen = {}
for o in out:
    seen[(o['id'], o['var'])] = o
print('unique:', len(seen))
json.dump(list(seen.values()), open('missions_raw.json', 'w'), indent=0)
