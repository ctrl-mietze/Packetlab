from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent
url=(root/'app/src/main/assets/index.html').as_uri()
results=[];errors=[]
def check(name,ok):
 assert ok,name
 print('PASS',name,flush=True);results.append(name)
with sync_playwright() as play:
 browser=play.chromium.launch(channel='msedge',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':412,'height':915},device_scale_factor=1,is_mobile=True,has_touch=True)
 page=ctx.new_page()
 page.on('pageerror',lambda e: errors.append(str(e)))
 page.goto(url,wait_until='load');page.wait_for_timeout(500)
 page.locator('#v06-expand-packet').click()
 page.locator('#v06-pick-endpoints').click()
 check('Picking uses full canvas while sending tray temporarily collapsed',page.locator('.v06-sendbar.v06-collapsed').count()==1)
 check('Source click mode enabled',page.evaluate("!document.querySelector('.v06-pick-overlay').hidden"))
 pts=page.evaluate("""()=>{
  const v=VeyraCore.view,c=document.getElementById('canvas'),r=c.getBoundingClientRect();
  const a=v.toLocal({clientX:r.x,clientY:r.y});
  const bx=v.toLocal({clientX:r.x+10,clientY:r.y});
  const by=v.toLocal({clientX:r.x,clientY:r.y+10});
  const ds=VeyraCore.state.devices.filter(d=>d.type==='pc').slice(0,2);
  return ds.map(d=>({id:d.id,x:r.x+(d.x-a.x)*10/(bx.x-a.x),
    y:r.y+(d.y-a.y)*10/(by.y-a.y)}))
 }""")
 check('Two PC coordinates resolved',len(pts)==2)
 for pt in pts:
  check('Picker device visible '+pt['id'],0<=pt['x']<412 and 0<=pt['y']<915)
 page.touchscreen.tap(pts[0]['x'],pts[0]['y'])
 check('First tap selects source',page.evaluate("VeyraCore.state.src")==pts[0]['id'])
 page.touchscreen.tap(pts[1]['x'],pts[1]['y'])
 check('Second tap selects destination',page.evaluate("VeyraCore.state.dst")==pts[1]['id'])
 page.wait_for_timeout(210)
 print('PICKER AFTER',page.evaluate("({cls:document.querySelector('.sendbar').className,from:VeyraCore.state.src,to:VeyraCore.state.dst})"),'ERRORS',errors,flush=True)
 check('Expanded packet tray restores after destination',page.locator('.v06-sendbar.v06-collapsed').count()==0)
 page.locator('#v06-expand-packet').click()
 page.evaluate("VeyraNext.showDeviceActions(VeyraCore.state.src)")
 check('Host software firewall button available',page.locator('.v06-firewall-entry').count()==1)
 page.locator('.v06-firewall-entry').click()
 check('Dedicated firewall editor opens',page.locator('#v06-fw-active').is_visible())
 page.locator('#v06-fw-active').select_option('1')
 page.locator('#v06-fw-default').select_option('deny')
 page.locator('[data-v06="fw-save"]').click()
 check('Host policy actually saved',page.evaluate("PacketLabV06.profile(VeyraCore.state.devices.find(d=>d.id===VeyraCore.state.src)).fwPolicy.policy")== 'deny')
 # Model source's firewall is inbound only; allow packet sent from source.
 check('Source firewall does not block its own outbound packet',page.evaluate("""()=>{
   const s=VeyraCore.state,lab=VeyraNext.lab;
   return PacketLabV06.send(s,lab,{source:s.src,target:s.dst,kind:'https',port:443}).ok
 }"""))
 page.evaluate("VeyraNext.showDeviceActions(VeyraCore.state.dst)")
 page.locator('.v06-firewall-entry').click()
 page.locator('#v06-fw-active').select_option('1')
 page.locator('#v06-fw-default').select_option('deny')
 page.locator('[data-v06="fw-save"]').click()
 check('Target firewall blocks inbound traffic with log',page.evaluate("""()=>{
   const s=VeyraCore.state,lab=VeyraNext.lab;
   const r=PacketLabV06.send(s,lab,{source:s.src,target:s.dst,kind:'https',port:443});
   return !r.ok && lab.logs.some(e=>/firewall/.test(e.text)&&e.kind==='blocked')
 }"""))
 check('Target security log stores denied packet',page.evaluate("VeyraCore.state.devices.find(d=>d.id===VeyraCore.state.dst).vprofile.logs.some(x=>x.text.includes('BLOCK'))"))
 check('No JavaScript exceptions',not errors)
 print('EXTRA INTERACTIONS',len(results),'PASS',flush=True)
 browser.close()
