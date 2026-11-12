// Headless Chromium CDP smoke test of the actual bundled Android asset interface.
const fs=require('fs');
const path=require('path');
const base=__dirname,PORT=9231;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let target=await fetch('http://127.0.0.1:'+PORT+'/json/new?about:blank',{method:'PUT'}).then(r=>r.json());
 const socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
 let serial=0; const pending=new Map(),errors=[],consoleMessages=[];
 socket.addEventListener('message',e=>{
   let msg=JSON.parse(e.data);
   if(msg.id&&pending.has(msg.id)){
      const p=pending.get(msg.id);pending.delete(msg.id);
      if(msg.error)p.reject(Error(JSON.stringify(msg.error)));else p.resolve(msg.result||{});
   }
   if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);
   if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')
     consoleMessages.push((msg.params.args||[]).map(a=>a.value||a.description).join(' '));
 });
 function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;
   pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
   setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error(method+' timed out'))}},20000);
 })}
 async function expr(expression){const r=await send('Runtime.evaluate',{expression,
   returnByValue:true,awaitPromise:true}); if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
   return r.result.value}
 async function shot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   fs.writeFileSync(path.join(base,name),Buffer.from(r.data,'base64'))}
 await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:414,height:896,deviceScaleFactor:1,mobile:true});
 const url='file:///'+path.join(base,'app/src/main/assets/index.html').replace(/\\/g,'/');
 await send('Page.navigate',{url});await sleep(2600);
 // Isolated test browser profile: always start with the original star,
 // not the world left over from yesterday's smoke run.
 await expr("VeyraNext.presetBuild('star',8,{skipDraft:true}); VeyraNext.switchMode('standard',{skipDraft:true}); 'fresh'");
 const results=[];
 async function test(label,fn){try{const value=await expr('('+fn.toString()+')()');
   results.push({label,ok:true,result:value});
 }catch(e){results.push({label,ok:false,error:String(e)})}}
 await test('bootstrap',function(){return {v07:!!window.PacketLabV07,v06:!!window.PacketLabV06UI,
   scripts:[...document.scripts].length,deviceCount:window.VeyraCore?.state.devices.length,
   quickSend:!!document.getElementById('v07-quick-send'),
   headerPlay:!!document.querySelector('.topbar__right #v06-sim-state'),
   guide:!!document.getElementById('v07-guide')}});
 await shot('v07-smoke-home.png');
 await test('studio',function(){document.querySelector('#pl-simtool')?.click();return {title:document.querySelector('.pl-head strong')?.textContent,cards:document.querySelectorAll('.v07-studio-grid .v07-row').length}});
 await shot('v07-smoke-studio.png');
 await test('presets',function(){PacketLabV07.openPresets();return {title:document.querySelector('.pl-head strong')?.textContent,count:document.querySelectorAll('[data-v07-preset]').length}});
 await test('guide',function(){PacketLabV07.openGuide();return {title:document.querySelector('.pl-head strong')?.textContent,chapters:document.querySelectorAll('.v07-guide-list details').length,calc:document.querySelector('#v07-calc-result')?.textContent}});
 await test('inspector',function(){PacketLabV07.openInspector();return {title:document.querySelector('.pl-head strong')?.textContent,devices:document.querySelectorAll('[data-v07-inspect]').length}});
 await shot('v07-smoke-inspector.png');
 await test('analysis',function(){PacketLabV07.openAnalysis();return {title:document.querySelector('.pl-head strong')?.textContent,score:document.querySelector('.v07-score-line')?.textContent,issues:document.querySelectorAll('.v07-issue').length}});
 await test('modules',function(){const d=VeyraCore.state.devices.find(x=>x.type==='pc')||VeyraCore.state.devices[0];PacketLabV07.openModules(d.id);return {title:document.querySelector('.pl-head strong')?.textContent,count:document.querySelectorAll('[data-v07-module]').length}});
 await test('mobilePhone',function(){const d=VeyraCore.state.devices.find(x=>x.type==='phone');if(!d)return {exists:false};PacketLabV07.openSmartphone(d.id);return {title:document.querySelector('.pl-head strong')?.textContent,os:document.querySelector('#v07-mobile-os')?.value}});
 await test('firewall',function(){const d=VeyraCore.state.devices.find(x=>x.type==='pc')||VeyraCore.state.devices[0];PacketLabV07.openFirewallAdvanced(d.id);return {title:document.querySelector('.pl-head strong')?.textContent,ruleForm:!!document.querySelector('#v07-rule-source'),max:document.querySelectorAll('[data-v07-rule]').length}});
 await test('ruleRangesCIDR',function(){const d=VeyraCore.state.devices.find(x=>x.type==='pc')||VeyraCore.state.devices[0];const root=document.querySelector('#pl-sheet');if(!root.querySelector('#v07-rule-source'))return 'no form';
   root.querySelector('#v07-fw-enabled').value='on';
   root.querySelector('#v07-rule-port').value='8000-9000';
   root.querySelector('#v07-rule-source').value='192.168.1.0/24';
   root.querySelector('#v07-rule-target').value='any';
   root.querySelector('[data-v07="add-rule"]').click();
   const rule=PacketLabV06.profile(d).fwPolicy.rules.slice(-1)[0];
   const s=VeyraCore.state,from=s.devices.find(x=>x.type==='pc'&&x.id!==d.id);
   const r=PacketLabV06.send(s,VeyraNext.lab,{source:from.id,target:d.id,
      kind:'https',protocol:'tcp',port:8443,count:1,bytes:128});
   return {rule,blocked:!r.ok,reason:r.reason}});
 await test('quickSend',function(){PacketLabV07.openStudio();document.querySelector('#v07-quick-send')?.click();document.querySelector('#v07-quick-send')?.click();
    return {quick:document.getElementById('v07-quick-send')?.title,result:document.getElementById('v06-last-result')?.textContent}});
 await test('maskAPI',function(){return {prefix24:PacketLabV07.maskPrefix('255.255.255.0'),
    prefix27:PacketLabV07.maskPrefix('255.255.255.224'),
    invalid:PacketLabV07.validMask('255.0.255.0'),
    valid:PacketLabV07.inside('192.168.3.5','192.168.3.1','255.255.255.0')}});
 await test('backExit',function(){VeyraNext.close();const used=window.VeyraBack?.();return {handled:used,title:document.querySelector('.pl-head strong')?.textContent}});
 await test('inspectorTab',function(){VeyraNext.close();document.querySelector('.v-nav [data-tab="inspect"]').click();return document.querySelector('.pl-head strong')?.textContent});
 await test('analysisTab',function(){VeyraNext.close();document.querySelector('.v-nav [data-tab="analysis"]').click();return document.querySelector('.pl-head strong')?.textContent});
 await test('invalidNetmask',function(){const s=VeyraCore.state,d=s.devices.find(x=>x.type==='pc'),target=s.devices.find(x=>x.id!==d.id);const p=d.vprofile,prev=p.subnet;p.subnet='255.0.255.0';const r=PacketLabCore.evaluate(s,VeyraNext.lab,d.id,target.id,'icmp');p.subnet=prev;return r.reason});
 await test('dualPresetRouted',function(){VeyraNext.presetBuild('dual',18);const s=VeyraCore.state;const a=s.devices.find(x=>x.type==='pc'&&x.ip.startsWith('192.168.1.'));const b=s.devices.find(x=>x.type==='pc'&&x.ip.startsWith('192.168.2.'));
    const r=PacketLabV06.send(s,VeyraNext.lab,{source:a.id,target:b.id,kind:'https',port:443,count:1});return {a:a.ip,b:b.ip,route:!!PacketLabCore.route(s,a.id,b.id),ok:r.ok,reason:r.reason,links:s.links.length,gateways:[a.vprofile.gateway,b.vprofile.gateway]}});
 await test('mobilePreset',function(){PacketLabV07.openPresets();document.querySelector('[data-v07-preset="mobile"]').click();const list=VeyraCore.state.devices.filter(x=>x.type==='phone');if(!list.length)return {phoneCount:0};PacketLabV07.openSmartphone(list[0].id);return {phoneCount:list.length,os:document.querySelector('#v07-mobile-os')?.value,rootVisible:!!document.querySelector('#v07-root')}});
 await test('mobileNormalPDU',function(){
    const s=VeyraCore.state,p=s.devices.find(x=>x.type==='phone'),t=s.devices.find(x=>x.type==='laptop');
    const route=PacketLabCore.route(s,p.id,t.id),r=PacketLabV06.send(s,VeyraNext.lab,{source:p.id,target:t.id,kind:'icmp',protocol:'icmp',zone:'lan'});
    return {route:route?.path.map(id=>s.devices.find(x=>x.id===id)?.type),
      ok:r.ok,reason:r.reason,links:s.links.length};
 });
 await test('crazyMode',function(){PacketLabV07.settings.crazy=true;const d=VeyraCore.state.devices.find(x=>x.type==='phone');PacketLabV07.openSmartphone(d.id);
    document.querySelector('#v07-root').click();document.querySelector('#v07-repeater').click();document.querySelector('[data-v07="save"]').click();
    return {root:d.vprofile.rooted,repeater:d.vprofile.repeater,os:d.vprofile.mobileOs}});
 await test('moduleConnection',function(){const s=VeyraCore.state,d=s.devices.find(x=>x.type==='server')||s.devices.find(x=>x.type==='pc')||s.devices[0],w=s.links.find(x=>(x.a===d.id||x.b===d.id)&&x.medium!=='wifi'),t=s.devices.find(x=>x.id===(w?.a===d.id?w?.b:w?.a));
   if(!d||!t)return 'unavailable';const p=d.vprofile,old=p.modules;p.modules={ethernet:false,fiber:false};
   const r=PacketLabCore.evaluate(s,VeyraNext.lab,d.id,t.id,'icmp');p.modules=old;return {reason:r.reason,ok:r.ok}});
 await test('pduTrace',function(){
  PacketLabV07.showTrace();
  return {title:document.querySelector('.pl-head strong')?.textContent,
    osi:document.querySelectorAll('.v07-osi details').length,
    routeSteps:document.querySelectorAll('.v07-pdu-hop').length,
    saved:PacketLabV07.traces.length};
 });
 await shot('v07-smoke-pdu.png');
 await test('eventExplorer',function(){
  PacketLabV07.showLogExplorer();
  return {title:document.querySelector('.pl-head strong')?.textContent,
    events:document.querySelectorAll('.v07-log-record').length,
    filters:document.querySelectorAll('#v07-log-kind option').length};
 });
 await test('benignHeartbeat',async function(){
  const v=PacketLabV07; v.settings.normalTraffic=true;
  const lab=VeyraNext.lab;
  lab.clock=11;
  VeyraNext.startVS();
  const before=v.traces.filter(t=>t.kind==='icmp').length;
  await new Promise(resolve=>setTimeout(resolve,1900));
  const after=v.traces.filter(t=>t.kind==='icmp').length;
  return {before,after,added:after-before,clock:lab.clock};
 });
 await test('virtualOsTerminals',function(){
   const s=VeyraCore.state,phone=s.devices.find(x=>x.type==='phone'),router=s.devices.find(x=>x.type==='router');
   const android=VeyraTerminal.execute(phone.id,'getprop ro.product.model');
   const root=VeyraTerminal.execute(phone.id,'su -c id');
   phone.vprofile.mobileOs='iOS';
   const ios=VeyraTerminal.execute(phone.id,'scutil --dns');
   phone.vprofile.mobileOs='Android';
   const cisco=router?VeyraTerminal.execute(router.id,'show ip interface brief'):'no router';
   return {android,root,ios,cisco};
 });
 await test('noAutomaticThreatPropagation',function(){
  const lab=VeyraNext.lab,s=VeyraCore.state;
  const target=s.devices[1],before=lab.logs.filter(e=>e.text.includes('Virtuelle Bedrohung von ')).length;
  const previous=target.vprofile.infection;
  target.vprofile.infection='test-only';
  lab.spread=true;lab.scenarioRunning=false;
  PacketLabCore.tick(s,lab,5);
  const after=lab.logs.filter(e=>e.text.includes('Virtuelle Bedrohung von ')).length;
  lab.spread=false;target.vprofile.infection=previous;
  return {before,after,spreadWhileIdle:after>before};
 });
 const result={url,results,errors,consoleMessages};
 fs.writeFileSync(path.join(base,'packetlab-v07-smoke-report.json'),JSON.stringify(result,null,2),'utf8');
 console.log(JSON.stringify(result,null,2));
 socket.close();
})().catch(err=>{console.error(err.stack);process.exitCode=1});
