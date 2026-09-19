// Candidate search over UNKNOWN visual parameters only. Source footprints never move.
// Input record: bbox4, edgeStart,count,height,minHeight,stableSeed,kind,area,perimeter,prior,ground,width,levels.
// Output: height, windowBay, floorSpacing, roughness, RGB, objective loss.
__global__ void earthFarm(const float* Objects,float* Genomes,int count,int candidates){
 int i=(int)(blockIdx.x*blockDim.x+threadIdx.x);if(i>=count)return;int b=i*16,g=i*8;unsigned int seed=(unsigned int)Objects[b+8];
 float fixedHeight=Objects[b+6],prior=Objects[b+12],levels=Objects[b+15],perimeter=fmaxf(4,Objects[b+11]);
 float best=1.0e20f,bh=12,bw=3,bf=3.1f,br=.7f,bc=.5f;
 // Three progressively narrower generations, 192 candidates/object at the default budget.
 for(int generation=0;generation<3;generation++){
  for(int c=0;c<candidates;c++){
   unsigned int key=seed+(unsigned int)(generation*candidates+c)*1597334677u;
   float r=eRandom(key),s=eRandom(key+17u),v=eRandom(key+59u),height=fixedHeight;
   if(height<=0){height=generation==0?fmaxf(3,prior*(.65f+r*.7f)):fmaxf(3,bh+(r-.5f)*prior*.15f);}
   float floorSize=levels>0?height/levels:2.7f+s*.9f,windows=2.0f+v*2.5f;
   float floors=height/floorSize,bays=perimeter/windows;
   float loss=fabsf(floors-floorf(floors+.5f))*.3f+fabsf(bays-floorf(bays+.5f))*.1f;
   if(fixedHeight<=0)loss+=fabsf(height-prior)/fmaxf(3,prior);
   if(loss<best){best=loss;bh=height;bw=windows;bf=floorSize;br=.32f+eRandom(key+97u)*.55f;bc=eRandom(key+131u);}
  }
 }
 Genomes[g]=fixedHeight>0?fixedHeight:bh;Genomes[g+1]=bw;Genomes[g+2]=bf;Genomes[g+3]=br;
 Genomes[g+4]=.22f+bc*.30f;Genomes[g+5]=.24f+bc*.26f;Genomes[g+6]=.26f+bc*.22f;Genomes[g+7]=best;
}
