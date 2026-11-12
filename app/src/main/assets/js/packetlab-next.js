/* Veyra PacketLab 0.3 · Native-feeling offline network studio.
   Uses the original TopoLab engine; no real attack/network traffic. */
(() => {
'use strict';
const P=PacketLabCore,C=window.VeyraCore,S=C.state,$=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
const device=id=>S.devices.find(d=>d.id===id);
const native=()=>!!window.VeyraNative;
const DAY=86400000, TTL=7*DAY;
const dkey='packetlab-drafts-v3',curkey='packetlab-current-v3';
const fmt=t=>new Date(t).toLocaleString('de-DE');
const timertext=t=>[Math.floor(t/3600),Math.floor(t/60)%60,t%60].map(x=>String(x).padStart(2,'0')).join(':');
const field=(n,label,v,type='text',attrs='')=>'<label class="pl-field"><span>'+esc(label)+'</span><input name="'+esc(n)+'" type="'+esc(type)+'" value="'+esc(v??'')+'" '+attrs+'></label>';
const select=(n,label,pairs,v)=>'<label class="pl-field"><span>'+esc(label)+'</span><select name="'+esc(n)+'">'+pairs.map(p=>'<option value="'+esc(p[0])+'" '+(String(p[0])===String(v)?'selected':'')+'>'+esc(p[1])+'</option>').join('')+'</select></label>';
const toggle=(n,label,v)=>'<label class="pl-toggle"><span>'+esc(label)+'</span><input name="'+esc(n)+'" type="checkbox" '+(v?'checked':'')+'><i></i></label>';
const btn=(name,label,style='')=>'<button class="pl-btn '+style+'" type="button" data-action="'+esc(name)+'">'+esc(label)+'</button>';
const vals=(root)=>{const v={};root.querySelectorAll('[name]').forEach(x=>v[x.name]=x.type==='checkbox'?x.checked:x.value);return v};
let lab=P.makeLab(),running=false,timer=null,selectedId=null,packet='normal',editingId=null;
let currentPanel=null,disposer=null,restoring=false,lastVersion='',newLinkMedia='cable';
const mask=document.createElement('div'); mask.id='pl-mask';mask.className='pl-mask';mask.hidden=true;
const sheet=document.createElement('section');sheet.id='pl-sheet';sheet.className='pl-sheet';sheet.hidden=true;
document.body.append(mask,sheet);
mask.addEventListener('click',close);
function close() {
  if(disposer){try{disposer()}catch(_){ }disposer=null}
  currentPanel=null;sheet.hidden=true;mask.hidden=true;sheet.replaceChildren();
}
function open(title,html,init=()=>{},size='normal') {
  close();currentPanel=title;sheet.hidden=false;mask.hidden=false;
  sheet.className='pl-sheet pl-'+size;
  sheet.innerHTML='<div class="pl-head"><div><strong>'+esc(title)+'</strong><small>Veyra PacketLab</small></div>'+
      '<button class="pl-icon" id="pl-close" aria-label="Schließen">×</button></div><div class="pl-body">'+html+'</div>';
  $('pl-close').addEventListener('click',close);
  if(typeof init === 'function') init(sheet.querySelector('.pl-body'));
  return sheet;
}
let noticeTimer;
function notice(msg) {
  let el=$('pl-notice');if(!el){el=document.createElement('div');el.id='pl-notice';el.className='pl-notice';document.body.append(el)}
  el.textContent=msg;el.classList.add('active');
  clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.classList.remove('active'),2500);
}
function event(type,text,ids=[]){
  const e=P.createEvent(lab,S.devices,text,type,ids);
  renderStatus();renderVirtualLog();
  return e;
}
function getDoc(){return JSON.parse(window.VeyraProject.dump())}
const original=window.VeyraProject;
const legacyDump=original.dump.bind(original),legacyLoad=original.load.bind(original);
function pack(){
  const old=JSON.parse(legacyDump());
  return JSON.stringify({format:'pklab',version:3,mode:lab.mode,
    title:lab.title,savedAt:Date.now(),topology:S.kind,snapshot:old.snapshot,
    studio:{...lab,logs:lab.logs.slice(-400),tasks:lab.tasks.slice(0,120),
      rooms:lab.rooms.slice(0,120),dnsRecords:lab.dnsRecords.slice(0,120)}},null,2);
}
function load(raw){
  if(typeof raw!=='string'||raw.length>8_000_000)throw Error('Projekt größer als 8 MB');
  const f=JSON.parse(raw);
  if(!f||!['pklab','veyra-packetlab/1'].includes(f.format))throw Error('Dateiformat ist ungültig');
  stopVS(false);restoring=true;
  try {
    if(f.format==='pklab'){
      if(f.version!==3||!f.snapshot||!f.studio||!['standard','master'].includes(f.mode))
        throw Error('Version oder Modus unbekannt');
      legacyLoad(JSON.stringify({format:'veyra-packetlab/1',snapshot:f.snapshot,topology:f.topology}));
      lab=Object.assign(P.makeLab(),f.studio,{mode:f.mode,title:String(f.title||'Netzwerk').slice(0,80)});
      for(const key of ['logs','rooms','tasks','dnsRecords'])lab[key]=Array.isArray(lab[key])?lab[key].slice(-400):[];
      for(const d of S.devices)d.vprofile=P.sanitizeProfile(d.vprofile||{},d);
    } else {
      legacyLoad(raw);lab=P.makeLab();
    }
    packet=P.PACKETS[lab.packet]?lab.packet:'normal';
  } finally {restoring=false}
  updateMode();renderStatus();renderVirtualLog();drawPlan();
  if(!lab.manualPaused)startVS();
  notice('Projekt geladen ('+(lab.mode==='master'?'Network Training Builder':'Network Lab')+')');
  return true;
}
original.dump=pack;
original.load=load;
original.loadBase64=function(b64){
  try {
    const b=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    return load(new TextDecoder('utf-8').decode(b));
  }catch(e){notice('Import: '+e.message);return false}
};
function draftList(){
  try{return JSON.parse(localStorage.getItem(dkey)||'[]').filter(
    d=>d&&Date.now()-d.time<TTL&&Date.now()-d.time>=-DAY&&typeof d.data==='string').slice(0,25)}
  catch(_){return []}
}
function saveDraft(reason='Presetwechsel') {
  if(restoring||!S.devices.length)return;
  try {
    const data=pack(),list=draftList();
    const stable=data.replace(/"savedAt":\s*\d+/g,'"savedAt":0');
    let hash=2166136261;
    for(let i=0;i<stable.length;i++){hash^=stable.charCodeAt(i);hash=Math.imul(hash,16777619)}
    const key=(hash>>>0).toString(16)+'-'+stable.length;
    if(list.some(d=>d.key===key&&d.preset===lab.preset))return;
    list.unshift({id:'d'+Date.now()+'-'+Math.random().toString(36).slice(2,6),
      time:Date.now(),title:lab.title,preset:lab.preset,mode:lab.mode,reason,data,key});
    // Mobile WebView may have a storage quota; preserve newest drafts first.
    while(list.length){
      try{localStorage.setItem(dkey,JSON.stringify(list.slice(0,25)));return}
      catch(e){if(list.length===1)throw e;list.pop()}
    }
  }catch(e){console.warn('Entwurf konnte nicht gespeichert werden',e)}
}
function autosave(){try{localStorage.setItem(curkey,pack())}catch(_){ }}
function retrieveSaved(){
  try {
    const saved=localStorage.getItem(curkey);
    if(saved&&JSON.parse(saved).format==='pklab')load(saved);
  }catch(e){console.warn('Altes Projekt konnte nicht geladen werden:',e.message)}
}
function doSave(){
  const data=pack();
  if(native())window.VeyraNative.saveProject(data);
  else {
    const url=URL.createObjectURL(new Blob([data],{type:'application/octet-stream'}));
    const a=document.createElement('a');a.href=url;
    a.download=(lab.title||'network').replace(/[^\w -]/g,'_')+'.pklab';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  autosave();notice('.pklab gespeichert');
}
function doOpen(){
  if(native()){window.VeyraNative.loadProject();return}
  const inp=document.createElement('input');inp.type='file';inp.accept='.pklab,.json';
  inp.onchange=async()=>{if(!inp.files?.[0])return;
    try{load(await inp.files[0].text())}catch(e){notice(e.message)}};
  inp.click();
}
$('v-save')?.addEventListener('click',e=>{e.stopImmediatePropagation();doSave()},true);
$('v-load')?.addEventListener('click',e=>{e.stopImmediatePropagation();filesPage()},true);

function updateMode(){
  document.body.classList.toggle('v06-learning-mode',lab.mode==='master');
  document.querySelector('.brand p').textContent=lab.mode==='master'?'NETWORK MASTER':'NETZWERK-SIMULATOR';
  const nav=document.querySelector('.v-nav');
  let action=nav?.querySelector('[data-tab="master"]');
  if(lab.mode==='master'&&!action&&nav){
    action=document.createElement('button');action.type='button';action.dataset.tab='master';
    action.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '+
      'stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+
      '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/></svg><span>Aufgaben</span>';
    action.addEventListener('click',masterPage);nav.append(action);
  }else if(lab.mode!=='master'&&action)action.remove();
  nav?.classList.toggle('pl-mastermode',lab.mode==='master');
}
function switchMode(mode,options={}){
  if(mode!==lab.mode){if(!options.skipDraft)saveDraft('Moduswechsel');lab.mode=mode;autosave()}
  updateMode();close();
  if(mode==='master')masterPage();else notice('Network Lab');
}
function modeMenu(){
  open('Arbeitsmodus','<div class="pl-options">'+
    '<button id="pl-standard"><b>Standard Lab'+(lab.mode==='standard'?' ✓':'')+'</b><small>Freies Netzwerk, Simulation und Geräte</small></button>'+
    '<button id="pl-master"><b>Network Master'+(lab.mode==='master'?' ✓':'')+'</b><small>Unterrichtslabore, Aufgaben und Bewertung</small></button>'+
    '<button id="pl-proj"><b>Projektordner</b><small>.pklab öffnen, Entwürfe und Dateien</small></button></div>',
  ()=>{
    $('pl-standard').onclick=()=>switchMode('standard');
    $('pl-master').onclick=()=>switchMode('master');
    $('pl-proj').onclick=filesPage;
  },'small');
}
const logo=document.querySelector('.brand__logo');
if(logo){
  logo.setAttribute('role','button');logo.tabIndex=0;logo.setAttribute('aria-label','Arbeitsmodus');
  logo.addEventListener('click',modeMenu);
  logo.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();modeMenu()}});
}
function filesPage(){
  const drafts=draftList();
  open('Projekte & Entwürfe',
    '<div class="pl-actions">'+btn('noop','Datei öffnen')+btn('noop','Als .pklab sichern')+'</div>'+
    '<p class="pl-help">Beim Presetwechsel sichern wir deine alte Topologie 7 Tage. Entwürfe bleiben lokal auf diesem Gerät.</p>'+
    '<div id="pl-draftlist" class="pl-list">'+(drafts.length?drafts.map(d=>
      '<article class="pl-file"><div><b>'+esc(d.title||'Netzwerk')+'</b><small>'+esc(d.reason)+' · '+esc(fmt(d.time))+'<br>'+esc(d.preset)+' · '+(d.mode==='master'?'Master':'Standard')+
      ' · Laufzeit '+timertext((()=>{try{return JSON.parse(d.data).studio?.clock||0}catch(_){return 0}})())+'</small></div>'+
      '<div>'+btn('restore:'+d.id,'Öffnen')+btn('del:'+d.id,'×','pl-danger')+'</div></article>').join(''):
      '<div class="pl-empty">Noch keine zwischengespeicherten Entwürfe</div>')+'</div>',
  box=>{
    box.querySelectorAll('.pl-actions button')[0].onclick=doOpen;
    box.querySelectorAll('.pl-actions button')[1].onclick=doSave;
    box.querySelectorAll('[data-action^="restore:"]').forEach(b=>b.onclick=()=>{
      const d=draftList().find(x=>x.id===b.dataset.action.slice(8));if(!d)return;
      saveDraft('Vor Wiederherstellung');load(d.data);close();
    });
    box.querySelectorAll('[data-action^="del:"]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.action.slice(4);const item=draftList().find(x=>x.id===id);
      if(!item)return;
      b.closest('.pl-file').innerHTML='<span>Entwurf wirklich löschen?</span><div>'+
          btn('cancel','× Abbrechen')+btn('confirm:'+esc(id),'✓ Löschen','pl-danger')+'</div>';
      const row=b.closest('.pl-file');
      row.querySelector('[data-action="cancel"]').onclick=filesPage;
      row.querySelector('[data-action^="confirm:"]').onclick=()=>{
        localStorage.setItem(dkey,JSON.stringify(draftList().filter(x=>x.id!==id)));filesPage();
      };
    });
  },'wide');
}

