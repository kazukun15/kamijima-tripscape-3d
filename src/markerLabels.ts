type Rect={left:number;top:number;right:number;bottom:number};
const gap=7;
const overlaps=(a:Rect,b:Rect)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;
export function installMarkerLabels(host:HTMLElement){
  let frame=0,lastLayout='';
  const parent=host.querySelector<HTMLElement>('.leaflet-marker-pane')||host;
  const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.classList.add('marker-leaders');overlay.setAttribute('aria-hidden','true');parent.append(overlay);
  const layout=()=>{
    frame=0;const bounds=host.getBoundingClientRect();
    const origin=parent.getBoundingClientRect();overlay.style.left=`${bounds.left-origin.left}px`;overlay.style.top=`${bounds.top-origin.top}px`;overlay.style.width=`${bounds.width}px`;overlay.style.height=`${bounds.height}px`;
    const lines:string[]=[];
    const inside=(r:Rect)=>r.left>=bounds.left+gap&&r.right<=bounds.right-gap&&r.top>=bounds.top+gap&&r.bottom<=bounds.bottom-gap;
    const obstacles:Rect[]=[];
    for(const el of document.querySelectorAll<HTMLElement>('.explorer,.detail-panel,.map-toolbar,.mobile-search,.map-actions,.pitch-control,.journey-strip,.welcome-card,.mobile-browse,.map-breadcrumb,.map-status,.map-instruction,.leaflet-control,.maplibregl-ctrl,.island-marker')){
      const r=el.getBoundingClientRect();if(r.width&&r.height&&getComputedStyle(el).visibility!=='hidden')obstacles.push(r);
    }
    const markers=Array.from(host.querySelectorAll<HTMLButtonElement>('.poi-marker')).map(el=>({el,rect:el.getBoundingClientRect(),label:el.querySelector<HTMLElement>('.marker-name')!}));
    const coordinates=(r:Rect)=>[r.left,r.top,r.right,r.bottom].map(v=>Math.round(v*10));
    const signature=JSON.stringify([coordinates(bounds),obstacles.map(coordinates),markers.map(({el,rect,label})=>[el.dataset.poiId,el.className,coordinates(rect),label.offsetWidth,label.offsetHeight])]);
    if(signature===lastLayout)return;lastLayout=signature;
    const visible=markers.filter(({rect})=>rect.right>bounds.left&&rect.left<bounds.right&&rect.bottom>bounds.top&&rect.top<bounds.bottom);
    for(const {el,rect,label} of markers){label.style.visibility='hidden';el.dataset.labelPlaced='false';if(visible.some(m=>m.el===el))obstacles.push({left:rect.left+5,right:rect.right-5,top:rect.top+4,bottom:rect.bottom});}
    visible.sort((a,b)=>Number(b.el.classList.contains('selected'))-Number(a.el.classList.contains('selected'))||a.rect.top-b.rect.top||a.rect.left-b.rect.left);
    for(const {el,rect,label} of visible){
      const width=label.offsetWidth,height=label.offsetHeight,cx=rect.left+22,cy=rect.top+21;
      const candidates:Rect[]=[];
      const add=(left:number,top:number)=>candidates.push({left,top,right:left+width,bottom:top+height});
      add(rect.right+gap,cy-height/2);add(rect.left-gap-width,cy-height/2);add(cx-width/2,rect.top-gap-height);add(cx-width/2,rect.bottom+gap);
      // Search the remaining map area by distance. Names stay intact and never cover another name or pin.
      for(let y=bounds.top+gap;y+height<=bounds.bottom-gap;y+=height+gap+1){
        for(let x=bounds.left+gap;x+width<=bounds.right-gap;x+=16)add(x,y);
      }
      candidates.sort((a,b)=>Math.hypot((a.left+a.right)/2-cx,(a.top+a.bottom)/2-cy)-Math.hypot((b.left+b.right)/2-cx,(b.top+b.bottom)/2-cy));
      const spot=candidates.find(r=>inside(r)&&!obstacles.some(o=>overlaps(r,o)));
      if(!spot)continue;
      label.style.left=`${spot.left-rect.left}px`;label.style.top=`${spot.top-rect.top}px`;label.style.visibility='visible';el.dataset.labelPlaced='true';obstacles.push(spot);
      const tx=Math.max(spot.left,Math.min(cx,spot.right)),ty=Math.max(spot.top,Math.min(cy,spot.bottom));
      lines.push(`<line x1="${cx-bounds.left}" y1="${cy-bounds.top}" x2="${tx-bounds.left}" y2="${ty-bounds.top}"/>`);
    }
    overlay.innerHTML=lines.join('');
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(layout);};
  const observer=new MutationObserver(records=>{if(records.some(r=>!(r.target instanceof Element&&r.target.closest('.marker-leaders')))){lastLayout='';schedule();}});observer.observe(host.closest('main')||host,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  const resize=new ResizeObserver(schedule);resize.observe(host);window.addEventListener('resize',schedule);schedule();
  return {schedule,destroy(){cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();window.removeEventListener('resize',schedule);overlay.remove();}};
}
