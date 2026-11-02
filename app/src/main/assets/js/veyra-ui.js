/* Veyra PacketLab Android touch-first controls, offline project workflows. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const workspace = document.querySelector('.workspace');
  const stage = document.querySelector('.stage');
  const left = document.querySelector('.panel--left');
  const right = document.querySelector('.panel--right');
  const mobile = () => window.matchMedia('(max-width:900px)').matches;
  const native = () => typeof window.VeyraNative !== 'undefined';
  const project = () => window.VeyraProject;

  const glyphs = {
    network: '<circle cx="12" cy="4" r="2.3"/><circle cx="5" cy="19" r="2.3"/><circle cx="19" cy="19" r="2.3"/><path d="M11 6 6.5 16.8M13 6l4.5 10.8M7.5 19h9"/>',
    cubes: '<rect x="3" y="3.5" width="7" height="7" rx="1.5"/><rect x="14" y="3.5" width="7" height="7" rx="1.5"/><rect x="8.5" y="14" width="7" height="7" rx="1.5"/><path d="M6.5 10.5v3.5h5.5M17.5 10.5V14H12"/>',
    inspect: '<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 5 5M11 8v6M8 11h6"/>',
    chart: '<path d="M3 20h18M5.5 17v-5M11 17V6M16.5 17v-9"/><circle cx="19.5" cy="5" r="1.5"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    cable: '<path d="M4 9h5v6H4zM15 9h5v6h-5zM9 12h6M6.5 9V5m11 4V5"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    bolt: '<path d="M13 2 5 13h6l-1 9 9-12h-7z"/>',
    save: '<path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8"/>',
    folder: '<path d="M3 6h7l2 2h9v12H3zM3 6V4h7l2 2"/>',
    close: '<path d="M5 5l14 14M19 5 5 19"/>',
    pc: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    laptop: '<rect x="5" y="4" width="14" height="12" rx="2"/><path d="M2 19h20l-3-3H5z"/>',
    server: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M7 6h1M7 12h1M7 18h1"/>',
    nas: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 6v10M15 6v10M8 19h8"/>',
    printer: '<rect x="6" y="2" width="12" height="6"/><rect x="4" y="9" width="16" height="9" rx="2"/><path d="M7 15h10v7H7z"/>',
    switch: '<rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M5 11h3v3H5zM10 11h3v3h-3zM15 11h3v3h-3z"/>',
    hub: '<rect x="3" y="8" width="18" height="9" rx="2"/><path d="M6 11v3M10 11v3M14 11v3M18 11v3"/>',
    ap: '<path d="M4 10a12 12 0 0 1 16 0M7 13a8 8 0 0 1 10 0M10 16a4 4 0 0 1 4 0"/><circle cx="12" cy="20" r="1"/>',
    router: '<rect x="3" y="11" width="18" height="8" rx="2"/><path d="M8 11 5 4M16 11l3-7M6 15h3M13 15h5"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 18h4"/>',
    camera: '<rect x="3" y="6" width="16" height="11" rx="2"/><circle cx="11" cy="11.5" r="3"/><path d="m19 10 3-2v7l-3-2"/>',
    iot: '<circle cx="12" cy="13" r="4"/><path d="M6 4 4 2M18 4l2-2M12 9V2M3 20h18"/>',
    plc: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 6h2m4 0h2M8 10h8M8 15h8"/>',
    dns: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18"/>',
    dhcp: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3"/>',
    modem: '<rect x="3" y="9" width="18" height="10" rx="2"/><path d="M7 9 5 3M17 9l2-6M6 15h3M13 15h5"/>',
    loadbalancer: '<path d="M12 2v20M3 7h18M3 17h18M6 4l-3 3 3 3M18 14l3 3-3 3"/>',
    cloud: '<path d="M7 18h11a4 4 0 0 0 0-8h-1a5 5 0 0 0-9-1A4.5 4.5 0 0 0 7 18z"/>',
    vpn: '<path d="M12 2l9 4v6c0 6-3 9-9 10-6-1-9-4-9-10V6zM8 12h8M12 8v8"/>',
    ids: '<path d="M12 2L21 7v6c0 5-4 8-9 9-5-1-9-4-9-9V7zM9 11l2 2 4-4M8 17h8"/>',
    wlc: '<rect x="3" y="9" width="18" height="10" rx="2"/><path d="M7 6a8 8 0 0 1 10 0M10 3a12 12 0 0 1 4 0M6 15h3M13 15h5"/>',
    ntp: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    voip: '<path d="M6 3l4 4-2 3a13 13 0 0 0 6 6l3-2 4 4-2 3"/>',
    hypervisor: '<rect x="3" y="3" width="18" height="18" rx="3"/><rect x="6" y="6" width="5" height="5"/><rect x="13" y="6" width="5" height="5"/><rect x="6" y="13" width="12" height="5"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v13c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    firewall: '<path d="M12 2 21 6v7c0 5-3 8-9 10-6-2-9-5-9-10V6zM7 11h10M7 15h10M11 7v4M15 11v4"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (glyphs[name] || glyphs.network) + '</svg>';
  }
  function vib() { try { if (native()) window.VeyraNative.vibrate(11); } catch (_) {} }

  const toastNode = document.createElement('div');
  toastNode.className = 'v-toast';
  toastNode.setAttribute('role', 'status');
  document.body.appendChild(toastNode);
  let toastTimer;
  function toast(message) {
    toastNode.textContent = message;
    toastNode.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.classList.remove('is-visible'), 2400);
  }

  // Native actions stay within a local file-backed Android WebView.
  const actions = document.querySelector('.topbar__right');
  function topButton(id, label, glyph, callback) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn v-top-action';
    b.id = id;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = svg(glyph) + '<span class="v-small-label">' + label + '</span>';
    b.addEventListener('click', () => { vib(); callback(); });
    actions.appendChild(b);
    return b;
  }
  topButton('v-save', 'Projekt sichern', 'save', save);
  topButton('v-load', 'Projekt öffnen', 'folder', load);

  const scrim = document.createElement('div');
  scrim.className = 'v-scrim';
  scrim.setAttribute('aria-hidden', 'true');
  document.body.appendChild(scrim);

  const nav = document.createElement('nav');
  nav.className = 'v-nav';
  nav.setAttribute('aria-label', 'PacketLab navigation');
  const tabs = [
    ['workspace', 'Netzwerk', 'network'],
    ['build', 'Geräte', 'cubes'],
    ['inspect', 'Inspector', 'inspect'],
    ['analysis', 'Analyse', 'chart']
  ];
  for (const [key, title, icon] of tabs) {
    const btn = document.createElement('button');
    btn.dataset.tab = key;
    btn.type = 'button';
    btn.innerHTML = svg(icon) + '<span>' + title + '</span>';
    btn.addEventListener('click', () => { vib(); showTab(key); });
    nav.appendChild(btn);
  }
  workspace.insertAdjacentElement('afterend', nav);
  let currentTab = 'workspace';
  let paletteOpen = false;

  const palette = document.createElement('section');
  palette.className = 'v-palette';
  palette.setAttribute('aria-label', 'Add a network device');
  palette.innerHTML = '<div class="v-palette-head"><div><div class="v-palette-title">Gerät hinzufügen</div>' +
    '<span class="v-palette-sub">Auswählen und anschließend im Canvas platzieren</span></div>' +
    '<button class="v-palette-close" aria-label="Schließen">' + svg('close') + '</button></div>' +
    '<div class="v-palette-list"></div>';
  document.body.appendChild(palette);
  palette.querySelector('.v-palette-close').addEventListener('click', closePanels);
  const devices = [
    ['pc', 'PC'], ['laptop', 'Laptop'], ['server', 'Server'], ['switch', 'Switch'],
    ['router', 'Router'], ['firewall', 'Firewall'], ['ap', 'Access Point'],
    ['hub', 'Hub'], ['nas', 'NAS'], ['printer', 'Drucker'],
    ['phone', 'Smartphone'], ['camera', 'IP-Kamera'], ['iot', 'IoT-Sensor'],
    ['plc', 'Industrie SPS'], ['dns', 'DNS-Server'], ['dhcp', 'DHCP-Server'],
    ['modem', 'WAN-Modem'], ['loadbalancer', 'Load Balancer'],
    ['cloud', 'Cloud / WAN'],['vpn','VPN Gateway'],['ids','IDS / IPS'],
    ['wlc','WLAN Controller'],['ntp','NTP Server'],['mail','Mail Server'],
    ['voip','VoIP Telefon'],['hypervisor','Hypervisor'],['database','Datenbank'],
    ['cable', 'Kabel']
  ];
  for (const [kind, title] of devices) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.pick = kind;
    b.innerHTML = '<span class="v-palette-ico">' + svg(kind) + '</span>' + title;
    b.addEventListener('click', () => {
      const target = document.querySelector('[data-dtype="' + kind + '"]');
      if (!target) return;
      const active = target.classList.contains('is-active');
      if (!active) target.click();
      closePanels();
      toast(kind === 'cable' ? 'Kabelmodus: zwischen zwei Geräten ziehen' : title + ': im Canvas antippen, um zu platzieren');
      vib();
    });
    palette.querySelector('.v-palette-list').appendChild(b);
  }

  const insights = document.createElement('div');
  insights.className = 'v-insights';
  insights.innerHTML = '<div class="v-insight">GERÄTE <b id="vNodes">8</b></div>' +
    '<div class="v-insight">KABEL <b id="vLinks">7</b></div>' +
    '<div class="v-insight is-ok">STABILITÄT <b id="vScore">0</b></div>';
  const stageBar = stage.querySelector('.stage__bar');
  stageBar.insertBefore(insights, stageBar.querySelector('.stage__controls'));
  function syncInsights() {
    $('vNodes').textContent = $('mDevices').textContent;
    $('vLinks').textContent = $('mLinks').textContent;
    $('vScore').textContent = $('mScore').textContent + '/100';
  }
  for (const name of ['mDevices', 'mLinks', 'mScore']) {
    new MutationObserver(syncInsights).observe($(name), { childList: true, characterData: true, subtree: true });
  }
  syncInsights();

  const float = document.createElement('div');
  float.className = 'v-float';
  const floating = [
    ['fit', 'Ganzes Netzwerk zeigen', () => $('btnZoomFit').click()],
    ['cable', 'Kabelmodus', () => pickTool('cable')],
    ['bolt', 'Chaosmodus', () => {
      const b = document.querySelector('[data-tool="chaos"]');
      b.click();
      toast(b.classList.contains('is-active') ? 'Chaos aktiv – Geräte oder Kabel antippen' : 'Auswahlmodus aktiv');
    }],
    ['plus', 'Gerät hinzufügen', () => { closePanels(); paletteOpen = true; palette.classList.add('is-open'); scrim.classList.add('is-open'); }]
  ];
  for (const [icon, title, handler] of floating) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v-fab' + (icon === 'plus' ? ' v-fab--main' : '');
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.innerHTML = svg(icon) + (icon === 'plus' ? '<span class="v-fab-label">Gerät</span>' : '');
    btn.addEventListener('click', () => { vib(); handler(); });
    float.appendChild(btn);
  }
  const history = stage.querySelector('.stage__history');
  float.insertBefore(history, float.firstChild);
  stage.insertBefore(float, stage.querySelector('.sendbar'));

  function pickTool(kind) {
    const b = document.querySelector('[data-dtype="' + kind + '"]');
    if (!b) return;
    b.click();
    toast(b.classList.contains('is-active') ? 'Kabel ziehen: Start- und Zielgerät verbinden' : 'Auswahlmodus aktiv');
  }

  function closePanels() {
    paletteOpen = false;
    palette.classList.remove('is-open');
    left.classList.remove('is-mobile-open');
    right.classList.remove('is-mobile-open');
    scrim.classList.remove('is-open');
    currentTab = 'workspace';
    syncTabs();
  }
  function syncTabs() {
    nav.querySelectorAll('button').forEach(btn => btn.classList.toggle('is-active', btn.dataset.tab === currentTab));
  }
  function showTab(key) {
    if (!mobile()) return;
    if (currentTab === key || key === 'workspace') { closePanels(); return; }
    closePanels();
    currentTab = key;
    scrim.classList.add('is-open');
    if (key === 'build') left.classList.add('is-mobile-open');
    else {
      right.classList.add('is-mobile-open');
      setTimeout(() => {
        const anchor = key === 'analysis' ? right.querySelector('.group--analysis') : right.querySelector('.group--inspector');
        if (anchor) right.scrollTop = anchor.offsetTop - right.offsetTop - 12;
      }, 40);
    }
    syncTabs();
  }
  scrim.addEventListener('click', closePanels);
  syncTabs();

  // Programmatic save/load and autosave support.
  function save() {
    try {
      const json = project().dump();
      if (native()) window.VeyraNative.saveProject(json);
      else download(json, 'veyra-network.veyra.json', 'application/json');
    } catch (e) { toast('Speichern fehlgeschlagen: ' + e.message); }
  }
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], {type}));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    toast('Projekt exportiert');
  }
  function load() {
    try {
      if (native()) window.VeyraNative.loadProject();
      else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.veyra.json,application/json';
        input.addEventListener('change', async () => {
          if (!input.files?.[0]) return;
          if (input.files[0].size > 4 * 1024 * 1024) { toast('Datei größer als 4 MB'); return; }
          try { project().load(await input.files[0].text()); toast('Projekt geladen'); }
          catch (e) { toast('Ungültiges Projekt: ' + e.message); }
        }, {once:true});
        input.click();
      }
    } catch (e) { toast('Import fehlgeschlagen: ' + e.message); }
  }

  try {
    const saved = localStorage.getItem('veyra-packetlab-autosave');
    if (saved && project()) { project().load(saved); toast('Letztes Netzwerk wiederhergestellt'); }
  } catch (err) { console.warn('Autosave restore:', err.message); }
  let lastSave = '';
  function autosave() {
    try {
      if (!project()) return;
      const dump = project().dump();
      if (dump !== lastSave) { localStorage.setItem('veyra-packetlab-autosave', dump); lastSave = dump; }
    } catch (e) { console.warn('Autosave:', e.message); }
  }
  setInterval(autosave, 6000);
  window.addEventListener('pagehide', autosave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });

  // Android hardware back exits an open palette/sheet/modal before closing the activity.
  window.VeyraBack = function () {
    for (const [modal, button] of [
      ['rulesModal','btnRulesClose'], ['editModal','btnEditClose'],
      ['adviseModal','btnAdviseClose'], ['topoModal','btnTopoClose'],
      ['compare','btnCloseCompare']
    ]) {
      if (!$(modal).hidden) { $(button).click(); return true; }
    }
    if (paletteOpen || currentTab !== 'workspace') { closePanels(); return true; }
    const ctx = $('ctxMenu');
    if (!ctx.hidden) { ctx.hidden = true; return true; }
    return false;
  };


  // Small, stable German UI strings. Internal IDs and simulation algorithms stay original.
  const displayLabels = [
    ['btnArp', 'ARP auflösen'],
    ['btnSend', '▶ Paket senden'],
    ['btnCollide', 'Kollision'],
    ['btnRepair', 'Reparieren'],
    ['btnReset', 'Zurücksetzen'],
    ['btnZoomFit', 'Einpassen'],
    ['btnAdvise', 'Empfehlung'],
    ['btnCompare', 'Vergleich'],
    ['btnFlow', 'Kapazität'],
    ['btnMst', 'Verkabelung'],
    ['btnCloseCompare', 'Schließen'],
    ['btnEditClose', '×'],
    ['btnEditCancel', 'Abbrechen'],
    ['btnRulesClose', '×'],
    ['btnRulesDone', 'Fertig'],
  ];
  for (const [id, title] of displayLabels) {
    if ($(id)) $(id).textContent = title;
  }
  for (const el of document.querySelectorAll('.sendbar .field--inline > span')) {
    const names = { 'From': 'Von', 'To': 'Nach', 'Routing': 'Route' };
    if (names[el.textContent.trim()]) el.textContent = names[el.textContent.trim()];
  }
  for (const heading of document.querySelectorAll('.group__title')) {
    const names = {
      'Build': 'Werkzeuge',
      'Add devices': 'Geräte hinzufügen',
      'Event log': 'Ereignisse',
      'Resilience': 'Ausfallsicherheit',
      'Metrics': 'Statistik',
      'Analysis': 'Netzwerkanalyse',
      'Inspector': 'Geräteinformationen'
    };
    if (names[heading.textContent.trim()]) heading.textContent = names[heading.textContent.trim()];
  }
  const routings = $('routeAlgo');
  if (routings?.options?.length >= 2) {
    routings.options[0].textContent = 'BFS – Hops';
    routings.options[1].textContent = 'Dijkstra – Latenz';
  }
  const topoNames = { Star:'Stern', Bus:'Bus', Ring:'Ring', Mesh:'Mesh', Tree:'Baum', Hybrid:'Hybrid' };
  const picked = $('topoPickName');
  if (picked) {
    const translate = () => {
      const current = picked.textContent.trim();
      if (topoNames[current] && topoNames[current] !== current) picked.textContent = topoNames[current];
    };
    new MutationObserver(translate).observe(picked, {childList:true, characterData:true, subtree:true});
    translate();
  }
  for (const selector of ['.modal__head h2', '.compare__head h2']) {
    for (const heading of document.querySelectorAll(selector)) {
      const names = {
        'Edit device': 'Gerät bearbeiten',
        'Firewall rules': 'Firewall-Regeln',
        'Which topology should I build?': 'Topologie auswählen',
        'Choose a topology': 'Topologie',
        'Topology showdown': 'Topologievergleich'
      };
      if (names[heading.textContent.trim()]) heading.textContent = names[heading.textContent.trim()];
    }
  }

  window.addEventListener('resize', () => { if (!mobile()) closePanels(); });
  console.info('Veyra PacketLab UI ready – Android-native bridge: ' + native());
})();
