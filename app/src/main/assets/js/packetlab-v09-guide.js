/* Net@Lab von VeyraLabs. Original offline reference content, searchable and bookmarked. */
(()=>{
'use strict';
const N=window.VeyraNext,chapters=window.NetAtLabChapters||[];
if(!N||!chapters.length)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cats=[...new Set(chapters.map(x=>x.category))];
const key='netatlab-veyralabs-progress-v1';
let saved={read:[],bookmarks:[],last:chapters[0]?.id};
try{saved={...saved,...JSON.parse(localStorage.getItem(key)||'{}')}}catch(_){}
const persist=()=>{try{localStorage.setItem(key,JSON.stringify(saved))}catch(_){}};
let query='',category='Alle',active=saved.last||chapters[0].id;
const svg='<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7" fill="none" aria-hidden="true"><path d="M12 5c-3.5-2-6.5-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15"/></svg>';
function toHtml(text){
 return String(text||'').split(/\n\s*\n/).filter(Boolean).map(p=>{
   const line=p.trim();
   const lines=line.split('\n');
   const cmds=lines.length>=2 && lines.some(v=>/^(ip |nmcli |traceroute |ssh |route |netsh |show |systemctl |sudo |journalctl |Get-|dig |tcpdump |ping |copy |configure |interface |no shutdown|enable$)/.test(v));
   if(cmds&&lines.length>2){
     const content=lines.map(esc).join('\n');
     return '<div class="v9-doc-code"><button type="button" data-v9-copy="'+esc(line)+'" aria-label="Befehle kopieren">Kopieren</button>'+
        '<pre>'+content+'</pre></div>';
   }
   return '<p>'+lines.map(esc).join('<br>')+'</p>';
 }).join('');
}
function entryList(root){
 const list=root.querySelector('#v9-doc-toc');if(!list)return;
 const term=query.trim().toLocaleLowerCase('de-DE');
 const filtered=chapters.filter(x=>(category==='Alle'||x.category===category)&&
  (!term||(x.title+' '+x.category+' '+x.text).toLocaleLowerCase('de-DE').includes(term)));
 list.innerHTML=filtered.map(x=>
   '<button type="button" class="v9-doc-item '+(active===x.id?'selected':'')+'" data-doc-id="'+x.id+'">'+
   '<span class="v9-doc-mark">'+(saved.read.includes(x.id)?'✓':'○')+'</span>'+
   '<span><b>'+esc(x.title)+'</b><small>'+esc(x.category)+'</small></span>'+
   (saved.bookmarks.includes(x.id)?'<span class="v9-bookmark">★</span>':'')+'</button>').join('')||
   '<p class="v9-empty">Keine Kapitel gefunden. Suchbegriff oder Themenfilter ändern.</p>';
 list.querySelectorAll('[data-doc-id]').forEach(b=>b.onclick=()=>{
   active=b.dataset.docId;renderChapter(root);entryList(root);
 });
}
function renderChapter(root){
 const item=chapters.find(x=>x.id===active)||chapters[0],area=root.querySelector('#v9-doc-article');
 if(!item||!area)return;
 if(!saved.read.includes(item.id))saved.read.push(item.id);
 saved.last=item.id;persist();
 area.innerHTML='<div class="v9-doc-article-heading"><small>NET@LAB · '+esc(item.category)+'</small>'+
   '<h2>'+esc(item.title)+'</h2><span>'+chapters.findIndex(x=>x.id===item.id)+1+' von '+chapters.length+
   '</span></div><div class="v9-doc-body">'+toHtml(item.text)+'</div>'+
   '<div class="v9-doc-article-actions">'+
     '<button type="button" data-doc-action="bookmark">'+(saved.bookmarks.includes(item.id)?'★ Lesezeichen entfernen':'☆ Lesezeichen setzen')+'</button>'+
     '<button type="button" data-doc-action="prev">‹ Zurück</button>'+
     '<button type="button" data-doc-action="next">Weiter ›</button></div>';
 const change=delta=>{
   const index=Math.max(0,Math.min(chapters.length-1,chapters.findIndex(x=>x.id===item.id)+delta));
   active=chapters[index].id;renderChapter(root);entryList(root);
 };
 area.querySelector('[data-doc-action="prev"]').onclick=()=>change(-1);
 area.querySelector('[data-doc-action="next"]').onclick=()=>change(1);
 area.querySelector('[data-doc-action="bookmark"]').onclick=()=>{
   if(saved.bookmarks.includes(item.id))saved.bookmarks=saved.bookmarks.filter(x=>x!==item.id);
   else saved.bookmarks.push(item.id);
   persist();renderChapter(root);entryList(root);
 };
 area.querySelectorAll('[data-v9-copy]').forEach(b=>b.onclick=()=>{
   const t=b.dataset.v9Copy,tmp=document.createElement('textarea');tmp.value=t;
   tmp.style.position='fixed';tmp.style.left='-9999px';document.body.append(tmp);tmp.select();
   let ok=false;try{ok=document.execCommand('copy')}catch(_){}tmp.remove();
   window.VeyraRefine?.flash?.(ok?'Text in Zwischenablage kopiert':'Zwischenablage nicht verfügbar');
 });
 const progress=root.querySelector('#v9-doc-progress');
 if(progress)progress.textContent=saved.read.length+' von '+chapters.length+' Kapitel gelesen';
}
function open(){
 N.open('Net@Lab · von VeyraLabs',
  '<div class="v9-doc-brand">'+svg+'<div><h2><span>Net@</span>Lab</h2>'+
   '<small>Das Netzwerkhandbuch von <strong>Veyra<span>Labs</span></strong></small></div></div>'+
  '<p class="v9-doc-intro">Offline Nachschlagewerk mit '+chapters.length+
     ' Kapiteln. Konkrete Befehle, Netzkonzepte, Protokolle und nachvollziehbare Fehlersuche.</p>'+
  '<div class="v9-doc-filters"><input id="v9-doc-search" type="search" autocomplete="off" placeholder="Kapitel und Befehle durchsuchen" value="'+esc(query)+'">'+
   '<select id="v9-doc-category" aria-label="Fachgebiet auswählen">'+
   ['Alle',...cats].map(x=>'<option '+(x===category?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div>'+
  '<div class="v9-doc-meta"><span id="v9-doc-progress"></span>'+
  '<button type="button" id="v9-doc-bookmarks">Lesezeichen</button></div>'+
  '<div class="v9-doc-layout"><nav id="v9-doc-toc" aria-label="Kapitel"></nav>'+
  '<article id="v9-doc-article"></article></div>',
 root=>{
   const search=root.querySelector('#v9-doc-search'),categoryEl=root.querySelector('#v9-doc-category');
   search.oninput=e=>{query=e.target.value;entryList(root)};
   categoryEl.onchange=e=>{category=e.target.value;entryList(root)};
   root.querySelector('#v9-doc-bookmarks').onclick=()=>{
     category='Alle';query='';search.value='';
     const bookmarks=saved.bookmarks.map(id=>chapters.find(x=>x.id===id)).filter(Boolean);
     const toc=root.querySelector('#v9-doc-toc');
     toc.innerHTML=bookmarks.length?bookmarks.map(x=>
       '<button class="v9-doc-item" data-doc-id="'+x.id+'">'+esc(x.title)+'</button>').join(''):
       '<p class="v9-empty">Noch keine Lesezeichen gesetzt.</p>';
     toc.querySelectorAll('[data-doc-id]').forEach(x=>x.onclick=()=>{
       active=x.dataset.docId;renderChapter(root);entryList(root);
     });
   };
   entryList(root);renderChapter(root);
 },'wide');
}
window.PacketLabV09Guide={open,chapters,get bookmarks(){return saved.bookmarks}};
console.info('Net@Lab by VeyraLabs offline handbook: '+chapters.length+' chapters.');
})();
