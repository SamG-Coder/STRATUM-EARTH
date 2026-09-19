import {GpuRuntime} from '../vendor/cuda-webshader/runtime/runtime.js';import {KernelLoader} from '../src/kernel-loader.js';import {SPECS} from '../src/kernel-specs.js';import {encodePlan,validateGenomeFile} from '../src/city-data.js';
const log=document.querySelector('#log');const say=t=>{if(log)log.textContent+=t+'\n';console.log(t);};
export async function runChecks(){
 const adapter=await navigator.gpu?.requestAdapter();if(!adapter)throw Error('No WebGPU adapter');const device=await adapter.requestDevice();const errors=[];const runtime=new GpuRuntime(device,{adapter,ownsDevice:true,onError:e=>errors.push(String(e))}),loader=new KernelLoader(runtime,(s)=>say(s));
 try{
  const kernels={};for(const spec of SPECS){kernels[spec.entry]=await loader.load(spec.entry);say('PASS pipeline '+spec.entry);}
  const fixtures=await(await fetch('./probes.json')).json();let max=0;
  for(let i=0;i<fixtures.length;i++){const f=fixtures[i],input=runtime.createBuffer(new Float32Array(f.input)),output=runtime.createBuffer(16*4);runtime.batch().dispatch(kernels.probeGrammar.bind({Inputs:input,Output:output}),[1]).submit();const result=await runtime.read(output);
   for(let j=0;j<16;j++){const e=Math.abs(result[j]-f.expected[j]);max=Math.max(max,e);if(!Number.isFinite(result[j])||e>Math.max(.008,Math.abs(f.expected[j])*.0001))throw Error('Geometry fixture '+i+' channel '+j+': '+result[j]+' vs '+f.expected[j]);}runtime.destroyBuffer(input);runtime.destroyBuffer(output);
  }
  const plan=encodePlan(await(await fetch('../cities/manhattan.plan.json')).json()),genome=await(await fetch('../cities/manhattan.genome.json')).json(),g=validateGenomeFile(genome);
  const p=runtime.createBuffer(plan),c=runtime.createBuffer(g),o=runtime.createBuffer(16);runtime.batch().dispatch(kernels.farmCandidates.bind({Plan:p,Candidates:c,Scores:o},{candidateCount:1,salt:1}),[1]).submit();const result=await runtime.read(o);if(Math.abs(result[0]-genome.search.train.loss)>.003)throw Error('GPU/native seed fitness mismatch '+result[0]+' vs '+genome.search.train.loss);
  if(errors.length)throw Error(errors.join('\n'));const report={passed:true,pipelines:SPECS.length,fixtures:fixtures.length,maxDifference:max,fitness:result[0],adapter:runtime.describe()};say(JSON.stringify(report,null,2));window.gpuResult=report;return report;
 }finally{loader.dispose();runtime.dispose();}
}
const button=document.querySelector('#run');if(button)button.onclick=async()=>{button.disabled=true;try{await runChecks();}catch(e){window.gpuResult={passed:false,error:String(e.stack||e)};say('FAIL '+e.stack);}finally{button.disabled=false;}};window.runGPUChecks=runChecks;
