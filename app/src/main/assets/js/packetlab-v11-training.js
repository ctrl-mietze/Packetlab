/* PacketLab 0.11 · One playable exercise per Net@Lab article.
 * The handbook contains knowledge only; these exercises exist solely in
 * Network Lab Training and never mutate the library's teaching scenes.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,P=window.PacketLabCore||PacketLabCore,
 E=window.PacketLabV06||PacketLabV06,academy=window.NetAtLabChapters;
if(!N||!C||!P||!E||!Array.isArray(academy))return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const S=C.state,catOrder=[...new Set(academy.map(x=>x.category))],groups=new Map(catOrder.map(c=>[c,academy.filter(x=>x.category===c)]));
const DIFF={
 leicht:{name:'Einfach',subtitle:'1 Aufgabe · viel Hilfe',count:1,tips:3,level:1},
 mittel:{name:'Normal',subtitle:'2 Aufgaben · Hinweise',count:2,tips:2,level:2},
 fortgeschritten:{name:'Fortgeschritten',subtitle:'3 Aufgaben · wenig Hilfe',count:3,tips:1,level:3},
 experte:{name:'Experte',subtitle:'4 Aufgaben · ohne Hilfen',count:4,tips:0,level:4}
};
const sceneFor=c=>window.NetAtLabV2Scenarios?.forChapter?.(c);
const topic=c=>window.NetAtLabV2Scenarios?.topic?.(c)||'gateway';
const excerpt=(s,max=115)=>String(s||'').replace(/\s+/g,' ').trim().slice(0,max).replace(/\s+\S*$/,'')+(String(s||'').length>max?' …':'');
const idx=c=>academy.findIndex(x=>x.id===c.id)+1;
const label=c=>'Kapitel '+String(idx(c)).padStart(2,'0');
let search='',cat='Alle',difficulty='mittel';
const notice=s=>{try{window.VeyraRefine?.flash?.(s)}catch(_){console.info(s)}};
const card=c=>'<button type="button" class="v11-course" data-v11-chapter="'+esc(c.id)+'">'+
 '<span>'+String(idx(c)).padStart(2,'0')+'</span>'+
 '<div><b>'+esc(c.title)+'</b><small>'+esc(excerpt(c.text,125))+'</small></div>'+
 '<span>›</span></button>';
function groupList(){
 const term=search.toLocaleLowerCase('de-DE');
 const all=academy.filter(c=>(cat==='Alle'||c.category===cat)&&
  (!term||(c.title+' '+c.text).toLocaleLowerCase('de-DE').includes(term)));
 const kinds=[...new Set(all.map(x=>x.category))];
 return kinds.length?kinds.map(kind=>'<section class="v11-course-group"><h3>'+
  esc(kind)+' <small>'+all.filter(x=>x.category===kind).length+' Trainings</small></h3>'+
  all.filter(x=>x.category===kind).map(card).join('')+'</section>').join(''):
  '<p class="v11-training-empty">Keine passenden Trainings gefunden.</p>';
}
function openCatalog(){
 N.open('Network Lab Training · Training öffnen',
 '<div class="v11-academy">'+
  '<div class="v11-academy-header"><small>VEYRALABS · TRAINING ACADEMY</small>'+
    '<h2>Wähle dein Training</h2>'+
    '<p>Ein eigenständiges, spielbares Network Lab für jedes Net@Lab-Thema. Die Fachartikel bleiben im Handbuch, die Aufgaben findest du ausschließlich hier.</p>'+
    '<div class="v11-academy-stats"><span><strong>'+academy.length+'</strong> Trainings</span>'+
      '<span><strong>'+catOrder.length+'</strong> Themen</span>'+
      '<span><strong>4</strong> Schwierigkeitsstufen</span></div></div>'+
   '<label class="v11-academy-search"><input type="search" id="v11-catalog-search" placeholder="Training suchen..." autocomplete="off" value="'+esc(search)+'"></label>'+
   '<div class="v11-academy-categories">'+
    ['Alle',...catOrder].map(x=>'<button type="button" data-v11-cat="'+esc(x)+'" class="'+(x===cat?'active':'')+'">'+esc(x)+'</button>').join('')+
   '</div><div class="v11-academy-list" id="v11-catalog-list">'+groupList()+'</div></div>',
 root=>{
  root.querySelector('#v11-catalog-search').oninput=e=>{search=e.target.value;root.querySelector('#v11-catalog-list').innerHTML=groupList()};
  root.querySelectorAll('[data-v11-cat]').forEach(b=>b.onclick=()=>{
    cat=b.dataset.v11Cat;root.querySelectorAll('[data-v11-cat]').forEach(x=>x.classList.toggle('active',x.dataset.v11Cat===cat));
    root.querySelector('#v11-catalog-list').innerHTML=groupList();
  });
  root.querySelector('#v11-catalog-list').addEventListener('click',e=>{
    const ch=e.target.closest('[data-v11-chapter]');if(!ch)return;
    preview(ch.dataset.v11Chapter);
  });
 },'wide');
}
function mainTaskKind(ch){
 const t=ch.title.toLowerCase(),c=ch.category;
 if(c==='IPv6'||/ipv6|slaac|neighbor discovery/.test(t))return 'ipv6';
 if(/subnet|maske|cidr|vlsm|\/2[0-9]|\/3[0-2]|präfix|hostbereich|netzgrenz/.test(t))return 'subnet';
 if(/dhcp/.test(t))return 'service-dhcp';
 if(/dns|resolver|name/.test(t))return 'dns';
 if(/gateway|routing|route|router|nat|wan/.test(t))return 'gateway';
 if(/vlan/.test(t))return 'vlan';
 if(/firewall|sicherheit|ids|ips|härtung|zero trust/.test(t))return 'firewall';
 if(/http|https|tls|ssh|smtp|imap|mail|serverdienst|smb|ntp|datenbank/.test(t))return 'service-http';
 if(/topolog|stern|baum|ring|mesh|switch|wlan|repeater|kabel|ethernet|arp|mac/.test(t))return 'link';
 if(/fehler|diagnose|ping|icmp|traceroute/.test(t))return 'online';
 if(c==='Fundament')return ['ipv4','link','subnet','gateway','online'][idx(ch)%5];
 if(c==='Switching'||c==='WLAN')return 'link';
 if(c==='Routing')return 'gateway';
 if(c==='Dienste')return 'service-http';
 if(c==='Security')return 'firewall';
 if(c==='Analyse')return 'online';
 return 'ipv4';
}
function taskSummary(ch,kind,level){
 const basic={
  ipv4:'Gib dem Client eine gültige, vorgegebene IPv4-Adresse.',
  subnet:'Konfiguriere die passende Subnetzmaske für die Übung.',
  gateway:'Stelle das korrekte Default-Gateway des Clients ein.',
  dns:'Trage den vorgesehenen DNS-Resolver ein.',
  ipv6:'Richte eine dokumentierte IPv6-Adresse auf dem Client ein.',
  vlan:'Setze die geforderte VLAN-ID am Client.',
  link:'Stelle die fehlende Verbindung über ein virtuelles Kabel her.',
  online:'Nimm den ausgeschalteten Client wieder in Betrieb.',
  firewall:'Aktiviere den Host-Firewall-Schutz und passende Richtlinien.',
  'service-http':'Aktiviere den HTTP-Serverdienst auf dem Zielgerät.',
  'service-dhcp':'Starte den virtuellen DHCP-Dienst auf dem Server.'
 };
 return basic[kind]||basic.ipv4;
}
function preview(chapterId){
 const ch=academy.find(x=>x.id===chapterId);if(!ch)return;
 const sc=sceneFor(ch)||{},kind=mainTaskKind(ch),meta=DIFF[difficulty];
 N.open('Training · '+ch.title,
  '<div class="v11-academy"><div class="v11-academy-header"><small>'+esc(ch.category)+' · '+label(ch)+'</small>'+
  '<h2>'+esc(ch.title)+'</h2><p>'+esc(excerpt(ch.text,340))+'</p></div>'+
  '<div class="v11-task-preflight"><h3>Das wirst du machen</h3>'+
   '<p>'+esc(taskSummary(ch,kind,1))+' Die Konfiguration wird anschließend im virtuellen Netzmodell bewertet.</p>'+
   '<p>Schwerere Stufen enthalten zusätzliche, absichtlich unvollständige Netzwerkzustände.</p></div>'+
  '<h3 class="v9-section">Schwierigkeit</h3><div class="v11-difficulty">'+Object.entries(DIFF).map(([id,item])=>
   '<button type="button" data-v11-diff="'+id+'" class="'+(difficulty===id?'active':'')+'">'+
    '<strong>'+item.name+'</strong><small>'+item.subtitle+'</small></button>').join('')+'</div>'+
  '<div class="v11-task-preflight"><h3>Vor dem Start</h3><ul>'+
   '<li>Eine eigene virtuelle Ausgangstopologie wird geladen.</li>'+
   '<li>Je nach Stufe sind mehrere Konfigurationen zu ergänzen.</li>'+
   '<li>Über das Buch oben siehst du Aufgaben und passende Tipps.</li>'+
   '<li>Das vollständige Net@Lab-Handbuch bleibt separat erreichbar.</li>'+
   '</ul></div><div class="v9-actions">'+
     '<button class="v9-action" id="v11-preview-back">Zurück</button>'+
     '<button class="v9-action v9-primary" id="v11-preview-start">Training starten</button>'+
   '</div></div>',
  root=>{
   root.querySelectorAll('[data-v11-diff]').forEach(b=>b.onclick=()=>{difficulty=b.dataset.v11Diff;preview(chapterId)});
   root.querySelector('#v11-preview-back').onclick=openCatalog;
   root.querySelector('#v11-preview-start').onclick=()=>startChapter(chapterId,difficulty);
  },'wide');
}
function planGoal(kind,context,seq=0){
 const {pc,sw,server,router}=context,p=pc.vprofile,sp=server.vprofile;
 const task=(id,kind,title,device,expected,target='',instructions='',hints=[])=>({
  id:'chapter-'+seq+'-'+id,kind,title,device:device?.id||'',target:target||'',
  expected:expected??'',points:100,level:1,instructions,tipList:hints,
  hint:hints[0]||''});
 const ip='192.168.1.'+(70+seq%115);
 switch(kind){
  case 'ipv4':
   pc.ip='192.168.1.210';pc.ips=[pc.ip];p.ipv4=pc.ip;
   return task('ipv4','ipv4','Client-IP korrekt einrichten',pc,ip,'',
    'Konfiguriere '+pc.label+' mit der IPv4-Adresse '+ip+'.',
    ['Öffne das Gerätemenü von '+pc.label+'.','Die IPv4-Adresse steht unter Easy Edit.','Prüfe, ob die neue Adresse genau '+ip+' lautet.']);
  case 'subnet':
   p.subnet='255.255.0.0';
   return task('subnet','subnet','IPv4-Netzmaske korrigieren',pc,'255.255.255.0','',
    'Das Trainingsnetz benötigt 255.255.255.0 (/24). Korrigiere die Netzmaske von '+pc.label+'.',
    ['Die Maske bestimmt den lokal erreichbaren Adressbereich.','/24 besitzt 24 gesetzte Bits.','Die korrekte Maske ist 255.255.255.0.']);
  case 'gateway':
   p.gateway='';pc.gateway='';
   return task('gateway','gateway','Default Gateway eintragen',pc,router.ip,'',
    'Trage auf '+pc.label+' die Adresse '+router.ip+' des Routers als Gateway ein.',
    ['Der Router ist der nächste Hop zu anderen Netzen.','Suche das Routerinterface im LAN.','Default Gateway: '+router.ip]);
  case 'dns':
   p.dnsServer='';
   return task('dns','dns','DNS-Resolver konfigurieren',pc,server.ip,'',
    'Setze den DNS-Resolver auf '+pc.label+' auf die Adresse '+server.ip+'.',
    ['Prüfe den Server im Netzplan.','DNS wird am Client unabhängig vom Gateway konfiguriert.','DNS-Adresse: '+server.ip]);
  case 'ipv6':
   p.ipv6='';
   return task('ipv6','ipv6','IPv6-Adresse eintragen',pc,'2001:db8:10::'+(20+seq%100),'',
    'Konfiguriere die IPv6-Adresse 2001:db8:10::'+(20+seq%100)+' für '+pc.label+'.',
    ['IPv6 besteht aus 128 Bit.','2001:db8::/32 ist für Beispiele reserviert.','Benutze den geforderten Wert ohne zusätzliches Leerzeichen.']);
  case 'vlan':
   p.vlan=1;
   return task('vlan','vlan','VLAN konfigurieren',pc,'20','',
    'Setze '+pc.label+' auf das virtuelle VLAN 20.',
    ['Ein VLAN trennt logische Broadcast-Domains.','Die VLAN-ID steht unter erweiterter Gerätekonfiguration.','Ziel: VLAN 20.']);
  case 'link':
   context.linksFor(pc,sw).forEach(l=>{S.links.splice(S.links.indexOf(l),1)});
   return task('link','link','Client mit Switch verbinden',pc,'',sw.id,
    'Stelle eine Kabelverbindung zwischen '+pc.label+' und '+sw.label+' her.',
    ['Prüfe die Links beider Geräte.','Verwende den Kabelmodus.','Verbinde PC und Switch direkt.']);
  case 'online':
   pc.dead=true;p.power=false;
   return task('online','online','Client wieder einschalten',pc,'','',
    'Schalte '+pc.label+' ein und prüfe danach seinen Linkstatus.',
    ['Ein ausgeschaltetes Gerät kann nicht senden.','Öffne das Gerätemenü.','Wähle Einschalten.']);
  case 'firewall':
   p.firewallEnabled=false;p.blockThreats=false;
   p.fwPolicy={...(p.fwPolicy||{}),enabled:false};
   return task('firewall','firewall','Host-Firewall aktivieren',pc,'','',
    'Aktiviere die virtuelle Host-Firewall von '+pc.label+' mit wirksamem Schutz.',
    ['Nur aktive Regeln wirken auf die Pakete.','Prüfe den Host-Firewall-Konfigurator.','Firewall aktivieren und Blockschutz konfigurieren.']);
  case 'service-dhcp':
  case 'service-http':{
   const service=kind==='service-dhcp'?'dhcp':'http';
   sp.enabledServices={...(sp.enabledServices||{}),[service]:false};
   if(service==='dhcp')sp.dhcpServer=false;
   return task('service-'+service,'service',service.toUpperCase()+' Dienst starten',server,service,'',
     'Aktiviere den virtuellen '+service.toUpperCase()+'-Dienst auf '+server.label+'.',
     ['Prüfe die Serverdienste im Gerätemenü.','Der Status muss aktiv sein.','Aktiviere '+service.toUpperCase()+'.']);
  }
  default:return planGoal('ipv4',context,seq);
 }
}
function setupChapter(ch,diffId){
 const cfg=DIFF[diffId]||DIFF.mittel;
 N.saveDraft('Vor Trainingsübung: '+ch.title);
 N.presetBuild('star',8,{skipDraft:true});
 const d=S.devices,pc=d.find(x=>x.type==='pc'),sw=d.find(x=>x.type==='switch'),
  server=d.find(x=>x.type==='server');
 if(!pc||!sw||!server)throw Error('Trainings-Topologie unvollständig');
 let router=d.find(x=>x.type==='router');
 if(!router){
   router=C.addDevice('router',450,70,{quiet:true});
   if(!router)throw Error('Konnte Router nicht erstellen');
   router.ip='192.168.1.1';router.ips=[router.ip];
   router.vprofile=P.sanitizeProfile({...router.vprofile,ipv4:router.ip,
    subnet:'255.255.255.0',gateway:''},router);
   C.connectDevices(sw.id,router.id);
 }
 const context={pc,sw,server,router,
  linksFor:(a,b)=>S.links.filter(l=>
    (l.a===a.id&&l.b===b.id)||(l.a===b.id&&l.b===a.id))};
 const primary=mainTaskKind(ch),idx=academy.findIndex(c=>c.id===ch.id);
 const supportive=['subnet','online','dns','link','vlan','firewall','gateway','service-http','ipv4'];
 const kinds=[primary],bias=idx%supportive.length;
 for(let i=0;kinds.length<cfg.count&&i<supportive.length;i++){
   const candidate=supportive[(i+bias)%supportive.length];
   if(!kinds.includes(candidate))kinds.push(candidate);
 }
 const tasks=kinds.map((kind,i)=>{
   const t=planGoal(kind,context,idx*7+i);
   t.level=1+Math.floor(i/2);t.points=100;
   return t;
 });
 N.lab.tasks=tasks;
 N.lab.title=ch.title;N.lab.v9TrainingDescription=sceneFor(ch)?.lesson||excerpt(ch.text,160);
 N.lab.v9Difficulty=diffId;
 N.lab.v9Role='network';
 const snapshot=JSON.parse(N.pack());
 const meta={chapterId:ch.id,chapterTitle:ch.title,category:ch.category,
   difficulty:diffId,difficultyName:cfg.name,maxHints:cfg.tips,
   teachingGoal:sceneFor(ch)?.lesson||excerpt(ch.text,150),
   summary:taskSummary(ch,primary),
   baselineNote:cfg.level===1?'Die wichtigsten Geräte sind vorbereitet.':cfg.level===4?
    'Mehrere Einstellungen müssen ohne Hilfen korrigiert werden.':'Einige Geräte und Einstellungen benötigen deine Konfiguration.'};
 return {format:'veyra-worklab',version:1,
  id:'chapter-'+ch.id+'-'+diffId+'-'+Date.now(),
  title:ch.title,description:meta.summary,
  difficulty:diffId,createdAt:Date.now(),start:snapshot,tasks,
  levels:[...new Set(tasks.map(t=>t.level))].map(level=>({
    number:level,title:'Abschnitt '+level,
    taskIds:tasks.filter(t=>t.level===level).map(t=>t.id)
  })),policy:{taskDefinitionEditable:false,allowClone:true,allowPractice:true},
  guide:'Net@Lab',meta};
}
function startChapter(id,diffId=difficulty){
 const chapter=academy.find(c=>c.id===id);if(!chapter)return;
 try{
   const work=setupChapter(chapter,diffId);
   window.PacketLabV09Training.openWorklab(work);
 }catch(e){notice('Training nicht gestartet: '+e.message)}
}
function taskBook(initial=false){
 const lab=N.lab;if(window.PacketLabV09Training?.role?.()!=='training')return;
 const work=lab.v9Worklab||{},meta=work.meta||{},
 difficultyKey=meta.difficulty||work.difficulty||'mittel',
 cfg=DIFF[difficultyKey]||DIFF.mittel;
 const graded=E.evaluateTasks(S,lab),passed=graded.filter(t=>t.passed).length;
 const rows=graded.map((t,i)=>{
  const hints=(t.tipList||[t.hint]).filter(Boolean).slice(0,cfg.tips);
  return '<div class="v11-lesson-task"><span>'+(t.passed?'✓':String(i+1).padStart(2,'0'))+'</span>'+
   '<div><b>'+esc(t.title)+'</b><small>'+esc(t.instructions||'')+'</small>'+
   '<small>'+(t.passed?'Bestanden':'Noch offen')+' · '+(t.points||100)+' Punkte</small>'+
   (hints.length?'<details><summary>Mini-Tipps ansehen</summary>'+hints.map((h,j)=>
     '<p>'+(j+1)+'. '+esc(h)+'</p>').join('')+'</details>':'')+'</div></div>';
 }).join('');
 N.open('Aufgaben & Tipps',
  '<div class="v11-academy"><div class="v11-academy-header"><small>'+esc(meta.category||'TRAINING')+
    ' · '+esc(cfg.name)+'</small>'+
   '<h2>'+esc(work.title||lab.title)+'</h2>'+
   '<p>'+esc(meta.teachingGoal||work.description||'Vervollständige die Konfiguration und prüfe die Ergebnisse.')+'</p>'+
   '<div class="v11-academy-stats"><span><strong>'+passed+'/'+graded.length+'</strong> erledigt</span>'+
    '<span><strong>'+cfg.tips+'</strong> Tipps pro Aufgabe</span></div></div>'+
  '<div class="v11-task-preflight"><h3>Dein Auftrag</h3>'+
    (rows||'<p class="v11-training-empty">Dieses Training enthält keine überprüfbaren Lernziele.</p>')+
  '</div>'+
  (meta.baselineNote?'<div class="v11-task-tip"><strong>Vorbereitung</strong><p>'+esc(meta.baselineNote)+'</p></div>':'')+
  '<div class="v9-actions">'+
    '<button id="v11-book-check" class="v9-action v9-primary">Aufgaben prüfen</button>'+
    '<button id="v11-book-dismiss" class="v9-action">Netzwerk bearbeiten</button></div>'+
   '<button id="v11-open-handbook" type="button" class="v11-training-open-book">Net@Lab-Handbuch öffnen</button>'+
   '</div>',
  root=>{
    root.querySelector('#v11-book-check').onclick=()=>taskBook();
    root.querySelector('#v11-book-dismiss').onclick=N.close;
    root.querySelector('#v11-open-handbook').onclick=()=>window.NetAtLabV2?.open?.();
    if(initial)root.closest('#pl-sheet')?.classList.add('v9-first-open');
  },'wide');
}
const book=document.getElementById('v9-book');
if(book)book.addEventListener('click',e=>{
 if(window.PacketLabV09Training?.role?.()!=='training')return;
 e.preventDefault();e.stopImmediatePropagation();taskBook();
},true);
window.PacketLabV11Training={
 openCatalog,preview,startChapter,setupChapter,taskBook,mainTaskKind,
 get chapters(){return academy},get difficulties(){return DIFF}
};
const badge=document.getElementById('v8-app-version');
if(badge){badge.textContent='0.11.0';badge.title='PacketLab 0.11.0'}
console.info('PacketLab 0.11: '+academy.length+' chapter-specific playable training labs.');
})();
