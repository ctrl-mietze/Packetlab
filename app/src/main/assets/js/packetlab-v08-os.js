/* PacketLab 0.8 · Stateful virtual operating systems & terminal UI
 * All operations touch ONLY JSON inside the virtual .pklab graph. There is
 * no process spawn, socket, exec, eval, Web API network request or real file IO.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,P=PacketLabCore,Old=window.VeyraTerminal;
if(!N||!C||!P||!Old)return;
const S=C.state,find=id=>S.devices.find(d=>d.id===id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prior=Old.execute.bind(Old);
function platform(d){
 const p=P.profileFor(d),os=d.type==='phone'?(p.mobileOs||'Android'):(p.os||'Linux');
 if(d.type==='phone')return os==='iOS'?'ios':'android';
 if(os.toLowerCase().includes('windows'))return 'windows';
 if(os.includes('Cisco IOS'))return 'cisco';
 if(['router','switch','wlc','firewall'].includes(d.type) &&
    os!=='OpenWrt'&&os!=='RouterOS'&&os!=='Linux')return 'cisco';
 return 'linux';
}
function rootFor(os){return os==='windows'?'C:/':'/'}
function initialCwd(os){return os==='windows'?'C:/Users/Public':
 os==='android'?'/sdcard':os==='ios'?'/var/mobile/Documents':
 os==='cisco'?'/nvram':'/home/labuser'}
const FOLDERS={
 linux:['/','/home','/home/labuser','/etc','/var','/var/log','/tmp','/proc','/usr','/usr/bin'],
 windows:['C:/','C:/Users','C:/Users/Public','C:/Windows','C:/Windows/System32','C:/Windows/System32/drivers','C:/Windows/System32/drivers/etc','C:/Temp'],
 android:['/','/sdcard','/sdcard/Download','/system','/system/etc','/data','/data/local','/data/local/tmp','/proc','/storage','/storage/emulated'],
 ios:['/','/System','/System/Library','/var','/var/mobile','/var/mobile/Documents','/private','/private/var'],
 cisco:['/','/nvram','/flash']
};
function ensure(d){
 const p=d.vprofile||(d.vprofile=P.sanitizeProfile({},d)),os=platform(d);
 if(!p.virtualOSProfiles||typeof p.virtualOSProfiles!=='object')
    p.virtualOSProfiles={};
 if(p.virtualOS?.schema===1&&p.virtualOS.platform!==os)
    p.virtualOSProfiles[p.virtualOS.platform]=p.virtualOS;
 if(!p.virtualOS||p.virtualOS.schema!==1||p.virtualOS.platform!==os){
   const saved=p.virtualOSProfiles[os];
   if(saved?.schema===1&&saved.platform===os)p.virtualOS=saved;
   else{
   const files={};
   if(os==='linux'){
    files['/home/labuser/README.txt']='Veyra Virtual Linux\nCommands: help, ls, cat, ip addr, services, mkdir, touch, echo > file\n';
    files['/etc/issue']='PacketLab Virtual Linux 1.0 — educational simulation\n';
   } else if(os==='windows'){
    files['C:/Users/Public/README.txt']='PacketLab Virtual Windows\nCommands: help, dir, type, ipconfig, tasklist, netstat\n';
   }else if(os==='android'){
    files['/sdcard/README.txt']='PacketLab Virtual Android\nThis is not the host Android filesystem.\n';
   }else if(os==='ios'){
    files['/var/mobile/Documents/README.txt']='PacketLab Virtual iOS\nThis is an isolated device model.\n';
   }else{
    files['/flash/README.txt']='Virtual Cisco IOS CLI — show version, show run, config terminal, copy run start\n';
   }
   p.virtualOS={schema:1,platform:os,cwd:initialCwd(os),files,
     dirs:FOLDERS[os].slice(),env:{},settings:{},packages:os==='android'?
       ['android','com.android.settings','com.android.systemui','com.google.android.webview']:
       os==='ios'?['com.apple.Preferences','com.apple.mobilesafari']:[],executions:0};
   }
 }
 const v=p.virtualOS;
 if(!v.files||typeof v.files!=='object'||Array.isArray(v.files))v.files={};
 if(!Array.isArray(v.dirs))v.dirs=FOLDERS[os].slice();
 if(!v.settings||typeof v.settings!=='object')v.settings={};
 if(!Array.isArray(v.packages))v.packages=[];
 return v;
}
function home(d){return initialCwd(platform(d))}
function canonical(v,arg){
 let path=String(arg||'').replace(/\\/g,'/');
 if(!path||path==='.')return v.cwd;
 if(v.platform==='windows'){
   if(/^[a-z]:/i.test(path)){path=path[0].toUpperCase()+path.slice(1)}
   else path=v.cwd.replace(/\/$/,'')+'/'+path;
 }else if(!path.startsWith('/'))path=v.cwd.replace(/\/$/,'')+'/'+path;
 const prefix=v.platform==='windows'?'C:':'';
 const segments=path.replace(/^[A-Z]:/,'').split('/'),out=[];
 for(const x of segments){if(!x||x==='.')continue;if(x==='..')out.pop();else out.push(x)}
 return prefix+'/'+out.join('/');
}
function dirExists(v,p){return v.dirs.includes(p)||p===rootFor(v.platform)}
function parentPath(p){
 const idx=p.lastIndexOf('/');
 return idx<=0?(p.startsWith('C:')?'C:/':'/'):p.slice(0,idx);
}
function persist(d,summary,cb){
 C.pushHistory();const v=ensure(d);cb(v);v.executions=Math.min(999999,(v.executions||0)+1);
 P.createEvent(N.lab,S.devices,d.label+': '+summary,'system',[d.id]);C.refresh();
 return summary;
}
function args(line){
 const out=[];const re=/"([^"]*)"|'([^']*)'|([^\s]+)/g;let m;
 while((m=re.exec(line))!==null)out.push(m[1]??m[2]??m[3]);
 return out.slice(0,24);
}
function dynamic(d,os,path){
 const p=P.profileFor(d);
 if(os==='linux'){
   if(path==='/etc/hostname')return p.hostname||d.label;
   if(path==='/etc/resolv.conf')return 'nameserver '+(p.dnsServer||'0.0.0.0')+'\n';
   if(path==='/proc/uptime')return String(p.uptime||0)+' 0\n';
   if(path==='/var/log/network.log')return (p.logs||[]).slice(-20).map(x=>x.time+' '+x.text).join('\n');
 }else if(os==='android'){
   if(path==='/system/build.prop')return 'ro.product.model='+d.label+'\nro.product.manufacturer=Veyra Virtual\nro.build.version.release=Model\n';
   if(path==='/proc/net/route')return 'Iface Destination Gateway\nwlan0 00000000 '+(p.gateway||'—');
 }else if(os==='windows'){
   if(path.toLowerCase()==='c:/windows/system32/drivers/etc/hosts')return '127.0.0.1 localhost\n::1 localhost\n';
 }else if(os==='cisco'){
   if(path==='/nvram/startup-config')return p.virtualOS?.startupConfig||'% No startup configuration';
 }
 return undefined;
}
function listing(v,path,long=false){
 if(!dirExists(v,path))return 'Verzeichnis nicht gefunden: '+path;
 const start=path.endsWith('/')?path:path+'/',names=new Map();
 const add=(p,type)=>{
   if(!p.startsWith(start)||p===path)return;
   const tail=p.slice(start.length).split('/')[0];
   if(tail)names.set(tail,type);
 };
 v.dirs.forEach(p=>add(p,'dir'));
 Object.keys(v.files).forEach(p=>add(p,'file'));
 if(!names.size)return '(leer)';
 return [...names].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,type])=>
    long?(type==='dir'?'drwxr-xr-x':'-rw-r--r--')+'  labuser  '+name+(type==='dir'?'/':''):
    name+(type==='dir'?'/':'')).join('\n');
}
function serviceTable(d){
 const p=P.profileFor(d);
 const built={dns:!!p.dnsEnabled,dhcp:!!p.dhcpServer,
  firewall:!!p.firewallEnabled,...(p.enabledServices||{})};
 return Object.entries(built).sort().map(([n,on])=>n.padEnd(12)+(on?'running':'stopped')).join('\n')||'No modeled services';
}
function programs(d){
 const os=platform(d),services=P.profileFor(d).enabledServices||{};
 const list=os==='windows'?['System 4','services.exe 460','explorer.exe 850','conhost.exe 900']:
   os==='android'?['init 1','system_server 245','surfaceflinger 345','adbd 512']:
   os==='ios'?['launchd 1','SpringBoard 161','backboardd 167']:
   os==='cisco'?['IOS scheduler 1','Routing table 2']:
   ['systemd 1','sshd 140','networkd 202','packetlab-terminal 460'];
 Object.keys(services).filter(k=>services[k]).forEach(k=>list.push(k+' 1000'));
 return (os==='windows'?'Image Name                 PID\n':'USER       PID  COMMAND\n')+list.join('\n');
}
function help(d){
 const os=platform(d);
 const basic='Virtual '+os.toUpperCase()+' (offline device model)\nNo host commands are executed.\n';
 const shell='help, ls/dir, pwd/cd, mkdir, touch, cat/type, echo text > filename, rm/del, cp/copy, mv/move, stat, df, ps/tasklist, services\n';
 const net='ip addr, ip route, ping, traceroute/tracert, nslookup, DNS/firewall/servicetools\n';
 if(os==='cisco')return basic+'show version, show running-config, show ip route, show interfaces, show vlan brief, configure terminal, interface GigabitEthernet0/0, ip address A.B.C.D MASK, copy running-config startup-config\n'+shell;
 if(os==='windows')return basic+'ipconfig /all, route print, tracert, netstat -ano, tasklist, Get-Service, Start-Service <name>, Stop-Service <name>, Get-NetIPConfiguration, dir, type, cd, mkdir, del, copy, move\n'+shell;
 if(os==='android')return basic+'getprop, pm list packages, settings list global, settings put global <key> <value>, su -c id (crazy mode), ip addr, ip route\n'+shell+net;
 if(os==='ios')return basic+'ifconfig, scutil --dns, netstat -rn, sysctl -a, defaults read, ls, cat, networksetup\n'+shell+net;
 return basic+shell+net+'systemctl start|stop|status <service>, journalctl, ss, dig, traceroute, ip link\n';
}
function virtualExec(id,raw){
 const d=find(id);if(!d)return 'Gerät nicht gefunden';
 const line=String(raw??'').trim();
 if(!line)return '';
 if(line.length>420||/[\x00-\x08\x0b-\x1f]/.test(line))return 'Befehl zu lang oder Steuerzeichen enthalten.';
 if(/(;|&&|\|\||\||\x60|\$\(|\$\{|<)/.test(line))return 'Verkettete Shell-Kommandos sind nicht Teil der Simulation.';
 const os=platform(d),v=ensure(d),a=args(line),cmd=a[0]?.toLowerCase();
 v.executions=Math.min(999999,(v.executions||0)+1);
 if(['help','?','help os','os help','help platform'].includes(line.toLowerCase()))return help(d);
 if(cmd==='clear'||cmd==='cls')return 'CLEAR';
 if(['exit','logout'].includes(cmd)&&os!=='cisco')return 'CLOSE';
 const ps=P.profileFor(d);
 if(cmd==='pwd')return v.cwd;
 if(cmd==='cd'||cmd==='chdir'){
   if(!a[1])return v.cwd;
   const next=canonical(v,a[1]);
   if(!dirExists(v,next))return 'Verzeichnis existiert nicht: '+next;
   v.cwd=next;return v.cwd;
 }
 if(['ls','dir'].includes(cmd)){
   const target=a.slice(1).find(x=>!x.startsWith('-'));
   return listing(v,canonical(v,target),a.some(x=>x.includes('l')));
 }
 if(['mkdir','md'].includes(cmd)){
   const names=a.slice(1).filter(x=>x!=='-p');
   if(!names.length)return 'Syntax: mkdir <Verzeichnis>';
   return persist(d,'Virtuelles Verzeichnis angelegt',v=>{
     for(const p of names){
       const f=canonical(v,p),parent=parentPath(f);
       if(!dirExists(v,parent)&&!a.includes('-p'))continue;
       if(!v.dirs.includes(f)&&v.dirs.length<180)v.dirs.push(f);
     }
   });
 }
 if(['touch','new-item'].includes(cmd)){
   if(!a[1])return 'Syntax: touch <Datei>';
   const f=canonical(v,a[a.length-1]);
   if(!dirExists(v,parentPath(f)))return 'Elternverzeichnis fehlt';
   if(Object.keys(v.files).length>=250&&!Object.prototype.hasOwnProperty.call(v.files,f))
     return 'Virtuelles Dateilimit erreicht';
   return persist(d,'Datei erstellt: '+f,v=>{v.files[f]=v.files[f]??''});
 }
 if(['cat','type','more','Get-Content'.toLowerCase()].includes(cmd)){
   if(!a[1])return 'Syntax: '+cmd+' <Datei>';
   const name=canonical(v,a.slice(1).filter(x=>!x.startsWith('-')).at(-1));
   const value=dynamic(d,os,name)??v.files[name];
   return value===undefined?'Datei existiert nicht: '+name:String(value).slice(0,9000);
 }
 if(cmd==='echo'&&line.includes('>')){
   const m=/^echo\s+(.+?)\s*>\s*(.+)$/.exec(line);
   if(!m)return 'Syntax: echo text > filename';
   let text=m[1].replace(/^["']|["']$/g,'').slice(0,2048),
     f=canonical(v,m[2].trim());
   if(!dirExists(v,parentPath(f)))return 'Elternverzeichnis fehlt: '+parentPath(f);
   if(Object.keys(v.files).length>=250&&!Object.prototype.hasOwnProperty.call(v.files,f))
     return 'Virtuelles Dateilimit erreicht';
   return persist(d,'Datei geschrieben: '+f,v=>v.files[f]=text+'\n');
 }
 if(['rm','del','erase','remove-item'].includes(cmd)){
   if(!a[1])return 'Syntax: '+cmd+' <Datei>';
   const f=canonical(v,a.at(-1));
   if(!Object.prototype.hasOwnProperty.call(v.files,f))return 'Keine virtuelle Datei: '+f;
   return persist(d,'Datei gelöscht: '+f,v=>delete v.files[f]);
 }
 if(os==='cisco'&&line.toLowerCase()==='copy running-config startup-config')
   return persist(d,'Startup-Konfiguration im virtuellen NVRAM gespeichert',v=>{
     v.startupConfig=prior(id,'show running-config');
   });
 if(['cp','copy','mv','move'].includes(cmd)){
   if(a.length<3)return 'Syntax: '+cmd+' <Quelle> <Ziel>';
   const from=canonical(v,a[1]),to=canonical(v,a[2]);
   if(!Object.prototype.hasOwnProperty.call(v.files,from))return 'Quelle nicht vorhanden';
   if(!dirExists(v,parentPath(to)))return 'Zielverzeichnis nicht vorhanden';
   return persist(d,'Virtuelle Datei '+(cmd==='mv'||cmd==='move'?'verschoben':'kopiert'),v=>{
     v.files[to]=v.files[from];if(cmd==='mv'||cmd==='move')delete v.files[from];
   });
 }
 if(cmd==='stat'){
   const f=canonical(v,a[1]),file=v.files[f]??dynamic(d,os,f);
   return file===undefined?'Keine virtuelle Datei: '+f:
      f+'\nType: file\nSize: '+new TextEncoder().encode(String(file)).length+' Bytes\nStorage: device-only';
 }
 if(cmd==='df')return 'Filesystem    Size  Used  Available\n/dev/virtual   '+ps.storageGB+'G  (simuliert)';
 if(['ps','tasklist'].includes(cmd))return programs(d);
 if(['services','get-service'].includes(cmd))return serviceTable(d);
 if(cmd==='systemctl'||cmd==='start-service'||cmd==='stop-service'){
   const type=cmd==='systemctl'?a[1]?.toLowerCase():
     cmd==='start-service'?'start':'stop';
   const target=(cmd==='systemctl'?a[2]:a[1])?.toLowerCase().replace(/\.service$/,'');
   if(type==='list-units'||type==='list-unit-files'||type==='status'&&!target)return serviceTable(d);
   if(type==='status'){
     return target+': '+(ps.enabledServices?.[target]?'active (running)':'inactive (dead)');
   }
   if(!target||!['start','stop','enable','disable'].includes(type))return 'systemctl start|stop|status <virtual-service>';
   if(!/^[a-z][\w-]{0,35}$/.test(target))return 'Ungültiger Dienstname';
   const on=type==='start'||type==='enable';
   return persist(d,target+' '+(on?'gestartet':'gestoppt'),v=>{
     const p=d.vprofile;p.enabledServices=p.enabledServices||{};
     p.enabledServices[target]=on;
     if(target==='dns')p.dnsEnabled=on;
     if(target==='dhcp')p.dhcpServer=on;
   });
 }
 if(cmd==='journalctl')return (ps.logs||[]).slice(-35).map(e=>e.time+' '+e.type+' '+e.text).join('\n')||'Keine virtuellen Logeinträge';
 if(os==='windows'){
   if(line.toLowerCase()==='get-netipconfiguration')return prior(id,'ipconfig /all');
   if(line.toLowerCase()==='get-process')return programs(d);
   if(cmd==='ver')return 'PacketLab Virtual Windows [Version 10.0 (model)]';
   if(cmd==='whoami')return 'PACKETLAB\\labuser (virtual)';
   if(cmd==='hostname')return ps.hostname||d.label;
   if(cmd==='tracert')return prior(id,'traceroute '+a.slice(1).join(' '));
 }
 if(os==='android'){
   if(cmd==='pm'&&a[1]==='list'&&a[2]==='packages')
     return v.packages.map(x=>'package:'+x).join('\n');
   if(cmd==='pm'&&a[1]==='install'){
     const file=canonical(v,a[2]),name=a[2]?.split('/').at(-1)?.replace(/\.apk$/i,'');
     if(!file.endsWith('.apk')||!v.files[file])return 'INSTALL_FAILED_INVALID_APK: virtuelle APK-Datei fehlt';
     if(!/^[A-Za-z][A-Za-z0-9._-]{0,55}$/.test(name))return 'Ungültiger Paketname';
     return persist(d,'Virtuelle APK installiert: '+name,v=>{if(!v.packages.includes(name))v.packages.push(name)});
   }
   if(cmd==='settings'){
     if(a[1]==='list')return Object.entries(v.settings).map(([k,val])=>k+'='+val).join('\n')||'Keine overrides';
     if(a[1]==='get')return String(v.settings[a[3]]??'null');
     if(a[1]==='put'){
       const key=a[3],val=a.slice(4).join(' ');
       if(!/^[\w.]{1,45}$/.test(key)||!val)return 'Syntax: settings put global <key> <value>';
       return persist(d,'Android settings: '+key,v=>v.settings[key]=val.slice(0,100));
     }
   }
 }
 if(os==='ios'){
   if(line==='sysctl -a')return 'kern.osrelease: virtual\nhw.memsize: '+Math.round(ps.ramGB*1073741824)+
      '\nhw.model: '+d.label+'\nnet.inet.ip.forwarding: '+(ps.repeater?'1':'0');
   if(cmd==='defaults'&&a[1]==='read')
     return Object.entries(v.settings).map(([key,val])=>key+' = '+val).join('\n')||'No custom preferences';
   if(cmd==='networksetup')return 'Virtual en0: '+ps.ipv4+' mask '+ps.subnet+' gateway '+(ps.gateway||'—');
 }
 if(os==='cisco'){
   if(line.toLowerCase()==='show version')
     return 'Veyra IOS Simulation 15.x (educational model)\n'+d.label+' · '+d.type+
       '\nUptime '+ps.uptime+'s · '+ps.ramGB+' GiB RAM\nThis is NOT Cisco firmware.';
   if(line.toLowerCase()==='show inventory')
     return 'NAME: "'+d.label+'", DESCR: "Virtual '+d.type+'"\nPID: PACKETLAB-'+d.type.toUpperCase();
   if(line.toLowerCase()==='copy running-config startup-config'||line.toLowerCase()==='write mem'){
     return persist(d,'Startup-Konfiguration in virtuellem NVRAM gespeichert',v=>{
       d.vprofile.virtualOS.startupConfig=prior(id,'show running-config');
     });
   }
   if(cmd==='show'&&a[1]==='startup-config')
     return v.startupConfig||'% No startup configuration';
 }
 // Original virtual network terminal remains authoritative for IP, route,
 // DNS, firewall, ping, DHCP, VLAN and other network-facing commands.
 return prior(id,line);
}
Old.execute=virtualExec;
function suggestions(d){
 const os=platform(d);
 if(os==='windows')return ['help','dir','ipconfig /all','route print','tasklist','Get-Service','tracert 192.168.1.1'];
 if(os==='android')return ['help','ls /sdcard','pm list packages','getprop','settings list global','ip addr','ping 192.168.1.1'];
 if(os==='ios')return ['help','ls','ifconfig','scutil --dns','netstat -rn','sysctl -a'];
 if(os==='cisco')return ['help','show version','show ip interface brief','show running-config','show ip route','show vlan brief'];
 return ['help','ls -la','ip addr','ip route','systemctl list-units','cat /etc/resolv.conf','journalctl'];
}
function terminal(id){
 const d=find(id);if(!d)return;
 const p=P.profileFor(d),os=platform(d),v=ensure(d),history=[];
 let index=0;
 const sym=()=>os==='windows'?v.cwd+'>':
   os==='cisco'?d.label+'#':os==='android'?d.label+':'+v.cwd+' $':
   os==='ios'?d.label+':'+v.cwd+' %':'labuser@'+d.label+':'+v.cwd+'$';
 N.open('Terminal · '+d.label,
   '<div class="v8-terminal" data-v8-terminal="'+esc(id)+'">'+
    '<div class="v8-terminal-head"><span class="v8-terminal-led"></span><div><strong>'+esc(os.toUpperCase())+' · '+esc(d.label)+'</strong>'+
      '<small>Isoliertes virtuelles Betriebssystem · kein Host-Shell-Zugriff</small></div>'+
      '<span class="v8-terminal-uptime">'+esc(p.uptime)+'s</span></div>'+
    '<div class="v8-terminal-tools"><button data-v8term="copy">Ausgabe kopieren</button>'+
     '<button data-v8term="clear">Leeren</button><button data-v8term="device">Gerät</button></div>'+
    '<pre id="v8-terminal-output" class="v8-terminal-output" role="log" aria-live="polite"></pre>'+
    '<div class="v8-terminal-shortcuts">'+suggestions(d).map(cmd=>'<button type="button" data-v8cmd="'+esc(cmd)+'">'+esc(cmd)+'</button>').join('')+'</div>'+
    '<form id="v8-terminal-form" class="v8-terminal-command">'+
     '<span id="v8-terminal-prompt">'+esc(sym())+'</span>'+
     '<input id="v8-terminal-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Befehl eingeben ..." aria-label="Virtueller Befehl">'+
     '<button type="submit">Ausführen</button></form></div>',
   root=>{
     const el=root.querySelector('#v8-terminal-output'),input=root.querySelector('#v8-terminal-input'),
       form=root.querySelector('#v8-terminal-form'),prompt=root.querySelector('#v8-terminal-prompt');
     const header='PacketLab '+os.toUpperCase()+' Virtual Console\n'+
       'Modell: '+d.label+' | IP: '+(p.ipv4||d.ip||'—')+'\n'+
       'Nur virtueller Gerätezustand, keine echte OS-Ausführung.\n'+
       'Tipp: help\n\n';
     el.textContent=header;
     function run(command){
       command=String(command||'').trim();if(!command)return;
       const before=sym(),value=Old.execute(id,command);
       if(value==='CLOSE'){N.close();return}
       if(value==='CLEAR'){el.textContent='';input.value='';return}
       el.textContent+=before+' '+command+'\n'+String(value??'')+'\n\n';
       if(el.textContent.length>45000)el.textContent=el.textContent.slice(-35000);
       el.scrollTop=el.scrollHeight;
       if(history.at(-1)!==command)history.push(command);
       if(history.length>70)history.shift();
       index=history.length;prompt.textContent=sym();input.value='';
       input.focus({preventScroll:true});
     }
     form.onsubmit=e=>{e.preventDefault();run(input.value)};
     input.onkeydown=e=>{
       if((e.key==='ArrowUp'||e.key==='ArrowDown')&&history.length){
         e.preventDefault();index=Math.max(0,Math.min(history.length,index+(e.key==='ArrowUp'?-1:1)));
         input.value=index===history.length?'':history[index];input.setSelectionRange(input.value.length,input.value.length);
       }
     };
     root.querySelectorAll('[data-v8cmd]').forEach(b=>b.onclick=()=>run(b.dataset.v8cmd));
     root.querySelector('[data-v8term="clear"]').onclick=()=>el.textContent=header;
     root.querySelector('[data-v8term="device"]').onclick=()=>window.PacketLabV08?.openDevice(id);
     root.querySelector('[data-v8term="copy"]').onclick=()=>{
       const content=el.textContent;
       const tmp=document.createElement('textarea');tmp.value=content;tmp.style.position='fixed';
       tmp.style.left='-99999px';document.body.append(tmp);tmp.select();
       let success=false;try{success=document.execCommand('copy')}catch(_){}
       tmp.remove();
       window.VeyraRefine?.flash?.(success?'Virtuelles Terminal kopiert':'Zwischenablage nicht verfügbar');
     };
   },'wide');
}
N.terminal=terminal;
const sheet=document.getElementById('pl-sheet');
if(sheet){
 const ob=new MutationObserver(()=>{
   if(sheet.hidden||sheet.querySelector('[data-v8-terminal]'))return;
   if(sheet.querySelector('#pl-terminal-form')&&find(S.selected))
     queueMicrotask(()=>{if(sheet.querySelector('#pl-terminal-form'))terminal(S.selected)});
 });
 ob.observe(sheet,{childList:true,subtree:true});
}
window.PacketLabV08OS={exec:virtualExec,ensure,platform,terminal,help,version:'0.8.0'};
console.info('PacketLab 0.8: stateful virtual OS filesystem, services and terminal ready.');
})();