function renderStatus(){
  const b=$('pl-vs');if(!b)return;
  b.textContent=(running?'■ Stop VS':'▶ Start VS')+(lab.clock?' · '+timertext(lab.clock):'');
  b.classList.toggle('pl-running',running);
  const score=$('pl-health');
  if(score){const problems=P.audit(S,lab);score.textContent=problems.length?problems.length+' Hinweise':'Netzwerk bereit';
    score.title=problems.slice(0,6).map(x=>x.text).join(' | ')}
}
const bar=document.querySelector('.v-float');
if(bar) {
  const b=document.createElement('button');b.id='pl-vs';b.type='button';b.className='pl-vs';
  const history=bar.querySelector('.stage__history');
  bar.insertBefore(b,history||bar.firstChild);b.onclick=()=>running?(lab.manualPaused=true,stopVS(true)):startVS();
}
const status=document.createElement('span');status.id='pl-health';status.className='pl-health';
document.querySelector('.stage__bar')?.insertBefore(status,document.querySelector('.stage__controls'));
function startVS(){
  lab.manualPaused=false;
  if(running)return;
  running=true;lab.startedAt=Date.now();P.tick(S,lab,1);C.refresh();
  event('system','VS gestartet: virtueller Netzwerkbetrieb');
  timer=setInterval(()=>{
    if(!running)return;P.tick(S,lab,1);if(lab.clock%3===0)C.refresh();
    renderStatus();if(lab.clock%5===0)renderVirtualLog();
  },1000);
  renderStatus();return true;
}
function stopVS(addLog=true){
  if(timer!==null){clearInterval(timer);timer=null}
  const was=running;running=false;
  if(was&&addLog)event('system','VS angehalten nach '+timertext(lab.clock));
  renderStatus();return was;
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&running){stopVS(true);autosave()}
});
function runAudit(){
  const issues=P.audit(S,lab);
  open('Netzwerk-Audit','<div class="pl-summary">'+S.devices.length+' Geräte · '+S.links.length+' Verbindungen · '+issues.length+' Hinweise</div>'+
    (issues.length?'<div class="pl-list">'+issues.map(x=>'<article class="pl-row"><b>'+esc(device(x.id)?.label||'Gerät')+'</b><small>'+esc(x.text)+'</small></article>').join('')+'</div>':
      '<p class="pl-help">Keine offensichtlichen Konfigurationsfehler gefunden.</p>'),'');
}
function sendPacket(type=packet){
  // All types, including normal, use deterministic virtual delivery and device logs.
  const result=P.send(S,lab,S.src,S.dst,type,type==='mass'?50:1);
  if(result.ok&&result.route){
    const at=new Map(S.devices.map(d=>[d.id,d]));
    const data=P.PACKETS[type];
    if(Sim&&Sim.sendData&&C.engine&&!C.engine.busy()){
      try{Sim.sendData(C.engine,result.route,{label:type.toUpperCase(),
        port:data.port,devices:S.devices,links:S.links})}catch(e){console.warn('Packet animation',e)}
    }
  }
  renderStatus();renderVirtualLog();
  if(!result.ok)notice('Paket blockiert: '+result.reason);
  else notice(P.PACKETS[type]?.label+': '+result.hops+' Hops / '+result.latency+' ms');
  return result;
}
const packetsDiv=document.querySelector('.sendbar__row--actions');
if(packetsDiv) {
  const more=document.createElement('button');more.id='pl-packet';more.type='button';
  more.className='pl-packet';more.title='Paketart wählen';more.textContent='▾';
  more.addEventListener('click',packagePage);
  $('btnSend').insertAdjacentElement('afterend',more);
  $('btnSend').addEventListener('click',e=>{
    if(packet!=='normal'){e.preventDefault();e.stopImmediatePropagation();sendPacket()}
  },true);
}
function packagePage() {
  open('Paketart wählen','<p class="pl-help">Nur Simulation. Quellgerät und Zielgerät bleiben unten frei auswählbar.</p>'+
    '<div class="pl-list">'+Object.entries(P.PACKETS).map(([key,cfg])=>
      '<button class="pl-row pl-selectrow" data-packet="'+esc(key)+'"><b>'+esc(cfg.label)+(packet===key?' ✓':'')+'</b><small>'+esc(cfg.bytes)+' Byte'+(cfg.count?' × '+cfg.count:'')+'</small></button>').join('')+'</div>'+
    '<div class="pl-actions">'+btn('sendnow','Jetzt senden','pl-primary')+'</div>',root=>{
    root.querySelectorAll('[data-packet]').forEach(x=>x.onclick=()=>{
      packet=x.dataset.packet;lab.packet=packet;
      $('pl-packet').textContent='▾';
      $('pl-packet').title=P.PACKETS[packet].label;
      $('btnSend').textContent=packet==='normal'?'▶ Paket senden':'▶ '+P.PACKETS[packet].label;
      close();
    });
    root.querySelector('[data-action="sendnow"]').onclick=()=>{close();sendPacket()};
  });
}
function externalScenario(target,type) {
  // A synthetic internet origin exists only inside the in-memory simulation,
  // never as a real socket, DNS request, device or Android permission.
  const ingress=S.devices.find(d=>!d.dead &&
    (d.vprofile?.internet || d.vprofile?.tunnel || ['cloud','modem'].includes(d.type)) &&
    (Number(d.vprofile?.wanPort)>0 || d.vprofile?.tunnel));
  if(!ingress){
    event('blocked','Externer Traffic abgewiesen: Kein konfigurierter WAN-Ingress',[target]);
    return {ok:false,reason:'WAN / Port / Tunnel nicht eingerichtet'};
  }
  const virtual=Topologies.device('pc','EXTERNAL WAN',ingress.tx-120,ingress.ty-100,{
    ip:'203.0.113.99',ips:['203.0.113.99'],
    mac:'02:00:5E:00:53:99',gateway:'203.0.113.1',
    vprofile:{ipv4:'203.0.113.99',gateway:'203.0.113.1',subnet:'255.255.255.0',security:100}
  });
  const link=Topologies.link(virtual,ingress,'line',{medium:'cable'});
  return P.send({devices:S.devices.concat([virtual]),links:S.links.concat([link])},
    lab,virtual.id,target,type);
}
function askAttack(){
  open('Virtueller Angriff','<p class="pl-help">Ein isoliertes Lern-Szenario. Es werden keinerlei echte Geräte oder Netzwerke angegriffen.</p>'+
    select('attackType','Szenario',[['malformed','HTTP-Manipulation'],['scan','Portscan'],['worm','Simulierter Wurm']],'malformed')+
    select('strength','Intensität',[['1','Niedrig'],['2','Mittel'],['3','Hoch'],['5','Extrem']],'1')+
    toggle('spread','Automatische Ausbreitung zulassen',lab.spread)+
    select('origin','Quelle',[['external','Extern / Internet']].concat(S.devices.map(d=>[d.id,d.label])),'external')+
    select('target','Ziel',S.devices.map(d=>[d.id,d.label]),S.dst)+
    '<div class="pl-actions">'+btn('run','Szenario starten','pl-primary')+'</div>',root=>{
      root.querySelector('[data-action="run"]').onclick=()=>{
        const v=vals(root);lab.spread=v.spread;lab.attackStrength=+v.strength;
        let success=0,blocked=0;for(let i=0;i<Math.min(10,+v.strength*2);i++){
          const r=v.origin==='external'?externalScenario(v.target,v.attackType):P.send(S,lab,v.origin,v.target,v.attackType);r.ok?success++:blocked++;
        }
        // Propagation is restricted to the explicitly triggered scenario.
        // It must NEVER keep attacking automatically during ordinary VS operation.
        if(lab.spread===true) {
          lab.scenarioRunning=true;
          try {P.tick(S,lab,5)} finally {lab.scenarioRunning=false}
        }
        event('security','Szenario '+v.attackType+': '+success+' zugestellt / '+blocked+' abgewehrt',[v.origin,v.target]);
        close();notice('Szenario abgeschlossen: '+blocked+' blockiert');
      };
  });
}
function simMenu() {
  open('Virtual Simulation','<div class="pl-summary">'+(running?'Simulation läuft':'Simulation angehalten')+' · '+timertext(lab.clock)+'</div>'+
    '<div class="pl-actions">'+btn('start','▶ Start VS','pl-primary')+btn('stop','■ Stop VS')+btn('reset','Zeit zurücksetzen')+'</div>'+
    '<div class="pl-list">'+
      '<button class="pl-row pl-selectrow" data-page="audit"><b>Netzwerk-Audit</b><small>Geräte, Routing, DHCP, DNS, Security</small></button>'+
      '<button class="pl-row pl-selectrow" data-page="attack"><b>Attack Simulator</b><small>Virtueller Schutztest und Ausbreitung</small></button>'+
      '<button class="pl-row pl-selectrow" data-page="log"><b>Ereignisprotokoll</b><small>Alle Geräte und Traffic-Filter</small></button></div>'+
      toggle('spread','Ausbreitung nur während bewusst gestarteter Sicherheitstests',lab.spread),root=>{
        root.querySelector('[data-action="start"]').onclick=()=>{startVS();close()};
        root.querySelector('[data-action="stop"]').onclick=()=>{lab.manualPaused=true;stopVS();close()};
        root.querySelector('[data-action="reset"]').onclick=()=>{stopVS();lab.clock=0;renderStatus();simMenu()};
        root.querySelector('[data-page="audit"]').onclick=runAudit;
        root.querySelector('[data-page="attack"]').onclick=askAttack;
        root.querySelector('[data-page="log"]').onclick=logPage;
        root.querySelector('[name="spread"]').onchange=e=>lab.spread=e.target.checked;
      });
}
// Right/left panels remain from the existing application. Add filters, not a replacement.
const logRoot=$('eventLog');
const logGroup=logRoot?.closest('.group');
if(logGroup){
  const filter=document.createElement('select');filter.id='pl-logfilter';
  filter.className='pl-log-filter';
  filter.innerHTML='<option value="all">Alle Ereignisse</option><option value="traffic">Traffic</option>'+
    '<option value="warn">Warnungen</option><option value="security">Sicherheit</option>'+
    '<option value="system">System</option>';
  logGroup.insertBefore(filter,logRoot);
  function applyLogFilter(){
    const v=filter.value;
    logRoot.querySelectorAll('li').forEach(li=>{
      const t=li.textContent.toLowerCase();
      li.hidden=v==='all'?false:v==='traffic'?/packet|arp|route|port|data|ping|dns|traffic/.test(t):
        v==='warn'?/fail|drop|down|warn|error|blocked/.test(t):
        v==='security'?/firewall|block|security|attack|vuln|threat/.test(t):/ready|topology|undo|redo|reset/.test(t);
    });
  }
  filter.onchange=applyLogFilter;
  new MutationObserver(applyLogFilter).observe(logRoot,{childList:true,subtree:false});
}
function renderVirtualLog(){}
function logPage(filter='all'){
  const events=lab.logs.slice(-160).reverse().filter(x=>filter==='all'||x.kind===filter);
  open('Simulation & Logs',
    select('logtype','Filter',[['all','Alle'],['traffic','Traffic'],['security','Security'],['blocked','Geblockt'],['system','System'],['warning','Warnung'],['dhcp','DHCP']],filter)+
    '<div class="pl-list pl-console-list">'+events.map(e=>
      '<article class="pl-row"><b>'+timertext(e.time)+' · '+esc(e.kind)+'</b><small>'+esc(e.text)+'</small></article>').join('')+
      '</div>',root=>root.querySelector('[name="logtype"]').onchange=e=>logPage(e.target.value),'wide');
}
function injectSimulatorMenu(){
  const b=document.createElement('button');b.className='pl-tool';b.textContent='⋯';b.id='pl-simtool';
  b.title='Simulation, Audit und Attack';b.onclick=simMenu;
  const bar=document.querySelector('.v-float');bar?.insertBefore(b,bar.querySelector('.v-fab--main'));
}
injectSimulatorMenu();

