// Fixed-budget search over MISSING visual detail only. Inputs never include mutable
// geographic coordinates. Integer fitness matches the JS reference bit-for-bit.
__device__ unsigned int earthStep(unsigned int x){return x*1664525u+1013904223u;}
__device__ unsigned int earthAbs(unsigned int a,unsigned int b){return a>b?a-b:b-a;}
__global__ void detailFarm(const unsigned int* Targets,const unsigned int* Seeds,unsigned int* Results,int featureCount,int candidateCount){
 int i=(int)(blockIdx.x*blockDim.x+threadIdx.x);
 if(i>=featureCount*candidateCount)return;
 int f=i/candidateCount,c=i%candidateCount,b=f*4;
 unsigned int s=earthStep(Seeds[f]^((unsigned int)(c+1)*747796405u));
 unsigned int bay=2200u+(s%39u)*100u;s=earthStep(s);
 unsigned int storey=2700u+(s%16u)*100u;s=earthStep(s);
 unsigned int tone=70u+(s%16u)*10u;
 if(c==0){bay=3400u;storey=3100u;tone=160u;}
 unsigned int db=earthAbs(bay,Targets[b])/100u,dh=earthAbs(storey,Targets[b+1])/100u,dc=earthAbs(tone,Targets[b+2])/4u;
 unsigned int rem=Targets[b+3]%bay,edge=(rem<bay-rem?rem:bay-rem)/100u;
 Results[i*4]=3u*db*db+4u*dh*dh+dc*dc+edge*edge;
 Results[i*4+1]=bay;Results[i*4+2]=storey;Results[i*4+3]=tone;
}
