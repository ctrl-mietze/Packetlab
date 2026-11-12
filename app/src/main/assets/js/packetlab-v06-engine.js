/* PaketLab 0.6 - deterministic LOCAL-ONLY packet simulation.
 * Preserves original TopoLab and PacketLab engines, adds explicit traffic,
 * threat semantics, policy inspection and learning task evaluation.
 * NEVER opens a network socket or performs any real attacks.
 */
const PacketLabV06 = (() => {
 'use strict';
 const core = typeof PacketLabCore!=='undefined' ? PacketLabCore : require('./packetlab-core.js');
 const cap=(n,min,max,fallback=min)=>Number.isFinite(+n)?Math.min(max,Math.max(min,+n)):fallback;
 const clean=s=>String(s??'').slice(0,180);
 const device=(s,id)=>s.devices.find(d=>d.id===id);
 const firewallKinds=new Set(['firewall','router','ids']);
 const hosts=new Set(['pc','laptop','server','nas','printer','phone','iot','camera','database','hypervisor','plc']);
 const isHost=d=>!!d&&hosts.has(d.type);
 const isFirewall=d=>!!d&&firewallKinds.has(d.type);
 const defaults=()=>({
   enabled:false,policy:'allow',hostMode:false,inspection:true,strictSpoof:true,
   rateLimitMbps:100,burstPackets:300,mitigation:'drop',logging:true,allowEvasion:false,rules:[]
 });
 function profile(d) {
   if(!d.vprofile)d.vprofile=core.sanitizeProfile({},d);
   if(!d.vprofile.fwPolicy || typeof d.vprofile.fwPolicy!=='object')
      d.vprofile.fwPolicy=defaults();
   else d.vprofile.fwPolicy=sanitizeFirewall(d.vprofile.fwPolicy);
   return d.vprofile;
 }
 function sanitizeFirewall(raw={}){
   const p=defaults();
   if(!raw || typeof raw!=='object')return p;
   p.enabled=!!raw.enabled;p.hostMode=!!raw.hostMode;p.inspection=raw.inspection!==false;
   p.strictSpoof=raw.strictSpoof!==false;p.logging=raw.logging!==false;p.allowEvasion=raw.allowEvasion===true;
   p.policy=raw.policy==='deny'?'deny':'allow';p.mitigation=['drop','limit','quarantine'].includes(raw.mitigation)?raw.mitigation:'drop';
   p.rateLimitMbps=cap(raw.rateLimitMbps,1,100000,100);p.burstPackets=cap(raw.burstPackets,1,100000,300);
   p.rules=Array.isArray(raw.rules)?raw.rules.slice(0,80).map(x=>({
     action:['allow','deny','log'].includes(x.action)?x.action:'deny',
     protocol:['any','icmp','tcp','udp','dns','http','https','ssh'].includes(x.protocol)?x.protocol:'any',
     port:(()=>{
       if(x.port==='any'||x.port===undefined)return 'any';
       if(typeof x.port==='string'&&/^\d{1,5}-\d{1,5}$/.test(x.port)){
         const a=x.port.split('-').map(Number);
         if(a[0]<=a[1]&&a[1]<=65535)return x.port;
       }
       return cap(x.port,0,65535,0);
     })(),
     source:clean(x.source||'any'),target:clean(x.target||'any'),
     zone:['any','lan','wan'].includes(x.zone)?x.zone:'any'
   })):[];
   return p;
 }
 const event=(lab,state,message,kind,ids)=>core.createEvent(lab,state.devices,message,kind,[...new Set(ids.filter(Boolean))]);
 function matchAddress(pattern,d){
   const effectiveIp=d.vprofile?.ipv4||d.ip;
   if(pattern==='any'||pattern===d.id||pattern===effectiveIp)return true;
   if(!String(pattern).includes('/'))return false;
   const bits=String(pattern).split('/');
   if(bits.length!==2||!core.v4(bits[0])||!/^(?:[0-9]|[12][0-9]|3[012])$/.test(bits[1])||!core.v4(effectiveIp))return false;
   const n=Number(bits[1]),mask=n===0?0:(0xffffffff <<(32-n))>>>0;
   const value=ip=>ip.split('.').reduce((a,b)=>((a<<8)|Number(b))>>>0,0);
   return ((value(effectiveIp)&mask)>>>0)===((value(bits[0])&mask)>>>0);
 }
 function matchPort(rule,port){
   if(rule==='any')return true;
   const bits=String(rule).split('-').map(Number);
   if(bits.length===2)return port>=bits[0]&&port<=bits[1];
   return bits.length===1&&bits[0]===port;
 }
 function policyCheck(state,lab,src,dst,route,spec){
   const passed=[],blocked=[];
   const port=cap(spec.port,0,65535,0);
   const protocol=String(spec.protocol||'tcp').toLowerCase();
   const source=device(state,src),target=device(state,dst);
   const networkType=spec.zone||'lan';
   const path=route?.path||[];
   const checkpoints=path.slice(1).filter(id=>{
     const d=device(state,id);
     return d && (d.type==='firewall'||d.type==='ids'||(d.id===dst && isHost(d)));
   });
   for(const id of checkpoints){
     const d=device(state,id),p=profile(d),fw=p.fwPolicy;
     if(!fw.enabled)continue;
     if(d.type==='switch'||d.type==='hub')continue; // switches aren't L3 firewalls
     const hostLocal=id===dst && isHost(d);
     if(hostLocal!==fw.hostMode && !(d.type==='firewall'||d.type==='ids'))continue;
     let decision=fw.policy,matching=null;
     for(const rule of fw.rules){
       if(rule.protocol!=='any' && rule.protocol!==protocol)continue;
       if(!matchPort(rule.port,port))continue;
       if(rule.zone!=='any' && rule.zone!==networkType)continue;
       if(!matchAddress(rule.source,source))continue;
       if(!matchAddress(rule.target,target))continue;
       matching=rule;decision=rule.action;break;
     }
     if(matching?.action==='log')decision=fw.policy;
     const spoofDetected=!!spec.spoof && fw.strictSpoof;
     const evasionDetected=!!spec.evasion && fw.inspection;
     const overload=spec.count>fw.burstPackets || (spec.rateMbps||0)>fw.rateLimitMbps;
     if(overload && fw.mitigation==='drop')decision='deny';
     if(spoofDetected||evasionDetected)decision='deny';
     if(decision==='deny' && spec.evasion && fw.allowEvasion && !fw.inspection && !fw.strictSpoof && !overload){
       decision='allow';
       event(lab,state,d.label+': virtual evasion accepted by explicitly permissive policy','security',[id,src,dst]);
     }
     const note=(matching?'rule':'default')+': '+decision+(overload?' / overload':'')+(spoofDetected?' / spoof check':'')+(evasionDetected?' / deep inspection':'');
     if(fw.logging)event(lab,state,d.label+' firewall '+note,'security',[id,src,dst]);
     (decision==='deny'?blocked:passed).push({id,decision,note});
     if(decision==='deny')return {ok:false,reason:d.label+' firewall: '+note,blockedBy:id,passed,blocked};
   }
   return {ok:true,passed,blocked};
 }
 const validSpec=(state,spec)=>{
   if(!spec || typeof spec!=='object')throw Error('Packet specification missing');
   const source=device(state,spec.source),target=device(state,spec.target);
   if(!source||!target)throw Error('Select a real source and destination');
   if(source.id===target.id)throw Error('Source and destination must differ');
   const kind=core.PACKETS[spec.kind]?spec.kind:'normal';
   const packet=core.PACKETS[kind];
   return {...spec,kind,protocol:['icmp','dns','tcp','udp','http','https','ssh','arp'].includes(spec.protocol)?spec.protocol:
     kind==='icmp'?'icmp':kind==='dns'?'dns':kind==='udp'?'udp':'tcp',
     count:cap(spec.count??1,1,100000,1),bytes:cap(spec.bytes??packet.bytes,1,65536,packet.bytes),
     port:cap(spec.port??packet.port??0,0,65535,packet.port||0),
     spoof:!!spec.spoof,evasion:!!spec.evasion,
     zone:spec.zone==='wan'?'wan':'lan',
     rateMbps:cap(spec.rateMbps??0,0,100000,0),
     impact:['none','degrade','outage'].includes(spec.impact)?spec.impact:'none'
   };
 };
 function send(state,lab,raw){
   const spec=validSpec(state,raw);
   const from=device(state,spec.source),to=device(state,spec.target);
   if(!lab||!Array.isArray(lab.logs))throw Error('Invalid virtual lab');
   const r=core.route(state,from.id,to.id);
   const types=core.PACKETS;
   const base=types[spec.kind];
   if(!r || from.dead || to.dead){
     const reason=!r?'No active physical route':'Source or target is offline';
     event(lab,state,'DROP '+from.label+' → '+to.label+': '+reason,'blocked',[from.id,to.id]);
     return {ok:false,reason,path:[],delivered:0};
   }
   const path=r.path;
   if(spec.zone==='wan'){
     const ingress=state.devices.some(gateway=>{
       if(gateway.dead || !['router','modem','cloud'].includes(gateway.type) || !gateway.vprofile?.internet)return false;
       const uplink=state.links.some(l=>{
         if(l.dead||!(l.a===gateway.id||l.b===gateway.id))return false;
         const other=device(state,l.a===gateway.id?l.b:l.a);
         return other && !other.dead && ['cloud','modem'].includes(other.type);
       });
       return uplink && !!core.route(state,from.id,gateway.id) && !!(gateway.vprofile.wanPort||gateway.type==='cloud');
     });
     if(!ingress){
       event(lab,state,'DROP WAN: Internet route not configured','blocked',path);
       return {ok:false,reason:'WAN route not configured (virtual Internet offline)',path,delivered:0};
     }
   }
   const policy=policyCheck(state,lab,from.id,to.id,r,spec);
   if(!policy.ok){
     event(lab,state,'BLOCK '+spec.kind.toUpperCase()+' '+from.label+' → '+to.label+': '+policy.reason,'blocked',path);
     return {...policy,delivered:0,path};
   }
   const original=types[spec.kind];
   const special=original.port!==spec.port||original.bytes!==spec.bytes;
   // Custom, bounded transport properties are per-call and restored immediately.
   const saved=types.custom;
   if(special) types.custom={...original,port:spec.port,bytes:spec.bytes,label:'Custom '+original.label};
   const kind=special?'custom':spec.kind;
   // Preserve the original model's host, routing and ACL behavior. Evasion never
   // bypasses the original policy or switches by magic.
   const inspected=core.evaluate(state,lab,from.id,to.id,kind);
   if(!inspected.ok){
     if(special){if(saved)types.custom=saved;else delete types.custom;}
     event(lab,state,'DROP '+from.label+' → '+to.label+': '+inspected.reason,'blocked',path);
     return {...inspected,delivered:0,path};
   }
   // Send in bounded 100-frame chunks to retain original deterministic model.
   let sent=0,delivered=0,dropped=0,last=null;
   const rounds=Math.min(1000,Math.ceil(spec.count/100));
   try{
     for(let i=0;i<rounds;i++){
       const count=Math.min(100,spec.count-sent);
       last=core.send(state,lab,from.id,to.id,kind,count);
       sent+=count;delivered+=last.count||0;dropped+=last.dropped||0;
       if(!last.ok && !(last.dropped>0))break;
     }
   }finally{if(special){if(saved)types.custom=saved;else delete types.custom;}}
   const effectName=base.malware||null;
   let impact='none';
   if(delivered>0 && effectName){
     const p=profile(to);
     const resistant=p.patched || p.security>=Math.max(70,100-(base.severity||3)*4);
     if(!resistant){
       p.infection=effectName;
       impact='virtual-compromise';
       if(spec.impact==='degrade'){
         p.degradationPct=cap((p.degradationPct||0)+Math.min(75,5+spec.count/10),0,90);
         impact='degraded';
       }else if(spec.impact==='outage'){
         // Opt-in only; routine packets never switch device power off.
         to.dead=true;p.power=false;p.lastFault='Virtual '+effectName+' outage';
         impact='offline';
       }
       event(lab,state,to.label+': '+effectName+' model effect '+impact,'security',[from.id,to.id]);
     }else{
       impact='protected';event(lab,state,to.label+': virtual payload neutralized (patched/secure)','security',[from.id,to.id]);
     }
   }
   event(lab,state,'FLOW '+from.label+' → '+to.label+' | '+spec.kind+' | '+sent+' frames | '+
     delivered+' delivered | '+dropped+' lost | '+spec.bytes+' bytes | '+spec.zone+
     (spec.spoof?' | simulated spoof flag':'')+(spec.evasion?' | evasion attempt':''),'traffic',path);
   return {ok:delivered>0,reason:last?.reason||'Delivered',sent,delivered,dropped,path,hops:r.hops,impact,
     latency:last?.latency??0,mbps:last?.mbps??0};
 }
 function newFlow(state,lab,raw){
   const cfg=validSpec(state,{...raw,count:1});
   const duration=cap(raw.duration,1,3600,60);
   const rate=cap(raw.rateMbps,0.1,10000,10);
   if(!Array.isArray(lab.flows))lab.flows=[];
   if(lab.flows.filter(f=>f.status==='running').length>=12)throw Error('Maximum 12 concurrent simulated flows');
   const id='flow-'+(lab.eventSeq+1)+'-'+Math.floor(lab.clock);
   const flow={id,source:cfg.source,target:cfg.target,kind:cfg.kind,port:cfg.port,bytes:cfg.bytes,
     direction:raw.direction==='download'?'download':'upload',duration,remaining:duration,rateMbps:rate,
     sentBytes:0,deliveredBytes:0,status:'running',zone:cfg.zone};
   lab.flows.push(flow);
   if(lab.flows.length>100)lab.flows=lab.flows.slice(-100);
   event(lab,state,'START '+flow.direction+' '+rate+' Mbit/s × '+duration+' s','traffic',[flow.source,flow.target]);
   return flow;
 }
 function tickFlows(state,lab,seconds=1){
   if(!Array.isArray(lab.flows))lab.flows=[];
   const results=[];
   for(const f of lab.flows.filter(f=>f.status==='running')){
     const src=device(state,f.source),dst=device(state,f.target);
     if(!src||!dst||src.dead||dst.dead){f.status='interrupted';event(lab,state,'TRANSFER '+f.id+' interrupted: endpoint offline','warning',[f.source,f.target]);continue}
     const step=Math.min(cap(seconds,1,60,1),f.remaining);
     const r=core.evaluate(state,lab,src.id,dst.id,core.PACKETS[f.kind]?f.kind:'normal');
     if(!r.ok){f.status='blocked';event(lab,state,'TRANSFER '+f.id+' blocked: '+r.reason,'blocked',[src.id,dst.id]);continue}
     const realRate=Math.min(f.rateMbps,r.mbps||f.rateMbps);
     const bytes=Math.floor(realRate*1e6/8*step);
     f.sentBytes+=Math.floor(f.rateMbps*1e6/8*step);
     f.deliveredBytes+=Math.floor(bytes*(1-(r.lossPct||0)/100));
     f.remaining-=step;
     if(f.remaining<=0){
       f.status='complete';
       event(lab,state,'TRANSFER '+f.id+' complete · '+Math.round(f.deliveredBytes/1e6)+' MB delivered','traffic',r.route?.path||[src.id,dst.id]);
     }else if(Math.ceil(f.remaining)%5===0){
       event(lab,state,'TRANSFER '+f.id+' '+Math.round((1-f.remaining/f.duration)*100)+'%','traffic',[src.id,dst.id]);
     }
     results.push({id:f.id,progress:100*(1-f.remaining/f.duration),status:f.status});
   }
   return results;
 }
 function evaluateTasks(state,lab){
   const orig=core.evaluateTasks(state,{...lab,tasks:(lab.tasks||[]).filter(t=>!['topology','link','service','wan','transfer','route','dnsrecord'].includes(t.kind))});
   const extra=(lab.tasks||[]).filter(t=>['topology','link','service','wan','transfer','route','dnsrecord'].includes(t.kind)).map(t=>{
     const d=device(state,t.device),target=device(state,t.target);
     let passed=false;
     if(t.kind==='topology')passed=state.devices.length>0&&state.links.length>=cap(t.expected,0,800,1);
     if(t.kind==='link')passed=!!d&&!!target&&state.links.some(l=>!l.dead&&((l.a===d.id&&l.b===target.id)||(l.a===target.id&&l.b===d.id)));
     if(t.kind==='service')passed=!!d&&!!(d.vprofile?.virtualServices?.[t.expected]||d.vprofile?.enabledServices?.[t.expected]);
     if(t.kind==='wan')passed=!!d&&!!d.vprofile?.internet &&!!d.vprofile?.wanPort;
     if(t.kind==='transfer')passed=(lab.flows||[]).some(f=>f.status==='complete');
     if(t.kind==='route')passed=!!d&&!!target&&core.evaluate(state,lab,d.id,target.id,'icmp').ok;
     if(t.kind==='dnsrecord')passed=(lab.dnsRecords||[]).some(r=>r.host===t.expected.toLowerCase());
     return {...t,passed,details:passed?'Erfüllt':'Noch nicht erfüllt'};
   });
   const indexed=new Map([...orig,...extra].map(t=>[t.id,t]));
   return (lab.tasks||[]).map(t=>indexed.get(t.id)||{...t,passed:false,details:'Unknown task'});
 }
 function progress(state,lab){
   const tasks=evaluateTasks(state,lab);
   const done=tasks.filter(t=>t.passed).length;
   return {done,total:tasks.length,percent:tasks.length?Math.round(done/tasks.length*100):0,tasks};
 }
 return {send,newFlow,tickFlows,evaluateTasks,progress,profile,sanitizeFirewall,defaults,isHost,isFirewall,validSpec};
})();
if(typeof window!=='undefined')window.PacketLabV06=PacketLabV06;
if(typeof module!=='undefined')module.exports=PacketLabV06;
