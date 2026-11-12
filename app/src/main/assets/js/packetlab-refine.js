/* Veyra PacketLab 0.4 · cohesive Material/OLED UX and media simulator.
   All simulation data remains local. No external code, sockets or OS terminal.
*/
(() => {
'use strict';
const N=window.VeyraNext,P=PacketLabCore,S=window.VeyraCore.state,
      C=window.VeyraCore,$=id=>document.getElementById(id);
if(!N||!P||!C){console.error('Refine: PacketLab v0.3 core unavailable');return}
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dev=id=>S.devices.find(d=>d.id===id);
const link=id=>S.links.find(l=>l.id===id);
const human=(n,d=1)=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:d});
const headline=(title,subtitle='')=>'<div class="vr-intro"><div class="vr-intro-title">'+e(title)+'</div>'+(subtitle?'<p>'+e(subtitle)+'</p>':'')+'</div>';
const action=(id,text,style='')=>'<button type="button" data-vr-action="'+e(id)+'" class="vr-action '+style+'">'+e(text)+'</button>';
const row=(title,detail='',key='',icon='')=>
    '<button type="button" class="vr-menu-row"'+(key?' data-vr-pick="'+e(key)+'"':'')+'><span class="vr-menu-symbol">'+(icon||'◇')+'</span>'+
    '<span class="vr-menu-copy"><strong>'+e(title)+'</strong>'+(detail?'<small>'+e(detail)+'</small>':'')+'</span><span class="vr-chevron">›</span></button>';
const oldNextOpen=N.open;
if(typeof oldNextOpen!=='function'){console.error('Refine: public open not available');return}
function open(title,contents,bind=()=>{},size='wide'){
  N.open(title,contents,bind,size);
  decorateCurrentSheet();
}
function decorateCurrentSheet(){
  const sheet=$('pl-sheet');if(!sheet)return;
  sheet.querySelectorAll('.pl-options > button').forEach((btn,i)=>{
    if(btn.dataset.vrDecorated)return;
    btn.dataset.vrDecorated='1';btn.classList.add('vr-option');
    const ico=document.createElement('span');ico.className='vr-option-icon';
    const name=btn.querySelector('b')?.textContent?.toLowerCase()||'';
    const paths={
      edit:'<path d="M5 17l-1 4 4-1 12-12-3-3L5 17zM14 6l3 3"/>',
      terminal:'<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="m7 9 4 3-4 3M13 16h5"/>',
      logs:'<path d="M5 5h14M5 10h14M5 15h14M5 20h9"/>',
      power:'<path d="M12 3v9M6.3 5.8a9 9 0 1 0 11.4 0"/>',
      master:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
      file:'<path d="M4 6h7l2 2h7v12H4z"/>',
      network:'<circle cx="12" cy="4" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M11 6l-5 11M13 6l5 11M7 19h10"/>',
      shield:'<path d="M12 2 20 6v6c0 5-3.6 8-8 10-4.4-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
      module:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h3v4H7zM14 10h3M14 14h3M7 3v3M17 3v3M7 18v3M17 18v3"/>',
      move:'<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/>',
      phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
      service:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M7 7h10M7 11h10M7 15h10M8 18h2"/>',
      device:'<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M8 21h8M12 18v3"/>'
    };
    const iconKey=/terminal|konsole/.test(name)?'terminal':
      /edit|bearbeit/.test(name)?'edit':
      /log|ereignis/.test(name)?'logs':
      /einschalten|ausschalten|power/.test(name)?'power':
      /master|aufgabe/.test(name)?'master':
      /datei|projekt|ordner/.test(name)?'file':
      /firewall|schutz/.test(name)?'shield':
      /hardware|module/.test(name)?'module':
      /verschieb/.test(name)?'move':
      /android|ios|smartphone/.test(name)?'phone':
      /dienste|server/.test(name)?'service':
      /netzwerk|standard/.test(name)?'network':'device';
    ico.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'+
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[iconKey]+'</svg>';
    btn.insertBefore(ico,btn.firstChild);
  });
}
// Make existing sheets feel like finished Android pages without altering their behavior.
const sheetBody=$('pl-sheet');
if(sheetBody)new MutationObserver(decorateCurrentSheet).observe(sheetBody,{childList:true,subtree:true});

