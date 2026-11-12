/* PacketLab 0.3 · Virtual network semantics.
 * Nothing in this file opens sockets, uses the operating system's shell,
 * or sends traffic to any real device. Deterministic educational simulation.
 */
const PacketLabCore = (() => {
  'use strict';
  const LIMIT_EVENTS = 400;
  const MEDIA = {
    cable: {label:'Cable (automatisch)', mbps:1000, latency:1, maxMetres:100},
    rj45: {label:'RJ45 / Cat 6', mbps:1000, latency:1, maxMetres:100},
    cat6a: {label:'RJ45 / Cat 6A', mbps:10000, latency:1, maxMetres:100},
    fiber: {label:'Glasfaser', mbps:100000, latency:.2, maxMetres:20000},
    coax: {label:'Koaxial', mbps:100, latency:3, maxMetres:500},
    wifi: {label:'WLAN 6', mbps:900, latency:6, maxMetres:75},
    tunnel: {label:'VPN-Tunnel', mbps:250, latency:18, maxMetres:999999}
  };
  // Pure virtual physical media calculations; no real network access.
  function linkMetrics(link){
    const medium = MEDIA[link?.medium] || MEDIA.cable;
    const metres=clamp(link?.physicalMetres ?? link?.metres ?? 1,0.1,1000000,1);
    const propagationMs=metres / (medium.label.includes('Glasfaser')?200000:180000);
    const base=clamp(link?.latencyOverrideMs ?? medium.latency,0,10000,medium.latency);
    const latency=+(base + propagationMs).toFixed(4);
    const capacity=clamp(link?.bandwidthOverrideMbps ?? medium.mbps,0.1,1000000,medium.mbps);
    const loss=clamp(link?.lossPct ?? 0,0,100,0);
    const tooLong=(link?.medium||'cable')!=='cable' && metres>medium.maxMetres;
    return {medium:link?.medium||'cable',label:medium.label,metres,latency,
      mbps:capacity,loss,duplex:link?.duplex||'full',maxMetres:medium.maxMetres,tooLong};
  }

  const PACKETS = {
    normal:{label:'Datenpaket',bytes:1500,port:80},
    icmp:{label:'Ping / ICMP',bytes:64,port:null},
    dns:{label:'DNS-Anfrage',bytes:128,port:53},
    http:{label:'HTTP',bytes:1200,port:80},
    https:{label:'HTTPS',bytes:1400,port:443},
    ssh:{label:'SSH',bytes:256,port:22},
    udp:{label:'UDP',bytes:512,port:53},
    tcp:{label:'TCP',bytes:1024,port:443},
    large:{label:'Großes Paket (64 KiB)',bytes:65536,port:443},
    mass:{label:'Mass Package (50 Frames)',bytes:1500,port:443,count:50},
    malformed:{label:'Manipuliertes HTTP-Paket',bytes:900,port:80,malware:'http'},
    scan:{label:'Simulierter Portscan',bytes:512,port:22,malware:'scan'},
    worm:{label:'Vurnabil – Ausbreitung',bytes:512,port:445,malware:'worm'}
  };
  // Simulated traffic scenarios only: never real exploits or malware.
  const VULNERABILITIES = {
    vuln_http:{label:'HTTP Request Manipulation',category:'Web',port:80,bytes:850,malware:'http',severity:2,
      description:'Ungewöhnliche HTTP-Eingaben; simulierte Filterregeln.'},
    vuln_xss:{label:'Web Input / XSS (Modell)',category:'Web',port:80,bytes:640,malware:'xss',severity:3,
      description:'Ungefilterte Eingaben, niemals ausführbarer Skriptcode.'},
    vuln_dns:{label:'DNS Spoofing (Modell)',category:'Netzwerk',port:53,bytes:340,malware:'dns',severity:3,
      description:'Virtuelle manipulierte DNS-Antwort; keine echten DNS-Pakete.'},
    vuln_smb:{label:'SMB Worm (Modell)',category:'Netzwerk',port:445,bytes:760,malware:'worm',severity:4,
      description:'Virtueller Befall über SMB auf simulierten Hosts.'},
    vuln_ssh:{label:'SSH Credential Attack (Modell)',category:'Authentifizierung',port:22,bytes:230,malware:'ssh',severity:3,
      description:'Simuliertes Login-Ereignis; keine echten Passwortversuche.'},
    vuln_iot:{label:'IoT Botnet (Modell)',category:'IoT',port:1883,bytes:500,malware:'iot',severity:4,
      description:'Virtuelle IoT-Szenarien mit MQTT-Diensten.'},
    vuln_ransom:{label:'Ransomware (Modell)',category:'Host',port:445,bytes:1200,malware:'ransom',severity:5,
      description:'Nur virtueller Befallsstatus; keine Dateiveränderung.'},
    vuln_flood:{label:'Traffic Flood (Modell)',category:'Verfügbarkeit',port:443,bytes:1500,malware:'flood',severity:3,
      description:'Hohe virtuelle Netzlast, keine echten DDoS-Pakete.'}
  };
  for(const [k,v] of Object.entries(VULNERABILITIES))
    PACKETS[k]={...v,kind:'vulnerability',proto:'simulated'};

  const DEFAULT_PROFILE = Object.freeze({
    hostname:'', ipv4:'', ipv6:'', subnet:'255.255.255.0', gateway:'', dnsServer:'',
    domain:'', dnsEnabled:false, dhcp:false, dhcpServer:false, dhcpRange:'100-180',
    mtu:1500, uploadMbps:1000, downloadMbps:1000, internet:false,
    wanPort:0, tunnel:false, vlan:1, os:'Linux', cpu:4, ramGB:4, storageGB:64,
    security:50, patched:false, firewallEnabled:false, blockThreats:false,
    icmp:true, ttl:64, maintenance:false, note:'', company:'Standort A',
    staticRoutes:[], disabledPorts:[], virtualServices:{}, enabledServices:{},
    commandHistory:[], firewallDefaultIn:'allow', ipv6Prefix:64,
    logs:[], infection:null, sent:0, received:0, power:true,
    uptime:0, lastFault:''
  });
  const deepCopy = value => JSON.parse(JSON.stringify(value));
  const clamp = (v, min, max, def=min) => Number.isFinite(+v) ? Math.max(min, Math.min(max,+v)) : def;
  const v4 = ip => {
    if (typeof ip !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
    return ip.split('.').every(o=>+o<=255 && (+o).toString()===o.replace(/^0+(?=\d)/,''));
  };
  const toNum = ip => ip.split('.').reduce((n,oct)=>((n<<8)|+oct)>>>0,0);
  const sameNetwork = (a,b,mask='255.255.255.0') =>
    v4(a)&&v4(b)&&v4(mask)&&((toNum(a)&toNum(mask))===(toNum(b)&toNum(mask)));
  const v6 = ip => {
    if(typeof ip!=='string'||!ip.includes(':')||!/^[0-9a-fA-F:]+$/.test(ip))return false;
    if(ip.includes(':::')||ip.split('::').length>2)return false;
    const groups=ip.split(':').filter(Boolean);
    return groups.length<8&&ip.includes('::') ? groups.every(x=>x.length<=4) :
      groups.length===8&&groups.every(x=>x.length>=1&&x.length<=4);
  };
  function profileFor(device) {
    const p=Object.assign(deepCopy(DEFAULT_PROFILE),device.vprofile||{});
    p.logs=Array.isArray(p.logs)?p.logs.slice(-150):[];
    p.power=!device.dead;
    return p;
  }
  function sanitizeProfile(data, device) {
    const p=Object.assign(deepCopy(DEFAULT_PROFILE),data||{});
    p.hostname=String(p.hostname||device.label).slice(0,48);
    p.domain=String(p.domain||'').slice(0,80).toLowerCase();
    p.company=String(p.company||'Standort A').slice(0,55);
    p.note=String(p.note||'').slice(0,350);
    p.os=String(p.os||'Linux').slice(0,28);
    p.ipv4=v4(p.ipv4)?p.ipv4:(v4(device.ip)?device.ip:'');
    p.ipv6=v6(p.ipv6)?p.ipv6:'';
    p.subnet=v4(p.subnet)?p.subnet:'255.255.255.0';
    p.gateway=v4(p.gateway)?p.gateway:'';
    p.dnsServer=v4(p.dnsServer)?p.dnsServer:'';
    p.mtu=clamp(p.mtu,576,9000,1500);
    p.cpu=clamp(p.cpu,1,128,4);
    p.ramGB=clamp(p.ramGB,.5,2048,4);
    p.storageGB=clamp(p.storageGB,1,65536,64);
    p.uploadMbps=clamp(p.uploadMbps,.1,1000000,1000);
    p.downloadMbps=clamp(p.downloadMbps,.1,1000000,1000);
    p.security=clamp(p.security,0,100,50);
    p.wanPort=clamp(p.wanPort,0,65535,0);
    p.vlan=clamp(p.vlan,1,4094,1);
    p.ttl=clamp(p.ttl,1,255,64);
    for(const key of ['internet','tunnel','patched','dhcp','dhcpServer','dnsEnabled',
      'firewallEnabled','blockThreats','icmp','maintenance']) p[key]=!!p[key];
    p.infection=p.infection && typeof p.infection==='string' ? p.infection.slice(0,20):null;
    p.logs=Array.isArray(p.logs)?p.logs.slice(-150).map(x=>({
      time:Math.max(0,+x.time||0),type:String(x.type||'system').slice(0,15),
      text:String(x.text||'').slice(0,220),source:String(x.source||'').slice(0,35)
    })):[];
    p.sent=clamp(p.sent,0,100000000,0);p.received=clamp(p.received,0,100000000,0);
    p.uptime=clamp(p.uptime,0,100000000,0);
    p.lastFault=String(p.lastFault||'').slice(0,100);
    p.ipv6Prefix=clamp(p.ipv6Prefix,0,128,64);
    p.staticRoutes=Array.isArray(p.staticRoutes)?p.staticRoutes.slice(0,60)
      .filter(x=>x&&typeof x.dst==='string'&&x.dst.length<=25&&v4(x.via))
      .map(x=>({dst:x.dst,via:x.via})):[];
    p.disabledPorts=Array.isArray(p.disabledPorts)?p.disabledPorts.slice(0,80)
      .filter(x=>Number.isInteger(+x)&&+x>=1&&+x<=65535).map(Number):[];
    const servicesObj=o=>{
      const cleaned={};
      if(o&&typeof o==='object'&&!Array.isArray(o)){
        for(const [k,v] of Object.entries(o).slice(0,40))
          if(/^[a-zA-Z][a-zA-Z0-9_-]{0,35}$/.test(k)) cleaned[k]=!!v;
      }
      return cleaned;
    };
    p.virtualServices=servicesObj(p.virtualServices);
    p.enabledServices=servicesObj(p.enabledServices);
    p.firewallDefaultIn=p.firewallDefaultIn==='deny'?'deny':'allow';
    p.commandHistory=Array.isArray(p.commandHistory)?
      p.commandHistory.slice(-36).map(x=>String(x).slice(0,180)):[];
    return p;
  }
  function makeLab() {
    return {mode:'standard', title:'Mein Netzwerk', description:'', tasks:[], rooms:[],
      floor:1, preset:'star', packet:'normal', medium:'cable', spread:false, backgroundTraffic:false, manualPaused:false, flows:[],
      attackStrength:1, startedAt:0, clock:0, logs:[], eventSeq:0,
      records:[], dnsRecords:[], savedAt:Date.now(), deviceGroups:[]};
  }
  function createEvent(lab,devices,text,type='system',ids=[],time=lab.clock) {
    const ev={time:clamp(time,0,999999999),kind:type,text:String(text).slice(0,240),seq:++lab.eventSeq,
              source:ids.map(id=>devices.find(d=>d.id===id)?.label||'').filter(Boolean).join(' → ')};
    lab.logs.push(ev);
    if(lab.logs.length>LIMIT_EVENTS)lab.logs.splice(0,lab.logs.length-LIMIT_EVENTS);
    for(const id of new Set(ids)) {
      const device=devices.find(d=>d.id===id);
      if(!device) continue;
      if(!device.vprofile) device.vprofile=sanitizeProfile({},device);
      const p=device.vprofile;
      p.logs=Array.isArray(p.logs)?p.logs:[];
      p.logs.push({time:ev.time,type:ev.kind,text:ev.text,source:ev.source});
      if(p.logs.length>150)p.logs.shift();
    }
    return ev;
  }
  function route(state,sourceId,targetId) {
    if(!sourceId||!targetId||sourceId===targetId)return null;
    const src=state.devices.find(d=>d.id===sourceId),dst=state.devices.find(d=>d.id===targetId);
    if(!src||!dst||src.dead||dst.dead)return null;
    return Graph.bfs(Graph.build(state.devices,state.links),sourceId,targetId);
  }
  function resolveDns(state,lab,source,name,type='A') {
    const src=state.devices.find(d=>d.id===source);
    if(!src)return {error:'Quellgerät fehlt'};
    const p=profileFor(src);
    const server=state.devices.find(d=>!d.dead&&d.vprofile?.dnsEnabled&&
      (!p.dnsServer||d.ip===p.dnsServer));
    if(!server)return {error:'Kein aktiver DNS-Server konfiguriert'};
    if(server.id!==src.id&&!route(state,src.id,server.id))return {error:'DNS-Server nicht erreichbar'};
    const normalized=String(name||'').trim().toLowerCase();
    const found=(lab.dnsRecords||[]).find(r=>r.host===normalized&&r.type===type);
    if(found)return {answer:found.value,server:server.label};
    const match=state.devices.find(d=>!d.dead&&(
      (d.vprofile?.hostname||d.label).toLowerCase()===normalized||
      (d.vprofile?.domain||'').toLowerCase()===normalized
    ));
    if(!match)return {error:'NXDOMAIN: '+normalized};
    const value=type==='AAAA'?match.vprofile?.ipv6:(match.vprofile?.ipv4||match.ip);
    return value?{answer:value,server:server.label}:{error:'Kein '+type+'-Record'};
  }
  function evaluate(state,lab,sourceId,targetId,type='icmp') {
    const src=state.devices.find(d=>d.id===sourceId),dst=state.devices.find(d=>d.id===targetId);
    if(!src||!dst)return {ok:false,reason:'Gerät fehlt'};
    if(src.dead||dst.dead)return {ok:false,reason:'Ein Endgerät ist offline'};
    const sp=profileFor(src),dp=profileFor(dst);
    if(type==='icmp'&&!dp.icmp)return {ok:false,reason:'ICMP am Ziel deaktiviert'};
    let r=route(state,sourceId,targetId);
    if(!r)return {ok:false,reason:'Keine physische Route'};
    const path=r.path.map(id=>state.devices.find(d=>d.id===id));
    const cross=sp.ipv4&&dp.ipv4&&!sameNetwork(sp.ipv4,dp.ipv4,sp.subnet);
    if(cross&&!path.some(d=>d&&Topologies.isRouter(d.type)))return {ok:false,reason:'Routing zwischen Subnetzen fehlt'};
    const staticMatches=Array.isArray(sp.staticRoutes)&&sp.staticRoutes.some(rt=>{
      const parts=String(rt.dst||'').split('/');
      const prefix=Number(parts[1]);
      if(!v4(parts[0])||!Number.isInteger(prefix)||prefix<0||prefix>32||!v4(dp.ipv4))return false;
      const n=prefix===0?0:(0xffffffff << (32-prefix))>>>0;
      const toNum=ip=>ip.split('.').reduce((z,v)=>(z<<8|+v)>>>0,0);
      return ((toNum(parts[0])&n)>>>0)===((toNum(dp.ipv4)&n)>>>0);
    });
    if(cross&&!sp.gateway&&!staticMatches)return {ok:false,reason:'Default-Gateway oder statische Route fehlt'};
    // VLAN isolation: hosts with different VLANs need a router on the path.
    const sameLayer2=sp.ipv4&&dp.ipv4&&sameNetwork(sp.ipv4,dp.ipv4,sp.subnet);
    if(sameLayer2&&sp.vlan!==dp.vlan&&!path.some(d=>d&&Topologies.isRouter(d.type)))
      return {ok:false,reason:'VLAN '+sp.vlan+' und '+dp.vlan+' sind isoliert'};
    // Optional physical media constraints and configured WAN tunnel endpoints.
    for(const linkId of r.linkPath) {
      const wire=state.links.find(l=>l.id===linkId);
      if(!wire)continue;
      const medium=MEDIA[wire.medium]||MEDIA.cable;
      if(wire.medium && wire.medium!=='cable' &&
         Number.isFinite(wire.metres)&&wire.metres>medium.maxMetres)
        return {ok:false,reason:'Medien-Reichweite überschritten: '+medium.label};
      if(wire.medium==='tunnel'){
        const endpointA=state.devices.find(d=>d.id===wire.a);
        const endpointB=state.devices.find(d=>d.id===wire.b);
        const a=endpointA?.vprofile,b=endpointB?.vprofile;
        if(!(a?.tunnel&&b?.tunnel&&a?.wanPort>0&&b?.wanPort>0))
          return {ok:false,reason:'VPN-Tunnel nicht auf beiden Endpunkten eingerichtet'};
      }
    }
    const kind=(type==='arp'?'arp':'data');
    const port=(PACKETS[type]||PACKETS.normal).port;
    if(port!==null&&dp.disabledPorts?.includes(+port))
      return {ok:false,reason:'Zielport '+port+' ist deaktiviert'};
    // A host firewall can independently filter its own inbound services.
    if(dp.firewallEnabled){
      const matching=(dst.rules||[]).find(r=>r&&r.proto!=='arp' &&
        (String(r.port||'any')==='any'||String(r.port)===String(port)) &&
        (r.from==='any'||r.from===sourceId) && (r.to==='any'||r.to===targetId));
      if(matching?.action==='block')
        return {ok:false,reason:'Host-Firewall '+dst.label+' blockiert Port '+port,blockedBy:dst.id};
      if(!matching&&dp.firewallDefaultIn==='deny'&&port!==null)
        return {ok:false,reason:'Default-Deny am Ziel '+dst.label,blockedBy:dst.id};
    }
    const fw=Sim.firewallCheck(state.devices,state.links,r.path,kind,port);
    if(fw.blocked)return {ok:false,reason:'Firewall '+fw.at.label+' blockiert den Verkehr',blockedBy:fw.at.id};
    const infected=PACKETS[type]?.malware;
    if(infected)for(const d of path) {
      if(d?.type==='firewall'&&d.vprofile?.firewallEnabled&&d.vprofile?.blockThreats)
        return {ok:false,reason:'Threat Prevention durch '+d.label,blockedBy:d.id};
    }
    const media=r.linkPath.map(id=>state.links.find(l=>l.id===id)).filter(Boolean).map(linkMetrics);
    const invalid=media.find(m=>m.tooLong);
    if(invalid) return {ok:false,reason:'Kabelreichweite überschritten ('+invalid.label+', '+invalid.metres.toFixed(1)+' m > '+invalid.maxMetres+' m)'};
    const cap=media.length?Math.min(...media.map(m=>m.mbps)):Math.min(sp.uploadMbps,dp.downloadMbps);
    const throughput=Math.min(cap,sp.uploadMbps,dp.downloadMbps);
    const latency=Math.round((media.reduce((sum,m)=>sum+m.latency,0)+r.hops*1.5)*100)/100;
    const loss=media.reduce((v,m)=>Math.max(v,m.loss),0);
    return {ok:true,route:r,hops:r.hops,latency,mbps:throughput,lossPct:loss,reason:'Ziel erreichbar'};
  }
  function send(state,lab,sourceId,targetId,packet='normal',amount=1) {
    const kind=PACKETS[packet]?packet:'normal';
    const data=PACKETS[kind],count=Math.min(100,+amount||data.count||1);
    const result=evaluate(state,lab,sourceId,targetId,kind);
    const src=state.devices.find(d=>d.id===sourceId),dst=state.devices.find(d=>d.id===targetId);
    const names=(src?.label||'?')+' → '+(dst?.label||'?');

    if(!result.ok) {
      createEvent(lab,state.devices,kind.toUpperCase()+' '+names+': '+result.reason,'blocked',
        [sourceId,targetId,result.blockedBy].filter(Boolean));
      return {...result,kind,count:0};
    }
    const proto=kind==='icmp'?'ICMP':kind==='dns'?'DNS':kind==='worm'?'SIM-WORM':kind.toUpperCase();
    // Deterministic, accumulated loss across small packets and bursts.
    // 5% loss drops 5 of 100 frames (not a random/inconsistent demo).
    const totalLoss=(lab.virtualLossRemainder||0)+count*(result.lossPct||0)/100;
    const dropped=Math.min(count,Math.floor(totalLoss));
    lab.virtualLossRemainder=totalLoss-Math.floor(totalLoss);
    const delivered=count-dropped;
    if(src){src.vprofile=src.vprofile||profileFor(src);src.vprofile.sent+=count}
    if(dst){dst.vprofile=dst.vprofile||profileFor(dst);dst.vprofile.received+=delivered}
    if(dropped)createEvent(lab,state.devices,proto+' '+names+' | '+dropped+' von '+count+
      ' Frames: simulierter Paketverlust','warning',result.route.path);
    if(!delivered)return {...result,ok:false,reason:'Paketverlust auf der virtuellen Leitung',count:0,dropped,kind};
    createEvent(lab,state.devices,proto+' '+names+' | '+delivered+' / '+count+' × '+data.bytes+' B | '+
      result.hops+' Hops | '+result.latency+' ms','traffic',result.route.path);
    if(data.malware) {
      const target=dst.vprofile||profileFor(dst);
      const protectedByLevel=target.security >= Math.max(70,100-(data.severity||3)*4);
      if(target.patched||protectedByLevel) {
        createEvent(lab,state.devices,'Verdächtiges Paket erkannt: '+dst.label+' geschützt','security',[targetId]);
      } else {
        dst.vprofile=target;
        target.infection=data.malware;
        createEvent(lab,state.devices,'Virtueller Befall ('+data.malware+') auf '+dst.label,'security',[targetId]);
      }
    }
    return {...result,count:delivered,dropped,kind};
  }
  function tick(state,lab,seconds=1) {
    const steps=clamp(seconds,1,60,1);
    const events=[];
    for(let n=0;n<steps;n++){
      lab.clock++;
      for(const d of state.devices){
        if(d.dead)continue;
        d.vprofile=d.vprofile||profileFor(d);
        const p=d.vprofile;
        p.uptime++;
        if(lab.clock===1){
          events.push(createEvent(lab,state.devices,d.label+': Link up, Neighbor Discovery / ARP bereit','system',[d.id]));
          if(p.dhcp&&(!p.ipv4||p.ipv4==='0.0.0.0')){
            const server=state.devices.find(s=>s.id!==d.id&&!s.dead&&s.vprofile?.dhcpServer&&route(state,d.id,s.id));
            if(server) {
              const index=state.devices.indexOf(d)+100;
              p.ipv4='192.168.1.'+(index%150+50);d.ip=p.ipv4;d.ips=[d.ip];
              events.push(createEvent(lab,state.devices,'DHCP Lease '+d.ip+' via '+server.label,'dhcp',[d.id,server.id]));
            } else events.push(createEvent(lab,state.devices,d.label+': DHCP timeout – kein erreichbarer DHCP-Server','warning',[d.id]));
          }
        }
        if(p.maintenance&&lab.clock%18===0){
          d.dead=true;
          p.lastFault='Wartungskonfiguration: Interface deaktiviert';
          events.push(createEvent(lab,state.devices,d.label+' offline (Wartung / Interface)', 'warning',[d.id]));
        }
      }
      // Background traffic: one flow every 4 simulated seconds, capped for large labs.
      if(lab.backgroundTraffic===true&&lab.clock%4===0&&state.devices.length>=2){
        const running=state.devices.filter(d=>!d.dead);
        if(running.length>=2){
          const a=running[lab.clock%running.length];
          const b=running[(lab.clock*3+1)%running.length];
          const dst=a===b?running[(running.indexOf(a)+1)%running.length]:b;
          events.push(send(state,lab,a.id,dst.id,'normal'));
        }
      }
      // Explicitly opt-in vulnerability propagation on network edges only.
      if(lab.spread===true&&lab.scenarioRunning===true&&lab.clock%5===0){
        const infected=state.devices.filter(d=>!d.dead&&d.vprofile?.infection).slice(0,18);
        for(const d of infected){
          const neighbors=state.links.filter(l=>!l.dead&&(l.a===d.id||l.b===d.id))
            .map(l=>state.devices.find(x=>x.id===(l.a===d.id?l.b:l.a)))
            .filter(x=>x&&!x.dead&&!x.vprofile?.infection);
          for(const t of neighbors.slice(0,2)){
            const result=evaluate(state,lab,d.id,t.id,'worm');
            const to=t.vprofile||profileFor(t);
            if(result.ok&&!to.patched&&to.security<75){
              t.vprofile=to;to.infection=d.vprofile.infection;
              events.push(createEvent(lab,state.devices,
                'Virtuelle Bedrohung von '+d.label+' nach '+t.label,'security',[d.id,t.id]));
            } else if(!result.ok){
              events.push(createEvent(lab,state.devices,'Ausbreitung gestoppt: '+result.reason,'blocked',[d.id,t.id]));
            }
          }
        }
      }
    }
    return events;
  }
  function audit(state,lab) {
    const problems=[];
    const warn=(id,text,severity)=>problems.push({id,text,severity});
    for(const d of state.devices){
      const p=profileFor(d);
      if(d.dead)warn(d.id,'Gerät ist offline','error');
      if(!state.links.some(l=>!l.dead&&(l.a===d.id||l.b===d.id)))warn(d.id,'Kein aktiver Link','error');
      if(p.dhcp&& !state.devices.some(x=>!x.dead&&x.vprofile?.dhcpServer))warn(d.id,'DHCP aktiviert – kein Server','warning');
      if(p.dnsServer&&!state.devices.some(x=>!x.dead&&x.ip===p.dnsServer))warn(d.id,'DNS-Server fehlt','warning');
      if(p.security<30)warn(d.id,'Niedriges Sicherheitsniveau','warning');
      if(p.infection)warn(d.id,'Virtuelle Bedrohung: '+p.infection,'error');
      if(p.maintenance)warn(d.id,'Wartungsmodus kann Link abschalten','warning');
    }
    return problems;
  }
  function evaluateTasks(state,lab){
    return (lab.tasks||[]).map(task=>{
      const d=state.devices.find(x=>x.id===task.device);
      if(!d)return {...task,passed:false,details:'Gerät nicht vorhanden'};
      const p=profileFor(d),want=String(task.expected||'').trim().toLowerCase();
      let passed=false;
      switch(task.kind){
        case 'ipv4': passed=(p.ipv4||d.ip||'').toLowerCase()===want;break;
        case 'ipv6': passed=p.ipv6.toLowerCase()===want;break;
        case 'subnet':passed=p.subnet===want;break;
        case 'dns':passed=p.dnsServer===want || p.domain===want;break;
        case 'gateway':passed=(p.gateway||d.gateway||'')===want;break;
        case 'vlan':passed=String(p.vlan)===want;break;
        case 'online':passed=!d.dead;break;
        case 'hardening':passed=p.patched&&p.security>=70;break;
        case 'ping':passed=evaluate(state,lab,d.id,task.target,'icmp').ok;break;
        case 'firewall':passed=p.firewallEnabled&&p.blockThreats;break;
        default:passed=false;
      }
      return {...task,passed,details:passed?'Erfüllt':'Noch nicht erfüllt'};
    });
  }
  return {MEDIA,PACKETS,DEFAULT_PROFILE,clamp,v4,v6,sameNetwork,makeLab,
    profileFor,sanitizeProfile,createEvent,route,resolveDns,evaluate,send,tick,audit,evaluateTasks,
    linkMetrics,VULNERABILITIES};
})();
if(typeof module!=='undefined')module.exports=PacketLabCore;
