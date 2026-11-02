/* Pure JS offline-model unit tests for Veyra PacketLab v0.3. */
const assert = require('assert/strict');
const path=require('path');
const root=path.join(__dirname,'app','src','main','assets','js');
global.Topologies=require(path.join(root,'topologies.js'));
global.Graph=require(path.join(root,'graph.js'));
global.Sim=require(path.join(root,'sim.js'));
const P=require(path.join(root,'packetlab-core.js'));
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name)}
const lab=P.makeLab();
const gen=Topologies.generate('star',8,700,550);
const state={devices:gen.devices,links:gen.links};
for(const d of state.devices)d.vprofile=P.sanitizeProfile({},d);
const a=state.devices.find(d=>d.type==='pc');
const b=state.devices.find(d=>d.type==='server');
test('Model has original topology',()=>assert.equal(gen.devices.length,8));
test('ICMP reaches host',()=>{
 const r=P.evaluate(state,lab,a.id,b.id,'icmp');
 assert.equal(r.ok,true);assert.ok(r.hops>=1);
});
test('ICMP disabled works',()=>{
 b.vprofile.icmp=false;
 assert.match(P.evaluate(state,lab,a.id,b.id,'icmp').reason,/ICMP/);
 b.vprofile.icmp=true;
});
test('Traffic counted in per-device profile',()=>{
 const r=P.send(state,lab,a.id,b.id,'https');
 assert.equal(r.ok,true);assert.equal(a.vprofile.sent,1);assert.equal(b.vprofile.received,1);
});
test('Network logs append to both devices',()=>{
 assert.ok(a.vprofile.logs.length>0&&b.vprofile.logs.length>0);
});
test('IPv4 and IPv6 validation',()=>{
 assert.ok(P.v4('10.0.0.1'));assert.ok(!P.v4('256.1.1.1'));
 assert.ok(P.v6('2001:db8::1'));assert.ok(!P.v6('2001:zzzz::1'));
});
test('Subnets differ correctly',()=>{
 assert.equal(P.sameNetwork('10.0.1.1','10.0.2.1','255.255.255.0'),false);
});
test('DNS resolver requires reachable DNS service',()=>{
 b.vprofile.dnsEnabled=true;
 const lookup=P.resolveDns(state,lab,a.id,'srv-1');
 assert.ok(!lookup.error);assert.ok(lookup.answer);
});
test('Security blocks malware only when firewall set up',()=>{
 const pc=Topologies.device('pc','PC-X',1,1,{ip:'10.0.0.10',mac:'02:AA:BB:CC:DD:01'});
 const fw=Topologies.device('firewall','FW-X',2,2,{ip:'10.0.0.1',mac:'02:AA:BB:CC:DD:02'});
 const dst=Topologies.device('server','SRV-X',3,3,{ip:'10.0.0.20',mac:'02:AA:BB:CC:DD:03'});
 pc.gateway='10.0.0.1';dst.gateway='10.0.0.1';
 for(const d of [pc,fw,dst]){d.vprofile=P.sanitizeProfile({ipv4:d.ip},d)}
 const isolated={devices:[pc,fw,dst],links:[Topologies.link(pc,fw),Topologies.link(fw,dst)]};
 fw.vprofile.firewallEnabled=true;fw.vprofile.blockThreats=true;
 const denied=P.send(isolated,lab,pc.id,dst.id,'worm');
 assert.equal(denied.ok,false);assert.match(denied.reason,/Threat Prevention/);
 fw.vprofile.blockThreats=false;
 const allowed=P.send(isolated,lab,pc.id,dst.id,'worm');
 assert.equal(allowed.ok,true);assert.equal(dst.vprofile.infection,'worm');
});
test('Media throughput respects link capacity',()=>{
 state.links[0].medium='coax';
 const r=P.evaluate(state,lab,a.id,b.id,'https');
 assert.equal(r.ok,true);assert.ok(r.mbps<=100);
});
test('Master tasks can grade IPv4 and security',()=>{
 lab.tasks=[{kind:'ipv4',device:b.id,expected:b.ip},{kind:'hardening',device:b.id,expected:''}];
 b.vprofile.patched=true;b.vprofile.security=85;
 const res=P.evaluateTasks(state,lab);
 assert.ok(res.every(x=>x.passed));
});
test('Virtual time and background traffic increment',()=>{
 const prev=lab.clock;
 P.tick(state,lab,5);
 assert.equal(lab.clock,prev+5);
 assert.ok(lab.logs.length>0);
});
console.log('MODEL SUITE PASSED',count);