function presetBuild(kind,count=8,options={}){
  if(!options.skipDraft)saveDraft('Presetwechsel: '+kind);
  stopVS(false);
  if(kind==='empty'){C.empty();lab.preset='empty';lab.title='Leeres Lab';renderStatus();close();startVS();return}
  const originalPresets=Topologies.KINDS;
  if(originalPresets.includes(kind)){
    C.regenerate(kind,Math.max(3,Math.min(count,40)),{fly:false});
    lab.preset=kind;lab.title=Topologies.META[kind].name+' Lab';
    close();return;
  }
  const big={office:13,campus:25,datacenter:24,dual:19,random:count};
  const n=Math.max(5,Math.min(40,big[kind]||count));
  if(kind==='dual'){
    const a=Topologies.generate('star',8,600,650);
    const b=Topologies.generate('star',8,600,650);
    for(const d of b.devices){d.x+=850;d.tx+=850;}
    const rA=Topologies.device('router','WAN-A',610,90,{subnet:1});
    const rB=Topologies.device('router','WAN-B',1450,90,{subnet:2});
    [rA,rB].forEach((d,i)=>{d.mac=Topologies.macFor(d.id);d.ip='192.168.'+(i+1)+'.1';d.ips=[d.ip];d.gateway=undefined});
    const nodes=[...a.devices,...b.devices,rA,rB];
    const links=[...a.links,...b.links,
      Topologies.link(a.devices.find(d=>d.type==='switch')||a.devices[0],rA),
      Topologies.link(b.devices.find(d=>d.type==='switch')||b.devices[0],rB),
      Topologies.link(rA,rB,'line',{medium:'tunnel',backup:true})];
    nodes.forEach((d,i)=>{
      d.vprofile=P.sanitizeProfile({company:i<8?'Firma A':i<16?'Firma B':'WAN',
        ipv4:d.ip,gateway:i<8?rA.ip:i<16?rB.ip:'',
        wanPort:i>=16?51820:0,tunnel:i>=16},d);
      if(i>=8&&i<16){d.ip='192.168.2.'+(10+i-8);d.ips=[d.ip];d.vprofile.ipv4=d.ip}
    });
    Topologies.fitPorts(nodes,links);Topologies.recost(nodes,links);
    C.replace(nodes,links,a.devices[1]?.id||rA.id,b.devices[1]?.id||rB.id);
  }else{
    const gen=Topologies.generate(kind==='datacenter'?'mesh':'hybrid',
      kind==='datacenter'?14:n,Math.max(900,n*75),Math.max(600,n*28));
    if(kind==='random'){
      // Every new Randomize generates genuinely different physical networks.
      const variants=['pc','laptop','server','switch','router','firewall',
        'phone','camera','iot','plc','dns','dhcp','nas','ap','loadbalancer'];
      gen.devices.forEach((d,i)=>{
        if(i>0&&Math.random()<0.58){
          const type=variants[Math.floor(Math.random()*variants.length)];
          d.type=type;d.label=Topologies.TYPES[type].prefix+'-'+(i+1);
          d.ports=Topologies.TYPES[type].ports;
          d.services=Topologies.servicesFor(type);
        }
        const offX=(Math.random()-.5)*135,offY=(Math.random()-.5)*90;
        d.x+=offX;d.tx=d.x;d.y+=offY;d.ty=d.y;
      });
      // Add a few physically possible redundant links; no self-links or duplicates.
      let tries=0,linksToAdd=Math.max(2,Math.floor(n/5));
      while(linksToAdd>0&&tries++<n*12){
        const a=gen.devices[Math.floor(Math.random()*gen.devices.length)];
        const b=gen.devices[Math.floor(Math.random()*gen.devices.length)];
        if(a===b||gen.links.some(l=>(l.a===a.id&&l.b===b.id)||
          (l.b===a.id&&l.a===b.id)))continue;
        gen.links.push(Topologies.link(a,b));
        linksToAdd--;
      }
      Topologies.fitPorts(gen.devices,gen.links);
      Topologies.recost(gen.devices,gen.links);
    }
    gen.devices.forEach((d,i)=>{
      const company=kind==='random'?['Firma Nord','Firma Süd','Rechenzentrum','Filiale'][Math.floor(i/10)%4]:
        kind==='campus'?['Gebäude A','Gebäude B','Campus-Core'][Math.floor(i/9)%3]:
        kind==='datacenter'?'Datacenter':'Standort Hauptsitz';
      d.vprofile=P.sanitizeProfile({company,ipv4:d.ip,domain:(d.label+'.lab').toLowerCase(),
        dnsEnabled:d.type==='server',dhcpServer:d.type==='server'&&i===0,
        internet:d.type==='router'},d);
    });
    C.replace(gen.devices,gen.links,gen.devices[0]?.id,gen.devices[gen.devices.length-1]?.id);
  }
  lab.preset=kind;lab.title=({
    office:'Office Network',campus:'Campus Lab',datacenter:'Datacenter',
    dual:'Zwei Firmen + WAN',random:'Random Multi-Site'})[kind]||'Netzwerk';
  event('system','Neue Topologie: '+lab.title);
  close();renderStatus();startVS();
}
function morePresets(){
  const original=Topologies.KINDS.map(k=>[k,Topologies.META[k].name]);
  const additions=[['empty','Leeres Lab'],['office','Office'],['campus','Campus'],
    ['datacenter','Datacenter'],['dual','2 Firmen / WAN'],['random','Randomize']];
  const list=original.concat(additions);
  open('Topologie wählen','<p class="pl-help">Dein bisheriges Netzwerk wird vor dem Wechsel 7 Tage als Entwurf gespeichert.</p>'+
    '<div class="pl-presets">'+list.map(([k,v])=>
      '<button data-preset="'+esc(k)+'" class="pl-preset '+(lab.preset===k?'is-active':'')+'"><b>'+esc(v)+'</b><small>'+
      esc(k==='empty'?'Von Grund auf bauen':k==='random'?'Von klein bis Multi-Standort':
        k==='dual'?'Zwei Netze mit VPN-Tunnel':k==='campus'?'Mehrere Etagen und Core':k==='office'?'Büro mit Clients':k==='datacenter'?'Redundante Server':'Preset')+'</small></button>').join('')+'</div>'+
    '<div class="pl-divider"></div>'+
    select('rndsize','Random-Größe',[[8,'Klein (8)'],[16,'Mittel (16)'],[28,'Groß (28)'],[40,'Mega (40)']],28),
    root=>root.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{
      const n=+root.querySelector('[name="rndsize"]').value;presetBuild(b.dataset.preset,n);
    }), 'wide');
}
$('btnTopoPick')?.addEventListener('click',e=>{e.stopImmediatePropagation();morePresets()},true);
// Original desktop preset chips still work; they archive first.
document.querySelectorAll('#topoBar [data-topo]').forEach(el=>el.addEventListener('click',()=>{
  saveDraft('Presetwechsel');lab.preset=el.dataset.topo;
  lab.title=Topologies.META[el.dataset.topo].name+' Lab';
},true));
$('nodeCount')?.addEventListener('change',()=>saveDraft('Gerätezahl geändert'),true);
// Dedicated shortcut on desktop and tablets; mobile top-left preset selector stays.
const presetShortcut=document.createElement('button');
presetShortcut.id='pl-morepresets';presetShortcut.className='pl-tool';presetShortcut.title='Mehr Topologien';
presetShortcut.textContent='▤';presetShortcut.onclick=morePresets;
document.querySelector('.v-float')?.insertBefore(presetShortcut,$('pl-simtool'));
function setMedium(media){
  if(!P.MEDIA[media])return;
  newLinkMedia=media;lab.medium=media;
  notice('Kabelart: '+P.MEDIA[media].label);
}
function cableMenu(){
  open('Verbindungstyp','<p class="pl-help">Cable bleibt Standard. Andere Medien verändern die simulierte Bandbreite, Reichweite und Latenz.</p>'+
    '<div class="pl-list">'+Object.entries(P.MEDIA).map(([k,m])=>
      '<button class="pl-row pl-selectrow" data-media="'+k+'"><b>'+esc(m.label)+(lab.medium===k?' ✓':'')+
      '</b><small>'+m.mbps+' Mbit/s · '+m.latency+' ms · '+m.maxMetres+' m</small></button>').join('')+'</div>',
    root=>root.querySelectorAll('[data-media]').forEach(b=>b.onclick=()=>{
      setMedium(b.dataset.media);close();
      const chip=document.querySelector('[data-dtype="cable"]');
      if(chip&&!chip.classList.contains('is-active'))chip.click();
    }),'wide');
}
// Append a selector into the existing device palette (do not change device icons).
const palette=document.querySelector('.v-palette');
if(palette){
  const p=document.createElement('div');p.className='pl-cable-palette';
  p.innerHTML='<button type="button" id="pl-medium">Kabelart: Cable (automatisch) ⌄</button>';
  palette.querySelector('.v-palette-head')?.insertAdjacentElement('afterend',p);
  $('pl-medium').onclick=cableMenu;
}
function tagNewLinks(){
  for(const l of S.links)if(!l.medium)l.medium=newLinkMedia;
  for(const d of S.devices)if(!d.vprofile)d.vprofile=P.sanitizeProfile({},d);
}
window.addEventListener('veyra:graphchange',tagNewLinks);
tagNewLinks();

