import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const root=resolve('dist'),port=Number(process.env.PORT||4173);
const prefix=process.env.BASE_PATH||'/';
if(!prefix.startsWith('/')||!prefix.endsWith('/'))throw new Error('BASE_PATH must start and end with /');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.geojson':'application/geo+json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith(prefix)){res.writeHead(404);res.end('Not found');return;}
    const file=resolve(root,path.slice(prefix.length)||'index.html');
    if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end('Forbidden');return;}
    const found=await stat(file).catch(()=>null);
    if(!found?.isFile()){
      res.writeHead(404,{'Content-Type':mime['.html']});res.end((await readFile(resolve(root,'404.html'),'utf8')).replaceAll('__BASE_PATH__',prefix));return;
    }
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(await readFile(file));
  }catch{res.writeHead(400);res.end('Bad request');}
}).listen(port,'127.0.0.1',()=>console.log(`Serving production files at http://127.0.0.1:${port}${prefix}`));
