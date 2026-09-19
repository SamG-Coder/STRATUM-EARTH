// Descriptor-level fitness: shared by the offline native farmer and the optional GPU farmer.
// Targets are art-directed shape-plan constraints, not learned or measured NYC statistics.
struct FarmMetrics { float4 mean; float4 tall; float4 glass; float coverage; float variation; float loss; int count; };
__device__ FarmMetrics measureGenome(Genome g,const float* Plan,int salt){
 float heights[4];float tall[4];float glass[4];float count[4];for(int j=0;j<4;j++){heights[j]=0;tall[j]=0;glass[j]=0;count[j]=0;}
 float cover=0,sum=0,sq=0;int n=0;
 for(int i=0;i<512;i++){
  unsigned int key=hashU((unsigned int)i*4291u+(unsigned int)salt*7919u+127u);
  int x=(int)(key%39u)-18,z=(int)(hashU(key+111u)%97u)-48;Lot lot=describeCityLot(x,z,g,Plan);
  if(!(lot.type<3||(lot.type>=6&&lot.type<=8)))continue;int d=cityDistrict((float)z*CELL,Plan);
  count[d]+=1;heights[d]+=lot.h;if(lot.h>100)tall[d]+=1;if(lot.type==6)glass[d]+=1;
  cover+=lot.w*lot.d*4/(CELL*CELL);sum+=lot.h;sq+=lot.h*lot.h;n++;
 }
 FarmMetrics m;float loss=0;
 for(int j=0;j<4;j++){
  float den=fmaxf(1,count[j]);heights[j]/=den;tall[j]/=den;glass[j]/=den;
  float dh=(heights[j]-Plan[260+j])/fmaxf(20,Plan[260+j]),dt=tall[j]-Plan[264+j],dg=glass[j]-Plan[268+j];
  loss+=dh*dh*.55f+dt*dt*.75f+dg*dg*.8f;if(count[j]<4)loss+=1;
 }
 m.mean=make_float4(heights[0],heights[1],heights[2],heights[3]);m.tall=make_float4(tall[0],tall[1],tall[2],tall[3]);m.glass=make_float4(glass[0],glass[1],glass[2],glass[3]);
 float den=fmaxf(1,(float)n),mean=sum/den;m.coverage=cover/den;m.variation=sqrtf(fmaxf(0,sq/den-mean*mean))/fmaxf(1,mean);
 float dc=m.coverage-Plan[272],dv=m.variation-Plan[273];m.loss=loss+dc*dc*.8f+dv*dv*.16f;m.count=n;return m;
}
__global__ void farmCandidates(const float* Candidates,const float* Plan,float* Scores,int candidateCount,int salt){
 int i=(int)(blockIdx.x*blockDim.x+threadIdx.x);if(i>=candidateCount)return;int b=i*12;
 Genome g;g.seed=Candidates[b];g.base=Candidates[b+1];g.downtown=Candidates[b+2];g.midtown=Candidates[b+3];g.glass=Candidates[b+4];g.coverage=Candidates[b+5];g.variation=Candidates[b+6];g.setback=Candidates[b+7];g.palette=Candidates[b+8];g.facade=Candidates[b+9];g.interior=Candidates[b+10];
 FarmMetrics m=measureGenome(g,Plan,salt);Scores[i*4]=m.loss;Scores[i*4+1]=m.coverage;Scores[i*4+2]=m.variation;Scores[i*4+3]=(float)m.count;
}
