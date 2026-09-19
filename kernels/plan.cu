// Finite art-directed island. Same descriptor function is used by seed farming and rendering.
__device__ Genome readGenome(const float* G){Genome g;g.seed=G[0];g.base=G[1];g.downtown=G[2];g.midtown=G[3];g.glass=G[4];g.coverage=G[5];g.variation=G[6];g.setback=G[7];g.palette=G[8];g.facade=G[9];g.interior=G[10];return g;}
__device__ bool insideCity(int x,int z){return x>=-64&&x<64&&z>=-64&&z<64;}
__device__ int citySlot(int x,int z){return (z+64)*WORLD_SIDE+x+64;}
__device__ float3 cityCell(int slot){return make_float3((float)(slot%WORLD_SIDE-64)*CELL,0.0f,(float)(slot/WORLD_SIDE-64)*CELL);}
__device__ float2 coastMask(float x,float z,const float* Plan){
 bool inside=false;float distance=100000.0f;int count=(int)Plan[0];
 for(int i=0;i<64;i++){if(i>=count)break;int j=(i+1)%count;float ax=Plan[16+i*2],az=Plan[17+i*2],bx=Plan[16+j*2],bz=Plan[17+j*2];
  if((az>z)!=(bz>z)){float edge=ax+(z-az)*(bx-ax)/(bz-az);if(x<edge)inside=!inside;}
  float dx=bx-ax,dz=bz-az,u=sat(((x-ax)*dx+(z-az)*dz)/fmaxf(0.0001f,dx*dx+dz*dz));float ex=x-ax-u*dx,ez=z-az-u*dz;distance=fminf(distance,sqrtf(ex*ex+ez*ez));
 }
 return make_float2(inside?1.0f:0.0f,distance);
}
__device__ bool planRect(float x,float z,const float* Plan,int offset,int count){
 for(int i=0;i<8;i++){if(i>=count)break;int b=offset+i*4;if(fabsf(x-Plan[b])<=Plan[b+2]&&fabsf(z-Plan[b+1])<=Plan[b+3])return true;}return false;
}
__device__ int cityGround(float x,float z,const float* Plan){
 float2 coast=coastMask(x,z,Plan);if(coast.x<0.5f){if(planRect(x,z,Plan,216,(int)Plan[4]))return 0;return 9;}
 if(planRect(x,z,Plan,144,(int)Plan[1]))return 7;if(coast.y<Plan[3])return 11;
 int cx=(int)floorf((x+24.0f)/CELL),cz=(int)floorf((z+24.0f)/CELL);float xx=fabsf(x-(float)cx*CELL),zz=fabsf(z-(float)cz*CELL);
 if(imod(cx+2,5)==0||imod(cz+1,4)==0)return 10;
 return xx>21.4f||zz>21.4f?10:11;
}
__device__ int cityDistrict(float z,const float* Plan){for(int i=0;i<3;i++)if(z<Plan[256+i])return i;return 3;}
__device__ Lot describeCityLot(int cx,int cz,Genome g,const float* Plan){
 float x=(float)cx*CELL,z=(float)cz*CELL;unsigned int key=hashU((unsigned int)cx*1973u+(unsigned int)cz*9277u+(unsigned int)g.seed*26699u);
 float a=hash1((int)(key+31u)),b=hash1((int)(key+83u)),v=hash1((int)(key+91u));
 Lot l;l.w=10.0f;l.d=10.0f;l.h=0.0f;l.type=5;l.mat=0;l.floors=0;l.seed=(float)(hashU(key+(unsigned int)g.facade)&65535u);
 l.storey=3.6f;l.roofScale=g.setback;l.turn=0;l.ox=0.0f;l.oz=0.0f;l.palette=(float)imod((int)g.palette+(int)(hashU(key+113u)&3u),8);
 if(!insideCity(cx,cz))return l;
 float2 coast=coastMask(x,z,Plan);
 if(coast.x<0.5f){if(planRect(x,z,Plan,216,(int)Plan[4]))l.type=11;return l;}
 if(coast.y<Plan[3]+25.0f||planRect(x,z,Plan,144,(int)Plan[1])){l.type=3;l.h=9.0f;l.roofScale=1.0f;return l;}
 if(imod(cx+2,5)==0||imod(cz+1,4)==0){l.type=10;return l;}
 // Slight diagonal avenue breaks the rigid grid in the lower city.
 if(z<-650.0f&&fabsf(x-(-190.0f+0.20f*(z+1100.0f)))<18.0f){l.type=10;return l;}
 float px=(x-Plan[248])/Plan[250],pz=(z-Plan[249])/Plan[251];float downtown=expf(-(px*px+pz*pz)*1.45f);
 px=(x-Plan[252])/Plan[254];pz=(z-Plan[253])/Plan[255];float midtown=expf(-(px*px+pz*pz)*1.45f);
 float envelope=g.base+g.downtown*downtown+g.midtown*midtown;
 float height=clampf(envelope*(1.0f+g.variation*(v*2.0f-1.0f)),14.0f,270.0f);
 int district=cityDistrict(z,Plan);float glassChance=clampf(g.glass+(fmaxf(downtown,midtown)-0.4f)*0.36f,0.08f,0.88f);
 l.type=height>58.0f?(a<glassChance?6:7):(a<glassChance*0.48f?6:8);
 l.storey=l.type==6?3.9f:3.4f;l.floors=(int)clampf(floorf(height/l.storey),3.0f,72.0f);l.h=4.2f+(float)l.floors*l.storey;
 float footprint=sqrtf(g.coverage);l.w=clampf((18.6f+a*4.0f)*footprint,11.0f,21.0f);l.d=clampf((18.6f+b*4.0f)*footprint,11.0f,21.0f);
 l.mat=l.type==6?22:(b>.58f?0:1);l.ox=(b-0.5f)*1.4f;l.oz=(v-0.5f)*1.4f;
 if(l.type==8&&hash1((int)(key+211u))<0.22f){l.type=0;l.floors=(int)fminf(6.0f,(float)l.floors);l.h=4.2f+l.floors*l.storey;l.roofScale=0.8f+0.28f*b;}
 // Anchors constrain exceptional skyline shapes, but their buildings use the same grammar.
 for(int i=0;i<8;i++){if(i>=(int)Plan[2])break;int p=176+i*5;float dx=x-Plan[p],dz=z-Plan[p+1];if(dx*dx+dz*dz<Plan[p+2]*Plan[p+2]){l.type=(int)Plan[p+4];l.floors=(int)(Plan[p+3]/3.9f);l.storey=3.9f;l.h=4.2f+l.floors*l.storey;l.w=19.0f;l.d=19.0f;l.roofScale=.22f;l.mat=l.type==6?22:0;}}
 return l;
}
