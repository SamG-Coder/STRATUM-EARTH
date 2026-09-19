// One source list shared by the offline compiler, runtime fallback and tests.
export const UNITS=['common','plan','world','geometry','sink','assets','city-assets','accel','trace','city-trace','materials','lighting','reflection','shade','farm','probe'];
const geometry=['common','plan','world','geometry','sink','assets','city-assets'];
const rules={
 initCamera:['world',[1,1,1],['common','plan','world']],stepCamera:['world',[1,1,1],['common','plan','world']],clearQueue:['world',[1,1,1],['common','plan','world']],prepareLots:['world',[64,1,1],['common','plan','world']],planBounds:['world',[8,1,1],['common','plan','world']],
 buildGroupBounds:['accel',[64,1,1],[...geometry,'accel']],reduceGroupBounds:['accel',[64,1,1],[...geometry,'accel']],
 tracePrimary:['city-trace',[8,8,1],[...geometry,'trace','city-trace']],
 reflectPixels:['reflection',[8,8,1],[...geometry,'trace','city-trace','materials','lighting','reflection']],
 shadePixels:['shade',[8,8,1],['common','plan','world','materials','lighting','shade']],resolveFrame:['shade',[8,8,1],['common','plan','world','materials','lighting','shade']],
 farmCandidates:['farm',[64,1,1],['common','plan','farm']],probeGrammar:['probe',[1,1,1],[...geometry,'probe']]
};
export const SPECS=Object.entries(rules).map(([entry,[file,workgroupSize,dependencies]])=>Object.freeze({entry,file,workgroupSize,dependencies}));
export const compilerOptions=spec=>({entry:spec.entry,workgroupSize:spec.workgroupSize,optimize:'specialize'});
export const RENDER_SPECS=SPECS.filter(s=>!['farmCandidates','probeGrammar'].includes(s.entry));
