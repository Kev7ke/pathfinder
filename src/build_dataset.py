import json, re, collections

d = json.load(open('missions_raw.json'))

# repair the one record that absorbed the page-1 filter UI
for m in d:
    if m['id'] == 780 and m['var'] == 'ab':
        m['name'] = 'Power Plant Fire - CBRNE'
        m['poi'] = 'Power Plant'
        m['cr'] = 56500
        m['req'] = m['req'].split('Requirements', 1)[1].strip()
        m['type'] = 'Fire Fighting Missions Chemical and Industrial Fire Missions (Specialization) Urban Fire Missions'

SING = [('Offices', 'Office'), ('Equipments', 'Equipment'), ('Expansions', 'Expansion'),
        ('Extensions', 'Extension'), ('extensions', 'extension'), ('Stations', 'Station'),
        ('stations', 'station'), ('Hangars', 'Hangar'), ('docks', 'dock'), ('Teams', 'Team'),
        ('Slots', 'Slot'), ('Posts', 'Post')]

ALIAS = {'forestry extension': 'Forestry Expansion',
         'firefighting plane station': 'Firefighting Plane Station',
         'rescue boat dock': 'Rescue Boat Dock',
         'fire boat dock': 'Fire Boat Dock',
         'active search and rescue equipment': 'Search and Rescue Equipment',
         'lifeguard post or coastal rescue station': 'Lifeguard Post or Coastal Rescue Station',
         'lifeguard posts or coastal rescue station': 'Lifeguard Post or Coastal Rescue Station'}

def norm(lbl):
    for a, b in SING:
        if lbl.endswith(a):
            lbl = lbl[:-len(a)] + b
            break
    key = lbl.lower()
    return ALIAS.get(key, lbl[0].upper() + lbl[1:])

out = []
extkeys = collections.Counter()
for m in d:
    fire = ems = pol = 0
    extras = {}
    for tok in re.split(r'(?=\b\d+\s)', m['req']):
        tok = tok.strip()
        if not tok:
            continue
        mm = re.match(r'^(\d+)\s+(.*)$', tok)
        if not mm:
            continue
        n, lbl = int(mm.group(1)), mm.group(2).strip()
        low = lbl.lower()
        if low.startswith('fire station'):
            fire = n
        elif low.startswith('ambulance station'):
            ems = n
        elif low.startswith('police station'):
            pol = n
        else:
            k = norm(lbl)
            extras[k] = max(extras.get(k, 0), n)
            extkeys[k] += 1
    out.append([m['name'], m['cr'], fire, ems, pol, extras, m['poi'], m['type']])

out.sort(key=lambda r: (-(r[1] or -1), r[0]))
print('missions:', len(out), '| extension types:', len(extkeys))
print('max fire/ems/pol:', max(r[2] for r in out), max(r[3] for r in out), max(r[4] for r in out))
print('top:', out[0][:5], out[0][5])
json.dump({'ext': sorted(extkeys), 'm': out}, open('data.json', 'w'), separators=(',', ':'))
print('bytes:', len(open('data.json').read()))