const selectedBar=document.createElement('div');selectedBar.id='pl-selected';selectedBar.className='pl-selected';
document.querySelector('.stage')?.insertBefore(selectedBar,document.querySelector('#canvas'));
function updateSelected(){
  const d=device(S.selected);if(!d){selectedBar.hidden=true;return}
  selectedId=d.id;selectedBar.hidden=false;
  selectedBar.innerHTML='<span>'+esc(d.label)+'</span>'+
    btn('src','Sender')+btn('dst','Empfänger')+
    btn('quickedit','Bearbeiten')+btn('terminal','Terminal')+
    btn('hide','×');
  selectedBar.querySelector('[data-action="src"]').onclick=()=>{S.src=d.id;$('srcSelect').value=d.id;$('srcSelect').dispatchEvent(new Event('change',{bubbles:true}));notice(d.label+' als Sender')};
  selectedBar.querySelector('[data-action="dst"]').onclick=()=>{S.dst=d.id;$('dstSelect').value=d.id;$('dstSelect').dispatchEvent(new Event('change',{bubbles:true}));notice(d.label+' als Empfänger')};
  selectedBar.querySelector('[data-action="quickedit"]').onclick=()=>showDeviceActions(d.id);
  selectedBar.querySelector('[data-action="terminal"]').onclick=()=>terminal(d.id);
  selectedBar.querySelector('[data-action="hide"]').onclick=()=>{S.selected=null;selectedBar.hidden=true;C.renderInspector()};
}
// Pointerup updates the selection AFTER the original controller's pointer listeners.
$('canvas')?.addEventListener('pointerup',()=>setTimeout(updateSelected,0));
window.addEventListener('veyra:graphchange',()=>setTimeout(updateSelected,0));
selectedBar.hidden=true;

