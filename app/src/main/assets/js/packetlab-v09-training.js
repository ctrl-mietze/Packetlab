/* PacketLab v0.9 · Network Lab / Training Builder / Training Player.
 * The existing .pklab v3 graph and task-evaluator remain authoritative.
 * A .worklab is an immutable-by-UI challenge envelope with a start snapshot,
 * level objectives and grading, not an executable script.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,P=PacketLabCore,E=window.PacketLabV06||PacketLabV06,
      V=window.PacketLabV08,S=C.state,$=id=>document.getElementById(id);
if(!N||!C||!P||!V)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const K='packetlab-v09-project-libraries',ROLES=['network','builder','training'];
const TITLES={network:'Network Lab',builder:'Network Training Builder',training:'Network Lab Training'};
const TEMPLATES=[
 ['ipv4','IPv4 und Subnetting','Stern',[
  ['ipv4','Host-IP einstellen','192.168.10.20'],['subnet','Subnetzmaske setzen','255.255.255.0'],['gateway','Standardgateway eintragen','192.168.10.1']]],
 ['routing','Zwei Subnetze verbinden','Filiale',[
  ['gateway','Default Route konfigurieren','192.168.1.1'],['route','Routing und Ping herstellen','']]],
 ['dns','DNS und Dienste','Server',[
  ['dnsrecord','DNS-A-Eintrag für intranet.lab','intranet.lab'],['dns','DNS-Resolver setzen','192.168.1.1'],['service','HTTP-Dienst aktivieren','http']]],
 ['firewall','Host-Hardening und Firewall','Security',[
  ['firewall','Host-Firewall aktivieren',''],['hardening','Host patchen und absichern','']]],
 ['vlan','Campus und VLAN','Campus',[
  ['vlan','VLAN 20 konfigurieren','20'],['topology','Redundante Verbindung ergänzen','9']]],
 ['transfer','Paketfluss und Fehleranalyse','Traffic',[
  ['ping','Client zu Server erreichbar machen',''],['transfer','Virtuellen Datentransfer abschließen','']]]
];
const KINDS=[
 ['ipv4','IPv4-Adresse'],['ipv6','IPv6-Adresse'],['subnet','Subnetzmaske'],
 ['gateway','Default-Gateway'],['dns','DNS/Resolver'],['vlan','VLAN'],
 ['ping','Ping zum Ziel'],['route','Geroutete Verbindung'],['link','Direkte Verbindung'],
 ['topology','Mindestanzahl Kabel'],['dnsrecord','DNS-Eintrag'],['service','Serverdienst'],
 ['wan','WAN-Zugang'],['firewall','Firewall-Schutz'],['hardening','Hardening'],
 ['online','Gerät online'],['transfer','Datentransfer']
];
const form=(name,title,val='')=>'<label class="v9-field"><span>'+esc(title)+'</span>'+
  '<input name="'+esc(name)+'" value="'+esc(val)+'"></label>';
const textArea=(name,title,val='')=>'<label class="v9-field"><span>'+esc(title)+'</span>'+
  '<textarea name="'+esc(name)+'" rows="3">'+esc(val)+'</textarea></label>';
const options=(pairs,value)=>pairs.map(([k,t])=>'<option value="'+esc(k)+'"'+(String(k)===String(value)?' selected':'')+'>'+esc(t)+'</option>').join('');
const select=(name,title,pairs,value)=>'<label class="v9-field"><span>'+esc(title)+'</span>'+
  '<select name="'+esc(name)+'">'+options(pairs,value)+'</select></label>';
const button=(key,title,cls='')=>'<button type="button" class="v9-action '+cls+'" data-v9="'+esc(key)+'">'+esc(title)+'</button>';
const row=(key,title,detail,icon='▤')=>
 '<button type="button" class="v9-menu-row" data-v9="'+esc(key)+'">'+
 '<span class="v9-row-icon">'+icon+'</span><span><strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small></span>'+
 '<span class="v9-row-arrow">›</span></button>';
const values=root=>Object.fromEntries([...root.querySelectorAll('[name]')].map(x=>[x.name,x.type==='checkbox'?x.checked:x.value]));
const notify=t=>window.VeyraRefine?.flash?.(t)||console.info(t);
const role=()=>ROLES.includes(N.lab.v9Role)?N.lab.v9Role:
  N.lab.mode==='master'?'builder':'network';
function storeRole(r){
 N.lab.v9Role=r;N.lab.mode='standard';
 const br=document.querySelector('.brand p');if(br)br.textContent=TITLES[r].toUpperCase();
 document.body.dataset.labRole=r;
 window.PacketLabV09Building?.draw?.();
 window.dispatchEvent(new Event('packetlab:v09-role-change'));
 // Exactly four bottom navigation tabs in all modes. The book at the top
 // provides the task sheet in training; no 5th item can wrap onto row two.
 const nav=document.querySelector('.v-nav');
 nav?.querySelectorAll('[data-tab="v9training"]').forEach(tab=>tab.remove());
 nav?.classList.remove('pl-mastermode','v11-five-tabs');
 nav?.classList.add('v11-four-tabs');
}
function library(){
 try{const db=JSON.parse(localStorage.getItem(K)||'{}');
 return Object.fromEntries(ROLES.map(r=>[r,Array.isArray(db[r])?db[r].slice(0,28):[]]));}
 catch(_){return {network:[],builder:[],training:[]}}
}
function libraryPut(kind,name,data,id=null,extra={}){
 const db=library(),entry={id:id||'vl'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
  title:String(name||'Unbenannt').slice(0,80),savedAt:Date.now(),data,...extra};
 const arr=db[kind];const pos=arr.findIndex(x=>x.id===entry.id);
 if(pos>=0)arr.splice(pos,1);
 arr.unshift(entry);db[kind]=arr.slice(0,25);
 while(db[kind].length){
  try{localStorage.setItem(K,JSON.stringify(db));return entry}
  catch(e){if(db[kind].length<=1)throw e;db[kind].pop()}
 }
 return entry;
}
function libraryDelete(kind,id){const db=library();db[kind]=db[kind].filter(x=>x.id!==id);localStorage.setItem(K,JSON.stringify(db))}
function exportBlob(name,data,mime='application/json'){
 const text=typeof data==='string'?data:JSON.stringify(data,null,2);
 if(window.VeyraNative?.saveNamedFile)window.VeyraNative.saveNamedFile(name,mime,text);
 else {
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const a=document.createElement('a');a.download=name;a.href=url;document.body.append(a);
  a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
}
function safeFile(s){return String(s||'PacketLab').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,55)}
function currentPack(){return N.pack()}
function grade(){
 const tasks=Array.isArray(N.lab.tasks)?N.lab.tasks:[];
 return E.evaluateTasks?E.evaluateTasks(S,N.lab):P.evaluateTasks(S,N.lab);
}
function goalDiff(initial,final){
 const src=new Map((initial?.snapshot?.devices||[]).map(d=>[d.id,d]));
 const target=final.snapshot?.devices||[];
 const changed=[],fields=[
  ['ip','ipv4','IPv4-Adresse'],
  ['vprofile.subnet','subnet','Subnetzmaske'],
  ['vprofile.gateway','gateway','Gateway'],
  ['vprofile.ipv6','ipv6','IPv6-Adresse'],
  ['vprofile.dnsServer','dns','DNS-Resolver'],
  ['vprofile.vlan','vlan','VLAN']
 ];
 let idx=0;
 for(const d of target){
   const before=src.get(d.id);if(!before)continue;
   for(const [key,kind,title] of fields){
     const read=x=>key.split('.').reduce((o,k)=>o?.[k],x);
     const goal=read(d),old=read(before);
     if(goal!==undefined&&goal!==old&&String(goal)!==''){
       changed.push({id:'goal-'+(++idx),kind,title:title+' auf '+d.label,
          device:d.id,target:'',expected:String(goal),
          instructions:'Konfiguriere '+title+' für '+d.label+' gemäß dem gewünschten Zielzustand.'});
     }
   }
   if(before.dead && !d.dead)
     changed.push({id:'goal-'+(++idx),kind:'online',title:d.label+' einschalten',
        device:d.id,target:'',expected:'',instructions:'Dieses Gerät muss online sein.'});
   const beforeProfile=before.vprofile||{},nowProfile=d.vprofile||{};
   const check=(kind,title,condition)=>{
     if(condition)changed.push({id:'goal-'+(++idx),kind,title:title+' · '+d.label,
       device:d.id,target:'',expected:'',instructions:title+' für '+d.label});
   };
   check('firewall','Firewall aktivieren',
     !(beforeProfile.fwPolicy?.enabled||beforeProfile.firewallEnabled)&&
      !!(nowProfile.fwPolicy?.enabled||nowProfile.firewallEnabled));
   check('hardening','Gerät absichern und patchen',
     (!beforeProfile.patched||beforeProfile.security<70)&&
      !!nowProfile.patched&&nowProfile.security>=70);
   check('wan','WAN Zugriff und Port konfigurieren',
     (!beforeProfile.internet||!beforeProfile.wanPort)&&
      !!nowProfile.internet&&Number(nowProfile.wanPort)>0);
   for(const [service,on] of Object.entries(nowProfile.enabledServices||{})){
     if(on&&!beforeProfile.enabledServices?.[service])
       changed.push({id:'goal-'+(++idx),kind:'service',title:service.toUpperCase()+' Dienst aktivieren',
         device:d.id,target:'',expected:service,
         instructions:service.toUpperCase()+' Dienst auf '+d.label+' starten.'});
   }
 }
 const firstLinks=new Set((initial.snapshot?.links||[]).map(l=>
   [l.a,l.b].sort().join('|')));
 for(const l of final.snapshot?.links||[]){
   if(firstLinks.has([l.a,l.b].sort().join('|')))continue;
   changed.push({id:'goal-'+(++idx),kind:'link',
     title:'Verbindung zwischen '+(target.find(x=>x.id===l.a)?.label||'Gerät A')+
       ' und '+(target.find(x=>x.id===l.b)?.label||'Gerät B'),
     device:l.a,target:l.b,expected:'',
     instructions:'Verbinde die beiden Geräte direkt durch ein Kabel.'});
 }
 const startDNS=new Set((initial.studio?.dnsRecords||[]).map(x=>x.host+'|'+x.type+'|'+x.value));
 for(const record of final.studio?.dnsRecords||[]){
   if(startDNS.has(record.host+'|'+record.type+'|'+record.value))continue;
   changed.push({id:'goal-'+(++idx),kind:'dnsrecord',title:'DNS Record '+record.host,
     device:'',target:'',expected:record.host,
     instructions:'Erstelle den '+record.type+' Record für '+record.host+'.'});
 }
 const goalLinks=final.snapshot?.links?.length||0,oldLinks=initial.snapshot?.links?.length||0;
 if(goalLinks>oldLinks)changed.push({id:'goal-'+(++idx),kind:'topology',title:'Kabel korrekt ergänzen',
   device:'',target:'',expected:String(goalLinks),instructions:'Stelle mindestens '+goalLinks+' Kabelverbindungen her.'});
 return changed;
}
function prepareTemplate(key){
 const template=TEMPLATES.find(x=>x[0]===key);if(!template)return;
 N.saveDraft('Vor Trainingsvorlage');
 N.presetBuild(key==='routing'?'dual':key==='vlan'?'campus':'star',key==='vlan'?13:8,{skipDraft:true});
 storeRole('builder');
 N.lab.tasks=[];N.lab.trainingLevels=[];
 N.lab.title=template[1];N.lab.description='Trainiere '+template[1]+' an einer vollständig virtuellen Topologie.';
 const d=S.devices.find(x=>x.type==='pc')||S.devices[0];
 const t=S.devices.find(x=>x.type==='server'&&x.id!==d.id)||
         S.devices.find(x=>x.id!==d.id);
 N.lab.tasks=template[3].map(([kind,title,want],i)=>({
  id:'preset-'+key+'-'+i,kind,title,device:kind==='topology'||kind==='dnsrecord'?'':d?.id||'',
  target:kind==='ping'||kind==='route'?t?.id||'':'',
  expected:kind==='topology'?String(Math.max(S.links.length+1,Number(want))):want,
  instructions:'Erfülle die Netzwerkanforderung „'+title+'“ in diesem virtuellen Lab.',
  level:Math.floor(i/2)+1,points:100
 }));
 N.lab.v9BuilderStart=currentPack();N.lab.trainingLevels=[{title:'Netzgrundlagen',id:'level-1'},
  {title:'Funktionsprüfung',id:'level-2'}];
 N.lab.v9TrainingDescription=N.lab.description;
 builderPage();
}
function captureStart(){
 N.lab.v9BuilderStart=currentPack();
 notify('Startzustand gespeichert. Konfiguriere jetzt das gewünschte Ziel.');
}
function builderPage(){
 if(role()!=='builder')storeRole('builder');
 const t=N.lab.tasks||[],graded=grade(),passed=graded.filter(x=>x.passed).length;
 const levels=[...new Set(t.map(x=>Number(x.level)||1))].sort((a,b)=>a-b);
 N.open('Network Training Builder',
  '<div class="v9-header"><b>'+esc(N.lab.title)+'</b><small>Aufgaben bearbeiten, Startzustand bestimmen und Training veröffentlichen</small></div>'+
  '<div class="v9-mini-stats"><span><strong>'+t.length+'</strong>Aufgaben</span>'+
   '<span><strong>'+levels.length+'</strong>Level</span><span><strong>'+passed+'</strong>Ziele erfüllt</span></div>'+
  form('title','Name des Trainings',N.lab.title)+
  textArea('description','Einführung für Lernende',N.lab.v9TrainingDescription||N.lab.description)+
  select('difficulty','Schwierigkeit',[['leicht','Leicht'],['mittel','Mittel'],['fortgeschritten','Fortgeschritten'],['experte','Experte']],N.lab.v9Difficulty||'mittel')+
  '<div class="v9-actions">'+button('start','Startzustand festlegen')+
  button('goal','Erreichten Zielzustand übernehmen')+'</div>'+
  '<p class="v9-hint">Speichere zuerst die Ausgangstopologie. Danach kannst du Geräte und Dienste konfigurieren und diese Änderungen als Lernziele übernehmen. Zusätzlich sind eigene Aufgaben in mehreren Leveln möglich.</p>'+
  '<div class="v9-actions">'+button('add','Aufgabe erstellen','v9-primary')+button('preview','Aufgaben bewerten')+'</div>'+
  '<div class="v9-tasklist">'+(t.length?t.map((x,i)=>
   '<article class="v9-taskrow"><span class="v9-tasknum">'+(i+1)+'</span><div>'+
   '<b>'+esc(x.title)+'</b><small>Level '+(x.level||1)+' · '+esc(x.kind)+' · '+(x.points||100)+' Punkte</small>'+
   '<small>'+esc(x.instructions||'')+'</small></div><button data-v9-edit="'+i+'">Bearbeiten</button>'+
   '<button data-v9-del="'+i+'" aria-label="Aufgabe entfernen">×</button></article>').join(''):
   '<p class="v9-empty">Noch keine Aufgaben. Du kannst eigene Ziele erstellen oder eine Vorlage wählen.</p>')+'</div>'+
  '<div class="v9-actions">'+button('templates','Trainingsvorlagen')+
    button('save','Speichern: .pklab + .worklab','v9-primary')+'</div>',
  root=>{
    const read=()=>{const v=values(root);N.lab.title=v.title.slice(0,80);
      N.lab.v9TrainingDescription=v.description.slice(0,4000);
      N.lab.v9Difficulty=v.difficulty;};
    root.querySelectorAll('input,textarea,select').forEach(x=>x.addEventListener('change',read));
    const handlers={start:()=>{read();captureStart();builderPage()},
     goal:()=>{read();if(!N.lab.v9BuilderStart){notify('Zuerst den Startzustand festlegen');return}
       const changes=goalDiff(JSON.parse(N.lab.v9BuilderStart),JSON.parse(currentPack()));
       const existing=new Set(t.map(x=>x.kind+'|'+x.device+'|'+x.expected));
       for(const x of changes)if(!existing.has(x.kind+'|'+x.device+'|'+x.expected))t.push(x);
       N.lab.tasks=t;builderPage();notify(changes.length+' neue Ziele übernommen');
     },
     add:()=>{read();taskEditor()},preview:()=>{read();builderPage();notify(passed+'/'+t.length+' erfüllt')},
     templates:()=>templatePage(),save:()=>{read();saveBuilder()}};
    root.querySelectorAll('[data-v9]').forEach(b=>b.onclick=handlers[b.dataset.v9]);
    root.querySelectorAll('[data-v9-edit]').forEach(b=>b.onclick=()=>taskEditor(+b.dataset.v9Edit));
    root.querySelectorAll('[data-v9-del]').forEach(b=>b.onclick=()=>{
      const i=+b.dataset.v9Del;N.lab.tasks.splice(i,1);builderPage();
    });
  },'wide');
}
function taskEditor(index=-1){
 const old=(N.lab.tasks||[])[index]||{kind:'ipv4',title:'',instructions:'',expected:'',
   device:S.devices[0]?.id||'',target:S.devices[1]?.id||'',level:1,points:100,hint:''};
 N.open(index<0?'Neue Lernaufgabe':'Aufgabe bearbeiten',
  '<div class="v9-header"><b>Aufgabe und Zielzustand</b><small>Ein Level kann mehrere überprüfbare Aufgaben enthalten.</small></div>'+
  select('kind','Aufgabentyp',KINDS,old.kind)+
  form('title','Aufgabentitel',old.title)+
  textArea('instructions','Was soll der Lernende erreichen?',old.instructions)+
  '<div class="v9-two-col">'+
  select('device','Zielgerät', [['','Kein bestimmtes Gerät'],...S.devices.map(x=>[x.id,x.label])],old.device)+
  select('target','Verbindungs-/Ping-Ziel',[['','Kein Ziel'],...S.devices.map(x=>[x.id,x.label])],old.target)+'</div>'+
  form('expected','Sollwert (IP, Maske, Port, VLAN, Anzahl)',old.expected)+
  '<div class="v9-two-col">'+form('level','Levelnummer (1 bis 20)',old.level||1)+form('points','Punkte',old.points||100)+'</div>'+
  textArea('hint','Optionaler Hinweis',old.hint||'')+
  '<div class="v9-actions">'+button('cancel','Zurück')+button('save','Aufgabe speichern','v9-primary')+'</div>',
 root=>{
  root.querySelector('[data-v9="cancel"]').onclick=builderPage;
  root.querySelector('[data-v9="save"]').onclick=()=>{
    const v=values(root),level=Number(v.level),points=Number(v.points);
    if(!Number.isInteger(level)||level<1||level>20||!Number.isInteger(points)||points<1||points>1000){
      notify('Level 1 bis 20, Punkte 1 bis 1000');return}
    if(!v.title.trim()){notify('Aufgabentitel fehlt');return}
    if(v.kind==='subnet'&&v.expected&&!window.PacketLabV07?.validMask(v.expected)){
      notify('Ungültige Subnetzmaske');return}
    if(v.kind==='ipv4'&&v.expected&&!P.v4(v.expected)){notify('Ungültige IPv4-Adresse');return}
    const t={...old,...v,level,points,title:v.title.trim().slice(0,80),
      expected:String(v.expected).trim().slice(0,120),
      instructions:String(v.instructions).slice(0,2000),hint:String(v.hint).slice(0,1200),
      id:old.id||'task-'+Date.now()};
    if(index>=0)N.lab.tasks[index]=t;else N.lab.tasks.push(t);
    builderPage();
  };
 },'wide');
}
function templatePage(){
 N.open('Network Training Vorlagen',
  '<div class="v9-header"><b>Bereit zum Bauen oder Spielen</b><small>Die Vorlage erstellt passende Geräte und überprüfbare Ziele. Du kannst alles verändern.</small></div>'+
  '<div class="v9-menu-list">'+TEMPLATES.map(([key,title,desc,goals])=>
    row(key,title,desc+' · '+goals.length+' Lernziele','◇')).join('')+'</div>'+
  '<div class="v9-actions">'+button('back','Zurück')+'</div>',
  root=>{
    root.querySelectorAll('.v9-menu-row').forEach(b=>b.onclick=()=>prepareTemplate(b.dataset.v9));
    root.querySelector('[data-v9="back"]').onclick=builderPage;
  },'wide');
}

function workEnvelope(){
 const lab=N.lab,initial=lab.v9BuilderStart||currentPack(),data=JSON.parse(initial);
 const tasks=(lab.tasks||[]).slice(0,120).map(t=>({
  id:t.id,kind:t.kind,device:t.device||'',target:t.target||'',title:t.title,
  instructions:t.instructions,expected:t.expected||'',level:Number(t.level)||1,
  points:Number(t.points)||100,hint:t.hint||''
 }));
 const levels=[...new Set(tasks.map(t=>t.level))].sort((a,b)=>a-b).map((n,i)=>({
  number:n,title:lab.trainingLevels?.find(x=>x.number===n)?.title||
   'Level '+n,taskIds:tasks.filter(t=>t.level===n).map(t=>t.id)
 }));
 return {format:'veyra-worklab',version:1,id:'worklab-'+Date.now(),
  title:String(lab.title||'Network Training').slice(0,80),
  description:String(lab.v9TrainingDescription||lab.description||'').slice(0,4000),
  difficulty:lab.v9Difficulty||'mittel',createdAt:Date.now(),
  start:data,tasks,levels,
  policy:{taskDefinitionEditable:false,allowClone:true,allowPractice:true},
  guide:'Net@Lab'};
}
function saveBuilder(){
 if(role()!=='builder'){notify('Nur im Training Builder verfügbar');return}
 if(!N.lab.v9BuilderStart){notify('Zuerst Startzustand speichern');return}
 if(!N.lab.tasks?.length){notify('Mindestens eine Aufgabe erforderlich');return}
 const name=safeFile(N.lab.title);
 const author=currentPack(),challenge=workEnvelope();
 try{
  libraryPut('builder',N.lab.title,author,N.lab.v9LibraryId);
  libraryPut('training',challenge.title,JSON.stringify(challenge),null,{state:'ready',kind:'worklab'});
  exportBlob(name+'.pklab',author,'application/json');
  exportBlob(name+'.worklab',challenge,'application/json');
  notify('Zwei Dateien exportiert: .pklab und .worklab');
 }catch(e){notify('Speichern fehlgeschlagen: '+e.message)}
}
function openWorklab(data,opts={}){
 if(!data||data.format!=='veyra-worklab'||data.version!==1||!data.start?.snapshot||
 !Array.isArray(data.tasks)||data.tasks.length>120)throw Error('Ungültige oder nicht unterstützte .worklab Datei');
 const work=JSON.parse(JSON.stringify(data));
 if(JSON.stringify(work).length>8_000_000)throw Error('Datei zu groß');
 N.saveDraft('Vor Worklab');
 N.load(JSON.stringify(work.start));
 N.lab.tasks=work.tasks;
 N.lab.v9Role='training';N.lab.v9WorklabId=work.id;
 N.lab.v9Worklab=work;N.lab.title=work.title;N.lab.description=work.description;
 N.lab.v9StartedAt=Date.now();N.lab.v9TrainingFirstOpen=true;
 N.lab.v9Score=0;N.lab.v9Completed=false;
 storeRole('training');
 if(opts.save!==false)
   libraryPut('training',work.title,JSON.stringify(work),work.id,{state:'ready',kind:'worklab'});
 N.close();
 setTimeout(()=>{if(window.PacketLabV11Training?.taskBook)PacketLabV11Training.taskBook(true);else playerPage(true)},120);
 notify('Network Lab Training: '+work.title);
}
function scoreReport(){
 const tasks=grade(),total=tasks.reduce((sum,t)=>sum+(Number(t.points)||100),0),
   earned=tasks.filter(t=>t.passed).reduce((sum,t)=>sum+(Number(t.points)||100),0);
 const levelIds=[...new Set(tasks.map(x=>Number(x.level)||1))].sort((a,b)=>a-b);
 return {tasks,total,earned,percent:total?Math.round(earned/total*100):0,
  passed:tasks.filter(t=>t.passed).length,
  levels:levelIds.map(n=>{
    const group=tasks.filter(t=>(Number(t.level)||1)===n);
    return {number:n,total:group.length,passed:group.filter(t=>t.passed).length,
      tasks:group};
  })};
}
function playerPage(first=false){
 if(role()!=='training'){trainingShelf();return}
 const l=N.lab,work=l.v9Worklab,report=scoreReport();
 l.v9Score=report.percent;l.v9Completed=report.percent===100;
 const intro='<div class="v9-player-header"><div><small>NETWORK LAB TRAINING</small>'+
   '<h2>'+esc(work?.title||l.title)+'</h2><p>'+esc(work?.description||l.description||'')+'</p></div>'+
   '<strong>'+report.percent+'%</strong></div>';
 const chapters=report.levels.map(level=>
  '<section class="v9-chapter"><div class="v9-chapter-head"><strong>Level '+level.number+
    '</strong><span>'+level.passed+'/'+level.total+' erledigt</span></div>'+
   level.tasks.map((t,i)=>'<article class="v9-player-task '+(t.passed?'is-done':'')+'">'+
     '<span class="v9-taskmark">'+(t.passed?'✓':'○')+'</span>'+
     '<div><b>'+esc(t.title||'Lernziel')+'</b><small>'+esc(t.instructions||'')+'</small>'+
     '<small>'+(t.passed?'Bestanden':'Offen')+' · '+(t.points||100)+' Punkte</small>'+
     (t.hint?'<details><summary>Hinweis</summary><p>'+esc(t.hint)+'</p></details>':'')+
     '</div></article>').join('')+'</section>').join('');
 N.open('Dein Trainingsauftrag',
  intro+'<div class="v9-progress"><i style="width:'+report.percent+'%"></i></div>'+
  '<div class="v9-mini-stats"><span><strong>'+report.passed+'/'+report.tasks.length+
   '</strong>Lernziele</span><span><strong>'+report.earned+'/'+report.total+
   '</strong>Punkte</span><span><strong>'+report.levels.length+'</strong>Level</span></div>'+
  (chapters||'<p class="v9-empty">Dieses Training enthält noch keine Aufgaben.</p>')+
  '<div class="v9-actions">'+button('check','Zustand prüfen','v9-primary')+
    button('guide','Net@Lab öffnen')+button('close','Netzwerk bearbeiten')+'</div>',
  root=>{
    root.querySelector('[data-v9="check"]').onclick=()=>playerPage();
    root.querySelector('[data-v9="guide"]').onclick=()=>window.PacketLabV09Guide?.open();
    root.querySelector('[data-v9="close"]').onclick=N.close;
    if(first){root.closest('#pl-sheet')?.classList.add('v9-first-open');
      setTimeout(()=>root.closest('#pl-sheet')?.classList.remove('v9-first-open'),1800)}
  },'wide');
}
function saveCurrent(){
 const r=role(),name=N.lab.title||'Network Lab';
 if(r==='builder'){saveBuilder();return}
 const data=currentPack();
 try{
  const old=N.lab.v9LibraryId;
  const entry=libraryPut(r,name,data,old,{kind:'pklab'});
  N.lab.v9LibraryId=entry.id;
  exportBlob(safeFile(name)+'.pklab',data);
  notify('In '+TITLES[r]+' gespeichert');
 }catch(e){notify('Speicherfehler: '+e.message)}
}
function createLab(kind){
 N.saveDraft('Vor neuem Lab');
 N.presetBuild('empty',8,{skipDraft:true});
 N.lab.tasks=[];N.lab.trainingLevels=[];N.lab.rooms=[];N.lab.floor=1;
 N.lab.v9Building=false;window.PacketLabV09Building?.draw?.();
 N.lab.v9BuilderStart=null;N.lab.v9Worklab=null;N.lab.v9LibraryId=null;
 N.lab.title=kind==='builder'?'Neues Network Training':'Mein Network Lab';
 storeRole(kind);
 N.close();
 if(kind==='builder')builderPage();
}
function showShelf(kind){
 const items=library()[kind];
 N.open(TITLES[kind]+' · Bibliothek',
  '<div class="v9-header"><b>'+TITLES[kind]+'</b><small>Alle gespeicherten Labs dieser Kategorie: Öffnen, umbenennen, löschen, importieren und exportieren.</small></div>'+
  '<div class="v9-actions">'+button('new',kind==='training'?'Training öffnen':'Neues Lab','v9-primary')+
   button('import','Datei importieren')+'</div>'+
  '<div class="v9-library-list">'+(items.length?items.map(item=>
   '<article class="v9-library-item"><div><strong>'+esc(item.title)+'</strong>'+
   '<small>'+new Date(item.savedAt).toLocaleString('de-DE')+' · '+
    (item.kind==='worklab'?'.worklab · Aufgabe':'.pklab · Projekt')+'</small></div>'+
   '<div><button data-v9-open="'+esc(item.id)+'">Öffnen</button>'+
   '<button data-v9-export="'+esc(item.id)+'">Export</button>'+
   '<button data-v9-delete="'+esc(item.id)+'">Löschen</button>'+
   (item.kind==='worklab'?'<button data-v9-clone="'+esc(item.id)+'">Klon bearbeiten</button>':'')+
   '</div></article>').join(''):'<p class="v9-empty">Noch keine gespeicherten Labs. Erstelle eins oder importiere eine Datei.</p>')+'</div>'+
  '<div class="v9-actions">'+button('home','Alle Bereiche')+'</div>',
 root=>{
  const lookup=id=>library()[kind].find(x=>x.id===id);
  root.querySelector('[data-v9="home"]').onclick=modePage;
  root.querySelector('[data-v9="new"]').onclick=()=>kind==='training'?
   (window.PacketLabV11Training?.openCatalog?.()||trainingTemplates()):createLab(kind);
  root.querySelector('[data-v9="import"]').onclick=importFile;
  root.querySelectorAll('[data-v9-open]').forEach(b=>b.onclick=()=>{
   const item=lookup(b.dataset.v9Open);if(!item)return;
   try{
    if(item.kind==='worklab')openWorklab(JSON.parse(item.data),{save:false});
    else{N.saveDraft('Vor Öffnen');N.load(item.data);N.lab.v9LibraryId=item.id;
      storeRole(kind);N.close();if(kind==='builder')builderPage();}
   }catch(e){notify('Laden fehlgeschlagen: '+e.message)}
  });
  root.querySelectorAll('[data-v9-export]').forEach(b=>b.onclick=()=>{
   const item=lookup(b.dataset.v9Export);if(item)exportBlob(safeFile(item.title)+
      (item.kind==='worklab'?'.worklab':'.pklab'),item.data);
  });
  root.querySelectorAll('[data-v9-delete]').forEach(b=>b.onclick=()=>{
   const item=lookup(b.dataset.v9Delete);
   if(item&&confirm('„'+item.title+'“ aus dieser Bibliothek löschen?')){libraryDelete(kind,item.id);showShelf(kind)}
  });
  root.querySelectorAll('[data-v9-clone]').forEach(b=>b.onclick=()=>{
   const item=lookup(b.dataset.v9Clone);if(item)cloneWorklab(JSON.parse(item.data));
  });
 },'wide');
}
function cloneWorklab(work){
 N.saveDraft('Vor Worklab-Klon');
 N.load(JSON.stringify(work.start));
 N.lab.tasks=JSON.parse(JSON.stringify(work.tasks));
 N.lab.title=work.title+' · Bearbeitungskopie';
 N.lab.v9BuilderStart=JSON.stringify(work.start);
 N.lab.v9TrainingDescription=work.description;
 N.lab.v9Difficulty=work.difficulty;
 N.lab.v9LibraryId=null;N.lab.v9Worklab=null;
 storeRole('builder');builderPage();
 notify('Bearbeitungskopie erstellt. Original bleibt unverändert.');
}
function trainingTemplates(){
 if(window.PacketLabV11Training?.openCatalog)return window.PacketLabV11Training.openCatalog();
 N.open('Fertige Network Trainings',
  '<div class="v9-header"><b>Training starten</b><small>Wähle eine spielbereite Lernaufgabe oder importiere eine .worklab-Datei.</small></div>'+
  '<div class="v9-menu-list">'+TEMPLATES.map(([key,title,desc,tasks])=>
   row(key,title,desc+' · '+tasks.length+' Ziele','▤')).join('')+'</div>'+
  '<div class="v9-actions">'+button('import','Worklab importieren')+
   button('back','Zurück')+'</div>',
 root=>{
  root.querySelectorAll('.v9-menu-row').forEach(b=>b.onclick=()=>{
    prepareTemplate(b.dataset.v9);
    const w=workEnvelope();
    openWorklab(w);
  });
  root.querySelector('[data-v9="back"]').onclick=()=>showShelf('training');
  root.querySelector('[data-v9="import"]').onclick=importFile;
 },'wide');
}
function trainingShelf(){showShelf('training')}
function modePage(){
 N.open('VeyraLabs · Network Lab',
   '<div class="v9-brand"><span>V</span><div><b>VeyraLabs</b><small>Netzwerke entwickeln, trainieren und verstehen.</small></div></div>'+
   '<div class="v9-menu-list">'+
   row('network','Network Lab','Freie Simulation, eigene Netzwerke und Gebäude','◇')+
   row('builder','Network Training Builder','Eigene Unterrichtslabs, Ziele und Level erstellen','▤')+
   row('training','Network Lab Training','Spielbereite .worklab Trainings und Fortschritt','✓')+
   '</div><div class="v9-actions">'+button('import','Dateien importieren')+
     button('guide','Net@Lab Handbuch')+'</div>',
  root=>{
   root.querySelectorAll('.v9-menu-row').forEach(b=>b.onclick=()=>showShelf(b.dataset.v9));
   root.querySelector('[data-v9="import"]').onclick=importFile;
   root.querySelector('[data-v9="guide"]').onclick=()=>window.PacketLabV09Guide?.open();
  },'wide');
}
function importText(text){
 if(typeof text!=='string'||text.length>8_000_000)throw Error('Datei größer als 8 MB');
 const parsed=JSON.parse(text);
 if(parsed.format==='veyra-worklab'){openWorklab(parsed);return true}
 if(parsed.format==='pklab'||parsed.format==='veyra-packetlab/1'){
  N.saveDraft('Vor Dateiimport');N.load(text);
  storeRole(N.lab.v9Role==='builder'?'builder':'network');
  libraryPut(role(),N.lab.title||'Importiertes Lab',currentPack());
  N.close();notify('Network Lab importiert');return true;
 }
 throw Error('Nur .pklab und .worklab werden unterstützt');
}
const oldDecode=window.VeyraProject.loadBase64;
window.VeyraProject.loadBase64=function(encoded){
 try{
  const b=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  const text=new TextDecoder().decode(b);
  return importText(text);
 }catch(err){notify('Datei konnte nicht geöffnet werden: '+err.message);return false}
};
function importFile(){
 if(window.VeyraNative?.loadProject){window.VeyraNative.loadProject();return}
 const file=document.createElement('input');file.type='file';
 file.accept='.pklab,.worklab,.json,application/json';
 file.onchange=async()=>{
  const f=file.files?.[0];if(!f)return;
  try{importText(await f.text())}catch(e){notify(e.message)}
 };
 file.click();
}
function navigateToTraining(){
 if(role()==='builder')builderPage();
 else if(role()==='training')playerPage();
 else showShelf('network');
}
N.modeMenu=modePage;
N.masterPage=navigateToTraining;
N.doSave=saveCurrent;
N.doOpen=importFile;
N.filesPage=()=>showShelf(role());
const originalOpen=N.load.bind(N);
N.load=function(raw){const value=originalOpen(raw);storeRole(role());return value};
const book=$('v9-book');
if(book)book.addEventListener('click',e=>{
 if(role()!=='training')return;
 e.preventDefault();e.stopImmediatePropagation();
 if(window.PacketLabV11Training?.taskBook)PacketLabV11Training.taskBook();
 else playerPage();
},true);
document.querySelector('.brand__logo')?.addEventListener('click',e=>{
 e.preventDefault();e.stopImmediatePropagation();modePage();
},true);
$('v-save')?.addEventListener('click',e=>{
 e.preventDefault();e.stopImmediatePropagation();saveCurrent();
},true);
$('v-load')?.addEventListener('click',e=>{
 e.preventDefault();e.stopImmediatePropagation();showShelf(role());
},true);
for(const id of ['v06-learning-mode','v06-build-network']){
 $(id)?.addEventListener('click',e=>{
   e.preventDefault();e.stopImmediatePropagation();modePage();
 },true);
}
document.querySelector('.v-nav')?.addEventListener('click',e=>{
 if(e.target.closest?.('[data-tab="v9training"]')){
   e.stopImmediatePropagation();navigateToTraining();
 }
},true);
window.addEventListener('veyra-project-loaded',()=>setTimeout(()=>storeRole(role()),0));
setTimeout(()=>storeRole(role()),0);
window.PacketLabV09Training={
 role,library,libraryPut,modePage,showShelf,trainingShelf,prepareTemplate,
 builderPage,taskEditor,workEnvelope,saveBuilder,saveCurrent,openWorklab,cloneWorklab,
 playerPage,trainingTemplates,createLab,importText,importFile,scoreReport,goalDiff
};
console.info('PacketLab v0.9 Learning: Network Lab, Training Builder and Training Player installed.');
})();
