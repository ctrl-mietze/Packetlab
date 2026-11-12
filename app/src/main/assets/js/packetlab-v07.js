/* PacketLab 0.7 · additive mobile network studio. No real sockets or attacks.
 * Complements the existing TopoLab -> PacketLab 0.6 simulation and menus.
 */
(() => {
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,P=PacketLabCore,E=PacketLabV06;
if(!N||!C||!P||!E){console.error('PacketLab 0.7: dependencies unavailable');return}
const S=C.state,$=id=>document.getElementById(id),dev=id=>S.devices.find(x=>x.id===id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const make=(tag,cls,html)=>{const x=document.createElement(tag);x.className=cls;x.innerHTML=html;return x};
const button=(act,label)=>'<button type="button" class="v07-action" data-v07="'+act+'">'+label+'</button>';
const row=(name,description,action)=>'<button type="button" class="v07-row" data-v07="'+action+'"><div><strong>'+esc(name)+'</strong><small>'+esc(description)+'</small></div><span>›</span></button>';
const say=text=>window.VeyraRefine?.flash?.(text)||console.info('[PacketLab]',text);
const log=(text,kind='system',ids=[])=>P.createEvent(N.lab,S.devices,text,kind,ids);
const ux=window.PacketLabUX={moveArmed:null,version:'0.7.0'};
const settingKey='packetlab-v07-settings';
let settings={crazy:false,compact:true,normalTraffic:true,multiPlace:false};
try{settings={...settings,...JSON.parse(localStorage.getItem(settingKey)||'{}')}}catch(_){}
function saveSettings(){localStorage.setItem(settingKey,JSON.stringify(settings))}
function numIp(ip){return String(ip).split('.').reduce((n,o)=>((n<<8)|Number(o))>>>0,0)}
function maskPrefix(mask){
  if(!P.v4(mask))return -1;
  const n=numIp(mask),inverted=(~n)>>>0;
  if(((inverted&(inverted+1))>>>0)!==0)return -1;
  return (32-inverted.toString(2).replace(/^0+/,'').length);
}
function validMask(mask){return maskPrefix(mask)>=0}
function inside(ip,gateway,mask){return P.v4(ip)&&P.v4(gateway)&&validMask(mask)&&
  ((numIp(ip)&numIp(mask))>>>0)===((numIp(gateway)&numIp(mask))>>>0)}
function deviceProfile(d){
  if(!d.vprofile)d.vprofile=P.sanitizeProfile({},d);
  return d.vprofile;
}
function networkCheck(state,sourceId,targetId,kind='') {
  const a=state.devices.find(x=>x.id===sourceId),b=state.devices.find(x=>x.id===targetId);
  if(!a||!b)return null;
  const ap=P.profileFor(a),bp=P.profileFor(b);
  if(!P.v4(ap.ipv4||a.ip)||!P.v4(bp.ipv4||b.ip))
    return 'IPv4-Adresse fehlt oder ist ungültig – keine IP-Kommunikation';
  if(!validMask(ap.subnet)||!validMask(bp.subnet))
    return 'Ungültige oder fehlende Subnetzmaske';
  if(['0.0.0.0','255.255.255.255'].includes(ap.ipv4)||
     ['0.0.0.0','255.255.255.255'].includes(bp.ipv4))
    return 'Host benötigt eine gültige IPv4-Adresse';
  const localA=inside(ap.ipv4,bp.ipv4,ap.subnet);
  const localB=inside(bp.ipv4,ap.ipv4,bp.subnet);
  const route=P.route(state,a.id,b.id);
  if(!route)return null; // Legacy engine reports physical failures.
  const transitPhones=route.path.slice(1,-1).filter(id=>
    state.devices.find(x=>x.id===id)?.type==='phone');
  for(const id of transitPhones){
    const intermediate=state.devices.find(x=>x.id===id),pr=P.profileFor(intermediate);
    if(!settings.crazy||pr.mobileOs==='iOS'||!pr.rooted||!pr.repeater)
      return intermediate.label+': Repeater-Weiterleitung benötigt Android Root und aktivierten Repeater-Modus';
  }
  const services=P.profileFor(b).enabledServices||{};
  const packetType=kind;
  if(packetType && Object.prototype.hasOwnProperty.call(services,packetType)&&
     services[packetType]===false)
    return b.label+': virtueller '+packetType.toUpperCase()+'-Dienst deaktiviert';
  const routed=route.path.some(id=>{
    const x=state.devices.find(y=>y.id===id);
    return x && id!==a.id && id!==b.id && Topologies.isRouter(x.type);
  });
  if((!localA||!localB)&&!routed)
    return 'Unterschiedliche IPv4-Subnetze: Layer-3-Router fehlt';
  if(!localA&&!Topologies.isRouter(a.type)) {
    if(!P.v4(ap.gateway))return 'Anderes Subnetz: Quellgerät braucht ein Standard-Gateway';
    if(!inside(ap.ipv4,ap.gateway,ap.subnet))
      return 'Default-Gateway liegt nicht im Quellsubnetz';
  }
  if(!localB&&!Topologies.isRouter(b.type)){
    if(!bp.gateway)return 'Zielgerät braucht ein Rückweg-Gateway für fremde Subnetze';
    if(!inside(bp.ipv4,bp.gateway,bp.subnet))
      return 'Ziel-Gateway liegt nicht im Zielsubnetz';
  }
  for(const node of route.path.map(id=>state.devices.find(x=>x.id===id)).filter(Boolean)){
    const p=P.profileFor(node),via=route.linkPath||[];
    const attached=state.links.filter(l=>via.includes(l.id)&&(l.a===node.id||l.b===node.id));
    if(!attached.length)continue;
    const modules=p.modules||{};
    const wired=attached.some(l=>l.medium!=='wifi');
    const wifi=attached.some(l=>l.medium==='wifi');
    if(wired&&modules.ethernet===false&&modules.fiber!==true)
      return node.label+': Ethernet-Modul deaktiviert';
    if(wifi&&modules.wifi===false)
      return node.label+': WLAN-Modul deaktiviert';
  }
  return null;
}
// Required address and real contiguous-netmask checks for every virtual IP flow.
const priorEval=P.evaluate.bind(P),priorSend=P.send.bind(P);
P.evaluate=(state,lab,source,target,type)=>{
  const error=networkCheck(state,source,target,type);
  return error?{ok:false,reason:error}:priorEval(state,lab,source,target,type);
};
P.send=(state,lab,source,target,type,count)=>{
  const error=networkCheck(state,source,target,type);
  if(error){
    log('DROP '+(dev(source)?.label||'?')+' → '+(dev(target)?.label||'?')+': '+error,
        'blocked',[source,target]);
    return {ok:false,reason:error,count:0,delivered:0,dropped:Number(count)||1};
  }
  return priorSend(state,lab,source,target,type,count);
};
function verifyMaskForm(root){
  const el=root.querySelector('[name="subnet"]');
  if(!el)return true;
  if(!validMask(el.value.trim())){
    el.setCustomValidity('Zusammenhängende IPv4-Maske nötig (z. B. 255.255.255.0)');
    el.reportValidity();return false;
  }
  el.setCustomValidity('');
  const ip=root.querySelector('[name="ipv4"]')?.value||'';
  const gw=root.querySelector('[name="gateway"]')?.value||'';
  if(ip&&gw&&!inside(ip,gw,el.value.trim())){
    el.setCustomValidity('Gateway muss innerhalb des konfigurierten Subnetzes liegen');
    el.reportValidity();return false;
  }
  return true;
}
// Prevent invalid masks from being silently accepted in the existing advanced editor.
document.addEventListener('click',ev=>{
  const target=ev.target.closest?.('#pl-sheet [data-action="save"]');
  if(!target||!$('pl-sheet')?.querySelector('[name="subnet"]'))return;
  if(!verifyMaskForm($('pl-sheet'))){ev.preventDefault();ev.stopImmediatePropagation()}
},true);
// Add a subnet field to Easy Edit, retaining all existing edit features.
const editForm=$('editForm');
if(editForm){
  const editor=()=>{
    if(!editForm.querySelector('#v07-ed-subnet') && editForm.querySelector('#edIp')){
      const input=make('label','fld v07-subnet-fld',
        '<span>Subnetzmaske / IPv4</span><input id="v07-ed-subnet" class="mono" required placeholder="255.255.255.0" inputmode="decimal">');
      editForm.querySelector('#edIp').closest('label')?.insertAdjacentElement('afterend',input);
    }
    const d=dev(S.selected),inp=$('v07-ed-subnet');
    if(inp&&d&&!editForm.closest('.modal')?.hidden)inp.value=P.profileFor(d).subnet;
  };
  new MutationObserver(editor).observe($('editModal'),{attributes:true,attributeFilter:['hidden']});
  editor();
  editForm.addEventListener('submit',ev=>{
    const mask=$('v07-ed-subnet')?.value.trim(),d=dev(S.selected);
    if(!d||!mask)return;
    if(!validMask(mask)){ev.preventDefault();ev.stopImmediatePropagation();say('Ungültige Subnetzmaske');return}
    const ip=$('edIp')?.value.trim()||d.ip,gw=$('edGw')?.value.trim();
    if(gw&&!inside(ip,gw,mask)){ev.preventDefault();ev.stopImmediatePropagation();
      say('Gateway und Subnetz stimmen nicht überein');return}
    // The original editor saves the mask AFTER its undo snapshot is captured.
  },true);
}
const deviceModules={
  pc:[['ethernet','Ethernet / RJ45'],['wifi','WLAN-Adapter'],['fiber','Glasfaser-NIC']],
  laptop:[['ethernet','Ethernet-NIC'],['wifi','WLAN-Modul'],['bluetooth','Bluetooth']],
  phone:[['wifi','WLAN-Chipsatz'],['cellular','Mobilfunk-Modem'],['bluetooth','Bluetooth']],
  server:[['ethernet','Ethernet-Port'],['fiber','SFP+ Glasfaser'],['wifi','WLAN-Adapter']],
  nas:[['ethernet','Ethernet-Port'],['fiber','SFP+']],
  router:[['ethernet','Ethernet-Interfaces'],['fiber','SFP-Module'],['wifi','WiFi-Radio'],['serial','Serielles WAN']],
  switch:[['ethernet','RJ45 Switchports'],['fiber','SFP Uplink']],
  ap:[['ethernet','PoE Uplink'],['wifi','WiFi-Radio']],
  firewall:[['ethernet','LAN/WAN-Port'],['fiber','SFP+ Uplink'],['vpn','VPN-Beschleuniger']],
  plc:[['ethernet','Industrie-Ethernet'],['serial','Serielle IO']],
  iot:[['wifi','WiFi-Radio'],['ethernet','Ethernet-NIC']],
  printer:[['ethernet','Ethernet-NIC'],['wifi','WLAN']],
  camera:[['ethernet','PoE Port'],['wifi','WLAN']],
  cloud:[['ethernet','WAN Uplink'],['fiber','Fiber Core']],
  modem:[['ethernet','Ethernet'],['cellular','LTE/5G'],['coax','Koax']],
  wlc:[['ethernet','Management-Uplink'],['wifi','WLAN Controller']],
  vpn:[['ethernet','WAN-Port'],['vpn','VPN-Krypto-Modul']],
  ids:[['ethernet','Monitoring-Port'],['fiber','Fiber TAP']]
};
const serverTypes=new Set(['server','nas','dns','dhcp','ntp','mail','database','hypervisor','loadbalancer','cloud']);
const hostTypes=new Set(['pc','laptop','phone','printer','camera','iot']);
function modulesFor(d) {
  return deviceModules[d.type]||(serverTypes.has(d.type)?deviceModules.server:
    hostTypes.has(d.type)?deviceModules.pc:deviceModules.router);
}
function moduleEnabled(d,key){
  const p=P.profileFor(d);
  if(p.modules&&Object.prototype.hasOwnProperty.call(p.modules,key))return p.modules[key]===true;
  if(key==='ethernet')return d.type!=='phone';
  if(key==='wifi')return ['phone','laptop','ap','wlc','iot'].includes(d.type);
  if(key==='cellular')return d.type==='phone';
  return false;
}
function openModules(id){
  const d=dev(id);if(!d)return;
  const cards=modulesFor(d).map(([key,title])=>
    '<label class="v07-toggle"><span><b>'+esc(title)+'</b><small>'+esc(key.toUpperCase())+
    ' · simuliertes Hardware-Modul</small></span><input type="checkbox" data-v07-module="'+esc(key)+'" '+
    (moduleEnabled(d,key)?'checked':'')+'></label>').join('');
  N.open('Hardware & Module · '+d.label,
    '<p class="v07-help">Module sind gerätespezifisch. Deaktivierte Netzwerkadapter können im Simulator keine passenden Verbindungen übertragen.</p>'+
    '<div class="v07-grid">'+cards+'</div>'+
    '<div class="v07-callout">Physische Adapter und virtuelle Gerätezustände werden in der .pklab-Welt gespeichert. Keine echte Smartphone-Hardware wird verändert.</div>'+
    '<div class="v07-actions">'+button('back-device','Zurück zum Gerät')+button('save-module','Übernehmen')+'</div>',
    root=>{
      root.querySelector('[data-v07="back-device"]').onclick=()=>N.showDeviceActions(id);
      root.querySelector('[data-v07="save-module"]').onclick=()=>{
        const p=deviceProfile(d);p.modules=p.modules||{};
        root.querySelectorAll('[data-v07-module]').forEach(x=>p.modules[x.dataset.v07Module]=x.checked);
        log(d.label+': Hardwaremodule konfiguriert','system',[id]);C.refresh();
        N.showDeviceActions(id);say('Hardware geändert');
      };
    },'wide');
}
const serviceTypes=['http','https','ssh','dns','dhcp','smtp','imap','smb','ntp','ftp','mqtt','rdp','db'];
function openServices(id){
  const d=dev(id);if(!d)return;
  const p=P.profileFor(d),svc=p.enabledServices||{};
  N.open('Dienste & Server · '+d.label,
    '<p class="v07-help">Virtuelle Serverdienste, Ports und Erreichbarkeit. Kein echter Dienst wird auf Android gestartet.</p>'+
    '<div class="v07-grid">'+serviceTypes.map((key)=>{
       const port={http:80,https:443,ssh:22,dns:53,dhcp:67,smtp:25,imap:143,smb:445,
         ntp:123,ftp:21,mqtt:1883,rdp:3389,db:5432}[key];
       return '<label class="v07-toggle"><span><b>'+key.toUpperCase()+'</b><small>Port '+port+'</small></span>'+
         '<input type="checkbox" data-v07-service="'+key+'" '+(svc[key]===true?'checked':'')+'></label>';
    }).join('')+'</div><div class="v07-actions">'+button('back','Zurück')+button('apply','Dienste speichern')+'</div>',
    root=>{
      root.querySelector('[data-v07="back"]').onclick=()=>N.showDeviceActions(id);
      root.querySelector('[data-v07="apply"]').onclick=()=>{
        const fresh=deviceProfile(d);
        fresh.enabledServices=fresh.enabledServices||{};
        root.querySelectorAll('[data-v07-service]').forEach(x=>{
          const k=x.dataset.v07Service;fresh.enabledServices[k]=x.checked;
        });
        fresh.dnsEnabled=!!fresh.enabledServices.dns;
        fresh.dhcpServer=!!fresh.enabledServices.dhcp;
        log(d.label+': Serverdienste geändert','system',[id]);
        C.refresh();N.showDeviceActions(id);say('Dienste gespeichert');
      };
    },'wide');
}
function openSmartphone(id){
  const d=dev(id);if(!d)return;
  const p=deviceProfile(d),os=p.mobileOs==='iOS'?'iOS':'Android';
  const rooted=p.rooted===true && os==='Android',repeater=p.repeater===true;
  N.open('Smartphone · '+d.label,
    '<div class="v07-phone"><span>▢</span><div><b>'+esc(os)+' · '+esc(d.label)+'</b>'+
    '<small>'+esc(d.ip||'Keine IP')+' · '+esc(p.subnet||'Keine Maske')+'</small></div></div>'+
    '<div class="v07-grid"><label class="v07-field">Mobiles Betriebssystem<select id="v07-mobile-os">'+
       '<option value="Android"'+(os==='Android'?' selected':'')+'>Android</option>'+
       '<option value="iOS"'+(os==='iOS'?' selected':'')+'>iOS</option></select></label>'+
       '<label class="v07-field">Virtuelle Plattform<select id="v07-phone-class"><option>Smartphone</option><option>Tablet</option><option>Entwicklergerät</option></select></label></div>'+
    (settings.crazy?'<div class="v07-card"><h3>Crazy Mode · Laborfunktionen</h3>'+
       '<p>Nur im isolierten Netzwerkmodell. Android-Root und ein WiFi-Repeater werden simuliert.</p>'+
       '<label class="v07-toggle"><span><b>Android Root</b><small>Virtuelles Root-Profil freischalten</small></span>'+
       '<input type="checkbox" id="v07-root" '+(rooted?'checked':'')+(os==='iOS'?' disabled':'')+'></label>'+
       '<label class="v07-toggle"><span><b>Repeater-Modus</b><small>Nur mit Android Root und WLAN-Modul</small></span>'+
       '<input type="checkbox" id="v07-repeater" '+(repeater?'checked':'')+(rooted?'':' disabled')+'></label></div>':
       '<div class="v07-callout">Root-/Repeater-Laboroptionen können im Simulatormenü über Crazy Mode aktiviert werden.</div>')+
    '<div class="v07-actions">'+button('back','Zurück')+button('save','Smartphone speichern')+'</div>',
    root=>{
      const select=root.querySelector('#v07-mobile-os');
      const rootBox=root.querySelector('#v07-root'),repeaterBox=root.querySelector('#v07-repeater');
      select.onchange=()=>{
        if(rootBox){rootBox.disabled=select.value!=='Android';if(rootBox.disabled)rootBox.checked=false}
        if(repeaterBox){repeaterBox.disabled=select.value!=='Android'||!rootBox.checked;
          if(repeaterBox.disabled)repeaterBox.checked=false}
      };
      if(rootBox)rootBox.onchange=()=>{
        if(repeaterBox){repeaterBox.disabled=!rootBox.checked;
          if(!rootBox.checked)repeaterBox.checked=false}
      };
      root.querySelector('[data-v07="back"]').onclick=()=>N.showDeviceActions(id);
      root.querySelector('[data-v07="save"]').onclick=()=>{
        p.mobileOs=select.value;p.os=select.value;
        p.rooted=select.value==='Android'&&!!rootBox?.checked;
        p.repeater=p.rooted&&!!repeaterBox?.checked&&moduleEnabled(d,'wifi');
        p.virtualServices={...(p.virtualServices||{}),repeater:p.repeater};
        log(d.label+' '+p.mobileOs+(p.rooted?' · virtuelles Root':'')+
          (p.repeater?' · Repeater-Profil':''),'system',[id]);
        C.refresh();N.showDeviceActions(id);say('Smartphone-Profil aktualisiert');
      };
    },'wide');
}
const originalDeviceMenu=N.showDeviceActions.bind(N);
N.showDeviceActions=function(id){
  originalDeviceMenu(id);
  const d=dev(id),root=$('pl-sheet')?.querySelector('.pl-options');
  if(!root||!d)return;
  const b=(name,title,sub,handler)=>{
    const e=make('button','vr-option v07-device-entry',
      '<span class="v07-device-symbol">◇</span><span><b>'+esc(title)+'</b><small>'+esc(sub)+'</small></span>');
    e.type='button';e.dataset.v07Entry=name;e.onclick=handler;root.append(e);
  };
  b('modules','Hardware & Module','Netzwerkadapter, Funk, SFP und Schnittstellen',()=>openModules(id));
  if(serverTypes.has(d.type)||['router','firewall','dns','dhcp'].includes(d.type))
    b('services','Dienste & Server','HTTP, DNS, DHCP, VPN, Speicher und Protokolle',()=>openServices(id));
  if(d.type==='phone')
    b('phone','Android / iOS & Device Studio','Mobilbetriebssystem und optionale Crazy-Mode-Funktionen',
      ()=>openSmartphone(id));
  b('move','Gerät bewusst verschieben','Danach auf dem Netzplan ziehen; Wischen scrollt sonst nur',()=>{
    ux.moveArmed=d.id;N.close();C.setTool('select');say(d.label+' verschieben: jetzt ziehen');
  });
};

function firewallCommit(id,mutate){
  const d=dev(id);if(!d)return;
  C.pushHistory();
  const p=E.profile(d),fresh=E.sanitizeFirewall(p.fwPolicy);
  mutate(fresh);fresh.hostMode=E.isHost(d);
  p.fwPolicy=E.sanitizeFirewall(fresh);p.firewallEnabled=p.fwPolicy.enabled;
  log(d.label+': Regelwerk aktualisiert ('+p.fwPolicy.rules.length+' Regeln)','security',[id]);
  C.refresh();
}
const actions=['allow','deny','log'],protocols=['any','tcp','udp','icmp','dns','http','https','ssh'];
function openFirewallAdvanced(id){
  const d=dev(id);if(!d)return;
  if(!E.isHost(d)&&!E.isFirewall(d)){say('Dieses Gerät hat keine Paketfilter-Engine');return}
  const p=E.profile(d),fw=E.sanitizeFirewall(p.fwPolicy);
  const options=(items,v)=>items.map(k=>'<option value="'+esc(k)+'"'+(k===v?' selected':'')+'>'+esc(k)+'</option>').join('');
  N.open('Firewall Studio PRO · '+d.label,
    '<div class="v07-hero"><b>Erweiterte Richtlinien</b><small>'+esc(E.isHost(d)?'Software-Firewall nur auf diesem Host':'Netzwerk-Firewall nur auf tatsächlich durchlaufenen Paketpfaden')+'</small></div>'+
    '<div class="v07-grid">'+
    '<label class="v07-field">Aktivierung<select id="v07-fw-enabled">'+options(['on','off'],fw.enabled?'on':'off')+'</select></label>'+
    '<label class="v07-field">Default Policy<select id="v07-fw-policy">'+options(['allow','deny'],fw.policy)+'</select></label>'+
    '<label class="v07-field">Behandlung bei Überlast<select id="v07-fw-mitigation">'+options(['drop','limit','quarantine'],fw.mitigation)+'</select></label>'+
    '<label class="v07-field">Rate Limit (Mbit/s)<input type="number" min="1" max="100000" id="v07-fw-rate" value="'+fw.rateLimitMbps+'"></label>'+
    '<label class="v07-field">Burst (Frames)<input type="number" min="1" max="100000" id="v07-fw-burst" value="'+fw.burstPackets+'"></label></div>'+
    '<div class="v07-grid">'+[
       ['inspection','Deep Inspection'],['strictSpoof','Anti-Spoofing'],
       ['logging','Logging'],['allowEvasion','Evasion nur bei permissiver Policy']
    ].map(([k,name])=>'<label class="v07-toggle"><span><b>'+esc(name)+'</b></span>'+
      '<input type="checkbox" data-v07-fw="'+k+'" '+(fw[k]?'checked':'')+'></label>').join('')+'</div>'+
    '<h3 class="v07-section">Geordnete Firewall-Regeln ('+fw.rules.length+'/80)</h3>'+
    '<p class="v07-help">Erste passende Regel gewinnt. Quelle/Ziel akzeptieren Geräte-ID, IPv4 oder CIDR. Ports: any, 443 oder 8000-9000.</p>'+
    '<div class="v07-rule-list">'+(fw.rules.length?fw.rules.map((r,i)=>
      '<div class="v07-rule"><span class="'+(r.action==='allow'?'v07-green':'v07-red')+'">'+esc(r.action.toUpperCase())+'</span>'+
      '<div><b>'+esc(r.protocol)+' : '+esc(r.port)+'</b><small>'+esc(r.source)+' → '+esc(r.target)+' · '+esc(r.zone)+'</small></div>'+
      '<div class="v07-rule-controls"><button data-v07-up="'+i+'" aria-label="Regel hoch">↑</button>'+
      '<button data-v07-down="'+i+'" aria-label="Regel runter">↓</button>'+
      '<button data-v07-remove="'+i+'" aria-label="Regel löschen">×</button></div></div>').join(''):
      '<p class="v07-help">Noch keine benutzerdefinierten Regeln.</p>')+'</div>'+
    '<h3 class="v07-section">Neue Regel</h3>'+
    '<div class="v07-grid"><label class="v07-field">Aktion<select id="v07-rule-action">'+options(actions,'deny')+'</select></label>'+
      '<label class="v07-field">Protokoll<select id="v07-rule-proto">'+options(protocols,'tcp')+'</select></label>'+
      '<label class="v07-field">Port / Range<input id="v07-rule-port" placeholder="443 / 8000-9000 / any" value="443"></label>'+
      '<label class="v07-field">Zone<select id="v07-rule-zone">'+options(['any','lan','wan'],'any')+'</select></label>'+
      '<label class="v07-field">Quellgerät / CIDR<input id="v07-rule-source" value="any" placeholder="any / 192.168.0.0/24"></label>'+
      '<label class="v07-field">Zielgerät / CIDR<input id="v07-rule-target" value="any" placeholder="any / 10.0.0.0/8"></label></div>'+
    '<div class="v07-actions">'+button('add-rule','Regel hinzufügen')+
     button('save-policy','Richtlinie speichern')+button('go-back','Zurück')+'</div>',
    root=>{
      const value=id=>root.querySelector('#'+id)?.value;
      const current=()=>{
        const x=E.sanitizeFirewall(E.profile(d).fwPolicy);
        x.enabled=value('v07-fw-enabled')==='on';
        x.policy=value('v07-fw-policy');
        x.rateLimitMbps=Number(value('v07-fw-rate'));
        x.burstPackets=Number(value('v07-fw-burst'));
        x.mitigation=value('v07-fw-mitigation');
        root.querySelectorAll('[data-v07-fw]').forEach(c=>x[c.dataset.v07Fw]=c.checked);
        return x;
      };
      const save=()=>firewallCommit(id,old=>Object.assign(old,current()));
      root.querySelector('[data-v07="save-policy"]').onclick=()=>{
        save();say('Richtlinie gespeichert');N.showDeviceActions(id);
      };
      root.querySelector('[data-v07="go-back"]').onclick=()=>N.showDeviceActions(id);
      root.querySelector('[data-v07="add-rule"]').onclick=()=>{
        const port=value('v07-rule-port').trim().toLowerCase();
        const okayPort=port==='any'||/^\d{1,5}$/.test(port)||/^\d{1,5}-\d{1,5}$/.test(port);
        const parts=port.split('-').map(Number);
        if(!okayPort||(port!=='any'&&(parts.some(x=>x>65535)||parts.length===2&&parts[0]>parts[1]))){
          say('Port: any, 0-65535 oder gültiger Bereich');return
        }
        const src=value('v07-rule-source').trim()||'any',dst=value('v07-rule-target').trim()||'any';
        const validAddr=v=>v==='any'||S.devices.some(x=>x.id===v)||P.v4(v)||
          (/^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(v)&&
            P.v4(v.split('/')[0])&&+v.split('/')[1]<=32);
        if(!validAddr(src)||!validAddr(dst)){say('Quelle/Ziel: Geräte-ID, IPv4, CIDR oder any');return}
        if(fw.rules.length>=80){say('Maximal 80 Regeln pro Gerät');return}
        const newRule={action:value('v07-rule-action'),protocol:value('v07-rule-proto'),
          port:port==='any'?'any':port.includes('-')?port:Number(port),
          source:src,target:dst,zone:value('v07-rule-zone')};
        const c=current();c.rules.push(newRule);
        firewallCommit(id,old=>Object.assign(old,c));
        openFirewallAdvanced(id);say('Regel hinzugefügt');
      };
      root.querySelectorAll('[data-v07-remove]').forEach(b=>b.onclick=()=>{
        const c=current();c.rules.splice(+b.dataset.v07Remove,1);
        firewallCommit(id,old=>Object.assign(old,c));openFirewallAdvanced(id);
      });
      for(const key of ['up','down']){
        root.querySelectorAll('[data-v07-'+key+']').forEach(b=>b.onclick=()=>{
          const index=Number(b.dataset['v07'+key[0].toUpperCase()+key.slice(1)]);
          const next=index+(key==='up'?-1:1),c=current();
          if(next<0||next>=c.rules.length)return;
          [c.rules[index],c.rules[next]]=[c.rules[next],c.rules[index]];
          firewallCommit(id,old=>Object.assign(old,c));openFirewallAdvanced(id);
        });
      }
    },'wide');
}
// Keep classic firewall editor AND add professional rule-management.
const priorDevicePro=N.showDeviceActions;
N.showDeviceActions=function(id){
  priorDevicePro(id);
  const d=dev(id),box=$('pl-sheet')?.querySelector('.pl-options');
  if(box&&d&&(E.isHost(d)||E.isFirewall(d))){
    const b=make('button','vr-option v07-device-entry',
      '<span class="v07-device-symbol">◇</span><span><b>Firewall Studio PRO</b>'+
      '<small>CIDR, Portbereiche, Regelreihenfolge, Lastschutz & Logging</small></span>');
    b.type='button';b.onclick=()=>openFirewallAdvanced(id);
    box.append(b);
  }
};

function getFindings(){
  const issues=P.audit(S,N.lab).slice();
  for(const d of S.devices){
    const p=P.profileFor(d);
    if(!validMask(p.subnet))
      issues.push({id:d.id,severity:'error',text:'Keine gültige zusammenhängende IPv4-Subnetzmaske'});
    if(!P.v4(p.ipv4||d.ip)||p.ipv4==='0.0.0.0')
      issues.push({id:d.id,severity:'error',text:'IPv4-Adresse nicht konfiguriert'});
    if(p.gateway && !inside(p.ipv4||d.ip,p.gateway,p.subnet))
      issues.push({id:d.id,severity:'error',text:'Gateway liegt außerhalb des Host-Subnetzes'});
    const collisions=S.devices.filter(x=>x.id!==d.id&&
      (x.vprofile?.ipv4||x.ip)===(p.ipv4||d.ip));
    if(collisions.length)
      issues.push({id:d.id,severity:'error',text:'Doppelte IPv4 mit '+collisions.map(x=>x.label).join(', ')});
    if(p.firewallEnabled&&!p.fwPolicy?.enabled&&E.isHost(d))
      issues.push({id:d.id,severity:'warning',text:'Host-Firewall eingeschaltet, erweiterte Firewall-Policy noch inaktiv'});
    const wire=S.links.filter(l=>l.a===d.id||l.b===d.id);
    if(d.ports&&wire.length>d.ports)
      issues.push({id:d.id,severity:'error',text:'Mehr belegte Ports als physisch verfügbar'});
  }
  return issues;
}
function scoreStats(){
  const devices=S.devices.length,links=S.links.length,logs=N.lab.logs||[];
  const errors=getFindings(),blocked=logs.filter(e=>e.kind==='blocked').length;
  const success=logs.filter(e=>e.kind==='traffic').length;
  return {devices,links,errors,blocked,success,events:logs.length,
    active:S.devices.filter(d=>!d.dead).length,upLinks:S.links.filter(l=>!l.dead).length,
    score:Math.round(S.res?.score||0),
    avgHops:Number(S.stats?.avgHops||0).toFixed(1)};
}
function level(issues){
  const errors=issues.filter(e=>e.severity==='error');
  const warnings=issues.filter(e=>e.severity!=='error');
  return {errors,warnings};
}
function openInspector(id=S.selected||''){
  const stat=scoreStats(),chosen=dev(id);
  const all=S.devices.map(d=>{
    const p=P.profileFor(d),logs=(p.logs||[]);
    return '<button type="button" class="v07-device-tile '+(d.id===id?'active':'')+
      '" data-v07-inspect="'+esc(d.id)+'"><span class="v07-type-badge">'+esc(d.type.toUpperCase())+'</span>'+
      '<b>'+esc(d.label)+'</b><small>'+esc(p.ipv4||d.ip||'Ohne IP')+' /'+maskPrefix(p.subnet)+
      ' · '+(d.dead?'OFFLINE':'ONLINE')+'</small>'+
      '<span class="v07-count">'+logs.length+' Logs</span></button>';
  }).join('');
  const dp=chosen?P.profileFor(chosen):null;
  const entries=dp?.logs?.slice(-60).reverse()||[];
  const deviceErrors=stat.errors.filter(x=>x.id===id);
  N.open('Inspector · Live-Geräte',
    '<div class="v07-hero"><b>Einblicke in alle '+stat.devices+' Geräte</b>'+
    '<small>Netzwerkverhalten, Geräteprotokolle, Schnittstellen und Fehler. Eigene Diagnose statt einer zweiten Analyse-Seite.</small></div>'+
    '<div class="v07-mini-stats"><span><strong>'+stat.active+'/'+stat.devices+'</strong>Online</span>'+
      '<span><strong>'+stat.upLinks+'/'+stat.links+'</strong>Links</span>'+
      '<span><strong>'+stat.events+'</strong>Events</span></div>'+
    '<div class="v07-device-list">'+all+'</div>'+
    (chosen?'<h3 class="v07-section">'+esc(chosen.label)+' · Detail</h3>'+
      '<div class="v07-property-grid">'+[
        ['Typ',chosen.type],['OS',dp.mobileOs||dp.os],['IPv4',dp.ipv4||chosen.ip],
        ['Subnetz',dp.subnet+' /'+maskPrefix(dp.subnet)],
        ['Gateway',dp.gateway||chosen.gateway||'—'],
        ['IPv6',dp.ipv6||'—'],['VLAN',dp.vlan],['Hostname',dp.hostname],
        ['Gesendet',dp.sent+' Pakete'],['Empfangen',dp.received+' Pakete'],
        ['Uptime',dp.uptime+' s'],['Security',dp.security+'/100']
      ].map(([k,v])=>'<div><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+
      (deviceErrors.length?'<div class="v07-issue-wrap">'+deviceErrors.map(x=>
        '<p>⚠ '+esc(x.text)+'</p>').join('')+'</div>':'')+
      '<div class="v07-actions">'+button('inspect-config','Gerätemenü')+
      button('inspect-terminal','Terminal')+button('inspect-modules','Module')+'</div>'+
      '<h3 class="v07-section">Geräteprotokoll · '+entries.length+' letzte Einträge</h3>'+
      '<div class="v07-log-list">'+(entries.length?entries.map(e=>
        '<div><small>'+esc(e.time)+'s · '+esc(e.type)+'</small><p>'+esc(e.text)+'</p></div>').join(''):
        '<div>Keine Ereignisse für dieses Gerät.</div>')+'</div>':
      '<p class="v07-help">Wähle ein Gerät, um seine IP-Konfiguration, Hardware, Fehler und Logs zu sehen.</p>')+
    '<div class="v07-actions">'+button('inspect-refresh','Aktualisieren')+
      button('inspect-analysis','Zur Netzwerkanalyse')+'</div>',
    root=>{
      root.querySelectorAll('[data-v07-inspect]').forEach(b=>b.onclick=()=>openInspector(b.dataset.v07Inspect));
      const active=dev(id);
      if(active){
        root.querySelector('[data-v07="inspect-config"]').onclick=()=>N.showDeviceActions(id);
        root.querySelector('[data-v07="inspect-terminal"]').onclick=()=>N.terminal(id);
        root.querySelector('[data-v07="inspect-modules"]').onclick=()=>openModules(id);
      }
      root.querySelector('[data-v07="inspect-refresh"]').onclick=()=>openInspector(id);
      root.querySelector('[data-v07="inspect-analysis"]').onclick=openAnalysis;
    },'wide');
}
function openAnalysis(){
  const t=scoreStats(),levels=level(t.errors);
  const reco=[];
  if(levels.errors.length)reco.push('Zuerst '+levels.errors.length+' kritische Konfigurationsprobleme beheben');
  if(S.res?.score<55)reco.push('Redundante Switch-/Router-Uplinks ergänzen, um Single Points of Failure zu reduzieren');
  if(S.devices.some(d=>!d.dead&&d.vprofile?.security<50))reco.push('Endpoint-Hardening, Patches und Firewall-Regeln prüfen');
  if(S.links.length<S.devices.length-1)reco.push('Netzplan auf unverbundene Inseln und fehlende Kabel prüfen');
  if(!reco.length)reco.push('Keine dringenden Auffälligkeiten; redundante Pfade und Transferkapazität weiter testen');
  const logs=(N.lab.logs||[]).slice(-140),kinds={};
  for(const e of logs)kinds[e.kind]=(kinds[e.kind]||0)+1;
  N.open('Analyse · Network Health',
    '<div class="v07-hero"><b>Fehler finden. Stabilität verbessern.</b>'+
      '<small>Topologie, Ereignisse, Sicherheitszustand und konkrete Handlungsempfehlungen.</small></div>'+
    '<div class="v07-score-line"><strong>'+t.score+'<small>/100</small></strong><div>'+
      '<b>Stabilitätsindex</b><p>Strukturelle Redundanz im Graphmodell, kein Live-Internet-Scan.</p>'+
      '<div class="v07-meter"><i style="width:'+t.score+'%"></i></div></div></div>'+
    '<div class="v07-mini-stats"><span><strong>'+t.devices+'</strong>Geräte</span>'+
      '<span><strong>'+t.links+'</strong>Links</span>'+
      '<span><strong>'+t.avgHops+'</strong>Ø Hops</span>'+
      '<span><strong>'+levels.errors.length+'</strong>Fehler</span>'+
      '<span><strong>'+levels.warnings.length+'</strong>Hinweise</span>'+
      '<span><strong>'+t.blocked+'</strong>Drops</span></div>'+
    '<h3 class="v07-section">Verbesserungsvorschläge</h3>'+
      '<div class="v07-recommendations">'+reco.map((r,i)=>
      '<div><span>'+(i+1)+'</span><p>'+esc(r)+'</p></div>').join('')+'</div>'+
    '<h3 class="v07-section">Diagnose & Fehlersuche ('+t.errors.length+')</h3>'+
    '<div class="v07-issue-wrap">'+(t.errors.length?t.errors.map(x=>
      '<button type="button" class="v07-issue" data-v07-problem="'+esc(x.id)+'">'+
      '<b>'+esc(dev(x.id)?.label||'Netzwerk')+'</b>'+
      '<small>'+esc(x.severity||'Hinweis')+' · '+esc(x.text)+'</small></button>').join(''):
      '<p>Keine offensichtlichen Modellkonfigurationsfehler.</p>')+'</div>'+
    '<h3 class="v07-section">Protokollstatistik · '+logs.length+' Ereignisse</h3>'+
    '<div class="v07-event-stats">'+Object.entries(kinds).sort((a,b)=>b[1]-a[1]).map(([key,value])=>
      '<div><span>'+esc(key)+'</span><div><i style="width:'+Math.max(3,value/Math.max(1,logs.length)*100)+'%"></i></div><b>'+value+'</b></div>').join('')+'</div>'+
    '<div class="v07-actions">'+button('capacity','Pfadkapazität')+
      button('cheapest','Kabeloptimierung')+
      button('logs','Protokolle')+button('refresh','Erneut prüfen')+'</div>',
    root=>{
      root.querySelectorAll('[data-v07-problem]').forEach(b=>b.onclick=()=>openInspector(b.dataset.v07Problem));
      root.querySelector('[data-v07="capacity"]').onclick=()=>{N.close();$('btnFlow')?.click()};
      root.querySelector('[data-v07="cheapest"]').onclick=()=>{N.close();$('btnMst')?.click()};
      root.querySelector('[data-v07="logs"]').onclick=()=>N.runAudit();
      root.querySelector('[data-v07="refresh"]').onclick=openAnalysis;
    },'wide');
}

function openGuide(){
  const modules=[
    ['Grundlagen & Topologien','Bus, Stern, Ring, Baum, Mesh und Hybrid haben unterschiedliche Ausfallpunkte. Redundante Links erhöhen die Pfadvielfalt. Router verbinden verschiedene Layer-3-Netze. Switches lernen MAC-Adressen und leiten Layer-2-Frames.'],
    ['Subnetzmasken & CIDR','Die IPv4-Maske muss aus zusammenhängenden Einsen bestehen: /24 = 255.255.255.0; /25 = 255.255.255.128; /26 = 255.255.255.192; /30 = 255.255.255.252. Netzadresse = IP UND Maske; Broadcast = Netzadresse ODER invertierte Maske.'],
    ['Routing & Gateways','Für Ziele außerhalb des eigenen Subnetzes nutzt ein Host sein Standardgateway. Dieses muss über die lokale IP/Subnetz-Konfiguration erreichbar sein. Statische Routen im virtuellen Terminal werden als Routenmodell gespeichert.'],
    ['Firewall Studio','Policies werden von oben nach unten nach First Match geprüft. Definiere Aktion, Protokoll, Portbereich, Quelle, Ziel und LAN/WAN-Zone. Software-Firewalls gelten nur am Host, dedizierte Firewalls nur auf dem Paketpfad.'],
    ['Kabel & Hardware','Cable ist der universelle Standard. Weitere Medien: RJ45/Cat6, Cat6A, Glasfaser, Koax, WLAN und VPN-Tunnel. Portanzahl, Kabellänge, Module, Datendurchsatz und Latenz werden separat modelliert.'],
    ['Geräteterminal & Betriebssysteme','Die Kommandozeile ist eine virtuelle Interpretation der aktuellen Gerätekonfiguration. Linux-ähnlich: help; ip addr; ip route; ping; arp -a; nmcli device show; systemctl status. Firewall: firewall status; firewall enable; firewall default deny; firewall allow tcp 443; firewall log.'],
    ['Paketkonsole & Logs','Quelle und Ziel wählen, Protokoll und Port setzen und ein oder viele Frames senden. Jeder Sendeversuch prüft den simulierten Pfad und schreibt Geräte- beziehungsweise Netzwerkkonfigurationsereignisse.'],
    ['Netzwerksicherheit','Szenarien wie Portscan, manipulierte Webpakete, IoT-Vorfälle und simulierte Verfügbarkeitstests müssen bewusst gestartet werden. Der Simulator sendet niemals echte Angriffe oder Netzwerkpakete.']
  ];
  N.open('Network Guide · Handbuch',
    '<div class="v07-hero"><b>PacketLab Network Guide</b><small>Netzwerkhandbuch, Fehlerdiagnose und Kommandos – direkt neben dem Topologie-Menü verfügbar.</small></div>'+
    '<div class="v07-guide-list">'+modules.map(([a,b],i)=>
      '<details '+(i===0?'open':'')+'><summary>'+esc(a)+'<span>⌄</span></summary>'+
      '<p>'+esc(b)+'</p></details>').join('')+'</div>'+
    '<h3 class="v07-section">IPv4 Subnetz-Rechner</h3>'+
    '<div class="v07-grid"><label class="v07-field">IPv4 Adresse<input id="v07-calc-ip" value="192.168.1.42"></label>'+
    '<label class="v07-field">Subnetzmaske<input id="v07-calc-mask" value="255.255.255.0"></label></div>'+
    '<div id="v07-calc-result" class="v07-callout">Rechner bereit.</div>'+
    '<div class="v07-actions">'+button('calculate','Berechnen')+
      button('guide-audit','Netzwerk prüfen')+'</div>',
    root=>{
      root.querySelector('[data-v07="calculate"]').onclick=()=>{
        const ip=root.querySelector('#v07-calc-ip').value.trim(),
          mask=root.querySelector('#v07-calc-mask').value.trim(),out=root.querySelector('#v07-calc-result');
        if(!P.v4(ip)||!validMask(mask)){out.textContent='Ungültige IPv4-Adresse oder Subnetzmaske';return}
        const m=numIp(mask),base=(numIp(ip)&m)>>>0,broadcast=(base|((~m)>>>0))>>>0;
        const asIp=n=>[24,16,8,0].map(shift=>(n>>>shift)&255).join('.');
        out.textContent='Netz: '+asIp(base)+'/'+maskPrefix(mask)+' · Broadcast: '+
          asIp(broadcast)+' · Nutzbare Hosts: '+(maskPrefix(mask)<=30?
          Math.max(0,Math.pow(2,32-maskPrefix(mask))-2):maskPrefix(mask)===31?2:1);
      };
      root.querySelector('[data-v07="calculate"]').click();
      root.querySelector('[data-v07="guide-audit"]').onclick=openAnalysis;
    },'wide');
}
const addGuide=()=>{
  const top=$('btnTopoPick')||document.querySelector('#topoBar');
  if(!top)return;
  const guide=make('button','v07-top-guide','<span>▤</span><span>Guide</span>');
  guide.id='v07-guide';guide.type='button';guide.title='Network Guide';
  guide.onclick=openGuide;
  top.insertAdjacentElement('beforebegin',guide);
};
addGuide();

const newPresets=[
 ['empty','Leeres Netzwerk','Vollständig selbst gestalten','◫'],
 ['star','Stern / Star','Switch als Mittelpunkt','✳'],
 ['ring','Ring','Ein geschlossener Backbone','◯'],
 ['tree','Hierarchie / Baum','Core, Distribution, Access','⑂'],
 ['bus','Bus','Gemeinsames Übertragungsmedium','━'],
 ['mesh','Mesh','Mehrere redundante Pfade','✳'],
 ['hybrid','Hybrid','Gemischte Unternehmensnetze','✣'],
 ['office','Büro & Arbeitsplätze','Clients und zentrale Dienste','⌂'],
 ['campus','Campus','Verteilte Gebäude und Access-Netz','▦'],
 ['datacenter','Datacenter','Server, Redundanz und WAN','▤'],
 ['dual','Filialen / WAN','Zwei Standorte und Tunnel','⇄'],
 ['random','Random World','Zufällige Netzwerke und Geräte','✺'],
 ['home','Smart Home','Router, Telefon, IoT und WLAN','⌂'],
 ['dmz','DMZ & Webdienste','Server, Firewall und Clients','⬡'],
 ['industrial','Industrie & OT','SPS, Sensoren, Netzwerksegmente','⚙'],
 ['mobile','Mobile Clients','Laptops, Android/iOS, Access Point','▯'],
 ['branch','Branch Office','Zweigstellen und WAN-Router','◇'],
 ['school','Schulnetz','Arbeitsplätze, WLAN und Server','▦']
];
function buildExtraPreset(key){
  const typeConversions={
    home:['router','ap','phone','iot','camera','pc','laptop','nas'],
    dmz:['firewall','router','server','server','switch','pc','dns','ids','cloud'],
    industrial:['router','switch','plc','plc','iot','camera','firewall','server','pc'],
    mobile:['ap','phone','phone','laptop','laptop','router','server','phone','wlc'],
    branch:['router','switch','pc','laptop','vpn','server','ap','printer','phone'],
    school:['router','switch','switch','pc','pc','laptop','laptop','ap','server','printer','wlc']
  };
  const mapping=typeConversions[key];
  if(!mapping){N.presetBuild(key,key==='random'?24:undefined);return}
  N.presetBuild('hybrid',Math.max(8,mapping.length),{});
  for(let i=0;i<S.devices.length;i++){
    const d=S.devices[i],kind=mapping[i%mapping.length];
    if(!Topologies.TYPES[kind])continue;
    d.type=kind;d.label=Topologies.TYPES[kind].prefix+'-'+(i+1);
    d.ports=Math.max(d.ports||1,Topologies.TYPES[kind].ports||1);
    d.services=Topologies.servicesFor(kind);
    d.vprofile=P.sanitizeProfile({...P.profileFor(d),hostname:d.label,
      os:kind==='phone'?'Android':kind==='router'?'Cisco IOS (Modell)':'Linux'},d);
    if(kind==='phone')d.vprofile.mobileOs='Android';
    if(kind==='server'||kind==='dns')d.vprofile.dnsEnabled=true;
    if(kind==='firewall'){const p=E.profile(d);p.fwPolicy.enabled=true;p.firewallEnabled=true}
  }
  Topologies.fitPorts(S.devices,S.links);
  // Build meaningful star/branch networks, not arbitrary hybrid links that
  // accidentally treat a smartphone as an intermediate router.
  const router=S.devices.find(x=>x.type==='router')||S.devices.find(x=>x.type==='firewall');
  const ap=S.devices.find(x=>x.type==='ap');
  const sw=S.devices.find(x=>x.type==='switch');
  const firewall=S.devices.find(x=>x.type==='firewall');
  const core=router||sw||firewall||ap||S.devices[0];
  const edges=[];
  for(const d of S.devices){
    if(d.id===core.id)continue;
    let via=core;
    if(['phone','laptop','iot','camera'].includes(d.type)&&ap&&d.id!==ap.id)
      via=ap;
    else if(['pc','plc','printer'].includes(d.type)&&sw&&sw.id!==d.id)
      via=sw;
    else if(key==='dmz'&&['server','dns','dhcp'].includes(d.type)&&firewall&&firewall.id!==d.id)
      via=firewall;
    if(via===d)via=core;
    const wireless=via.type==='ap'&&['phone','laptop','iot','camera'].includes(d.type);
    edges.push(Topologies.link(via,d,'line',{medium:wireless?'wifi':'cable'}));
  }
  const linksByPort=new Map();
  for(const e of edges){
    linksByPort.set(e.a,(linksByPort.get(e.a)||0)+1);
    linksByPort.set(e.b,(linksByPort.get(e.b)||0)+1);
  }
  for(const [i,d] of S.devices.entries()){
    d.ports=Math.max(d.ports||1,linksByPort.get(d.id)||1);
    d.ip=d.id===core.id?'192.168.1.1':'192.168.1.'+(i+10);
    d.ips=[d.ip];
    const previous=P.profileFor(d);
    d.vprofile=P.sanitizeProfile({...previous,ipv4:d.ip,
      subnet:'255.255.255.0',gateway:d.id===core.id?'':core.ip,
      mobileOs:d.type==='phone'?'Android':previous.mobileOs},d);
    if(key==='dmz'&&d.type==='server'&&firewall){
      d.ip='192.168.20.'+(i+10);d.ips=[d.ip];
      d.vprofile.ipv4=d.ip;d.vprofile.gateway='192.168.20.1';
    }
  }
  if(key==='dmz'&&firewall)firewall.ips=[firewall.ip,'192.168.20.1'];
  Topologies.fitPorts(S.devices,edges);
  Topologies.recost(S.devices,edges);
  C.replace(S.devices,edges,S.devices.find(x=>x.type==='pc')?.id||S.devices[0]?.id,
    S.devices.find(x=>x.type==='server')?.id||S.devices.at(-1)?.id);
  N.lab.preset=key;
  N.lab.title=newPresets.find(x=>x[0]===key)?.[1]||key;
  log('Preset erstellt: '+N.lab.title,'system');
  C.refresh();
}
function openPresets(){
  const current=N.lab.preset;
  N.open('Netzwerkvorlagen · Presets',
    '<div class="v07-hero"><b>Welches Netzwerk möchtest du bauen?</b>'+
    '<small>Alle bisherigen Vorlagen bleiben erhalten. Neue Vorlagen legen Geräte und physische Links als Startpunkt an; du kannst sie frei bearbeiten.</small></div>'+
    '<label class="v07-field">Gerätezahl für Randomize<select id="v07-preset-size">'+
    '<option value="8">8 · Klein</option><option value="16">16 · Mittel</option>'+
    '<option value="24" selected>24 · Standard</option><option value="40">40 · Mega</option></select></label>'+
    '<div class="v07-preset-grid">'+newPresets.map(([key,name,desc,icon])=>
      '<button type="button" data-v07-preset="'+key+'" class="'+(current===key?'active':'')+'">'+
      '<span>'+esc(icon)+'</span><div><b>'+esc(name)+'</b><small>'+esc(desc)+'</small></div></button>').join('')+'</div>'+
    '<div class="v07-actions">'+button('return-hub','Zurück')+'</div>',
    root=>{
      root.querySelectorAll('[data-v07-preset]').forEach(b=>b.onclick=()=>{
        const key=b.dataset.v07Preset;
        if(key==='random')N.presetBuild('random',Number(root.querySelector('#v07-preset-size').value));
        else buildExtraPreset(key);
        N.close();say('Netzwerk erstellt: '+newPresets.find(x=>x[0]===key)?.[1]);
      });
      root.querySelector('[data-v07="return-hub"]').onclick=openStudio;
    },'wide');
}
function taskTopologyChoice(saved){
  N.open('Aufgabe · Netzwerk auswählen',
    '<div class="v07-hero"><b>Aufgabe gespeichert – welche Topologie?</b>'+
    '<small>Die Aufgabe wird nach dem Aufbau des Netzwerks hinzugefügt. Du kannst das vorhandene Netzwerk behalten oder selbst gestalten.</small></div>'+
    '<div class="v07-preset-grid">'+[
      ['current','Aktuelles Netzwerk','Vorhandene Geräte beibehalten'],
      ['empty','Selbst gestalten','Komplett leerer Canvas'],
      ['star','Stern','Zentrale Switch-Topologie'],
      ['tree','Baum','Hierarchische Struktur'],
      ['ring','Ring','Redundanter Ring'],
      ['mesh','Mesh','Viele alternative Pfade'],
      ['hybrid','Hybrid','Gemischte Topologie'],
      ['office','Büro','Arbeitsplatz-Netzwerk'],
      ['campus','Campus','Großes Lab']
    ].map(([key,name,desc])=>
      '<button data-v07-task-preset="'+key+'" type="button">'+
      '<span>◇</span><div><b>'+name+'</b><small>'+desc+'</small></div></button>').join('')+'</div>'+
    '<div class="v07-actions">'+button('task-cancel','Aufgabe bearbeiten')+'</div>',
    root=>{
      root.querySelectorAll('[data-v07-task-preset]').forEach(b=>b.onclick=()=>{
        const kind=b.dataset.v07TaskPreset;
        if(kind!=='current'){
          N.saveDraft('Vor Lernaufgabe');
          buildExtraPreset(kind);
        }
        const selected=dev(saved.device)||S.devices[0];
        const target=dev(saved.target)||S.devices.find(x=>x.id!==selected?.id);
        const t={id:'task-'+Date.now(),...saved,device:selected?.id||'',
          target:target?.id||'',title:String(saved.title||saved.kind).slice(0,80),
          expected:String(saved.expected||'').slice(0,100),
          instructions:String(saved.instructions||'').slice(0,2000)};
        N.lab.tasks.push(t);
        N.masterPage();say('Aufgabe und Topologie übernommen');
      });
      root.querySelector('[data-v07="task-cancel"]').onclick=()=>N.taskForm();
    },'wide');
}
document.addEventListener('click',e=>{
  const b=e.target.closest?.('#pl-sheet [data-action="submit"]');
  if(!b||!$('pl-sheet')?.querySelector('[name="kind"]'))return;
  const header=$('pl-sheet')?.querySelector('.pl-head strong')?.textContent||'';
  if(!/Neue Aufgabe/.test(header))return; // Editing old tasks stays untouched.
  e.preventDefault();e.stopImmediatePropagation();
  const values={};
  $('pl-sheet').querySelectorAll('[name]').forEach(x=>values[x.name]=x.value);
  if(values.kind==='ipv4'&&values.expected&&!P.v4(values.expected)){
    say('Ungültige IPv4-Solladresse');return
  }
  if(values.kind==='ipv6'&&values.expected&&!P.v6(values.expected)){
    say('Ungültige IPv6-Solladresse');return
  }
  taskTopologyChoice(values);
},true);

function openSecuritySimulation(){
  const scenarios=[
    ['scan','Virtueller Portscan','Wird durch Host- und Firewall-Regeln bewertet'],
    ['malformed','HTTP-Manipulation','Ungewöhnliche HTTP-Frames gegen Zielport 80'],
    ['vuln_dns','DNS-Spoofing','Nur modellierte manipulierte Antwort'],
    ['vuln_flood','Traffic Flood','Virtuelle hohe Paketlast und Rate-Limits'],
    ['vuln_iot','IoT-Botnet','Modellstatus und passende Schutzprüfung'],
    ['vuln_smb','SMB-Wurm','Reine Simulation von Hoststatus und Pfaden']
  ];
  N.open('Simulator · Security Lab',
    '<div class="v07-hero"><b>Sicherheitsversuche nur auf Knopfdruck</b>'+
      '<small>Keine Hintergrundattacken, keine realen Sockets. Die normale Kommunikation zwischen virtuellen Rechnern läuft unabhängig von diesen Tests.</small></div>'+
    '<div class="v07-grid"><label class="v07-field">Quelle<select id="v07-attack-from">'+
      S.devices.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.label)+'</option>').join('')+'</select></label>'+
    '<label class="v07-field">Ziel<select id="v07-attack-to">'+
      S.devices.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.label)+'</option>').join('')+'</select></label></div>'+
    '<div class="v07-preset-grid">'+scenarios.map(([id,name,desc])=>
      '<button type="button" data-v07-scenario="'+id+'"><span>◇</span><div>'+
      '<b>'+esc(name)+'</b><small>'+esc(desc)+'</small></div></button>').join('')+'</div>'+
    '<div class="v07-callout" id="v07-attack-result">Noch kein Szenario gestartet. Firewall- und Geräteprotokolle zeigen spätere Ergebnisse.</div>'+
    '<div class="v07-actions">'+button('classic-attacks','Original-Simulator')+
     button('sec-back','Zurück zum Studio')+'</div>',
    root=>{
      const from=root.querySelector('#v07-attack-from'),to=root.querySelector('#v07-attack-to');
      if(S.src)from.value=S.src;
      if(S.dst&&S.dst!==from.value)to.value=S.dst;
      root.querySelectorAll('[data-v07-scenario]').forEach(btn=>btn.onclick=()=>{
        const k=btn.dataset.v07Scenario;
        if(from.value===to.value){say('Quelle und Ziel müssen verschieden sein');return}
        try{
          const type=P.PACKETS[k];
          const result=E.send(S,N.lab,{source:from.value,target:to.value,
            kind:k,port:type?.port||0,bytes:type?.bytes||512,count:1,zone:'lan',impact:'none'});
          root.querySelector('#v07-attack-result').textContent=esc(k)+': '+(result.ok?
            'Zugestellt ('+result.delivered+' Frames)':'Blockiert – '+result.reason)+
            '. Details im Inspector und der Netzwerkanalyse.';
          C.refresh();
        }catch(err){root.querySelector('#v07-attack-result').textContent=err.message}
      });
      root.querySelector('[data-v07="classic-attacks"]').onclick=()=>N.askAttack();
      root.querySelector('[data-v07="sec-back"]').onclick=openStudio;
    },'wide');
}
function openSettings(){
  N.open('Simulation · Einstellungen',
    '<div class="v07-hero"><b>PacketLab Einstellungen</b>'+
      '<small>Laboreinstellungen gelten nur für das virtuelle Netzwerk.</small></div>'+
    '<label class="v07-toggle"><span><b>Crazy Mode</b>'+
      '<small>Android Root, Repeater und experimentelle Topologien im Simulator erlauben</small></span>'+
      '<input type="checkbox" id="v07-crazy" '+(settings.crazy?'checked':'')+'></label>'+
    '<label class="v07-toggle"><span><b>Serienplatzierung für Geräte</b>'+
      '<small>Wenn aktiv, bleiben PC, Switch oder andere Geräte nach dem ersten Einfügen ausgewählt.</small></span>'+
      '<input type="checkbox" id="v07-multi-place" '+(settings.multiPlace?'checked':'')+'></label>'+
    '<label class="v07-toggle"><span><b>Normale virtuelle Hintergrundkommunikation</b>'+
      '<small>Alle 12 Simulatorsekunden ein ICMP-Heartbeat zwischen erreichbaren Hosts; niemals ein Angriff.</small></span>'+
      '<input type="checkbox" id="v07-normal-traffic" '+(settings.normalTraffic?'checked':'')+'></label>'+
    '<label class="v07-toggle"><span><b>Ausbreitung nur während manueller Sicherheitstests</b>'+
      '<small>Nie im normalen Simulationsbetrieb. Tests müssen im Security Lab ausdrücklich gestartet werden.</small></span>'+
      '<input type="checkbox" id="v07-spread" '+(N.lab.spread?'checked':'')+'></label>'+
    '<div id="v07-settings-result" class="v07-callout">Hintergrundattacken sind standardmäßig ausgeschaltet. Alle externen Netzwerkzugriffe bleiben blockiert.</div>'+
    '<div class="v07-actions">'+button('save-settings','Übernehmen')+
     button('back','Zurück')+'</div>',
    root=>{
      root.querySelector('[data-v07="save-settings"]').onclick=()=>{
        const changed=!settings.crazy&&root.querySelector('#v07-crazy').checked;
        settings.crazy=root.querySelector('#v07-crazy').checked;
        settings.normalTraffic=root.querySelector('#v07-normal-traffic').checked;
        settings.multiPlace=root.querySelector('#v07-multi-place').checked;
        N.lab.spread=root.querySelector('#v07-spread').checked;
        saveSettings();
        if(changed){
          root.querySelector('#v07-settings-result').textContent='Virtuelle Komponenten werden in das Lab-Profil eingebunden …';
          setTimeout(()=>{say('Crazy Mode integriert');openStudio()},750);
        }else{say('Simulator-Einstellungen gespeichert');openStudio()}
      };
      root.querySelector('[data-v07="back"]').onclick=openStudio;
    },'wide');
}
function openStudio(){
  N.open('PacketLab · Studio',
    '<div class="v07-hero"><b>Deine Netzwerk-Werkstatt</b>'+
      '<small>Alle bisherigen Werkzeuge bleiben verfügbar. Netzwerke bauen, lernen, testen und speichern.</small></div>'+
    '<div class="v07-studio-grid">'+
    row('Neues Netzwerk','Leerer Editor mit allen bisherigen Tools','blank')+
    row('Vorlagen & Presets','18 Topologien und Szenario-Netze','presets')+
    row('Learning Mode','Network Master, Aufgaben und Übungen','learning')+
    row('Network Guide','Subnetting, Routing, Firewall und Terminal','guide')+
    row('Security Lab','Manuelle virtuelle Sicherheitsszenarien','security')+
    row('Virtual Simulation','Vorhandener Simulator, Audit und Logs','original')+
    row('Projektverwaltung','Dateien, Entwürfe und gespeicherte Welten','files')+
    row('Einstellungen','Crazy Mode und Simulation','settings')+
    '</div>',
    root=>{
      const act={blank:()=>window.PacketLabV06UI?.confirmNewBlank(),
        presets:openPresets,learning:()=>window.PacketLabV06UI?.learningEntry(),
        guide:openGuide,security:openSecuritySimulation,original:()=>N.simMenu(),
        files:()=>N.filesPage(),settings:openSettings};
      root.querySelectorAll('[data-v07]').forEach(b=>b.onclick=act[b.dataset.v07]||openStudio);
    },'wide');
}
if($('pl-simtool')){
  $('pl-simtool').title='PacketLab Studio';
  $('pl-simtool').setAttribute('aria-label','PacketLab Studio und Simulation');
  $('pl-simtool').onclick=openStudio;
}
const rail=document.querySelector('.v06-action-rail');
if(rail)rail.classList.add('v07-replaced-rail');