function power(id,on){
  const d=device(id);if(!d)return;
  C.setPower(id,on);event('system',d.label+' '+(on?'eingeschaltet':'ausgeschaltet'),[id]);
  updateSelected();
}
function showDeviceActions(id){
  const d=device(id);if(!d)return;
  S.selected=id;selectedId=id;updateSelected();
  open(d.label+' · '+d.type.toUpperCase(),'<div class="pl-device-info">'+
    '<b>'+esc(d.ip||'Keine IPv4')+'</b><small>'+esc(d.mac||'')+' · '+(d.dead?'Offline':'Online')+'</small></div>'+
    '<div class="pl-options">'+
    '<button data-action="easy"><b>Easy Edit</b><small>Name, IPv4, MAC, Gateway, Ports</small></button>'+
    '<button data-action="more"><b>Edit More</b><small>Hardware, IPv6, DNS, VLAN, Security, WAN</small></button>'+
    '<button data-action="term"><b>Terminal</b><small>Virtuelle Linux-Netzwerkkonsole</small></button>'+
    '<button data-action="logs"><b>Geräte-Log</b><small>Pakete, Warnungen und Systemereignisse</small></button>'+
    '<button data-action="power"><b>'+(d.dead?'Einschalten':'Ausschalten')+'</b><small>Power und Linkzustand simulieren</small></button>'+
    '</div><div class="vr-destructive-action"><button type="button" class="vr-delete-device" data-action="delete" aria-label="Gerät löschen">'+
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+
    '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>'+
    '<span>Gerät löschen</span></button></div>',root=>{
      root.querySelector('[data-action="easy"]').onclick=()=>{close();C.editDevice(d.id)};
      root.querySelector('[data-action="more"]').onclick=()=>editMore(d.id);
      root.querySelector('[data-action="term"]').onclick=()=>terminal(d.id);
      root.querySelector('[data-action="logs"]').onclick=()=>deviceLogs(d.id);
      root.querySelector('[data-action="power"]').onclick=()=>{power(d.id,d.dead);showDeviceActions(d.id)};
      root.querySelector('[data-action="delete"]').onclick=()=> {
        open('Gerät entfernen',
          '<div class="vr-delete-confirm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">'+
          '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>'+
          '<strong>'+esc(d.label)+' entfernen?</strong>'+
          '<p>Das Gerät und alle verbundenen Kabel werden aus diesem Lab entfernt. Du kannst die Änderung mit Rückgängig wiederherstellen.</p></div>'+
          '<div class="vr-delete-buttons"><button type="button" data-action="cancel">Abbrechen</button>'+
          '<button type="button" data-action="confirm">Gerät löschen</button></div>',form=>{
            form.querySelector('[data-action="cancel"]').onclick=()=>showDeviceActions(d.id);
            form.querySelector('[data-action="confirm"]').onclick=()=>{
              if(C.removeDevice(d.id)){
                close();updateSelected();
                notice(d.label+' entfernt · Rückgängig verfügbar');
              }
            };
          },'small');
      };
    });
}

