/* PacketLab 0.7 · virtual per-device OS CLI compatibility layer.
 * Supports entry-level IOS/Windows/Android/iOS syntax by modifying only
 * the locally simulated profiles. Never executes an actual OS shell.
 */
(()=>{
'use strict';
const terminal=window.VeyraTerminal,C=window.VeyraCore,N=window.VeyraNext,
  P=PacketLabCore,V=window.PacketLabV07;
if(!terminal||!C||!N||!P||!V)return;
const base=terminal.execute.bind(terminal),contexts=new Map();
const device=id=>C.state.devices.find(d=>d.id===id);
const profile=d=>d.vprofile||(d.vprofile=P.sanitizeProfile({},d));
const clean=s=>String(s??'').replace(/\s+/g,' ').trim().slice(0,160);
const update=(d,summary,fn)=>{
 C.pushHistory();fn(profile(d));P.createEvent(N.lab,C.state.devices,d.label+': '+summary,'system',[d.id]);C.refresh();
 return 'OK · '+summary;
};
const running=d=>d.dead?'administratively down':'up';
function reportInterface(d,full=false){
 const p=P.profileFor(d);
 const mode=d.type==='router'?'GigabitEthernet0/0':
   d.type==='switch'?'Vlan1':'Ethernet0';
 return full?
  mode+' is '+running(d)+', protocol '+running(d)+'\n'+
  '  Hardware address '+(d.mac||'—')+'\n'+
  '  Internet address '+(p.ipv4||d.ip||'unassigned')+'/'+(V.maskPrefix(p.subnet))+'\n'+
  '  MTU '+p.mtu+', speed '+p.downloadMbps+' Mbps':
  'Interface                 IP-Address       OK? Method Status\n'+
  mode.padEnd(25)+' '+(p.ipv4||d.ip||'unassigned').padEnd(16)+
  ' YES manual '+(d.dead?'down':'up');
}
function winIpConfig(d,detail){
 const p=P.profileFor(d);
 return 'Windows IP-Konfiguration · Veyra Virtual Windows\n\n'+
 'Ethernet adapter Ethernet:\n'+
 '   Connection-specific DNS Suffix : '+(p.domain||'—')+'\n'+
 '   IPv4 Address. . . . . . . . . . : '+(p.ipv4||d.ip||'—')+'\n'+
 '   Subnet Mask . . . . . . . . . . : '+p.subnet+'\n'+
 '   Default Gateway . . . . . . . : '+(p.gateway||'—')+'\n'+
 (detail?'   Physical Address. . . . . . . : '+(d.mac||'—')+'\n'+
 '   DNS Servers . . . . . . . . . : '+(p.dnsServer||'—')+'\n':'');
}
function androidGetProp(d,key){
 const p=P.profileFor(d);
 const dict={
  'ro.product.model':d.label,'ro.product.manufacturer':'Veyra Virtual',
  'ro.build.version.release':'Android (Simulated)','ro.build.version.sdk':'virtual',
  'persist.sys.rooted':p.rooted?'1':'0',
  'wifi.interface':p.modules?.wifi===false?'disabled':'wlan0',
  'net.dns1':p.dnsServer||'','net.gateway':p.gateway||'',
  'ro.serialno':'VIRTUAL-ONLY','ro.hardware':'packetlab'
 };
 if(!key)return Object.entries(dict).map(([k,v])=>'['+k+']: ['+v+']').join('\n');
 return dict[key]??'Property not modeled';
}
function classify(d){
 const p=P.profileFor(d),os=p.mobileOs||p.os||'';
 if(d.type==='phone')return os==='iOS'?'ios':'android';
 if(/windows/i.test(os))return 'windows';
 if(/cisco ios/i.test(os))return 'ios-router';
 if(['router','switch','firewall','wlc'].includes(d.type)&&!['RouterOS','OpenWrt'].includes(os))
   return 'ios-router';
 return 'linux';
}
terminal.execute=function(id,text){
 const d=device(id),cmd=clean(text);if(!d||!cmd)return base(id,text);
 const lc=cmd.toLowerCase(),kind=classify(d),p=P.profileFor(d);
 if(['help os','os help','help platform'].includes(lc)){
  if(kind==='ios-router')return 'IOS-Modell: show ip interface brief | show interfaces | show running-config | show ip route | show vlan brief | configure terminal | interface GigabitEthernet0/0 | ip address A.B.C.D MASKE | no shutdown | end';
  if(kind==='windows')return 'Windows-Modell: ipconfig /all | route print | netsh interface ipv4 show config | netstat -ano | ping <IP> | nslookup <NAME>';
  if(kind==='android')return 'Android-Modell: getprop [Schlüssel] | ip addr | ip route | ping <IP> | su -c id (nur Crazy Mode + virtuelles Root)';
  if(kind==='ios')return 'iOS-Modell: ifconfig | netstat -rn | scutil --dns | ping <IP>. Keine iOS-Root-/Jailbreak-Funktion.';
  return base(id,'help');
 }
 if(kind==='windows'){
  if(lc.startsWith('ipconfig'))return winIpConfig(d,lc.includes('/all'));
  if(lc==='route print')return 'IPv4 Routentabelle\n0.0.0.0/0 via '+(p.gateway||'—')+
    '\nOn-link '+p.ipv4+'/'+V.maskPrefix(p.subnet)+'\n'+
    p.staticRoutes.map(r=>r.dst+' via '+r.via).join('\n');
  if(lc==='netsh interface ipv4 show config')return winIpConfig(d,true);
  if(lc==='netstat -ano'||lc==='netstat -an'){
    const port={http:80,https:443,ssh:22,dns:53,dhcp:67,smtp:25,imap:143,
      ftp:21,rdp:3389,db:5432};
    return Object.entries(p.enabledServices||{}).filter(([,on])=>on).map(([k])=>
      'TCP  0.0.0.0:'+((port[k]||0)+'').padEnd(6)+' LISTENING · '+k).join('\n')||'Keine aktiven Modell-Dienste';
  }
  if(lc==='hostname')return p.hostname||d.label;
 }
 if(kind==='android'){
  if(lc==='getprop'||lc.startsWith('getprop '))return androidGetProp(d,cmd.split(' ')[1]);
  if(lc==='su'||lc.startsWith('su -c ')){
    if(!V.settings.crazy)return 'su: Crazy Mode ist im PacketLab deaktiviert';
    if(!p.rooted)return 'su: permission denied (virtuelles Gerät nicht gerootet)';
    if(lc==='su'||lc==='su -c id')return 'uid=0(root) gid=0(root) groups=0(root) [PacketLab model]';
    return 'su: nur harmlose virtuelle Diagnosebefehle freigegeben. Kein System-Shell-Zugriff.';
  }
 }
 if(kind==='ios'){
  if(lc==='scutil --dns')return 'iOS Virtual DNS:\nresolver #1\n nameserver[0] : '+(p.dnsServer||'not set');
  if(lc==='netstat -rn')return 'Internet:\nDestination Gateway Flags\n'+
      'default '+(p.gateway||'—')+' UG\n'+p.ipv4+'/'+V.maskPrefix(p.subnet)+' link#1 U';
  if(lc==='ifconfig')return 'en0: flags=8863<UP,BROADCAST,SMART,RUNNING>\n'+
      ' ether '+d.mac+'\n inet '+p.ipv4+' netmask '+p.subnet;
  if(lc==='su'||lc==='jailbreak')return 'iOS-Gerät: Root/Jailbreak wird hier nicht simuliert';
 }
 if(kind==='ios-router'){
  let ctx=contexts.get(id)||'exec';
  if(lc==='enable')return 'Privileged EXEC · virtuelles IOS-Modell';
  if(lc==='configure terminal'||lc==='conf t'||lc==='conf terminal'){
    contexts.set(id,'config');return 'Enter configuration commands, one per line. End with CNTL/Z or end.';
  }
  if(lc==='end'||lc==='write memory'){contexts.delete(id);return 'Configuration retained in the .pklab virtual device.'}
  if(lc==='exit'&&ctx!=='exec'){contexts.set(id,ctx==='config-if'?'config':'exec');
    return 'Exited '+ctx;}
  if(lc.startsWith('interface ')&&(ctx==='config'||ctx==='config-if')){
    contexts.set(id,'config-if');return cmd+' · interface configuration (virtual)';
  }
  if(lc==='show ip interface brief'||lc==='sh ip int br')return reportInterface(d);
  if(lc==='show interfaces'||lc==='show interface')return reportInterface(d,true);
  if(lc==='show vlan brief'){
    return 'VLAN Name               Status    Ports\n'+
      String(p.vlan).padEnd(4)+' default            active    Gi0/0';
  }
  if(lc==='show mac address-table'){
    const records=d.macTable instanceof Map?[...d.macTable.entries()]:[];
    return 'Mac Address Table\n'+(records.length?records.map(([mac,port])=>
      p.vlan+'  '+mac+'   DYNAMIC '+port).join('\n'):'No learned MAC entries');
  }
  if(ctx==='config-if'){
    const ipcmd=/^ip address (\d+\.\d+\.\d+\.\d+) (\d+\.\d+\.\d+\.\d+)$/i.exec(cmd);
    if(ipcmd){
      if(!P.v4(ipcmd[1])||!V.validMask(ipcmd[2]))
        return 'Invalid IPv4 address or contiguous subnet mask';
      return update(d,'IPv4 '+ipcmd[1]+' '+ipcmd[2],q=>{
        q.ipv4=ipcmd[1];q.subnet=ipcmd[2];d.ip=q.ipv4;d.ips=[q.ipv4];
      });
    }
    if(lc==='shutdown'||lc==='no shutdown'){
      const on=lc==='no shutdown';
      C.setPower(id,on);return 'Interface '+(on?'UP':'DOWN')+' (simulation)';
    }
  }
  if(ctx==='config'&&lc.startsWith('hostname '))return base(id,cmd);
  if(ctx==='config'&&lc.startsWith('vlan ')){
    const vlan=Number(cmd.split(' ')[1]);
    if(!Number.isInteger(vlan)||vlan<1||vlan>4094)return 'VLAN must be 1..4094';
    return update(d,'VLAN '+vlan,q=>q.vlan=vlan);
  }
 }
 return base(id,text);
};
console.info('PacketLab 0.7: virtual IOS, Windows, Android and iOS CLI aliases loaded');
})();
