// Shape-plan / genome wire format. Geometry generation itself lives in kernels/plan.cu.
export const PLAN_FLOATS=320, GENOME_FLOATS=12;
export const GENOME_NAMES=['seed','baseHeight','downtownRise','midtownRise','glassMix','coverage','heightVariation','setback','palette','facadeSeed','interiorSeed','version'];
export const GENE_LIMITS=[[1,16777215],[18,52],[45,180],[45,190],[.15,.85],[.42,.9],[.15,.85],[.08,.32],[0,7],[1,16777215],[1,16777215],[1,1]];
const finite=(v,name)=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error('Invalid '+name);return v;};
export function encodePlan(plan){
 if(plan?.schema!=='stratum.shape-plan.v1'||plan.cellSize!==48)throw Error('Unsupported shape plan; expected v1 with 48 m cells.');
 if(!Array.isArray(plan.coastline)||plan.coastline.length<3||plan.coastline.length>64)throw Error('Coastline requires 3–64 vertices.');
 if(plan.parks.length>8||plan.anchors.length>8||plan.piers.length>8||plan.districts.length!==4||plan.skylinePeaks.length!==2)throw Error('Shape-plan field capacity exceeded.');
 for(const p of [...plan.parks,...plan.piers])if(!(p.halfWidth>0&&p.halfDepth>0))throw Error('Plan rectangles need positive dimensions.');
 for(const p of plan.skylinePeaks)if(!(p.sigmaX>0&&p.sigmaZ>0))throw Error('Skyline peaks need positive spreads.');
 for(const p of plan.anchors)if(!(p.radius>0&&p.height>=14&&p.height<=420&&[6,7].includes(p.family)))throw Error('Invalid landmark constraint.');
 if(!(plan.waterfrontWidth>=0&&plan.waterfrontWidth<=160))throw Error('Invalid waterfront width.');
 for(let i=0;i<4;i++){const d=plan.districts[i];if(!(d.targetMeanHeight>0&&d.targetTallFraction>=0&&d.targetTallFraction<=1&&d.targetGlassFraction>=0&&d.targetGlassFraction<=1))throw Error('Invalid district targets.');if(i&&d.zMax<=plan.districts[i-1].zMax)throw Error('District boundaries must be ordered.');}
 const a=new Float32Array(PLAN_FLOATS);a[0]=plan.coastline.length;a[1]=plan.parks.length;a[2]=plan.anchors.length;a[3]=finite(plan.waterfrontWidth,'waterfrontWidth');a[4]=plan.piers.length;
 plan.coastline.forEach((v,i)=>{if(v.length!==2)throw Error('Coastline vertex must be [x,z].');a[16+i*2]=finite(v[0],'coast x');a[17+i*2]=finite(v[1],'coast z');if(Math.max(Math.abs(v[0]),Math.abs(v[1]))>2800)throw Error('Coastline outside finite city grid.');});
 plan.parks.forEach((p,i)=>['x','z','halfWidth','halfDepth'].forEach((k,j)=>a[144+i*4+j]=finite(p[k],k)));
 plan.anchors.forEach((p,i)=>['x','z','radius','height','family'].forEach((k,j)=>a[176+i*5+j]=finite(p[k],k)));
 plan.piers.forEach((p,i)=>['x','z','halfWidth','halfDepth'].forEach((k,j)=>a[216+i*4+j]=finite(p[k],k)));
 plan.skylinePeaks.forEach((p,i)=>['x','z','sigmaX','sigmaZ'].forEach((k,j)=>a[248+i*4+j]=finite(p[k],k)));
 plan.districts.forEach((d,i)=>{a[256+i]=finite(d.zMax,'zMax');a[260+i]=finite(d.targetMeanHeight,'targetMeanHeight');a[264+i]=finite(d.targetTallFraction,'targetTallFraction');a[268+i]=finite(d.targetGlassFraction,'targetGlassFraction');});
 a[272]=finite(plan.targetCoverage,'coverage');a[273]=finite(plan.targetHeightVariation,'variation');return a;
}
export function encodeGenome(value){
 const v=Array.isArray(value)?value:value?.genes;
 if(!Array.isArray(v)||v.length!==GENOME_FLOATS)throw Error('Genome must contain twelve genes.');
 const out=new Float32Array(v.map((x,i)=>{finite(x,GENOME_NAMES[i]);const [lo,hi]=GENE_LIMITS[i];if(x<lo||x>hi)throw Error('Out-of-range gene '+GENOME_NAMES[i]);if([0,8,9,10,11].includes(i)&&!Number.isInteger(x))throw Error('Integer gene required: '+GENOME_NAMES[i]);return x;}));return out;
}
export function validateGenomeFile(value){if(value?.schema!=='stratum.city-genome.v1')throw Error('Unsupported city genome.');return encodeGenome(value);}
