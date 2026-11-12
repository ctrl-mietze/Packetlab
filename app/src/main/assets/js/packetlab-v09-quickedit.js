/* PacketLab v0.9 Quick Edit: touch hold, drag through hierarchy, release to choose.
 * Exclusively available in free Network Lab; never in Training Builder or Player.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,P=PacketLabCore,S=C.state;
if(!C||!N)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opt=(id,label,descr='')=>({id,label,descr});
const CATEGORIES=[
 ['clients','Select and add Client',[opt('pc','PC'),opt('laptop','Laptop'),
  opt('phone','Smartphone'),opt('printer','Drucker'),opt('voip','VoIP Telefon')]],
 ['switching','Switching und WLAN',[opt('switch','Switch'),opt('ap','Access Point'),
  opt('hub','Hub'),opt('wlc','WLAN Controller')]],
 ['routing','Routing und Sicherheit',[opt('router','Router'),opt('firewall','Firewall'),
  opt('vpn','VPN Gateway'),opt('ids','IDS / IPS')]],
 ['servers','Server und Infrastruktur',[opt('server','Server'),opt('dns','DNS'),
  opt('dhcp','DHCP'),opt('nas','NAS'),opt('cloud','Cloud')]],
 ['repair','Repair Network',[opt('repair-router','Fix Router'),opt('repair-switch','Fix Switche'),
  opt('repair-client','Fix PCs'),opt('repair-all','Fix All')]],
 ['smart','Smart Fix',[opt('smart-config','Smart Config'),opt('smart-connect','Smart Connectivity'),
  opt('smart-safe','Smart Safe'),opt('smart-all','Smart All')]],
 ['agent','Building Agent',[opt('create','Create my Network'),
  opt('finish','Finish Network'),opt('upgrade','Upgrade Network'),
  opt('balance','Balance Network')]]
];
const groups=new Map(CATEGORIES.map(([k,label,items])=>[k,{label,items}]));
const haptic=t=>window.PacketLabV09UI?.vibrate(t||'tap');
const notify=x=>window.VeyraRefine?.flash?.(x)||console.info(x);
let current=null,hoverTimer=0;
function close(){
 clearTimeout(hoverTimer);
 if(!current)return;
 current.root.remove();current=null;
}
const canShow=()=>!N.lab.v9Role||N.lab.v9Role==='network';
function fillOptions(key){
 const block=current?.root?.querySelector('#v9-quick-sub');
 if(!block)return;
 const grp=groups.get(key);if(!grp)return;
 current.group=key;
 block.innerHTML='<div class="v9-quick-subtitle">'+esc(grp.label)+'</div>'+
 grp.items.map(item=>'<div class="v9-quick-option" data-quick-choice="'+esc(item.id)+'" role="menuitem" tabindex="-1">'+
  '<strong>'+esc(item.label)+'</strong><small>'+esc(item.descr||'')+'</small></div>').join('');
 block.hidden=false;
 const rail=current.root.querySelector('.v9-quick-rail').getBoundingClientRect();
 const width=block.getBoundingClientRect().width;
 const useRight=(rail.right+width+8)<=window.innerWidth;
 block.style.left=(useRight?rail.right+5:Math.max(5,rail.left-width-5))+'px';
 block.style.top=Math.max(90,Math.min(window.innerHeight-block.offsetHeight-85,rail.top+45))+'px';
 block.querySelectorAll('[data-quick-choice]').forEach(el=>el.addEventListener('pointerenter',()=>haptic('tap')));
}
function targetAt(e){
 const element=document.elementFromPoint(e.clientX,e.clientY);
 return element?.closest?.('.v9-quick-main-item,.v9-quick-option')||null;
}
function onMove(e){
 if(!current||e.pointerType!=='touch')return;
 const item=targetAt(e),main=item?.dataset.quickGroup,choice=item?.dataset.quickChoice;
 current.root.querySelectorAll('.v9-quick-main-item').forEach(x=>x.classList.toggle('is-hover',x.dataset.quickGroup===main));
 current.root.querySelectorAll('.v9-quick-option').forEach(x=>x.classList.toggle('is-hover',x.dataset.quickChoice===choice));
 if(main&&main!==current.group&&current.pending!==main){
   current.pending=main;clearTimeout(hoverTimer);
   hoverTimer=setTimeout(()=>{if(current&&current.pending===main){fillOptions(main);haptic('mode')}},185);
 }
 if(choice)current.choice=choice;else if(main)current.choice=null;
}
function onUp(e){
 if(!current)return;
 const hit=targetAt(e),key=hit?.dataset.quickChoice;
 const at=current.at;
 close();
 if(key){haptic('confirm');executeChoice(key,at)}
}
function openAt(x,y,p){
 if(!canShow())return false;
 close();
 const root=document.createElement('div');
 root.className='v9-quick-shade';root.id='v9-quick-shade';
 root.innerHTML='<div class="v9-quick-rail" role="menu" aria-label="Quick Edit">'+
 '<div class="v9-quick-title"><strong>Quick Edit</strong><small>Gedrückt halten und zum Ziel ziehen</small></div>'+
 CATEGORIES.map(([k,name])=>'<div class="v9-quick-main-item" data-quick-group="'+esc(k)+'" role="menuitem">'+
 '<span class="v9-quick-glyph">◇</span><b>'+esc(name)+'</b><span>›</span></div>').join('')+
 '</div><div id="v9-quick-sub" class="v9-quick-sub" role="menu" hidden></div>';
 document.body.append(root);
 const rail=root.querySelector('.v9-quick-rail');
 const w=rail.getBoundingClientRect().width,h=rail.getBoundingClientRect().height;
 // Keep one-handed thumb travel practical and never clip the panel.
 rail.style.left=Math.max(8,Math.min(window.innerWidth-w-8,x-60))+'px';
 rail.style.top=Math.max(85,Math.min(window.innerHeight-h-110,y-85))+'px';
 current={root,at:{x:p.x,y:p.y},group:null,pending:null,choice:null};
 root.querySelectorAll('.v9-quick-main-item').forEach(el=>{
   el.addEventListener('pointerenter',()=>{if(current){current.pending=el.dataset.quickGroup;
     clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>fillOptions(el.dataset.quickGroup),160)}});
   el.addEventListener('click',()=>fillOptions(el.dataset.quickGroup));
 });
 root.querySelector('#v9-quick-sub').addEventListener('click',e=>{
  const b=e.target.closest('[data-quick-choice]');if(!b)return;
  const at=current?.at;close();if(at)executeChoice(b.dataset.quickChoice,at);
 });
 haptic('mode');return true;
}
window.addEventListener('pointermove',onMove,true);
window.addEventListener('pointerup',onUp,true);
window.addEventListener('pointercancel',close,true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
function repair(kind,quiet=false){
 let fixed=0;C.pushHistory();
 const kinds=kind==='router'?['router','vpn','modem']:kind==='switch'?['switch','hub','ap','wlc']:
   kind==='client'?['pc','laptop','phone','printer']:null;
 for(const d of S.devices){
  if(kinds&&!kinds.includes(d.type))continue;
  const p=d.vprofile||(d.vprofile=P.sanitizeProfile({},d));
  if(d.dead){d.dead=false;fixed++}
  if(!P.v4(p.subnet)||!window.PacketLabV07?.validMask?.(p.subnet)){p.subnet='255.255.255.0';fixed++}
  if(d.ip&&P.v4(d.ip)&&p.ipv4!==d.ip){p.ipv4=d.ip;fixed++}
  if(p.gateway&&P.v4(p.ipv4)&&!window.PacketLabV07?.inside?.(p.ipv4,p.gateway,p.subnet)){
    const local=S.devices.find(x=>Topologies.isRouter(x.type)&&x.id!==d.id&&
      window.PacketLabV07?.inside?.(p.ipv4,x.ip,p.subnet));
    p.gateway=local?.ip||'';fixed++;
  }
  if(p.modules&&p.modules.ethernet===false&&d.type!=='phone'){p.modules.ethernet=true;fixed++}
 }
 for(const l of S.links){
  if(!kinds||S.devices.some(d=>(l.a===d.id||l.b===d.id)&&kinds.includes(d.type))){
    if(l.dead){l.dead=false;fixed++}
  }
 }
 C.refresh();
 P.createEvent(N.lab,S.devices,'Quick Repair '+kind+': '+fixed+' Modellfehler behoben','system',[]);
 if(!quiet)notify(fixed+' Korrekturen angewendet');
 return fixed;
}
function smartFix(key){
 const root=document.createElement('div');root.className='v9-smart-progress';
 const modes={
  'smart-config':['Adressprüfung','Subnetzprüfung','Gatewayprüfung','Validierung'],
  'smart-connect':['Gerätestatus','Ports und Kabel','Router und Switches','Topologie prüfen'],
  'smart-safe':['Gerätediagnose','Sicherheitsprofile prüfen','Firewallregeln kontrollieren','Abschluss'],
  'smart-all':['Netzwerk erfassen','Interfaces reparieren','Netzstruktur ergänzen','Gateway und Dienste','Verfügbarkeit prüfen']
 };
 const stages=modes[key]||modes['smart-config'];
 N.open('Smart Fix · '+key,
  '<div class="v9-header"><b>Automatische Netzdiagnose</b><small>Änderungen werden schrittweise im virtuellen Modell durchgeführt und protokolliert.</small></div>'+
  '<div class="v9-progress"><i id="v9-fix-meter" style="width:0%"></i></div>'+
  '<div id="v9-fix-steps" class="v9-fix-steps"></div>'+
  '<button class="v9-action" id="v9-fix-close" type="button" disabled>Fertig</button>',
  panel=>{
    const output=panel.querySelector('#v9-fix-steps');
    let step=0,fixed=0;
    const timer=setInterval(()=>{
      if(!panel.isConnected){clearInterval(timer);return}
      if(step>=stages.length){clearInterval(timer);
        output.insertAdjacentHTML('beforeend','<p>Abgeschlossen: '+fixed+' Anpassungen</p>');
        panel.querySelector('#v9-fix-close').disabled=false;
        panel.querySelector('#v9-fix-close').onclick=N.close;return}
      if(step===1)fixed+=repair('all',true);
      if(step===2&&['smart-connect','smart-all'].includes(key)&&S.devices.length>1){
        const connected=new Set(S.links.flatMap(l=>[l.a,l.b]));
        const core=S.devices.find(d=>['switch','router','ap'].includes(d.type));
        if(core){for(const d of S.devices.filter(x=>!connected.has(x.id)&&x.id!==core.id).slice(0,5)){
          if(C.connectDevices(core.id,d.id))fixed++;
        }}
      }
      output.insertAdjacentHTML('beforeend','<p>✓ '+esc(stages[step])+'</p>');
      step++;panel.querySelector('#v9-fix-meter').style.width=Math.round(step/stages.length*100)+'%';
      haptic('tap');
    },310);
  },'wide');
}
function executeChoice(id,at){
 const types=new Set(['pc','laptop','phone','printer','voip','switch','ap','hub','wlc','router','firewall',
   'vpn','ids','server','dns','dhcp','nas','cloud']);
 if(types.has(id)){
   C.addDevice(id,at.x,at.y);C.setTool('select');notify('Platziert: '+id);return
 }
 if(id.startsWith('repair-'))return repair(id.slice(7));
 if(id.startsWith('smart-'))return smartFix(id);
 if(id==='create')return window.PacketLabV09Discovery?.openAgent();
 if(id==='finish')return smartFix('smart-connect');
 if(id==='upgrade')return smartFix('smart-all');
 if(id==='balance')return smartFix('smart-safe');
}
window.PacketLabV09QuickEdit={openAt,close,repair,smartFix,executeChoice};
console.info('PacketLab v0.9: touch-hold Quick Edit ready.');
})();
