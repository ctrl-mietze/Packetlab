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
 await test('offline-handbook-search',function(){
  PacketLabV09Guide.open();
  const chapter=document.querySelector('#v9-doc-article h2')?.textContent;
  const search=document.querySelector('#v9-doc-search');
  search.value='IPv6';search.dispatchEvent(new Event('input',{bubbles:true}));
  const results=document.querySelectorAll('#v9-doc-toc .v9-doc-item').length;
  if(!chapter||results<4)throw Error('Offline guide unavailable');
  return {chapter,searchResults:results,brand:document.querySelector('.v9-doc-brand h2')?.textContent};
 });
 await shot('v09-netatlab-guide.png');
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
  const hasTaskBook=!!document.querySelector('.v9-player-header');
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
  if(!yes||document.querySelectorAll('.v9-quick-main-item').length!==7)
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
 const out={cases,runtime,consoleErrors};
 fs.writeFileSync(path.join(__dirname,'packetlab-v09-smoke-report.json'),JSON.stringify(out,null,2));
 console.log(JSON.stringify(out,null,2));ws.close();
 if(cases.some(x=>!x.ok)||runtime.length||consoleErrors.length)process.exitCode=2;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
