/* Veyra PacketLab 0.5 · accessible two-tap touch cabling.
   Existing desktop drag-and-drop is preserved; cables still use TopoLab ports. */
(() => {
'use strict';
const C=window.VeyraCore,N=window.VeyraNext,S=C?.state;
if(!C||!N)return;
const $=id=>document.getElementById(id);
const canvas=$('canvas'),stage=document.querySelector('.stage'),tools=document.querySelector('.v-float');
let pendingId=null,active=false;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svgPath='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9V6h4v5H5zM15 13h4v5h-4zM9 9h4v6h2"/></svg>';
const bar=document.createElement('div');
bar.id='vr-wiring-bar';bar.className='vr-wiring-bar';bar.hidden=true;
bar.innerHTML='<span class="vr-wiring-glyph">'+svgPath+'</span>'+
  '<div class="vr-wiring-copy"><strong id="vr-wire-status">Kabelmodus</strong>'+
  '<small id="vr-wire-hint">Startgerät antippen</small></div>'+
  '<button id="vr-wire-list" type="button">Aus Liste</button>'+
  '<button id="vr-wire-close" type="button" aria-label="Kabelmodus beenden">×</button>';
if(stage&&tools)stage.insertBefore(bar,tools);
const status=$('vr-wire-status'),hint=$('vr-wire-hint');
function notify(msg){
  if(window.VeyraRefine?.flash)window.VeyraRefine.flash(msg);
  else console.info('[Veyra Cable]',msg);
}
function isActive(){return S.tool==='add'&&S.addType==='cable'}
function reset(message=''){
  pendingId=null;
  if(message)notify(message);
  sync();
}
function sync(){
  active=isActive();
  bar.hidden=!active;
  document.body.classList.toggle('vr-wiring-active',active);
  if(!active)pendingId=null;
  const from=S.devices.find(d=>d.id===pendingId);
  status.textContent=from?'Start: '+from.label:'Kabel legen';
  hint.textContent=from?
    'Jetzt Zielgerät antippen • '+(window.PacketLabCore?.MEDIA[N.lab.medium]?.label||'Cable'):
    'Startgerät, dann Zielgerät antippen';
}
function onCableActive(){
  const chip=document.querySelector('#deviceTypes [data-dtype="cable"]');
  if(chip && !isActive())chip.click();
  sync();
  try{document.querySelector('.v-nav [data-tab="workspace"]')?.click()}catch(_){}
}
function selectByTouch(device){
  if(!device)return false;
  if(!pendingId) {
    pendingId=device.id;
    status.textContent='Start: '+device.label;
    hint.textContent='Zielgerät antippen';
    notify(device.label+' gewählt · Ziel antippen');
    sync();
    return true;
  }
  if(device.id===pendingId) {
    reset('Startauswahl zurückgesetzt');
    return true;
  }
  const from=S.devices.find(d=>d.id===pendingId);
  const before=S.links.length;
  const ok=C.connectDevices(pendingId,device.id);
  if(ok && S.links.length===before+1) {
    const medium=window.PacketLabCore?.MEDIA[N.lab.medium]?.label||'Cable';
    reset((from?.label||'Start')+' → '+device.label+' verbunden · '+medium);
  } else {
    // Port exhaustion and already-wired pairs are explained by TopoLab's log.
    status.textContent='Start: '+(from?.label||'?');
    hint.textContent='Verbindung fehlgeschlagen · anderen Port/Gerät wählen';
    notify('Verbindung fehlgeschlagen – Ports oder bestehendes Kabel prüfen');
  }
  return true;
}
function nearestDevice(p,maxScreenPx=27){
  const rect=canvas.getBoundingClientRect();
  const a=C.view.toLocal({clientX:rect.left+12,clientY:rect.top+12});
  const b=C.view.toLocal({clientX:rect.left+12+maxScreenPx,clientY:rect.top+12});
  const radius=Math.abs(b.x-a.x);
  let target=null,distance=Infinity;
  for(const d of S.devices){
    const dist=Math.hypot((d.tx??d.x)-p.x,(d.ty??d.y)-p.y);
    if(dist<radius&&dist<distance){distance=dist;target=d}
  }
  return target;
}
function handleTouchDown(event,hit,point){
  if(!isActive())return false;
  if(event.pointerType!=='touch')return false;
  if(event.isPrimary===false)return false;
  const d=hit||nearestDevice(point,25);
  if(d)selectByTouch(d);
  else notify(pendingId?'Zielgerät antippen oder „Aus Liste“ nutzen':'Zuerst ein Gerät antippen');
  return true;
}
function listConnector(){
  if(!isActive())onCableActive();
  const devices=S.devices;
  if(devices.length<2){notify('Mindestens zwei Geräte erforderlich');return}
  const opts=devices.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.label)+' · '+esc(d.type)+'</option>').join('');
  const defaultStart=pendingId||S.selected||devices[0].id;
  const defaultEnd=devices.find(d=>d.id!==defaultStart)?.id||devices[0].id;
  N.open('Kabel verbinden',
    '<div class="vr-wire-intro"><strong>Verbindung ohne Ziehen</strong>'+
    '<p>Wähle zwei Geräte. Portprüfung und Kabeltyp werden wie bei der normalen Canvas-Verkabelung berücksichtigt.</p></div>'+
    '<div class="vr-wire-form"><label><span>Startgerät</span><select id="vr-wire-from">'+opts+'</select></label>'+
    '<label><span>Zielgerät</span><select id="vr-wire-to">'+opts+'</select></label></div>'+
    '<div class="vr-wire-medium"><span>Kabeltyp</span><strong id="vr-wire-media">'+
    esc(window.PacketLabCore?.MEDIA[N.lab.medium]?.label||'Cable')+'</strong></div>'+
    '<div class="vr-wire-buttons"><button type="button" data-vr-connect="cancel">Abbrechen</button>'+
    '<button type="button" data-vr-connect="apply">Verbinden</button></div>',
    root=>{
      root.querySelector('#vr-wire-from').value=defaultStart;
      root.querySelector('#vr-wire-to').value=defaultEnd;
      root.querySelector('[data-vr-connect="cancel"]').onclick=()=>N.close();
      root.querySelector('[data-vr-connect="apply"]').onclick=()=>{
        const from=root.querySelector('#vr-wire-from').value;
        const to=root.querySelector('#vr-wire-to').value;
        if(from===to){notify('Start und Ziel müssen verschieden sein');return}
        if(C.connectDevices(from,to)){
          N.close();reset((S.devices.find(d=>d.id===from)?.label||'?')+' ↔ '+
            (S.devices.find(d=>d.id===to)?.label||'?')+' verbunden');
        } else notify('Prüfe vorhandene Kabel und verfügbare Ports');
      };
    },'medium');
}
$('vr-wire-list')?.addEventListener('click',listConnector);
$('vr-wire-close')?.addEventListener('click',()=>{C.setTool('select');reset('Kabelmodus beendet')});
window.addEventListener('veyra:toolchange',sync);
document.querySelector('#deviceTypes')?.addEventListener('click',()=>queueMicrotask(sync));
document.querySelector('.v-float')?.addEventListener('click',()=>queueMicrotask(sync));
document.querySelector('.v-palette')?.addEventListener('click',()=>queueMicrotask(sync));
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&isActive()&&document.getElementById('pl-sheet')?.hidden){
    event.preventDefault();C.setTool('select');reset();
  }
},true);
// Poll every 400ms only while the UI is visible, in case an upstream
// action changed a tool programmatically without dispatching an event.
const updater=setInterval(()=>{if(!document.hidden&&isActive()!==active)sync()},400);
window.addEventListener('pagehide',()=>clearInterval(updater));
window.VeyraWiring={handleTouchDown,nearestDevice,selectByTouch,listConnector,sync,
  reset,get pendingId(){return pendingId},get active(){return isActive()}};
sync();
})();
