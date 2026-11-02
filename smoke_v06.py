from pathlib import Path
from playwright.sync_api import sync_playwright
from urllib.parse import quote
import json,traceback
root=Path(__file__).resolve().parent
url=(root/'app/src/main/assets/index.html').as_uri()
results=[]
failures=[]
def check(name,condition):
  try:
    assert condition,name
    results.append(name)
    print('PASS',name,flush=True)
  except Exception as e:
    failures.append(name+': '+str(e))
    print('FAIL',name,str(e),flush=True)
with sync_playwright() as play:
  browser=play.chromium.launch(channel='msedge',headless=True,args=['--disable-extensions'])
  for label,w,h,mobile in [('portrait',412,915,True),('landscape',915,412,True),('desktop',1440,900,False)]:
    ctx=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,is_mobile=mobile,has_touch=mobile)
    page=ctx.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url,wait_until='load')
    page.wait_for_timeout(900)
    check(label+': new v0.6 UI loaded',page.evaluate("!!window.PacketLabV06UI && !!window.PacketLabV06"))
    check(label+': original TopoLab graph preserved',page.evaluate("VeyraCore.state.devices.length")>=8)
    check(label+': simulation autostarts',page.evaluate("VeyraNext.running") is True)
    check(label+': packet panel starts collapsed',page.locator('.sendbar.v06-collapsed').count()==1)
    check(label+': TopoLab credit disclosure is present',page.locator('.v06-credits summary').count()==1)
    if label=='portrait':
      page.screenshot(path=str(root/'preview-v06-home.png'))
      page.locator('#v06-expand-packet').click()
      check('packet drawer expands',page.locator('.sendbar.v06-collapsed').count()==0)
      page.screenshot(path=str(root/'preview-v06-packet-panel.png'))
      page.locator('#v06-kind').select_option('vuln_smb')
      page.locator('#v06-send-now').click()
      check('vulnerability send records simulated outcome',page.evaluate("VeyraNext.lab.logs.some(x=>/FLOW|BLOCK|DROP/.test(x.text))"))
      check('device logs record packet outcome',page.evaluate("VeyraCore.state.devices.some(d=>d.vprofile?.logs?.some(x=>/FLOW|BLOCK|DROP/.test(x.text)))"))
      page.locator('#v06-expand-packet').click()
      page.locator('#v06-build-network').click()
      check('blank build transition prompts',page.locator('[data-v06="blank-start"]').count()==1)
      page.locator('[data-v06="blank-start"]').click()
      check('free build starts with zero devices',page.evaluate("VeyraCore.state.devices.length")==0)
      check('free build simulation continues',page.evaluate("VeyraNext.running") is True)
      page.screenshot(path=str(root/'preview-v06-blank-network.png'))
      page.locator('#v06-learning-mode').click()
      check('Learning hub opens',page.locator('[data-v06="learn-presets"]').count()==1)
      page.locator('[data-v06="learn-presets"]').click()
      check('Learning presets available',page.locator('[data-v06-preset]').count()>=9)
      page.locator('[data-v06-preset="ipv4"]').click()
      check('Learning preset switches to master',page.evaluate("VeyraNext.lab.mode")== 'master')
      check('Learning preset creates tasks',page.evaluate("VeyraNext.lab.tasks.length")>=3)
      check('Learning progress visible',page.locator('#v06-progress.visible').count()==1)
      check('Learning projects saved with mode',page.evaluate("JSON.parse(VeyraNext.pack()).mode")=='master')
      page.screenshot(path=str(root/'preview-v06-learning.png'))
      page.evaluate("VeyraNext.showDeviceActions(VeyraCore.state.devices[0].id)")
      check('Master devices hide Easy Edit',page.locator('#pl-sheet [data-action="easy"]').count()==0)
      check('Master devices hide Edit More',page.locator('#pl-sheet [data-action="more"]').count()==0)
      check('Master devices keep terminal',page.locator('#pl-sheet [data-action="term"]').count()==1)
      page.locator('#pl-close').click()
      page.evaluate("VeyraNext.switchMode('standard')")
      page.evaluate("VeyraNext.showDeviceActions(VeyraCore.state.devices[0].id)")
      check('Standard Lab keeps Easy Edit',page.locator('#pl-sheet [data-action="easy"]').count()==1)
      check('Standard Lab keeps Edit More',page.locator('#pl-sheet [data-action="more"]').count()==1)
      page.locator('#pl-close').click()
      check('No JS runtime exceptions in portrait',not errors)
    if label=='landscape':
      page.screenshot(path=str(root/'preview-v06-landscape.png'))
      check('Landscape buttons inside viewport',page.locator('#v06-build-network').is_visible())
      check('Landscape no horizontal overflow',page.evaluate("document.documentElement.scrollWidth<=innerWidth+3"))
    if label=='desktop':
      page.screenshot(path=str(root/'preview-v06-desktop.png'))
    if errors:
      print('JS ERRORS',label,errors[:10],flush=True)
      failures.extend([label+': '+e for e in errors])
    page.close();ctx.close()
  browser.close()
print('V06 CHECKS',len(results),'passed',len(failures),'failed',flush=True)
if failures:
  print('FAILURES:\n'+'\n'.join(failures),flush=True)
  raise SystemExit(1)
