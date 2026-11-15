/** GSI signed centimetres to Mapbox Terrain RGB. Invalid/sea pixels become a display-only 0 m plane. */
export function gsiToTerrain(r:number,g:number,b:number):[number,number,number]{
  const n=r*65536+g*256+b;
  const metres=n===8388608?0:(n>8388608?n-16777216:n)*0.01;
  const encoded=Math.max(0,Math.min(16777215,Math.round((metres+10000)*10)));
  return [Math.floor(encoded/65536),Math.floor(encoded/256)%256,encoded%256];
}

// The existing, checked Kamijima DEM tiles remain usable without fetching them.
function tile(lon:number,lat:number,z:number):[number,number]{
  const n=2**z,r=lat*Math.PI/180;
  return [Math.floor((lon+180)/360*n),Math.floor((1-Math.asinh(Math.tan(r))/Math.PI)/2*n)];
}
export function hasCachedTerrain(z:number,x:number,y:number){
  if(z<8||z>14)return false;
  const [left,top]=tile(133.05,34.34,z),[right,bottom]=tile(133.43,34.10,z);
  return x>=left&&x<=right&&y>=top&&y<=bottom;
}

/** MapLibre custom protocol. The official PNG uses signed 24-bit centimetres,
 * while raster-dem expects Mapbox's offset 0.1 m encoding. */
export async function loadGsiTerrain(url:string,signal:AbortSignal,base:string){
  const match=/^gsi-dem:\/\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
  if(!match)throw new Error('Invalid terrain tile address');
  const [,zs,xs,ys]=match,z=Number(zs),x=Number(xs),y=Number(ys);
  if(hasCachedTerrain(z,x,y)){
    const response=await fetch(new URL(`${base}terrain/${z}/${x}/${y}.png`,location.href),{signal});
    if(!response.ok)throw new Error(`Cached terrain tile ${response.status}`);
    return {data:await response.arrayBuffer()};
  }
  const response=await fetch(`https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`,{signal});
  if(!response.ok&&response.status!==404)throw new Error(`GSI terrain tile ${response.status}`);
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Terrain canvas unavailable');
  if(response.ok){
    const bitmap=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
    ctx.drawImage(bitmap,0,0);bitmap.close();
  }
  const image=ctx.getImageData(0,0,256,256),d=image.data;
  for(let i=0;i<d.length;i+=4){
    const [r,g,b]=response.ok?gsiToTerrain(d[i],d[i+1],d[i+2]):[1,134,160];
    d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  return {data:await createImageBitmap(canvas)};
}