function editMore(id){
  if(lab.mode==='master'){terminal(id);return}
  const d=device(id);if(!d)return;
  const p=P.profileFor(d);
  const hw='<h3>Hardware & Kapazität</h3><div class="pl-grid">'+
    field('cpu','CPU-Kerne',p.cpu,'number','min="1" max="128"')+
    field('ramGB','RAM (GB)',p.ramGB,'number','min="0.5" max="2048" step=".5"')+
    field('storageGB','Speicher (GB)',p.storageGB,'number','min="1" max="65536"')+
    field('mtu','MTU (Byte)',p.mtu,'number','min="576" max="9000"')+
    field('uploadMbps','Upload Mbit/s',p.uploadMbps,'number','step=".1" min=".1"')+
    field('downloadMbps','Download Mbit/s',p.downloadMbps,'number','step=".1" min=".1"')+'</div>';
  const ips='<h3>IP, Routing & Dienste</h3><div class="pl-grid">'+
    field('hostname','Hostname',p.hostname||d.label)+field('ipv4','IPv4',p.ipv4||d.ip)+
    field('subnet','Subnetzmaske',p.subnet)+field('ipv6','IPv6',p.ipv6)+
    field('gateway','Gateway IPv4',p.gateway||d.gateway||'')+
    field('dnsServer','DNS-Server IPv4',p.dnsServer)+field('domain','Domain / DNS-Name',p.domain)+
    field('vlan','VLAN',p.vlan,'number','min="1" max="4094"')+
    field('wanPort','WAN / Tunnel-Port',p.wanPort,'number','min="0" max="65535"')+
    field('company','Standort / Firma',p.company)+'</div>'+
    toggle('internet','Internet-/WAN-Anschluss aktiviert',p.internet)+
    toggle('tunnel','VPN-Tunnel aktiv',p.tunnel)+
    toggle('dhcp','DHCP-Client',p.dhcp)+toggle('dhcpServer','DHCP-Server',p.dhcpServer)+
    toggle('dnsEnabled','DNS-Dienst',p.dnsEnabled)+toggle('icmp','ICMP Ping zulassen',p.icmp);
  const sec='<h3>Sicherheit & Wartung</h3><div class="pl-grid">'+
    field('security','Sicherheitsgrad 0–100',p.security,'number','min="0" max="100"')+
    select('os','Virtuelles OS',[['Linux','Linux'],['OpenWrt','OpenWrt'],['RouterOS','RouterOS'],
      ['Cisco IOS (Modell)','Cisco IOS (Modell)'],['Windows','Windows'],['Android','Android']],p.os)+'</div>'+
    toggle('patched','Gerät ist gepatcht',p.patched)+
    toggle('firewallEnabled','Firewall aktiviert',p.firewallEnabled)+
    toggle('blockThreats','Threat Protection: Virtuelle Bedrohung blocken',p.blockThreats)+
    toggle('maintenance','Wartung / geplanter Ausfall',p.maintenance)+
    '<label class="pl-field"><span>Notizen</span><textarea name="note" rows="2">'+esc(p.note)+'</textarea></label>';
  open('Edit More · '+d.label,
    '<p class="pl-help">Diese Einstellungen sind Teil des virtuellen Netzwerkmodells und werden in der .pklab-Datei gespeichert.</p>'+
    hw+ips+sec+'<div id="pl-error" class="pl-error" hidden></div>'+
    '<div class="pl-actions">'+btn('save','Änderungen übernehmen','pl-primary')+
    btn('oldedit','Easy Edit öffnen')+'</div>',
  root=>{
    root.querySelector('[data-action="oldedit"]').onclick=()=>{close();C.editDevice(id)};
    root.querySelector('[data-action="save"]').onclick=()=>{
      const v=vals(root),fail=$('pl-error');
      if(v.ipv4&&!P.v4(v.ipv4)){fail.textContent='Ungültige IPv4-Adresse';fail.hidden=false;return}
      if(v.ipv6&&!P.v6(v.ipv6)){fail.textContent='Ungültige IPv6-Adresse';fail.hidden=false;return}
      if(!P.v4(v.subnet)){fail.textContent='Ungültige Subnetzmaske';fail.hidden=false;return}
      if(v.gateway&&!P.v4(v.gateway)){fail.textContent='Ungültiger Gateway';fail.hidden=false;return}
      if(v.dnsServer&&!P.v4(v.dnsServer)){fail.textContent='Ungültiger DNS-Server';fail.hidden=false;return}
      if(v.ipv4&&S.devices.some(x=>x.id!==d.id&&(x.ips||[x.ip]).includes(v.ipv4))){
        fail.textContent='IPv4-Adresse bereits vergeben';fail.hidden=false;return
      }
      C.pushHistory();
      d.vprofile=P.sanitizeProfile({...p,...v},d);
      if(v.ipv4){d.ip=v.ipv4;d.ips=[v.ipv4]}
      d.gateway=v.gateway||undefined;
      event('system',d.label+': Profil aktualisiert (IPv4/IPv6/DNS/QoS/Security)',[id]);
      C.refresh();close();notice('Gerät eingerichtet');
    };
  },'wide');
}
function deviceLogs(id){
  const d=device(id);if(!d)return;
  const p=P.profileFor(d);
  const items=p.logs.slice().reverse();
  const hops=(d.seen||[]).slice(0,15);
  open('Log · '+d.label,'<div class="pl-summary">Senden: '+p.sent+' · Empfangen: '+p.received+
    ' · Uptime: '+timertext(p.uptime)+'</div>'+
    '<div class="pl-list pl-console-list">'+
      items.map(x=>'<article class="pl-row"><b>'+timertext(x.time)+' · '+esc(x.type)+'</b><small>'+esc(x.text)+'</small></article>').join('')+
      hops.map(x=>'<article class="pl-row"><b>'+esc(x.kind)+' · '+esc(x.dir)+'</b><small>'+
        esc(x.fromLabel)+' → '+esc(x.toLabel)+' · '+esc(x.proto)+'</small></article>').join('')+
      (!items.length&&!hops.length?'<p class="pl-help">Noch keine Ereignisse – Starte VS oder sende Pakete.</p>':'')+
      '</div>','', 'wide');
}
function commandResult(id,text){
  if(window.VeyraTerminal?.execute) return window.VeyraTerminal.execute(id,text);
  const d=device(id);if(!d)return 'Gerät nicht verfügbar';
  const p=P.profileFor(d),args=String(text).trim().split(/\s+/),cmd=args[0]?.toLowerCase();
  const other=q=>S.devices.find(x=>x.id!==d.id&&
    [x.ip,x.vprofile?.hostname,x.label,x.vprofile?.domain].some(n=>n&&String(n).toLowerCase()===String(q).toLowerCase()));
  const dest=q=>{const found=other(q);return found||null};
  if(!cmd)return '';
  if(cmd==='help')return [
    'Veyra Virtual Terminal · ausschließlich Simulation',
    'help, hostname, uname -a, uptime, free -h, df -h',
    'ip addr | ip -6 addr | ip route | ip neigh',
    'ip link set up|down, ifconfig, arp -a',
    'ping [-c N] <IPv4/Hostname>, traceroute <Ziel>',
    'nslookup <Name>, dig <Name>, cat /etc/resolv.conf',
    'ss -tuln, netstat, tcpdump, ethtool, ufw status',
    'ufw enable|disable|deny 80, poweroff, reboot',
    'exit'
  ].join('\n');
  if(cmd==='hostname')return p.hostname||d.label;
  if(cmd==='uname')return p.os+' / Veyra Virtual Kernel v0.3';
  if(cmd==='uptime')return 'up '+timertext(p.uptime)+' · '+(d.dead?'OFFLINE':'ONLINE');
  if(cmd==='free')return 'Mem: '+p.ramGB+' GB configured';
  if(cmd==='df')return '/dev/virtualdisk '+p.storageGB+'G   24% used';
  if(cmd==='whoami'||cmd==='id')return 'uid=1000(labuser) gid=1000(labuser)';
  if(cmd==='ip'||cmd==='ifconfig'){
    if(args.includes('link')&&args.includes('set')){
      if(args.includes('down')){power(id,false);return 'Interface down'}
      if(args.includes('up')){power(id,true);return 'Interface up'}
    }
    if(args.includes('route'))return 'default via '+(p.gateway||d.gateway||'nicht konfiguriert')+
      '\n'+(d.ip||'0.0.0.0')+' mask '+p.subnet+' dev eth0';
    if(args.includes('neigh'))return [...(d.arp||new Map()).entries()].map(([ip,mac])=>ip+' lladdr '+mac+' dev eth0').join('\n')||'Neighbor cache empty';
    if(args.includes('-6'))return 'inet6 '+(p.ipv6||'nicht konfiguriert')+' dev eth0';
    return 'eth0: '+(d.dead?'DOWN':'UP')+' mtu '+p.mtu+
      '\n   inet '+(d.ip||p.ipv4)+' netmask '+p.subnet+
      '\n   inet6 '+(p.ipv6||'–')+'  ether '+d.mac;
  }
  if(cmd==='arp')return [...(d.arp||new Map()).entries()].map(([ip,mac])=>ip+' at '+mac).join('\n')||'ARP table empty';
  if(cmd==='ethtool')return 'Link '+(d.dead?'Down':'Up')+
    '\nSpeed '+p.downloadMbps+' Mbps / Duplex Full';
  if(cmd==='ss'||cmd==='netstat')return 'State  Local Address : Port\n'+
    (d.services||[]).map(s=>'LISTEN  0.0.0.0:'+s.port+' ('+s.name+')').join('\n');
  if(cmd==='tcpdump')return (p.logs||[]).slice(-9).map(x=>x.type+' '+x.text).join('\n')||'No captured virtual traffic';
  if(cmd==='cat'&&args.includes('/etc/resolv.conf'))return 'nameserver '+(p.dnsServer||'nicht eingerichtet');
  if(cmd==='nslookup'||cmd==='dig'){
    const name=args[1];if(!name)return 'Syntax: nslookup <Hostname>';
    const data=P.resolveDns(S,lab,id,name,'A');
    return data.error?data.error:'Server '+data.server+'\nName '+name+'\nAddress '+data.answer;
  }
  if(cmd==='ping'||cmd==='traceroute'){
    const target=args[args.length-1];
    let resolved=target;
    if(!P.v4(target)) {
      const answer=P.resolveDns(S,lab,id,target,'A');
      if(answer.error)return 'DNS-Lookup fehlgeschlagen: '+answer.error;
      resolved=answer.answer;
    }
    const to=dest(resolved);
    if(!to)return 'Unbekanntes Ziel: '+target+' / '+resolved;
    const r=P.evaluate(S,lab,id,to.id,'icmp');
    if(!r.ok){event('blocked',d.label+' ping '+to.label+': '+r.reason,[id,to.id]);return 'Destination unreachable: '+r.reason}
    const msg=(cmd==='ping'?'PING '+to.label+': 64 bytes from ':'traceroute to '+to.label+'\n')+
      to.ip+' ttl=64 time='+r.latency+'ms hops='+r.hops;
    event('traffic',d.label+' ping '+to.label+' '+r.latency+'ms',[id,to.id]);return msg;
  }
  if(cmd==='ufw'){
    if(args[1]==='status')return 'Status: '+(p.firewallEnabled?'active':'inactive')+
      ', threat prevention '+(p.blockThreats?'ON':'OFF');
    if(args[1]==='enable'||args[1]==='disable'){
      d.vprofile=d.vprofile||p;d.vprofile.firewallEnabled=args[1]==='enable';
      return 'Virtual firewall '+(d.vprofile.firewallEnabled?'enabled':'disabled');
    }
    if(args[1]==='deny'&&args[2]){
      const port=parseInt(args[2],10);
      if(!(port>=1&&port<=65535))return 'Port 1–65535 erforderlich';
      d.rules.push({action:'block',proto:'data',port:String(port),from:'any',to:'any'});
      return 'Simulierte Firewall-Regel für Port '+port+' hinzugefügt';
    }
    return 'ufw status | enable | disable | deny <port>';
  }
  if(cmd==='poweroff'){power(id,false);return 'Virtueller Shutdown abgeschlossen'}
  if(cmd==='reboot'){power(id,false);power(id,true);return 'Virtueller Neustart abgeschlossen'}
  if(cmd==='exit')return 'CLOSE';
  return 'Unbekannter Befehl. Hilfe: help';
}
function terminal(id) {
  const d=device(id);if(!d)return;
  open('Terminal · '+d.label,
    '<p class="pl-help">Diese Linux-Netzwerkbefehle arbeiten ausschließlich mit der simulierten Konfiguration.</p>'+
    '<pre id="pl-terminal-output" class="pl-terminal-output">Veyra Virtual Terminal\n'+esc(d.label)+': help für alle Befehle\n</pre>'+
    '<div class="vr-terminal-shortcuts">'+
      ['help','ip addr','ip route','services','firewall status','systemctl status','nmcli device show'].map(x=>
        '<button type="button" data-terminal-shortcut="'+esc(x)+'">'+esc(x)+'</button>').join('')+
    '</div><form id="pl-terminal-form" class="pl-terminal-form"><span>$</span>'+
    '<input id="pl-terminal-input" placeholder="Befehl eingeben …" autocomplete="off" autocapitalize="off" spellcheck="false">'+
    '<button class="pl-btn pl-primary">Ausführen</button></form>',
    root=>{
      const form=root.querySelector('form'),input=$('pl-terminal-input'),out=$('pl-terminal-output');
      form.onsubmit=e=>{
        e.preventDefault();const cmd=input.value.trim();if(!cmd)return;
        const value=commandResult(id,cmd);
        if(value==='CLOSE'){close();return}
        if(value==='CLEAR'){out.textContent='';input.value='';input.focus();return}
        out.textContent+='\n$ '+cmd+'\n'+value+'\n';
        if(out.textContent.length>23000)out.textContent=out.textContent.slice(-19000);
        out.scrollTop=out.scrollHeight;input.value='';input.focus();
      };
      const history=[];
      let cursor=-1;
      input.addEventListener('keydown',event=>{
        if(event.key==='Enter') {
          if(input.value.trim())history.push(input.value.trim());
          cursor=history.length;
        } else if((event.key==='ArrowUp'||event.key==='ArrowDown')&&history.length){
          event.preventDefault();
          cursor=Math.max(0,Math.min(history.length,cursor+(event.key==='ArrowUp'?-1:1)));
          input.value=cursor===history.length?'':history[cursor];
        }
      });
      root.querySelectorAll('[data-terminal-shortcut]').forEach(btn=>
        btn.onclick=()=>{input.value=btn.dataset.terminalShortcut;form.requestSubmit()});
      input.focus();
    },'wide');
}

