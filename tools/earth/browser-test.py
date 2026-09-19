"""Real browser WebGPU tests; explicitly software rendering for reproducible CI.
Run after npm run build. No real geographic providers contacted in regression mode.
"""
import asyncio, json, os, pathlib, struct, subprocess, zlib, sys
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
def png():
 def chunk(t,b): return struct.pack('!I',len(b))+t+b+struct.pack('!I',zlib.crc32(t+b)&0xffffffff)
 # Terrarium RGB 128,0,0 means zero elevation, not an image of the world.
 rows=(b'\x00'+bytes([128,0,0,255])*256)*256
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',256,256,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')
def visible_png(data):
 """Check the world itself, excluding HTML panels; reject black canvas captures."""
 offset=8;packed=b''
 while offset<len(data):
  n=struct.unpack('!I',data[offset:offset+4])[0];kind=data[offset+4:offset+8];body=data[offset+8:offset+8+n];offset+=n+12
  if kind==b'IHDR':w,h,depth,color,_,_,interlaced=struct.unpack('!2I5B',body)
  if kind==b'IDAT':packed+=body
 assert depth==8 and color in (2,6) and interlaced==0,'Unsupported screenshot PNG format'
 channels=3 if color==2 else 4;stride=w*channels;raw=zlib.decompress(packed);previous=bytearray(stride);colors=set();lit=total=0
 def paeth(a,b,c):
  p=a+b-c;da,db,dc=abs(p-a),abs(p-b),abs(p-c)
  return a if da<=db and da<=dc else b if db<=dc else c
 for y in range(h):
  start=y*(stride+1);kind=raw[start];row=bytearray(raw[start+1:start+1+stride])
  for i in range(stride):
   a=row[i-channels] if i>=channels else 0;b=previous[i];c=previous[i-channels] if i>=channels else 0
   row[i]=(row[i]+(0 if kind==0 else a if kind==1 else b if kind==2 else (a+b)//2 if kind==3 else paeth(a,b,c)))&255
  if int(h*.2)<=y<int(h*.6):
   for x in range(int(w*.4),int(w*.65)):
    rgb=tuple(row[x*channels:x*channels+3]);colors.add(rgb);lit+=int(max(rgb)>12);total+=1
  previous=row
 result={'centralColors':len(colors),'nonBlackFraction':lit/max(1,total)}
 assert len(colors)>16 and result['nonBlackFraction']>.05,('The canvas is not visibly presenting the generated world',result)
 return result
async def run():
 server=subprocess.Popen(['node','server.mjs','8099'],cwd=ROOT,stdout=subprocess.DEVNULL)
 output=ROOT/'reports'/'earth';output.mkdir(parents=True,exist_ok=True)
 try:
  async with async_playwright() as p:
   options={'headless':True,'channel':'chromium','args':['--enable-unsafe-webgpu','--use-angle=swiftshader','--use-vulkan=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface','--no-sandbox']}
   if os.getenv('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
   browser=await p.chromium.launch(**options)
   page=await browser.new_page(viewport={'width':1440,'height':900})
   errors=[];messages=[];page.on('pageerror',lambda e:errors.append(str(e)))
   def log(m):
    messages.append({'type':m.type,'text':m.text});print(round(asyncio.get_running_loop().time(),2),m.type,m.text,flush=True)
   page.on('console',log)
   await page.goto('http://localhost:8099/tests/earth/gpu.html');await page.wait_for_function('window.testReady')
   try:
    gpu=await asyncio.wait_for(page.evaluate('window.runEarthTests()'), timeout=180)
   except Exception as e:
    state=await page.evaluate('({stage:window.testStage,progress:window.testProgress,errors:window.testErrors,deviceLost:window.testLost})')
    failure={'error':str(e),'state':state,'console':messages,'pageErrors':errors,'browser':browser.version,'launchArgs':options['args']}
    (output/'gpu-failure.json').write_text(json.dumps(failure,indent=2));print(json.dumps(failure,indent=2),flush=True)
    await page.screenshot(path=str(output/'gpu-failure.png'))
    raise
   (output/'gpu-validation.json').write_text(json.dumps({'gpu':gpu,'browser':browser.version,'launchArgs':options['args'],'softwareAdapterRequested':True},indent=2));print(json.dumps(gpu,indent=2),flush=True)
   await page.evaluate('requestAnimationFrame(async function show(){await window.renderer.present();requestAnimationFrame(show);})')
   await page.screenshot(path=str(output/'gpu-regression.png'))
   # Keep live provider availability out of deterministic tests.
   await page.route('https://raw.githubusercontent.com/**',lambda r:r.fulfill(content_type='application/json',body=json.dumps({'features':[{'geometry':{'type':'Polygon','coordinates':[[[110,-45],[155,-45],[155,-10],[110,-10],[110,-45]]]}}]})))
   await page.route('https://s3.amazonaws.com/**',lambda r:r.fulfill(content_type='image/png',body=png()))
   async def osm(route):
    lat,lon=-37.8136,144.9631;pts=[{'lat':lat+dy,'lon':lon+dx} for dy,dx in [(-.0003,-.0003),(-.0003,.0003),(.0003,.0003),(.0003,-.0003),(-.0003,-.0003)]]
    await route.fulfill(content_type='application/json',body=json.dumps({'elements':[{'type':'way','id':42,'tags':{'building':'yes','height':'45'},'geometry':pts}]}))
   await page.route('https://overpass-api.de/**',osm)
   async def wait_ui(expression,timeout=60000):
    try: await page.wait_for_function(expression,timeout=timeout)
    except Exception as error:
     state=await page.evaluate('({status:document.getElementById("status")?.textContent,log:document.getElementById("log")?.textContent,boot:document.getElementById("boot-error")?.textContent,stats:window.earth?.renderer?.stats(),camera:window.earth?.camera})')
     failure={'error':str(error),'state':state,'console':messages,'pageErrors':errors}
     (output/'ui-failure.json').write_text(json.dumps(failure,indent=2));print(json.dumps(failure,indent=2),flush=True)
     await page.screenshot(path=str(output/'ui-failure.png'))
     raise
   await page.goto('http://localhost:8099/')
   await wait_ui('window.earth?.renderer?.landReady',timeout=60000)
   await wait_ui('window.earth?.renderer?.rendered>0')
   orbit_visible=visible_png(await page.screenshot(path=str(output/'earth-orbit.png')))
   await page.select_option('#destination','-37.8136,144.9631')
   await wait_ui('window.earth?.renderer?.scene?.normalized.count===1',timeout=60000)
   await wait_ui('window.earth.renderer.lastMode==="earthSurface"')
   surface_visible=visible_png(await page.screenshot(path=str(output/'earth-source-footprint.png')))
   # Rapid latest-wins terrain switches must not compile more shader pipelines.
   initial=await page.evaluate('window.earth.renderer.compileCount')
   await page.evaluate('window.earth.destination(35.6812,139.7671);window.earth.destination(48.8566,2.3522)')
   await wait_ui('Math.abs(window.earth.renderer.scene.terrain.frame.lat-48.8566)<.00001',timeout=60000)
   final=await page.evaluate('window.earth.renderer.compileCount')
   assert initial==final==4,(initial,final)
   assert not errors,errors
   report={'gpu':gpu,'browser':browser.version,'softwareAdapterRequested':True,'browserChannel':options['channel'],'launchArgs':options['args'],'ui':{'orbitVisible':orbit_visible,'surfaceVisible':surface_visible,'starts':True,'sourceFootprintLoaded':True,'latestLocationWins':True,'programsAfterLocationChanges':final},'errors':errors,'liveProviderTest':False}
   (output/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
   if '--live-smoke' in sys.argv:
    live=await browser.new_page();await live.goto('http://localhost:8099/tests/earth/live.html');await live.wait_for_function('window.liveReady');smoke=await live.evaluate('window.liveSmoke()');(output/'live-provider-smoke.json').write_text(json.dumps(smoke,indent=2));print(json.dumps(smoke,indent=2))
   await browser.close()
 finally:server.terminate();server.wait(timeout=10)
asyncio.run(run())