// All SELECT elements are handled here, not by Android's native popup.
// This works for options in older TopoLab dialogs, logs, device editor and
// new dynamically generated forms without rebuilding their parent dialog.
const shade=document.createElement('div');shade.id='vr-picker-shade';shade.hidden=true;
const picker=document.createElement('section');picker.id='vr-picker';picker.hidden=true;
document.body.append(shade,picker);
let activeSelect=null;
function closePicker(){shade.hidden=true;picker.hidden=true;picker.replaceChildren();activeSelect=null}
shade.addEventListener('click',closePicker);
function showPicker(select){
  if(!select||select.disabled)return;
  activeSelect=select;
  const opts=[...select.options].filter(o=>!o.disabled).map(o=>({v:o.value,text:o.textContent||o.value}));
  const label=select.closest('label')?.querySelector('span')?.textContent?.trim()||
    select.getAttribute('aria-label')||select.getAttribute('name')||'Auswählen';
  shade.hidden=false;picker.hidden=false;
  picker.innerHTML='<div class="vr-picker-head"><strong>'+e(label)+'</strong>'+
    '<button class="vr-picker-close" type="button" aria-label="Schließen">×</button></div>'+
    (opts.length>10?'<input id="vr-picker-search" type="search" placeholder="Suchen…" autocomplete="off" aria-label="Suchen">':'')+
    '<div class="vr-picker-options"></div>';
  const list=picker.querySelector('.vr-picker-options');
  function update(q=''){
    const terms=opts.filter(o=>o.text.toLowerCase().includes(q.trim().toLowerCase()));
    list.innerHTML=terms.length?terms.slice(0,200).map(o=>
      '<button class="vr-picker-option'+(o.v===select.value?' selected':'')+'" data-value="'+e(o.v)+'">'+
      '<span class="vr-picker-mark">'+(o.v===select.value?'✓':'')+'</span><span>'+e(o.text)+'</span></button>').join(''):
      '<div class="vr-picker-none">Keine passende Auswahl</div>';
    list.querySelectorAll('[data-value]').forEach(el=>el.onclick=()=>{
      if(!activeSelect||!activeSelect.isConnected){closePicker();return}
      activeSelect.value=el.dataset.value;
      activeSelect.dispatchEvent(new Event('input',{bubbles:true}));
      activeSelect.dispatchEvent(new Event('change',{bubbles:true}));
      closePicker();
    });
  }
  update();
  picker.querySelector('.vr-picker-close').onclick=closePicker;
  picker.querySelector('#vr-picker-search')?.addEventListener('input',ev=>update(ev.target.value));
}
$('pl-logfilter')?.setAttribute('aria-label','Log-Filter');
document.addEventListener('pointerdown',ev=>{
  const sel=ev.target?.closest?.('select');
  if(!sel||sel.disabled||sel.classList.contains('pl-native-hidden'))return;
  if(ev.pointerType==='touch')return; // Wait for click, allow natural scroll.
  ev.preventDefault();ev.stopImmediatePropagation();
  showPicker(sel);
},true);
document.addEventListener('click',ev=>{
  const sel=ev.target?.closest?.('select');
  if(!sel||sel.disabled||sel.classList.contains('pl-native-hidden'))return;
  ev.preventDefault();ev.stopImmediatePropagation();
  if(activeSelect!==sel)showPicker(sel);
},true);
document.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'&&!picker.hidden){closePicker();ev.preventDefault();ev.stopPropagation()}
  if(!picker.hidden&&ev.key==='Enter'&&ev.target===picker.querySelector('#vr-picker-search')){
    const first=picker.querySelector('[data-value]');if(first)first.click();
  }
},true);
const previousBack=window.VeyraBack;
window.VeyraBack=function(){if(!picker.hidden){closePicker();return true}return previousBack?previousBack():false};

