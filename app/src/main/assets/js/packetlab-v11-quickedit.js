/* Veyra PacketLab 0.11 · Quick Edit gesture controller.
 * Free Network Lab only. Long press -> move -> dwell on category ->
 * move -> dwell on action -> release. No selection before movement.
 * Uses the existing Repair/Smart Fix/Building Agent implementations.
 */
(()=>{
'use strict';
const api=window.PacketLabV09QuickEdit,N=window.VeyraNext;
if(!api||!N)return;
const original={repair:api.repair,smartFix:api.smartFix,executeChoice:api.executeChoice};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const categories=[
 {id:'clients',title:'Clients hinzufügen',glyph:'▣',items:[['pc','PC'],['laptop','Laptop'],['phone','Smartphone'],['printer','Drucker']]},
 {id:'switching',title:'Switching & WLAN',glyph:'⌁',items:[['switch','Switch'],['ap','Access Point'],['hub','Hub'],['wlc','WLAN Controller']]},
 {id:'routing',title:'Routing & Sicherheit',glyph:'◇',items:[['router','Router'],['firewall','Firewall'],['vpn','VPN Gateway'],['ids','IDS / IPS']]},
 {id:'servers',title:'Server & Infrastruktur',glyph:'▦',items:[['server','Server'],['dns','DNS Server'],['dhcp','DHCP Server'],['nas','NAS']]},
 {id:'repair',title:'Repair Network',glyph:'⌕',items:[['repair-router','Fix Router'],['repair-switch','Fix Switche'],['repair-client','Fix PCs'],['repair-all','Fix All']]},
 {id:'smart',title:'Smart Fix',glyph:'✧',items:[['smart-config','Smart Config'],['smart-connect','Smart Connectivity'],['smart-safe','Smart Safe'],['smart-all','Smart All']]},
 {id:'agent',title:'Building Agent',glyph:'▧',items:[['create','Create my Network'],['finish','Finish Network'],['upgrade','Upgrade Network'],['balance','Balance Network']]}
];
const groups=new Map(categories.map(c=>[c.id,c]));
const MIN_MOVE=15, CAT_DWELL=315, CHOICE_DWELL=245;
let openMenu=null,timer=null;
const haptic=t=>{try{window.PacketLabV09UI?.vibrate(t||'tap')}catch(_){}};
const canOpen=()=>window.PacketLabV09Training?.role?.()==='network';
function cancelTimer(){if(timer!==null){clearTimeout(timer);timer=null}}
function dismiss(){
 cancelTimer();
 if(openMenu){openMenu.layer.remove();openMenu=null}
}
function coordHit(x,y){
 const el=document.elementFromPoint(x,y);
 return el?.closest?.('[data-v11-group],[data-v11-choice]')||null;
}
function positionSubmenu(){
 if(!openMenu)return;
 const m=openMenu,sub=m.sub;
 const railRect=m.rail.getBoundingClientRect();
 const width=sub.offsetWidth||164, height=sub.offsetHeight||220;
 const right=railRect.right+7, left=railRect.left-width-7;
 sub.style.left=Math.max(5,Math.min(innerWidth-width-5,
   right+width<innerWidth-5?right:left))+'px';
 sub.style.top=Math.max(75,Math.min(innerHeight-height-88,railRect.top+38))+'px';
}
function setGroup(id){
 if(!openMenu||!groups.has(id))return;
 const m=openMenu,c=groups.get(id);
 m.group=id;m.candidate=null;m.selection=null;
 m.rail.querySelectorAll('[data-v11-group]').forEach(x=>x.classList.toggle('active',x.dataset.v11Group===id));
 m.sub.innerHTML='<div class="v11-q-subhead">'+esc(c.title)+'</div>'+
 c.items.map(([action,label],i)=>'<div class="v11-q-choice" role="menuitem" data-v11-choice="'+esc(action)+'">'+
    '<span class="v11-q-index">'+String(i+1).padStart(2,'0')+'</span><b>'+esc(label)+'</b>'+
    '<span class="v11-q-arrow">›</span></div>').join('');
 m.sub.hidden=false;positionSubmenu();haptic('mode');
}
function showMenu(x,y,p,opts={}){
 if(!canOpen())return false;
 dismiss();
 const layer=document.createElement('div');
 layer.className='v11-quick-overlay';layer.id='v11-quick-overlay';
 layer.innerHTML='<div class="v11-q-menu" role="menu" aria-label="Quick Edit">'+
   '<header class="v11-q-heading"><strong>Quick Edit</strong><small>Bewegen, kurz halten, loslassen</small></header>'+
   categories.map(c=>'<div class="v11-q-category" data-v11-group="'+c.id+
    '" role="menuitem" tabindex="-1">'+
    '<span class="v11-q-glyph">'+c.glyph+'</span><b>'+esc(c.title)+'</b><span>›</span></div>').join('')+
   '</div><div class="v11-q-submenu" role="menu" hidden></div>';
 document.body.appendChild(layer);
 const menu=layer.querySelector('.v11-q-menu'),sub=layer.querySelector('.v11-q-submenu');
 const width=menu.getBoundingClientRect().width,height=menu.getBoundingClientRect().height;
 menu.style.left=Math.max(5,Math.min(innerWidth-width-5,x-width*.35))+'px';
 menu.style.top=Math.max(75,Math.min(innerHeight-height-83,y-48))+'px';
 openMenu={layer,rail:menu,sub,startX:x,startY:y,location:{...p},
  pointerId:opts.pointerId,manual:!!opts.mouse,moved:false,group:null,
  candidate:null,selection:null,pending:null};
 menu.querySelectorAll('[data-v11-group]').forEach(el=>el.addEventListener('click',e=>{
   if(!openMenu?.manual)return;setGroup(el.dataset.v11Group)
 }));
 sub.addEventListener('click',e=>{
   if(!openMenu?.manual)return;
   const hit=e.target.closest('[data-v11-choice]');if(!hit)return;
   const at=openMenu.location,key=hit.dataset.v11Choice;
   dismiss();original.executeChoice(key,at);
 });
 if(opts.mouse){
   layer.style.pointerEvents='auto';
   layer.addEventListener('pointerdown',e=>{if(e.target===layer)dismiss()});
 }
 haptic('mode');
 return true;
}
function touchMove(e){
 const m=openMenu;
 if(!m||m.manual||e.pointerType!=='touch')return;
 if(m.pointerId!==undefined&&e.pointerId!==m.pointerId)return;
 const x=e.clientX,y=e.clientY;
 if(!m.moved){
   if(Math.hypot(x-m.startX,y-m.startY)<MIN_MOVE)return;
   m.moved=true;
 }
 const hit=coordHit(x,y),group=hit?.dataset?.v11Group,choice=hit?.dataset?.v11Choice;
 const key=choice?'choice:'+choice:group?'group:'+group:'none';
 if(m.pending===key)return;
 cancelTimer();m.pending=key;m.selection=null;
 m.layer.querySelectorAll('[data-v11-choice]').forEach(b=>b.classList.remove('armed'));
 m.layer.querySelectorAll('[data-v11-group]').forEach(b=>b.classList.toggle('hovered',b.dataset.v11Group===group));
 if(choice&&m.group){
   timer=setTimeout(()=>{
     if(openMenu===m&&m.pending===key){
       m.selection=choice;
       m.layer.querySelectorAll('[data-v11-choice]').forEach(b=>b.classList.toggle('armed',b.dataset.v11Choice===choice));
       haptic('tap');
     }
   },CHOICE_DWELL);
 }else if(group){
   timer=setTimeout(()=>{
     if(openMenu===m&&m.pending===key)setGroup(group);
   },CAT_DWELL);
 }
}
function touchEnd(e){
 const m=openMenu;
 if(!m||m.manual||e.pointerType!=='touch')return;
 if(m.pointerId!==undefined&&e.pointerId!==m.pointerId)return;
 const at=m.location,selected=m.selection,hit=coordHit(e.clientX,e.clientY);
 const valid=!!m.moved&&!!selected&&hit?.dataset?.v11Choice===selected;
 dismiss();
 if(valid){haptic('confirm');original.executeChoice(selected,at)}
}
window.addEventListener('pointermove',touchMove,true);
window.addEventListener('pointerup',touchEnd,true);
window.addEventListener('pointercancel',e=>{
 if(openMenu&&!openMenu.manual&&(openMenu.pointerId===undefined||e.pointerId===openMenu.pointerId))dismiss();
},true);
window.addEventListener('keydown',e=>{if(e.key==='Escape')dismiss()});
window.addEventListener('packetlab:v09-role-change',()=>{
 if(!canOpen())dismiss();
});
api.openAt=showMenu;api.close=dismiss;
Object.defineProperty(api,'isOpen',{get:()=>!!openMenu,configurable:true});
api.version='0.11.0';api.gesture={minMove:MIN_MOVE,categoryDwell:CAT_DWELL,choiceDwell:CHOICE_DWELL};
api.categories=categories;
console.info('PacketLab 0.11 Quick Edit: move-to-arm, dwell and release, without Canvas menu.');
})();
