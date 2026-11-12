/* PacketLab 0.11.1: a single topology picker for all 18 presets.
 * Keeps model, selected title and requested device count synchronized.
 * Does not replace the original network engine or stored project format.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,V=window.PacketLabV07,P=PacketLabCore,S=C?.state;
if(!N||!C||!V||!S)return;
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const glyphs={
 book:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15"/>',
 network:'<circle cx="12" cy="4" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M11 6 6 17M13 6l5 11M7 19h10"/>',
 ring:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="3" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="12" cy="21" r="1"/><circle cx="21" cy="12" r="1"/>',
 tree:'<path d="M12 3v6M4 21v-6M20 21v-6M4 15h16M12 9H4v6M12 9h8v6"/><rect x="9" y="2" width="6" height="4" rx="1"/><rect x="1" y="19" width="6" height="4" rx="1"/><rect x="17" y="19" width="6" height="4" rx="1"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 router:'<rect x="3" y="8" width="18" height="11" rx="2"/><path d="M8 11h3M8 15h3M15 14h4M8 8V4M17 8V4"/>',
 server:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M7 8h10M7 13h10M7 18h10M8 8h.1M8 13h.1M8 18h.1"/>',
 home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
 shield:'<path d="m12 2 8 4v6c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
 wifi:'<path d="M2 9a16 16 0 0 1 20 0M5 13a11 11 0 0 1 14 0M8 17a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>',
 campus:'<rect x="2" y="10" width="20" height="11" rx="1"/><path d="M5 10V4h14v6M9 21v-6h6v6M6 7h3M15 7h3"/>',
 factory:'<path d="M3 21V10l6 4V9l6 5V4h6v17z"/><path d="M7 18h2M13 18h2M19 18h1"/>',
 branch:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M7 6l4 11M17 6l-4 11M7 5h10"/>',
 shuffle:'<path d="M3 7h4l10 10h4M16 7h5m-5 0 3-3m-3 3 3 3M3 17h4l4-4m5-6 5-3m-5 13 3-3m-3 3 3 3"/>',
 empty:'<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="M12 8v8M8 12h8"/>',
 arrow:'<path d="m9 6 6 6-6 6"/>',
 minus:'<path d="M5 12h14"/>',
 plus:'<path d="M5 12h14M12 5v14"/>',
 folder:'<path d="M3 6h6l2 3h10v11H3z"/>',
 bolt:'<path d="M13 2 4 13h7l-1 9 10-12h-8z"/>',
 settings:'<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="17" r="2"/>'
};
const svg=(id,cl='')=>'<svg class="'+cl+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(glyphs[id]||glyphs.network)+'</svg>';
const entries=[
 ['empty','Leeres Netzwerk','Blanko-Arbeitsfläche','empty'],
 ['star','Stern','Zentrale Switching-Topologie','network'],
 ['ring','Ring','Geschlossener Backbone','ring'],
 ['tree','Baum','Core, Distribution und Access','tree'],
 ['bus','Bus','Gemeinsames Übertragungsmedium','branch'],
 ['mesh','Mesh','Mehrere redundante Verbindungen','grid'],
 ['hybrid','Hybrid','Gemischte Infrastruktur','branch'],
 ['office','Büro & Arbeitsplätze','Clientnetz und zentrale Dienste','home'],
 ['campus','Campus','Mehrere Bereiche mit Netzwerkkern','campus'],
 ['datacenter','Datacenter','Serverinfrastruktur und Redundanz','server'],
 ['dual','Filialen & WAN','Zwei Standorte mit Verbindung','branch'],
 ['random','Random World','Variierende Geräte und Netzwege','shuffle'],
 ['home','Smart Home','Router, Smartphone und IoT','home'],
 ['dmz','DMZ & Webdienste','Filterzone und Server','shield'],
 ['industrial','Industrie & OT','SPS und Infrastruktur','factory'],
 ['mobile','Mobile Clients','Telefone, Laptop, Access Point','wifi'],
 ['branch','Branch Office','Standortnetz mit WAN-Router','router'],
 ['school','Schulnetz','Clients, WLAN und Lehrserver','campus']
];
const lookup=new Map(entries.map(([key,label,detail,icon])=>[key,{key,label,detail,icon}]));
const builtIns=new Set(Topologies.KINDS);
const mappingExtras=new Set(['home','dmz','industrial','mobile','branch','school']);
const complex=new Set(['office','campus','datacenter','dual']);
const specialAdd={
 office:['pc','laptop','printer','server'],
 campus:['pc','laptop','ap','server'],
 datacenter:['server','nas','server','hypervisor'],
 dual:['pc','laptop','server'],
 random:['pc','laptop','switch']
};
let choice=8,renderLock=false;
function sizeClamp(n){return Math.min(40,Math.max(3,Math.round(Number(n)||8)))}
function countOf(){return S.devices.length}
function chosen(){return lookup.has(N.lab.preset)?N.lab.preset:(lookup.has(S.kind)?S.kind:'star')}
function updateHeader(){
 if(renderLock)return;
 const key=chosen(),m=lookup.get(key),label=$('topoPickName'),ico=$('topoPickIco'),btn=$('btnTopoPick');
 if(!m||!label||!ico||!btn)return;
 renderLock=true;
 try{
   if(label.textContent!==m.label)label.textContent=m.label;
   if(ico.dataset.icon!==m.icon||!ico.querySelector('svg')){
     ico.innerHTML=svg(m.icon);ico.dataset.icon=m.icon;
   }
   btn.title='Topologie: '+m.label+' · '+countOf()+' Geräte';
   btn.setAttribute('aria-label','Topologie ändern. Aktuell '+m.label+', '+countOf()+' Geräte');
   const size=$('nodeCount');if(size&&size.value!==String(countOf())){
     size.value=String(countOf());$('nodeCountVal').textContent=countOf();
   }
 }finally{renderLock=false}
}
function resizeSpecial(number,key){
 const n=sizeClamp(number);
 if(S.devices.length===n)return;
 const nodes=[...S.devices],edges=[...S.links];
 if(nodes.length>n){
   const essential=new Set(['router','switch','firewall','ap','vpn','wlc']);
   const deletions=[...nodes].sort((a,b)=>{
     const pa=essential.has(a.type)?1:0,pb=essential.has(b.type)?1:0;
     return pa-pb||(edges.filter(e=>e.a===a.id||e.b===a.id).length-
                     edges.filter(e=>e.a===b.id||e.b===b.id).length);
   }).slice(0,nodes.length-n);
   const gone=new Set(deletions.map(d=>d.id));
   nodes.splice(0,nodes.length,...nodes.filter(d=>!gone.has(d.id)));
   edges.splice(0,edges.length,...edges.filter(e=>!gone.has(e.a)&&!gone.has(e.b)));
 }else{
   const starter=specialAdd[key]||['pc','server','laptop'];
   const hub=nodes.find(d=>d.type==='switch')||nodes.find(d=>d.type==='router')||
     nodes.find(d=>d.type==='firewall')||nodes[0];
   if(!hub)return;
   const used=new Set(nodes.map(d=>d.ip).filter(Boolean));
   for(let i=0;nodes.length<n;i++){
     const type=starter[i%starter.length];
     const w=TopologyType(type),angle=2*Math.PI*i/Math.max(4,n-S.devices.length);
     const x=(hub.tx??hub.x??420)+Math.cos(angle)*(210+Math.floor(i/9)*115);
     const y=(hub.ty??hub.y??260)+Math.sin(angle)*(155+Math.floor(i/9)*85);
     const node=Topologies.device(type,w.prefix+'-'+(nodes.length+1),x,y);
     node.mac=Topologies.macFor(node.id);node.subnet=1;
     let host=10;while(used.has('192.168.1.'+host)&&host<250)host++;
     node.ip='192.168.1.'+host;node.ips=[node.ip];used.add(node.ip);
     const router=nodes.find(d=>d.type==='router');
     node.gateway=router?.ip||'';
     node.vprofile=P.sanitizeProfile({ipv4:node.ip,subnet:'255.255.255.0',
       gateway:node.gateway,os:type==='phone'?'Android':'Linux'},node);
     nodes.push(node);edges.push(Topologies.link(hub,node));
   }
 }
 const connected=new Set(edges.flatMap(e=>[e.a,e.b]));
 const hub=nodes.find(d=>d.type==='switch')||nodes.find(d=>d.type==='router')||nodes[0];
 if(hub)for(const d of nodes)if(d!==hub&&!connected.has(d.id)){
   edges.push(Topologies.link(hub,d));
 }
 Topologies.fitPorts(nodes,edges);Topologies.recost(nodes,edges);
 const endpoints=nodes.filter(d=>Topologies.isHost(d.type));
 C.replace(nodes,edges,endpoints[0]?.id||nodes[0]?.id,endpoints[1]?.id||nodes.at(-1)?.id);
}
function TopologyType(type){return Topologies.TYPES[type]||Topologies.TYPES.pc}
function build(key,n){
 if(!lookup.has(key))return;
 const size=sizeClamp(n);
 N.saveDraft?.('Topologiewechsel: '+key);
 if(key==='empty')N.presetBuild('empty',size,{skipDraft:true});
 else if(mappingExtras.has(key)){
   V.buildExtraPreset(key,size);
 }else{
   N.presetBuild(key,size,{skipDraft:true,requestedSize:true});
   if(complex.has(key)||S.devices.length!==size)resizeSpecial(size,key);
 }
 N.lab.preset=key;N.lab.presetSize=(key==='empty'?0:size);
 N.lab.title=lookup.get(key).label+' Lab';
 updateHeader();
 const fit=$('btnZoomFit');fit?.click();
 C.refresh();
 updateHeader();
 return {key,size:countOf()};
}
function presetSelect(){
 choice=Number(N.lab.presetSize)||countOf()||8;
 if(choice<3)choice=8;
 const current=chosen();
 N.open('Netzwerkvorlage',
   '<div class="v112-preset-header"><div><strong>Vorlage auswählen</strong>'+
   '<small>18 Vorlagen für freie Lab-Netzwerke. Die Gerätezahl kannst du oben festlegen.</small></div>'+
   '<div class="v112-preset-current">'+svg(lookup.get(current)?.icon||'network')+
     '<span>Aktuell: '+esc(lookup.get(current)?.label||current)+'</span></div></div>'+
   '<label class="v112-size"><span>Gerätezahl</span>'+
   '<div><button data-v112-size="-1" type="button" aria-label="Ein Gerät weniger">'+svg('minus')+'</button>'+
   '<input id="v112-count" type="number" value="'+choice+'" min="3" max="40" inputmode="numeric">'+
   '<button data-v112-size="1" type="button" aria-label="Ein Gerät mehr">'+svg('plus')+'</button></div></label>'+
   '<div class="v112-sizes">'+[8,16,24,40].map(x=>'<button type="button" data-v112-quick="'+x+'" class="'+(x===choice?'active':'')+'">'+
     (x===8?'Klein':x===16?'Mittel':x===24?'Groß':'Mega')+' · '+x+'</button>').join('')+'</div>'+
   '<div class="v112-preset-caption">Gewählte Größe: <strong id="v112-count-preview">'+choice+' Geräte</strong>'+
   ' · Der Netzplan wird anschließend automatisch eingepasst.</div>'+
   '<div class="v112-preset-grid">'+entries.map(([key,name,desc,ico],i)=>
     (i===0?'<div class="v113-preset-section"><span>Grundformen</span><small>7 Vorlagen</small></div>':
      i===7?'<div class="v113-preset-section"><span>Szenarien</span><small>11 Vorlagen</small></div>':'')+
     '<button type="button" data-v112-topo="'+key+'" class="v112-topo-option '+(key===current?'active':'')+'">'+
     '<span class="v112-topo-icon">'+svg(ico)+'</span><span><strong>'+esc(name)+'</strong>'+
     '<small>'+esc(desc)+'</small></span><span class="v112-topo-arrow">'+svg('arrow')+'</span></button>').join('')+
   '</div>',
 root=>{
   const input=root.querySelector('#v112-count'),preview=root.querySelector('#v112-count-preview');
   const draw=()=>{
     choice=sizeClamp(input.value);preview.textContent=choice+' Geräte';
     root.querySelectorAll('[data-v112-quick]').forEach(b=>b.classList.toggle('active',Number(b.dataset.v112Quick)===choice));
   };
   input.onchange=()=>{input.value=sizeClamp(input.value);draw()};
   input.oninput=draw;
   root.querySelectorAll('[data-v112-size]').forEach(b=>b.onclick=()=>{
     input.value=sizeClamp(Number(input.value)+Number(b.dataset.v112Size));draw();
   });
   root.querySelectorAll('[data-v112-quick]').forEach(b=>b.onclick=()=>{
     input.value=b.dataset.v112Quick;draw();
   });
   root.querySelectorAll('[data-v112-topo]').forEach(b=>b.onclick=()=>{
     const k=b.dataset.v112Topo;
     try{
       const made=build(k,sizeClamp(input.value));
       N.close();window.VeyraRefine?.flash?.('Topologie: '+lookup.get(k).label+' · '+made.size+' Geräte');
     }catch(e){window.VeyraRefine?.flash?.('Topologie: '+e.message)}
   });
 },'wide');
}
function replaceIcons(){
 const badge=$('v8-app-version');
 if(badge){
   badge.remove();
   const h=document.querySelector('.brand h1');if(h)h.title='Veyra PacketLab · v0.11.2';
 }
 const book=$('v9-book');
 if(book){
   // One SVG, one click target; no buried legacy label/version chip.
   if(book.querySelectorAll('svg').length!==1||book.children.length!==1)book.innerHTML=svg('book');
   book.style.position='relative';book.style.zIndex='1';
   book.title='Net@Lab · Handbuch und Trainingsaufgaben';
 }
 const iconTargets=[['pl-morepresets','grid'],['pl-simtool','settings'],['pl-floor-shortcut','campus']];
 for(const [id,name] of iconTargets){
   const el=$(id);if(!el)continue;
   el.innerHTML=svg(name);el.setAttribute('aria-label',el.title||id);
   el.classList.add('v112-icon-clean');
 }
 // Keep SVGs instead of brittle Unicode placeholder tiles in the building list.
 const building=$('v9-building-toggle');
 if(building){
   const glyph=building.querySelector('span:first-child');
   if(glyph){glyph.innerHTML=svg('campus');glyph.classList.add('v112-building-symbol')}
 }
 const buildingFab=$('v9-building-shortcut');
 if(buildingFab)buildingFab.innerHTML=svg('campus')+'<span>Gebäude</span>';
 updateHeader();
}
const topo=$('btnTopoPick');
if(topo){
 // Document capture precedes legacy button capture without touching its code.
 document.addEventListener('click',e=>{
   if(e.target.closest?.('#btnTopoPick')){
     e.preventDefault();e.stopImmediatePropagation();presetSelect();
   }
 },true);
}
document.addEventListener('change',e=>{
 if(e.target?.id!=='nodeCount')return;
 if(!lookup.has(chosen()))return;
 e.preventDefault();e.stopImmediatePropagation();
 try{build(chosen(),Number(e.target.value))}catch(err){console.warn('Topology resize:',err)}
},true);
window.addEventListener('veyra:graphchange',()=>queueMicrotask(updateHeader));
window.addEventListener('packetlab:v09-role-change',()=>queueMicrotask(updateHeader));
window.addEventListener('veyra-project-loaded',()=>queueMicrotask(updateHeader));
const topoName=$('topoPickName');
if(topoName)new MutationObserver(()=>queueMicrotask(updateHeader)).observe(topoName,{childList:true,characterData:true});
const originalLoad=N.load.bind(N);
N.load=function(raw){
  const done=originalLoad(raw);
  if(N.lab)N.lab.v9Building=false;
  window.PacketLabV09Building?.draw?.();
  queueMicrotask(updateHeader);
  return done;
};
const countSlider=$('nodeCount');
if(countSlider){countSlider.max='40';countSlider.min='3'}
setTimeout(replaceIcons,0);
window.PacketLabV111Topology={openPresets:presetSelect,build,resizeSpecial,updateHeader,
 get entries(){return entries},get selected(){return chosen()},
 version:'0.11.1'};
console.info('PacketLab 0.11.1 topology UI: 18 presets, independent count selection, clean SVG controls.');
})();