// SVGs from the established Veyra device palette, not emoji or generic placeholders.
const catalog=[
 ['Clients',[
  ['pc','PC','Arbeitsstation · IP, ARP und Dienste'],['laptop','Laptop','Mobiler Client mit LAN-Zugang'],
  ['phone','Smartphone','Mobiler Host / WLAN'],['voip','VoIP Telefon','SIP-Client und Telefonie'],
  ['printer','Drucker','IPP und Druckdienste'],['camera','IP-Kamera','RTSP und Verwaltung'],
  ['iot','IoT-Sensor','MQTT und Edge-Netze']]],
 ['Switching und WLAN',[
  ['switch','Switch','MAC-Learning und Switching'],['hub','Hub','Geteiltes Übertragungsmedium'],
  ['ap','Access Point','WLAN-Brücke'],['wlc','WLAN Controller','Access-Point-Verwaltung'],
  ['loadbalancer','Load Balancer','Lastverteilung auf Server']]],
 ['Routing und Sicherheit',[
  ['router','Router','Subnetze und Gateways'],['firewall','Firewall','Firewall-Regeln und Zonen'],
  ['vpn','VPN Gateway','Tunnel und Standortkopplung'],['ids','IDS / IPS','Virtuelle Bedrohungserkennung'],
  ['modem','WAN-Modem','Weitverkehrs-Schnittstelle'],['cloud','Cloud / WAN','Externe Netzverbindung']]],
 ['Server und Infrastruktur',[
  ['server','Server','HTTP, HTTPS und SSH'],['nas','NAS','SMB und NFS'],
  ['dns','DNS-Server','Namensauflösung'],['dhcp','DHCP-Server','Adressvergabe'],
  ['ntp','NTP-Server','Zeitsynchronisierung'],['mail','Mail Server','SMTP und IMAPS'],
  ['database','Datenbank','PostgreSQL-Dienst'],['hypervisor','Hypervisor','Virtuelle Hostsysteme'],
  ['plc','Industrie-SPS','Modbus und Automatisierung']]]
];
function paletteIcon(kind){
  const icon=document.querySelector('.v-palette [data-pick="'+kind+'"] .v-palette-ico');
  return icon?icon.innerHTML:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/></svg>';
}
function putPlace(kind){
  const original=document.querySelector('#deviceTypes [data-dtype="'+kind+'"]');
  if(!original){console.warn('Unknown kind',kind);return}
  if(!original.classList.contains('is-active'))original.click();
  document.querySelector('.v-nav [data-tab="workspace"]')?.click();
  N.syncPlace();
  // The legacy toolbar stays functional; the new list only changes its presentation.
  // No forced scroll/focus during device placement; user controls viewport.
}
const left=document.querySelector('.panel--left');
const deviceBrowser=document.createElement('section');deviceBrowser.id='vr-device-browser';
deviceBrowser.innerHTML=
  '<div class="vr-devices-header"><span class="vr-overline">PACKETLAB · HARDWARE</span>'+
  '<h2>Gerätebibliothek</h2><p>Netzwerkgeräte und Services zu deiner Topologie hinzufügen.</p>'+
  '<div class="vr-device-search"><span>⌕</span><input type="search" id="vr-device-search" placeholder="Gerät oder Dienst suchen…" aria-label="Geräte suchen" autocomplete="off"></div>'+
  '<div class="vr-cat-actions">'+
  '<button data-vr-tool="select">Auswahl</button><button data-vr-tool="chaos">Chaos</button>'+
  '<button data-vr-tool="delete">Löschen</button><button data-vr-tool="repair">Reparieren</button></div></div>'+
  '<div id="vr-device-groups"></div>'+
  '<div class="vr-connection-launch">'+
  '<h3>Verbindungen</h3><p>Medium auswählen oder vorhandene Kabel verwalten.</p>'+
  '<div class="vr-connection-actions">'+
    action('media','Kabelart wählen')+action('cables','Alle Verbindungen')+'</div></div>'+
  '<button class="vr-device-log-jump" type="button">Ereignisprotokoll · Filter und Verlauf ›</button>';
left?.insertBefore(deviceBrowser,left.firstElementChild);
function renderCatalog(q=''){
  const match=q.toLocaleLowerCase('de-DE').trim();
  const groups=deviceBrowser.querySelector('#vr-device-groups');
  const sections=catalog.map(([group,items])=>{
    const filtered=items.filter(([k,n,d])=>(k+n+d).toLowerCase().includes(match));
    if(!filtered.length)return '';
    return '<section class="vr-device-group"><h3>'+e(group)+'</h3><div class="vr-device-grid">'+
      filtered.map(([kind,name,description])=>'<button class="vr-device-tile" type="button" data-catalog="'+e(kind)+'">'+
      '<span class="vr-device-glyph">'+paletteIcon(kind)+'</span>'+
      '<span class="vr-device-copy"><strong>'+e(name)+'</strong><small>'+e(description)+'</small></span>'+
      '<span class="vr-device-add">+</span></button>').join('')+
      '</div></section>';
  }).join('');
  groups.innerHTML=sections||'<div class="vr-no-results">Kein Gerät gefunden.</div>';
  groups.querySelectorAll('[data-catalog]').forEach(b=>b.addEventListener('click',()=>putPlace(b.dataset.catalog)));
}
renderCatalog();
deviceBrowser.querySelector('#vr-device-search')?.addEventListener('input',ev=>renderCatalog(ev.target.value));
deviceBrowser.querySelectorAll('[data-vr-tool]').forEach(b=>b.addEventListener('click',()=>{
  const mode=b.dataset.vrTool;
  if(mode==='repair'){C.repairAll();return}
  if(mode==='select')C.setTool('select');
  else document.querySelector('#toolBar [data-tool="'+mode+'"]')?.click();
  document.querySelector('.v-nav [data-tab="workspace"]')?.click();
}));
deviceBrowser.querySelector('[data-vr-action="media"]').onclick=()=>openCableSelection();
deviceBrowser.querySelector('[data-vr-action="cables"]').onclick=()=>cableList();
deviceBrowser.querySelector('.vr-device-log-jump').onclick=()=>{
  const log=document.querySelector('#eventLog')?.closest('.group');
  if(log){log.classList.toggle('vr-logs-expanded');log.scrollIntoView({block:'start',behavior:'smooth'})}
};

