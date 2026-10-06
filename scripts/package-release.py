"""Package reviewed source and built site, excluding caches, credentials and copied source pages."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json
ROOT=Path(__file__).resolve().parents[1]
assert '実行中' not in (ROOT/'outputs/QA_REPORT.md').read_text(encoding='utf8'), 'Finish QA before packaging'
folders=['src','data','public','dist','requirements','scripts','tests','.github']
files=['README.md','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','vitest.config.ts','playwright.config.ts','index.html','.gitignore']
research=['RESEARCH_REPORT.md','pending.json','fetch-log.json','terrain-verification.json','ehime-points.json','gsi-labels.json','gsi-symbols-14.json']
paths=[ROOT/p for p in files]
for folder in folders: paths.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
paths.extend(ROOT/'research'/p for p in research)
paths.extend(p for p in (ROOT/'outputs/qa').rglob('*') if p.is_file())
paths.append(ROOT/'outputs/QA_REPORT.md')
assets=[{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((ROOT/'dist').rglob('*')) if p.is_file()]
manifest={'version':'0.1.0','verified_pois':18,'pending_candidates':133,'islands':8,'dist_files':len(assets),'dist_bytes':sum(p['bytes'] for p in assets),'assets':assets,'excluded':['node_modules','work','research/raw','copied full source-page extracts','credentials','remote attachments']}
manifest_path=ROOT/'outputs/RELEASE_MANIFEST.json'
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8');paths.append(manifest_path)
archive=ROOT/'outputs/KAMIJIMA_TRIPSCAPE_3D.zip'
with ZipFile(archive,'w',ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(set(paths)):
        if not p.is_file():raise FileNotFoundError(p)
        z.write(p,'kamijima-tripscape-3d/'+p.relative_to(ROOT).as_posix())
with ZipFile(archive) as z:
    assert z.testzip() is None
    assert not any('/work/' in p or '/node_modules/' in p or '/raw/' in p or '.codex-remote' in p for p in z.namelist())
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(ROOT/'outputs/KAMIJIMA_TRIPSCAPE_3D.zip.sha256').write_text(digest+'  KAMIJIMA_TRIPSCAPE_3D.zip\n',encoding='utf8')
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'sha256':digest,'dist_files':len(assets),'included_files':len(paths)},ensure_ascii=False))
