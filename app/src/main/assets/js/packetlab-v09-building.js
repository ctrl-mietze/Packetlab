/* PacketLab v0.9 · 2D building editor with selectable floors, no pseudo 3D.
 * Store rooms within the existing .pklab lab.rooms array.
 * Available only in the unrestricted Network Lab mode.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,$=id=>document.getElementById(id);
if(!N||!C)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types={
  small:{title:'Kleiner Raum',w:120,h:85},
  medium:{title:'Mittlerer Raum',w:165,h:110},
  large:{title:'Großer Raum',w:210,h:140},
  corridor:{title:'Flur',w:270,h:55},
  stairs:{title:'Treppe',w:95,h:95}
};
// All newly opened sessions and loaded projects begin with building mode OFF.
if(N.lab)N.lab.v9Building=false;
const enabled=()=>window.PacketLabV09Training?.role()==='network'&&N.lab.v9Building===true;
let pending=null,activeDrag=null;
const stage=document.querySelector('.stage'),side=document.querySelector('#vr-device-browser')||document.querySelector('.panel--left');
const layer=document.createElement('div');layer.id='v9-building-layer';layer.hidden=true;
layer.innerHTML='<div class="v9-floorbar"><button id="v9-floor-previous" aria-label="Etage zurück">‹</button>'+
 '<strong id="v9-floor-title">Etage 1</strong><button id="v9-floor-next" aria-label="Nächste Etage">›</button>'+
 '<button id="v9-floor-editor">Räume</button></div>'+
 '<svg id="v9-building-svg" viewBox="0 0 960 570" preserveAspectRatio="xMidYMid meet" role="img" aria-label="2D Gebäudeebene"></svg>'+
 '<div id="v9-building-hint"></div>';
if(stage)stage.insertBefore(layer,stage.querySelector('.v-float'));
const svg=$('v9-building-svg');
const toggle=document.createElement('button');toggle.id='v9-building-toggle';toggle.type='button';
toggle.innerHTML='<span>▦</span><span><b>Gebäudemodus</b><small>Räume, Treppen, Etagen und Grundrisse</small></span>';
toggle.className='v9-building-toggle';
// Optional tool belongs after all device and infrastructure entries.
if(side)side.append(toggle);
const floorShortcut=document.createElement('button');floorShortcut.id='v9-building-shortcut';floorShortcut.type='button';
floorShortcut.className='v-fab v9-building-shortcut';floorShortcut.innerHTML='▦ <span>Gebäude</span>';
floorShortcut.onclick=editPage;
stage?.querySelector('.v-float')?.prepend(floorShortcut);
function floor(){return Number(N.lab.floor)||1}
function allRooms(){if(!Array.isArray(N.lab.rooms))N.lab.rooms=[];return N.lab.rooms}
function where(e){
 const b=svg.getBoundingClientRect();
 const r=Math.min(b.width/960,b.height/570);
 const padx=(b.width-960*r)/2,pady=(b.height-570*r)/2;
 return {x:Math.min(900,Math.max(0,(e.clientX-b.left-padx)/r)),
         y:Math.min(510,Math.max(0,(e.clientY-b.top-pady)/r))};
}
function floorLabel(){
 const number=floor();
 return number===0?'Erdgeschoss':number>0?'Etage '+number:'Untergeschoss '+(-number);
}
function draw(){
 const shown=enabled();layer.hidden=!shown;floorShortcut.hidden=!shown;
 toggle.hidden=window.PacketLabV09Training?.role()!=='network';
 toggle.classList.toggle('is-on',shown);
 if(!shown){pending=null;return}
 const current=allRooms().filter(r=>Number(r.floor)===floor());
 $('v9-floor-title').textContent=floorLabel();
 $('v9-building-hint').textContent=pending?
   'Auf eine freie Fläche tippen oder ziehen, um '+types[pending].title+' zu platzieren.':
   'Etage mit den Pfeilen wechseln, „Räume“ öffnet die Gebäude-Werkzeuge.';
 svg.innerHTML='<defs><pattern id="v9-room-grid" width="24" height="24" patternUnits="userSpaceOnUse">'+
  '<path d="M24 0H0V24" fill="none" stroke="#6e617c" stroke-opacity=".16" stroke-width="1"/></pattern></defs>'+
  '<rect width="960" height="570" fill="url(#v9-room-grid)"/>'+
  current.map((r,i)=>{
    const x=Math.max(0,+r.x||0),y=Math.max(0,+r.y||0),
      w=Math.max(40,+r.w||100),h=Math.max(36,+r.h||70),
      stairs=r.kind==='stairs';
    return '<g class="v9-room" data-room-id="'+esc(r.id)+'">'+
      '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="4" fill="'+(stairs?'#383044':'#231e2e')+
      '" stroke="#a493b8" stroke-width="2"/>'+
      (stairs?'<path d="M'+(x+10)+' '+(y+h-10)+'l'+(w-20)+' -'+(h-20)+
        '" stroke="#b991d7" stroke-width="2" stroke-dasharray="6 4"/>':'')+
      '<text x="'+(x+12)+'" y="'+(y+24)+'" fill="#e6d7f2" font-size="13">'+esc(r.label)+'</text>'+
      '<circle data-room-resize="'+esc(r.id)+'" cx="'+(x+w)+'" cy="'+(y+h)+
      '" r="11" fill="#c99bf4" stroke="#211a2d" stroke-width="3"/>'+
    '</g>';
  }).join('');
}
function editPage(){
 if(window.PacketLabV09Training?.role()!=='network')return;
 if(!enabled()){N.lab.v9Building=true;draw()}
 const current=allRooms().filter(x=>Number(x.floor)===floor());
 N.open('Gebäudeplan · '+floorLabel(),
  '<div class="v9-header"><b>2D Gebäudeeditor</b><small>Räume in verschiedenen Größen platzieren, mit dem Finger verschieben und an der Ecke verändern. Kein künstliches 3D.</small></div>'+
  '<div class="v9-mini-stats"><span><strong>'+current.length+'</strong>Elemente auf dieser Etage</span>'+
   '<span><strong>'+[...new Set(allRooms().map(x=>x.floor))].length+'</strong>Etagen mit Räumen</span></div>'+
  '<div class="v9-actions"><button data-v9-floor="down">‹ Etage tiefer</button>'+
    '<button data-v9-floor="up">Etage höher ›</button></div>'+
  '<div class="v9-building-palette">'+Object.entries(types).map(([kind,t])=>
  '<button type="button" data-v9-building="'+kind+'"><strong>'+esc(t.title)+'</strong>'+
   '<small>'+t.w+' × '+t.h+' Rastereinheiten</small></button>').join('')+'</div>'+
  '<div class="v9-library-list">'+current.map(x=>
   '<div class="v9-building-row"><span>'+esc(x.label)+' · '+esc(x.kind)+'</span>'+
   '<button data-v9-del-room="'+esc(x.id)+'">Entfernen</button></div>').join('')+'</div>'+
  '<div class="v9-actions"><button data-v9-floor="close">Zurück</button>'+
   '<button data-v9-floor="disable">Gebäudemodus ausschalten</button></div>',
 root=>{
  root.querySelectorAll('[data-v9-floor]').forEach(b=>b.onclick=()=>{
   if(b.dataset.v9Floor==='down')N.lab.floor=Math.max(-3,floor()-1);
   if(b.dataset.v9Floor==='up')N.lab.floor=Math.min(20,floor()+1);
   if(b.dataset.v9Floor==='disable')N.lab.v9Building=false;
   draw();if(b.dataset.v9Floor==='down'||b.dataset.v9Floor==='up')editPage();else N.close();
  });
  root.querySelectorAll('[data-v9-building]').forEach(b=>b.onclick=()=>{
    pending=b.dataset.v9Building;N.close();draw();
  });
  root.querySelectorAll('[data-v9-del-room]').forEach(b=>b.onclick=()=>{
    N.lab.rooms=allRooms().filter(x=>x.id!==b.dataset.v9DelRoom);draw();editPage();
  });
 },'wide');
}
function toggleMode(){
 if(window.PacketLabV09Training?.role()!=='network')return;
 N.lab.v9Building=!enabled();draw();if(enabled())editPage();
}
toggle.onclick=toggleMode;
$('v9-floor-editor').onclick=editPage;
$('v9-floor-previous').onclick=()=>{N.lab.floor=Math.max(-3,floor()-1);draw()};
$('v9-floor-next').onclick=()=>{N.lab.floor=Math.min(20,floor()+1);draw()};
svg.addEventListener('pointerdown',e=>{
 if(!enabled())return;
 const resize=e.target.closest('[data-room-resize]');
 const room=e.target.closest('[data-room-id]');
 const r=room&&allRooms().find(x=>x.id===room.dataset.roomId);
 if(r){activeDrag={id:r.id,resize:!!resize,start:where(e),original:{x:r.x,y:r.y,w:r.w,h:r.h}};
   try{svg.setPointerCapture(e.pointerId)}catch(_){};e.preventDefault();return}
 if(pending){
  const xy=where(e),kind=pending,def=types[kind];
  const room={id:'room-'+Date.now()+'-'+Math.random().toString(36).slice(2,5),
    floor:floor(),kind,label:def.title+' '+(allRooms().length+1),
    x:Math.max(0,Math.min(960-def.w,xy.x)),y:Math.max(0,Math.min(570-def.h,xy.y)),
    w:def.w,h:def.h};
  allRooms().push(room);pending=null;draw();e.preventDefault();
 }
});
svg.addEventListener('pointermove',e=>{
 if(!activeDrag)return;
 const r=allRooms().find(x=>x.id===activeDrag.id);if(!r)return;
 const xy=where(e),dx=xy.x-activeDrag.start.x,dy=xy.y-activeDrag.start.y;
 if(activeDrag.resize){r.w=Math.round(Math.max(45,Math.min(960-r.x,activeDrag.original.w+dx)));
   r.h=Math.round(Math.max(40,Math.min(570-r.y,activeDrag.original.h+dy)))}
 else {r.x=Math.round(Math.max(0,Math.min(960-r.w,activeDrag.original.x+dx)));
   r.y=Math.round(Math.max(0,Math.min(570-r.h,activeDrag.original.y+dy)))}
 draw();
});
function stopDrag(){activeDrag=null}
svg.addEventListener('pointerup',stopDrag);
svg.addEventListener('pointercancel',stopDrag);
window.addEventListener('veyra-project-loaded',()=>setTimeout(()=>{
  if(N.lab)N.lab.v9Building=false;
  draw();
},120));
window.addEventListener('veyra:graphchange',()=>{if(layer.hidden&&!enabled())return;
 if(!activeDrag)draw()});
window.addEventListener('packetlab:v09-role-change',()=>{
  if(window.PacketLabV09Training?.role()!=='network'&&N.lab)N.lab.v9Building=false;
  draw();
});
document.querySelector('.v-nav')?.addEventListener('click',()=>setTimeout(draw,0));
window.PacketLabV09Building={toggle:toggleMode,draw,editPage,get enabled(){return enabled()}};
draw();
console.info('PacketLab v0.9: 2D building editor with separate floors ready');
})();