// Instant packet send is deliberately independent of accordion expansion.
const sendhead=document.querySelector('.v06-sendhead');
if(sendhead){
  const quick=make('button','v07-quick-send',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">'+
      '<path d="m3 3 18 9-18 9 4-9zM7 12h14"/></svg><span>Senden</span>');
  quick.id='v07-quick-send';quick.type='button';
  quick.title='Aktuell konfigurierte Pakete sofort senden; wiederholtes Tippen erlaubt';
  let sends=0;
  quick.onclick=e=>{
    e.preventDefault();e.stopPropagation();
    const result=window.PacketLabV06UI?.dispatch?.();
    sends++;
    quick.title='Sendevorgänge: '+sends+' · '+(result?.ok?'Zugestellt':result?.reason||'Nicht zugestellt');
    quick.classList.remove('v07-pulse');void quick.offsetWidth;quick.classList.add('v07-pulse');
  };
  sendhead.append(quick);
}
const simButton=$('v06-sim-state');
if(simButton){
  // Dedicated top-right play/stop: no elapsed counter in main screen.
  const actionArea=document.querySelector('.topbar__right');
  if(actionArea)actionArea.prepend(simButton);
  simButton.classList.add('v07-sim-top');
}
const bottomTimer=$('pl-vs');
if(bottomTimer)bottomTimer.hidden=true;
// Moving the status from the packet dock into the toolbar must not destroy the existing listeners.
const stage=document.querySelector('.stage'),canvas=$('canvas');
if(stage&&canvas){
  let lastCount=S.devices.length;
  window.addEventListener('veyra:graphchange',()=>{
    if(S.tool==='add'&&S.addType!=='cable'&&!settings.multiPlace&&S.devices.length>lastCount){
      C.setTool('select');
      say('Gerät platziert. Für weitere Geräte erneut auswählen.');
    }
    lastCount=S.devices.length;
  });
  // Explicit hold-and-drag cable wiring, in addition to the existing two-tap method.
  let from=null;
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch'||!window.VeyraWiring?.active)return;
    const p=C.view.toLocal(e),d=window.VeyraWiring.nearestDevice(p,32);
    if(d)from={id:d.id,x:e.clientX,y:e.clientY,at:performance.now()};
  },false);
  window.addEventListener('pointerup',e=>{
    if(!from)return;
    const hold=from;from=null;
    if(!window.VeyraWiring?.active)return;
    if(performance.now()-hold.at<150||
      Math.hypot(e.clientX-hold.x,e.clientY-hold.y)<18)return;
    const p=C.view.toLocal(e),target=window.VeyraWiring.nearestDevice(p,34);
    if(target&&target.id!==hold.id&&window.VeyraWiring.pendingId===hold.id){
      window.VeyraWiring.selectByTouch(target);
    }
  });
}
// Accidental interactions during a scroll on a touch display must be ignored.
let lastMovedTouch=0,begin=null;
document.addEventListener('touchstart',e=>{
  if(e.touches.length!==1)return;
  const t=e.touches[0];begin={x:t.clientX,y:t.clientY};
},{passive:true,capture:true});
document.addEventListener('touchmove',e=>{
  if(!begin||!e.touches.length)return;
  const t=e.touches[0];
  if(Math.hypot(t.clientX-begin.x,t.clientY-begin.y)>12)lastMovedTouch=Date.now();
},{passive:true,capture:true});
document.addEventListener('click',e=>{
  if(Date.now()-lastMovedTouch>320)return;
  const target=e.target.closest?.('#pl-sheet button, .v-nav button, .v-palette button, .vr-device-tile, .v07-preset-grid button');
  if(target){e.preventDefault();e.stopImmediatePropagation();}
},true);
// Retain the sheet when the user misses a checkbox or scrolls near the edge.
$('pl-mask')?.addEventListener('click',e=>{
  e.preventDefault();e.stopImmediatePropagation();
},true);
// Prevent Android Back from instantly exiting and losing the user's lab.
const previousBack=window.VeyraBack;
window.VeyraBack=function(){
  if(previousBack && previousBack())return true;
  N.open('PacketLab beenden?',
    '<div class="v07-hero"><b>Dein Netzwerk behalten?</b><small>Du kannst die Welt exportieren oder als lokalen Entwurf sichern.</small></div>'+
    '<div class="v07-studio-grid">'+
    row('Als .pklab exportieren','Projektdatei im Android-Downloadordner sichern','exit-export')+
    row('Als Entwurf sichern und beenden','Aktuelle Welt beim nächsten Start behalten','exit-draft')+
    row('Ohne zusätzlichen Export beenden','Autosave bleibt erhalten','exit-quit')+
    row('Zurück ins Netzwerk','App geöffnet lassen','exit-cancel')+'</div>',
    root=>{
      const quit=()=>window.VeyraNative?.finishApp?.();
      root.querySelector('[data-v07="exit-export"]').onclick=()=>{
        N.doSave();
        N.saveDraft('Vor Export');
        say('Export im Downloadordner angefordert. App bleibt geöffnet, damit der Export abgeschlossen werden kann.');
        N.close();
      };
      root.querySelector('[data-v07="exit-draft"]').onclick=()=>{
        N.saveDraft('App beendet');quit();
      };
      root.querySelector('[data-v07="exit-quit"]').onclick=quit;
      root.querySelector('[data-v07="exit-cancel"]').onclick=N.close;
    },'wide');
  return true;
};
document.querySelector('.v-nav')?.addEventListener('click',e=>{
  const tab=e.target.closest?.('[data-tab]')?.dataset.tab;
  if(tab==='inspect'||tab==='analysis'){
    e.preventDefault();e.stopImmediatePropagation();
    if(tab==='inspect')openInspector();else openAnalysis();
  }
},true);
window.PacketLabV07={openGuide,openPresets,openInspector,openAnalysis,
  openStudio,openFirewallAdvanced,openModules,openSmartphone,maskPrefix,
  validMask,inside,networkCheck,settings};
console.info('PacketLab 0.7 Mobile Studio: guide, inspector, analysis, modules, presets and touch additions ready');
})();