function selectedMedium(){return P.MEDIA[N.lab.medium]?N.lab.medium:'cable'}
const mediaNotes={
  cable:'Automatische Leitung. 1 Gbit/s als flexibler Standard ohne feste Reichweitensperre.',
  rj45:'Kupfer · typische LAN-Verbindung bis 100 m.',
  cat6a:'10-Gbit-Ethernet über Kupfer; bis 100 m.',
  fiber:'Optische Strecke mit hoher Kapazität und bis zu 20 km im Lernmodell.',
  coax:'Koaxial-Verkabelung mit geringerer Bandbreite.',
  wifi:'Virtuelle Funkverbindung mit Funklaufzeit und kurzer Reichweite.',
  tunnel:'Logische Verbindung. Beide Gateways benötigen Port- und Tunnelkonfiguration.'
};
function startCableTool(){
  const chip=document.querySelector('#deviceTypes [data-dtype="cable"]');
  if(chip&&!chip.classList.contains('is-active'))chip.click();
  document.querySelector('.v-nav [data-tab="workspace"]')?.click();
}
function mediaSpec(media){
  const info=P.MEDIA[media]||P.MEDIA.cable;
  return human(info.mbps,1)+' Mbit/s · '+human(info.latency,2)+' ms Basis · '+
    (media==='cable'?'freie Standardlänge':'bis '+human(info.maxMetres,0)+' m');
}
function syncMediumLabel(){
  const button=$('pl-medium');if(button)button.textContent='Kabel: '+P.MEDIA[selectedMedium()].label+'  ▾';
}
function openCableSelection(){
  const media=selectedMedium();
  open('Kabel und Medien',headline('Verbindungstyp',
    'Jede neu gezogene Verbindung übernimmt das ausgewählte Medium. Bereits gelegte Kabel kannst du einzeln bearbeiten.')+
    '<div class="vr-medium-list">'+Object.entries(P.MEDIA).map(([key,item])=>
      '<button class="vr-medium-choice'+(media===key?' chosen':'')+'" type="button" data-vr-medium="'+e(key)+'">'+
      '<span class="vr-medium-mark">'+(media===key?'✓':'○')+'</span>'+
      '<span><strong>'+e(item.label)+'</strong><small>'+e(mediaSpec(key))+'</small>'+
      '<small class="vr-medium-note">'+e(mediaNotes[key]||'Virtueller Medientyp')+'</small></span></button>').join('')+
    '</div><div class="vr-actions-footer">'+action('cablelist','Bestehende Kabel')+
    action('lay','Verbinden','vr-primary')+'</div>',root=>{
      root.querySelectorAll('[data-vr-medium]').forEach(b=>b.onclick=()=>{
        N.setMedium(b.dataset.vrMedium);
        syncMediumLabel();
        openCableSelection();
      });
      root.querySelector('[data-vr-action="cablelist"]').onclick=cableList;
      root.querySelector('[data-vr-action="lay"]').onclick=()=>{N.close();startCableTool()};
    });
}
const palette=document.querySelector('.v-palette');
palette?.addEventListener('click',ev=>{
  if(ev.target.closest('#pl-medium')) {
    ev.preventDefault();ev.stopImmediatePropagation();openCableSelection();
  }
},true);
palette?.querySelector('#pl-medium')?.addEventListener('click',ev=>{
  ev.preventDefault();ev.stopImmediatePropagation();openCableSelection();
},true);
syncMediumLabel();
// Cable toolbar: single tap continues to place a default Cable; press-and-hold
// opens per-medium settings without hiding the existing familiar action.
document.querySelectorAll('.v-float .v-fab[title="Kabelmodus"]').forEach(b=>{
  let long=null;
  b.addEventListener('pointerdown',()=>{
    long=setTimeout(()=>{long=null;openCableSelection()},530);
  });
  b.addEventListener('pointerup',()=>{if(long)clearTimeout(long)});
  b.addEventListener('pointercancel',()=>{if(long)clearTimeout(long)});
});
function showCableActions(id){
  const l=link(id);if(!l)return;
  const A=dev(l.a),B=dev(l.b);
  const metric=P.linkMetrics(l);
  const length=l.physicalMetres==null?'':String(l.physicalMetres);
  const speed=l.bandwidthOverrideMbps==null?'':String(l.bandwidthOverrideMbps);
  const latency=l.latencyOverrideMs==null?'':String(l.latencyOverrideMs);
  const loss=l.lossPct==null?'0':String(l.lossPct);
  const mediaOptions=Object.entries(P.MEDIA).map(([k,v])=>'<option value="'+e(k)+'"'+
    (metric.medium===k?' selected':'')+'>'+e(v.label)+'</option>').join('');
  open('Kabel bearbeiten',
    headline((A?.label||'Gerät')+' → '+(B?.label||'Gerät'),
      'Verbindungsprofil, echte Modellwerte und Status dieser Strecke')+
    '<div class="vr-link-stats"><span><b>'+human(metric.metres,1)+' m</b><small>Länge</small></span>'+
      '<span><b>'+human(metric.mbps,1)+' Mbit/s</b><small>Kapazität</small></span>'+
      '<span><b>'+human(metric.latency,3)+' ms</b><small>Latenz</small></span></div>'+
    (metric.tooLong?'<p class="vr-cable-warning">Diese Leitung überschreitet die erlaubte Reichweite und überträgt im Simulator nicht.</p>':'')+
    '<div class="vr-form-block"><h3>Physikalische Verbindung</h3>'+
    '<label class="pl-field"><span>Medium</span><select name="medium">'+mediaOptions+'</select></label>'+
    '<div class="pl-grid">'+
    '<label class="pl-field"><span>Länge in m</span><input type="number" name="physicalMetres" min="0.1" max="1000000" step=".1" value="'+e(length)+'" placeholder="'+human(l.metres||1,1)+' (Canvas)"></label>'+
    '<label class="pl-field"><span>Bandbreite Mbit/s</span><input type="number" name="bandwidthOverrideMbps" min=".1" max="1000000" step=".1" value="'+e(speed)+'" placeholder="Medium-Standard"></label>'+
    '<label class="pl-field"><span>Latenz-Basis ms</span><input type="number" name="latencyOverrideMs" min="0" max="10000" step=".01" value="'+e(latency)+'" placeholder="Medium-Standard"></label>'+
    '<label class="pl-field"><span>Virtueller Verlust %</span><input type="number" name="lossPct" min="0" max="100" step=".1" value="'+e(loss)+'"></label></div>'+
    '<label class="pl-field"><span>Duplex</span><select name="duplex"><option value="full"'+
    (l.duplex==='half'?'':' selected')+'>Full Duplex</option><option value="half"'+
    (l.duplex==='half'?' selected':'')+'>Half Duplex</option></select></label>'+
    '<p class="vr-inline-explain">Länge, Medium und Bandbreite beeinflussen Ping-Laufzeit, Datendurchsatz und Erreichbarkeit. Leere Werte nutzen die Position im Canvas bzw. den Medientyp.</p></div>'+
    '<div class="vr-actions-footer">'+action('save','Übernehmen','vr-primary')+
      action('power',l.dead?'Reparieren':'Leitung trennen')+action('delete','Entfernen','vr-danger')+'</div>',root=>{
      root.querySelector('[data-vr-action="save"]').onclick=()=>{
        const val=name=>root.querySelector('[name="'+name+'"]')?.value||'';
        const m=val('medium');
        if(!P.MEDIA[m])return;
        const n=(key,min,max)=>{
          const v=val(key);if(!v)return null;
          const v2=Number(v);
          if(!Number.isFinite(v2)||v2<min||v2>max){throw Error('Ungültiger Wert für '+key)}return v2;
        };
        try{
          const chosen={
            medium:m,physicalMetres:n('physicalMetres',0.1,1000000),
            bandwidthOverrideMbps:n('bandwidthOverrideMbps',0.1,1000000),
            latencyOverrideMs:n('latencyOverrideMs',0,10000),
            lossPct:n('lossPct',0,100)||0,
            duplex:val('duplex')
          };
          C.pushHistory();
          Object.assign(l,chosen);
          C.refresh();
          N.lab.medium=m;
          syncMediumLabel();
          N.close();
          window.VeyraRefine.flash('Kabelprofil gespeichert');
        }catch(err){window.VeyraRefine.flash(err.message)}
      };
      root.querySelector('[data-vr-action="power"]').onclick=()=>{
        C.pushHistory();l.dead=!l.dead;C.refresh();
        showCableActions(id);
      };
      root.querySelector('[data-vr-action="delete"]').onclick=()=>{
        open('Verbindung löschen',headline('Kabel entfernen?',
          (A?.label||'')+' → '+(B?.label||'')+' wird wirklich getrennt.')+
          '<div class="vr-actions-footer">'+action('cancel','Abbrechen')+action('confirm','Ja, entfernen','vr-danger')+'</div>',
          box=>{
            box.querySelector('[data-vr-action="cancel"]').onclick=()=>showCableActions(id);
            box.querySelector('[data-vr-action="confirm"]').onclick=()=>{
              C.pushHistory();S.links=S.links.filter(x=>x.id!==id);C.refresh();N.close();
            };
          },'small');
      };
    });
}
function cableList(){
  open('Verkabelung',headline(S.links.length+' Leitungen',
    'Jede Verbindung besitzt ein eigenes Medium und messbare Werte.')+
    '<div class="vr-cable-overview"><span>Standard: <b>'+e(P.MEDIA[selectedMedium()].label)+'</b></span>'+
    '<button type="button" data-vr-action="choose">Medium wechseln</button></div>'+
    '<label class="vr-search"><span>⌕</span><input id="vr-cable-search" type="search" placeholder="Gerät, Typ oder Kabel suchen…" autocomplete="off"></label>'+
    '<div id="vr-cable-list" class="vr-cable-list"></div>',root=>{
      root.querySelector('[data-vr-action="choose"]').onclick=openCableSelection;
      const out=root.querySelector('#vr-cable-list');
      function draw(q=''){
        const matches=S.links.filter(l=>{
          const key=((dev(l.a)?.label||'')+' '+(dev(l.b)?.label||'')+' '+(P.MEDIA[l.medium]?.label||'Cable')).toLowerCase();
          return key.includes(q.toLowerCase());
        });
        out.innerHTML=matches.slice(0,100).map(l=>{
          const m=P.linkMetrics(l);
          return '<button class="vr-cable-entry" type="button" data-link="'+e(l.id)+'">'+
            '<span class="vr-cable-icon">⌁</span><span class="vr-cable-copy"><strong>'+e(dev(l.a)?.label||'?')+' — '+
            e(dev(l.b)?.label||'?')+'</strong><small>'+e(m.label)+' · '+human(m.metres,1)+' m · '+
            human(m.mbps,0)+' Mbit/s'+(m.tooLong?' · Reichweite überschritten':'')+
            (l.dead?' · getrennt':'')+'</small></span><span>›</span></button>';
        }).join('')+(matches.length>100?'<p class="vr-inline-explain">100 von '+matches.length+' Ergebnissen – Suche eingrenzen.</p>':'');
        out.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>showCableActions(b.dataset.link));
      }
      draw();
      root.querySelector('#vr-cable-search').oninput=ev=>draw(ev.target.value);
    });
}
// Palette catalog connection functions.
function attachCableActions(){
  deviceBrowser.querySelector('[data-vr-action="media"]').onclick=openCableSelection;
  deviceBrowser.querySelector('[data-vr-action="cables"]').onclick=cableList;
}
attachCableActions();

