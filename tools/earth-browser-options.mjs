/** Use full Chromium's new headless mode, not chrome-headless-shell. The shell
 * can execute compute/offscreen work while lacking a compatible WebGPU canvas
 * shared-image backing; that must not be mistaken for working presentation.
 * https://playwright.dev/docs/browsers#chromium-new-headless-mode
 */
export function browserOptions({software=process.env.CW_SOFTWARE_GPU!=='0'}={}){
 const options={channel:'chromium',headless:true,args:software?['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--use-webgpu-adapter=swiftshader']:[]};
 if(process.env.CHROMIUM_EXECUTABLE){options.executablePath=process.env.CHROMIUM_EXECUTABLE;delete options.channel;}
 return options;
}