const TASK_KINDS=[
 ['ipv4','IPv4 Adresse'],['ipv6','IPv6 Adresse'],['subnet','Subnetzmaske'],
 ['dns','DNS Server / Domain'],['gateway','Default Gateway'],['vlan','VLAN-ID'],
   ['ping','Ping / Erreichbarkeit'],['topology','Netz-Topologie'],['link','Direkte Verbindung'],
  ['route','Routing / Erreichbarkeit'],['dnsrecord','DNS-Record'],['service','Dienst aktiv'],
  ['wan','WAN / Internetkonfiguration'],['transfer','Datentransfer'],['hardening','Sicherheits-Hardening'],['hardening','Sicherheits-Hardening'],
 ['firewall','Firewall-Schutz'],['online','Online-Status']
];
function masterPage(){
  if(lab.mode!=='master'){switchMode('master');return}
  const tasks=window.PacketLabV06?PacketLabV06.evaluateTasks(S,lab):P.evaluateTasks(S,lab),passed=tasks.filter(t=>t.passed).length;
  open('Network Master',
    '<div class="pl-summary"><b>'+esc(lab.title)+'</b><small>'+Math.round(tasks.length?passed/tasks.length*100:0)+'% · '+passed+'/'+tasks.length+' Aufgaben erfüllt</small></div>'+
    field('labTitle','Aufgabensatz / Projekttitel',lab.title)+
    '<label class="pl-field"><span>Einführung für Lernende</span><textarea name="desc" rows="3">'+esc(lab.description||'')+'</textarea></label>'+
    '<div class="pl-actions">'+btn('add','Aufgabe erstellen','pl-primary')+btn('grade','Aufgaben prüfen')+
    btn('dns','DNS-Zonen')+btn('save','Als .pklab speichern')+'</div>'+
    '<div class="pl-list">'+(tasks.length?tasks.map((t,i)=>'<article class="pl-row pl-task">'+
      '<div><b>'+(t.passed?'✓':'○')+' '+esc(t.title||TASK_KINDS.find(k=>k[0]===t.kind)?.[1]||'Aufgabe')+'</b>'+
      '<small>'+esc(t.instructions||'Keine Beschreibung')+'<br>'+
      'Ziel: '+esc(device(t.device)?.label||'?')+(t.expected?' · Soll: '+esc(t.expected):'')+
      '<br><strong>'+esc(t.details)+'</strong></small></div><div>'+btn('edit:'+i,'Edit')+
      btn('remove:'+i,'×','pl-danger')+'</div></article>').join(''):
      '<div class="pl-empty">Noch keine Aufgaben. Erstelle eine IPv4-/IPv6-/DNS- oder Firewall-Übung.</div>')+
      '</div>',root=>{
        root.querySelector('[name="labTitle"]').onchange=e=>lab.title=e.target.value.slice(0,80);
        root.querySelector('[name="desc"]').onchange=e=>lab.description=e.target.value.slice(0,4000);
        root.querySelector('[data-action="add"]').onclick=()=>taskForm();
        root.querySelector('[data-action="grade"]').onclick=()=>{const points=window.PacketLabV06?PacketLabV06.evaluateTasks(S,lab):P.evaluateTasks(S,lab);
          notice(points.filter(x=>x.passed).length+'/'+points.length+' bestanden');masterPage()};
        root.querySelector('[data-action="dns"]').onclick=dnsPage;
        root.querySelector('[data-action="save"]').onclick=doSave;
        root.querySelectorAll('[data-action^="edit:"]').forEach(b=>b.onclick=()=>taskForm(+b.dataset.action.slice(5)));
        root.querySelectorAll('[data-action^="remove:"]').forEach(b=>b.onclick=()=>{
          const i=+b.dataset.action.slice(7);
          lab.tasks.splice(i,1);masterPage();
        });
    },'wide');
}
function taskForm(index=-1){
  const old=lab.tasks[index]||{kind:'ipv4',title:'',device:S.devices[0]?.id||'',
    target:S.devices[1]?.id||'',expected:'',instructions:''};
  const options=S.devices.map(d=>[d.id,d.label]);
  open(index<0?'Neue Aufgabe':'Aufgabe bearbeiten',
    select('kind','Aufgabentyp',TASK_KINDS,old.kind)+
    field('title','Titel',old.title)+
    select('device','Zu konfigurierendes Gerät',options,old.device)+
    select('target','Ping-Ziel (bei Ping)',options,old.target)+
    field('expected','Soll-Wert / IP / Subnet / VLAN',old.expected)+
    '<label class="pl-field"><span>Aufgabenstellung und Hinweise</span><textarea name="instructions" rows="5">'+esc(old.instructions)+'</textarea></label>'+
    '<div class="pl-actions">'+btn('submit','Aufgabe speichern','pl-primary')+btn('back','Zurück')+'</div>',root=>{
      root.querySelector('[data-action="back"]').onclick=masterPage;
      root.querySelector('[data-action="submit"]').onclick=()=>{
        const v=vals(root);
        if(!v.device){notice('Bitte erst ein Gerät hinzufügen');return}
        if(['ipv4','gateway','dns'].includes(v.kind)&&v.expected&&v.expected.includes('.')&&
           v.kind!=='dns'&&!P.v4(v.expected)){notice('IPv4 prüfen');return}
        if(v.kind==='ipv6'&&v.expected&&!P.v6(v.expected)){notice('IPv6 prüfen');return}
        const t={id:old.id||'task-'+Date.now(),...v,
          title:(v.title||TASK_KINDS.find(x=>x[0]===v.kind)?.[1]||'Aufgabe').slice(0,80),
          instructions:String(v.instructions).slice(0,2000),expected:v.expected.slice(0,100)};
        if(index<0)lab.tasks.push(t);else lab.tasks[index]=t;
        masterPage();notice('Aufgabe gespeichert');
      };
    },'wide');
}
function dnsPage(){
  open('DNS-Zonen · Network Master',
    '<p class="pl-help">Konfiguriere zuerst bei einem Server den DNS-Dienst. A/AAAA-Records werden anschließend aus .pklab geladen.</p>'+
    '<div class="pl-grid">'+field('host','Hostname / FQDN','web.lab')+
    select('type','Record',[['A','A / IPv4'],['AAAA','AAAA / IPv6']],'A')+
    field('value','Ziel-IP','192.168.1.12')+'</div>'+
    '<div class="pl-actions">'+btn('add','DNS-Record hinzufügen','pl-primary')+'</div>'+
    '<div class="pl-list">'+lab.dnsRecords.map((r,i)=>'<article class="pl-row"><div><b>'+esc(r.host)+' · '+esc(r.type)+
      '</b><small>'+esc(r.value)+'</small></div>'+btn('remove:'+i,'×','pl-danger')+'</article>').join('')+'</div>',
    root=>{
      root.querySelector('[data-action="add"]').onclick=()=>{
        const v=vals(root);
        if(!v.host||!(v.type==='AAAA'?P.v6(v.value):P.v4(v.value))){notice('DNS-Record ungültig');return}
        lab.dnsRecords.push({host:v.host.trim().toLowerCase().slice(0,120),type:v.type,value:v.value});
        dnsPage();
      };
      root.querySelectorAll('[data-action^="remove:"]').forEach(b=>b.onclick=()=>{
        lab.dnsRecords.splice(+b.dataset.action.slice(7),1);dnsPage();
      });
    });
}
// Optional 2D building diagrams: independent side-by-side floors, no 3D scene.
let showFloorOverlay=false;
const floorLayer=document.createElement('div');floorLayer.id='pl-floor-layer';floorLayer.className='pl-floor-layer';
document.querySelector('.stage')?.insertBefore(floorLayer,$('canvas'));
function drawPlan(){
  if(!showFloorOverlay||!lab.rooms.length){floorLayer.replaceChildren();floorLayer.hidden=true;return}
  floorLayer.hidden=false;
  const floors=[...new Set(lab.rooms.map(x=>x.floor))].sort((a,b)=>a-b);
  const parts=[];
  floors.forEach((f,fi)=>{
    const x0=20+fi*270;
    parts.push('<text x="'+x0+'" y="20" class="pl-floor-label">'+esc('Etage '+f)+'</text>');
    lab.rooms.filter(x=>x.floor===f).forEach(room=>{
      const rx=x0+room.x,ry=30+room.y,w=room.w,h=room.h;
      if(room.kind==='stairs')parts.push('<path d="M'+rx+' '+ry+' h'+w+' v'+h+' h-'+w+'z M'+rx+' '+(ry+h/2)+'h'+w+'" stroke="#918b99" fill="none" stroke-width="2"/>');
      else parts.push('<rect x="'+rx+'" y="'+ry+'" width="'+w+'" height="'+h+'" rx="2" fill="none" stroke="#74747a" stroke-width="1.5"/>');
      parts.push('<text x="'+(rx+6)+'" y="'+(ry+16)+'" font-size="11" fill="#b6b6bb">'+esc(room.label)+'</text>');
    });
  });
  floorLayer.innerHTML='<svg viewBox="0 0 '+Math.max(800,floors.length*270+40)+' 520" preserveAspectRatio="xMidYMid meet" aria-label="Gebäudeplan">'+parts.join('')+'</svg>';
}
function buildingPage(){
  const rooms=lab.rooms||[];
  const currentFloor=Number(lab.floor)||1;
  const table=[['room-sm','Kleiner Raum'],['room-md','Mittlerer Raum'],
    ['room-lg','Großer Raum'],['corridor','Flur / Gang'],['stairs','Treppe']];
  const byFloor=[...new Set(rooms.map(x=>x.floor).concat([currentFloor]))].sort((a,b)=>a-b);
  open('Gebäudepläne – 2D',
    '<p class="pl-help">Optional. Rechteckige Grundrisse mit mehreren Etagen nebeneinander. Der Netzwerk-Canvas bleibt unverändert.</p>'+
    '<div class="pl-actions">'+btn('floorAdd','+ Etage')+btn('floorLess','− Etage')+
    btn('toggle',showFloorOverlay?'Overlay aus':'Overlay auf Canvas')+'</div>'+
    select('kind','Element',table,'room-md')+field('label','Beschriftung','Raum '+(rooms.length+1))+
    '<div class="pl-actions">'+btn('add','Element hinzufügen','pl-primary')+'</div>'+
    '<div class="pl-floor-row">'+byFloor.map(f=>'<div class="pl-floor-col"><strong>Etage '+f+'</strong>'+
      rooms.filter(x=>x.floor===f).map((r,i)=>'<div class="pl-floor-box">'+esc(r.label)+
      '<small>'+esc(r.kind)+'</small><button data-del-room="'+esc(r.id)+'">×</button></div>').join('')+'</div>').join('')+'</div>',
    root=>{
      root.querySelector('[data-action="floorAdd"]').onclick=()=>{lab.floor=currentFloor+1;buildingPage()};
      root.querySelector('[data-action="floorLess"]').onclick=()=>{lab.floor=Math.max(0,currentFloor-1);buildingPage()};
      root.querySelector('[data-action="toggle"]').onclick=()=>{
        showFloorOverlay=!showFloorOverlay;drawPlan();buildingPage()};
      root.querySelector('[data-action="add"]').onclick=()=>{
        const v=vals(root),count=rooms.filter(r=>r.floor===currentFloor).length;
        const dims={
          'room-sm':[65,55],'room-md':[110,75],'room-lg':[160,110],
          corridor:[195,30],stairs:[65,65]
        }[v.kind]||[80,70];
        const room={id:'room'+Date.now(),floor:currentFloor,kind:v.kind,
          label:v.label.slice(0,50),x:(count%2)*120,y:Math.floor(count/2)*93,w:dims[0],h:dims[1]};
        lab.rooms.push(room);drawPlan();buildingPage();
      };
      root.querySelectorAll('[data-del-room]').forEach(x=>x.onclick=()=>{
        lab.rooms=lab.rooms.filter(r=>r.id!==x.dataset.delRoom);drawPlan();buildingPage()});
    },'wide');
}

