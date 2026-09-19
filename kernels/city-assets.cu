// New York-inspired families, not replicas of named buildings. Query, bounds and enumeration
// all consume the same emissions. No distance, page-residency or approximate-model branches.
__device__ float towerFactor(Lot l,float y){
 if(l.type==8)return 1.0f;
 if(y<12.0f)return 1.0f;
 if(l.type==6){if(y<l.h*.77f)return .93f;return .93f-l.roofScale*.5f;}
 if(y<l.h*.46f)return .94f;if(y<l.h*.72f)return .94f-l.roofScale*.55f;return .94f-l.roofScale;
}
__device__ Sink cityFamily(Lot l,int group,Sink s){
 float h=l.h,w=l.w,d=l.d,seed=l.seed;int mat=l.mat;
 if(group==0){
  s=emitFeature(s,make_float3(0,.19f,0),make_float3(w+.9f,.19f,d+.9f),0,11,0,seed);
  if(l.type==8)s=emitFeature(s,make_float3(0,h*.5f,0),make_float3(w,h*.5f,d),0,mat,0,seed);
  else{
   float low=0.0f;
   for(int tier=0;tier<4;tier++){
    float high=tier==0?12.0f:(tier==1?h*.46f:(tier==2?h*.72f:h));
    if(l.type==6)high=tier==0?12.0f:(tier==1?h*.48f:(tier==2?h*.77f:h));
    if(high>low){float factor=towerFactor(l,(low+high)*.5f);s=emitFeature(s,make_float3(0,(low+high)*.5f,0),make_float3(w*factor,(high-low)*.5f,d*factor),0,mat,0,seed);}
    low=high;
   }
  }
 }
 if(group==1){
  float f=towerFactor(l,h-.2f),rw=w*f,rd=d*f;
  s=emitFeature(s,make_float3(0,h+.2f,0),make_float3(rw+.18f,.2f,rd+.18f),0,24,0,seed);
  // Parapets and a bounded mechanical penthouse, never scaled by the entire building height.
  for(int side=0;side<4;side++)s=emitWall(s,side,0,0,rw,rd,0,h+.8f,0,side%2==0?rw:rd,.6f,.17f,23,seed);
  s=emitFeature(s,make_float3(-rw*.32f,h+2.0f,0),make_float3(rw*.32f,1.8f,rd*.28f),0,23,0,seed);
  for(int k=0;k<4;k++){
   float xx=((float)(k%2)-.5f)*rw*.6f,zz=((float)(k/2)-.5f)*rd*.75f;
   s=emitFeature(s,make_float3(xx,h+.8f,zz),make_float3(1.1f,.6f,.7f),0,6,0,seed+(float)k);
   s=emitFeature(s,make_float3(xx,h+1.45f,zz),make_float3(.48f,.06f,.48f),2,23,0,seed);
  }
  if(l.type==7||l.type==8){
   s=emitFeature(s,make_float3(rw*.42f,h+3.9f,rd*.36f),make_float3(1.65f,2.0f,1.65f),2,15,0,seed);
   s=emitFeature(s,make_float3(rw*.42f,h+6.0f,rd*.36f),make_float3(1.75f,.42f,1.75f),1,6,0,seed);
   for(int k=0;k<4;k++)s=emitFeature(s,make_float3(rw*.42f+((float)(k%2)-.5f)*2.6f,h+1.4f,rd*.36f+((float)(k/2)-.5f)*2.6f),make_float3(.085f,1.3f,.085f),0,6,0,seed);
  }
  if(h>240.0f){
   s=emitFeature(s,make_float3(0,h+4.0f,0),make_float3(rw*.42f,3.8f,rd*.42f),0,l.type==6?20:0,0,seed);
   s=emitFeature(s,make_float3(0,h+19.0f,0),make_float3(.23f,15.0f,.23f),2,23,0,seed);
  }
 }
 // Twelve vertically bounded slices per facade. A ray never loops over all floors at once.
 if(group>=2&&group<50){
  int face=(group-2)/12,band=(group-2)%12,per=(l.floors+11)/12,first=band*per;
  for(int rr=0;rr<10;rr++){
   int row=first+rr;if(rr>=per||row>=l.floors)break;
   float y=4.2f+((float)row+.5f)*l.storey;if(y>=h-.4f)continue;
   float f=towerFactor(l,y),ww=w*f,dd=d*f,ext=face%2==0?ww:dd;
   int bays=l.type==6?6:5;float pitch=(ext*2.0f-1.2f)/(float)bays;
   // Real spandrels/stone floor courses, one shared layout with window assemblies.
   s=emitWall(s,face,0,0,ww,dd,0,y-l.storey*.5f,.13f,ext,.15f,.18f,l.type==6?22:13,seed);
   for(int j=0;j<6;j++){if(j>=bays)break;float u=((float)j-((float)bays-1.0f)*.5f)*pitch;
    float hw=l.type==6?pitch*.47f:pitch*.34f,hy=l.storey*(l.type==6?.44f:.36f),ss=seed+(float)(row*37+j*7+face*997);
    s=emitWall(s,face,0,0,ww,dd,u,y,.045f,hw,hy,.038f,20,ss);
    s=emitWall(s,face,0,0,ww,dd,u-hw-.04f,y,.10f,.045f,hy+.1f,.095f,l.type==6?23:13,seed);
    s=emitWall(s,face,0,0,ww,dd,u+hw+.04f,y,.10f,.045f,hy+.1f,.095f,l.type==6?23:13,seed);
    s=emitWall(s,face,0,0,ww,dd,u,y-hy-.055f,.12f,hw+.09f,.06f,.17f,l.type==6?23:13,seed);
    if(l.type!=6){s=emitWall(s,face,0,0,ww,dd,u,y,.13f,.035f,hy,.10f,6,seed);s=emitWall(s,face,0,0,ww,dd,u,y+hy+.075f,.10f,hw+.08f,.075f,.14f,13,seed);}
   }
  }
 }
 if(group>=50&&group<54&&l.type==8){
  int face=group-50;float ext=face%2==0?w:d;
  for(int row=1;row<16;row++){if(row>=l.floors)break;float y=4.2f+(float)row*l.storey;
   s=emitWall(s,face,0,0,w,d,ext*.44f,y-.4f,.8f,2.4f,.06f,.78f,6,seed);
   s=emitWall(s,face,0,0,w,d,ext*.44f,y+.55f,1.53f,2.4f,.04f,.04f,6,seed);
   for(int k=0;k<7;k++)s=emitWall(s,face,0,0,w,d,ext*.44f+((float)k-3)*.7f,y+.08f,1.53f,.022f,.49f,.035f,6,seed);
   s=emitWall(s,face,0,0,w,d,ext*.44f+1.8f,y-l.storey*.5f,1.05f,.045f,l.storey*.5f,.035f,6,seed);
  }
 }
 if(group>=54&&group<58){
  int face=group-54;float ext=face%2==0?w:d;
  s=emitWall(s,face,0,0,w,d,ext-.3f,5.0f,.19f,.07f,4.8f,.07f,6,seed);
  s=emitWall(s,face,0,0,w,d,-ext+.3f,5.0f,.19f,.07f,4.8f,.07f,6,seed);
 }
 if(group>=58&&group<62){
  int face=group-58;float ext=face%2==0?w:d;
  for(int j=0;j<4;j++){float u=((float)j-1.5f)*ext*.46f;
   s=emitWall(s,face,0,0,w,d,u,2.0f,.075f,ext*.19f,1.55f,.08f,20,seed+(float)(face*773+j*47));
   s=emitWall(s,face,0,0,w,d,u,3.7f,.34f,ext*.205f,.22f,.43f,6,seed);
   s=emitWall(s,face,0,0,w,d,u,3.72f,.8f,ext*.20f,.045f,.7f,seed>(float)33000?14:6,seed);
   // Small lit nameplate instead of unbounded, repeated text textures.
   s=emitWall(s,face,0,0,w,d,u,3.66f,.79f,ext*.09f,.065f,.016f,8,seed);
  }
 }
 if(group==62){
  for(int k=0;k<4;k++){float xx=((float)k-1.5f)*10.0f;
   s=emitFeature(s,make_float3(xx,.4f,22.0f),make_float3(.13f,.4f,.13f),2,6,0,seed);
  }
  for(int k=0;k<2;k++){float xx=k==0?-22:22;
   s=emitFeature(s,make_float3(xx,3.1f,-22),make_float3(.10f,3.1f,.10f),2,6,0,seed);
   s=emitFeature(s,make_float3(xx,6.2f,-22),make_float3(.43f,.13f,.23f),0,8,0,seed);
   s=emitFeature(s,make_float3(xx,.58f,18),make_float3(.38f,.58f,.38f),2,6,0,seed);
  }
 }
 if(group==63){
  for(int k=0;k<2;k++){float z=k==0?-22:22;
   s=emitFeature(s,make_float3(0,.55f,z),make_float3(1.8f,.12f,.40f),0,15,0,seed);
   s=emitFeature(s,make_float3(0,.92f,z+.31f),make_float3(1.8f,.34f,.06f),0,15,0,seed);
   for(int j=0;j<2;j++)s=emitFeature(s,make_float3(j==0?-1.35f:1.35f,.25f,z),make_float3(.06f,.25f,.32f),0,6,0,seed);
  }
 }
 return s;
}
__device__ Sink cityGroup(Lot lot,int group,Sink s){
 if(lot.type==5||lot.type==10)return s;
 if(lot.type==11){if(group==0){s=emitFeature(s,make_float3(0,.28f,0),make_float3(24,.28f,24),0,0,0,lot.seed);for(int k=0;k<6;k++)s=emitFeature(s,make_float3(((float)k-2.5f)*8,.75f,23.3f),make_float3(.15f,.47f,.15f),2,6,0,lot.seed);}return s;}
 if(lot.type>=6)return cityFamily(lot,group,s);
 return authoredGroup(lot,group,s);
}