let selectedPacket=N.lab.packet && P.PACKETS[N.lab.packet]?N.lab.packet:'normal';
const packetMetadata={
 normal:['Normales Datenpaket','ARP und gewählte Route des ursprünglichen PacketLab-Simulators.','▤'],
 icmp:['Ping / ICMP','Erreichbarkeit, virtuelle Laufzeit und Hop-Anzahl prüfen.','⌁'],
 dns:['DNS Lookup','Simuliertes DNS-Request-Paket auf Port 53.','◎'],
 http:['HTTP','Unverschlüsseltes Webpaket auf Port 80.','≡'],
 https:['HTTPS','Webtransport über Port 443.','◇'],
 ssh:['SSH','Terminal-Transport als virtuelles Paket auf Port 22.','>_'],
 tcp:['TCP','Transport-Sitzung im Netzwerkmodell.','⇄'],
 udp:['UDP','Datagramm ohne garantierte Zustellung.','↝'],
 large:['Großes Paket','64 KiB Nutzlast; Test für Bandbreite und MTU.','▣'],
 mass:['Mass Package','50 Frames; längere virtuelle Übertragung und Auslastung.','⇶']
};
function packetName(type){
  return P.PACKETS[type]?.label||type;
}
function updatePackageButton(){
  const which=P.PACKETS[selectedPacket]?selectedPacket:'normal';
  N.lab.packet=which;
  const send=$('btnSend'),choose=$('pl-packet');
  if(send){
    send.textContent='▶ Paket senden';
    send.setAttribute('aria-label','Paket senden: '+packetName(which));
  }
  if(choose){
    choose.textContent=which==='normal'?'Standard  ▾':
      which.startsWith('vuln_')?'Vurnabil  ▾':(packetName(which).slice(0,12)+'  ▾');
    choose.title='Paketart: '+packetName(which);
    choose.setAttribute('aria-label','Paketart wählen: '+packetName(which));
    choose.classList.add('vr-current-packet');
  }
}
function choosePacket(type){
  if(!P.PACKETS[type])return;
  selectedPacket=type;N.lab.packet=type;updatePackageButton();
  N.close();window.VeyraRefine.flash('Paketart: '+packetName(type));
}
function openPacketMenu(){
  const usual=['normal','icmp','dns','http','https','ssh','tcp','udp'];
  const bulk=['large','mass'];
  const drawType=key=>{
    const data=P.PACKETS[key],meta=packetMetadata[key]||[data.label,'Virtuelles Paket','◇'];
    return '<button class="vr-packet-row'+(selectedPacket===key?' active':'')+'" data-vr-packet="'+e(key)+'">'+
      '<span class="vr-packet-icon">'+e(meta[2])+'</span>'+
      '<span class="vr-packet-copy"><strong>'+e(meta[0])+'</strong><small>'+e(meta[1])+'</small></span>'+
      '<span class="vr-packet-size">'+human(data.bytes||0,0)+' B</span></button>';
  };
  open('Paket senden',
    headline('Paketart auswählen','Pakete sind vollständig virtuell. Die Auswahl bleibt beim Senden aktiv.')+
    '<div class="vr-active-summary"><span>Ausgewählt</span><strong>'+e(packetName(selectedPacket))+'</strong></div>'+
    '<div class="vr-packet-section"><h3>Diagnose & Protokolle</h3>'+
      usual.map(drawType).join('')+'</div>'+
    '<div class="vr-packet-section"><h3>Last & Datenmengen</h3>'+
      bulk.map(drawType).join('')+'</div>'+
    '<div class="vr-packet-section vr-vuln-entry">'+
      '<button type="button" id="vr-open-vuln" class="vr-vuln-launch">'+
        '<span class="vr-vuln-symbol">⛨</span><span><strong>Vurnabil-Pakete</strong>'+
        '<small>Eigene Liste: Web, DNS, SMB, IoT, Authentifizierung und weitere virtuelle Szenarien</small></span>'+
        '<span class="vr-chevron">›</span></button></div>'+
    '<div class="vr-actions-footer">'+action('send','Jetzt senden','vr-primary')+'</div>',
    root=>{
      root.querySelectorAll('[data-vr-packet]').forEach(b=>b.onclick=()=>choosePacket(b.dataset.vrPacket));
      root.querySelector('#vr-open-vuln').onclick=()=>openVulnMenu();
      root.querySelector('[data-vr-action="send"]').onclick=()=>{N.close();dispatchPacket()};
    });
}
function openVulnMenu(){
  const vuln=P.VULNERABILITIES||{};
  const byCategory=[...new Set(Object.values(vuln).map(x=>x.category))];
  const sections=byCategory.map(cat=>
    '<section class="vr-packet-section"><h3>'+e(cat)+'</h3>'+
    Object.entries(vuln).filter(([id,v])=>v.category===cat).map(([id,v])=>
      '<button type="button" class="vr-packet-row" data-vr-vuln="'+e(id)+'">'+
      '<span class="vr-packet-icon">⛨</span><span class="vr-packet-copy"><strong>'+e(v.label)+'</strong>'+
      '<small>'+e(v.description)+'</small></span>'+
      '<span class="vr-severity">S'+e(v.severity)+'</span></button>').join('')+
    '</section>').join('');
  open('Vurnabil-Pakete',
    headline('Virtuelle Sicherheits-Pakete',
      'Jedes Szenario besitzt einen eigenen Pakettyp und lässt sich gegen Firewall- und Hostschutz testen.')+
    sections+'<div class="vr-actions-footer">'+action('back','Zurück zur Paketauswahl')+'</div>',
    root=>{
      root.querySelectorAll('[data-vr-vuln]').forEach(b=>b.onclick=()=>openVulnDetails(b.dataset.vrVuln));
      root.querySelector('[data-vr-action="back"]').onclick=openPacketMenu;
    });
}
function openVulnDetails(id){
  const v=P.VULNERABILITIES[id];if(!v)return;
  const src=dev(S.src),dst=dev(S.dst);
  const sim=src&&dst?P.evaluate(S,N.lab,src.id,dst.id,id):null;
  const pathBlocked=sim?.reason?.includes('Firewall')||sim?.reason?.includes('Threat Prevention');
  open(v.label,
    headline('Simulationsprofil',v.description)+
    '<div class="vr-link-stats">'+
       '<span><b>'+human(v.bytes,0)+' B</b><small>Payload</small></span>'+
       '<span><b>'+e(v.port)+'</b><small>Zielport</small></span>'+
       '<span><b>S'+e(v.severity)+'</b><small>Stärke</small></span></div>'+
    '<div class="vr-profile-details"><h3>Virtuelles Verhalten</h3>'+
       '<p>'+e('Ein Paket von '+(src?.label||'Sender')+' an '+(dst?.label||'Empfänger')+
       ' wird über den gewählten Pfad ausgewertet. Firewall- und Hostprofile entscheiden, ob die Bedrohung abgewehrt oder ein virtueller Befallsstatus gesetzt wird.')+'</p></div>'+
    '<div class="vr-defence-state"><span>Aktueller Routentest</span><strong>'+
      e(!sim?'Quelle/Ziel wählen':!sim.ok?(pathBlocked?'Durch Schutz blockiert':sim.reason):'Virtuelle Route erreichbar')+'</strong></div>'+
    '<div class="vr-actions-footer">'+action('back','Zurück')+
      action('select','Paket auswählen','vr-primary')+action('send','Test senden')+'</div>',
    root=>{
      root.querySelector('[data-vr-action="back"]').onclick=openVulnMenu;
      root.querySelector('[data-vr-action="select"]').onclick=()=>choosePacket(id);
      root.querySelector('[data-vr-action="send"]').onclick=()=>{
        choosePacket(id);
        dispatchPacket();
      };
    });
}
function dispatchPacket(){
  const kind=N.lab.packet&&P.PACKETS[N.lab.packet]?N.lab.packet:'normal';
  const response=N.sendPacket(kind);
  if(!response.ok){window.VeyraRefine.flash('Nicht zugestellt: '+response.reason)}
  return response;
}
$('pl-packet')?.addEventListener('click',ev=>{
  ev.preventDefault();ev.stopImmediatePropagation();openPacketMenu();
},true);
$('btnSend')?.addEventListener('click',ev=>{
  ev.preventDefault();ev.stopImmediatePropagation();dispatchPacket();
},true);
window.addEventListener('veyra-project-loaded',()=>{selectedPacket=N.lab.packet||'normal';updatePackageButton()});
updatePackageButton();

