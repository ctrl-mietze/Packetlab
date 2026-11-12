/* PacketLab v0.6.0 interactive tools.
 * Additive extension of TopoLab -> PacketLab v0.5: preserve original controls.
 */
(()=>{'use strict';
 const N=window.VeyraNext,C=window.VeyraCore,P=PacketLabCore,E=PacketLabV06;
 if(!N||!C||!P||!E){console.error('PacketLab v0.6 dependencies unavailable');return}
 const S=C.state,$=id=>document.getElementById(id),dev=id=>S.devices.find(d=>d.id===id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const lab=()=>N.lab,kind=d=>d?.type||'',native=()=>!!window.VeyraNative;
 const baseIcon=(path)=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
 const ICON={
  plus:baseIcon('<path d="M12 4v16M4 12h16"/>'),
  network:baseIcon('<circle cx="4" cy="12" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="20" cy="19" r="2"/><path d="m6 11 12-5M6 13l12 5"/>'),
  book:baseIcon('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  send:baseIcon('<path d="m3 3 18 9-18 9 4-9zM7 12h14"/>'),
  shield:baseIcon('<path d="M12 2 21 6v6c0 6-4 9-9 10-5-1-9-4-9-10V6zM9 12l2 2 4-4"/>'),
  chevron:baseIcon('<path d="m7 9 5 5 5-5"/>'),
  upload:baseIcon('<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>'),
  clock:baseIcon('<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'),
  circle:baseIcon('<circle cx="12" cy="12" r="9"/>'),
  config:baseIcon('<path d="M4 7h16M4 12h16M4 17h16M9 5v4M15 10v4M9 15v4"/>')
 };
 const say=m=>window.VeyraRefine?.flash?.(m)||console.info(m);
 const action=(name,title)=>'<button type="button" class="v06-btn" data-v06="'+name+'">'+title+'</button>';
 // Preserve the original device inspector while honoring the Master-only terminal policy.
 const oldDeviceActions=N.showDeviceActions.bind(N);
 N.showDeviceActions=function(id){
   oldDeviceActions(id);
   const device=dev(id),box=$('pl-sheet')?.querySelector('.pl-options');
   if(!box||!device)return;
   if(lab().mode==='master'){
     box.querySelectorAll('[data-action="easy"],[data-action="more"]').forEach(b=>b.remove());
   }else if(E.isHost(device)||E.isFirewall(device)){
     const fw=document.createElement('button');
     // Standard menu row: no special violet background/border or double icon.
     // The shared device-row decorator inserts the shield exactly once.
     fw.type='button';fw.className='v07-firewall-row';
     fw.innerHTML='<b>'+(E.isHost(device)?'Software-Firewall konfigurieren':'Netzwerk-Firewall konfigurieren')+
       '</b><small>Regeln, Default-Policy, Prüfung, Lastschutz und Logs</small>';
     fw.onclick=()=>openFirewall(id);
     const term=box.querySelector('[data-action="term"]');
     if(term)term.insertAdjacentElement('afterend',fw);else box.append(fw);
   }
 };
 const oldEdit=C.editDevice.bind(C);
 C.editDevice=id=>lab().mode==='master'?N.terminal(id):oldEdit(id);
 const oldMore=N.editMore.bind(N);
 N.editMore=id=>{
   if(lab().mode==='master')return N.terminal(id);
   oldMore(id);
   const d=dev(id),body=$('pl-sheet')?.querySelector('.pl-body');
   if(!body||!d)return;
   if(['switch','hub','ap','wlc'].includes(d.type)){
     body.querySelector('[name="firewallEnabled"]')?.closest('label')?.remove();
     body.querySelector('[name="blockThreats"]')?.closest('label')?.remove();
   }
   if(E.isHost(d)||E.isFirewall(d)){
     const btn=document.createElement('button');btn.type='button';btn.className='v06-btn v06-firewall-config';
     btn.innerHTML=ICON.shield+' <span>'+(E.isHost(d)?'Software-Firewall':'Dedizierte Firewall')+' konfigurieren</span>';
     btn.onclick=()=>openFirewall(id);
     body.querySelector('#pl-error')?.insertAdjacentElement('beforebegin',btn);
   }
 };
 function saveFirewall(id,mutate){
   const d=dev(id);if(!d)return;
   C.pushHistory();
   const p=E.profile(d),before=E.sanitizeFirewall(p.fwPolicy);
   mutate(before);
   before.hostMode=E.isHost(d);
   p.fwPolicy=E.sanitizeFirewall(before);
   p.firewallEnabled=!!before.enabled;
   if(before.enabled && p.blockThreats===undefined)p.blockThreats=true;
   P.createEvent(lab(),S.devices,d.label+': Firewall policy updated ('+(before.enabled?'enabled':'disabled')+')','security',[id]);
   C.refresh();
 }
 function openFirewall(id){
   const d=dev(id);if(!d||!E.isHost(d)&&!E.isFirewall(d))return;
   if(lab().mode==='master'){N.terminal(id);return}
   const p=E.profile(d),fw=E.sanitizeFirewall(p.fwPolicy);
   const rules=fw.rules.map((r,i)=>'<article class="v06-rule-row"><span class="v06-rule-action '+r.action+'">'+esc(r.action.toUpperCase())+'</span>'+
     '<span><b>'+esc(r.protocol)+' '+esc(r.port)+'</b><small>'+esc(r.source)+' → '+esc(r.target)+' · '+esc(r.zone)+'</small></span>'+
     '<button data-v06-delete="'+i+'" type="button" aria-label="Delete firewall rule">×</button></article>').join('');
   N.open((E.isHost(d)?'Software Firewall':'Network Firewall')+' · '+d.label,
     '<div class="v06-firewall-head">'+ICON.shield+'<div><b>'+esc(d.label)+'</b><small>'+esc(E.isHost(d)?'Only packets entering this host':'Traffic must physically pass through this device')+'</small></div></div>'+
     '<div class="v06-config-grid">'+
     '<label>Firewall status<select id="v06-fw-active"><option value="0"'+(!fw.enabled?' selected':'')+'>Disabled</option><option value="1"'+(fw.enabled?' selected':'')+'>Enabled</option></select></label>'+
     '<label>Default policy<select id="v06-fw-default"><option value="allow"'+(fw.policy==='allow'?' selected':'')+'>Allow unmatched</option><option value="deny"'+(fw.policy==='deny'?' selected':'')+'>Deny unmatched</option></select></label>'+
     '<label>Rate limit Mbit/s<input type="number" id="v06-fw-rate" min="1" max="100000" value="'+fw.rateLimitMbps+'"></label>'+
     '<label>Burst limit (frames)<input type="number" id="v06-fw-burst" min="1" max="100000" value="'+fw.burstPackets+'"></label>'+
     '</div><div class="v06-toggles">'+
     checkbox('v06-fw-inspect','Deep packet inspection',fw.inspection)+
     checkbox('v06-fw-spoof','Anti-spoofing',fw.strictSpoof)+
     checkbox('v06-fw-logging','Write per-device firewall logs',fw.logging)+
     checkbox('v06-fw-evasion','Allow simulated filter evasion if inspection is off',fw.allowEvasion)+
     '</div><div class="v06-section-caption">Firewall rules · top to bottom, first match wins</div>'+
     '<div class="v06-rule-list">'+(rules||'<p class="pl-help">No custom rules. The default policy is used.</p>')+'</div>'+
     '<div class="v06-rule-add"><select id="v06-rule-action"><option value="deny">Deny</option><option value="allow">Allow</option><option value="log">Log</option></select>'+
     '<select id="v06-rule-proto">'+['any','tcp','udp','icmp','dns','http','https','ssh'].map(x=>'<option>'+x+'</option>').join('')+'</select>'+
     '<input id="v06-rule-port" value="any" aria-label="Target port" placeholder="any / 443">'+
     '<select id="v06-rule-zone"><option value="any">Any zone</option><option value="lan">Local LAN</option><option value="wan">WAN</option></select></div>'+
     '<div class="v06-sheet-actions">'+action('fw-default','Standard configuration')+action('fw-rule','Add rule')+
       action('fw-save','Save firewall')+'</div>'+
     '<p class="pl-help">Physical, virtual routing still applies. A PC firewall protects only this PC. A dedicated firewall evaluates traffic that crosses its actual cable path. Switches do not have a firewall.</p>',
     root=>{
       const field=s=>root.querySelector(s);
       const read=()=>({
         ...fw,enabled:field('#v06-fw-active').value==='1',policy:field('#v06-fw-default').value,
         rateLimitMbps:Number(field('#v06-fw-rate').value),burstPackets:Number(field('#v06-fw-burst').value),
         inspection:field('#v06-fw-inspect').checked,strictSpoof:field('#v06-fw-spoof').checked,
         logging:field('#v06-fw-logging').checked,allowEvasion:field('#v06-fw-evasion').checked
       });
       const commit=x=>saveFirewall(id,old=>Object.assign(old,x));
       root.querySelector('[data-v06="fw-save"]').onclick=()=>{commit(read());N.close();say('Firewall configuration saved')};
       root.querySelector('[data-v06="fw-default"]').onclick=()=>{
         commit({...E.defaults(),enabled:true,hostMode:E.isHost(d)});
         openFirewall(id);say('Standard firewall policy active');
       };
       root.querySelectorAll('[data-v06-delete]').forEach(b=>b.onclick=()=>{
         const current=read();current.rules.splice(+b.dataset.v06Delete,1);commit(current);openFirewall(id);
       });
       root.querySelector('[data-v06="fw-rule"]').onclick=()=>{
         const current=read();const value=field('#v06-rule-port').value.trim().toLowerCase();
         if(value!=='any'&&(!/^\d{1,5}$/.test(value)||+value>65535)){say('Port must be 0–65535 or any');return}
         current.rules.push({action:field('#v06-rule-action').value,protocol:field('#v06-rule-proto').value,
           port:value==='any'?'any':Number(value),source:'any',target:'any',zone:field('#v06-rule-zone').value});
         commit(current);openFirewall(id);
       };
     },'wide');
 }
 function checkbox(id,label,checked){return '<label><input id="'+id+'" type="checkbox" '+(checked?'checked':'')+'><span>'+label+'</span></label>'}
 // Virtual console: real local state modifications, not pretend text echoes.
 const previousTerminal=window.VeyraTerminal?.execute?.bind(window.VeyraTerminal);
 if(previousTerminal){
  window.VeyraTerminal.execute=function(id,command){
    const d=dev(id),line=String(command||'').trim();
    if(!d)return 'Device unavailable';
    const bits=line.toLowerCase().split(/\s+/);
    if(bits[0]==='firewall'){
      const current=E.sanitizeFirewall(E.profile(d).fwPolicy);
      if(!E.isHost(d)&&!E.isFirewall(d))return 'This device type does not support host or routed firewall rules.';
      const help='firewall status | enable | disable | default allow|deny | allow tcp 443 | deny udp 53 | log | reset';
      if(bits.length===1||bits[1]==='help')return help;
      if(bits[1]==='status')return JSON.stringify(current,null,2);
      if(bits[1]==='log')return (E.profile(d).logs||[]).filter(x=>/firewall/i.test(x.text)).slice(-15).map(x=>x.time+' '+x.text).join('\n')||'No firewall records.';
      if(bits[1]==='enable'||bits[1]==='disable'){
        saveFirewall(id,p=>{p.enabled=bits[1]==='enable'});
        return 'Firewall '+bits[1]+'d';
      }
      if(bits[1]==='default'&&['allow','deny'].includes(bits[2])){
        saveFirewall(id,p=>{p.enabled=true;p.policy=bits[2]});return 'Default inbound policy '+bits[2];
      }
      if(bits[1]==='reset'){saveFirewall(id,p=>Object.assign(p,E.defaults()));return 'Factory firewall policy restored';}
      if(['allow','deny'].includes(bits[1])&&['tcp','udp','icmp','dns','http','https','ssh','any'].includes(bits[2])){
        const port=bits[3]||'any';
        if(port!=='any' && (!/^\d+$/.test(port)||+port>65535))return 'Invalid port';
        saveFirewall(id,p=>{p.enabled=true;p.rules.push({action:bits[1],protocol:bits[2],
          port:port==='any'?'any':Number(port),source:'any',target:'any',zone:'any'})});
        return 'Rule added: '+bits[1]+' '+bits[2]+' '+port;
      }
      return help;
    }
    return previousTerminal(id,command);
  };
 }
 // Optional packet dock (collapsed by default) and two-tap graphical source/destination.
 const sendbar=document.querySelector('.sendbar');
 let chooseEndpoints=0, expanded=false,transferMode=false,pickingFromDock=false;
 const pickerOverlay=document.createElement('div');pickerOverlay.className='v06-pick-overlay';pickerOverlay.hidden=true;
 document.querySelector('.stage')?.append(pickerOverlay);
 const kindChoices=Object.entries(P.PACKETS).map(([key,cfg])=>'<option value="'+esc(key)+'">'+esc(cfg.label)+'</option>').join('');
 let panel;
 if(sendbar){
   sendbar.classList.add('v06-sendbar','v06-collapsed');
   const title=document.createElement('div');title.className='v06-sendhead';
   title.innerHTML='<button id="v06-expand-packet" type="button" aria-expanded="false">'+ICON.send+
     '<span><strong>Paket senden</strong><small>Quellen, Ziele, Protokolle und virtuelle Übertragung</small></span>'+
     ICON.chevron+'</button><button id="v06-sim-state" type="button">Simulation: läuft</button>';
   sendbar.prepend(title);
   panel=document.createElement('section');panel.className='v06-packet-panel';
   panel.innerHTML='<div class="v06-panel-intro"><div><b>Packet console</b><span>Pakete laufen über echte virtuelle Verbindungen.</span></div>'+
     '<button class="v06-btn" id="v06-pick-endpoints">'+ICON.network+' <span>Quelle → Ziel antippen</span></button></div>'+
     '<div id="v06-pick-notice" class="v06-pick-notice" hidden>Wähle zuerst die Quelle auf dem Netzplan.</div>'+
     '<div class="v06-packet-fields">'+
     '<label>Pakettyp<select id="v06-kind">'+kindChoices+'</select></label>'+
     '<label>Netzbereich<select id="v06-zone"><option value="lan">Lokales Netzwerk</option><option value="wan">Internet / WAN</option></select></label>'+
     '<label>Transport<select id="v06-proto"><option value="tcp">TCP</option><option value="udp">UDP</option><option value="icmp">ICMP</option><option value="dns">DNS</option><option value="http">HTTP</option><option value="https">HTTPS</option><option value="ssh">SSH</option></select></label>'+
     '<label>Zielport<input id="v06-port" type="number" min="0" max="65535" value="443"></label>'+
     '<label>Paketgröße (B)<input id="v06-bytes" type="number" min="1" max="65536" value="1500"></label>'+
     '<label>Anzahl Frames<input id="v06-count" type="number" min="1" max="100000" value="1"></label></div>'+
     '<div class="v06-packet-options">'+checkbox('v06-spoof','Spoofing im Modell simulieren',false)+
       checkbox('v06-evasion','Evasion gegen konfiguriertes IDS testen',false)+'</div>'+
     '<div class="v06-packet-fields"><label>Simulierter Effekt<select id="v06-impact"><option value="none">Nur Netzwerk-/Hostlogs</option><option value="degrade">Virtuelle Leistung beeinträchtigen</option><option value="outage">Gerät explizit offline simulieren</option></select></label>'+
     '<label>Übertragung<select id="v06-transfer"><option value="single">Einmaliges Paket / Batch</option><option value="upload">Langer Upload</option><option value="download">Langer Download</option></select></label>'+
     '<label>Dauer (s)<input id="v06-duration" type="number" min="1" max="3600" value="30"></label>'+
     '<label>Rate (Mbit/s)<input id="v06-rate" type="number" min="0.1" max="10000" value="10"></label></div>'+
     '<div class="v06-sendfoot"><div id="v06-last-result" role="status">Bereit zum Senden</div><button id="v06-send-now" type="button" class="v06-btn v06-primary">'+ICON.send+' Senden</button></div>';
   sendbar.append(panel);
   const toggle=()=>{expanded=!expanded;sendbar.classList.toggle('v06-collapsed',!expanded);
     $('v06-expand-packet').setAttribute('aria-expanded',String(expanded));
     if(!expanded&&!chooseEndpoints){$('v06-pick-notice').hidden=true}
     C.view.resize();C.fitView();
   };
   $('v06-expand-packet').onclick=toggle;
   // Intercept all packet send actions so every packet uses the same model and logs.
   $('btnSend')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();dispatch()},true);
   $('v06-send-now').onclick=dispatch;
   $('v06-pick-endpoints').onclick=()=>{
     chooseEndpoints=1;$('v06-pick-notice').hidden=false;
     $('v06-pick-notice').textContent='Schritt 1 / 2: Quelle im Netzwerk antippen';
     pickerOverlay.textContent='1 / 2 · QUELLE ANTIPPEN';pickerOverlay.hidden=false;
     if(expanded){pickingFromDock=true;toggle()}
     say('Quelle auswählen');
   };
   $('v06-kind').value=lab().packet||'normal';
   $('v06-kind').addEventListener('change',e=>{
     const k=e.target.value,packet=P.PACKETS[k];
     if(packet){lab().packet=k;$('v06-port').value=packet.port||0;$('v06-bytes').value=packet.bytes;
       $('v06-count').value=packet.count||1;
       if(['icmp','dns','udp','http','https','ssh'].includes(k))$('v06-proto').value=k;
     }
   });
   $('v06-sim-state').onclick=()=>{
     if(N.running){lab().manualPaused=true;N.stopVS();}else N.startVS();
     updateStatus();
   };
 }
 function dispatch(){
   if(!S.src||!S.dst){say('Bitte Quelle und Ziel auswählen');return {ok:false,reason:'Endpoints missing'}}
   const kind=$('v06-kind')?.value||lab().packet||'normal';
   const spec={source:S.src,target:S.dst,kind,protocol:$('v06-proto').value,
     zone:$('v06-zone').value,port:Number($('v06-port').value),bytes:Number($('v06-bytes').value),
     count:Number($('v06-count').value),spoof:$('v06-spoof').checked,evasion:$('v06-evasion').checked,
     impact:$('v06-impact').value,rateMbps:Number($('v06-rate').value)};
   try{
     let result;
     if($('v06-transfer').value!=='single'){
       result=E.newFlow(S,lab(),{...spec,duration:Number($('v06-duration').value),rateMbps:Number($('v06-rate').value),direction:$('v06-transfer').value});
       say('Virtuelle Übertragung gestartet');
       $('v06-last-result').textContent='Transfer gestartet · '+result.duration+' s';
     }else{
       result=E.send(S,lab(),spec);
       if(result.ok && result.path?.length>1){
         const route=P.route(S,S.src,S.dst);
         try{if(route&&!C.engine.busy())Sim.sendData(C.engine,route,{label:kind.toUpperCase(),port:spec.port,devices:S.devices,links:S.links})}catch(_){}
       }
       const summary=result.ok?'Zugestellt: '+result.delivered+' Frames · '+result.hops+' Hops':
         'Blockiert: '+result.reason;
       $('v06-last-result').textContent=summary;
       say(summary);
     }
     C.refresh();updateStatus();
     return result;
   }catch(error){say(error.message);$('v06-last-result').textContent=error.message;return {ok:false,reason:error.message}}
 }
 function findNodeAt(e){
   const canvas=$('canvas'),rect=canvas?.getBoundingClientRect();
   if(!rect)return null;
   const p=C.view.toLocal({clientX:e.clientX,clientY:e.clientY});
   const nearest=window.VeyraWiring?.nearestDevice?.(p,32);
   if(nearest)return nearest;
   const w=C.view.zoom||1,margin=35/w;
   return S.devices.find(d=>Math.hypot((d.tx??d.x)-p.x,(d.ty??d.y)-p.y)<margin)||null;
 }
 $('canvas')?.addEventListener('pointerdown',e=>{
   if(!chooseEndpoints)return;
   const node=findNodeAt(e);
   e.preventDefault();e.stopImmediatePropagation();
   if(!node){say('Ein Gerät antippen');return}
   if(chooseEndpoints===1){S.src=node.id;chooseEndpoints=2;
     pickerOverlay.textContent='2 / 2 · ZIEL ANTIPPEN';
     $('v06-pick-notice').textContent='Schritt 2 / 2: Ziel im Netzwerk antippen';
   }else{
     if(node.id===S.src){say('Ziel muss von der Quelle verschieden sein');return}
     S.dst=node.id;chooseEndpoints=0;$('v06-pick-notice').hidden=true;pickerOverlay.hidden=true;
     if(pickingFromDock){pickingFromDock=false;setTimeout(()=>{if(!expanded)$('v06-expand-packet')?.click()},120)}
     say('Route: '+dev(S.src).label+' → '+dev(S.dst).label);
   }
   $('srcSelect').value=S.src||'';$('dstSelect').value=S.dst||'';
   for(const id of ['srcSelect','dstSelect'])$(id).dispatchEvent(new Event('change',{bubbles:true}));
   C.refresh();updateStatus();
 },true);
 const btnCreate=document.createElement('button');btnCreate.id='v06-build-network';btnCreate.className='pl-tool v06-tool';
 btnCreate.type='button';btnCreate.title='Build a Network: leere Arbeitsfläche';btnCreate.innerHTML=ICON.network+
   '<span class="v06-tool-label">Build a Network</span>';
 btnCreate.onclick=()=>confirmNewBlank();
 const btnLearn=document.createElement('button');btnLearn.id='v06-learning-mode';btnLearn.className='pl-tool v06-tool';
 btnLearn.type='button';btnLearn.title='Learning Mode';btnLearn.innerHTML=ICON.book+'<span class="v06-tool-label">Learning</span>';
 btnLearn.onclick=()=>learningEntry();
 const tools=document.querySelector('.stage');
 if(tools){
   const rail=document.createElement('div');rail.className='v06-action-rail';
   rail.append(btnCreate,btnLearn);tools.append(rail);
 }
 function confirmNewBlank(){
   N.open('Build a Network',
     '<div class="v06-hero-card">'+ICON.network+'<div><b>Starte mit einem leeren Netzplan</b>'+
     '<small>Keine Geräte, keine Kabel – frei aufbauen. Deine vorhandenen Tools bleiben bestehen.</small></div></div>'+
     '<p class="pl-help">Dein bisheriges Werk wird automatisch als Entwurf gesichert. Du kannst zusätzlich eine .pklab exportieren.</p>'+
     '<div class="v06-sheet-actions">'+action('blank-save','Vorherige .pklab speichern')+
       action('blank-start','Leeren Netzplan erstellen')+action('cancel','Abbrechen')+'</div>',
     root=>{
       root.querySelector('[data-v06="blank-save"]').onclick=()=>N.doSave();
       root.querySelector('[data-v06="blank-start"]').onclick=()=>{
         N.saveDraft('Vor Build a Network');N.switchMode('standard');N.presetBuild('empty');
         lab().tasks=[];lab().dnsRecords=[];lab().flows=[];lab().mode='standard';lab().preset='empty';lab().title='Build a Network';
         N.updateSelected();updateStatus();say('Leerer Network-Workspace bereit');
       };
       root.querySelector('[data-v06="cancel"]').onclick=N.close;
     },'wide');
 }
 function learningEntry(){
   const existing=S.devices.length||S.links.length||lab().tasks.length;
   if(!existing){learningHub();return}
   N.open('Learning Mode · Workspace-Wechsel',
     '<div class="v06-hero-card">'+ICON.book+'<div><b>Vorherigen Netzplan behalten?</b>'+
       '<small>Beim Öffnen des Learning Mode wird die sichtbare Topologie geleert. Du entscheidest über deine Arbeit.</small></div></div>'+
     '<div class="v06-choice-grid">'+
       '<button data-v06="learn-save"><b>Als .pklab speichern</b><small>Exportieren, dann Learning öffnen</small></button>'+
       '<button data-v06="learn-draft"><b>In der App sichern</b><small>Lokaler Entwurf, später wieder laden</small></button>'+
       '<button data-v06="learn-discard"><b>Ohne Sicherung verwerfen</b><small>Netzplan und Aufgaben entfernen</small></button>'+
     '</div><div class="v06-sheet-actions">'+action('learn-cancel','Abbrechen')+'</div>',
     root=>{
       root.querySelector('[data-v06="learn-save"]').onclick=()=>{N.doSave();learningHub()};
       root.querySelector('[data-v06="learn-draft"]').onclick=()=>{N.saveDraft('Learning Mode');learningHub()};
       root.querySelector('[data-v06="learn-discard"]').onclick=()=>{learningHub(true)};
       root.querySelector('[data-v06="learn-cancel"]').onclick=N.close;
     },'wide');
 }
 function learningHub(discard=false){
   if(discard){
     // This is an explicit discard request. Remove the current draft snapshot,
     // but retain other already-saved projects and the original source files.
     N.presetBuild('empty',8,{skipDraft:true});lab().tasks=[];lab().dnsRecords=[];
   }
   N.open('Learning Mode · Start',
     '<div class="v06-hero-card">'+ICON.book+'<div><b>Was möchtest du lernen?</b>'+
     '<small>Aufgaben, freie Übungen und gespeicherte .pklab-Dateien</small></div></div>'+
     '<div class="v06-choice-grid">'+
       '<button data-v06="learn-empty"><b>Neue Aufgabe erstellen</b><small>Leeres Network Master Lab und eigene Aufgaben</small></button>'+
       '<button data-v06="learn-presets"><b>Lern-Presets</b><small>IPv4, IPv6, DNS, WAN, Routing, Firewall, Campus</small></button>'+
       '<button data-v06="learn-files"><b>.pklab-Datei öffnen</b><small>Master- oder Standard-Lab importieren</small></button>'+
       '<button data-v06="learn-local"><b>Gespeicherte Projekte</b><small>Lokale Entwürfe und zuvor gespeicherte Übungen</small></button></div>',
     root=>{
       root.querySelector('[data-v06="learn-empty"]').onclick=()=>{startLearning('empty')};
       root.querySelector('[data-v06="learn-presets"]').onclick=learningPresets;
       root.querySelector('[data-v06="learn-files"]').onclick=()=>N.doOpen();
       root.querySelector('[data-v06="learn-local"]').onclick=learningDrafts;
     },'wide');
 }
 function learningDrafts(){
   const drafts=N.draftList();
   N.open('Gespeicherte .pklab',
     '<p class="pl-help">Gespeicherte Network-Master- und Standard-Labs behalten ihren Modus und ihre Konfiguration.</p>'+
     '<div class="v06-choice-grid">'+(drafts.length?drafts.map(d=>
       '<button data-v06-draft="'+esc(d.id)+'"><b>'+esc(d.title)+'</b><small>'+
       esc(d.mode==='master'?'Network Master':'Standard Lab')+' · '+new Date(d.time).toLocaleString('de-DE')+'</small></button>').join(''):
       '<p class="pl-help">Noch keine lokalen Entwürfe vorhanden.</p>')+'</div>'+
     '<div class="v06-sheet-actions">'+action('learn-files','Datei öffnen')+action('learn-back','Zurück')+'</div>',
     root=>{
       root.querySelectorAll('[data-v06-draft]').forEach(b=>b.onclick=()=>{
         const d=drafts.find(x=>x.id===b.dataset.v06Draft);
         if(d){N.load(d.data);N.close();updateStatus();say('Projekt geladen: '+d.title)}
       });
       root.querySelector('[data-v06="learn-files"]').onclick=N.doOpen;
       root.querySelector('[data-v06="learn-back"]').onclick=learningHub;
     },'wide');
 }
 const PRESETS=[
  ['ipv4','IPv4 / Subnetting','Adressierung, Netzmaske, Gateway & Ping'],
  ['ipv6','IPv6 / SLAAC','IPv6-Adressen, Prefixe und zwei Hosts'],
  ['dns','DNS & Namensauflösung','DNS-Server, A-Record, Erreichbarkeit'],
  ['topology','Topologie bauen','Ein leeres Lab mit Verkabelungsaufgabe'],
  ['routing','Routing & VLAN','Zwei Netze mit Router und statischen Pfaden'],
  ['firewall','Firewall & Sicherheit','Host- und Netzwerk-Firewall testen'],
  ['campus','Campus Challenge','Großer Network-Master-Lab mit 13 Geräten'],
  ['wan','WAN & Internet','Gateway, WAN-Port und virtuelles Internet'],
  ['transfer','Datentransfer & QoS','Lange Uploads und Downloads überwachen']
 ];
 function learningPresets(){
   N.open('Learning · Vorlagen',
     '<div class="v06-hero-card">'+ICON.book+'<div><b>Choose a challenge</b><small>Neue Aufgaben mit automatischer Prozent-Bewertung</small></div></div>'+
     '<div class="v06-presets">'+PRESETS.map(([key,title,desc])=>
       '<button data-v06-preset="'+key+'"><span>'+ICON.network+'</span><b>'+esc(title)+'</b><small>'+esc(desc)+'</small></button>').join('')+'</div>'+
     '<div class="v06-sheet-actions">'+action('learn-back','Zurück')+'</div>',
     root=>{
       root.querySelectorAll('[data-v06-preset]').forEach(b=>b.onclick=()=>startLearning(b.dataset.v06Preset));
       root.querySelector('[data-v06="learn-back"]').onclick=learningHub;
     },'wide');
 }
 function startLearning(key){
   if(lab().mode!=='master')N.switchMode('master',{skipDraft:true});
   // A new lab clears the visible graph and previous exercise metadata.
   lab().tasks=[];lab().dnsRecords=[];lab().flows=[];lab().spread=false;
   N.presetBuild(key==='empty'||key==='topology'?'empty':key==='campus'?'campus':'star',key==='campus'?13:6,{skipDraft:true});
   lab().tasks=[];lab().dnsRecords=[];lab().mode='master';lab().preset='learning-'+key;
   const source=S.devices.find(d=>d.type==='pc'||d.type==='laptop')||S.devices[0];
   const target=S.devices.find(d=>d.id!==source?.id&&(d.type==='server'||d.type==='pc'))||S.devices[1];
   const network=S.devices.find(d=>d.type==='router')||S.devices.find(d=>d.type==='switch')||S.devices[2];
   const title=PRESETS.find(x=>x[0]===key)?.[1]||'Eigene Aufgabe';
   lab().title=title;
   const task=(kind,device,expected,title,targetId='')=>({
     id:'l'+Date.now()+Math.random().toString(36).slice(2,6),kind,device:device||'',target:targetId||'',
     expected:String(expected),title,instructions:'Konfiguriere den virtuellen Netzwerkzustand über das Geräteterminal oder verbinde Geräte.'});
   if(key==='ipv4'){
     if(source){source.ip='0.0.0.0';source.ips=[source.ip];source.vprofile=P.sanitizeProfile({ipv4:'0.0.0.0'},source)}
     lab().tasks.push(task('ipv4',source?.id,'192.168.10.10','Host IPv4: 192.168.10.10'));
     lab().tasks.push(task('subnet',source?.id,'255.255.255.0','Subnetzmaske /24'));
     lab().tasks.push(task('gateway',source?.id,'192.168.10.1','Default Gateway'));
   }else if(key==='ipv6'){
     lab().tasks.push(task('ipv6',source?.id,'2001:db8:10::10','IPv6-Adresse auf Host A'));
     lab().tasks.push(task('ipv6',target?.id,'2001:db8:10::20','IPv6-Adresse auf Host B'));
     lab().tasks.push(task('topology','',S.links.length+1,'Verbinde einen weiteren Link'));
   }else if(key==='dns'){
     const dns=S.devices.find(d=>d.type==='server')||target;
     if(dns)dns.vprofile=P.sanitizeProfile({dnsEnabled:true},dns);
     lab().tasks.push(task('dnsrecord',dns?.id,'portal.lab','DNS-A-Record portal.lab erstellen'));
     lab().tasks.push(task('dns',source?.id,dns?.ip||'192.168.1.1','DNS-Resolver konfigurieren'));
   }else if(key==='topology'){
     lab().tasks.push(task('topology','','3','Min. drei physische Links bauen'));
     lab().tasks.push(task('topology','','5','Netz auf mindestens fünf Links erweitern'));
   }else if(key==='routing'){
     lab().tasks.push(task('gateway',source?.id,'10.0.0.1','Gateway des ersten Subnetzes'));
     lab().tasks.push(task('route',source?.id,'','Routererreichbarkeit',network?.id));
     lab().tasks.push(task('vlan',target?.id,'20','Client in VLAN 20 konfigurieren'));
   }else if(key==='firewall'){
     lab().tasks.push(task('firewall',source?.id,'','Host-Firewall und Threat Protection aktivieren'));
     lab().tasks.push(task('hardening',source?.id,'','Host patchen und Security Level erhöhen'));
     lab().tasks.push(task('topology','',S.links.length+1,'Redundante physische Verbindung'));
   }else if(key==='wan'){
     lab().tasks.push(task('wan',network?.id,'','WAN-Port und Internet konfigurieren'));
     lab().tasks.push(task('gateway',source?.id,'192.168.1.1','Client-Gateway'));
   }else if(key==='transfer'){
     lab().tasks.push(task('transfer',source?.id,'','Einen vollständigen Upload oder Download ausführen'));
     lab().tasks.push(task('ping',source?.id,'','Erreichbarkeit verifizieren',target?.id));
   }else if(key==='campus'){
     lab().tasks.push(task('topology','','15','Campus auf 15 Verbindungen ausbauen'));
     lab().tasks.push(task('ipv6',source?.id,'2001:db8:100::10','IPv6 Campus-Client'));
     lab().tasks.push(task('dnsrecord',network?.id,'intranet.campus','Intranet-DNS-Record'));
     lab().tasks.push(task('firewall',source?.id,'','Endpoint Hardening / Firewall'));
     lab().tasks.push(task('transfer',source?.id,'','Kapazitätstransfer durchführen'));
     lab().tasks.push(task('vlan',target?.id,'30','Trennung durch VLAN 30'));
   }
   P.createEvent(lab(),S.devices,'New learning exercise: '+title,'system',S.devices.slice(0,1).map(d=>d.id));
   N.close();C.refresh();N.masterPage();updateStatus();say('Lernaufgabe geladen: '+title);
   try{localStorage.setItem('packetlab-current-v3',N.pack())}catch(_){}
 }
 const oldVirtualSend=N.sendPacket.bind(N);
 // Keep the original menu/Vurnabil entries but route them through the same
 // v0.6 firewall/telemetry engine used by the expandable packet console.
 N.sendPacket=type=>{
   const kind=P.PACKETS[type]?type:'normal';const packet=P.PACKETS[kind];
   const result=E.send(S,lab(),{source:S.src,target:S.dst,kind,port:packet.port||0,
     bytes:packet.bytes,count:packet.count||1,zone:'lan',impact:'none'});
   if(result.ok){try{const route=P.route(S,S.src,S.dst);if(route&&!C.engine.busy())Sim.sendData(C.engine,route,{label:kind.toUpperCase(),devices:S.devices,links:S.links})}catch(_){}}
   C.refresh();updateStatus();return {...result,count:result.delivered||0};
 };
 const status=document.createElement('div');status.id='v06-progress';status.className='v06-progress';
 status.innerHTML='<span>Learning</span><div class="v06-progress-track"><i></i></div><b>0%</b>';
 const stagebar=document.querySelector('.stage__bar');stagebar?.append(status);
 const credits=document.createElement('details');credits.className='v06-credits';
 credits.innerHTML='<summary>Projekt-Herkunft · TopoLab <span>▾</span></summary>'+
   '<p>PaketLab basiert auf Teilen von <strong>TopoLab</strong> von Vansh Bhardwaj. Originale TopoLab-Elemente, Kommentare, Graphalgorithmen und Credits bleiben erhalten. '+
   '<a href="https://github.com/vansh231205/TopoLab">TopoLab-Originalprojekt</a> · Eigenständige Erweiterungen: Veyra PacketLab / PacketLab.</p>';
 document.querySelector('.panel--left')?.append(credits);
 const observe=()=>{const mode=lab().mode;document.body.classList.toggle('v06-learning-mode',mode==='master');
   const progress=E.progress(S,lab());
   status.classList.toggle('visible',mode==='master');
   status.querySelector('b').textContent=progress.percent+'%';
   status.querySelector('.v06-progress-track i').style.width=progress.percent+'%';
   status.title=progress.done+'/'+progress.total+' Aufgaben bestanden';
 };
 function updateStatus(){
   observe();
   if($('v06-sim-state')){
     $('v06-sim-state').textContent=N.running?'■ Stop':'▶ Play';
     $('v06-sim-state').classList.toggle('paused',!N.running);
   }
   if(panel){
     $('v06-kind').value=P.PACKETS[lab().packet]?lab().packet:'normal';
     const root=$('v06-last-result');
     root.title='Quelle: '+(dev(S.src)?.label||'—')+' · Ziel: '+(dev(S.dst)?.label||'—');
     const activeFlows=(lab().flows||[]).filter(f=>f.status==='running');
     if(activeFlows.length)root.textContent=activeFlows.length+' aktive Transfers · '+activeFlows.map(f=>Math.round(100*(1-f.remaining/f.duration))+'%').join(', ');
   }
 }
 // Extend the existing sim timer: transfers advance only when running.
 let lastClock=lab().clock;
 setInterval(()=>{
   const currentLab=lab();
   if(currentLab.clock!==lastClock){
     const difference=Math.max(0,Math.min(15,currentLab.clock-lastClock));
     if(difference>0 && N.running)E.tickFlows(S,currentLab,difference);
     lastClock=currentLab.clock;
   }
   updateStatus();
 },1000);
 // A new mode should always start with the explicit learning selection flow.
 document.addEventListener('click',ev=>{
   const element=ev.target.closest?.('#pl-master');
   if(element && lab().mode!=='master'){
     ev.preventDefault();ev.stopImmediatePropagation();learningEntry();
   }
 },true);
 window.PacketLabV06UI={dispatch,openFirewall,learningEntry,learningHub,learningPresets,startLearning,confirmNewBlank,updateStatus};
 updateStatus();
 console.info('PacketLab 0.6: live simulation, Network Builder, Learning, firewall and advanced packets active');
})();
