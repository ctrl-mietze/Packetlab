/* PacketLab 0.8 · coherent Android OLED device studio.
 * One renderer owns the full device sheet. Legacy decorating CSS/observers
 * never see its isolated v8 device-row structure.
 * All existing actions remain wired to the original network engine.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,P=window.PacketLabCore||PacketLabCore,
      V=window.PacketLabV07,E=window.PacketLabV06||PacketLabV06;
if(!N||!C||!V||!P||!E)return;
const S=C.state,dev=id=>S.devices.find(x=>x.id===id),escape=s=>String(s??'').replace(/[&<>"']/g,
  c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const path=(...p)=>p.join('');
const DRAW={
  edit:path('<path d="M12 20h9"/><path d="M16.5 3.5a2 2 0 0 1 2.8 2.8L8 17.5 4 18l.5-4z"/>'),
  advanced:path('<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="17" r="2" fill="currentColor" stroke="none"/>'),
  terminal:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 4 3-4 3M13 16h5"/>',
  shield:'<path d="M12 2 20 6v6c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
  fireplus:'<path d="M12 2 20 6v6c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z"/><path d="M12 8v8M8 12h8"/>',
  module:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h4v4H7zM15 10h3M15 14h3M7 3v3M17 3v3M7 18v3M17 18v3"/>',
  server:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M7 8h10M7 13h10M7 18h10"/><path d="M8 8h.1M8 13h.1M8 18h.1"/>',
  mobile:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  logs:'<path d="M6 4h12M6 9h12M6 14h12M6 19h8"/>',
  inspect:'<circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 6 6M7 10h6M10 7v6"/>',
  move:'<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/>',
  power:'<path d="M12 2v10M6 5.5a9 9 0 1 0 12 0"/>',
  delete:'<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/>',
  network:'<circle cx="12" cy="4" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="m11 6-5 11M13 6l5 11M7 19h10"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>'
};
const icon=(which,cl='')=>'<svg class="'+cl+'" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+
   (DRAW[which]||DRAW.info)+'</svg>';
const row=(id,label,detail,glyph,opts={})=>
  '<button type="button" class="v8-action'+(opts.danger?' v8-action-danger':'')+
   '" data-v8-act="'+escape(id)+'" aria-label="'+escape(label)+'">'+
   '<span class="v8-action-icon">'+icon(glyph)+'</span>'+
   '<span class="v8-action-copy"><strong>'+escape(label)+'</strong><small>'+escape(detail)+'</small></span>'+
   icon('chevron','v8-chevron')+'</button>';
const section=(heading,items)=>'<section class="v8-menu-group"><h3>'+escape(heading)+'</h3>'+
  '<div class="v8-menu-rows">'+items.join('')+'</div></section>';
const notice=s=>window.VeyraRefine?.flash?.(s)||console.info(s);
const serverKinds=new Set(['server','nas','dns','dhcp','ntp','mail','database','hypervisor','loadbalancer','cloud']);
const switchKinds=new Set(['switch','hub','wlc','ap']);
function allowedOS(d){
  if(d.type==='phone')return ['Android','iOS'];
  if(switchKinds.has(d.type)||['router','firewall','vpn','ids','modem'].includes(d.type))
    return ['Cisco IOS (Modell)','OpenWrt','RouterOS','Linux'];
  if(serverKinds.has(d.type))return ['Linux','Windows','OpenWrt'];
  return ['Windows','Linux','Android','OpenWrt'];
}
function osName(d){
  const p=P.profileFor(d);
  return d.type==='phone'?(p.mobileOs||'Android'):(p.os||(['router','switch'].includes(d.type)?'Cisco IOS (Modell)':'Linux'));
}
function osPage(id){
 const d=dev(id);if(!d)return;
 const current=osName(d),opts=allowedOS(d);
 N.open('Virtuelles Betriebssystem',
   '<div class="v8-modal-intro"><b>'+escape(d.label)+'</b><p>OS-Auswahl verändert die unterstützten virtuellen Terminalbefehle und die Dateisystemansicht. Es wird kein echtes Betriebssystem gestartet.</p></div>'+
   '<div class="v8-os-choices">'+opts.map(os=>'<label class="v8-os-choice"><span>'+
     escape(os)+'</span><input type="radio" name="v8-os" value="'+escape(os)+'"'+(os===current?' checked':'')+'></label>').join('')+'</div>'+
   '<div class="v8-bottom-actions"><button data-v8="back">Zurück</button><button data-v8="save">Übernehmen</button></div>',
   root=>{
     root.querySelector('[data-v8="back"]').onclick=()=>openDevice(id);
     root.querySelector('[data-v8="save"]').onclick=()=>{
       const chosen=root.querySelector('[name="v8-os"]:checked')?.value;
       if(!chosen)return;
       C.pushHistory();
       const p=d.vprofile||(d.vprofile=P.sanitizeProfile({},d));
       p.os=chosen;if(d.type==='phone'){p.mobileOs=chosen;if(chosen==='iOS'){p.rooted=false;p.repeater=false;}}
       P.createEvent(N.lab,S.devices,d.label+': Virtuelles OS = '+chosen,'system',[d.id]);
       C.refresh();openDevice(id);notice('Virtual OS: '+chosen);
     };
   },'wide');
}
function deleteConfirm(id){
 const d=dev(id);if(!d)return;
 N.open('Gerät löschen?',
   '<div class="v8-delete-prompt">'+icon('delete')+'<strong>'+escape(d.label)+' wirklich entfernen?</strong>'+
   '<p>Dieses Gerät und seine virtuellen Kabel werden entfernt. Über Rückgängig kannst du den Zustand wiederherstellen.</p></div>'+
   '<div class="v8-bottom-actions"><button data-v8="cancel">Abbrechen</button>'+
   '<button class="v8-confirm-danger" data-v8="delete">Gerät löschen</button></div>',
   root=>{
     root.querySelector('[data-v8="cancel"]').onclick=()=>openDevice(id);
     root.querySelector('[data-v8="delete"]').onclick=()=>{
       if(C.removeDevice(id)){N.close();notice('Gerät entfernt · Rückgängig verfügbar');}
     };
   },'small');
}
let menuOpenInProgress=false;
function openDevice(id){
 const d=dev(id);if(!d)return;
 const p=P.profileFor(d),master=N.lab.mode==='master';
 const status=d.dead?'Offline':'Online';
 const config=[];
 if(!master){
  config.push(row('easy','Easy Edit','Name, IPv4, MAC, Gateway, Ports und Subnetz','edit'));
  config.push(row('more','Erweiterte Konfiguration','Hardware, IPv6, DNS, VLAN und Sicherheit','advanced'));
  config.push(row('os','Virtuelles Betriebssystem',osName(d)+' · Konsole und Netzwerkprofil','mobile'));
 }
 config.push(row('term','Virtuelles Terminal',osName(d)+' · Befehle in eigener OS-Umgebung','terminal'));
 const security=[];
 if(E.isHost(d)||E.isFirewall(d)){
  security.push(row('firewall','Firewall konfigurieren',
    E.isHost(d)?'Host-Firewall: Regeln und Paketprüfung':'Netzwerk-Firewall: Regeln und Zonen','shield'));
  security.push(row('fw-pro','Firewall Studio PRO','CIDR, Portbereiche, Reihenfolge, Lastschutz','fireplus'));
 }
 security.push(row('modules','Hardware & Module','Adapter, Schnittstellen und Ports verwalten','module'));
 if(serverKinds.has(d.type)||['router','firewall','dns','dhcp'].includes(d.type))
  security.push(row('services','Serverdienste','HTTP, DNS, DHCP, Mail und weitere Dienste','server'));
 if(d.type==='phone')
  security.push(row('mobile','Smartphone-System','Android, iOS, virtuelle Root- und Repeater-Profile','mobile'));
 const controls=[
  row('inspect','Geräte-Inspector','Konfiguration, Aktivität und Fehler dieses Geräts','inspect'),
  row('logs','Geräte-Log','Pakete, Warnungen und Systemereignisse','logs'),
  row('move','Gerät verschieben','Nach Aktivierung bewusst im Netzplan ziehen','move'),
  row('power',d.dead?'Einschalten':'Ausschalten','Strom- und Linkzustand simulieren','power')
 ];
 const headline='<div class="v8-device-meta"><div class="v8-device-icon">'+
  icon(d.type==='phone'?'mobile':E.isFirewall(d)?'shield':serverKinds.has(d.type)?'server':'network')+'</div>'+
  '<div class="v8-device-summary"><span>'+escape(d.type.toUpperCase())+' · '+escape(osName(d))+'</span>'+
  '<strong>'+escape(p.ipv4||d.ip||'Keine IPv4')+'</strong>'+
  '<small>'+escape(p.subnet||'Keine Maske')+' · '+escape(d.mac||'Keine MAC')+'</small></div>'+
  '<span class="v8-device-status'+(d.dead?' is-offline':'')+'">'+status+'</span></div>';
 const markup='<div class="v8-device-sheet" data-v8-device="'+escape(id)+'">'+headline+
   section('Konfiguration',config)+section('Netzwerk & Hardware',security)+
   section('Diagnose & Aktionen',controls)+
   '<div class="v8-danger-section">'+row('delete','Gerät löschen','Gerät und Verbindungen entfernen','delete',{danger:true})+'</div>'+
   '</div>';
 menuOpenInProgress=true;
 try{
  N.open(d.label+' · '+d.type.toUpperCase(),markup,root=>{
    const handlers={
      easy:()=>{N.close();C.editDevice(id)},
      more:()=>N.editMore(id),os:()=>osPage(id),term:()=>N.terminal(id),
      firewall:()=>window.PacketLabV06UI?.openFirewall(id),
      'fw-pro':()=>V.openFirewallAdvanced(id),
      modules:()=>V.openModules(id),services:()=>V.openServices?.(id),
      mobile:()=>V.openSmartphone(id),
      inspect:()=>V.openInspector(id),
      logs:()=>N.deviceLogs(id),
      move:()=>{window.PacketLabUX.moveArmed=id;N.close();C.setTool('select');notice('Verschieben: '+d.label+' jetzt ziehen')},
      power:()=>{N.power(id,d.dead);openDevice(id)},
      delete:()=>deleteConfirm(id)
    };
    root.querySelectorAll('[data-v8-act]').forEach(b=>{
      b.onclick=()=>{const fn=handlers[b.dataset.v8Act];if(fn)fn();};
    });
  },'wide');
 }finally{menuOpenInProgress=false}
}
N.showDeviceActions=openDevice;
// The older Next.js selected-device quickedit captured a lexical function,
// so intercept legacy device sheets after construction as well.
const sheet=document.getElementById('pl-sheet');
if(sheet){
 const watch=new MutationObserver(()=>{
   if(menuOpenInProgress||sheet.hidden)return;
   const legacy=sheet.querySelector('.pl-device-info');
   const target=sheet.querySelector('.pl-options > [data-action="term"]');
   if(!legacy||!target||sheet.querySelector('.v8-device-sheet'))return;
   const d=dev(S.selected);
   if(d)queueMicrotask(()=>{if(!menuOpenInProgress&&sheet.querySelector('.pl-device-info'))openDevice(d.id)});
 });
 watch.observe(sheet,{childList:true,subtree:true});
}
V.openServices=openServicesFallback;
function openServicesFallback(id){
 const fn=window.VeyraNext?.showDeviceActions;
 // Genuine native v0.7 'openServices' is private, but the old device
 // menu can be invoked through its stored action when present. We expose
 // a complete service manager in v0.8 below rather than losing that action.
 const d=dev(id);if(!d)return;
 const serviceInfo=[['http',80],['https',443],['ssh',22],['dns',53],['dhcp',67],['smtp',25],
                    ['imap',143],['ntp',123],['smb',445],['ftp',21],['mqtt',1883],['rdp',3389],['db',5432]];
 N.open('Serverdienste · '+d.label,
   '<p class="v8-hint">Services wirken nur auf das virtuelle Gerätemodell, nicht auf das echte Betriebssystem.</p>'+
   '<div class="v8-services">'+serviceInfo.map(([name,port])=>
    '<label class="v8-service"><span><b>'+name.toUpperCase()+'</b><small>TCP/UDP '+port+'</small></span>'+
    '<input type="checkbox" data-v8-service="'+name+'"'+(P.profileFor(d).enabledServices?.[name]?' checked':'')+'></label>').join('')+'</div>'+
   '<div class="v8-bottom-actions"><button data-v8="back">Zurück</button><button data-v8="save">Speichern</button></div>',
   root=>{
     root.querySelector('[data-v8="back"]').onclick=()=>openDevice(id);
     root.querySelector('[data-v8="save"]').onclick=()=>{
       C.pushHistory();const p=d.vprofile||(d.vprofile=P.sanitizeProfile({},d));
       p.enabledServices=p.enabledServices||{};
       root.querySelectorAll('[data-v8-service]').forEach(x=>p.enabledServices[x.dataset.v8Service]=x.checked);
       p.dnsEnabled=!!p.enabledServices.dns;p.dhcpServer=!!p.enabledServices.dhcp;
       P.createEvent(N.lab,S.devices,d.label+': Serverdienste gespeichert','system',[id]);
       C.refresh();openDevice(id);
     };
   },'wide');
}
window.PacketLabV08={openDevice,openOSChooser:osPage,openServices:openServicesFallback,version:'0.8.0'};
// Visible build identifier: avoid mistaking an old installed APK for the new UI.
const appTitle=document.querySelector('.brand h1');
if(appTitle&&!document.getElementById('v8-app-version')){
 const mark=document.createElement('small');mark.id='v8-app-version';mark.textContent='0.8.0';
 mark.title='PacketLab app version 0.8.0';appTitle.append(mark);
}
console.info('PacketLab 0.8 device studio: one isolated renderer; no legacy decorator dependencies.');
})();
