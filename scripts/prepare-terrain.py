"""Convert bounded GSI signed DEM PNG to Mapbox Terrain RGB, verify every valid pixel."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
import numpy as np
import io, json, math, urllib.request, urllib.error, time

ROOT=Path(__file__).resolve().parents[1]
BBOX=(133.05,34.10,133.43,34.34)
def tile(lon,lat,z):
    n=2**z
    return (math.floor((lon+180)/360*n),math.floor((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n))
def bounds(z):
    a=tile(BBOX[0],BBOX[3],z);b=tile(BBOX[2],BBOX[1],z)
    return [(z,x,y) for x in range(a[0],b[0]+1) for y in range(a[1],b[1]+1)]
def fetch(url):
    last=None
    for retry in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'KamijimaTripscape/0.1'}),timeout=35) as r:return r.read()
        except urllib.error.HTTPError as e:
            if e.code==404:return None
            last=e
        except Exception as e:last=e
        time.sleep(0.5*(retry+1))
    raise last
def convert(task):
    z,x,y=task;path=ROOT/f'public/terrain/{z}/{x}/{y}.png'
    rawpath=ROOT/f'research/raw/dem/{z}/{x}/{y}.png'
    url=f'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'
    raw=rawpath.read_bytes() if rawpath.exists() else fetch(url)
    missing=raw is None
    if missing:
        h=np.zeros((256,256));valid=np.zeros((256,256),dtype=bool)
    else:
        rawpath.parent.mkdir(parents=True,exist_ok=True);rawpath.write_bytes(raw)
        rgb=np.array(Image.open(io.BytesIO(raw)).convert('RGB'),dtype=np.int64)
        v=rgb[:,:,0]*65536+rgb[:,:,1]*256+rgb[:,:,2]
        valid=v!=8388608
        h=np.where(v>8388608,v-16777216,v)*0.01
        h=np.where(valid,h,0.) # Ocean/no-data display plane; never used as measured elevation.
    value=np.rint((h+10000)*10).astype(np.int64)
    encoded=np.stack([value//65536,(value//256)%256,value%256],axis=2).astype(np.uint8)
    decoded=(encoded[:,:,0].astype(np.int64)*65536+encoded[:,:,1].astype(np.int64)*256+encoded[:,:,2])*0.1-10000
    error=float(np.abs(decoded[valid]-h[valid]).max()) if valid.any() else 0
    if error>0.050001:raise ValueError(f'Encoding error {task}: {error}')
    path.parent.mkdir(parents=True,exist_ok=True);Image.fromarray(encoded).save(path,optimize=True)
    return {'z':z,'x':x,'y':y,'source_url':url,'missing_source':missing,'valid_pixels':int(valid.sum()),'min_m':float(h[valid].min()) if valid.any() else None,'max_m':float(h[valid].max()) if valid.any() else None,'roundtrip_max_error_m':round(error,6)}
def basemap(task):
    z,x,y=task;path=ROOT/f'public/basemap/{z}/{x}/{y}.png'
    if path.exists():return
    raw=fetch(f'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png')
    if raw is None:raise ValueError(f'Base map missing {task}')
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)

if __name__=='__main__':
    tasks=[t for z in range(8,15) for t in bounds(z)]
    results=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for future in as_completed([pool.submit(convert,t) for t in tasks]):
            results.append(future.result())
            if len(results)%40==0:print(f'DEM {len(results)}/{len(tasks)}',flush=True)
    base_tasks=[t for z in range(8,15) for t in bounds(z)]
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(basemap,base_tasks))
    metadata={'source':'GSI DEM (10m) / pale base map','spec_url':'https://maps.gsi.go.jp/development/demtile.html','checked_at':'2026-10-05','bounds':BBOX,'encoding':'mapbox','minzoom':8,'maxzoom':14,'exaggeration':1,'no_data_policy':'Display as 0 m plane; not a measured sea or land elevation. Validity counts retained per tile.','tiles':sorted(results,key=lambda t:(t['z'],t['x'],t['y'])),'base_map_tiles':len(base_tasks)}
    (ROOT/'research/terrain-verification.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf8')
    print(f"Converted {len(results)} DEM tiles; {len(base_tasks)} base map tiles; max error {max(t['roundtrip_max_error_m'] for t in results)}m; missing {sum(t['missing_source'] for t in results)}",flush=True)
