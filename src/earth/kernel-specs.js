export const EARTH_SPECS=Object.freeze([
 {entry:'earthLandMask',units:['common','land'],workgroupSize:[8,8,1]},
 {entry:'earthFarm',units:['common','farm'],workgroupSize:[64,1,1]},
 {entry:'earthGlobe',units:['common','globe'],workgroupSize:[8,8,1]},
 {entry:'earthSurface',units:['common','globe','surface'],workgroupSize:[8,8,1]}
]);
export const earthOptions=spec=>({entry:spec.entry,workgroupSize:spec.workgroupSize,optimize:'dependencies'});
