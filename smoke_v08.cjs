// Real rendered mobile browser smoke tests for PacketLab 0.8.
'use strict';
const fs=require('fs'),path=require('path'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const target=await fetch('http://127.0.0.1:9231/json/new?about:blank',{method:'PUT'}).then(r=>r.json());
 const ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 let seq=0;const pending=new Map(),runtimeErrors=[],consoleErrors=[],results=[];
 ws.onmessage=({data})=>{
   const msg=JSON.parse(data);
   if(msg.id&&pending.has(msg.id)){
     const p=pending.get(msg.id);pending.delete(msg.id);
     msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result||{});
   }
   if(msg.method==='Runtime.exceptionThrown')runtimeErrors.push(msg.params.exceptionDetails.text);
   if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')
     consoleErrors.push(msg.params.args.map(x=>x.value||x.description||'error').join(' '));
 };
 const call=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++seq;pending.set(id,{resolve,reject});
   ws.send(JSON.stringify({id,method,params}));
   setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('Timeout '+method))}},15000);
 });
 const js=async expression=>{
  const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result?.value;
 };
 const test=async(label,fn)=>{
   try{const value=await js('('+fn.toString()+')()');results.push({label,ok:true,value});}
   catch(e){results.push({label,ok:false,error:String(e)})}
 };
 const shot=async(name)=>{
  const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,name),Buffer.from(r.data,'base64'));
 };
 await call('Page.enable');await call('Runtime.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:414,height:1030,deviceScaleFactor:1,mobile:true});
 const url='file:///'+path.join(__dirname,'app/src/main/assets/index.html').replace(/\\/g,'/');
 await call('Page.navigate',{url});await sleep(2200);
 await test('Boot all extensions',function(){
  const V=window.PacketLabV08,O=window.PacketLabV08OS;
  if(!V||!O||!window.VeyraNext)throw Error('Missing core module');
  VeyraNext.presetBuild('star',8,{skipDraft:true});
  if(!VeyraCore.state.devices.length)throw Error('No devices');
  return {v:V.version,os:O.version,devices:VeyraCore.state.devices.length};
 });
 await test('Unified device menus no old decorated columns',async function(){
  const d=VeyraCore.state.devices.find(x=>x.type==='pc');
  PacketLabV08.openDevice(d.id);
  await new Promise(r=>setTimeout(r,30));
  const parent=document.querySelector('#pl-sheet'),list=parent.querySelector('.v8-device-sheet');
  if(!list)throw Error('v8 sheet missing');
  if(parent.querySelector('.pl-options'))throw Error('Legacy menu injected');
  const rows=[...list.querySelectorAll('.v8-action')];
  if(rows.length<9)throw Error('Missing device actions '+rows.length);
  for(const row of rows){
   if(row.querySelectorAll('.v8-action-icon').length!==1)throw Error('Wrong icon count');
   if(row.querySelectorAll('.v8-action-copy strong').length!==1)throw Error('Missing title');
   const rect=row.getBoundingClientRect();if(rect.height<47)throw Error('Touch target too small '+rect.height);
   const c=getComputedStyle(row);
   if(c.display!=='grid')throw Error('Grid layout changed');
   if(!row.classList.contains('v8-action-danger')&&c.backgroundColor!=='rgba(0, 0, 0, 0)')throw Error('Unexpected purple row background '+c.backgroundColor);
  }
  return {rows:rows.length,labels:rows.map(x=>x.querySelector('strong').textContent)};
 });
 await shot('v08-device-studio.png');
 await test('Legacy handlers routed to new sheet',async function(){
  const d=VeyraCore.state.devices.find(x=>x.type==='pc');
  const menu=document.querySelector('.v8-device-sheet');
  if(!menu)throw Error('No menu');
  const terminal=menu.querySelector('[data-v8-act=term]');
  if(!terminal)throw Error('Terminal missing');
  terminal.click();
  await new Promise(r=>setTimeout(r,40));
  if(!document.querySelector('[data-v8-terminal]'))throw Error('Virtual OS UI not launched');
  return {terminalTitle:document.querySelector('.v8-terminal-head strong').textContent};
 });
 await shot('v08-terminal-linux.png');
 await test('Linux VFS writes, directories and service state',function(){
  const d=VeyraCore.state.devices.find(x=>x.type==='pc'),T=PacketLabV08OS.exec;
  d.vprofile.os='Linux';
  const dir=T(d.id,'mkdir sandbox'),cd=T(d.id,'cd sandbox');
  T(d.id,'echo payload_lab > check.txt');
  const text=T(d.id,'cat check.txt');
  T(d.id,'cp check.txt copy.txt');
  const ls=T(d.id,'ls -la');
  T(d.id,'systemctl start http');
  const state=d.vprofile.enabledServices.http;
  if(!text.includes('payload_lab')||!ls.includes('copy.txt')||!state)throw Error('VFS changes not persisted');
  return {dir,cd,text,ls,service:state};
 });
 await test('Virtual OS chooser Windows',function(){
  const d=VeyraCore.state.devices.find(x=>x.type==='pc');
  PacketLabV08.openOSChooser(d.id);
  const input=[...document.querySelectorAll('[name=v8-os]')].find(x=>x.value==='Windows');
  if(!input)throw Error('Windows option missing');
  input.checked=true;document.querySelector('[data-v8=save]').click();
  if(d.vprofile.os!=='Windows')throw Error('Selection not saved');
  PacketLabV08OS.terminal(d.id);
  if(!document.querySelector('.v8-terminal-head strong').textContent.includes('WINDOWS'))throw Error('Incorrect OS terminal');
  return {os:d.vprofile.os};
 });
 await shot('v08-terminal-windows.png');
 await test('Windows VFS and process/service model',function(){
  const d=VeyraCore.state.devices.find(x=>x.type==='pc'),T=PacketLabV08OS.exec;
  const dir=T(d.id,'dir'),tasklist=T(d.id,'tasklist'),ipconfig=T(d.id,'ipconfig /all');
  T(d.id,'mkdir Reports');T(d.id,'cd Reports');T(d.id,'echo windows test > result.txt');
  const type=T(d.id,'type result.txt');
  T(d.id,'Start-Service dns');
  if(!dir.includes('README.txt')||!tasklist.includes('explorer.exe')||
     !ipconfig.includes(d.ip)||!type.includes('windows test')||!d.vprofile.dnsEnabled)
     throw Error('Windows profile not reflected in state');
  return {dir,os:true,read:type,enabledDNS:d.vprofile.dnsEnabled};
 });
 await test('Cisco IOS virtual config + NVRAM',function(){
  const d=VeyraCore.state.devices.find(x=>x.type==='switch')||VeyraCore.state.devices[0],
    T=PacketLabV08OS.exec;
  d.vprofile.os='Cisco IOS (Modell)';
  const v=T(d.id,'show version'),run=T(d.id,'show running-config'),
    copy=T(d.id,'copy running-config startup-config'),
    startup=T(d.id,'show startup-config');
  if(!v.includes('IOS')||!run.includes(d.ip)||!startup.includes(d.ip))
    throw Error('IOS simulation does not reflect device state');
  return {v,copy,nvramStored:true};
 });
 await test('Phone Android and iOS filesystem',function(){
  PacketLabV07.openPresets();
  const b=document.querySelector('[data-v07-preset=mobile]');if(!b)throw Error('Missing mobile preset');
  b.click();
  const p=VeyraCore.state.devices.find(x=>x.type==='phone'),T=PacketLabV08OS.exec;
  if(!p)throw Error('Mobile preset no phone');
  p.vprofile.mobileOs='Android';
  const packages=T(p.id,'pm list packages');
  T(p.id,'cd /sdcard/Download');T(p.id,'echo virtualphone > readme.txt');
  const androidFile=T(p.id,'cat readme.txt');
  p.vprofile.mobileOs='iOS';
  const ios=T(p.id,'sysctl -a'),os=PacketLabV08OS.platform(p);
  p.vprofile.mobileOs='Android';
  const restoredAndroid=T(p.id,'cat readme.txt');
  if(!packages.includes('com.android.settings')||!androidFile.includes('virtualphone')
     ||!restoredAndroid.includes('virtualphone')||!ios.includes('hw.memsize')||os!=='ios')
     throw Error('Mobile OS model or per-OS file persistence broken');
  return {androidPackages:packages.split('\n').length,ios:os,androidRestored:true};
 });
 await test('Save and restore per-device file state',function(){
  const d=VeyraCore.state.devices.find(x=>x.type==='phone');
  d.vprofile.mobileOs='Android';
  PacketLabV08OS.exec(d.id,'echo persist-v08 > /sdcard/Download/persist.txt');
  const json=VeyraNext.pack(),label=d.label;
  if(!json.includes('persist-v08'))throw Error('Virtual OS data not in project JSON');
  VeyraNext.load(json);
  const restored=VeyraCore.state.devices.find(x=>x.label===label);
  const val=PacketLabV08OS.exec(restored.id,'cat /sdcard/Download/persist.txt');
  if(!val.includes('persist-v08'))throw Error('VFS files lost during save/load');
  return {bytes:json.length,restored:true};
 });
 const final={results,runtimeErrors,consoleErrors};
 fs.writeFileSync(path.join(__dirname,'packetlab-v08-smoke-report.json'),JSON.stringify(final,null,2),'utf8');
 console.log(JSON.stringify(final,null,2));ws.close();
 if(results.some(x=>!x.ok)||runtimeErrors.length||consoleErrors.length)process.exitCode=2;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
