/** Full Chromium headless, explicit software Vulkan for repeatable CI graphics.
 * Compute-only tests can pass even when the browser compositor cannot share a
 * WebGPU canvas texture. Keep presentation and readback assertions enabled.
 * https://playwright.dev/docs/browsers#chromium-new-headless-mode
 * https://developer.chrome.com/blog/supercharge-web-ai-testing
 */
export function browserOptions({software=process.env.CW_SOFTWARE_GPU!=='0'}={}){
 const options={channel:'chromium',headless:true,args:software?['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-angle=vulkan','--disable-vulkan-surface','--use-webgpu-adapter=swiftshader']:[]};
 if(process.env.CHROMIUM_EXECUTABLE){options.executablePath=process.env.CHROMIUM_EXECUTABLE;delete options.channel;}
 return options;
}
