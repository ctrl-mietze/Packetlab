'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'app','src','main','assets','js');
global.Topologies=require(path.join(root,'topologies.js'));
global.Graph=require(path.join(root,'graph.js'));
global.Sim=require(path.join(root,'sim.js'));
const P=require(path.join(root,'packetlab-core.js'));
const E=require(path.join(root,'packetlab-v06-engine.js'));
let count=0;
const test=(name,fn)=>{fn();count++;console.log('PASS',name)};
const generate=(dtypes=['pc','firewall','server'])=>{
 const ds=dtypes.map((type,i)=>Topologies.device(type,type+'-'+i,90+i*140,150,
    {ip:'192.168.1.'+(10+i),mac:'02:30:45:00:00:0'+(i+1)}));
 ds.forEach((d,i)=>{
   d.ip='192.168.1.'+(10+i);
   d.ips=[d.ip];
   d.vprofile=P.sanitizeProfile({ipv4:d.ip,security:50},d);
 });
 const links=ds.slice(1).map((d,i)=>Topologies.link(ds[i],d));
 return {devices:ds,links};
};
test('System has no implicit background traffic',()=>{
 const lab=P.makeLab(),s=generate();
 assert.equal(lab.backgroundTraffic,false);
 P.tick(s,lab,6);
 assert.equal(lab.logs.filter(e=>e.kind==='traffic').length,0);
 assert.equal(lab.clock,6);
});
test('Standard UDP/TCP data does not take devices offline',()=>{
 const s=generate(),lab=P.makeLab(),src=s.devices[0],dst=s.devices[2];
 const r=E.send(s,lab,{source:src.id,target:dst.id,kind:'https',port:443,bytes:1000,count:10});
 assert.equal(r.ok,true);assert.equal(r.delivered,10);
 assert.equal(dst.dead,false);
 assert.equal(dst.vprofile.infection,null);
 assert.ok(src.vprofile.logs.some(e=>e.text.includes('FLOW')));
 assert.ok(dst.vprofile.logs.some(e=>e.text.includes('FLOW')));
});
test('Security packet reaches unprotected target, writes target and intermediate device logs',()=>{
 const s=generate(),lab=P.makeLab(),[a,fw,b]=s.devices;
 const r=E.send(s,lab,{source:a.id,target:b.id,kind:'vuln_smb',port:445,count:1});
 assert.equal(r.ok,true);assert.equal(b.vprofile.infection,'worm');
 for(const d of s.devices)assert.ok(d.vprofile.logs.length>0,d.label+' has event logs');
});
test('Host firewall rule blocks own host, not every other device',()=>{
 const s=generate(),lab=P.makeLab(),[src,middle,dst]=s.devices;
 const policy=E.profile(dst).fwPolicy;
 policy.enabled=true;policy.hostMode=true;
 policy.rules=[{action:'deny',protocol:'tcp',port:443,source:'any',target:'any',zone:'lan'}];
 const denied=E.send(s,lab,{source:src.id,target:dst.id,kind:'https',count:1,port:443});
 assert.equal(denied.ok,false);assert.match(denied.reason,/firewall/);
 assert.ok(dst.vprofile.logs.some(x=>x.type==='blocked'));
 assert.ok(src.vprofile.logs.some(x=>x.type==='blocked'));
});
test('Dedicated firewall blocks only when actual path crosses it',()=>{
 const s=generate(['pc','firewall','server','pc']),lab=P.makeLab(),[a,fw,dst,other]=s.devices;
 const policy=E.profile(fw).fwPolicy;policy.enabled=true;policy.policy='deny';
 assert.equal(E.send(s,lab,{source:a.id,target:dst.id,kind:'https'}).ok,false);
 // A direct cable between two other devices does not cross the dedicated firewall.
 const s2=generate(['pc','server']);
 assert.equal(E.send(s2,P.makeLab(),{source:s2.devices[0].id,target:s2.devices[1].id,kind:'https'}).ok,true);
});
test('Switch and hub cannot host a simulated firewall',()=>{
 assert.equal(E.isFirewall({type:'switch'}),false);
 assert.equal(E.isFirewall({type:'hub'}),false);
 assert.equal(E.isHost({type:'pc'}),true);
});
test('Spoofing is detected by a configured firewall policy',()=>{
 const s=generate(),lab=P.makeLab();E.profile(s.devices[1]).fwPolicy.enabled=true;
 const r=E.send(s,lab,{source:s.devices[0].id,target:s.devices[2].id,kind:'https',spoof:true});
 assert.equal(r.ok,false);assert.match(r.reason,/spoof/);
});
test('Firewall default enabled only on explicit opt-in',()=>{
 const s=generate();assert.equal(E.profile(s.devices[1]).fwPolicy.enabled,false);
 assert.equal(E.sanitizeFirewall({enabled:true,policy:'deny'}).policy,'deny');
});
test('Blocked payload never directly switches device offline',()=>{
 const s=generate(),lab=P.makeLab();const fw=E.profile(s.devices[1]).fwPolicy;fw.enabled=true;fw.policy='deny';
 const r=E.send(s,lab,{source:s.devices[0].id,target:s.devices[2].id,kind:'vuln_flood',impact:'outage'});
 assert.equal(r.ok,false);assert.equal(s.devices[2].dead,false);
});
test('Explicit opted-in outage only affects target device',()=>{
 const s=generate(),lab=P.makeLab();
 const r=E.send(s,lab,{source:s.devices[0].id,target:s.devices[2].id,kind:'vuln_smb',impact:'outage'});
 assert.equal(r.impact,'offline');assert.equal(s.devices[2].dead,true);
 assert.equal(s.devices[0].dead,false);assert.equal(s.devices[1].dead,false);
});
test('Patched host neutralizes simulation payload',()=>{
 const s=generate(),lab=P.makeLab();s.devices[2].vprofile.patched=true;
 const r=E.send(s,lab,{source:s.devices[0].id,target:s.devices[2].id,kind:'vuln_smb',impact:'outage'});
 assert.equal(r.impact,'protected');assert.equal(s.devices[2].dead,false);
});
test('Local traffic still works without virtual Internet',()=>{
 const s=generate(),lab=P.makeLab();
 assert.equal(E.send(s,lab,{source:s.devices[0].id,target:s.devices[2].id,kind:'icmp',zone:'lan'}).ok,true);
 const r=E.send(s,lab,{source:s.devices[0].id,target:s.devices[2].id,kind:'https',zone:'wan'});
 assert.equal(r.ok,false);assert.match(r.reason,/WAN/);
});
test('Long transfers are scheduled, advances over simulated time and logged',()=>{
 const s=generate(),lab=P.makeLab();const flow=E.newFlow(s,lab,{source:s.devices[0].id,target:s.devices[2].id,kind:'https',duration:8,rateMbps:3});
 assert.equal(flow.status,'running');E.tickFlows(s,lab,5);assert.equal(flow.remaining,3);
 E.tickFlows(s,lab,3);assert.equal(flow.status,'complete');
 assert.ok(flow.deliveredBytes>0);
 assert.ok(s.devices[2].vprofile.logs.some(x=>x.text.includes('TRANSFER')));
});
test('Long transfer blocked by existing device state',()=>{
 const s=generate(),lab=P.makeLab();const f=E.newFlow(s,lab,{source:s.devices[0].id,target:s.devices[2].id,kind:'https',duration:8,rateMbps:5});
 s.devices[2].dead=true;E.tickFlows(s,lab,1);assert.equal(f.status,'interrupted');
});
test('Task evaluator scores topology and DNS record',()=>{
 const s=generate(),lab=P.makeLab();
 lab.tasks=[{id:'1',kind:'topology',expected:'2'},
 {id:'2',kind:'dnsrecord',expected:'portal.lab'},
 {id:'3',kind:'transfer',expected:''}];
 assert.equal(E.progress(s,lab).percent,33);
 lab.dnsRecords=[{host:'portal.lab',type:'A',value:'192.168.1.2'}];
 assert.equal(E.progress(s,lab).percent,67);
});
test('Firewall option sanitizer clamps dangerous or invalid inputs',()=>{
 const policy=E.sanitizeFirewall({enabled:true,rateLimitMbps:-50,burstPackets:999999999,policy:'evil',
  rules:[{action:'invalid',protocol:'eval',port:666666,zone:'internet',source:'any',target:'any'}]});
 assert.equal(policy.rateLimitMbps,1);assert.equal(policy.burstPackets,100000);assert.equal(policy.policy,'allow');
 assert.equal(policy.rules[0].port,65535);assert.equal(policy.rules[0].protocol,'any');
});
test('Invalid user-selected endpoints are rejected',()=>{
 const s=generate(),lab=P.makeLab();
 assert.throws(()=>E.send(s,lab,{source:'not-found',target:s.devices[2].id,kind:'https'}));
});
test('A generic virtual packet cannot have an unintended malware side-effect',()=>{
 const s=generate(),lab=P.makeLab();
 E.send(s,lab,{source:s.devices[0].id,target:s.devices[2].id,kind:'normal',count:5,bytes:1024});
 assert.equal(s.devices[2].vprofile.infection,null);
 assert.equal(s.devices[2].dead,false);
});
console.log('PACKETLAB V06 MODEL PASS',count);
