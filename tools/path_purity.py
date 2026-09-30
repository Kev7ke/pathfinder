import sys; sys.path.insert(0,'tools')
from ladder import D,P,EXT,ladder,FRESH,ST_SMALL,ext_price
DEPT_OF_EXT={}  # infer which dept an extension hangs off, by which station type dominates missions needing it
import collections
agg=collections.defaultdict(lambda:[0,0,0])
for i,row in enumerate(D['m']):
    for k in (row[5] or {}):
        agg[k][0]+=row[2]; agg[k][1]+=row[3]; agg[k][2]+=row[4]
for k,(f,e,p) in agg.items():
    DEPT_OF_EXT[k]='fire' if f>=e and f>=p else ('ems' if e>=p else 'police')

def mix(r):
    c={'fire':r['need']['fire']*ST_SMALL['fire'],'ems':r['need']['ems']*ST_SMALL['ems'],'police':r['need']['police']*ST_SMALL['police']}
    for k,v in r['ext'].items():
        pr=ext_price(k,EXT)
        if pr: c[DEPT_OF_EXT.get(k,'fire')]+=pr*v
    return c

for path,label,own in (('E','EMS','ems'),('P','POLICE','police'),('F','FIRE','fire')):
    print(f'=== {label} path — where the money actually goes (fresh player, small stations) ===')
    for r in ladder(path,FRESH,EXT):
        c=mix(r); tot=sum(c.values()) or 1
        share=100*c[own]/tot
        print(f"  {r['cost']:>10,} {r['credits']:>7,}  own-dept {share:5.1f}%  (fire {100*c['fire']/tot:4.0f}% ems {100*c['ems']/tot:4.0f}% pol {100*c['police']/tot:4.0f}%)  {r['name'][:40]}")
    print()
