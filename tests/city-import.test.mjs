import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {resolveCityImport,cityBundle} from '../src/city-import.js';
const plan=JSON.parse(await fs.readFile(new URL('../cities/manhattan.plan.json',import.meta.url)));
const genome=JSON.parse(await fs.readFile(new URL('../cities/manhattan.genome.json',import.meta.url)));
test('imports a matching pair in either order and round-trips a bundle',async()=>{
 for(const values of [[plan,genome],[genome,plan],[cityBundle(plan,genome)]]){
  const result=await resolveCityImport(values,null);
  assert.deepEqual(result.plan,plan);assert.deepEqual(result.genome,genome);assert.equal(result.customPlan,true);
 }
});
test('legacy genome-only imports retain the active plan',async()=>{
 const result=await resolveCityImport([genome],plan);
 assert.equal(result.plan,plan);assert.equal(result.customPlan,false);
});
test('rejects mismatched plans without modifying the caller data',async()=>{
 const other=structuredClone(plan);other.waterfrontWidth+=1;
 const before=JSON.stringify(other);
 await assert.rejects(resolveCityImport([other,genome],plan),/different shape plan/);
 assert.equal(JSON.stringify(other),before);
});
test('rejects incomplete, ambiguous, malformed and unsupported selections',async()=>{
 for(const values of [[],[plan],[genome,genome],[plan,plan],[{}],[{schema:'stratum.city-bundle.v1',genome}],[cityBundle(plan,genome),genome],[{...genome,genes:[1]}]]){
  await assert.rejects(resolveCityImport(values,plan));
 }
});
