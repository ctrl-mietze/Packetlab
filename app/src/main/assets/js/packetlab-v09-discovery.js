/* PacketLab v0.9 Building Agent; only reachable from the free-lab Quick Edit.
 * Passive discovery of user-authorized local services and Wi-Fi scan results.
 * No scanning on its own, no active address sweep, no device modification.
 */
(()=>{
'use strict';
const N=window.VeyraNext,C=window.VeyraCore,P=PacketLabCore,S=C.state;
if(!N||!C)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=t=>window.VeyraRefine?.flash?.(t)||console.info(t);
const val=root=>Object.fromEntries([...root.querySelectorAll('[name]')].map(x=>[x.name,x.type==='checkbox'?x.checked:x.value]));
let data=null,formState={topology:'star',mode:'main',include:true,permission:false};
let scanning=false,imported=new Set();
const mockTypes={'_printer._tcp.':'printer','_ssh._tcp.':'server','_http._tcp.':'server'};
const nodeType=s=>Object.keys(mockTypes).find(x=>String(s||'').includes(x))?
  mockTypes[Object.keys(mockTypes).find(x=>String(s||'').includes(x))]:'pc';
function summary(snapshot){
 const connection=snapshot?.connection||{},services=snapshot?.services||[],wifi=snapshot?.wifi||[];
 let html='<div class="v9-scan-results"><h3>Ergebnis der freigegebenen Erkennung</h3>';
 if(snapshot?.error)return html+'<p class="v9-note-error">'+esc(snapshot.error)+'</p></div>';
 html+='<div class="v9-mini-stats"><span><strong>'+services.length+'</strong>mDNS Geräte/Dienste</span>'+
 '<span><strong>'+wifi.length+'</strong>WLANs in Reichweite</span></div>';
 html+='<p class="v9-hint">Aktives WLAN: '+esc(connection.ssid||'SSID nicht verfügbar')+
  '. IPv4: '+esc(connection.ipv4||'unbekannt')+'/'+esc(connection.prefix||'?')+
  ', Gateway: '+esc(connection.gateway||'unbekannt')+
  '. Es werden keine WLAN-Kennwörter, Netzwerk-Sweeps oder versteckte Clients ausgelesen.</p>';
 html+='<div class="v9-found-list">'+services.map((item,i)=>'<label class="v9-found-device">'+
   '<input type="checkbox" data-v9-found="'+i+'" '+(!imported.has(i)?'checked':'')+'>'+
   '<span><b>'+esc(item.name||'Dienst')+'</b><small>'+esc(item.ip||'IP nicht verfügbar')+
   ' · '+esc(item.type)+' · Port '+esc(item.port||0)+'</small></span></label>').join('')+
   (!services.length?'<p class="v9-hint">Keine mDNS-Dienste antworteten. Das bedeutet nicht, dass keine weiteren Geräte existieren. Du kannst Geräte manuell hinzufügen.</p>':'')+'</div>';
 html+='<details><summary>WLANs in der Umgebung ('+wifi.length+')</summary><div class="v9-found-list">'+
 wifi.map(w=>'<p>'+esc(w.ssid)+' · '+esc(w.rssi)+' dBm · '+esc(w.frequencyMhz)+' MHz</p>').join('')+
 (!wifi.length?'<p>Keine WLAN-Ergebnisse vorhanden.</p>':'')+'</div></details>';
 return html+'</div>';
}
function renderAgent(){
 N.open('Building Agent · Create my Network',
  '<div class="v9-header"><b>Netzwerkerkennung mit deiner Freigabe</b><small>Nur im freien Network Lab. WLANs aus der Umgebung und mDNS Dienste werden auf deinem Gerät über Android erkannt.</small></div>'+
  '<div class="v9-note"><b>Was wird erfasst?</b><p>Das aktuell verbundene WLAN, der eigene IPv4 Gateway, die Netzwerkmaske, sichtbare WLAN Namen und freiwillig veröffentlichte mDNS Dienste. Andere versteckte Geräte werden nicht garantiert gefunden.</p></div>'+
  '<label class="v9-check"><input type="checkbox" name="permission" '+(formState.permission?'checked':'')+
  '><span>Ich bin zur Analyse dieses Netzwerks berechtigt und möchte die Erkennung ausdrücklich starten.</span></label>'+
  '<div class="v9-actions"><button id="v9-scan" class="v9-action v9-primary" type="button"'+(scanning?' disabled':'')+'>'+
  (scanning?'Erkennung läuft …':'WLAN und Geräte jetzt erkennen')+'</button></div>'+
  '<div id="v9-scanner-output">'+(data?summary(data):'<p class="v9-hint">Noch kein Netzwerkscan gestartet. Du kannst auch ohne Scan eine Topologie vorbereiten.</p>')+'</div>'+
  '<div class="v9-two-col">'+
  '<label class="v9-field"><span>Deine Netzstruktur</span><select name="topology">'+[
     ['star','Stern für ein typisches Heimnetz'],['tree','Hierarchie mit Core und Etagen'],
     ['ring','Redundanter Ring'],['hybrid','Gemischte Netzstruktur'],['empty','Leeres Lab']
  ].map(([k,t])=>'<option value="'+k+'"'+(k===formState.topology?' selected':'')+'>'+t+'</option>').join('')+
  '</select></label>'+
  '<label class="v9-field"><span>Dein Gerätemodus</span><select name="mode">'+[
   ['main','Hauptnetzwerk / Router'],['repeater','WLAN Repeater / Erweiterung']
  ].map(([k,t])=>'<option value="'+k+'"'+(k===formState.mode?' selected':'')+'>'+t+'</option>').join('')+'</select></label></div>'+
  '<label class="v9-check"><input type="checkbox" name="include" '+(formState.include?'checked':'')+
  '><span>Entdeckte Geräte beim Erstellen automatisch hinzufügen</span></label>'+
  '<div class="v9-actions"><button id="v9-build-from-scan" class="v9-action v9-primary" type="button">'+
  'Mein Network Lab erstellen</button><button id="v9-scan-cancel" class="v9-action" type="button">Abbrechen</button></div>',
 root=>{
  const saveOptions=()=>{
   const v=val(root);
   formState={topology:v.topology,mode:v.mode,include:v.include,permission:v.permission};
  };
  root.querySelectorAll('select,input').forEach(x=>x.addEventListener('change',saveOptions));
  root.querySelector('#v9-scan').onclick=()=>{
    saveOptions();
    if(!formState.permission){status('Bitte zuerst ausdrücklich dem Scan zustimmen');return}
    if(!window.VeyraNative?.requestNetworkSnapshot){
      data={error:'Nur die native Android App kann WLAN- und mDNS-Daten abrufen. Im Browser ist diese Funktion deaktiviert.'};
      renderAgent();return;
    }
    scanning=true;renderAgent();
    try{window.VeyraNative.requestNetworkSnapshot()}
    catch(e){scanning=false;data={error:'Erkennung nicht verfügbar: '+e.message};renderAgent()}
  };
  root.querySelector('#v9-build-from-scan').onclick=()=>{saveOptions();build()};
  root.querySelector('#v9-scan-cancel').onclick=N.close;
 },'wide');
}
function receive(obj){
 scanning=false;
 data=obj&&typeof obj==='object'?obj:{error:'Unbekannte Antwort der WLAN-Erkennung'};
 if(window.PacketLabV09Training?.role()!=='network')return;
 renderAgent();
 if(!data.error)status((data.services||[]).length+' virtuelle Gerätevorlagen aus mDNS verfügbar');
}
function build(){
 if(window.PacketLabV09Training?.role()!=='network')return;
 const choice=formState,services=(data?.services||[]).filter((_,i)=>{
  const input=document.querySelector('[data-v9-found="'+i+'"]');
  return choice.include&&(!input||input.checked);
 });
 if(S.devices.length)N.saveDraft('Vor Building Agent');
 N.presetBuild('empty',8,{skipDraft:true});
 N.lab.v9Role='network';
 N.lab.title='My Network · '+(data?.connection?.ssid||'Personal Lab').slice(0,40);
 const net=data?.connection||{};
 const router=C.addDevice('router',400,90,{quiet:true});
 if(net.gateway&&P.v4(net.gateway)){
  router.ip=net.gateway;router.ips=[net.gateway];
  router.vprofile=P.sanitizeProfile({...router.vprofile,ipv4:net.gateway,
    subnet:maskFromPrefix(net.prefix),hostname:'Gateway'},router);
 }
 const switchNode=C.addDevice(choice.mode==='repeater'?'ap':'switch',400,235,{quiet:true});
 C.connectDevices(router.id,switchNode.id);
 const nodes=[];
 for(const [i,serv] of services.slice(0,26).entries()){
  if(!P.v4(serv.ip))continue;
  const angle=Math.PI*2*i/Math.max(1,services.length);
  const x=400+Math.cos(angle)*280,y=410+Math.sin(angle)*95;
  const n=C.addDevice(nodeType(serv.type),x,y,{quiet:true});
  n.label=String(serv.name||'Service').replace(/[^\w. ]/g,'').slice(0,18)||n.label;
  n.ip=serv.ip;n.ips=[serv.ip];
  n.vprofile=P.sanitizeProfile({...n.vprofile,ipv4:serv.ip,
    subnet:maskFromPrefix(net.prefix),gateway:net.gateway||'',hostname:n.label,
    note:'Aus freigegebener mDNS-Erkennung importiert. MAC ist nur die simulierte Platzhalter-MAC.'},n);
  C.connectDevices(switchNode.id,n.id);nodes.push(n);
 }
 if(choice.mode==='repeater'){
  const p=C.addDevice('phone',560,315,{quiet:true});
  p.vprofile=P.sanitizeProfile({...p.vprofile,mobileOs:'Android',os:'Android',
    rooted:true,repeater:true},p);
  C.connectDevices(switchNode.id,p.id);
 }
 C.refresh();
 P.createEvent(N.lab,S.devices,'Building Agent: '+services.length+' freigegebene mDNS Dienste als virtuelle Geräte importiert','system',[]);
 N.close();status('Netzwerk erstellt: '+(nodes.length+2)+' virtuelle Geräte');
}
function maskFromPrefix(prefix){
 const n=Math.max(0,Math.min(32,+prefix||24));
 const bits=n===0?0:(0xffffffff<<(32-n))>>>0;
 return [24,16,8,0].map(i=>(bits>>>i)&255).join('.');
}
window.PacketLabV09Discovery={openAgent:renderAgent,receive,build,get data(){return data}};
console.info('PacketLab v0.9 Building Agent: opt-in only, no hidden network probes.');
})();