const plc=document.createElement('button');plc.id='pl-place';plc.className='pl-place';plc.hidden=true;
document.querySelector('.v-float')?.insertBefore(plc,document.querySelector('.v-float .stage__history'));
function syncPlace(){
  const c=document.querySelector('#deviceTypes .chip.is-active');
  const adding=!!c&&S.tool==='add';
  plc.hidden=!adding;
  if(adding){
    plc.textContent='✕ Platzieren: '+(c.textContent||S.addType).trim().slice(-12);
    plc.title='Platzierungsmodus beenden';
  }
}
plc.onclick=()=>{C.setTool('select');syncPlace();notice('Platzieren beendet')};
document.querySelector('.v-palette')?.addEventListener('click',e=>{
  if(e.target.closest('[data-pick]'))setTimeout(syncPlace,0);
});
$('canvas')?.addEventListener('pointerup',()=>setTimeout(syncPlace,0));
const logTools=document.createElement('div');logTools.className='pl-log-tools';
logTools.innerHTML='<button type="button">Alle Logs & Traffic →</button>';
document.querySelector('#eventLog')?.insertAdjacentElement('beforebegin',logTools);
logTools.querySelector('button').onclick=()=>logPage();
const helpButton=document.createElement('button');helpButton.type='button';helpButton.className='pl-extra-help';
helpButton.textContent='Gebäude 2D';helpButton.onclick=buildingPage;
const leftPanel=document.querySelector('.panel--left');
if(leftPanel)leftPanel.insertAdjacentElement('beforeend',helpButton);

function upgradeSelector(el) {
  if(!el||el.dataset.v3style)return;
  el.dataset.v3style='true';el.classList.add('pl-native-hidden');
  const b=document.createElement('button');b.type='button';b.className='pl-selector';
  b.setAttribute('aria-label',el.closest('label')?.textContent?.trim()||'Auswahl');
  el.insertAdjacentElement('afterend',b);
  const sync=()=>{
    const option=el.options[el.selectedIndex];
    b.textContent=(option?.textContent||'Auswählen')+'  ⌄';
  };
  b.addEventListener('click',()=>{
    const values=[...el.options].map(o=>[o.value,o.textContent]);
    open(el.closest('label')?.querySelector('span')?.textContent||'Auswahl',
      '<div class="pl-options">'+values.map(([value,label])=>
        '<button data-choice="'+esc(value)+'"><b>'+esc(label)+'</b>'+(value===el.value?' ✓':'')+'</button>').join('')+'</div>',
      root=>root.querySelectorAll('[data-choice]').forEach(x=>x.onclick=()=>{
        el.value=x.dataset.choice;el.dispatchEvent(new Event('change',{bubbles:true}));
        sync();close();
      }),'small');
  });
  new MutationObserver(sync).observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  el.addEventListener('change',sync);
  sync();
}
for(const id of ['srcSelect','dstSelect','routeAlgo'])upgradeSelector($(id));

const shortcut=document.createElement('button');shortcut.type='button';
shortcut.className='pl-tool';shortcut.id='pl-floor-shortcut';shortcut.textContent='⌗';shortcut.title='2D Gebäudeplan';
shortcut.onclick=buildingPage;
document.querySelector('.v-float')?.insertBefore(shortcut,$('pl-simtool'));
// Avoid crowding the portrait toolbar; these actions remain in Simulation and preset menus.
function resizeTools(){
  const small=matchMedia('(max-width:650px)').matches;
  $('pl-floor-shortcut').hidden=small;
  $('pl-morepresets').hidden=small;
  // Place indicator only while a device is being placed.
}
window.addEventListener('resize',resizeTools);resizeTools();

const oldBack=window.VeyraBack;
window.VeyraBack=function(){
  if(currentPanel){close();return true}
  return oldBack?oldBack():false;
};
// Existing TopoLab event log stays intact. No fake console operation is executed.
window.VeyraNext={
  get lab(){return lab},
  get running(){return running},
  showDeviceActions,editMore,terminal,deviceLogs,presetBuild,morePresets,
  startVS,stopVS,sendPacket,packagePage,simMenu,askAttack,
  modeMenu,switchMode,masterPage,taskForm,buildingPage,filesPage,
  saveDraft,draftList,doSave,load,pack,runAudit,close,updateSelected,
  power,setMedium,P,commandResult,open,syncPlace
};
window.addEventListener('veyra-project-loaded',()=>{if(restoring)return;lab=P.makeLab();updateMode();renderStatus()});
window.addEventListener('veyra:graphchange',()=>{
  if(restoring)return;
  renderStatus();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)autosave()});
setInterval(autosave,10000);
window.addEventListener('pagehide',autosave);
// Restore previously saved v3 project, or leave the original 0.2 topology untouched.
retrieveSaved();
updateMode();
syncPlace();renderStatus();drawPlan();
startVS();
window.addEventListener('visibilitychange',()=>{if(!document.hidden&&!running&&!lab.manualPaused)startVS()});
console.info('Veyra PacketLab 0.3 ready – mode '+lab.mode+', '+S.devices.length+' devices.');
})();
