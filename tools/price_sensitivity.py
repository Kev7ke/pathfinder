import json, copy, sys
sys.path.insert(0,'tools')
from ladder import D,P,EXT,ladder,FRESH

# 1. raw usage stats per extension
stats={}
for i,row in enumerate(D['m']):
    for k,v in (row[5] or {}).items():
        s=stats.setdefault(k,{'n':0,'max':0,'paths':{},'maxname':''})
        s['n']+=1
        s['paths'][D['p'][i]]=s['paths'].get(D['p'][i],0)+1
        if row[1] and row[1]>s['max']: s['max']=row[1]; s['maxname']=row[0]

STATES={
 'new (1 fire)': {'fire':1,'ems':0,'police':0,'ext':{}},
 'mid (10/5/5)': {'fire':10,'ems':5,'police':5,'ext':{}},
 'late (25/15/15)': {'fire':25,'ems':15,'police':15,'ext':{}},
}

def sig(L): return tuple((r['name'],r['cost']) for r in L)
def names(L): return tuple(r['name'] for r in L)

base={}
for sn,st in STATES.items():
    for path in 'FPE': base[(sn,path)]=ladder(path,st,EXT)

print(f"{'extension':42s} {'src':13s} {'#miss':>5s} {'maxcred':>8s} paths            ladder-sensitivity (x0.5 / x2)")
print('-'*135)
rows=[]
for k,v in EXT.items():
    src=v['source']
    s=stats.get(k,{'n':0,'max':0,'paths':{},'maxname':'-'})
    changed=set()
    for mult in (0.5,2.0):
        alt=copy.deepcopy(EXT); alt[k]['price']=int(alt[k]['price']*mult)
        for sn,st in STATES.items():
            for path in 'FPE':
                if names(ladder(path,st,alt))!=names(base[(sn,path)]):
                    changed.add(f'{path}:{sn.split()[0]}')
    rows.append((src,-s['n'],k,v['price'],s,changed))
rows.sort(key=lambda r:(0 if r[0]!='build_menu' else 1, -len(r[5]), r[1]))
for src,negn,k,price,s,changed in rows:
    ps=' '.join(f'{a}{b}' for a,b in sorted(s['paths'].items()))
    flag='***' if changed else '   '
    print(f"{k[:42]:42s} {src:13s} {s['n']:>5d} {s['max']:>8,} {ps:16s} {flag} {','.join(sorted(changed)) if changed else 'no effect on any tested frontier'}")
