/* PacketLab v0.9 · unified Android controls, haptics, packet console.
 * Underlying native SELECT remains source-of-truth, but is never tapped:
 * a custom button delegates to the existing Veyra picker with search.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id),N=window.VeyraNext,C=window.VeyraCore,
 V=window.VeyraRefine,S=C?.state;
if(!N||!C||!V)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let lastHaptic=0;
function vibrate(kind='tap'){
 const now=performance.now();if(now-lastHaptic<42)return;lastHaptic=now;
 const ms=kind==='close'?24:kind==='mode'?17:kind==='confirm'?29:11;
 try{if(window.VeyraNative?.vibrate)window.VeyraNative.vibrate(ms);
 else navigator.vibrate?.(ms)}catch(_){}
}
document.addEventListener('click',e=>{
 const target=e.target.closest?.('button,[role="button"]');
 if(!target||target.disabled)return;
 const closing=target.matches('#pl-close,.pl-icon,.vr-picker-close,.v-palette-close,[aria-label*="Schließen"],[aria-label*="schließen"]')||
   target.textContent.trim()==='×';
 const nav=!!target.closest('.v-nav');
 vibrate(closing?'close':nav?'mode':'tap');
},true);
const selectors=new Set();
function decorateSelect(sel){
 if(sel.dataset.v9Custom||sel.matches('.pl-native-hidden')||sel.disabled)return;
 if(sel.closest('#vr-picker,#vr-picker-shade,#v9-choice-drawer'))return;
 const container=sel.closest('label')||sel.parentElement;
 if(!container)return;
 sel.dataset.v9Custom='1';
 const btn=document.createElement('button');btn.type='button';
 btn.className='v9-select-button';btn.dataset.v9SelectFor=sel.id||'';
 btn.setAttribute('aria-haspopup','dialog');
 const update=()=>{
   const current=sel.selectedOptions[0]?.textContent||sel.value||'Auswählen';
   btn.innerHTML='<span>'+esc(current)+'</span><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg>';
   btn.setAttribute('aria-label',((container.querySelector('span')?.textContent||sel.getAttribute('aria-label')||'Option')+' · '+current).slice(0,125));
 };
 update();
 sel.classList.add('v9-native-select');
 sel.setAttribute('tabindex','-1');
 sel.setAttribute('aria-hidden','true');
 sel.after(btn);
 btn.onclick=e=>{
   e.preventDefault();e.stopPropagation();
   if(!sel.disabled)V.showPicker(sel);
 };
 sel.addEventListener('change',update);
 const mo=new MutationObserver(update);
 mo.observe(sel,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
 selectors.add({sel,btn,mo});
}
function collect(root=document){
 if(root.matches?.('select'))decorateSelect(root);
 root.querySelectorAll?.('select').forEach(decorateSelect);
}
collect();
const sheet=$('pl-sheet'),bar=document.querySelector('.sendbar');
if(sheet)new MutationObserver(muts=>{
 for(const m of muts)for(const node of m.addedNodes)if(node.nodeType===1)collect(node);
}).observe(sheet,{childList:true,subtree:true});
if(bar)new MutationObserver(muts=>{
 for(const m of muts)for(const node of m.addedNodes)if(node.nodeType===1)collect(node);
}).observe(bar,{childList:true,subtree:true});
window.addEventListener('pagehide',()=>selectors.forEach(x=>x.mo.disconnect()));
const nativeBook=$('v07-guide');
if(nativeBook){
 nativeBook.id='v9-book';
 nativeBook.innerHTML='<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" aria-hidden="true"><path d="M12 6c-3-2-6-2-9-1v14c4-1 7-1 9 1 3-2 6-2 9-1V5c-4-1-7-1-9 1zM12 6v14"/></svg>';
 nativeBook.title='Net@Lab von VeyraLabs';
 nativeBook.setAttribute('aria-label','Net@Lab Handbuch');
 nativeBook.onclick=()=>window.PacketLabV09Guide?.open();
}
const docs=$('v06-pick-endpoints');
const panel=document.querySelector('.v06-packet-panel');
if(panel){
 const heading=panel.querySelector('.v06-panel-intro>div');
 if(heading){
   heading.querySelector('b').textContent='Paketkonsole';
   heading.querySelector('span').textContent='Virtuelle Übertragung mit präzisen Paketparametern';
 }
 const endpoints=document.createElement('div');endpoints.className='v9-endpoints';
 endpoints.innerHTML='<label>Von<select id="v9-source" aria-label="Quellgerät auswählen"></select></label>'+
  '<label>Nach<select id="v9-target" aria-label="Zielgerät auswählen"></select></label>';
 const intro=panel.querySelector('.v06-panel-intro');
 if(intro)intro.insertAdjacentElement('afterend',endpoints);
 const source=$('v9-source'),target=$('v9-target');
 const sync=()=>{
   const nodes=S.devices;
   const options='<option value="">Gerät wählen</option>'+nodes.map(x=>
     '<option value="'+esc(x.id)+'">'+esc(x.label)+' · '+esc(x.ip||'ohne IP')+'</option>').join('');
   for(const sel of [source,target]){
     const keep=sel.value;
     if(sel.options.length!==nodes.length+1||
       nodes.some((x,i)=>sel.options[i+1]?.value!==x.id)){
       sel.innerHTML=options;decorateSelect(sel);
     }
     sel.value=sel===source?(S.src||''):(S.dst||'');
     if(sel.value!==keep)sel.dispatchEvent(new Event('change',{bubbles:true}));
   }
 };
 source.onchange=()=>{
   S.src=source.value||null;
   if($('srcSelect')){$('srcSelect').value=source.value; $('srcSelect').dispatchEvent(new Event('change',{bubbles:true}))}
 };
 target.onchange=()=>{
   S.dst=target.value||null;
   if($('dstSelect')){$('dstSelect').value=target.value;$('dstSelect').dispatchEvent(new Event('change',{bubbles:true}))}
 };
 window.addEventListener('veyra:graphchange',sync);
 window.addEventListener('veyra-project-loaded',sync);
 setTimeout(sync,80);
 // Reusable single-send control is already in the header.
 const legacySend=$('v06-send-now');if(legacySend)legacySend.hidden=true;
 panel.querySelectorAll('#v06-duration,#v06-rate').forEach(input=>{
   input.closest('label')?.classList.add('v9-transfer-only');
 });
 const transfer=$('v06-transfer');
 const toggles=()=>{
   panel.classList.toggle('v9-transfer-enabled',transfer?.value!=='single');
 };
 transfer?.addEventListener('change',toggles);toggles();
 // A single self-contained composer: remove redundant old source/route rows
 // from display only; original hidden selects remain operational.
 document.querySelector('.sendbar')?.classList.add('v9-packet-composer');
 collect(panel);
}
const buildLabel=document.getElementById('v8-app-version');
if(buildLabel){buildLabel.textContent='0.9.0';buildLabel.title='PacketLab v0.9.0'}
window.PacketLabV09UI={vibrate,collect,version:'0.9.0'};
console.info('PacketLab v0.9 controls: native dropdowns replaced and packet composer consolidated.');
})();
