/* PacketLab v0.9 Unified Firewall Studio: native-looking policy editor
 * preserving the real deterministic v0.6 evaluation and rule precedence.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,E=PacketLabV06,P=PacketLabCore;
if(!N||!C||!E)return;
const dev=id=>C.state.devices.find(x=>x.id===id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const select=(id,title,items,value)=>'<label class="v9-field"><span>'+esc(title)+'</span><select id="'+id+'">'+
 items.map(([v,l])=>'<option value="'+v+'" '+(String(v)===String(value)?'selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label>';
const input=(id,title,value,attrs='')=>'<label class="v9-field"><span>'+esc(title)+'</span>'+
 '<input id="'+id+'" value="'+esc(value)+'" '+attrs+'></label>';
const check=(id,title,detail,checked)=>'<label class="v9-check"><input type="checkbox" id="'+id+'" '+(checked?'checked':'')+'>'+
 '<span><b>'+esc(title)+'</b><small>'+esc(detail)+'</small></span></label>';
const btn=(action,label,css='')=>'<button class="v9-action '+css+'" type="button" data-v9-fw="'+action+'">'+esc(label)+'</button>';
const note=msg=>window.VeyraRefine?.flash?.(msg)||console.info(msg);
const prop=id=>E.sanitizeFirewall(E.profile(dev(id)).fwPolicy);
function commit(id,policy){
 const d=dev(id);if(!d)return;
 C.pushHistory();
 const p=E.profile(d);
 p.fwPolicy=E.sanitizeFirewall({...policy,hostMode:E.isHost(d)});
 p.firewallEnabled=p.fwPolicy.enabled;
 P.createEvent(N.lab,C.state.devices,d.label+': Firewall Policy aktualisiert, '+p.fwPolicy.rules.length+' Regeln','security',[id]);
 C.refresh();
}
function ruleForm(id,index=-1){
 const fw=prop(id),r=fw.rules[index]||{action:'deny',protocol:'tcp',port:'443',source:'any',target:'any',zone:'lan'};
 N.open(index<0?'Neue Firewall Regel':'Firewall Regel bearbeiten',
 '<div class="v9-header"><b>Regel '+(index<0?'erstellen':'bearbeiten')+'</b><small>First Match: Regeln werden in der angezeigten Reihenfolge abgearbeitet.</small></div>'+
 '<div class="v9-two-col">'+
 select('v9-fwa','Aktion',[['allow','Erlauben'],['deny','Blockieren'],['log','Nur protokollieren']],r.action)+
 select('v9-fwp','Protokoll',['any','tcp','udp','icmp','dns','http','https','ssh'].map(x=>[x,x.toUpperCase()]),r.protocol)+'</div>'+
 '<div class="v9-two-col">'+
 input('v9-fws','Quelle (any, IPv4, CIDR, Gerät-ID)',r.source)+
 input('v9-fwd','Ziel (any, IPv4, CIDR, Gerät-ID)',r.target)+'</div>'+
 '<div class="v9-two-col">'+
 input('v9-fwport','Zielport oder Bereich',r.port)+
 select('v9-fwzone','Netzbereich',[['any','Alle Bereiche'],['lan','LAN'],['wan','WAN']],r.zone)+'</div>'+
 '<p class="v9-hint">Beispiel: Quelle 192.168.10.0/24, Ziel 192.168.20.5, TCP und Port 443. Bereiche als 8000-8999. ICMP benötigt normalerweise keinen Zielport.</p>'+
 '<div class="v9-actions">'+btn('back','Zurück')+btn('save','Regel speichern','v9-primary')+'</div>',
 root=>{
  root.querySelector('[data-v9-fw="back"]').onclick=()=>open(id);
  root.querySelector('[data-v9-fw="save"]').onclick=()=>{
   const v=k=>root.querySelector('#'+k)?.value.trim()||'';
   const source=v('v9-fws')||'any',target=v('v9-fwd')||'any',port=v('v9-fwport')||'any';
   const validAddress=x=>x==='any'||C.state.devices.some(d=>d.id===x)||P.v4(x)||
       (/^(?:\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[12][0-9]|3[012])$/.test(x)&&P.v4(x.split('/')[0]));
   const portValid=port==='any'||(/^\d{1,5}$/.test(port)&&Number(port)<=65535)||
      (/^\d{1,5}-\d{1,5}$/.test(port)&&
       port.split('-').every(x=>Number(x)<=65535)&&Number(port.split('-')[0])<=Number(port.split('-')[1]));
   if(!validAddress(source)||!validAddress(target)||!portValid){note('Quelle, Ziel oder Port ungültig');return}
   const p=prop(id);
   const rule={action:v('v9-fwa'),protocol:v('v9-fwp'),source,target,
     port:port==='any'?'any':/^\d+$/.test(port)?Number(port):port,zone:v('v9-fwzone')};
   if(index>=0)p.rules[index]=rule;else if(p.rules.length<80)p.rules.push(rule);
   else{note('Maximal 80 Regeln');return}
   commit(id,p);open(id);
  };
 },'wide');
}
function open(id){
 const d=dev(id);if(!d||!E.isHost(d)&&!E.isFirewall(d))return;
 const fw=prop(id),kind=E.isHost(d)?'Software-Firewall':'Network Firewall';
 const ruleRows=fw.rules.map((r,i)=>'<div class="v9-fw-rule"><span class="'+(r.action==='deny'?'is-deny':'is-allow')+'">'+
  esc(r.action.toUpperCase())+'</span><div><strong>'+esc(r.protocol.toUpperCase())+' / '+esc(r.port)+'</strong>'+
  '<small>'+esc(r.source)+' → '+esc(r.target)+' · '+esc(r.zone)+'</small></div>'+
  '<button type="button" data-fw-up="'+i+'" aria-label="Regel höher">↑</button>'+
  '<button type="button" data-fw-down="'+i+'" aria-label="Regel tiefer">↓</button>'+
  '<button type="button" data-fw-edit="'+i+'" aria-label="Regel bearbeiten">✎</button>'+
  '<button type="button" data-fw-delete="'+i+'" aria-label="Regel löschen">×</button></div>').join('');
 N.open(kind+' · '+d.label,
   '<div class="v9-header"><b>'+esc(d.label)+' · Firewall</b>'+
   '<small>'+esc(E.isHost(d)?'Diese Firewall schützt nur diesen Host.':'Diese Firewall filtert nur Pakete, deren virtueller Pfad durch das Gerät führt.')+'</small></div>'+
   '<div class="v9-mini-stats"><span><strong>'+fw.rules.length+'</strong>Regeln</span>'+
    '<span><strong>'+ (fw.enabled?'Aktiv':'Aus')+'</strong>Status</span>'+
    '<span><strong>'+(fw.policy==='deny'?'Deny':'Allow')+'</strong>Standard</span></div>'+
   '<div class="v9-two-col">'+
   select('v9-fw-status','Firewall',[['on','Aktiv'],['off','Deaktiviert']],fw.enabled?'on':'off')+
   select('v9-fw-default','Default Policy',[['allow','Erlauben'],['deny','Blockieren']],fw.policy)+
   input('v9-fw-rate','Rate Limit Mbit/s',fw.rateLimitMbps,'type="number" min="1" max="100000"')+
   input('v9-fw-burst','Burst (Frames)',fw.burstPackets,'type="number" min="1" max="100000"')+
   select('v9-fw-mitigation','Bei Überlast',[['drop','Verwerfen'],['limit','Limit anwenden'],['quarantine','Quarantäne']],fw.mitigation)+'</div>'+
   '<div class="v9-checklist">'+
   check('v9-fw-inspect','DPI','Simulierte Paketinspektion',fw.inspection)+
   check('v9-fw-spoof','Anti-Spoofing','Adressmanipulation im Modell prüfen',fw.strictSpoof)+
   check('v9-fw-log','Logging','Firewall Entscheidungen in Geräteprotokolle schreiben',fw.logging)+
   check('v9-fw-evasion','Evasion erlauben','Nur bei bewusst permissiver Policy',fw.allowEvasion)+'</div>'+
   '<h3 class="v9-section">Eigene Regeln <small>First Match</small></h3>'+
   '<div class="v9-fw-rules">'+(ruleRows||'<p class="v9-empty">Keine eigenen Regeln. Es gilt die Default Policy.</p>')+'</div>'+
   '<div class="v9-actions">'+btn('add','Neue Regel','v9-primary')+
    btn('preset','Basisregelwerk')+btn('logs','Firewall Logs')+'</div>'+
   '<div class="v9-actions">'+btn('save','Konfiguration übernehmen','v9-primary')+
     btn('back','Zurück zum Gerät')+'</div>',
 root=>{
  const current=()=>{
   const v=k=>root.querySelector('#'+k);
   return {...prop(id),
    enabled:v('v9-fw-status').value==='on',policy:v('v9-fw-default').value,
    rateLimitMbps:Number(v('v9-fw-rate').value),burstPackets:Number(v('v9-fw-burst').value),
    mitigation:v('v9-fw-mitigation').value,inspection:v('v9-fw-inspect').checked,
    strictSpoof:v('v9-fw-spoof').checked,logging:v('v9-fw-log').checked,
    allowEvasion:v('v9-fw-evasion').checked
   };
  };
  const autosave=()=>{
    const raw=current();
    if(raw.rateLimitMbps<1||raw.burstPackets<1){note('Rate und Burst müssen positiv sein');return false}
    commit(id,raw);return true;
  };
  root.querySelector('[data-v9-fw="save"]').onclick=()=>{if(autosave()){note('Firewall gespeichert');window.PacketLabV08?.openDevice(id)}};
  root.querySelector('[data-v9-fw="back"]').onclick=()=>window.PacketLabV08?.openDevice(id);
  root.querySelector('[data-v9-fw="add"]').onclick=()=>{autosave();ruleForm(id)};
  root.querySelector('[data-v9-fw="preset"]').onclick=()=>{
    if(!confirm('Basisregelwerk erstellen? Bestehende Regeln werden ersetzt.'))return;
    const policy=current();policy.enabled=true;policy.policy='deny';
    policy.rules=[
      {action:'allow',protocol:'icmp',port:'any',source:'any',target:'any',zone:'lan'},
      {action:'allow',protocol:'dns',port:53,source:'any',target:'any',zone:'lan'},
      {action:'allow',protocol:'https',port:443,source:'any',target:'any',zone:'lan'}
    ];
    commit(id,policy);open(id);
  };
  root.querySelector('[data-v9-fw="logs"]').onclick=()=>{
    const logs=(E.profile(d).logs||[]).filter(x=>/firewall|blocked|packet|drop/i.test(x.text));
    N.open('Firewall Protokoll · '+d.label,
      '<div class="v9-log-list">'+(logs.length?logs.slice(-150).reverse().map(e=>
       '<p><small>'+esc(e.time)+' · '+esc(e.type)+'</small>'+esc(e.text)+'</p>').join(''):
       '<p class="v9-empty">Noch keine passenden Firewall Ereignisse.</p>')+'</div>'+
      '<div class="v9-actions">'+btn('back','Zurück')+'</div>',
      pane=>pane.querySelector('[data-v9-fw="back"]').onclick=()=>open(id),'wide');
  };
  for(const op of ['up','down','edit','delete']){
   root.querySelectorAll('[data-fw-'+op+']').forEach(b=>b.onclick=()=>{
     const i=Number(b.dataset['fw'+op[0].toUpperCase()+op.slice(1)]);
     if(op==='edit')return ruleForm(id,i);
     const p=current();
     if(op==='delete'){p.rules.splice(i,1)}else{
       const j=i+(op==='up'?-1:1);if(j<0||j>=p.rules.length)return;
       [p.rules[i],p.rules[j]]=[p.rules[j],p.rules[i]];
     }
     commit(id,p);open(id);
   });
  }
 },'wide');
}
if(window.PacketLabV06UI)window.PacketLabV06UI.openFirewall=open;
window.PacketLabV09Firewall={open,ruleForm};
})();
