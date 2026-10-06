import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync,writeFileSync} from 'node:fs';
const basePath=process.env.BASE_PATH ? process.env.BASE_PATH.replace(/\/+$/,'')+'/' : './';
export default defineConfig({
  plugins:[react(),{name:'pages-404-home',closeBundle(){
    if(process.env.BASE_PATH){
      const file=new URL('./dist/404.html',import.meta.url);
      writeFileSync(file,readFileSync(file,'utf8').replace('__BASE_PATH__',basePath));
    }
  }}],
  base:basePath,
  build:{rollupOptions:{output:{manualChunks:{maplibre:['maplibre-gl'],leaflet:['leaflet']}}}},
  server:{host:'127.0.0.1',port:4173,strictPort:true},
  preview:{host:'127.0.0.1',port:4173,strictPort:true},
});
