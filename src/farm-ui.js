import {GpuRuntime} from '../vendor/cuda-webshader/runtime/runtime.js';import {KernelLoader} from './kernel-loader.js';import {encodePlan,GENE_LIMITS,GENOME_NAMES} from './city-data.js';
const $=id=>document.getElementById(id);let stop=false,winner=null;const log=t=>$('log').textContent=t;const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
$('stop').onclick=()=>stop=true;
$('save').onclick=()=>{if(!winner)return;const u=URL.createObjectURL(new Blob([JSON.stringify(winner,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='manhattan-farmed.genome.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
$('run').onclick=async()=>{
 let runtime,loader;stop=false;winner=null;$('run').disabled=true;$('stop').disabled=false;$('save').disabled=true;
 try{
  if(!navigator.gpu)throw Error('WebGPU not available. Use the native npm run farm command instead.');
  const plan=await(await fetch('./cities/manhattan.plan.json',{cache:'no-cache'})).json(),p=encodePlan(plan),adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter');const device=await adapter.requestDevice();runtime=new GpuRuntime(device,{adapter,ownsDevice:true});loader=new KernelLoader(runtime,(name)=>$('status').textContent=name);const kernel=await loader.load('farmCandidates');
  const planBuffer=runtime.createBuffer(p),candidates=runtime.createBuffer(128*12*4),scores=runtime.createBuffer(128*4*4),call=kernel.bind({Candidates:candidates,Plan:planBuffer,Scores:scores},{candidateCount:128,salt:1});
  const budget=Number($('budget').value),searchSeed=Number($('seed').value)>>>0;let rng=searchSeed||1;const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)/4294967296;};
  let elite=[],done=0,baseline=null,history=[];
  while(done<budget&&!stop){
   const list=[];for(let k=0;k<128;k++){let g;
    if(!elite.length||k%8===0)g=GENE_LIMITS.map(([lo,hi])=>lo+random()*(hi-lo));
    else{g=elite[Math.floor(random()*elite.length)].genes.slice();for(let j=1;j<8;j++)if(random()<.65)g[j]+=(random()+random()+random()-1.5)*(GENE_LIMITS[j][1]-GENE_LIMITS[j][0])*(.2-.15*done/budget);if(random()<.2)g[0]=1+Math.floor(random()*16777214);}
    g=g.map((v,j)=>{const [lo,hi]=GENE_LIMITS[j];v=Math.max(lo,Math.min(hi,v));return[0,8,9,10,11].includes(j)?Math.round(v):Math.fround(v);});list.push({genes:g});
   }
   runtime.write(candidates,new Float32Array(list.flatMap(c=>c.genes)));runtime.batch().dispatch(call.setScalars({candidateCount:128,salt:1}),[2]).submit();const values=await runtime.read(scores);
   list.forEach((c,k)=>{c.train=values[k*4];});elite=[...elite,...list].sort((a,b)=>a.train-b.train).filter((c,i,a)=>i===0||c.genes.some((x,j)=>x!==a[i-1].genes[j])).slice(0,16);if(baseline===null)baseline=list.reduce((a,b)=>a.train<b.train?a:b).train;
   done+=128;history.push(elite[0].train);$('progress').value=done/budget;$('status').textContent=done.toLocaleString()+' genomes tested';log('Best training loss: '+elite[0].train.toFixed(6)+'\nSeed: '+elite[0].genes[0]+'\nEvaluating the same CUDA descriptors used by the viewer.');await new Promise(r=>setTimeout(r,0));
  }
  if(!elite.length)throw Error('Search stopped before a completed batch.');
  runtime.write(candidates,new Float32Array(elite.flatMap(e=>e.genes)));runtime.batch().dispatch(call.setScalars({candidateCount:elite.length,salt:917}),[1]).submit();const audit=await runtime.read(scores);elite.forEach((c,k)=>c.audit=audit[k*4]);elite.sort((a,b)=>a.audit-b.audit);const best=elite[0];
  winner={schema:'stratum.city-genome.v1',name:'Manhattan / GPU farm',planFile:'manhattan.plan.json',planHash:await hash(p.buffer),geneNames:GENOME_NAMES,genes:best.genes,search:{backend:'WebGPU',searchSeed,evaluated:done,train:{loss:best.train},audit:{loss:best.audit},bestTrainingHistory:history,finalists:elite}};
  $('status').textContent=stop?'Stopped · best retained':'Genome harvested';log('Candidate evaluations: '+done+'\nTraining loss: '+best.train.toFixed(6)+'\nFresh audit loss: '+best.audit.toFixed(6)+'\nSeed: '+best.genes[0]+'\n\nExport this genome, then import it in the viewer.');$('save').disabled=false;
 }catch(e){$('status').textContent='Search failed';log(e.stack||String(e));}finally{loader?.dispose();runtime?.dispose();$('run').disabled=false;$('stop').disabled=true;}
};
