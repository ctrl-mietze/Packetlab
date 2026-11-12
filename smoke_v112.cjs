'use strict';
const fs=require('fs'),path=require('path');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const targets=await fetch('http://127.0.0.1:9231/json/new?about:blank',{method:'PUT'}).then(x=>x.json());
 const ws=new WebSocket(targets.webSocketDebuggerUrl);
 await new Promise((yes,no)=>{ws.onopen=yes;ws.onerror=no});
 let seq=0;const pending=new Map(),runtime=[],consoleErrors=[],cases=[];
 ws.onmessage=e=>{
  const m=JSON.parse(e.data);
  if(m.id&&pending.has(m.id)){
   const job=pending.get(m.id);pending.delete(m.id);
   m.error?job.reject(Error(JSON.stringify(m.error))):job.resolve(m.result||{});
  }
  if(m.method==='Runtime.exceptionThrown')runtime.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')
   consoleErrors.push(m.params.args.map(x=>x.value||x.description||'').join(' '));
 };
 const cd=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq;pending.set(id,{resolve,reject});
  ws.send(JSON.stringify({id,method,params}));
  setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('Timed out '+method))}},20000);
 });
 const run=async f=>{
  const r=await cd('Runtime.evaluate',{expression:'('+f.toString()+')()',
   returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;
 };
 const test=async(name,fn)=>{
  try{const result=await run(fn);cases.push({name,ok:true,result})}
  catch(e){cases.push({name,ok:false,error:String(e)})}
 };
 const shot=async name=>{
  const r=await cd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,name),Buffer.from(r.data,'base64'));
 };
 await cd('Page.enable');await cd('Runtime.enable');
 await cd('Emulation.setDeviceMetricsOverride',{width:414,height:940,deviceScaleFactor:1,mobile:true});
 const url='file:///'+path.join(__dirname,'app/src/main/assets/index.html').replace(/\\/g,'/');
 await cd('Page.navigate',{url});await sleep(2500);
 await test('boot-and-chapters',function(){
  const comps=[PacketLabV09UI,PacketLabV09Training,PacketLabV09Guide,
   PacketLabV09Discovery,PacketLabV09QuickEdit,PacketLabV09Building,
   PacketLabV09Firewall,PacketLabV09Diagnostics];
  if(comps.some(x=>!x))throw Error('Missing V09 module');
  if(PacketLabV09Guide.chapters.length<50)throw Error('Handbook too short');
  return {chapters:PacketLabV09Guide.chapters.length,
   mode:PacketLabV09Training.role(),book:!!document.querySelector('#v9-book')};
 });
 await test('packet-console-single-composer',function(){
  const bar=document.querySelector('.sendbar'),v=document.querySelector('.v06-packet-panel');
  if(!bar||!bar.classList.contains('v9-packet-composer'))throw Error('Packet not rebuilt');
  if(!document.querySelector('#v9-source')||!document.querySelector('#v9-target'))throw Error('Missing endpoints');
  if(getComputedStyle(document.querySelector('.sendbar__row')).display!=='none')
   throw Error('Old duplicate selectors still visible');
  return {newSelectors:document.querySelectorAll('.v9-endpoints label').length,
   oldHidden:true,quickSend:!!document.getElementById('v07-quick-send')};
 });
 await shot('v09-packetlab-home.png');
 await test('custom-dropdown-not-android-native',function(){
  document.querySelector('#v06-expand-packet').click();
  const hidden=document.querySelector('#v06-proto');
  if(!hidden.classList.contains('v9-native-select'))throw Error('Native select still active');
  const button=hidden.nextElementSibling;
  if(!button.matches('.v9-select-button'))throw Error('Custom select missing');
  button.click();
  const picker=document.querySelector('#vr-picker');
  if(!picker||picker.hidden)throw Error('Custom picker not opened');
  document.querySelector('.vr-picker-close').click();
  return {picker:'Veyra custom',nativeHidden:getComputedStyle(hidden).display==='none'};
 });
 await test('netatlab-v2-library-and-category-organization',function(){
  PacketLabV09Guide.open();
  if(!window.NetAtLabV2||NetAtLabV2.chapters.length!==90)
    throw Error('Net@Lab v2 not loaded');
  const title=document.querySelector('.na2-brand-copy h2')?.textContent;
  const tiles=document.querySelectorAll('.na2-chapter-tile').length;
  const groups=document.querySelectorAll('.na2-category-section').length;
  if(title!=='Net@Lab'||tiles!==90||groups<8)
    throw Error('Library missing chapters/groups '+title+' '+tiles+' '+groups);
  if(document.querySelectorAll('.na2-root select').length)
    throw Error('Native selects in Net@Lab');
  return {title,tiles,groups};
 });
 await shot('v10-netatlab-library.png');
 await test('netatlab-v2-search-and-navigation',function(){
  const search=document.querySelector('#na2-search');
  search.value='IPv6';search.dispatchEvent(new Event('input',{bubbles:true}));
  const results=document.querySelectorAll('#na2-lib-content .na2-chapter-tile').length;
  if(results<4||results>=90)throw Error('Search did not filter '+results);
  NetAtLabV2.chapterOpen('c06');
  if(NetAtLabV2.page!=='reader'||!document.querySelector('.na2-learning-goal'))
    throw Error('No structured reader');
  if(document.querySelectorAll('.na2-prose-section').length<2)
    throw Error('Content not broken into sections');
  return {results,chapter:NetAtLabV2.current.title};
 });
 await shot('v10-netatlab-reader.png');
 await test('netatlab-v2-topology-visible',function(){
  const topology=document.querySelector('.na2-topology-stage');
  if(!topology||document.querySelectorAll('.na2-node').length<4)
    throw Error('Network learning diagram missing');
  const parent=document.querySelector('#pl-sheet .pl-body');
  parent.scrollTop+=topology.getBoundingClientRect().top-parent.getBoundingClientRect().top-25;
  return {nodes:document.querySelectorAll('.na2-node').length,
    edges:document.querySelectorAll('.na2-link').length,scroll:parent.scrollTop};
 });
 await shot('v10-netatlab-topology.png');
 await test('netatlab-v2-click-pc-and-readonly-configuration',function(){
  const before=JSON.stringify(VeyraCore.state.devices.map(d=>[d.id,d.ip,d.vprofile?.subnet]));
  const pc=document.querySelector('[data-na2-device="pc"]');
  if(!pc)throw Error('Example PC not found');
  pc.click();
  const inspector=document.querySelector('.na2-inspector'),
    fields=[...document.querySelectorAll('.na2-read-field input')];
  const ip=fields.find(x=>x.value==='192.168.10.42');
  if(!inspector||!ip||fields.length<8||fields.some(x=>!x.readOnly))
    throw Error('Read-only IP inspector missing');
  document.querySelector('[data-na2-tab="routes"]').click();
  if(!document.querySelector('.na2-records'))
    throw Error('Routing tab missing');
  document.querySelector('[data-na2-tab="services"]').click();
  document.querySelector('[data-na2-tab="ip"]').click();
  const after=JSON.stringify(VeyraCore.state.devices.map(d=>[d.id,d.ip,d.vprofile?.subnet]));
  if(before!==after)throw Error('Demo modified actual lab');
  return {fields:fields.length,ip:ip.value,actualLabUnchanged:true};
 });
 await shot('v10-netatlab-inspector.png');
 await test('netatlab-v2-packet-route-stepper',function(){
  const before=NetAtLabV2.step;
  const next=document.querySelector('[data-na2-flow="1"]');
  if(!next)throw Error('Missing packet stepper');
  next.click();
  const after=NetAtLabV2.step;
  if(after!==before+1||!document.querySelector('.na2-flow-frame'))
    throw Error('Packet stepper broken');
  return {from:before,to:after,step:document.querySelector('.na2-flow-count').textContent};
 });
 await test('netatlab-v2-live-lab-readonly',function(){
  if(!VeyraCore.state.devices.length){
    VeyraNext.presetBuild('star',8,{skipDraft:true});
    PacketLabV09Guide.open();
    NetAtLabV2.chapterOpen('c06');
  }
  const before=JSON.stringify(VeyraCore.state.devices.map(d=>[d.id,d.ip,d.vprofile?.subnet]));
  NetAtLabV2.openLive();
  const sc=NetAtLabV2.readOnlyScene;
  if(!sc.live||sc.nodes.length<1)
    throw Error('Actual lab not displayed');
  const first=document.querySelector('[data-na2-device]');
  first.click();
  const id=first.dataset.na2Device,d=VeyraCore.state.devices.find(x=>x.id===id);
  if(!d)throw Error('Live device not found');
  const inp=[...document.querySelectorAll('.na2-read-field input')];
  if(!inp.some(x=>x.value===(d.vprofile?.ipv4||d.ip)))
    throw Error('Live IPv4 does not match model');
  const after=JSON.stringify(VeyraCore.state.devices.map(d=>[d.id,d.ip,d.vprofile?.subnet]));
  if(before!==after)throw Error('Live view wrote to network state');
  return {displayed:sc.nodes.length,device:d.label,noMutations:true};
 });
 await shot('v10-netatlab-live.png');
 await test('netatlab-v2-all-90-chapters-render',function(){
  for(const chapter of NetAtLabV2.chapters){
    NetAtLabV2.chapterOpen(chapter.id);
    if(!document.querySelector('.na2-reader-header')||
      !document.querySelector('.na2-prose-section')||
      !document.querySelector('.na2-topology')||
      !document.querySelector('.na2-command-list')){
      throw Error('Chapter rendering incomplete: '+chapter.id);
    }
  }
  const p=NetAtLabV2.progress;
  if(p.read.length<90)throw Error('Progress does not persist for all chapters');
  return {rendered:90,read:p.read.length};
 });
 await test('netatlab-v2-bookmarks-and-mobile-fit',function(){
  NetAtLabV2.chapterOpen('c06');
  if(!NetAtLabV2.progress.bookmarks.includes('c06'))
    document.querySelector('[data-na2="bookmark"]').click();
  if(!NetAtLabV2.progress.bookmarks.includes('c06'))throw Error('Bookmark not saved');
  const root=document.querySelector('.na2-root'),rect=root.getBoundingClientRect();
  if(rect.width>window.innerWidth+1)throw Error('Reader exceeds viewport');
  return {saved:true,readerWidth:Math.round(rect.width),viewport:window.innerWidth};
 });
 await shot('v10-netatlab-final.png');
 await test('firewall-rule-editor',function(){
  PacketLabV09Training.createLab('network');
  VeyraNext.presetBuild('star',8,{skipDraft:true});
  const d=VeyraCore.state.devices.find(x=>x.type==='pc');
  PacketLabV09Firewall.open(d.id);
  if(!document.querySelector('#v9-fw-default'))throw Error('Firewall editor missing');
  document.querySelector('[data-v9-fw=add]').click();
  for(const [id,v] of Object.entries({'v9-fwa':'deny','v9-fwp':'tcp','v9-fws':'192.168.1.0/24',
    'v9-fwd':'any','v9-fwport':'8443','v9-fwzone':'lan'}))document.querySelector('#'+id).value=v;
  document.querySelector('[data-v9-fw=save]').click();
  const policy=PacketLabV06.profile(d).fwPolicy;
  if(!policy.rules.some(x=>x.port===8443&&x.source==='192.168.1.0/24'))
   throw Error('Rule not persisted');
  return {ruleCount:policy.rules.length,first:policy.rules[0]};
 });
 await shot('v09-firewall-studio.png');
 await test('inspector-versus-analysis',function(){
  PacketLabV09Diagnostics.inspector();
  const insp=!!document.querySelector('.v9-device-detail-grid');
  const inspTitle=document.querySelector('.pl-head strong')?.textContent;
  PacketLabV09Diagnostics.analysis();
  const analytics=!!document.querySelector('.v9-analysis-bars');
  const analysisTitle=document.querySelector('.pl-head strong')?.textContent;
  if(!insp||!analytics||inspTitle===analysisTitle)throw Error('Inspector duplicates analysis');
  return {inspTitle,analysisTitle};
 });
 await test('builder-target-state-multi-condition-diff',function(){
  const base=JSON.parse(VeyraNext.pack()),final=JSON.parse(JSON.stringify(base));
  const a=final.snapshot.devices[0],b=final.snapshot.devices[final.snapshot.devices.length-1];
  a.vprofile=a.vprofile||{};
  a.vprofile.patched=true;a.vprofile.security=90;
  a.vprofile.fwPolicy={enabled:true};a.vprofile.firewallEnabled=true;
  a.vprofile.enabledServices={...(a.vprofile.enabledServices||{}),http:true};
  final.studio.dnsRecords.push({host:'intranet.lab',type:'A',value:'192.168.1.50'});
  const existing=new Set(base.snapshot.links.map(l=>[l.a,l.b].sort().join('|')));
  const nodes=final.snapshot.devices;
  let pair=null;
  for(const src of nodes){for(const dst of nodes){
    if(src.id!==dst.id&&!existing.has([src.id,dst.id].sort().join('|'))){
      pair=[src.id,dst.id];break;
    }
  }if(pair)break}
  if(!pair)throw Error('No unconnected pair for goal-diff test');
  final.snapshot.links.push({id:'test-link',a:pair[0],b:pair[1],dead:false});
  const kinds=PacketLabV09Training.goalDiff(base,final).map(x=>x.kind);
  for(const kind of ['firewall','hardening','service','link','dnsrecord'])
    if(!kinds.includes(kind))throw Error('Missing inferred goal: '+kind+' in '+kinds);
  return {inferred:kinds.length,kinds};
 });
 await test('builder-templates-multilevel',function(){
  PacketLabV09Training.prepareTemplate('ipv4');
  const lab=VeyraNext.lab,work=PacketLabV09Training.workEnvelope();
  if(lab.v9Role!=='builder'||work.tasks.length<3||!work.start?.snapshot?.devices?.length)
    throw Error('Template builder missing initial graph/tasks');
  if(!work.levels.length||work.format!=='veyra-worklab')throw Error('Worklab structure wrong');
  return {title:work.title,levels:work.levels.length,tasks:work.tasks.length,
    startDevices:work.start.snapshot.devices.length};
 });
 await test('dual-export-pklab-worklab',function(){
  window.TEST_EXPORTS=[];
  window.VeyraNative={saveNamedFile:(name,mime,data)=>TEST_EXPORTS.push({name,mime,len:data.length}),
    vibrate:()=>{}, notifyUser:()=>{}};
  PacketLabV09Training.saveBuilder();
  const files=TEST_EXPORTS.map(x=>x.name);
  if(files.length!==2||!files.some(x=>x.endsWith('.worklab'))||
      !files.some(x=>x.endsWith('.pklab')))throw Error('Missing both files '+files);
  return TEST_EXPORTS;
 });
 await test('load-worklab-and-readonly-task-definitions',async function(){
  const work=PacketLabV09Training.workEnvelope();
  PacketLabV09Training.openWorklab(work,{save:false});
  await new Promise(resolve=>setTimeout(resolve,200));
  const role=PacketLabV09Training.role();
  const hasTaskBook=!!document.querySelector('.v11-lesson-task');
  const editControl=!!document.querySelector('[data-v9-edit]');
  if(role!=='training'||!hasTaskBook||editControl)throw Error('Worklab did not start read-only challenge');
  return {role,taskCount:VeyraNext.lab.tasks.length,hasTaskBook,editControl};
 });
 await shot('v09-training-worklab.png');
 await test('worklab-clone-into-builder',function(){
  const work=VeyraNext.lab.v9Worklab;
  PacketLabV09Training.cloneWorklab(work);
  if(PacketLabV09Training.role()!=='builder'||!VeyraNext.lab.tasks.length)
   throw Error('Builder clone failed');
  return {role:PacketLabV09Training.role(),title:VeyraNext.lab.title};
 });
 await test('training-hides-free-quickedit',function(){
  const r=PacketLabV09QuickEdit.openAt(220,400,{x:400,y:400});
  if(r!==false)throw Error('QuickEdit not restricted');
  PacketLabV09Training.createLab('network');
  const yes=PacketLabV09QuickEdit.openAt(220,400,{x:400,y:400});
  if(!yes||document.querySelectorAll('.v11-q-category').length!==7)
   throw Error('Free-lab Quick Edit failed');
  PacketLabV09QuickEdit.close();
  return {restricted:true,freeLab:true};
 });
 await test('building-2d-and-floors',function(){
  PacketLabV09Building.toggle();
  if(!PacketLabV09Building.enabled)throw Error('Building disabled');
  if(!document.querySelector('#v9-building-svg'))throw Error('Building canvas missing');
  const roomTab=document.querySelector('[data-v9-building=medium]');
  if(!roomTab)throw Error('Room palette missing');
  roomTab.click();
  const svg=document.querySelector('#v9-building-svg'),rect=svg.getBoundingClientRect();
  svg.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:rect.left+rect.width*.5,
    clientY:rect.top+rect.height*.5,pointerId:1}));
  if(!VeyraNext.lab.rooms.length)throw Error('Room not placed');
  document.querySelector('#v9-floor-next').click();
  if(VeyraNext.lab.floor!==2)throw Error('Floor navigation broken');
  return {rooms:VeyraNext.lab.rooms.length,floor:VeyraNext.lab.floor};
 });
 await test('network-agent-consent-gated',function(){
  PacketLabV09Discovery.openAgent();
  const button=document.querySelector('#v9-scan');
  if(!button)throw Error('Agent missing');
  button.click();
  const consent=PacketLabV09Discovery.data;
  if(consent)throw Error('Scan started without consent');
  return {consentPrompt:!!document.querySelector('[name=permission]'),scanStarted:false};
 });
 await test('foundation-and-ipv4-deep-library',function(){
   const counts=window.NetAtLabChapterExpansion;
   if(counts.foundations!==20||counts.ipv4!==20||counts.total!==90)
      throw Error('Expected 20 Foundations, 20 IPv4 and 90 chapters: '+JSON.stringify(counts));
   const basic=NetAtLabV2.chapters.filter(x=>x.category==='Fundament');
   const ipv4=NetAtLabV2.chapters.filter(x=>x.category==='IPv4');
   if(ipv4.filter(x=>/Subnetting|Subnetz|VLSM|\/[0-9]{2}/i.test(x.title)).length<9)
      throw Error('IPv4 subnetting breadth missing');
   return counts;
 });
 await test('training-catalog-for-every-chapter',function(){
    PacketLabV09Training.createLab('network');
    PacketLabV11Training.openCatalog();
    const cards=document.querySelectorAll('[data-v11-chapter]');
    const sample=cards[0]?.querySelector('b')?.textContent;
    if(cards.length!==90||!sample)throw Error('Training catalog must have 90 entries; got '+cards.length);
    const search=document.querySelector('#v11-catalog-search');
    search.value='Subnetting';search.dispatchEvent(new Event('input',{bubbles:true}));
    const filtered=document.querySelectorAll('#v11-catalog-list .v11-course').length;
    if(filtered<2||filtered>20)throw Error('Training search filter broken: '+filtered);
    return {courses:cards.length,filtered,first:sample};
 });
 await run(function(){document.getElementById('pl-notice')?.classList.remove('active');return true});
 await shot('v11-training-catalog.png');
 await test('training-preview-difficulties',function(){
   PacketLabV11Training.preview('c06');
   if(!document.querySelector('.v11-difficulty')||
      document.querySelectorAll('[data-v11-diff]').length!==4)
     throw Error('Difficulty preview not rendered');
   document.querySelector('[data-v11-diff=experte]').click();
   if(!document.querySelector('[data-v11-diff=experte].active'))
     throw Error('Expert option not selected');
   if(!document.querySelector('#v11-preview-start'))throw Error('Missing Start');
   return {choices:4,title:document.querySelector('.v11-academy-header h2')?.textContent};
 });
 await run(function(){document.getElementById('pl-notice')?.classList.remove('active');return true});
 await shot('v11-training-preview.png');
 await test('chapter-training-start-book-and-bottom-nav',async function(){
    document.querySelector('#v11-preview-start').click();
    await new Promise(resolve=>setTimeout(resolve,230));
    const work=VeyraNext.lab.v9Worklab,nav=document.querySelector('.v-nav');
    if(PacketLabV09Training.role()!=='training'||!work||work.tasks.length!==4)
      throw Error('Expert course did not load as 4-task worklab');
    if(nav.querySelectorAll('[data-tab]').length!==4||!nav.classList.contains('v11-four-tabs'))
      throw Error('Bottom navigation has wrapped/extra tab');
    const buttons=[...nav.querySelectorAll('button')];
    const y=buttons.map(b=>Math.round(b.getBoundingClientRect().top));
    if(new Set(y).size!==1)throw Error('Bottom nav spans multiple rows '+y);
    if(!document.querySelector('.v11-lesson-task'))
      throw Error('Task book should open upon chapter start');
    const book=document.getElementById('v9-book');
    VeyraNext.close();book.click();
    if(!document.querySelector('.v11-lesson-task')||
       document.querySelector('.na2-root'))throw Error('Training book must show tasks, not the handbook');
    if(document.querySelectorAll('.v11-lesson-task details').length)
      throw Error('Expert should not show hints');
    return {count:work.tasks.length,difficulty:work.difficulty,tabCount:buttons.length,rowYs:y};
 });
 await run(function(){document.getElementById('pl-notice')?.classList.remove('active');return true});
 await shot('v11-training-taskbook.png');
 await test('manual-handbook-access-in-training',function(){
    const x=document.querySelector('#v11-open-handbook');if(!x)throw Error('Handbook link missing');
    x.click();
    if(!document.querySelector('.na2-root'))throw Error('Original Net@Lab inaccessible');
    document.getElementById('v9-book').click();
    if(!document.querySelector('.v11-lesson-task')||document.querySelector('.na2-root'))
      throw Error('Book button did not return to task sheet');
    return {handbookSeparate:true};
 });
 await test('easy-course-prefilled-and-hints',async function(){
    PacketLabV11Training.startChapter('c06','leicht');
    await new Promise(resolve=>setTimeout(resolve,210));
    const w=VeyraNext.lab.v9Worklab;
    const hintCount=document.querySelectorAll('.v11-lesson-task details p').length;
    if(w.tasks.length!==1||hintCount!==3)throw Error('Easy course should have 1 task and 3 mini tips; '+w.tasks.length+'/'+hintCount);
    const grade=PacketLabV06.evaluateTasks(VeyraCore.state,VeyraNext.lab);
    if(grade.some(t=>t.passed))throw Error('Exercise already solved at start');
    return {difficulty:w.difficulty,tasks:w.tasks.length,tips:hintCount,unsolved:true};
 });
 await test('each-subject-can-generate-an-unsolved-exercise',function(){
    const seen=new Set(),examples=[];
    for(const chapter of PacketLabV11Training.chapters){
      if(seen.has(chapter.category))continue;
      seen.add(chapter.category);
      const w=PacketLabV11Training.setupChapter(chapter,'leicht');
      const t=w.tasks[0],r=PacketLabV06.evaluateTasks(VeyraCore.state,VeyraNext.lab);
      if(w.format!=='veyra-worklab'||!w.start.snapshot?.devices?.length||!t||r[0].passed)
       throw Error('Course was not playable/unsolved: '+chapter.category+' '+JSON.stringify(r[0]));
      examples.push([chapter.category,t.kind]);
    }
    return {categories:seen.size,examples};
 });
 await test('quickedit-requires-movement-and-dwell',async function(){
    PacketLabV09Training.createLab('network');
    const API=PacketLabV09QuickEdit,count=VeyraCore.state.devices.length;
    API.openAt(160,600,{x:450,y:320},{pointerId:43});
    if(!API.isOpen||!document.querySelector('.v11-q-menu'))throw Error('Quick Edit not opened');
    window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:43,pointerType:'touch',clientX:160,clientY:600}));
    if(API.isOpen||VeyraCore.state.devices.length!==count)
      throw Error('No-movement release unexpectedly selected an action');
    API.openAt(160,600,{x:450,y:320},{pointerId:44});
    const group=document.querySelector('[data-v11-group=clients]'),rect=group.getBoundingClientRect();
    const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:44,pointerType:'touch',clientX:x,clientY:y}));
    await new Promise(resolve=>setTimeout(resolve,345));
    const first=document.querySelector('[data-v11-choice=pc]');
    if(!first)throw Error('Hover dwell did not open submenu');
    const box=first.getBoundingClientRect(),cx=box.left+box.width/2,cy=box.top+box.height/2;
    window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:44,pointerType:'touch',clientX:cx,clientY:cy}));
    await new Promise(resolve=>setTimeout(resolve,280));
    if(!first.classList.contains('armed'))throw Error('Subaction not armed after dwell');
    window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:44,pointerType:'touch',clientX:cx,clientY:cy}));
    if(API.isOpen||VeyraCore.state.devices.length!==count+1)
       throw Error('Touch release did not place one client');
    return {neverSelectWithoutMovement:true,categoryDwell:API.gesture.categoryDwell,selectionDwell:API.gesture.choiceDwell,devices:VeyraCore.state.devices.length};
 });
 await test('no-legacy-canvas-in-free-lab',function(){
    PacketLabV09Training.createLab('network');
    const canvas=document.querySelector('canvas');
    canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:210,clientY:500}));
    const custom=!!document.querySelector('.v11-q-menu'),old=[...document.querySelectorAll('[class*=ctx]')].some(x=>
       getComputedStyle(x).display!=='none'&&x.textContent.trim()==='CANVAS');
    PacketLabV09QuickEdit.close();
    if(!custom||old)throw Error('Legacy CANVAS menu still opens');
    return {custom,old};
 });
 await test('building-switch-off-and-last-in-devices',function(){
   PacketLabV09Training.createLab('network');
   const toggle=document.getElementById('v9-building-toggle');
   if(!toggle||toggle.hidden||!toggle.parentElement)throw Error('Building switch missing');
   if(PacketLabV09Building.enabled||VeyraNext.lab.v9Building===true)
     throw Error('Building switched on by default');
   const last=toggle.parentElement.lastElementChild;
   if(last!==toggle)throw Error('Building switch must be last device-list item: '+last?.id);
   return {defaultOff:true,parent:toggle.parentElement.id,last:last.id};
 });
 await test('top-book-and-icon-audit-mobile',function(){
   const header=document.querySelector('.topbar'),book=document.getElementById('v9-book');
   if(!book||!header.contains(book)||book.querySelectorAll('svg').length!==1)
     throw Error('Book icon absent or doubled');
   if(document.getElementById('v8-app-version'))throw Error('Glitching version badge still in top header');
   for(const id of ['pl-morepresets','pl-simtool','v9-building-toggle']){
     const el=document.getElementById(id);
     if(!el?.querySelector('svg'))throw Error('Missing stable SVG icon '+id);
   }
   const a=book.getBoundingClientRect(),b=document.querySelector('.brand').getBoundingClientRect();
   if(a.left<b.right-3)throw Error('Book overlaps brand '+[a.left,b.right]);
   return {bookSvgs:1,overlap:false,icons:3};
 });
 await test('topology-picker-all-eighteen-and-size',function(){
   const btn=document.getElementById('btnTopoPick');btn.click();
   const cards=[...document.querySelectorAll('[data-v112-topo]')];
   if(cards.length!==18)throw Error('Top picker has '+cards.length+' of 18');
   if(cards.some(x=>!x.querySelector('svg')))throw Error('Broken topology icons');
   const inp=document.getElementById('v112-count');
   inp.value='16';inp.dispatchEvent(new Event('input',{bubbles:true}));
   document.querySelector('[data-v112-topo=star]').click();
   if(VeyraCore.state.devices.length!==16||document.getElementById('topoPickName').textContent!=='Stern')
     throw Error('Star size or top name not synced: '+VeyraCore.state.devices.length+' '+document.getElementById('topoPickName').textContent);
   return {choices:cards.length,count:16,name:'Stern'};
 });
 await shot('v112-topology-star.png');
 await test('custom-topology-resizing-and-title',function(){
   const r=PacketLabV111Topology.build('home',12);
   if(r.size!==12||VeyraNext.lab.preset!=='home'||document.getElementById('topoPickName').textContent!=='Smart Home')
     throw Error('Home topology failed resize/title '+JSON.stringify(r));
   const a=PacketLabV111Topology.build('datacenter',32);
   if(a.size!==32||document.getElementById('topoPickName').textContent!=='Datacenter')
     throw Error('Datacenter resize/title '+JSON.stringify(a));
   return {home:12,datacenter:32,reported:document.getElementById('topoPickName').textContent};
 });
 await test('all-topology-sizes-and-state-correct',function(){
   const selected=['bus','tree','ring','mesh','office','campus','dual','industrial','mobile','branch','school','dmz'];
   const data=[];
   for(const [i,key] of selected.entries()){
     const n=[8,16,24][i%3];
     const built=PacketLabV111Topology.build(key,n);
     if(built.size!==n||VeyraNext.lab.preset!==key)
       throw Error('Wrong size/preset for '+key+': '+JSON.stringify(built));
     const name=PacketLabV111Topology.entries.find(x=>x[0]===key)[1];
     if(document.getElementById('topoPickName').textContent!==name)
       throw Error('Top label mismatch for '+key);
     data.push([key,built.size]);
   }
   return {passed:data.length,details:data};
 });
 await test('stored-building-enabled-never-autostarts',function(){
   PacketLabV09Training.createLab('network');
   VeyraNext.lab.v9Building=true;
   const pack=VeyraNext.pack();
   VeyraNext.load(pack);
   if(PacketLabV09Building.enabled||VeyraNext.lab.v9Building!==false)
     throw Error('Saved building mode reopened automatically');
   return {onLaunch:false,onLoad:false};
 });
 await test('selected-topology-remains-after-project-load',function(){
   PacketLabV111Topology.build('school',16);
   const data=VeyraNext.pack();
   VeyraNext.load(data);
   PacketLabV111Topology.updateHeader();
   const label=document.getElementById('topoPickName').textContent;
   if(label!=='Schulnetz'||VeyraCore.state.devices.length!==16)
     throw Error('Saved selected preset lost: '+label);
   return {name:label,count:VeyraCore.state.devices.length};
 });
 await test('all-eighteen-presets-and-large-size',function(){
   const list=PacketLabV111Topology.entries;
   const name=new Set(list.map(x=>x[0]));
   if(list.length!==18||name.size!==18)throw Error('Missing unique presets');
   const large=PacketLabV111Topology.build('star',40);
   if(large.size!==40||VeyraCore.state.devices.length!==40||document.getElementById('nodeCount').max!=='40')
     throw Error('Requested size 40 not supported');
   const mobile=PacketLabV111Topology.build('mobile',40);
   if(mobile.size!==40||VeyraNext.lab.preset!=='mobile')
     throw Error('Mobile topology 40 not supported');
   return {presetCount:list.length,large:large.size,mobile:mobile.size};
 });
 await test('all-topology-picker-visual-and-icon-distinction',function(){
   PacketLabV111Topology.openPresets();
   const choices=document.querySelectorAll('[data-v112-topo]');
   if(choices.length!==18)throw Error('Visual picker missing');
   const sim=document.querySelector('#pl-simtool svg'),bolt=document.querySelector('.v-float [title*=Simulat] svg');
   const floor=document.querySelector('#v9-building-toggle svg');
   if(!sim||!floor)throw Error('SVG icon missing in visible controls');
   return {choices:choices.length,topTitle:document.querySelector('.pl-head strong')?.textContent,
       simulatorIcon:sim.innerHTML.slice(0,80)};
 });
 await shot('v112-all-topologies-picker.png');
 await test('building-toggle-optional-and-stays-bottom',function(){
   VeyraNext.close();
   PacketLabV09Training.createLab('network');
   const switcher=document.getElementById('v9-building-toggle');
   if(!switcher||switcher.parentElement.lastElementChild!==switcher)
      throw Error('Building not at bottom');
   if(PacketLabV09Building.enabled)throw Error('Building must start off');
   switcher.click();
   if(!PacketLabV09Building.enabled)throw Error('Building cannot be enabled');
   PacketLabV09Building.toggle();
   if(PacketLabV09Building.enabled)throw Error('Building cannot be disabled');
   return {defaultOff:true,canEnable:true,canDisable:true,last:true};
 });
 await test('v112-native-preset-density-and-section-headings',function(){
   PacketLabV111Topology.openPresets();
   const group=[...document.querySelectorAll('.v113-preset-section')];
   const options=[...document.querySelectorAll('.v112-topo-option')];
   if(group.length!==2||options.length!==18)throw Error('Missing grouped topology list');
   const height=options.map(x=>Math.round(x.getBoundingClientRect().height));
   if(height.some(x=>x>75||x<48))throw Error('UI rows must be compact and touch-friendly: '+height);
   const cols=getComputedStyle(document.querySelector('.v112-preset-grid'));
   if(cols.display!=='flex')throw Error('Preset list is still repetitive card grid');
   const rect=document.querySelector('#pl-sheet').getBoundingClientRect();
   if(rect.width>innerWidth+1)throw Error('Sheet overflow '+rect.width+' > '+innerWidth);
   return {groups:group.map(x=>x.textContent.trim()),minRow:Math.min(...height),maxRow:Math.max(...height),width:Math.round(rect.width)};
 });
 await shot('v112-compact-topology.png');
 await test('v112-material-surface-and-training-list',function(){
   PacketLabV11Training.openCatalog();
   const search=document.querySelector('#v11-catalog-search');
   search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));
   document.querySelector('[data-v11-cat="Alle"]').click();
   const header=document.querySelector('.v11-academy-header'),
     background=getComputedStyle(header).backgroundColor;
   if(background!=='rgba(0, 0, 0, 0)')throw Error('Training uses large painted header');
   const rows=[...document.querySelectorAll('.v11-course')];
   if(rows.length<85)throw Error('Some trainings disappeared');
   const first=getComputedStyle(rows[0]);
   if(first.borderTopWidth!=='0px')throw Error('Training still uses individual card borders');
   return {chapters:rows.length,header:background,rowHeight:Math.round(rows[0].getBoundingClientRect().height)};
 });
 await shot('v112-training-list.png');
 await test('v112-editor-and-handbook-balance',function(){
   PacketLabV09Guide.open();
   const hero=document.querySelector('.na2-hero');
   if(!hero)throw Error('Handbook unavailable');
   const css=getComputedStyle(hero);
   if(css.backgroundImage!=='none')throw Error('Editorial handbook still uses gradient decoration');
   if(getComputedStyle(hero,'::after').display!=='none')throw Error('Decorative rings not removed');
   return {handbook:NetAtLabV2.chapters.length,hero:css.backgroundColor,gradient:false};
 });
 const out={cases,runtime,consoleErrors};
 fs.writeFileSync(path.join(__dirname,'packetlab-v112-smoke-report.json'),JSON.stringify(out,null,2));
 console.log(JSON.stringify(out,null,2));ws.close();
 if(cases.some(x=>!x.ok)||runtime.length||consoleErrors.length)process.exitCode=2;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
