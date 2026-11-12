/* PacketLab v0.9 diagnostics: Inspector = device behavior.
 * Analysis = system-level faults, topology, route health and statistics.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,P=PacketLabCore,E=PacketLabV06,
 S=C.state;
if(!N||!C)return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dev=id=>S.devices.find(x=>x.id===id);
const notice=s=>window.VeyraRefine?.flash?.(s)||console.info(s);
const row=(k,v)=>'<div class="v9-detail-item"><small>'+esc(k)+'</small><strong>'+esc(v??'—')+'</strong></div>';
function failures(){
 const issues=P.audit(S,N.lab).slice();
 for(const d of S.devices){
  const p=P.profileFor(d),ipv4=p.ipv4||d.ip;
  if(!window.PacketLabV07?.validMask?.(p.subnet))
    issues.push({id:d.id,severity:'error',text:'Ungültige oder fehlende IPv4 Maske'});
  if(!P.v4(ipv4))issues.push({id:d.id,severity:'error',text:'IPv4 Adresse fehlt'});
  if(p.gateway&&P.v4(ipv4)&&!window.PacketLabV07?.inside?.(ipv4,p.gateway,p.subnet))
    issues.push({id:d.id,severity:'error',text:'Gateway außerhalb des lokalen Subnetzes'});
  if(S.devices.filter(x=>x.id!==d.id&&x.ip===d.ip).length&&P.v4(d.ip))
    issues.push({id:d.id,severity:'error',text:'Doppelte IPv4 Adresse'});
  if(d.dead)issues.push({id:d.id,severity:'error',text:'Gerät offline'});
  const cables=S.links.filter(l=>!l.dead&&(l.a===d.id||l.b===d.id));
  if(!cables.length)issues.push({id:d.id,severity:'warning',text:'Keine aktive Verbindung'});
 }
 return [...new Map(issues.map(x=>[(x.id||'?')+'|'+x.text,x])).values()];
}
function compactStats(){
 const logs=N.lab.logs||[];
 return {
  devices:S.devices.length,activeDevices:S.devices.filter(d=>!d.dead).length,
  cables:S.links.length,activeCables:S.links.filter(x=>!x.dead).length,
  events:logs.length,traffic:logs.filter(x=>x.kind==='traffic').length,
  blocked:logs.filter(x=>x.kind==='blocked').length,
  security:logs.filter(x=>x.kind==='security').length,
  faults:failures().length
 };
}
function deviceOverview(id){
 const d=dev(id);if(!d)return null;
 const p=P.profileFor(d),links=S.links.filter(x=>x.a===id||x.b===id);
 const neighbors=links.map(x=>dev(x.a===id?x.b:x.a)).filter(Boolean);
 const problems=failures().filter(x=>x.id===id);
 return {d,p,neighbors,problems,links};
}
function inspector(id=''){
 const stats=compactStats();
 const active=dev(id)||dev(S.selected)||S.devices[0];
 if(!active){
  N.open('Inspector · Geräte','<p class="v9-empty">Noch kein Gerät vorhanden. Platziere zuerst ein Gerät im Network Lab.</p>',null,'wide');return;
 }
 const {d,p,neighbors,problems,links}=deviceOverview(active.id);
 const options=S.devices.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===d.id?'selected':'')+'>'+esc(x.label)+
  ' · '+esc(x.type)+'</option>').join('');
 const records=(p.logs||[]).slice(-40).reverse();
 const connected=neighbors.map(x=>'<button type="button" class="v9-neighbor" data-v9-device="'+esc(x.id)+'">'+
   esc(x.label)+'<small>'+esc(x.ip||'keine IP')+'</small></button>').join('');
 N.open('Geräte Inspector',
  '<div class="v9-header"><b>Was macht dieses Gerät?</b><small>Aktuelle Konfiguration, Nachbarn, Aktivität, Fehlermeldungen und Paketereignisse.</small></div>'+
  '<label class="v9-field"><span>Gerät auswählen</span><select id="v9-inspect-device">'+options+'</select></label>'+
  '<div class="v9-mini-stats"><span><strong>'+(d.dead?'OFFLINE':'ONLINE')+'</strong>Gerätestatus</span>'+
   '<span><strong>'+links.filter(x=>!x.dead).length+'/'+links.length+'</strong>aktive Links</span>'+
   '<span><strong>'+records.length+'</strong>Protokolle</span></div>'+
  '<div class="v9-device-detail-grid">'+[
   ['Typ',d.type],['Betriebssystem',p.mobileOs||p.os||'Virtuell'],['IPv4',p.ipv4||d.ip],
   ['Subnetzmaske',p.subnet],['Gateway',p.gateway||d.gateway],['IPv6',p.ipv6],
   ['MAC',d.mac],['VLAN',p.vlan],['Gesendet',p.sent+' Frames'],['Empfangen',p.received+' Frames'],
   ['Uptime',p.uptime+' Sekunden'],['Security',p.security+'/100']
  ].map(x=>row(...x)).join('')+'</div>'+
  '<h3 class="v9-section">Direkte Verbindungen</h3><div class="v9-neighbors">'+(connected||
   '<p class="v9-hint">Keine physischen Nachbarn.</p>')+'</div>'+
  '<h3 class="v9-section">Diagnose für '+esc(d.label)+'</h3>'+
  '<div class="v9-faults">'+(problems.length?problems.map(f=>
    '<p class="'+(f.severity==='error'?'is-error':'')+'">'+esc(f.text)+'</p>').join(''):
    '<p class="is-ok">Keine offensichtlichen Probleme in diesem Gerätemodell.</p>')+'</div>'+
  '<h3 class="v9-section">Geräte Ereignisse</h3>'+
  '<div class="v9-log-list">'+(records.length?records.map(x=>
    '<p><small>'+esc(x.time)+'s · '+esc(x.type)+'</small>'+esc(x.text)+'</p>').join(''):
    '<p class="v9-empty">Noch keine Geräte Ereignisse vorhanden.</p>')+'</div>'+
  '<div class="v9-actions"><button data-v9-inspect="terminal">Terminal</button>'+
    '<button data-v9-inspect="configure">Konfiguration</button>'+
    '<button data-v9-inspect="analyze">Netzwerkanalyse</button></div>',
  root=>{
    root.querySelector('#v9-inspect-device').onchange=e=>inspector(e.target.value);
    root.querySelectorAll('[data-v9-device]').forEach(x=>x.onclick=()=>inspector(x.dataset.v9Device));
    root.querySelector('[data-v9-inspect="terminal"]').onclick=()=>N.terminal(d.id);
    root.querySelector('[data-v9-inspect="configure"]').onclick=()=>window.PacketLabV08?.openDevice(d.id);
    root.querySelector('[data-v9-inspect="analyze"]').onclick=analysis;
  },'wide');
}
function components(){
 const active=S.devices.filter(x=>!x.dead),ids=new Set(active.map(x=>x.id));
 const neighbor=new Map(active.map(x=>[x.id,[]]));
 for(const l of S.links.filter(x=>!x.dead&&ids.has(x.a)&&ids.has(x.b))){
  neighbor.get(l.a).push(l.b);neighbor.get(l.b).push(l.a);
 }
 const seen=new Set(),groups=[];
 for(const d of active){if(seen.has(d.id))continue;
  const queue=[d.id],part=[];seen.add(d.id);
  while(queue.length){const id=queue.pop();part.push(id);
   for(const other of neighbor.get(id)||[])if(!seen.has(other)){seen.add(other);queue.push(other)}}
  groups.push(part);
 }
 return groups;
}
function analysis(){
 const s=compactStats(),groups=components(),issues=failures(),
   warnings=issues.filter(x=>x.severity!=='error'),critical=issues.filter(x=>x.severity==='error');
 const graph=S.links.filter(x=>!x.dead).length-S.devices.filter(x=>!x.dead).length+groups.length;
 const suggestions=[];
 if(critical.length)suggestions.push('Kritische Gerätefehler zuerst beheben: '+critical.length+' Befunde');
 if(groups.length>1)suggestions.push(groups.length+' getrennte aktive Netzbereiche. Verbindung und Routerpfade prüfen.');
 if(S.devices.length>3&&graph<=0)suggestions.push('Kein alternativer Graphpfad: Redundanz und Ausfallpunkte prüfen.');
 if(S.devices.some(x=>x.vprofile?.security<40))suggestions.push('Geräte mit schwachem Security Profil härten.');
 if(s.blocked)suggestions.push(s.blocked+' blockierte Ereignisse nach Quelle und Ziel im Inspector untersuchen.');
 if(!suggestions.length)suggestions.push('Keine dringenden modellierten Fehler. Dokumentation und Kapazitätsplanung weiter prüfen.');
 const total=Math.max(1,s.events),bars=[
  ['Traffic',s.traffic],['Blockiert',s.blocked],['Sicherheit',s.security],
  ['Sonstige',Math.max(0,s.events-s.traffic-s.blocked-s.security)]
 ];
 N.open('Network Analyse',
  '<div class="v9-header"><b>Netzwerkzustand und Verbesserung</b><small>Globale Fehlerdiagnose, Topologiekennzahlen, Statistik und konkrete nächste Schritte. Keine Kopie des Geräte Inspectors.</small></div>'+
  '<div class="v9-mini-stats"><span><strong>'+s.activeDevices+'/'+s.devices+'</strong>Geräte online</span>'+
   '<span><strong>'+s.activeCables+'/'+s.cables+'</strong>aktive Kabel</span>'+
   '<span><strong>'+groups.length+'</strong>Komponenten</span>'+
   '<span><strong>'+critical.length+'</strong>kritische Fehler</span></div>'+
  '<h3 class="v9-section">Protokollstatistik</h3><div class="v9-analysis-bars">'+bars.map(([name,num])=>
  '<div><span>'+name+'</span><div class="v9-meter"><i style="width:'+
   Math.round(num/total*100)+'%"></i></div><b>'+num+'</b></div>').join('')+'</div>'+
  '<h3 class="v9-section">Topologie</h3>'+
  '<div class="v9-device-detail-grid">'+row('Aktive Komponenten',groups.length)+
   row('Redundanzindikator',Math.max(0,graph)+' zusätzliche Kanten')+
   row('Offline Links',s.cables-s.activeCables)+row('Geräte ohne Link',
     S.devices.filter(d=>!S.links.some(l=>!l.dead&&(l.a===d.id||l.b===d.id))).length)+'</div>'+
  '<h3 class="v9-section">Verbesserungsvorschläge</h3>'+
  '<div class="v9-recommendations">'+suggestions.map((t,i)=>
   '<div><span>'+(i+1)+'</span><p>'+esc(t)+'</p></div>').join('')+'</div>'+
  '<h3 class="v9-section">Aktuelle Befunde ('+issues.length+')</h3>'+
  '<div class="v9-faults">'+(issues.length?issues.map(x=>
   '<button type="button" data-v9-fault="'+esc(x.id)+'"><b>'+esc(dev(x.id)?.label||'Netzwerk')+'</b>'+
   '<small>'+esc(x.text)+'</small></button>').join(''):
   '<p class="is-ok">Keine offensichtlichen Konfigurationsfehler.</p>')+'</div>'+
  '<div class="v9-actions"><button data-v9-analysis="refresh">Neu analysieren</button>'+
   '<button data-v9-analysis="export">Report exportieren</button>'+
   '<button data-v9-analysis="inspect">Inspector öffnen</button></div>',
  root=>{
   root.querySelector('[data-v9-analysis="refresh"]').onclick=analysis;
   root.querySelector('[data-v9-analysis="inspect"]').onclick=()=>inspector();
   root.querySelectorAll('[data-v9-fault]').forEach(x=>x.onclick=()=>inspector(x.dataset.v9Fault));
   root.querySelector('[data-v9-analysis="export"]').onclick=()=>{
     const report={createdAt:new Date().toISOString(),lab:N.lab.title,stats:s,
       components:groups.map(g=>g.map(id=>dev(id)?.label)),findings:issues,suggestions};
     const json=JSON.stringify(report,null,2);
     if(window.VeyraNative?.saveNamedFile)
       window.VeyraNative.saveNamedFile('NetworkAnalyse-'+Date.now()+'.json','application/json',json);
     else{const a=document.createElement('a');const u=URL.createObjectURL(new Blob([json],{type:'application/json'}));
       a.href=u;a.download='network-analyse.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),300)}
     notice('Analysebericht exportiert');
   };
  },'wide');
}
if(window.PacketLabV07){window.PacketLabV07.openInspector=inspector;window.PacketLabV07.openAnalysis=analysis}
document.addEventListener('click',e=>{
 const tab=e.target.closest?.('.v-nav [data-tab]');
 if(!tab)return;
 if(tab.dataset.tab==='inspect'||tab.dataset.tab==='analysis'){
  e.preventDefault();e.stopImmediatePropagation();
  tab.dataset.tab==='inspect'?inspector():analysis();
 }
},true);
window.PacketLabV09Diagnostics={inspector,analysis,failures,stats:compactStats,components};
console.info('PacketLab v0.9 diagnostics: distinct Inspector and Network Analysis.');
})();
