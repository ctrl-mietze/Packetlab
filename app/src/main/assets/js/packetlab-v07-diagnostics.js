/* PacketLab 0.7: local, inspectable PDU traces and event explorer.
 * All data comes from the existing virtual engine. No network I/O.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,P=PacketLabCore,E=PacketLabV06,V=window.PacketLabV07;
if(!N||!C||!P||!E||!V)return;
const S=C.state, esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const label=id=>S.devices.find(d=>d.id===id)?.label||id||'—';
const button=(id,s)=>'<button type="button" class="v07-action" data-diag="'+id+'">'+esc(s)+'</button>';
const fields=names=>names.map(([key,val])=>'<div><small>'+esc(key)+'</small><strong>'+esc(val)+'</strong></div>').join('');
const clock=t=>[Math.floor(t/3600),Math.floor(t/60)%60,t%60].map(x=>String(x).padStart(2,'0')).join(':');
const captured=[];
const oldSend=E.send;
E.send=function(state,lab,raw){
 let result;
 try{
   result=oldSend(state,lab,raw);
   captured.push({at:lab.clock||0,src:raw.source,dst:raw.target,kind:raw.kind||'normal',
     zone:raw.zone||'lan',port:raw.port||0,bytes:raw.bytes||0,count:raw.count||1,
     blocked:!result.ok,reason:result.reason||'',delivered:result.delivered||0,
     dropped:result.dropped||0,latency:result.latency||0,mbps:result.mbps||0,
     path:Array.isArray(result.path)?result.path:[],passed:result.passed||[],
     blockedBy:result.blockedBy||null,impact:result.impact||'none'});
   if(captured.length>150)captured.splice(0,captured.length-150);
   return result;
 }catch(err){
   captured.push({at:lab?.clock||0,src:raw?.source,dst:raw?.target,kind:raw?.kind,
     blocked:true,reason:String(err.message),path:[]});
   if(captured.length>150)captured.splice(0,captured.length-150);
   throw err;
 }
};
function showTrace(entry=captured.at(-1)||null){
 const t=entry,path=t?.path||[];
 const device=id=>S.devices.find(d=>d.id===id);
 const perHop=path.map((id,index)=>{
   const d=device(id),p=d?P.profileFor(d):{};
   const isRouter=!!d&&Topologies.isRouter(d.type);
   const inspected=(t.passed||[]).find(r=>r.id===id);
   const dropped=t.blockedBy===id;
   const isSrc=index===0,isDst=index===path.length-1;
   const detail=isSrc?'Quelle: Layer 2/3, Adresse und Transportdaten':
     isDst?'Empfänger: Transport-/Dienstprüfung'+(dropped?', Firewall DROP':''):
     isRouter?'Layer 3: Weiterleitung zum nächsten Subnetz':
     ['switch','hub','ap','wlc'].includes(d?.type)?'Layer 2: virtuelles Switching/Bridging':
     ['firewall','ids'].includes(d?.type)?'Sicherheit: Richtlinien auf dem Paketpfad':
     'Virtueller Weiterleitungsknoten';
   return '<article class="v07-pdu-hop"><span>'+String(index+1).padStart(2,'0')+'</span><div>'+
     '<strong>'+esc(d?.label||id)+'</strong>'+
     '<small>'+esc(d?.type?.toUpperCase()||'NODE')+' · '+esc(p.ipv4||d?.ip||'—')+
       ' / '+esc(p.subnet||'—')+'</small>'+
     '<p>'+esc(detail)+'</p>'+
     (inspected?'<em>FW '+esc(inspected.decision||'allow')+' · '+esc(inspected.note||'')+'</em>':'')+
     '</div></article>';
 }).join('');
 const state=t?(t.blocked?'DROP / FEHLER':'ZUGESTELLT'):'KEINE PAKETE';
 const meta=t?fields([
  ['Sendezeit',clock(t.at)],['Quellgerät',label(t.src)],['Zielgerät',label(t.dst)],
  ['Virtuelles Protokoll',t.kind?.toUpperCase()],['Zielport',t.port],
  ['Frames',t.count],['Zugestellt',t.delivered],['Verworfen',t.dropped],
  ['Latenz',t.latency+' ms'],['Paketgröße',t.bytes+' B'],
  ['Netzbereich',t.zone],['Route',path.length?path.length-1+' Hops':'keine']
 ]):'';
 N.open('PDU Inspector · Paketweg',
  '<div class="v07-hero"><b>OSI- & Paketverfolgung</b>'+
  '<small>Simulierter Paketweg vom Quellgerät zum Empfänger mit Firewalls, Fehlern und allen modellierten Zwischenstationen.</small></div>'+
  '<div class="v07-pdu-status '+(t?.blocked?'blocked':'')+'"><strong>'+state+'</strong>'+
   '<small>'+esc(t?.reason||(t?'Virtuelle Übertragung':'Sende zuerst ein Paket über die Paketkonsole'))+'</small></div>'+
  '<div class="v07-property-grid">'+meta+'</div>'+
  '<h3 class="v07-section">Hop-für-Hop-Verlauf</h3>'+
  '<div class="v07-pdu-route">'+(perHop||'<p class="v07-help">Noch keine Route aufgezeichnet. Verbinde zwei Geräte und sende ein Paket.</p>')+'</div>'+
  '<h3 class="v07-section">OSI-Modell</h3>'+
  '<div class="v07-osi">'+[
    ['7 · Anwendung','Virtuelle HTTP-, HTTPS-, DNS-, SSH- und weitere Dienstmodelle'],
    ['6 · Darstellung','Keine vollständige Kodierungsschicht implementiert'],
    ['5 · Sitzung','Sitzungsverwaltung abstrahiert'],
    ['4 · Transport','TCP/UDP, Port, Größe und Frames modelliert'],
    ['3 · Vermittlung','IPv4, Maske, Gateway, virtuelles Routing und TTL'],
    ['2 · Sicherung','MAC, VLAN, ARP, Bridges und Switchpfade'],
    ['1 · Bitübertragung','Virtuelle Kabel, Funk, Bandbreite, Latenz und Fehler']
  ].map(([title,desc])=>'<details><summary>'+title+'</summary><p>'+desc+'</p></details>').join('')+'</div>'+
  '<div class="v07-callout">Diese Ansicht ist keine echte Wireshark-Paketaufzeichnung. Sie erklärt das tatsächlich vorhandene virtuelle Modell, ohne vorzugeben, reale OSI-Frames zu dekodieren.</div>'+
  '<div class="v07-actions">'+button('trace-again','Aktualisieren')+
    button('trace-logs','Ereignisprotokoll')+'</div>',
  root=>{
    root.querySelector('[data-diag="trace-again"]').onclick=()=>showTrace();
    root.querySelector('[data-diag="trace-logs"]').onclick=()=>showLogExplorer();
  },'wide');
}
function showLogExplorer(filter='alle',search='',which='alle'){
 const raw=N.lab.logs||[];
 const seen=raw.slice(-400).reverse().filter(x=>
   (filter==='alle'||x.kind===filter)&&
   (which==='alle'||x.source?.includes(label(which)))&&
   (!search||String(x.text).toLocaleLowerCase('de-DE').includes(search.toLocaleLowerCase('de-DE'))));
 const opts=arr=>arr.map(v=>'<option value="'+esc(v)+'" '+(v===filter?'selected':'')+'>'+esc(v)+'</option>').join('');
 N.open('Event Explorer · Netzwerkprotokoll',
  '<div class="v07-hero"><b>Fehler, Pakete und Systemereignisse</b>'+
    '<small>Die letzten '+Math.min(400,raw.length)+' virtuellen Ereignisse dieses Labs, inklusive Firewall-Entscheidungen und Konfigurationsfehler.</small></div>'+
  '<div class="v07-grid"><label class="v07-field">Ereignistyp<select id="v07-log-kind">'+opts(['alle','traffic','security','blocked','warning','system','dhcp'])+'</select></label>'+
  '<label class="v07-field">Gerät<select id="v07-log-device"><option value="alle">Alle Geräte</option>'+
   S.devices.map(d=>'<option value="'+esc(d.id)+'" '+(d.id===which?'selected':'')+'>'+esc(d.label)+'</option>').join('')+
   '</select></label></div>'+
  '<label class="v07-field">Textsuche<input type="search" id="v07-log-search" placeholder="z. B. DROP, Subnetz, Firewall" value="'+esc(search)+'"></label>'+
  '<div class="v07-mini-stats"><span><strong>'+seen.length+'</strong>Treffer</span>'+
   '<span><strong>'+raw.filter(x=>x.kind==='blocked').length+'</strong>Drops</span>'+
   '<span><strong>'+raw.filter(x=>x.kind==='security').length+'</strong>Sicherheit</span></div>'+
  '<div class="v07-log-list">'+(seen.length?seen.map(x=>
    '<div class="v07-log-record"><small>'+esc(clock(x.time||0))+' · '+esc(x.kind)+
    (x.source?' · '+esc(x.source):'')+'</small><p>'+esc(x.text)+'</p></div>').join(''):
    '<p class="v07-help">Keine Ereignisse für diese Auswahl.</p>')+'</div>'+
  '<div class="v07-actions">'+button('logs-copy','Ergebnisse kopieren')+
    button('logs-clear-filter','Alle anzeigen')+button('logs-inspector','Inspector')+'</div>',
  root=>{
    root.querySelector('#v07-log-kind').value=filter;
    root.querySelector('#v07-log-device').value=which;
    const refresh=()=>showLogExplorer(root.querySelector('#v07-log-kind').value,
      root.querySelector('#v07-log-search').value,
      root.querySelector('#v07-log-device').value);
    root.querySelector('#v07-log-kind').onchange=refresh;
    root.querySelector('#v07-log-device').onchange=refresh;
    root.querySelector('#v07-log-search').onchange=refresh;
    root.querySelector('[data-diag="logs-clear-filter"]').onclick=()=>showLogExplorer();
    root.querySelector('[data-diag="logs-inspector"]').onclick=()=>V.openInspector();
    root.querySelector('[data-diag="logs-copy"]').onclick=()=>{
      const content=seen.map(x=>clock(x.time||0)+' ['+x.kind+'] '+x.source+' '+x.text).join('\n');
      const input=document.createElement('textarea');input.value=content;input.style.position='fixed';
      input.style.left='-9999px';document.body.append(input);input.select();
      let ok=false;try{ok=document.execCommand('copy')}catch(_){}
      input.remove();
      window.VeyraRefine?.flash?.(ok?'Log in Zwischenablage kopiert':'Kopieren nicht möglich');
    };
  },'wide');
}
const seenProblems=new Set();
function auditToLogs(){
  const findings=P.audit(S,N.lab);
  for(const d of S.devices){
    const p=P.profileFor(d);
    if(!V.validMask(p.subnet))findings.push({id:d.id,severity:'error',text:'Ungültige Subnetzmaske'});
    if(p.gateway&&!V.inside(p.ipv4||d.ip,p.gateway,p.subnet))
      findings.push({id:d.id,severity:'error',text:'Gateway außerhalb Subnetz'});
  }
  const keys=new Set();
  for(const x of findings){
    const key=x.id+'|'+x.text;
    keys.add(key);
    if(seenProblems.has(key))continue;
    seenProblems.add(key);
    P.createEvent(N.lab,S.devices,'NETWORK AUDIT '+label(x.id)+': '+x.text,
      x.severity==='error'?'warning':'system',[x.id]);
  }
  for(const key of [...seenProblems])if(!keys.has(key))seenProblems.delete(key);
}
const priorAnalysis=V.openAnalysis;
V.openAnalysis=function(){
 auditToLogs();
 return priorAnalysis();
};
const priorInspector=V.openInspector;
V.openInspector=function(id){return priorInspector(id)};
const priorStudio=V.openStudio;
V.openStudio=function(){
  priorStudio();
  const root=document.querySelector('#pl-sheet .v07-studio-grid');
  if(root){
    const buttons=[
      ['PDU Inspector','OSI-Layer, Paketweg und Firewall-Entscheidungen','diag-trace'],
      ['Event Explorer','Fehler, Ereignisse, Suche und Kopieren','diag-logs']
    ];
    for(const [title,desc,act] of buttons){
      const b=document.createElement('button');b.type='button';b.className='v07-row';
      b.innerHTML='<div><strong>'+esc(title)+'</strong><small>'+esc(desc)+'</small></div><span>›</span>';
      b.onclick=act==='diag-trace'?()=>showTrace():()=>showLogExplorer();
      root.append(b);
    }
  }
};
const sim=document.getElementById('pl-simtool');
if(sim)sim.onclick=V.openStudio;
const originalInspector=document.querySelector('.v-nav');
if(originalInspector){
 originalInspector.addEventListener('click',e=>{
   const tab=e.target.closest?.('[data-tab]')?.dataset.tab;
   if(tab==='analysis')auditToLogs();
 },true);
}
if(document.querySelector('#pl-sheet'))document.querySelector('#pl-sheet').addEventListener('click',e=>{
 if(e.target.closest?.('[data-v07="logs"]')){
  e.preventDefault();e.stopImmediatePropagation();showLogExplorer();
 }
},true);
const clockTracker={last:-1,step:0};
setInterval(()=>{
 const lab=N.lab, t=Number(lab.clock||0);
 if(!N.running||!V.settings.normalTraffic||S.devices.length<2)return;
 if(t<clockTracker.last){clockTracker.last=t;clockTracker.step=0;return}
 clockTracker.last=t;
 const windowIndex=Math.floor(t/12);
 if(windowIndex<1||windowIndex===clockTracker.step)return;
 clockTracker.step=windowIndex;
 const hosts=S.devices.filter(d=>!d.dead&&['pc','laptop','phone','server','dns','nas','printer'].includes(d.type));
 for(let i=0;i<hosts.length;i++){
   const a=hosts[(Math.floor(t/12)+i)%hosts.length];
   const dest=hosts.find(b=>b.id!==a.id&&P.route(S,a.id,b.id)&&P.evaluate(S,lab,a.id,b.id,'icmp').ok);
   if(!dest)continue;
   try {E.send(S,lab,{source:a.id,target:dest.id,kind:'icmp',protocol:'icmp',
     count:1,bytes:64,zone:'lan',impact:'none'});C.refresh()}
   catch(err){console.warn('Heartbeat skipped:',err.message)}
   break;
 }
},900);
V.showTrace=showTrace;V.showLogExplorer=showLogExplorer;V.traces=captured;
console.info('PacketLab v0.7 diagnostics: PDU trace, event log and benign heartbeat enabled');
})();
