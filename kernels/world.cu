// Finite city: stable absolute lot addresses. No rolling page cache or proxy geometry.
__device__ Lot readLot(const float* World,int slot){
 int b=slot*LOT_FLOATS;Lot l;l.w=World[b];l.d=World[b+1];l.h=World[b+2];l.type=(int)World[b+3];
 l.mat=(int)World[b+4];l.floors=(int)World[b+5];l.seed=World[b+6];l.storey=World[b+7];
 l.roofScale=World[b+8];l.turn=(int)World[b+9];l.ox=World[b+10];l.oz=World[b+11];l.palette=World[b+12];return l;
}
__device__ float3 turnLocal(float3 p,int turn){
 if(turn==1)return make_float3(p.z,p.y,-p.x);
 if(turn==2)return make_float3(-p.x,p.y,-p.z);
 if(turn==3)return make_float3(-p.z,p.y,p.x);return p;
}
__device__ float3 turnWorld(float3 p,int turn){return turnLocal(p,(4-turn)%4);}

__global__ void initCamera(float* C,int seed,int interiorSeed){
 if(blockIdx.x!=0||threadIdx.x!=0)return;for(int i=0;i<64;i++)C[i]=0.0f;
 C[0]=580.0f;C[1]=330.0f;C[2]=-2300.0f;C[3]=-0.48f;C[4]=-0.10f;C[7]=-0.7f;C[8]=0.62f;C[9]=0.93f;C[12]=140.0f;
 C[14]=(float)seed;C[27]=(float)interiorSeed;C[15]=1.0f;C[19]=1.0f;C[25]=1.0f;C[26]=1.0f;C[30]=1.0f;
}
__global__ void stepCamera(float* C,const float* I,float dt,int width,int height){
 if(blockIdx.x!=0||threadIdx.x!=0)return;C[5]+=dt;C[6]+=1.0f;C[13]=(float)height;C[20]=(float)width/(float)height;C[15]=I[23]>0.5f?1.0f:0.0f;
 int v=(int)I[8];if(v>0){
  if(v==1){C[0]=580;C[1]=330;C[2]=-2300;C[3]=-.48f;C[4]=-.10f;C[12]=140;}
  if(v==2){C[0]=-24;C[1]=2.1f;C[2]=-1390;C[3]=.03f;C[4]=.23f;C[12]=12;}
  if(v==3){C[0]=670;C[1]=200;C[2]=220;C[3]=-1.2f;C[4]=.03f;C[12]=50;}
  if(v==4){C[0]=2100;C[1]=2300;C[2]=-3650;C[3]=-.5f;C[4]=-.47f;C[12]=220;}
  if(v==5){C[0]=310;C[1]=14;C[2]=-2320;C[3]=-.4f;C[4]=.11f;C[12]=26;}
  if(v==6){C[0]=-340;C[1]=46;C[2]=-1610;C[3]=-1.40f;C[4]=0;C[12]=5;}
  C[15]=1;
 }
 if(I[3]!=0||I[4]!=0){C[3]+=I[3]*.0022f;C[4]=clampf(C[4]-I[4]*.0022f,-1.53f,1.53f);C[15]=1;}
 if(I[7]!=0)C[12]=clampf(C[12]*expf(-I[7]*.0015f),.05f,900.0f);
 float speed=C[12]*(I[5]>.5f?3.0f:1.0f)*(I[6]>.5f?.15f:1.0f);float3 move=cameraForward(C)*I[0]+cameraRight(C)*I[1]+make_float3(0,I[2],0);
 if(dot3(move,move)>0){move=norm3(move)*speed*dt;C[0]=clampf(C[0]+move.x,-5500,5500);C[1]=clampf(C[1]+move.y,1.0f,4000);C[2]=clampf(C[2]+move.z,-5500,5500);C[15]=1;}
 if(I[9]!=0){C[7]+=I[9]*dt*.35f;C[15]=1;}if(I[10]>.5f){C[11]=(float)(((int)C[11]+1)%4);C[15]=1;}
 if(I[13]!=0){C[9]=clampf(C[9]+I[13]*dt,.25f,3);C[15]=1;}
 if(I[14]>.5f){C[18]=1-C[18];C[15]=1;}if(I[16]>.5f)C[22]=1-C[22];
 if(I[20]>.5f){C[25]=1-C[25];C[15]=1;}if(I[21]>.5f){C[26]=1-C[26];C[15]=1;}
 if(C[22]>.5f){float a=C[5]*.024f;C[0]=sinf(a)*2100;C[2]=-cosf(a)*2900;C[1]=680+100*sinf(a*.7f);C[3]=-a;C[4]=-.2f;C[15]=1;}
 C[19]=C[15]>.5f?1:fminf(64,C[19]+1);
}
__global__ void clearQueue(unsigned int* Queue){if(blockIdx.x==0&&threadIdx.x==0)Queue[0]=0u;}
__global__ void prepareLots(const float* G,const float* Plan,float* World,unsigned int* Queue){
 int slot=(int)(blockIdx.x*blockDim.x+threadIdx.x);if(slot>=WORLD_LOTS)return;int b=slot*LOT_FLOATS;if(World[b+15]>.5f)return;
 Lot l=describeCityLot(slot%WORLD_SIDE-64,slot/WORLD_SIDE-64,readGenome(G),Plan);
 World[b]=l.w;World[b+1]=l.d;World[b+2]=l.h;World[b+3]=(float)l.type;World[b+4]=(float)l.mat;World[b+5]=(float)l.floors;World[b+6]=l.seed;World[b+7]=l.storey;
 World[b+8]=l.roofScale;World[b+9]=(float)l.turn;World[b+10]=l.ox;World[b+11]=l.oz;World[b+12]=l.palette;World[b+15]=1;
 unsigned int i=atomicAdd(&Queue[0],1u);Queue[i+1u]=(unsigned int)slot;
}
__global__ void planBounds(const unsigned int* Queue,unsigned int* Args){
 int chunk=(int)threadIdx.x;if(chunk>=BUILD_CHUNKS)return;int count=(int)Queue[0]-chunk*BUILD_CHUNK;count=count<0?0:(count>BUILD_CHUNK?BUILD_CHUNK:count);
 int b=chunk*21;Args[b]=(unsigned int)count;Args[b+1]=1u;Args[b+2]=1u;int level=1;
 for(int first=32;first>=1;first/=2){Args[b+level*3]=(unsigned int)((count*first+63)/64);Args[b+level*3+1]=1u;Args[b+level*3+2]=1u;level++;}
}
