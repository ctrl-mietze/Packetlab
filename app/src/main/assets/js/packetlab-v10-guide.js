/* Net@Lab v2 · VeyraLabs. Rebuilt reading, guided network examples,
 * read-only device inspector and contextual packet flow.
 * Existing chapter content and saved reading state are preserved.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore;
const chapters=window.NetAtLabChapters||[],Scenes=window.NetAtLabV2Scenarios;
if(!N||!C||!chapters.length||!Scenes)return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='netatlab-veyralabs-progress-v1';
const cats=[...new Set(chapters.map(x=>x.category))];
const themeIcons={
 Fundament:'globe',IPv4:'network',IPv6:'network',Routing:'router',
 Switching:'switch',WLAN:'wifi',Dienste:'server',Linux:'terminal',
 Windows:'monitor','Cisco IOS':'router',Cisco:'router',Android:'phone',
 Apple:'phone',Security:'shield',Analyse:'activity',PacketLab:'book'
};
const paths={
 book:'<path d="M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15"/>',
 chevron:'<path d="m9 18 6-6-6-6"/>',back:'<path d="m15 18-6-6 6-6"/>',
 network:'<rect x="9" y="9" width="6" height="6" rx="1"/><path d="M12 9V4H4v5M12 15v5h8v-5M9 12H4v8h5"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-6 5-6 13 0 18M12 3c6 5 6 13 0 18"/>',
 router:'<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 11h3M7 14h3M14 12h5M7 7V4M17 7V4"/>',
 switch:'<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M5 10h3M11 10h3M17 10h2M5 14h3M11 14h3M17 14h2"/>',
 wifi:'<path d="M2 9a16 16 0 0 1 20 0M5 13a11 11 0 0 1 14 0M8 17a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>',
 server:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M7 8h10M7 13h10M7 18h10M8 8h.1M8 13h.1M8 18h.1"/>',
 monitor:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
 pc:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
 terminal:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 4 3-4 3M13 16h5"/>',
 shield:'<path d="m12 2 8 4v6c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
 firewall:'<path d="m12 2 8 4v6c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
 activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
 phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
 ap:'<rect x="4" y="13" width="16" height="8" rx="2"/><path d="M12 13V9M6 9a8 8 0 0 1 12 0M3 5a14 14 0 0 1 18 0"/>',
 cloud:'<path d="M7 19h11a4 4 0 0 0 .4-8A6 6 0 0 0 7.1 9a5 5 0 0 0-.1 10z"/>',
 database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
 layers:'<path d="m12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>',
 star:'<path d="m12 2 3 7 7 .5-5.5 5 2 7.5-6.5-4-6.5 4 2-7.5-5.5-5L9 9z"/>',
 check:'<path d="m5 12 4 4L19 6"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
 bolt:'<path d="M13 2 4 13h7l-1 9 10-12h-8z"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 route:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h5a5 5 0 0 1 0 10h-1a4 4 0 0 0-4 4h10"/>',
 refresh:'<path d="M20 8V4h-4M4 16v4h4"/><path d="M5 10a7 7 0 0 1 12-4l3 2M19 14a7 7 0 0 1-12 4l-3-2"/>'
};
const icon=(id,cls='')=>'<svg class="'+cls+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[id]||paths.book)+'</svg>';
const total=chapters.length;
let saved={read:[],bookmarks:[],last:chapters[0].id};
try{
 const old=JSON.parse(localStorage.getItem(KEY)||'{}');
 if(Array.isArray(old.read))saved.read=old.read;
 if(Array.isArray(old.bookmarks))saved.bookmarks=old.bookmarks;
 if(old.last&&chapters.some(x=>x.id===old.last))saved.last=old.last;
}catch(_){}
let page='library',selected=saved.last,filter='Alle',query='',onlyFavorites=false;
let viewMode='demo',selectedNode='',tab='ip',stepNumber=0;
let readerScroll=0,libraryScroll=0;
let host=null;
const haptic=kind=>{try{window.PacketLabV09UI?.vibrate(kind||'tap')}catch(_){}};
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved))}catch(_){}};
const chapter=()=>chapters.find(x=>x.id===selected)||chapters[0];
const courseSize=cat=>chapters.filter(x=>x.category===cat).length;
const chaptersOf=cat=>chapters.filter(x=>x.category===cat);
const nextCategory=()=>{
 const index=cats.indexOf(chapter().category);
 return cats[Math.min(cats.length-1,index+1)];
};
function markRead(c){
 if(!saved.read.includes(c.id))saved.read.push(c.id);
 saved.last=c.id;persist();
}
function chapterNumber(c){return chapters.findIndex(x=>x.id===c.id)+1}
function estimate(c){return Math.max(2,Math.ceil(String(c.text||'').split(/\s+/).length/160))}
const groupLabels={
 Fundament:'Die Basis',IPv4:'Adressierung',IPv6:'Die nächste Generation',
 Routing:'Netze verbinden',Switching:'Layer 2',
 WLAN:'Funknetze',Dienste:'Dienste und Infrastruktur',
 Linux:'Linux Administration',Windows:'Windows Administration',
 'Cisco IOS':'Cisco',Android:'Mobile Systeme',Apple:'Apple Netzwerke',
 Security:'Netzwerksicherheit',Analyse:'Fehleranalyse',PacketLab:'Praxis im Simulator'
};
function filtered(){
 const q=query.trim().toLocaleLowerCase('de-DE');
 return chapters.filter(c=>(filter==='Alle'||c.category===filter)&&
  (!onlyFavorites||saved.bookmarks.includes(c.id))&&
  (!q||(c.title+' '+c.category+' '+c.text).toLocaleLowerCase('de-DE').includes(q)));
}
function progressText(){
 return saved.read.filter(id=>chapters.some(x=>x.id===id)).length+' / '+total;
}
function toolbar(){
 return '<div class="na2-toolbar"><button class="na2-back" data-na2="home" aria-label="Zur Inhaltsübersicht">'+
   icon('back')+'<span>Inhaltsübersicht</span></button>'+
   '<div class="na2-toolbar-actions"><button data-na2="favorites" class="'+(onlyFavorites?'is-active':'')+'" aria-label="Lesezeichen anzeigen">'+icon('star')+'</button>'+
   '<button data-na2="resume" aria-label="Zuletzt gelesenes Kapitel öffnen">'+icon('book')+'</button></div></div>';
}
function branding(){
 return '<div class="na2-identity"><div class="na2-brand-symbol">'+icon('book')+'</div>'+
   '<div class="na2-brand-copy"><span class="na2-overline">DIE INTERAKTIVE NETZWERKAKADEMIE</span>'+
   '<h2><span>Net@</span>Lab</h2><p>by <b><span>Veyra</span>Labs</b></p></div>'+
   '<div class="na2-edition">EDITION <b>02</b></div></div>';
}
function hero(){
 return '<div class="na2-hero">'+branding()+
  '<p class="na2-hero-desc">Fundiertes Netzwerk-Wissen, nachvollziehbare Beispiele und anklickbare virtuelle Geräte. Alles offline, ohne deine laufende Netzwerkwelt zu verändern.</p>'+
  '<div class="na2-hero-stats">'+
   '<span><strong>'+total+'</strong> Fachkapitel</span>'+
   '<span><strong>'+new Set(chapters.map(c=>c.category)).size+'</strong> Themenfelder</span>'+
   '<span><strong>'+progressText()+'</strong> gelesen</span>'+
  '</div><div class="na2-read-progress"><span style="width:'+Math.round(saved.read.length/total*100)+'%"></span></div></div>';
}
function categories(){
 return '<div class="na2-categories" role="group" aria-label="Fachgebiete">'+
   ['Alle',...cats].map(cat=>'<button type="button" data-na2-category="'+esc(cat)+'" class="'+(filter===cat?'active':'')+'">'+
    (cat==='Alle'?icon('layers'):icon(themeIcons[cat]||'book'))+
    '<span>'+esc(cat)+'</span><small>'+ (cat==='Alle'?total:courseSize(cat))+'</small></button>').join('')+
   '</div>';
}
function chapterTile(c){
 const done=saved.read.includes(c.id),favorite=saved.bookmarks.includes(c.id);
 return '<button class="na2-chapter-tile" type="button" data-na2-chapter="'+esc(c.id)+'">'+
   '<span class="na2-chapter-index">'+String(chapterNumber(c)).padStart(2,'0')+'</span>'+
   '<span class="na2-chapter-main"><small>'+esc(c.category)+' · '+estimate(c)+' Min.</small>'+
    '<strong>'+esc(c.title)+'</strong>'+
    '<em>'+esc(Scenes.forChapter(c).lesson)+'</em></span>'+
   '<span class="na2-chapter-status">'+(favorite?icon('star'):done?icon('check'):icon('chevron'))+'</span></button>';
}
function library(){
 const matches=filtered();
 return toolbar()+hero()+
  '<div class="na2-lib-heading"><div><span class="na2-overline">DEINE BIBLIOTHEK</span><h3>Wissen, das verbindet.</h3></div>'+
   '<button type="button" data-na2="resume" class="na2-continue">'+icon('arrow')+' Weiterlesen</button></div>'+
  '<label class="na2-searchbox">'+icon('search')+
   '<input id="na2-search" type="search" autocomplete="off" value="'+esc(query)+'" placeholder="Thema, Protokoll oder Befehl suchen..." aria-label="Kapitel durchsuchen"/>'+
   (query?'<button type="button" data-na2="clear" aria-label="Suche leeren">'+icon('close')+'</button>':'')+'</label>'+
  categories()+
  '<div class="na2-results-meta"><span id="na2-results-count">'+matches.length+' Kapitel</span>'+
   '<small>Wähle ein Kapitel zum Lernen</small></div>'+
  '<div class="na2-topic-list" id="na2-lib-content">'+sectionList()+'</div>';
}
function narrative(c,scene){
 const paras=String(c.text||'').split(/\n\s*\n/g).map(x=>x.trim()).filter(Boolean);
 const head=['01 / VERSTEHEN','02 / EINORDNEN','03 / PRAXIS & DIAGNOSE','04 / ZUSAMMENHÄNGE'];
 const title=['Das Prinzip','Was dabei passiert','Anwendung in der Praxis','Technische Hintergründe'];
 const block=(p,i)=>'<section class="na2-prose-section"><div class="na2-prose-label">'+
   '<span>'+head[Math.min(i,3)]+'</span><h3>'+title[Math.min(i,3)]+'</h3></div>'+
   '<div class="na2-prose-content">'+formatParagraph(p)+'</div></section>';
 const sections=paras.map(block).join('');
 return '<div class="na2-learning-goal"><span>'+icon('check')+' DEIN LERNZIEL</span>'+
    '<strong>'+esc(scene.lesson)+'</strong></div>'+sections;
}
function formatParagraph(raw){
 const lines=String(raw).split('\n').filter(Boolean);
 const command=/^(?:\s*)(?:ip |nmcli |networkctl |systemctl |journalctl |resolvectl |ssh |route |netsh |show |sudo |Get-|Test-|dig |tcpdump |ping |tracert |traceroute |nslookup |curl |ss |openssl |copy |enable$|interface |configure |no shutdown|w32tm |bridge )/i;
 const pieces=[];let prosa=[];
 const flush=()=>{if(prosa.length){pieces.push('<p>'+prosa.map(esc).join('<br>')+'</p>');prosa=[]}};
 for(const line of lines){
   if(command.test(line)){flush();pieces.push('<div class="na2-inline-command">'+
     icon('terminal')+'<code>'+esc(line.trim())+'</code>'+
     '<button type="button" data-na2-copy="'+esc(line.trim())+'" aria-label="Befehl kopieren">Kopieren</button></div>');}
   else prosa.push(line);
 }
 flush();
 return pieces.join('');
}
function related(c){
 const others=chapters.filter(x=>x.id!==c.id&&x.category===c.category);
 const suggested=others.sort((a,b)=>Math.abs(chapterNumber(a)-chapterNumber(c))-Math.abs(chapterNumber(b)-chapterNumber(c))).slice(0,3);
 return '<section class="na2-related"><span class="na2-overline">WEITERLERNEN</span><h3>Passende Themen</h3>'+
 '<div class="na2-related-grid">'+suggested.map(x=>
   '<button type="button" data-na2-chapter="'+esc(x.id)+'"><span>'+esc(x.category)+'</span>'+
    '<strong>'+esc(x.title)+'</strong>'+icon('chevron')+'</button>').join('')+'</div></section>';
}

function liveScene(){
 const state=C.state,all=state?.devices||[];
 if(!all.length)return {live:true,title:'Dein aktuelles Network Lab',
  caption:'Es sind noch keine Geräte in dieser Welt vorhanden.',
  nodes:[],edges:[],steps:[],focus:'',lesson:'Lege im Network Lab Geräte an, um sie hier schreibgeschützt zu betrachten.'};
 const selectedDevices=all.slice(0,8),ids=new Set(selectedDevices.map(x=>x.id));
 const nodes=selectedDevices.map((d,i)=>{
  const p=d.vprofile||{},cols=Math.min(4,selectedDevices.length),rows=Math.ceil(selectedDevices.length/4);
  const col=i%cols,row=Math.floor(i/cols),x=cols===1?50:12+(76/(cols-1))*col,y=rows===1?52:28+row*45;
  const services=[
   ...(Array.isArray(d.services)?d.services.map(x=>typeof x==='string'?x:x.name||'Service'):[]),
   ...Object.entries(p.enabledServices||{}).filter(([,on])=>!!on).map(([name])=>name.toUpperCase()+' · aktiv')
  ].slice(0,10);
  const ifaces=[...(Array.isArray(p.interfaces)?p.interfaces.map(String):[]),
   ...(p.ipv4||d.ip?['IPv4 · '+(p.ipv4||d.ip)+' / '+(p.subnet||'ohne Maske')]:[])];
  const routeData=[
   ...(Array.isArray(p.staticRoutes)?p.staticRoutes.map(x=>typeof x==='string'?x:(x.dst||x.destination||'Ziel')+' via '+(x.via||x.gateway||'?')):[]),
   ...(p.gateway?['Default Route · '+p.gateway]:[])
  ];
  return {id:d.id,type:d.type||'pc',label:d.label||d.id,x,y,
   ip:p.ipv4||d.ip||'',mask:p.subnet||'',gateway:p.gateway||d.gateway||'',
   dns:p.dnsServer||'',ipv6:p.ipv6||'',mac:d.mac||'',
   os:p.mobileOs||p.os||'Virtuelles Gerät',vlan:p.vlan||'',
   services,interfaces:ifaces,routes:routeData,
   firewall:p.fwPolicy?.enabled?['Firewall aktiv · Default '+(p.fwPolicy.policy||'allow'),
       ...(p.fwPolicy.rules||[]).slice(0,8).map(r=>(r.action||'')+' '+(r.protocol||'')+' '+(r.port||'any'))]:
        [p.firewallEnabled?'Firewall aktiviert':'Firewall nicht aktiviert'],
   arp:[],logs:(p.logs||[]).slice(-8).map(x=>(x.time||0)+'s · '+(x.text||x.type||'Ereignis')),
   status:d.dead?'Offline':'Online'};
 });
 const links=(state.links||[]).filter(l=>ids.has(l.a)&&ids.has(l.b)).map(l=>({a:l.a,b:l.b,kind:l.medium||'ethernet',dead:!!l.dead}));
 let source=nodes[0],target=nodes.find(x=>x.id!==(state.src||source.id))||nodes.at(-1);
 if(state.src&&ids.has(state.src))source=nodes.find(x=>x.id===state.src);
 if(state.dst&&ids.has(state.dst))target=nodes.find(x=>x.id===state.dst);
 let path=null;
 try{
  const route=window.PacketLabCore?.route?.(state,source?.id,target?.id);
  if(Array.isArray(route?.path)&&route.path.every(id=>ids.has(id)))path=route.path;
 }catch(_){}
 const steps=path?.length>1?
  path.slice(1).map((id,i)=>({
    from:path[i],to:id,title:'Schritt '+(i+1)+' · '+(nodes.find(x=>x.id===id)?.label||id),
    layer:'Modellierter Graphpfad',frame:'Verbindung im aktuellen Lab',
    detail:'Der verbundene Modellpfad führt von '+(nodes.find(x=>x.id===path[i])?.label||'Quelle')+
      ' zu '+(nodes.find(x=>x.id===id)?.label||'Ziel')+
      '. Die tatsächliche Paketentscheidung kann zusätzlich von IP, Subnetz, Gateway und Firewall abhängen.'
  })):[{
    from:source?.id||'',to:target?.id||'',title:'Kein vollständiger Graphpfad',
    detail:'Zwischen den ausgewählten Geräten liegt kein bestätigter virtueller Graphpfad. Das zeigt keine erfolgreiche Paketübertragung.',
    layer:'Netzwerkprüfung',frame:'Pfad nicht bestätigt'
  }];
 return {live:true,title:'Dein aktuelles Network Lab',
  caption:all.length+' Geräte vorhanden · '+nodes.length+' zur Ansicht · '+links.length+' Verbindungen',
  lesson:'Die Daten stammen aus deiner geöffneten virtuellen PacketLab-Welt. Hier werden keine Änderungen geschrieben.',
  commonError:'Diese Ansicht zeigt Konfiguration und Graphpfad, keine echten Netzwerkscans oder Pakete.',
  practice:'Wähle ein Gerät und vergleiche die IP-Konfiguration mit dem Beispiel im Kapitel.',
  focus:source?.id||nodes[0].id,nodes,edges:links,steps,
  commands:['Virtueller Istzustand aus PacketLab','Schreibgeschützt · keine Host-Kommandos']};
}
function scene(){
 const c=chapter();
 return viewMode==='current'?liveScene():Scenes.forChapter(c);
}
function nodeById(sc,id){return sc.nodes.find(x=>x.id===id)||sc.nodes[0]||null}
function logBadge(sc){
 return '<div class="na2-scene-badge">'+icon(sc.live?'activity':'lock')+
   '<span>'+(sc.live?'AKTUELLES LAB · SCHREIBGESCHÜTZT':'INTERAKTIVES LEHRBEISPIEL · SCHREIBGESCHÜTZT')+
   '</span></div>';
}
function demoIntro(sc){
 return '<div class="na2-demo-lead"><div class="na2-demo-headline">'+
  '<span class="na2-overline">PRAXIS IN NET@LAB</span>'+
  '<h3>'+esc(sc.title)+'</h3><p>'+esc(sc.caption||'')+'</p></div>'+
  '<div class="na2-mode-switch" role="group" aria-label="Datenquelle wählen">'+
   '<button type="button" data-na2-mode="demo" class="'+(viewMode==='demo'?'active':'')+'">Beispielnetz</button>'+
   '<button type="button" data-na2-mode="current" class="'+(viewMode==='current'?'active':'')+'">Mein Lab</button>'+
  '</div></div>';
}
function topology(sc){
 const n=sc.nodes,edges=sc.edges||[];
 const selected=selectedNode||sc.focus;
 const activeStep=sc.steps?.[Math.max(0,stepNumber)]||null;
 if(!n.length)return '<div class="na2-no-network">'+icon('network')+
   '<strong>Noch keine virtuellen Geräte</strong><p>Erstelle zuerst Geräte im Network Lab und öffne danach Net@Lab erneut.</p></div>';
 const links=edges.map(l=>{
   const a=nodeById(sc,l.a),b=nodeById(sc,l.b);if(!a||!b)return '';
   const active=activeStep&&((activeStep.from===l.a&&activeStep.to===l.b)||
       (activeStep.from===l.b&&activeStep.to===l.a));
   return '<line x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+
     '" class="na2-link '+(active?'is-packet':'')+(l.dead?' is-offline':'')+
     (l.kind==='wifi'?' is-wifi':'')+'"/>';
 }).join('');
 const buttons=n.map(device=>{
   const type=paths[device.type]?device.type:(device.type==='dns'?'server':device.type==='laptop'?'monitor':'pc');
   return '<button type="button" data-na2-device="'+esc(device.id)+'" class="na2-node '+
    (device.id===selected?'is-selected':'')+
    '" style="--x:'+device.x+'%;--y:'+device.y+'%;" aria-pressed="'+String(device.id===selected)+
    '" aria-label="'+esc(device.label)+' konfigurieren (nur Anzeige)">'+
     '<span class="na2-node-glyph">'+icon(type)+'</span>'+
     '<strong>'+esc(device.label)+'</strong>'+
     '<small>'+esc(device.ip||device.ipv6||device.type.toUpperCase())+'</small></button>';
 }).join('');
 return '<div class="na2-topology">'+
  '<div class="na2-topology-top"><span>'+icon('network')+' NETZPLAN</span>'+
   '<small>'+n.length+' Geräte · '+edges.length+' Verbindungen</small></div>'+
  '<div class="na2-topology-stage">'+
   '<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="na2-links" aria-hidden="true">'+links+'</svg>'+
   buttons+'</div>'+
  '<p class="na2-topology-hint">'+icon('info')+
   'Gerät antippen, um seine Konfiguration anzuzeigen. In diesem Handbuch ist nichts editierbar.</p>'+
  '</div>';
}
function tabButtons(){
 const tabs=[['ip','IP / Interfaces'],['routes','Routing'],['services','Dienste'],
   ['firewall','Firewall'],['logs','Logs']];
 return '<div class="na2-inspector-tabs" role="tablist" aria-label="Gerätekonfiguration">'+tabs.map(([k,label])=>
   '<button type="button" role="tab" data-na2-tab="'+k+'" aria-selected="'+(tab===k?'true':'false')+
   '" class="'+(tab===k?'active':'')+'">'+label+'</button>').join('')+'</div>';
}
function readonly(name,value){
 return '<label class="na2-read-field"><span>'+esc(name)+'</span>'+
  '<input type="text" value="'+esc(String(value===undefined||value===null||value===''?'Nicht konfiguriert':value))+
   '" readonly aria-readonly="true" tabindex="-1" /></label>';
}
function listContent(title,records,empty){
 return '<div class="na2-records"><span class="na2-record-title">'+esc(title)+'</span>'+
   ((records||[]).length?records.map(x=>'<div class="na2-record">'+icon('check')+
      '<span>'+esc(typeof x==='string'?x:JSON.stringify(x))+'</span></div>').join(''):
    '<p class="na2-record-empty">'+esc(empty||'Keine Einträge in diesem Modell')+'</p>')+
  '</div>';
}
function inspectorBody(sc){
 const device=nodeById(sc,selectedNode||sc.focus);
 if(!device)return '<div class="na2-inspector-empty">Kein Gerät ausgewählt.</div>';
 let contents;
 if(tab==='ip'){
   contents='<div class="na2-read-grid">'+
    readonly('IPv4 Adresse',device.ip)+readonly('Subnetzmaske',device.mask)+
    readonly('Gateway / Next Hop',device.gateway)+readonly('DNS Resolver',device.dns)+
    readonly('MAC Adresse',device.mac)+readonly('IPv6 Adresse',device.ipv6)+
    readonly('Betriebssystem',device.os)+readonly('VLAN',device.vlan)+
    '</div>'+listContent('Interfaces',device.interfaces,'Keine Interfaces definiert');
 }else if(tab==='routes'){
   contents=listContent('Routingtabelle',device.routes,'Für dieses Gerät sind keine expliziten Routen hinterlegt.')+
    listContent('Nachbarschaft / ARP',device.arp,'ARP-Cache im Modell leer.');
 }else if(tab==='services'){
   contents=listContent('Virtuelle Dienste',device.services,'Keine aktiven Dienste für dieses Beispiel.');
 }else if(tab==='firewall'){
   contents=listContent('Filter & Sicherheitsregeln',device.firewall,'Kein eigenes Firewall-Regelwerk an diesem Gerät.');
 }else{
   contents=listContent('Virtuelle Ereignisse',device.logs,'Bisher keine Ereignisse.');
 }
 return '<div class="na2-inspector"><div class="na2-inspector-top"><span class="na2-device-mark">'+
    icon(paths[device.type]?device.type:'pc')+'</span><div><span class="na2-overline">DEVICE INSPECTOR</span>'+
    '<h4>'+esc(device.label)+'</h4><small>'+esc(device.os)+' · '+esc(device.status||'Online')+'</small></div>'+
    '<span class="na2-readonly-pill">'+icon('lock')+' Read-only</span></div>'+
    tabButtons()+'<div class="na2-inspector-body">'+contents+'</div></div>';
}
function packetFlow(sc){
 const steps=sc.steps||[],index=Math.max(0,Math.min(stepNumber,steps.length-1));
 const active=steps[index];if(!active)return '';
 const a=nodeById(sc,active.from),b=nodeById(sc,active.to);
 return '<div class="na2-flow"><div class="na2-flow-heading">'+
    '<div><span class="na2-overline">PAKETWEG VERSTEHEN</span><h4>Schritt für Schritt</h4></div>'+
    '<span class="na2-flow-count">'+(index+1)+' / '+steps.length+'</span></div>'+
  '<div class="na2-flow-progress">'+steps.map((s,i)=>'<span class="'+(i<index?'is-done':i===index?'is-current':'')+'"></span>').join('')+'</div>'+
  '<div class="na2-flow-card"><div class="na2-flow-route">'+
    '<span>'+esc(a?.label||'Netz')+'</span>'+icon('arrow')+
    '<span>'+esc(b?.label||'Ziel')+'</span>'+
    '<small>'+esc(active.layer||'Netzmodell')+'</small></div>'+
    '<h5>'+esc(active.title)+'</h5><p>'+esc(active.detail)+'</p>'+
    (active.frame?'<div class="na2-flow-frame"><span>IM PAKET</span><code>'+esc(active.frame)+'</code></div>':'')+
   '</div><div class="na2-flow-controls">'+
     '<button type="button" data-na2-flow="-1" '+(index===0?'disabled':'')+'>'+icon('back')+' Zurück</button>'+
     '<button type="button" data-na2-flow="reset" aria-label="Paketweg neu starten">'+icon('refresh')+'</button>'+
     '<button type="button" data-na2-flow="1" '+(index>=steps.length-1?'disabled':'')+'>Weiter '+icon('arrow')+'</button>'+
    '</div></div>';
}
function conceptWidget(){
 const t=Scenes.topic(chapter());
 const templates={
  subnet:['BINÄR VERSTEHEN','/27 in vier Schritten',[
    ['32 Bit','IPv4-Adresse','Vier Oktette mit jeweils acht Bits'],
    ['27 Bit','Netzanteil','11111111.11111111.11111111.11100000'],
    ['5 Bit','Hostanteil','Blockgröße 32 · normale Hosts 30'],
    ['255.255.255.224','Netzmaske','Ein zusammenhängender Einsenblock']
  ]],
  ipv6:['128 BIT ADRESSIERUNG','IPv6 Präfixbeispiel',[
    ['2001:db8:10::20','Client','Ein IPv6-Host im Netz 2001:db8:10::/64'],
    ['/64','LAN-Präfix','64 Bit Präfix und 64 weitere Bits'],
    ['fe80::/10','Link Local','Lokale Nachbarschaft auf dem Link'],
    ['ICMPv6','Neighbor Discovery','Keine IPv6-Broadcasts']
  ]],
  dhcp:['DORA IM ÜBERBLICK','Eine Adresse zuweisen',[
    ['01','Discover','Client sucht einen DHCP-Server'],
    ['02','Offer','Server bietet eine Lease an'],
    ['03','Request','Client fordert die ausgewählte Lease an'],
    ['04','Acknowledge','Server bestätigt die Zuweisung']
  ]],
  dns:['DNS RECORD','Name und Adresse',[
    ['A','intranet.lab','192.168.20.40'],
    ['AAAA','IPv6-Adresse','128-Bit-Zieladresse'],
    ['TTL','Cachezeit','Erneuter Lookup kann verzögert werden'],
    ['Resolver','Frage / Antwort','DNS ist keine Route']
  ]],
  vlan:['SWITCHING','VLAN und Trunk',[
    ['VLAN 10','Clients','Eigene Broadcast-Domain'],
    ['Access','Endgeräteport','Frames gewöhnlich ungetaggt'],
    ['802.1Q','Trunk','VLAN-Zugehörigkeit wird markiert'],
    ['Layer 3','Routing','Zwischen VLANs bewusst konfigurieren']
  ]],
  arp:['MAC AUFLÖSUNG','ARP und Switching',[
    ['Who has?','ARP Request','IPv4-Nachbar wird angefragt'],
    ['Is at!','ARP Reply','MAC-Adresse wird mitgeteilt'],
    ['FDB','Switch-Tabelle','MAC an einem Port gelernt'],
    ['TTL','Eintrag altert','Caches sind zeitlich begrenzt']
  ]],
  firewall:['PAKETFILTER','Regeln in Reihenfolge',[
    ['1','ALLOW TCP 443','Webverkehr zum Server'],
    ['2','DENY TCP 23','Unsicheren Telnet-Verkehr blockieren'],
    ['3','DEFAULT DENY','Nicht freigegebene Pakete verwerfen'],
    ['LOG','Ereignis','Entscheidung nachvollziehbar machen']
  ]],
  nat:['SOURCE NAT / PAT','Eine Zuordnung merken',[
    ['192.168.10.20:52344','Intern','Private Quelle'],
    ['198.51.100.8:61234','WAN','Übersetzte Dokumentationsadresse'],
    ['203.0.113.20:443','Ziel','Externer Testserver'],
    ['STATE','Rückweg','PAT-Tabelle ordnet Antworten zu']
  ]],
  wifi:['FUNKÜBERTRAGUNG','WLAN-Signal beurteilen',[
    ['-45 dBm','Starkes Signal','Näher an null bedeutet stärker'],
    ['-80 dBm','Schwächeres Signal','Nicht automatisch komplettes Funkversagen'],
    ['5 GHz','Frequenzband','Andere Ausbreitung als 2,4 GHz'],
    ['RSSI ≠ Rate','Funkqualität','Kanal und Airtime beachten']
  ]],
  https:['VERSCHLÜSSELTER DIENST','HTTPS verstehen',[
    ['DNS','Name auflösen','Vor dem Verbindungsversuch'],
    ['TCP','Verbindung','Bei klassischem HTTPS'],
    ['TLS','Schutzschicht','Zertifikat prüfen und Schlüssel aushandeln'],
    ['HTTP','Anwendung','Request und Response']
  ]],
  switch:['LAYER 2','Weiterleitung im VLAN',[
    ['Source MAC','Lernen','Quelladresse dem Port zuordnen'],
    ['Destination MAC','Suchen','Weiterleitungsport bestimmen'],
    ['Unknown','Flooding','Nur innerhalb der betreffenden VLAN-Domain'],
    ['STP','Schleifenschutz','Redundanz kontrollieren']
  ]],
  gateway:['LAYER 3','Zum nächsten Netz',[
    ['Quelle','192.168.10.20/24','IP-Host im ersten Netz'],
    ['Gateway','192.168.10.1','Erreichbarer nächster Hop'],
    ['Route','192.168.20.0/24','Zielpräfix in der Routingtabelle'],
    ['Rückweg','192.168.10.0/24','Auch die Antwort braucht eine Route']
  ]]
 };
 const v=templates[t]||['NETZWERK IM KONTEXT','Technisches Zusammenspiel',[
   ['Quelle','Endgerät','Sendeabsicht entsteht'],
   ['Netz','Medium und Route','Frames und Pakete werden transportiert'],
   ['Ziel','Dienst','Die Anwendung verarbeitet Nutzdaten'],
   ['Analyse','Logs und Status','Den Fehler am ersten Nachweis eingrenzen']
 ]];
 return '<section class="na2-concept"><div class="na2-concept-heading">'+
   '<span class="na2-overline">'+esc(v[0])+'</span><h3>'+esc(v[1])+'</h3>'+
   '<p>Ein kurzes Schema zum Nachschlagen. Die ausführliche Erklärung steht im Kapitel.</p></div>'+
   '<div class="na2-concept-grid">'+v[2].map(([value,label,detail],i)=>
     '<div class="na2-concept-cell"><span>'+String(i+1).padStart(2,'0')+'</span>'+
     '<strong>'+esc(value)+'</strong><b>'+esc(label)+'</b><small>'+esc(detail)+'</small></div>').join('')+
   '</div></section>';
}
function demo(sc){
 return '<section class="na2-demo" id="na2-demo">'+
   demoIntro(sc)+logBadge(sc)+topology(sc)+
   '<div class="na2-demo-bottom">'+
    '<section class="na2-demo-panel" id="na2-device-panel">'+inspectorBody(sc)+'</section>'+
    '<section class="na2-demo-panel" id="na2-packet-flow">'+packetFlow(sc)+'</section>'+
   '</div>'+
  '</section>';
}
function commands(sc){
 const lines=[...new Set(sc.commands||[])];
 return '<section class="na2-commands"><div class="na2-section-title">'+icon('terminal')+
    '<div><span class="na2-overline">NACHVOLLZIEHBARE BEFEHLE</span><h3>Im Terminal prüfen</h3></div></div>'+
    '<p>Die Befehle sind zum Lernen und Kopieren gedacht. Net@Lab führt nichts auf Android oder einem echten Gerät aus.</p>'+
    '<div class="na2-command-list">'+lines.map(x=>
     '<div class="na2-command"><code>'+esc(x)+'</code>'+
      '<button type="button" data-na2-copy="'+esc(x)+'" aria-label="Befehl kopieren">'+icon('check')+' Kopieren</button></div>').join('')+
   '</div></section>';
}
function insight(sc){
 return '<div class="na2-insight-grid">'+
  '<div class="na2-insight is-key">'+icon('bolt')+'<span>MERKSATZ</span><strong>'+esc(sc.lesson||'')+'</strong></div>'+
  '<div class="na2-insight is-warning">'+icon('shield')+'<span>TYPISCHER FEHLER</span>'+
    '<p>'+esc(sc.commonError||'Prüfe immer Adresse, Route und Rückweg.')+'</p></div>'+
  '<div class="na2-insight is-practice">'+icon('book')+'<span>DENKFRAGE</span>'+
    '<p>'+esc(sc.practice||'Welche Adresse und welches Interface ist für diesen Ablauf entscheidend?')+'</p></div>'+
 '</div>';
}

function reader(){
 const c=chapter(),sc=scene(),index=chapters.findIndex(x=>x.id===c.id);
 const favorite=saved.bookmarks.includes(c.id);
 return toolbar()+
  '<div class="na2-breadcrumb"><span>'+esc(c.category)+'</span>'+icon('chevron')+
    '<span>Kapitel '+String(index+1).padStart(2,'0')+'</span></div>'+
  '<header class="na2-reader-header"><span class="na2-reader-emblem">'+icon(themeIcons[c.category]||'book')+'</span>'+
    '<div class="na2-reader-heading"><span class="na2-overline">KAPITEL '+String(index+1).padStart(2,'0')+
    ' / '+String(total).padStart(2,'0')+' · '+estimate(c)+' MIN. LESEZEIT</span>'+
    '<h2>'+esc(c.title)+'</h2><p>'+esc(groupLabels[c.category]||c.category)+
     ' · Interaktives Lernmodul</p></div></header>'+
  '<div class="na2-reader-status"><span>'+icon('check')+' Kapitel geöffnet · Fortschritt gespeichert</span>'+
    '<button type="button" data-na2="bookmark" class="'+(favorite?'is-saved':'')+'">'+
      icon('star')+(favorite?' Gespeichert':' Lesezeichen')+'</button></div>'+
  '<div class="na2-reader-content">'+
   narrative(c,sc)+
   conceptWidget()+
   demo(sc)+
   commands(sc)+
   insight(sc)+
   related(c)+
  '</div>'+
  '<div class="na2-reader-footer"><button type="button" data-na2="previous" '+(index===0?'disabled':'')+'>'+
    icon('back')+' Vorheriges Kapitel</button>'+
    '<span>'+ (index+1)+' / '+total+'</span>'+
    '<button type="button" data-na2="next" '+(index===total-1?'disabled':'')+'>Nächstes Kapitel '+icon('arrow')+'</button></div>';
}
function render(preserveScroll=false){
 if(!host)return;
 const pane=host.closest('#pl-sheet')?.querySelector('.pl-body');
 const oldScroll=pane?.scrollTop||0;
 host.classList.toggle('na2-reading',page==='reader');
 host.innerHTML=page==='reader'?reader():library();
 if(pane)pane.scrollTop=preserveScroll?oldScroll:page==='library'?libraryScroll:readerScroll;
 if(page==='reader')markRead(chapter());
 // Reading progress must update after opening a chapter.
}
function chapterOpen(id){
 if(!chapters.some(c=>c.id===id))return;
 const pane=host?.closest('#pl-sheet')?.querySelector('.pl-body');
 if(page==='library')libraryScroll=pane?.scrollTop||0;
 selected=id;page='reader';
 viewMode='demo';selectedNode='';tab='ip';stepNumber=0;
 readerScroll=0;
 markRead(chapter());render();
 haptic('mode');
}
function libraryOpen(){
 const pane=host?.closest('#pl-sheet')?.querySelector('.pl-body');
 if(page==='reader')readerScroll=pane?.scrollTop||0;
 page='library';onlyFavorites=false;
 render();
}
function bookToggle(){
 const c=chapter(),items=saved.bookmarks;
 if(items.includes(c.id))saved.bookmarks=items.filter(x=>x!==c.id);
 else saved.bookmarks=[...items,c.id];
 persist();render(true);haptic('confirm');
}
function refreshLibrary(){
 if(!host||page!=='library')return;
 const content=host.querySelector('#na2-lib-content');
 if(content)content.innerHTML=sectionList();
 const count=host.querySelector('#na2-results-count');
 if(count)count.textContent=filtered().length+' Kapitel';
 host.querySelectorAll('[data-na2-category]').forEach(b=>
    b.classList.toggle('active',b.dataset.na2Category===filter));
}
function sectionList(){
 const result=filtered(),groups=[...new Set(result.map(c=>c.category))];
 if(!groups.length)return '<div class="na2-empty">'+icon('search')+
   '<strong>Kein Kapitel gefunden</strong><p>Suche nach einem anderen Begriff oder wähle alle Themen.</p></div>';
 return groups.map(cat=>'<section class="na2-category-section"><div class="na2-section-heading">'+
    '<span class="na2-section-icon">'+icon(themeIcons[cat]||'book')+'</span>'+
    '<div><small>'+esc(groupLabels[cat]||cat)+'</small><h4>'+esc(cat)+'</h4></div>'+
    '<span class="na2-topic-count">'+result.filter(x=>x.category===cat).length+' Kapitel</span></div>'+
    '<div class="na2-chapter-grid">'+result.filter(c=>c.category===cat).map(chapterTile).join('')+
    '</div></section>').join('');
}
function updateDemo(){
 if(page!=='reader'||!host)return;
 const panel=host.querySelector('#na2-demo');
 if(!panel)return;
 const pane=host.closest('#pl-sheet')?.querySelector('.pl-body'),pos=pane?.scrollTop||0;
 panel.outerHTML=demo(scene());
 if(pane)pane.scrollTop=pos;
}
function notify(text){
 try{window.VeyraRefine?.flash?.(text)}catch(_){}
}
function copy(value){
 const area=document.createElement('textarea');
 area.value=String(value||'');area.style.position='fixed';area.style.left='-99999px';
 document.body.append(area);area.select();
 let result=false;try{result=document.execCommand('copy')}catch(_){}
 area.remove();
 if(result)notify('In Zwischenablage kopiert');
 else if(navigator.clipboard?.writeText)navigator.clipboard.writeText(value).then(
     ()=>notify('Kopiert'),()=>notify('Kopieren nicht verfügbar'));
 else notify('Kopieren nicht möglich');
}
function onClick(e){
 const el=e.target.closest('button');if(!el||!host?.contains(el))return;
 const id=el.dataset.na2,categoryName=el.dataset.na2Category,
   chapterId=el.dataset.na2Chapter,node=el.dataset.na2Device,
   mode=el.dataset.na2Mode,next=el.dataset.na2Flow,tabKey=el.dataset.na2Tab;
 if(chapterId){chapterOpen(chapterId);return}
 if(categoryName){filter=categoryName;onlyFavorites=false;refreshLibrary();return}
 if(node){
  selectedNode=node;tab='ip';updateDemo();haptic('tap');
  const devicePanel=host.querySelector('.na2-inspector');
  const scroller=host.closest('#pl-sheet')?.querySelector('.pl-body');
  if(devicePanel&&scroller){
    const offset=devicePanel.getBoundingClientRect().top-scroller.getBoundingClientRect().top;
    scroller.scrollTop+=Math.max(0,offset-26);
  }
  return;
 }
 if(tabKey){tab=tabKey;updateDemo();return}
 if(mode){viewMode=mode;selectedNode='';stepNumber=0;tab='ip';
   updateDemo();haptic('tap');return}
 if(next!==undefined){
  const totalSteps=scene().steps?.length||0;
  if(next==='reset')stepNumber=0;
  else stepNumber=Math.max(0,Math.min(totalSteps-1,stepNumber+Number(next)));
  updateDemo();haptic('tap');return;
 }
 if(el.dataset.na2Copy!==undefined){copy(el.dataset.na2Copy);return}
 if(!id)return;
 switch(id){
  case 'home': libraryOpen();break;
  case 'favorites':
   page='library';filter='Alle';query='';onlyFavorites=true;render();break;
  case 'resume':chapterOpen(saved.last||chapters[0].id);break;
  case 'clear':
   query='';filter='Alle';onlyFavorites=false;render();break;
  case 'bookmark':bookToggle();break;
  case 'previous':chapterOpen(chapters[Math.max(0,chapters.findIndex(c=>c.id===selected)-1)].id);break;
  case 'next':chapterOpen(chapters[Math.min(total-1,chapters.findIndex(c=>c.id===selected)+1)].id);break;
 }
}
function onInput(e){
 if(e.target.id!=='na2-search')return;
 query=e.target.value;
 onlyFavorites=false;
 refreshLibrary();
}
function open(){
 if(!N)return;
 page='library';filter='Alle';query='';onlyFavorites=false;
 selected=saved.last||chapters[0].id;
 selectedNode='';viewMode='demo';stepNumber=0;tab='ip';readerScroll=0;libraryScroll=0;
 N.open('Net@Lab · VeyraLabs','<div id="netatlab-v2" class="na2-root"></div>',root=>{
   host=root.querySelector('#netatlab-v2');
   if(!host)return;
   const sheet=root.closest('#pl-sheet');
   sheet?.classList.add('na2-sheet');
   host.addEventListener('click',onClick);
   host.addEventListener('input',onInput);
   render();
 },'wide');
}
const previous=window.PacketLabV09Guide||{};
window.PacketLabV09Guide={...previous,open,chapters,
 get bookmarks(){return [...saved.bookmarks]},get read(){return [...saved.read]}};
if(window.PacketLabV07)window.PacketLabV07.openGuide=open;
window.NetAtLabV2={open,chapterOpen,libraryOpen,get page(){return page},
 get current(){return chapter()},get theme(){return Scenes.topic(chapter())},
 get readOnlyScene(){return scene()},get mode(){return viewMode},
 openLive:()=>{viewMode='current';selectedNode='';tab='ip';stepNumber=0;updateDemo()},
 selectDevice:id=>{selectedNode=id;updateDemo()},
 nextStep:()=>{stepNumber=Math.min((scene().steps?.length||1)-1,stepNumber+1);updateDemo()},
 get step(){return stepNumber},get chapters(){return chapters},
 get progress(){return {read:[...saved.read],bookmarks:[...saved.bookmarks]}}};
const versionBadge=document.getElementById('v8-app-version');
if(versionBadge){versionBadge.textContent='0.10.0';versionBadge.title='PacketLab 0.10.0 · Net@Lab v2'}
console.info('Net@Lab v2: '+chapters.length+' curated chapters with read-only virtual device examples.');
})();