// The quick-add palette uses the same grouped hardware library as the full
// device tab. Relocating existing buttons keeps their original listeners.
function structurePalette(){
  const base=document.querySelector('.v-palette-list');
  if(!base||base.dataset.vrStructured)return;
  base.dataset.vrStructured='true';
  const original=[...base.querySelectorAll(':scope > [data-pick]')];
  const buttons=new Map(original.map(b=>[b.dataset.pick,b]));
  base.replaceChildren();
  const groups=catalog.concat([['Verbindungen',[['cable','Cable','Medium vor dem Ziehen auswählen']]]]);
  for(const [name,items] of groups){
    const container=document.createElement('section');container.className='vr-palette-group';
    const heading=document.createElement('h3');heading.textContent=name;
    const grid=document.createElement('div');grid.className='vr-palette-grid';
    for(const [kind] of items){
      const button=buttons.get(kind);
      if(button)grid.appendChild(button);
    }
    if(grid.children.length){container.append(heading,grid);base.appendChild(container)}
  }
  // Preserve unforeseen upstream device categories.
  const extras=[...buttons].filter(([key,b])=>!b.isConnected).map(([,b])=>b);
  if(extras.length){
    const group=document.createElement('section');group.className='vr-palette-group';
    group.innerHTML='<h3>Weitere</h3>';
    const grid=document.createElement('div');grid.className='vr-palette-grid';
    extras.forEach(b=>grid.appendChild(b));group.appendChild(grid);base.appendChild(group);
  }
  const finder=document.createElement('label');finder.className='vr-search vr-palette-search';
  finder.innerHTML='<span>⌕</span><input id="vr-palette-search" type="search" placeholder="Geräte suchen…" autocomplete="off">';
  base.insertAdjacentElement('beforebegin',finder);
  finder.querySelector('input').addEventListener('input',ev=>{
    const term=ev.target.value.toLowerCase();
    base.querySelectorAll('.vr-palette-group').forEach(group=>{
      let count=0;
      group.querySelectorAll('[data-pick]').forEach(b=>{
        const visible=b.textContent.toLowerCase().includes(term);
        b.hidden=!visible;if(visible)count++;
      });
      group.hidden=!count;
    });
  });
}
structurePalette();
const selectedBar=$('pl-selected');
const stage=document.querySelector('.stage');
const toolbar=document.querySelector('.v-float');
if(selectedBar&&stage&&toolbar)stage.insertBefore(selectedBar,toolbar);
const docEl=document.documentElement;
const liveFlash=document.createElement('div');liveFlash.id='vr-flash';liveFlash.className='vr-flash';
liveFlash.setAttribute('role','status');document.body.appendChild(liveFlash);
let flashTimeout;
function flash(msg){
  liveFlash.textContent=String(msg);liveFlash.classList.add('visible');
  clearTimeout(flashTimeout);flashTimeout=setTimeout(()=>liveFlash.classList.remove('visible'),2700);
}
let orientation=window.innerWidth>window.innerHeight;
let refitTimer;
window.addEventListener('resize',()=>{
  const mode=innerWidth>innerHeight;
  if(mode===orientation)return;
  orientation=mode;
  clearTimeout(refitTimer);
  // Orientation change is different from interactive device dragging and should
  // fit the entire topology to the newly available dimensions.
  refitTimer=setTimeout(()=>{
    try{C.view.resize();C.fitView();document.getElementById('btnZoomFit')?.click()}
    catch(e){console.warn('Fit after orientation',e)}
  },200);
});
// A compact toolbar hint, without extra floating badges or an intrusive dashboard.
const world=document.querySelector('.topbar__right');
if(world)world.setAttribute('aria-label','PacketLab project controls');
window.VeyraRefine={
  openPacketMenu,openVulnMenu,openVulnDetails,
  showCableActions,openCableSelection,cableList,showPicker,
  dispatchPacket,choosePacket,
  get selectedPacket(){return selectedPacket},
  get deviceCatalog(){return catalog},
  linkMetrics(id){return P.linkMetrics(link(id))},
  flash
};
console.info('Veyra 0.4 UI refined: system selects replaced, catalog, links, packet browser.');
})();
