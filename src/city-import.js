import {encodePlan,validateGenomeFile} from './city-data.js';

export async function validateCityPair(plan,genome){
 const planData=encodePlan(plan),genes=validateGenomeFile(genome);
 if(genome.planHash){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',planData));
  const hash=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==genome.planHash)throw Error('This genome was farmed for a different shape plan. Select its matching plan and genome together.');
 }
 return {planData,genes};
}

// Resolve the complete import before touching the running city. File order is irrelevant.
export async function resolveCityImport(values,currentPlan){
 if(!Array.isArray(values)||values.length<1||values.length>2)throw Error('Select a city bundle, a genome, or one plan and one genome.');
 let plan,genome;
 for(const value of values){
  if(value?.schema==='stratum.city-bundle.v1'){
   if(values.length!==1)throw Error('Select a city bundle on its own.');
   plan=value.plan;genome=value.genome;
  }else if(value?.schema==='stratum.shape-plan.v1'){
   if(plan)throw Error('Select only one shape plan.');plan=value;
  }else if(value?.schema==='stratum.city-genome.v1'){
   if(genome)throw Error('Select only one genome.');genome=value;
  }else throw Error('Unsupported city file. Expected a shape plan, genome, or city bundle.');
 }
 if(!genome)throw Error('A shape plan needs a matching farmed genome. Select both JSON files together.');
 if(values[0]?.schema==='stratum.city-bundle.v1'&&!plan)throw Error('City bundle is missing its shape plan.');
 plan=plan||currentPlan;
 await validateCityPair(plan,genome);
 return {plan,genome,customPlan:values.some(v=>v.schema!=='stratum.city-genome.v1')};
}

export function cityBundle(plan,genome){return {schema:'stratum.city-bundle.v1',name:plan.name,plan,genome};}
