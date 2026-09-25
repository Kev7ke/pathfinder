import json, copy
BASE=''
D=json.load(open(BASE+'data/missions.json'))
P=json.load(open(BASE+'data/prices.json'))

EXT={k:v for k,v in P['extensions'].items() if not k.startswith('_')}
def ext_price(name, prices): 
    e=prices.get(name)
    return e['price'] if e else None
def ext_src(name):
    e=EXT.get(name); return e['source'] if e else 'MISSING'

ST_SMALL={'fire':P['stations']['fire_station_small']['price'],
          'ems':P['stations']['ambulance_station_small']['price'],
          'police':P['stations']['police_station_small']['price']}

def shortfall(row, state):
    name,cr,f,e,pol,extras,poi,typ=row
    need={'fire':max(0,f-state['fire']),'ems':max(0,e-state['ems']),'police':max(0,pol-state['police'])}
    ex={}
    for k,v in (extras or {}).items():
        d=v-state['ext'].get(k,0)
        if d>0: ex[k]=d
    return need, ex

def cost_of(need, ex, prices, stp=ST_SMALL):
    c=need['fire']*stp['fire']+need['ems']*stp['ems']+need['police']*stp['police']
    unk=[]
    for k,v in ex.items():
        p=ext_price(k,prices)
        if p is None: unk.append(k); continue
        c+=p*v
    return c, unk

def ladder(path, state, prices):
    cands=[]
    for i,row in enumerate(D['m']):
        if D['p'][i]!=path: continue
        if row[1] is None: continue
        need,ex=shortfall(row,state)
        if need['fire']==0 and need['ems']==0 and need['police']==0 and not ex: continue
        c,unk=cost_of(need,ex,prices)
        cands.append((c,-row[1],row[0],row[1],need,ex,unk))
    cands.sort(key=lambda t:(t[0],t[1]))
    out=[];best=-1
    for c,negcr,name,cr,need,ex,unk in cands:
        if cr>best:
            best=cr; out.append(dict(cost=c,credits=cr,name=name,need=need,ext=ex,unknown=unk))
    return out

FRESH={'fire':1,'ems':0,'police':0,'ext':{}}
if __name__=='__main__':
    for path in 'FPE':
        L=ladder(path,FRESH,EXT)
        print(f'=== path {path} — {len(L)} rungs (from 1 fire station, small-station pricing) ===')
        for r in L[:14]:
            ex=' + '.join(f'{k}x{v}' for k,v in r['ext'].items())
            st=' '.join(f'{k}+{v}' for k,v in r['need'].items() if v)
            print(f"  {r['cost']:>10,}  {r['credits']:>7,}  {r['name'][:44]:44s} | {st} | {ex[:60]}")
        print()
