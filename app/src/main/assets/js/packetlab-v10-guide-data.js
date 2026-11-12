/* Net@Lab v2 — curated read-only networking labs.
 * Every topology is a deterministic educational model.
 * Never imports/mutates the current PacketLab network or executes OS commands.
 */
(()=>{
'use strict';
const baseMac={pc:'02:11:22:10:20:01',switch:'02:11:22:10:00:02',
 router:'02:11:22:10:00:01',server:'02:11:22:20:40:01',
 firewall:'02:11:22:30:00:01',phone:'02:11:22:10:30:01',
 ap:'02:11:22:10:00:10',dns:'02:11:22:20:53:01'};
function n(id,type,label,x,y,props={}){
 const fallback={
  pc:{ip:'192.168.10.20',mask:'255.255.255.0',gateway:'192.168.10.1',dns:'192.168.20.53',os:'Linux',services:['SSH Client']},
  switch:{ip:'192.168.10.2',mask:'255.255.255.0',gateway:'192.168.10.1',os:'Switch Layer 2',vlan:'10',services:['Layer-2 Switching']},
  router:{ip:'192.168.10.1',mask:'255.255.255.0',gateway:'',os:'Cisco IOS (Modell)',interfaces:['GigabitEthernet0/0 · 192.168.10.1/24','GigabitEthernet0/1 · 192.168.20.1/24'],routes:['192.168.10.0/24 · direkt','192.168.20.0/24 · direkt']},
  server:{ip:'192.168.20.40',mask:'255.255.255.0',gateway:'192.168.20.1',dns:'192.168.20.53',os:'Linux Server',services:['HTTPS · TCP 443','SSH · TCP 22']},
  firewall:{ip:'192.168.20.1',mask:'255.255.255.0',gateway:'10.0.0.1',os:'Firewall OS (Modell)',interfaces:['WAN 10.0.0.2/30','LAN 192.168.20.1/24'],routes:['192.168.20.0/24 · direkt','0.0.0.0/0 · 10.0.0.1'],firewall:['DENY any (Standard)','ALLOW TCP 443 · WAN → LAN']},
  phone:{ip:'192.168.10.30',mask:'255.255.255.0',gateway:'192.168.10.1',dns:'192.168.20.53',os:'Android (Modell)',services:['WLAN Client']},
  ap:{ip:'192.168.10.10',mask:'255.255.255.0',gateway:'192.168.10.1',os:'Access Point',services:['WLAN SSID: Veyra-Lab']},
  dns:{ip:'192.168.20.53',mask:'255.255.255.0',gateway:'192.168.20.1',os:'Linux DNS',services:['DNS · UDP/TCP 53','A intranet.lab → 192.168.20.40']}
 }[type]||{};
 const obj={id,type,label,x,y,mac:baseMac[type]||'02:11:22:aa:bb:cc',
  ip:'',mask:'',gateway:'',dns:'',vlan:'',ipv6:'',os:type,
  services:[],interfaces:[],routes:[],arp:[],firewall:[],logs:[],...fallback,...props};
 if(!obj.interfaces?.length&&obj.ip)obj.interfaces=['eth0 · '+obj.ip+'/'+prefix(obj.mask)];
 if(!obj.arp?.length&&type==='pc')obj.arp=['192.168.10.1 → '+baseMac.router];
 if(!obj.routes?.length&&obj.gateway)obj.routes=['0.0.0.0/0 via '+obj.gateway];
 if(!obj.logs?.length)obj.logs=['00:01 · Interface verbunden','00:02 · Virtuelle Konfiguration geladen'];
 return obj;
}
function prefix(mask){
 if(!mask)return '?';
 const num=mask.split('.').map(Number);
 if(num.length!==4||num.some(x=>x<0||x>255))return '?';
 return num.map(x=>x.toString(2).padStart(8,'0').replace(/0/g,'').length).reduce((a,b)=>a+b,0);
}
const link=(a,b,kind='ethernet')=>({a,b,kind});
const step=(from,to,title,detail,layer,frame='')=>({from,to,title,detail,layer,frame});
const root=[
 n('pc','pc','PC-1',13,53),
 n('sw','switch','Switch-1',38,53),
 n('rt','router','Router-1',63,53),
 n('srv','server','Server-1',87,53)
];
const defaultEdges=[link('pc','sw'),link('sw','rt'),link('rt','srv')];
const defaultSteps=[
 step('pc','pc','Netzpräfix prüfen','Der Host vergleicht Zieladresse und eigene Subnetzmaske. Die Zieladresse liegt außerhalb des lokalen /24.','Layer 3','Ziel IPv4: 192.168.20.40'),
 step('pc','sw','Frame zum Gateway','Die IPv4 Zieladresse bleibt der Server, die Ethernet Ziel-MAC gehört zum Default Gateway.','Layer 2','MAC: '+baseMac.router),
 step('sw','rt','Switch leitet weiter','Der Switch schaltet im passenden VLAN anhand der MAC-Tabelle.','Layer 2','VLAN 10'),
 step('rt','srv','Router entscheidet','Der Router wählt die Zielroute zu 192.168.20.0/24 und bildet den nächsten Frame.','Layer 3','Next hop: direkt'),
 step('srv','pc','Antwortpfad','Der Server antwortet über sein eigenes Gateway. Auch der Rückweg muss funktionieren.','Layer 3','Antwort 192.168.20.40 → 192.168.10.20')
];
const common={
 title:'Vom Client bis zum Server',
 caption:'PC → Switch → Router → Server · Lehrbeispiel mit zwei IPv4-Subnetzen',
 lesson:'Ein funktionierender Kabelpfad ist nicht automatisch eine gültige Layer-3-Verbindung.',
 commonError:'Gateway fehlt oder liegt außerhalb des lokalen Präfixes.',
 practice:'Vergleiche die IPv4-Adresse von PC-1 mit der Server-Adresse. Welcher Router wird als nächster Hop benötigt?',
 nodes:root,edges:defaultEdges,steps:defaultSteps,focus:'pc',
 commands:['Linux: ip -br address','Linux: ip route show','Windows: ipconfig /all','Cisco: show ip route']
};
function make(type){
 const nodes=root.map(x=>({...x,services:[...x.services],interfaces:[...x.interfaces],
  routes:[...x.routes],arp:[...x.arp],firewall:[...x.firewall],logs:[...x.logs]}));
 const original={...common,nodes,edges:defaultEdges.map(x=>({...x})),steps:defaultSteps.map(x=>({...x}))};
 const pc=nodes[0],sw=nodes[1],router=nodes[2],server=nodes[3];
 switch(type){
  case 'subnet':
   Object.assign(pc,{ip:'192.168.10.42',mask:'255.255.255.224',gateway:'192.168.10.33',
     interfaces:['eth0 · 192.168.10.42/27'],routes:['192.168.10.32/27 · direkt','0.0.0.0/0 via 192.168.10.33']});
   Object.assign(router,{ip:'192.168.10.33',interfaces:['Gi0/0 192.168.10.33/27','Gi0/1 192.168.20.1/24']});
   Object.assign(original,{title:'Subnetting · /27 verständlich',caption:'192.168.10.42/27 · Netz 192.168.10.32 · Broadcast .63',
    lesson:'/27 bedeutet 27 Netzbits und 5 Hostbits. Die Maske ist 255.255.255.224.',
    commonError:'192.168.10.64 wäre nicht mehr Teil dieses /27-Netzes.',
    practice:'Welche Adressen liegen im Hostbereich von 192.168.10.32/27?',
    steps:[
      step('pc','pc','Maske bilden','255.255.255.224 entspricht /27. Blockgröße im vierten Oktett ist 32.','IPv4','11100000'),
      step('pc','rt','Netzgrenze erkennen','192.168.10.42 gehört zu 192.168.10.32/27. Der klassische Hostbereich reicht von .33 bis .62.','IPv4','Netz .32 · Broadcast .63'),
      step('rt','srv','Anderes Subnetz erreichen','Für 192.168.20.40 verwendet der Host sein Gateway 192.168.10.33.','Layer 3','via 192.168.10.33')
    ],commands:['IPv4: 192.168.10.42/27','Maske: 255.255.255.224','Netz: 192.168.10.32','Broadcast: 192.168.10.63']});
   break;
  case 'switch':
   Object.assign(server,{ip:'192.168.10.40',gateway:'192.168.10.1',
     interfaces:['eth0 · 192.168.10.40/24'],routes:['0.0.0.0/0 via 192.168.10.1']});
   original.edges=[link('pc','sw'),link('sw','srv'),link('sw','rt')];
   sw.x=48;server.x=84;router.x=52;router.y=24;
   Object.assign(original,{title:'Ethernet Switching · Layer 2',caption:'PC → Switch → Server · ein gemeinsames VLAN',
    lesson:'Der Switch nutzt gelernte MAC-Adressen für die Portweiterleitung, nicht die IP-Routentabelle.',
    commonError:'Ein zweites VLAN trennt die Broadcast-Domain, auch wenn alle Kabel verbunden sind.',
    focus:'sw',steps:[
      step('pc','sw','Frame empfangen','Der Switch lernt die Quell-MAC von PC-1 am Eingangsport.','Layer 2','Source MAC: '+pc.mac),
      step('sw','srv','Ziel-MAC suchen','Bei bekanntem Ziel wird der Frame nur auf dem zugehörigen Port ausgegeben.','Layer 2','MAC-Tabelle · VLAN 10'),
      step('srv','pc','Antwortframe','Der Server antwortet im selben Layer-2-Segment.','Layer 2','Ethernet Unicast')
    ],commands:['Cisco: show mac address-table','Cisco: show vlan brief','Linux: bridge fdb show']});
   break;
  case 'arp':
   Object.assign(original,make('switch'));
   original.title='ARP und MAC-Adressen';
   original.caption='Host löst die MAC eines lokalen IPv4-Nachbarn auf';
   original.lesson='ARP löst lokale IPv4-Adressen zu MAC-Adressen auf; eine Switch-MAC-Tabelle ist etwas anderes.';
   original.commonError='Bei einem entfernten Ziel wird normalerweise die MAC des Gateways aufgelöst.';
   original.focus='pc';
   original.steps=[
     step('pc','sw','ARP Request','Wer besitzt 192.168.10.40? Der Request wird im lokalen VLAN verbreitet.','ARP','Who has 192.168.10.40?'),
     step('srv','pc','ARP Reply','Der Server beantwortet den Request mit seiner MAC-Adresse.','ARP',server.mac),
     step('pc','srv','Ethernet Unicast','Nach der Auflösung kann ein Unicast-Frame zum Ziel gesendet werden.','Layer 2','MAC-Lookup abgeschlossen')
   ];
   break;
  case 'vlan':
   pc.vlan='10';server.vlan='20';
   Object.assign(server,{ip:'192.168.20.40',gateway:'192.168.20.1'});
   sw.interfaces=['Gi1/0/1 · Access VLAN 10','Gi1/0/2 · Trunk 802.1Q VLAN 10,20'];
   router.interfaces=['Gi0/0.10 · 192.168.10.1/24','Gi0/0.20 · 192.168.20.1/24'];
   Object.assign(original,{title:'VLAN 10 ↔ VLAN 20',caption:'Zwei Broadcast-Domains, bewusst geroutet',
    lesson:'Ein VLAN trennt Layer-2-Broadcast-Domains. Zwischen unterschiedlichen IP-Netzen ist Layer-3-Routing nötig.',
    commonError:'Ein Trunk bedeutet nicht, dass VLANs automatisch miteinander kommunizieren.',
    steps:[
      step('pc','sw','Access VLAN 10','PC-1 sendet untagged über seinen Access-Port; der Switch ordnet den Frame VLAN 10 zu.','802.1Q','Access VLAN 10'),
      step('sw','rt','Trunk zum Router','Der VLAN-Trunk transportiert getaggte Frames.','802.1Q','Tag 10'),
      step('rt','srv','Inter-VLAN-Routing','Der Router wählt das passende Interface für Netz 192.168.20.0/24.','Layer 3','Gi0/0.20'),
    ],commands:['Cisco: show vlan brief','Cisco: show interfaces trunk','Cisco: show ip route']});
   break;
  case 'dhcp':
   Object.assign(server,{ip:'192.168.20.67',services:['DHCP · UDP 67/68','Pool: 192.168.10.100-199'],
    label:'DHCP-Server'});
   original.title='DHCP · Discover bis Acknowledge';
   original.caption='Virtueller Client → DHCP Relay → Server';
   original.lesson='DHCP vergibt Lease-Parameter wie IPv4, Maske, Gateway und DNS. Ein Relay kann Netze überbrücken.';
   original.commonError='Ohne passenden Relay erreicht ein Broadcast-basierter Request den entfernten DHCP-Server gewöhnlich nicht.';
   original.steps=[
    step('pc','sw','Discover','Ein neuer Client sucht einen DHCP-Server.','DHCP','Discover'),
    step('sw','rt','Relay Forward','Der Router leitet die Anfrage mit Netzkontext an einen konfigurierten DHCP-Server.','DHCP','Relay giaddr'),
    step('rt','srv','Offer','Der Server bietet eine Adresse und Lease-Optionen an.','DHCP','Offer 192.168.10.120/24'),
    step('srv','pc','Request und ACK','Der Client fordert die Lease an, danach bestätigt der Server die Zuweisung.','DHCP','Request → ACK')
   ];
   break;
  case 'dns':
   nodes[3]=n('dns','dns','DNS-Server',87,53);
   Object.assign(original,{nodes,title:'DNS · Name zu Adresse',caption:'PC → Resolver → autoritativer DNS-Dienst',
    focus:'dns',lesson:'DNS beantwortet Namensfragen. Ein erfolgreicher Name beweist nicht die Erreichbarkeit des Zieldienstes.',
    commonError:'Ein DNS-Timeout ist nicht dasselbe wie NXDOMAIN.',
    steps:[
     step('pc','rt','DNS-Query','Der Client fragt für intranet.lab einen A-Record beim Resolver an.','DNS','A intranet.lab?'),
     step('rt','dns','Resolver oder Server','Der DNS-Dienst prüft Zone oder Cache.','DNS','Antwort: 192.168.20.40'),
     step('dns','pc','DNS-Reply','Die Adresse wird an den Client zurückgeliefert.','DNS','A = 192.168.20.40')
    ],commands:['Linux: dig A intranet.lab','Linux: resolvectl status','Windows: nslookup intranet.lab']});
   break;
  case 'firewall':{
   const fw=n('fw','firewall','Firewall-1',73,53);
   fw.firewall=['DEFAULT DENY','ALLOW TCP 443 · any → 192.168.20.40/32',
     'DENY TCP 23 · any → any'];
   router.x=55;server.x=90;nodes.splice(3,0,fw);
   original.nodes=nodes;original.edges=[link('pc','sw'),link('sw','rt'),link('rt','fw'),link('fw','srv')];
   Object.assign(original,{title:'Firewall · First Match',caption:'Client → Router → Firewall → Webserver',
    lesson:'Die Firewall kann nur Verkehr prüfen, der tatsächlich durch ihr Interface fließt.',
    commonError:'Eine Host-Firewall auf einem anderen Gerät schützt den Server nicht automatisch.',
    focus:'fw',steps:[
      step('pc','rt','HTTPS-Verbindung','Der Client versucht TCP Port 443 am Webserver zu erreichen.','Layer 4','TCP → 443'),
      step('rt','fw','Paket an Firewall','Die Route führt tatsächlich durch Firewall-1.','Layer 3','Next hop: Firewall'),
      step('fw','fw','Regel prüfen','Die erste passende Regel erlaubt TCP 443 zum Server; sonst greift Default Deny.','Firewall','ALLOW TCP 443'),
      step('fw','srv','Weiterleiten','Nur das erlaubte Paket erreicht den Zielserver.','Layer 3','ACCEPT')
    ],commands:['Firewall: allow tcp 443','Firewall: default deny','Linux: nft list ruleset']});
   break;
  }
  case 'nat':
   Object.assign(router,{interfaces:['LAN: 192.168.10.1/24','WAN: 198.51.100.8/30'],
    routes:['192.168.10.0/24 direkt','0.0.0.0/0 via 198.51.100.9']});
   Object.assign(server,{ip:'203.0.113.20',gateway:'203.0.113.1'});
   original.title='Source NAT / PAT';
   original.caption='Private Client-IP → WAN-Adresse des Routers → externer Testserver';
   original.lesson='PAT kann mehrere private Verbindungen anhand einer übersetzten Adresse und Ports unterscheiden.';
   original.commonError='NAT ersetzt weder Routing noch eine restriktive Firewall.';
   original.steps=[
    step('pc','rt','Privates Quellpaket','Die Quelle lautet 192.168.10.20:52344, das Ziel 203.0.113.20:443.','IPv4','192.168.10.20:52344'),
    step('rt','rt','PAT-Übersetzung','Der Router merkt die Zuordnung und setzt die Quelladresse auf eine WAN-Adresse um.','NAT','198.51.100.8:61234'),
    step('rt','srv','Internet-ähnliches Testnetz','Der Server sieht die öffentliche Testnetzadresse und kann auf die Übersetzung antworten.','Layer 3','203.0.113.20:443'),
    step('srv','pc','Rückübersetzung','Der Router verwendet die gespeicherte Zuordnung für die Antwort.','NAT','→ 192.168.10.20:52344')
   ];
   original.commands=['NAT-Tabelle: 192.168.10.20:52344 → 198.51.100.8:61234','Dokumentations-IP: 203.0.113.20'];
   break;
  case 'ipv6':
   Object.assign(pc,{ipv6:'2001:db8:10::20/64',ip:'',mask:'',gateway:'fe80::1',dns:'2001:db8:20::53',
     interfaces:['eth0 · 2001:db8:10::20/64','eth0 · fe80::20']});
   Object.assign(router,{ipv6:'2001:db8:10::1/64',ip:'',mask:'',interfaces:['Gi0/0 · 2001:db8:10::1/64',
     'Gi0/1 · 2001:db8:20::1/64'],routes:['2001:db8:10::/64 direkt','2001:db8:20::/64 direkt']});
   Object.assign(server,{ipv6:'2001:db8:20::40/64',ip:'',mask:'',gateway:'fe80::1',
     interfaces:['eth0 · 2001:db8:20::40/64']});
   Object.assign(original,{title:'IPv6 · zwei /64 Netze',caption:'2001:db8:10::/64 ↔ 2001:db8:20::/64 · reine Dokumentationsadressen',
    lesson:'IPv6 verwendet Neighbor Discovery über ICMPv6 statt ARP und kennt keinen Broadcast.',
    commonError:'ICMPv6 pauschal zu blockieren kann Neighbor Discovery und Router Advertisements unterbrechen.',
    steps:[
      step('pc','rt','Neighbor Discovery','Der Client ermittelt den nächsten Hop über ICMPv6 Neighbor Solicitation.','ICMPv6','NS → NA'),
      step('rt','rt','IPv6 Route prüfen','Der Router findet ein spezifisches IPv6-Präfix und reduziert das Hop Limit.','Layer 3','2001:db8:20::/64'),
      step('rt','srv','IPv6 Paket weitergeben','Die 128-Bit-Zieladresse bleibt erhalten.','IPv6','2001:db8:20::40'),
      step('srv','pc','Antwort','Der Server nutzt seine passende Rückroute zum ursprünglichen Client.','IPv6','Echo Reply')
    ],commands:['Linux: ip -6 addr','Linux: ip -6 route','Windows: ping -6 2001:db8:20::40']});
   break;
  case 'wifi':{
   nodes.splice(0,2,n('phone','phone','Smartphone-1',14,52),
     n('ap','ap','Access-Point',40,52));
   nodes[2].x=64;nodes[3].x=87;
   original.nodes=nodes;original.edges=[link('phone','ap','wifi'),link('ap','rt'),link('rt','srv')];
   Object.assign(original,{title:'WLAN · Access Point und Client',caption:'Smartphone → WLAN → Access Point → Router → Server',
    focus:'phone',lesson:'Ein Access Point stellt den lokalen Funkzugang bereit. RSSI ist nicht identisch mit Durchsatz.',
    commonError:'Ein Repeater oder zweiter Router kann ungewollt doppelte DHCP-Server und NAT erzeugen.',
    steps:[
      step('phone','ap','WLAN-Verbindung','Das Smartphone ist mit der SSID Veyra-Lab verbunden.','WLAN','RSSI -53 dBm'),
      step('ap','rt','Bridge ins LAN','Der Access Point übergibt den Frame an das kabelgebundene Netz.','Layer 2','VLAN 10'),
      step('rt','srv','Routing','Der Router verbindet das WLAN-Clientnetz mit dem Servernetz.','Layer 3','via 192.168.20.0/24')
    ],commands:['Android: ip addr','Linux: iw dev wlan0 link','Linux: ip route']});
   break;
  }
  case 'server':
  case 'https':
   server.services=['HTTPS · TCP 443 · aktiv','SSH · TCP 22 · aktiv',
     'Datenbank · lokal gebunden'];
   original.title=type==='https'?'HTTPS · Client und Webserver':'Serverdienste im Netz';
   original.caption='Vom Client zum virtuellen Server mit TCP Listener';
   original.lesson='Ein erreichbarer IP-Host garantiert keinen aktiven Serverprozess oder offenen Transportport.';
   original.commonError='Ein Dienst bindet nur an 127.0.0.1 und ist extern nicht erreichbar.';
   original.steps=[
    step('pc','rt','Dienstadresse finden','Nach optionalem DNS-Lookup steht die Server-IP fest.','DNS','192.168.20.40'),
    step('rt','srv','Transportverbindung','Der Client richtet sich an den gewünschten TCP Listener.','TCP','Zielport 443'),
    step('srv','pc','TLS und Antwort','Nach einer erfolgreichen TLS-Aushandlung kann ein HTTPS-Response übertragen werden.','Anwendung','HTTP 200 · Modell')
   ];
   original.commands=['Linux: ss -ltnp','Linux: curl -I https://intranet.lab','Windows: Test-NetConnection -Port 443'];
   break;
  case 'linux':
   pc.os='Linux';original.title='Linux Terminal · Netzdiagnose';original.caption='Read-only Interface-Demo: eth0, Route und Resolver';
   original.lesson='Unter Linux sind Interface-Adressen, Routen und DNS-Einstellungen verschiedene Datenquellen.';
   original.focus='pc';original.commands=['ip -br addr','ip route show','ip neigh show','resolvectl status','ss -ltnp'];
   break;
  case 'windows':
   pc.os='Windows 11';original.title='Windows Terminal · Netzdiagnose';original.caption='Read-only Interface-Demo mit IPConfig und PowerShell';
   original.lesson='Windows bietet IPConfig für eine Übersicht und PowerShell für detaillierte Abfragen.';
   original.focus='pc';original.commands=['ipconfig /all','route print','Get-NetIPConfiguration','Get-NetAdapter','Test-NetConnection -Port 443'];
   break;
  case 'cisco':
   original.title='Cisco IOS · virtuelle Routerkonfiguration';
   original.caption='Nur Lernmodell: Interfaces, Routen und show-Befehle';
   original.lesson='Gerätetyp und Konfigurationsmodus bestimmen, welche IOS-Befehle möglich sind.';
   original.focus='rt';original.commands=['show ip interface brief','show running-config',
     'configure terminal','interface GigabitEthernet0/0','show ip route'];
   break;
  case 'security':
   Object.assign(original,make('firewall'));
   original.title='Netzwerksicherheit und Segmentierung';
   original.lesson='Minimale Rechte, Segmentierung und nachvollziehbare Regeln schützen besser als blindes Vertrauen in ein VLAN.';
   break;
  default: break;
 }
 return original;
}
const checks=[
 ['dhcp',/dhcp|lease/i],['dns',/dns|resolver|namensaufl|record/i],
 ['arp',/\barp\b|mac.tabelle|mac lernen|neighbou?r discover/i],
 ['subnet',/subnet|cidr|vlsm|präfixdeleg|netzmaske|netzgrenz/i],
 ['ipv6',/ipv6|slaac|icmpv6|dad\b|dual.stack/i],
 ['vlan',/vlan|trunk|access.port|802\.1q|inter.vlan/i],
 ['nat',/\bnat\b|\bpat\b|portweiterleit|cgnat/i],
 ['firewall',/firewall|portbereich|filterregel|first.match/i],
 ['switch',/switch|spanning.tree|stp\b|rstp|lacp|mac.learning/i],
 ['wifi',/wlan|wi.fi|mesh|repeater|roaming|ssid|wpa/i],
 ['https',/https|http|tls|quic|webserver/i],
 ['linux',/linux|iproute|nmcli|networkmanager|systemd|journalctl|tcpdump|dateisystem|ssh/i],
 ['windows',/windows|powershell|ipconfig/i],
 ['cisco',/cisco|ios.*mode|interface.konfiguration/i],
 ['security',/security|härtung|ids|ips|zero.trust|segmentierung|dmz/i],
 ['server',/server|dienst|ntp|smtp|imap|mail|smb|datenbank|nas/i],
 ['gateway',/gateway|routing|routen|paket|osi|tcp.ip|unicast|icmp|traceroute/i]
];
function topic(chapter){
 const title=chapter?.title||'';
 const category=chapter?.category||'';
 for(const [id,re] of checks){if(re.test(title))return id}
 if(category==='IPv6')return 'ipv6';
 if(category==='IPv4')return 'subnet';
 if(category==='WLAN')return 'wifi';
 if(category==='Switching')return 'switch';
 if(category==='Routing')return 'gateway';
 if(category==='Security')return 'security';
 if(category==='Dienste')return 'server';
 if(category==='Linux')return 'linux';
 if(category==='Windows')return 'windows';
 if(category==='Cisco IOS')return 'cisco';
 return 'gateway';
}
window.NetAtLabV2Scenarios={make,topic,forChapter:x=>make(topic(x)),prefix};
})();
