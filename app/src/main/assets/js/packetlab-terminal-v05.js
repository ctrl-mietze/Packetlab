/* Veyra PacketLab v0.5 – offline virtual terminal.
   All commands manipulate IN-MEMORY LAB DEVICES ONLY. No shell or sockets. */
(() => {
'use strict';
const C=window.VeyraCore,N=window.VeyraNext,P=PacketLabCore;
if(!C||!N)return;
const S=C.state,lab=()=>N.lab,byId=id=>S.devices.find(d=>d.id===id);
const ipv4=x=>P.v4(x),ipv6=x=>P.v6(x),port=x=>/^\d{1,5}$/.test(String(x))&&+x>=1&&+x<=65535;
const safe=x=>String(x??'').replace(/[<>&"']/g,'').slice(0,180);
const isName=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(x);
const tick=x=>[Math.floor(x/3600),Math.floor(x%3600/60),x%60].map(y=>String(y).padStart(2,'0')).join(':');
const pbits=n=>{const v=+n;if(!Number.isInteger(v)||v<0||v>32)return null;
 const b=v?0xffffffff<<(32-v)>>>0:0;return [24,16,8,0].map(x=>(b>>>x)&255).join('.')};
const mbits=x=>{if(!ipv4(x))return null;const n=x.split('.').reduce((a,c)=>(a<<8|+c)>>>0,0);
 const bits=n.toString(2).padStart(32,'0');return /^1*0*$/.test(bits)?bits.split('0')[0].length:null};
function cidr(raw,v6=false){
 const values=String(raw||'').split('/');if(values.length>2)return null;
 const ip=values[0],pre=values[1]===undefined?(v6?64:24):+values[1];
 if(v6?(!ipv6(ip)||!Number.isInteger(pre)||pre>128||pre<0):(!ipv4(ip)||!Number.isInteger(pre)||pre>32||pre<0))return null;
 return {ip,pre,mask:v6?null:pbits(pre)};
}
function parse(input){
 if(typeof input!=='string'||input.length>420||/[\r\n\x00-\x08\x0b-\x1f]/.test(input))return {error:'Befehl maximal 420 Zeichen, nur eine Zeile'};
 // No pipelines, shell chains, redirection, expansion or executable commands.
 if(/(;|&&|\|\||\||\x60|\$\(|\$\{|<|>)/.test(input))return {error:'Shell-Operatoren sind hier nicht unterstützt'};
 const args=[];const re=/"([^"]*)"|'([^']*)'|([^\s]+)/g;let match;
 while((match=re.exec(input))!==null)args.push(match[1]??match[2]??match[3]);
 return {args:args.slice(0,25)};
}
function profile(d){
 d.vprofile=P.sanitizeProfile(d.vprofile||{},d);
 const p=d.vprofile;
 p.staticRoutes=Array.isArray(p.staticRoutes)?p.staticRoutes.slice(-60):[];
 p.disabledPorts=Array.isArray(p.disabledPorts)?p.disabledPorts.filter(port).slice(-80).map(Number):[];
 p.virtualServices=p.virtualServices&&typeof p.virtualServices==='object'?p.virtualServices:{};
 p.enabledServices=p.enabledServices&&typeof p.enabledServices==='object'?p.enabledServices:{};
 p.commandHistory=Array.isArray(p.commandHistory)?p.commandHistory.slice(-36):[];
 p.firewallDefaultIn=p.firewallDefaultIn==='deny'?'deny':'allow';
 return p;
}
function change(d,description,operation){
 C.pushHistory();operation(profile(d));C.refresh();
 if(description) {
  C.record(d.label+': '+safe(description),'good');
  P.createEvent(N.lab,C.state.devices,d.label+': '+safe(description),'config',[d.id]);
 }
 return description;
}
function ipSet(d,value,version=4){
 const addr=cidr(value,version===6);
 if(!addr)return 'Ungültiges '+(version===6?'IPv6':'IPv4')+'/Prefix';
 if(S.devices.some(x=>x.id!==d.id&&(version===6?x.vprofile?.ipv6===addr.ip:x.ip===addr.ip)))
   return 'Adresse bereits vergeben';
 return change(d,'IPv'+version+' '+addr.ip+'/'+addr.pre,p=>{
  if(version===6){p.ipv6=addr.ip;p.ipv6Prefix=addr.pre}
  else{p.ipv4=addr.ip;p.subnet=addr.mask;d.ip=addr.ip;d.ips=[addr.ip]}
 });
}
function setGateway(d,ip){
 if(ip!=='none'&&!ipv4(ip))return 'Gateway: gültige IPv4 erwartet';
 return change(d,'Gateway '+(ip==='none'?'entfernt':ip),p=>{
  p.gateway=ip==='none'?'':ip;d.gateway=p.gateway||undefined
 });
}
function setDNS(d,ip){
 if(ip!=='none'&&!ipv4(ip))return 'DNS: gültige IPv4 erwartet';
 return change(d,'DNS-Server '+(ip==='none'?'entfernt':ip),p=>p.dnsServer=ip==='none'?'':ip);
}
function numberChange(d,key,raw,min,max,unit=''){
 if(!raw||!Number.isFinite(+raw)||+raw<min||+raw>max)return key+': Wert zwischen '+min+' und '+max+' erforderlich';
 return change(d,key+' = '+raw+unit,p=>p[key]=+raw);
}
function switchChange(d,key,value,label){
 if(!['on','off','enable','disable'].includes(value||''))return label+' on|off';
 const enabled=['on','enable'].includes(value);
 return change(d,label+': '+(enabled?'aktiv':'inaktiv'),p=>p[key]=enabled);
}
function showRoutes(d){
 const p=profile(d);
 let routes=[];
 if(p.gateway||d.gateway)routes.push('default via '+(p.gateway||d.gateway)+' dev eth0');
 if(p.ipv4||d.ip)routes.push((p.ipv4||d.ip)+'/'+(mbits(p.subnet)??24)+' dev eth0 scope link');
 routes.push(...p.staticRoutes.map(r=>r.dst+' via '+r.via+' dev eth0'));
 return routes.join('\n')||'Routingtabelle leer';
}
function resolve(d,ref){
 if(!ref)return {error:'Ziel fehlt'};
 let target=S.devices.find(x=>x.id!==d.id &&
 [x.label,x.ip,x.vprofile?.hostname,x.vprofile?.domain,x.vprofile?.ipv6].filter(Boolean)
 .some(v=>String(v).toLowerCase()===ref.toLowerCase()));
 if(target)return {device:target};
 const result=P.resolveDns(S,lab(),d.id,ref,'A');
 if(result.error)return {error:'DNS: '+result.error};
 target=S.devices.find(x=>x.ip===result.answer&&x.id!==d.id);
 return target?{device:target,dns:result.server}:{error:'DNS-Auflösung zu '+result.answer+', aber Gerät fehlt'};
}
function packetTo(d,ref,type='icmp',count=1){
 const r=resolve(d,ref);if(r.error)return 'Nicht erreichbar: '+r.error;
 const target=r.device;
 const route=P.evaluate(S,lab(),d.id,target.id,type);
 if(!route.ok)return 'Nicht erreichbar: '+route.reason;
 const result=P.send(S,lab(),d.id,target.id,type,count);
 if(!result.ok)return 'Paketverlust: '+result.reason;
 return target.label+' ('+target.ip+') · '+result.hops+' Hops · '+result.latency+' ms · '+
  result.mbps+' Mbit/s'+(result.dropped?' · '+result.dropped+' Frames verloren':'');
}
function serviceList(d){
 const p=profile(d);
 const listen=(d.services||[]).map(s=>s.port+' '+s.name).join('\n');
 const extras=Object.entries(p.virtualServices).map(([name,v])=>name+': '+(v?'active':'inactive')).join('\n');
 return (listen||'Keine Dienste')+(extras?'\n'+extras:'');
}
const services={
 ssh:['ssh',22,'SSH'],sshd:['ssh',22,'SSH'],nginx:['http',80,'HTTP'],
 http:['http',80,'HTTP'],apache2:['http',80,'HTTP'],https:['https',443,'HTTPS'],
 dns:['dnsEnabled',53,'DNS'],named:['dnsEnabled',53,'DNS'],dnsmasq:['dnsEnabled',53,'DNS'],
 dhcp:['dhcpServer',67,'DHCP'],dhcpd:['dhcpServer',67,'DHCP'],
 ntp:['ntp',123,'NTP'],ntpd:['ntp',123,'NTP'],
 smtp:['smtp',25,'SMTP'],postfix:['smtp',25,'SMTP'],
 smb:['smb',445,'SMB'],smbd:['smb',445,'SMB'],mqtt:['mqtt',1883,'MQTT'],
 snmp:['snmp',161,'SNMP'],
 firewall:['firewallEnabled',0,'Firewall'],ufw:['firewallEnabled',0,'Firewall'],
 ids:['blockThreats',0,'Threat Prevention']
};
function serviceAction(d,action,name){
 const svc=services[String(name||'').toLowerCase()];
 if(!svc)return 'Unbekannter Dienst: '+String(name||'')+'; Liste mit services';
 const [key,num,label]=svc;
 const p=profile(d),active=!!(p.virtualServices[key]||p[key]);
 if(action==='status')return label+': '+(active?'active (running)':'inactive (dead)');
 if(['enable','disable'].includes(action))
   return change(d,label+' Autostart '+action,q=>q.enabledServices[key]=action==='enable');
 if(!['start','stop','restart'].includes(action))return 'systemctl start|stop|restart|enable|disable|status <Dienst>';
 const on=action!=='stop';
 return change(d,label+' '+(on?'gestartet':'gestoppt'),q=>{
  q.virtualServices[key]=on;
  if(['dnsEnabled','dhcpServer','firewallEnabled','blockThreats'].includes(key))q[key]=on;
  if(num>0){
   d.services=(d.services||[]).filter(s=>s.port!==num);
   if(on)d.services.push({port:num,name:label});
  }
 });
}
function firewallStatus(d){
 const p=profile(d);
 return 'Firewall '+(p.firewallEnabled?'active':'inactive')+
   '\nDefault input '+p.firewallDefaultIn+
   '\nThreat prevention '+(p.blockThreats?'ON':'OFF')+
   '\n'+(d.rules||[]).map((r,i)=>(i+1)+'. '+r.action.toUpperCase()+' '+r.proto+
     ' Port '+r.port).join('\n');
}
function fwRule(d,action,raw,transport='tcp'){
 const n=String(raw||'').split('/')[0],proto=String(raw||'').includes('/')?
     String(raw).split('/')[1]:transport;
 if(!port(n)&&n!=='any')return 'Port 1..65535 oder any erforderlich';
 if(!['tcp','udp','any'].includes(proto))return 'Protokoll tcp|udp|any erwartet';
 return change(d,'Firewall-Regel '+action+' '+n+'/'+proto,p=>{
  p.firewallEnabled=true;
  d.rules=Array.isArray(d.rules)?d.rules:[];
  d.rules.push({action:action==='allow'?'allow':'block',
    proto:'data',transport:proto,port:n,from:'any',to:'any'});
 });
}
function help(topic=''){
 const pages={
  net:['ip addr | ip -6 addr | ip link | ip route | ip neigh',
   'ip addr add 192.168.1.20/24 dev eth0',
   'ip addr del 192.168.1.20/24 dev eth0',
   'ip -6 addr add 2001:db8::20/64 dev eth0',
   'ip link set eth0 up|down | ip link set eth0 mtu 1450',
   'ip route add default via 192.168.1.1',
   'ip route add 10.0.0.0/24 via 192.168.1.1',
   'ip route del default',
   'ifconfig eth0 192.168.1.20 netmask 255.255.255.0',
   'nmcli device show | nmcli con mod eth0 ipv4.gateway 192.168.1.1',
   'vlan show | vlan set 20 | bandwidth up 500 | mtu 1400'],
  dns:['dns server on|off','dns resolver 192.168.1.18',
   'dns record add A web.lab 192.168.1.18',
   'dns record add AAAA web.lab 2001:db8::18',
   'dns record list | dns record del A web.lab',
   'nslookup web.lab | dig web.lab | resolvectl status',
   'resolvectl dns eth0 192.168.1.18'],
  services:['services | systemctl list-units',
   'systemctl start|stop|restart ssh',
   'systemctl start dns|dhcp|nginx|https|ntp|smb|mqtt',
   'systemctl enable|disable ssh',
   'dhcp status | dhcp server on | dhcp client on | dhcp renew',
   'port list | port disable 445 | port enable 445',
   'ss -tuln | tcpdump | journalctl'],
  security:['ufw status numbered | ufw enable|disable',
   'ufw deny 80 | ufw allow 443/tcp | ufw delete 1',
   'ufw default deny incoming | ufw default allow incoming',
   'firewall status | firewall threat on|off',
   'security status | security set 85 | security patch on|off',
   'iptables -L | iptables -F (virtuelle Regeln)',
   'wan on|off | wan port 51820 | vpn on|off'],
  system:['hostname | hostnamectl set-hostname router-a',
   'uname -a | uptime | whoami | id | date',
   'hardware | cpu 8 | ram 16 | disk 512',
   'mtu 1500 | bandwidth up 250 | bandwidth down 1000',
   'cat /etc/hostname | cat /etc/resolv.conf',
   'journalctl -n 15 | dmesg | history | clear',
   'poweroff | reboot | exit']
 };
 const aliases={network:'net',ip:'net',routing:'net',firewall:'security'};
 topic=aliases[topic]||topic;
 if(topic&&pages[topic])return pages[topic].join('\n');
 if(topic)return 'Hilfeseiten: net, dns, services, security, system';
 return 'VEYRA VIRTUAL TERMINAL · ausschließlich Offline-Netzwerksimulation\n'+
  '  help net       IPv4, IPv6, VLAN und Routing\n'+
  '  help dns       DNS Records / Resolver\n'+
  '  help services  DHCP, Systemdienste und Ports\n'+
  '  help security  Firewall, Hardening, WAN und VPN\n'+
  '  help system    Hardware, Zustand, Logs und Neustart\n'+
  '  ping PC-2      Virtuelle Erreichbarkeit / Laufzeit\n'+
  '  clear, exit    Anzeige leeren / schließen';
}

function execute(id,text){
 const d=byId(id);if(!d)return 'Gerät nicht vorhanden';
 const parsed=parse(text);if(parsed.error)return parsed.error;
 let a=parsed.args||[];if(!a.length)return '';
 if(a[0]==='sudo')a=a.slice(1);
 const cmd=a[0]?.toLowerCase(),p=profile(d),f=a[1]?.toLowerCase();
 // In-memory, bounded command history; never store passwords.
 if(cmd!=='history'&&cmd!=='clear'&&!a.some(x=>/passw(or)?d|token|secret/i.test(x))){
  p.commandHistory.push(a.join(' ').slice(0,180));
  if(p.commandHistory.length>40)p.commandHistory.shift();
 }
 if(cmd==='help'||cmd==='?'||cmd==='man')return help(a[1]?.toLowerCase()||'');
 if(cmd==='setup'||cmd==='configure'&&a.length===1){
  const role=d.type,kind=['router','vpn','modem','cloud'].includes(role)?'Router / WAN':
    ['firewall','ids'].includes(role)?'Firewall / IDS':
    ['switch','hub','wlc','loadbalancer'].includes(role)?'Switching / Controller':
    ['dns','dhcp','server','nas','mail','database','ntp','hypervisor'].includes(role)?'Server':
    'Endgerät / Client';
  const steps=[
    'Veyra Device Setup · '+d.label+' · '+role+' ('+kind+')',
    '1. hostnamectl set-hostname '+(p.hostname||d.label.toLowerCase()),
    '2. ip addr add '+(d.ip||'192.168.1.20')+'/24 dev eth0',
    '3. ip route add default via 192.168.1.1',
    '4. dns resolver 192.168.1.18',
    '5. vlan set 1',
    '6. security set 80 · security patch on',
    '7. ping 192.168.1.18',
    'Details: help net / help services / help security / help dns'
  ];
  if(kind==='Router / WAN')steps.splice(6,0,'WAN: wan on · wan port 51820 · vpn on');
  if(kind==='Firewall / IDS')steps.splice(6,0,'Firewall: ufw enable · ufw deny 445 · firewall threat on');
  if(kind==='Switching / Controller')steps.splice(6,0,'Switch: vlan set 20 · ip neigh');
  if(kind==='Server')steps.splice(6,0,'Server: systemctl start dns|dhcp|nginx · ss -tuln');
  return steps.join('\n');
 }
 if(cmd==='show'){
  if(['running-config','config','configuration'].includes(f)){
    return 'Veyra Virtual Running Configuration — '+d.label+
      '\nhostname '+(p.hostname||d.label)+
      '\ninterface eth0'+
      '\n ip address '+(d.ip||'0.0.0.0')+'/'+(mbits(p.subnet)??24)+
      '\n ipv6 address '+(p.ipv6||'–')+
      '\n mtu '+p.mtu+
      '\n vlan '+p.vlan+
      '\n ip default-gateway '+(p.gateway||d.gateway||'nicht gesetzt')+
      '\n name-server '+(p.dnsServer||'nicht gesetzt')+
      '\n bandwidth upload '+p.uploadMbps+' Mbps download '+p.downloadMbps+' Mbps'+
      '\n firewall '+(p.firewallEnabled?'enabled':'disabled')+
      '\n security level '+p.security+
      '\n'+showRoutes(d);
  }
  if(f==='interfaces'||f==='interface')return 'eth0 '+(d.dead?'DOWN':'UP')+' '+(d.ip||'kein IPv4')+
    ' mtu '+p.mtu+' mac '+(d.mac||'');
  if(f==='ip'&&a[2]==='route')return showRoutes(d);
  if(f==='vlan')return 'VLAN '+p.vlan;
  if(f==='services')return serviceList(d);
  if(f==='firewall')return firewallStatus(d);
  return 'show running-config | show interfaces | show ip route | show vlan | show services | show firewall';
 }
 if(cmd==='config'){
  if(f==='show')return 'show running-config';
  if(f!=='set'||!a[2])return 'config set ipv4|ipv6|hostname|gateway|dns|vlan|mtu|upload|download|security <Wert>';
  const field=a[2].toLowerCase(),value=a[3];
  if(field==='ipv4')return ipSet(d,value);
  if(field==='ipv6')return ipSet(d,value,6);
  if(field==='gateway')return setGateway(d,value);
  if(field==='dns')return setDNS(d,value);
  if(field==='vlan')return numberChange(d,'vlan',value,1,4094);
  if(field==='mtu')return numberChange(d,'mtu',value,576,9000,' Bytes');
  if(field==='upload')return numberChange(d,'uploadMbps',value,0.1,1000000,' Mbit/s');
  if(field==='download')return numberChange(d,'downloadMbps',value,0.1,1000000,' Mbit/s');
  if(field==='security')return numberChange(d,'security',value,0,100);
  if(field==='hostname'){
    if(!isName(value))return 'Hostname nicht gültig';
    return change(d,'Hostname '+value,q=>{q.hostname=value;d.label=value.slice(0,18)});
  }
  return 'Unbekanntes Konfigurationsfeld. Mit help net oder setup erhältst du Beispiele.';
 }
 if(cmd==='clear')return 'CLEAR';
 if(cmd==='exit'||cmd==='logout')return 'CLOSE';
 if(cmd==='history')return p.commandHistory.map((x,i)=>(i+1)+'  '+x).join('\n')||'History leer';
 if(cmd==='hostname'&&a.length===1)return p.hostname||d.label;
 if(cmd==='hostnamectl'&&f==='status')return 'Static hostname: '+(p.hostname||d.label)+'\nVirtual OS: '+p.os;
 if((cmd==='hostname'&&a[1])||(cmd==='hostnamectl'&&f==='set-hostname'&&a[2])){
  const name=cmd==='hostname'?a[1]:a[2];
  if(!isName(name))return 'Hostname: 1..63 Zeichen, nur Buchstaben, Zahlen, . - _';
  if(S.devices.some(x=>x.id!==id&&x.label.toLowerCase()===name.toLowerCase()))return 'Gerätename bereits vorhanden';
  return change(d,'Hostname '+name,q=>{q.hostname=name;d.label=name.slice(0,18)});
 }
 if(cmd==='whoami')return 'labuser';
 if(cmd==='id')return 'uid=1000(labuser) gid=1000(labuser) groups=1000(labuser)';
 if(cmd==='pwd')return '/home/labuser (virtuelles Dateisystem)';
 if(cmd==='ls'||cmd==='dir')return 'etc/  var/  home/  proc/   (nur simulierte Dateien)';
 if(cmd==='echo')return safe(a.slice(1).join(' '));
 if(cmd==='uname')return p.os+' — Veyra Virtual Kernel 0.5 (keine echte VM)';
 if(cmd==='date')return 'Virtuelle Laufzeit '+tick(lab().clock)+' | Hostzeit '+new Date().toLocaleString('de-DE');
 if(cmd==='uptime')return 'up '+tick(p.uptime||0)+' · '+(d.dead?'OFFLINE':'ONLINE');
 if(cmd==='free'||cmd==='ram'&&a.length===1)return 'Mem: '+p.ramGB+' GB konfiguriert | CPU: '+p.cpu+' vCores';
 if(cmd==='df'||cmd==='disk'&&a.length===1)return '/dev/virtual  '+p.storageGB+' GiB  24% belegt (simuliert)';
 if(cmd==='hardware')return 'CPU '+p.cpu+' Kerne\nRAM '+p.ramGB+' GiB\nDisk '+p.storageGB+' GiB'+
  '\nMTU '+p.mtu+'\nUpload '+p.uploadMbps+' Mbit/s\nDownload '+p.downloadMbps+' Mbit/s';
 if(cmd==='cpu')return numberChange(d,'cpu',a[1],1,128,' Cores');
 if(cmd==='ram')return numberChange(d,'ramGB',a[1],.5,2048,' GiB');
 if(cmd==='disk')return numberChange(d,'storageGB',a[1],1,65536,' GiB');
 if(cmd==='mtu')return numberChange(d,'mtu',a[1],576,9000,' Bytes');
 if(cmd==='bandwidth'||cmd==='speed'){
  if(!['up','upload','down','download'].includes(f))return 'bandwidth up|down <Mbit/s>';
  return numberChange(d,['up','upload'].includes(f)?'uploadMbps':'downloadMbps',a[2],.1,1000000,' Mbit/s');
 }
 if(cmd==='vlan'){
  if(!f||f==='show'||f==='status')return 'VLAN-ID '+p.vlan+' (802.1Q virtuell)';
  if(f==='set')return numberChange(d,'vlan',a[2],1,4094);
  return 'vlan show | vlan set 20';
 }
 if(cmd==='ip'){
  let idx=1,ver=4;
  if(a[idx]==='-6'){ver=6;idx++}
  const mode=a[idx]?.toLowerCase(),op=a[idx+1]?.toLowerCase();
  if(['addr','address','a'].includes(mode)){
   if(!op||['show','list'].includes(op))
    return 'eth0: '+(d.dead?'DOWN':'UP')+' mtu '+p.mtu+
      '\n  inet '+(p.ipv4||d.ip||'–')+'/'+(mbits(p.subnet)??24)+
      '\n  inet6 '+(p.ipv6||'–')+'/'+(p.ipv6Prefix||64)+
      '\n  ether '+(d.mac||'–');
   if(['add','replace'].includes(op)){
    if(a[idx+2]==='undefined')return 'IP Adresse erforderlich';
    return ipSet(d,a[idx+2],ver);
   }
   if(op==='del'||op==='delete'){
    const target=cidr(a[idx+2],ver===6);
    if(!target)return 'Ungültige IP/CIDR';
    if(ver===6){
     if(p.ipv6!==target.ip)return 'IPv6-Adresse nicht auf eth0';
     return change(d,'IPv6 entfernt',q=>q.ipv6='');
    }
    if(d.ip!==target.ip)return 'IPv4-Adresse nicht auf eth0';
    return change(d,'IPv4 entfernt',q=>{q.ipv4='';d.ip='';d.ips=[]});
   }
   return 'ip addr show|add|del <IP/Präfix> dev eth0';
  }
  if(mode==='link'){
   if(!op||op==='show'||op==='list')return 'eth0: '+(d.dead?'DOWN':'UP')+
      ' mtu '+p.mtu+' ether '+(d.mac||'–')+' '+p.downloadMbps+' Mbit/s';
   if(op==='set'){
    const action=a.slice(idx+2);
    if(action.includes('down')||action.includes('up')){
     const on=action.includes('up');
     C.setPower(id,on);
     return 'eth0: '+(on?'UP':'DOWN');
    }
    const mtuPos=action.indexOf('mtu');
    if(mtuPos!==-1)return numberChange(d,'mtu',action[mtuPos+1],576,9000,' Bytes');
   }
   return 'ip link show | ip link set eth0 up|down|mtu 1500';
  }
  if(mode==='route'||mode==='r'){
   if(!op||['show','list'].includes(op))return showRoutes(d);
   if(['add','replace'].includes(op)){
    const dst=a[idx+2],viaPos=a.indexOf('via',idx+3),gateway=a[viaPos+1];
    if(viaPos<0||!ipv4(gateway))return 'ip route add <Netz/CIDR|default> via <Gateway-IP>';
    if(dst==='default')return setGateway(d,gateway);
    if(!cidr(dst))return 'Ungültiges Zielnetz';
    return change(d,'Statische Route '+dst+' via '+gateway,q=>{
      q.staticRoutes=q.staticRoutes.filter(r=>r.dst!==dst);
      q.staticRoutes.push({dst,via:gateway});
    });
   }
   if(['del','delete'].includes(op)){
    const dst=a[idx+2];
    if(dst==='default')return setGateway(d,'none');
    if(!p.staticRoutes.some(r=>r.dst===dst))return 'Route nicht vorhanden';
    return change(d,'Route '+dst+' entfernt',q=>q.staticRoutes=q.staticRoutes.filter(r=>r.dst!==dst));
   }
   return 'ip route add|del <Netz/CIDR|default> via <Gateway>';
  }
  if(mode==='neigh'||mode==='neighbor')
   return [...(d.arp||new Map()).entries()].map(([ip,mac])=>ip+' lladdr '+mac+' dev eth0').join('\n')||'ARP / Neighbor Cache leer';
  if(mode==='-s')return 'eth0: TX '+p.sent+' RX '+p.received+' (virtuelle Frames)';
  return help('net');
 }
 if(cmd==='ifconfig'){
  if(a.length===1||f==='eth0'&&a.length===2)return 'eth0 '+(d.dead?'DOWN':'UP')+
    ' MTU '+p.mtu+'\n  inet '+(p.ipv4||d.ip||'–')+' netmask '+p.subnet+
    '\n  inet6 '+(p.ipv6||'–')+' ether '+d.mac;
  const action=f==='eth0'?a[2]:a[1];
  if(['up','down'].includes(action)){C.setPower(id,action==='up');return 'eth0 '+action}
  if(!ipv4(action))return 'ifconfig eth0 <IPv4> netmask <255.255.255.0>';
  const netmaskIndex=a.indexOf('netmask');
  const mask=netmaskIndex>-1?a[netmaskIndex+1]:p.subnet;
  if(mbits(mask)===null)return 'Ungültige Netzmaske';
  return ipSet(d,action+'/'+mbits(mask));
 }
 if(cmd==='route'){
  if(!f||['-n','show'].includes(f))return showRoutes(d);
  if(f==='add'&&a[2]==='default'&&a[3]==='gw')return setGateway(d,a[4]);
  if((f==='del'||f==='delete')&&a[2]==='default')return setGateway(d,'none');
  return help('net');
 }
 if(cmd==='arp')return [...(d.arp||new Map()).entries()].map(([ip,mac])=>ip+' at '+mac).join('\n')||'ARP-Tabelle leer';
 if(cmd==='ethtool'){
  const links=S.links.filter(l=>l.a===id||l.b===id);
  return 'Link detected: '+(d.dead?'no':'yes')+'\nSpeed '+p.downloadMbps+
    ' Mbit/s\nDuplex full\nKabel: '+links.length+' angeschlossen';
 }
 if(cmd==='ping'||cmd==='ping6'||cmd==='traceroute'||cmd==='tracepath'){
  const target=a[a.length-1];
  if(!target||target.startsWith('-'))return cmd+' [-c N] <Ziel-IP oder DNS>';
  const countI=a.indexOf('-c');
  const count=countI>-1?Math.min(8,Math.max(1,+a[countI+1]||1)):1;
  const info=packetTo(d,target,'icmp',count);
  if(cmd.startsWith('trace'))return 'traceroute '+target+'\n'+info;
  return 'PING '+target+' ('+count+' virt. Anfrage'+(count===1?'':'n')+')\n'+info;
 }
 if(cmd==='curl'||cmd==='wget'||cmd==='nc'||cmd==='telnet'){
  const url=a.slice(1).find(x=>!x.startsWith('-'));
  if(!url)return cmd+' <virtueller Host oder http://Host>';
  const match=/^(https?):\/\/([^/:?#]+)/i.exec(url);
  const proto=match?match[1].toLowerCase():'http',host=match?match[2]:url;
  return cmd+' (simuliert): '+packetTo(d,host,proto==='https'?'https':'http');
 }
 if(cmd==='nmcli'){
  if(f==='device'||f==='dev'){
   if(a[2]==='show'||a[2]==='status'||!a[2])return 'eth0 '+(d.dead?'disconnected':'connected')+
     '\nIP4.ADDRESS '+(p.ipv4||d.ip)+'/'+(mbits(p.subnet)??24)+
     '\nIP4.GATEWAY '+(p.gateway||'–')+'\nIP4.DNS '+(p.dnsServer||'–')+'\nIP6.ADDRESS '+(p.ipv6||'–');
  }
  if(f==='con'||f==='connection'){
   if(a[2]==='up'){C.setPower(id,true);return 'eth0 connected'}
   if(['mod','modify'].includes(a[2])){
    const attr=a[4],v=a[5];
    if(attr==='ipv4.addresses')return ipSet(d,v);
    if(attr==='ipv6.addresses')return ipSet(d,v,6);
    if(attr==='ipv4.gateway')return setGateway(d,v);
    if(attr==='ipv4.dns')return setDNS(d,v);
    if(attr==='ipv4.method')return switchChange(d,'dhcp',v==='auto'?'on':'off','DHCP Client');
   }
  }
  return 'nmcli device show | nmcli con mod eth0 ipv4.addresses 10.1.1.4/24';
 }
 if(cmd==='resolvectl'){
  if(!f||f==='status')return 'DNS: '+(p.dnsServer||'nicht konfiguriert');
  if(f==='dns'&&a[2])return setDNS(d,a[3]);
  return 'resolvectl status | resolvectl dns eth0 192.168.1.18';
 }

 if(cmd==='dns'){
  if(!f||f==='status')return 'DNS-Dienst: '+(p.dnsEnabled?'aktiv':'inaktiv')+
   '\nDNS-Resolver: '+(p.dnsServer||'kein')+'\nZonen: '+(lab().dnsRecords||[]).length;
  if(f==='server')return switchChange(d,'dnsEnabled',a[2],'DNS Dienst');
  if(f==='resolver')return setDNS(d,a[2]);
  if(f==='record'){
   const action=a[2],type=String(a[3]||'').toUpperCase(),host=a[4],value=a[5];
   const records=lab().dnsRecords=Array.isArray(lab().dnsRecords)?lab().dnsRecords:[];
   if(action==='list'||action==='show'){
    return records.map(r=>r.host+' '+r.type+' '+r.value).join('\n')||'Keine DNS Records';
   }
   if(action==='add'){
    if(!['A','AAAA'].includes(type)||!isName(host)||!(type==='A'?ipv4(value):ipv6(value)))
      return 'dns record add A|AAAA <hostname> <gültige-IP>';
    C.pushHistory();
    lab().dnsRecords=records.filter(r=>!(r.host===host.toLowerCase()&&r.type===type)).concat({
      type,host:host.toLowerCase(),value
    }).slice(-120);
    C.record('DNS Record '+host+' '+type+' '+value,'good');
    return 'DNS Record gespeichert: '+host+' '+type+' '+value;
   }
   if(['del','delete'].includes(action)){
    if(!['A','AAAA'].includes(type)||!host)return 'dns record del A|AAAA <hostname>';
    const next=records.filter(r=>!(r.host===host.toLowerCase()&&r.type===type));
    if(next.length===records.length)return 'Record nicht gefunden';
    C.pushHistory();lab().dnsRecords=next;return 'DNS Record gelöscht';
   }
  }
  return help('dns');
 }
 if(cmd==='nslookup'||cmd==='dig'){
  let name=a[1],type='A';
  if(!name)return cmd+' <Hostname>';
  if(a.includes('AAAA')||a.includes('-type=AAAA'))type='AAAA';
  if(a[2]&&a[2].toUpperCase()==='AAAA')type='AAAA';
  const result=P.resolveDns(S,lab(),id,name,type);
  return result.error?result.error:(cmd==='dig'&&a.includes('+short')?result.answer:
    'Server: '+result.server+'\nName: '+name+'\nRecord '+type+': '+result.answer);
 }
 if(cmd==='dhcp'){
  if(!f||f==='status')return 'DHCP Client '+(p.dhcp?'ON':'OFF')+
    '\nDHCP Server '+(p.dhcpServer?'ON':'OFF')+'\nIPv4 '+(p.ipv4||d.ip||'keine');
  if(f==='server')return switchChange(d,'dhcpServer',a[2],'DHCP Server');
  if(f==='client')return switchChange(d,'dhcp',a[2],'DHCP Client');
  if(['renew','request','lease'].includes(f)){
   const candidates=S.devices.filter(s=>s.id!==id&&!s.dead&&s.vprofile?.dhcpServer);
   const server=candidates.find(x=>P.route(S,id,x.id));
   if(!server)return 'DHCP: Timeout – kein erreichbarer aktiver Server';
   const base=(ipv4(server.ip)?server.ip:'192.168.1.1').split('.').slice(0,3).join('.');
   const used=new Set(S.devices.map(d=>d.ip).filter(Boolean));
   let pick=null;for(let i=100;i<=240;i++)if(!used.has(base+'.'+i)){pick=base+'.'+i;break}
   if(!pick)return 'DHCP Pool erschöpft';
   return change(d,'DHCP Lease '+pick+' von '+server.label,q=>{
    q.dhcp=true;q.ipv4=pick;q.subnet='255.255.255.0';
    q.gateway=(server.vprofile?.gateway||server.ip)||'';
    d.ip=pick;d.ips=[pick];d.gateway=q.gateway||undefined;
   });
  }
  return help('services');
 }
 if(cmd==='services'){
  if(!f||f==='list'||f==='status')return serviceList(d);
  return 'services list | systemctl start|stop <Dienst>';
 }
 if(cmd==='systemctl'||cmd==='service'){
  if(f==='list-units')return serviceList(d);
  if(f==='reboot'){C.setPower(id,false);C.setPower(id,true);return 'Virtueller Neustart abgeschlossen'}
  if(f==='poweroff'||f==='halt'){C.setPower(id,false);return 'Virtuelles Gerät ausgeschaltet'}
  return serviceAction(d,f,a[2]);
 }
 if(cmd==='ss'||cmd==='netstat')return 'State  Local Address  Process\n'+
    (d.services||[]).filter(x=>!p.disabledPorts.includes(x.port)).map(x=>'LISTEN  0.0.0.0:'+x.port+
    '  '+x.name).join('\n')||'Keine offenen Listener';
 if(cmd==='port'||cmd==='ports'){
  if(cmd==='ports'||!f||f==='list')return 'Aktive Dienste:\n'+serviceList(d)+
    '\nDeaktivierte Ports: '+(p.disabledPorts.join(', ')||'keine');
  if(f==='status'){
   if(!port(a[2]))return 'port status <1..65535>';
   return 'Port '+a[2]+': '+(p.disabledPorts.includes(+a[2])?'deaktiviert':'aktiv (wenn Dienst lauscht)');
  }
  if(['disable','enable'].includes(f)){
   if(!port(a[2]))return 'port '+f+' <1..65535>';
   return change(d,'Port '+a[2]+' '+f,q=>{
    q.disabledPorts=q.disabledPorts.filter(x=>x!==+a[2]);
    if(f==='disable')q.disabledPorts.push(+a[2]);
   });
  }
  return help('services');
 }
 if(cmd==='security'){
  if(!f||f==='status')return 'Sicherheitsstufe '+p.security+'/100'+
   '\nPatchstatus '+(p.patched?'gepatcht':'ungepatcht')+
   '\nThreat Prevention '+(p.blockThreats?'ON':'OFF')+
   '\nInfektion '+(p.infection||'keine');
  if(f==='set')return numberChange(d,'security',a[2],0,100);
  if(f==='patch')return switchChange(d,'patched',a[2],'Patchstand');
  if(f==='clean')return change(d,'Virtuellen Befall entfernt',q=>q.infection=null);
  return help('security');
 }
 if(cmd==='firewall'){
  if(!f||f==='status')return firewallStatus(d);
  if(f==='on'||f==='off')return switchChange(d,'firewallEnabled',f,'Firewall');
  if(f==='threat')return switchChange(d,'blockThreats',a[2],'Threat Prevention');
  if(f==='rules')return firewallStatus(d);
  if(f==='allow'||f==='deny'||f==='block')return fwRule(d,f,a[2],a[3]);
  return help('security');
 }
 if(cmd==='ufw'){
  if(!f||f==='status')return firewallStatus(d);
  if(f==='enable'||f==='disable')return switchChange(d,'firewallEnabled',f,'UFW Firewall');
  if(f==='default'){
   if(!['allow','deny'].includes(a[2])||a[3]!=='incoming')return 'ufw default allow|deny incoming';
   return change(d,'Firewall Default '+a[2],q=>{q.firewallDefaultIn=a[2];q.firewallEnabled=true});
  }
  if(f==='allow'||f==='deny')return fwRule(d,f,a[2],a[3]);
  if(f==='delete'){
   const index=+a[2]-1;
   if(!Number.isInteger(index)||index<0||index>=(d.rules||[]).length)return 'ufw delete <Regelnummer>, siehe ufw status';
   return change(d,'Firewall-Regel '+(index+1)+' entfernt',()=>d.rules.splice(index,1));
  }
  return help('security');
 }
 if(cmd==='iptables'){
  if(f==='-L'||f==='-S')return firewallStatus(d);
  if(f==='-F')return change(d,'Virtuelle Firewall-Regeln geleert',()=>d.rules=[]);
  if(f==='-A'&&a[2]==='INPUT'){
   const dport=a.indexOf('--dport'),j=a.indexOf('-j');
   const action=a[j+1]==='ACCEPT'?'allow':'deny';
   if(dport<0||j<0||!port(a[dport+1]))return 'iptables -A INPUT -p tcp --dport 80 -j DROP';
   return fwRule(d,action,a[dport+1]);
  }
  return 'iptables -L | -F | -A INPUT -p tcp --dport <n> -j DROP';
 }
 if(cmd==='wan'){
  if(!f||f==='status')return 'WAN '+(p.internet?'ON':'OFF')+' Port '+p.wanPort+
    '\nTunnel '+(p.tunnel?'ON':'OFF');
  if(f==='on'||f==='off')return switchChange(d,'internet',f,'WAN');
  if(f==='port')return numberChange(d,'wanPort',a[2],1,65535);
  return 'wan status | wan on|off | wan port 51820';
 }
 if(cmd==='vpn'){
  if(!f||f==='status')return 'VPN Tunnel '+(p.tunnel?'ON':'OFF')+' Port '+p.wanPort;
  if(f==='on'||f==='off')return switchChange(d,'tunnel',f,'VPN Tunnel');
  if(f==='port')return numberChange(d,'wanPort',a[2],1,65535);
  return 'vpn on|off | vpn port 51820';
 }
 if(cmd==='journalctl'||cmd==='dmesg'||cmd==='tcpdump'||cmd==='logs'){
  const countIndex=a.indexOf('-n'),n=countIndex>=0?Math.min(30,Math.max(1,+a[countIndex+1]||10)):12;
  const from=p.logs||[];
  return from.slice(-n).map(x=>tick(x.time)+' '+x.type+' '+safe(x.text)).join('\n')||
    'Keine virtuellen Ereignisse; VS starten oder Paket senden';
 }
 if(cmd==='cat'){
  const file=a[1];if(!file)return 'cat <virtuelle Datei>';
  if(file==='/etc/hostname')return p.hostname||d.label;
  if(file==='/etc/resolv.conf')return 'nameserver '+(p.dnsServer||'keiner')+
    (p.domain?'\nsearch '+p.domain:'');
  if(file==='/etc/os-release')return 'NAME='+p.os+'\nVERSION=Veyra PacketLab Virtual';
  if(file==='/etc/network/interfaces')return 'auto eth0\niface eth0 inet '+(p.dhcp?'dhcp':'static')+
    '\n address '+(p.ipv4||d.ip)+'\n netmask '+p.subnet+'\n gateway '+(p.gateway||'');
  if(file==='/etc/hosts')return '127.0.0.1 localhost\n'+(p.ipv4||d.ip)+' '+(p.hostname||d.label);
  if(file==='/proc/cpuinfo')return 'processor : Veyra Virtual CPU\ncores : '+p.cpu;
  if(file==='/proc/meminfo')return 'MemTotal: '+p.ramGB+' GB';
  return 'Datei im virtuellen System nicht vorhanden; help system';
 }
 if(cmd==='poweroff'||cmd==='halt'||cmd==='shutdown'){
  C.setPower(id,false);return 'Virtueller Shutdown · Gerät offline';
 }
 if(cmd==='reboot'){
  C.setPower(id,false);C.setPower(id,true);
  return 'Virtuelles System neu gestartet · Gerät online';
 }
 return 'Unbekannter Befehl: '+safe(cmd)+'\nTippe help für unterstützte virtuelle Befehle.';
}
window.VeyraTerminal={execute,parse,help,profile,pbits,cidr,setIpv4:ipSet};
console.info('Veyra Terminal v0.5 loaded: real virtual-device config, no shell execution.');
})();
