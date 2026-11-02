(()=>{
 'use strict';
 const translations=document.querySelectorAll('[data-de][data-en]');
 const languageButtons={de:document.getElementById('lang-de'),en:document.getElementById('lang-en')};
 function setLanguage(lang){
   if(!['de','en'].includes(lang))lang='de';
   document.documentElement.lang=lang;
   translations.forEach(el=>{const value=el.dataset[lang];if(typeof value==='string')el.innerHTML=value});
   Object.entries(languageButtons).forEach(([k,el])=>{el.classList.toggle('on',k===lang);el.setAttribute('aria-pressed',String(k===lang))});
   try{localStorage.setItem('packetlab-site-language',lang)}catch(_){}
 }
 let remembered='de';try{remembered=localStorage.getItem('packetlab-site-language')||'de'}catch(_){}
 setLanguage(remembered);
 Object.entries(languageButtons).forEach(([lang,button])=>button.addEventListener('click',()=>setLanguage(lang)));
 const toggle=document.getElementById('menu-toggle'),menu=document.getElementById('menu');
 toggle.addEventListener('click',()=>{const open=menu.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open))});
 menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.classList.remove('is-open');toggle.setAttribute('aria-expanded','false')}));
 const lightbox=document.getElementById('lightbox');
 const largeImage=document.getElementById('expanded-image');
 document.querySelectorAll('.open-image').forEach(button=>button.addEventListener('click',()=>{
   largeImage.src=button.dataset.image;
   largeImage.alt=button.querySelector('img')?.alt||'PaketLab screenshot';
   document.getElementById('expanded-caption').textContent=button.dataset.title||'PaketLab';
   lightbox.showModal();
 }));
 document.getElementById('close-lightbox').addEventListener('click',()=>lightbox.close());
 lightbox.addEventListener('click',e=>{if(e.target===lightbox)lightbox.close()});
})();
