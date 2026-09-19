/** Full Chromium headless. Explicit software adapter for portable CI only.
 * Rendering and CUDA compute backends are recorded separately in test reports.
 * https://playwright.dev/docs/browsers#chromium-new-headless-mode
 */
export function browserOptions({software=process.env.CW_SOFTWARE_GPU!=='0'}={}){
 const options={channel:'chromium',headless:true,args:software?['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--use-webgpu-adapter=swiftshader']:[]};
 if(process.env.CHROMIUM_EXECUTABLE){options.executablePath=process.env.CHROMIUM_EXECUTABLE;delete options.channel;}
 return options;
}
