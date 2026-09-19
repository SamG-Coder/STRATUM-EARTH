__global__ void shadePixels(const float* World,const float* C,const float* Hit,const float* Surface,const float* Room,const float* Reflection,float* Linear,int width,int height,int rowStart,int rowCount){
 int x=(int)(blockIdx.x*blockDim.x+threadIdx.x),y=rowStart+(int)(blockIdx.y*blockDim.y+threadIdx.y);if(x>=width||y>=height||y>=rowStart+rowCount)return;int b=(y*width+x)*4;
 float3 rd=rayDirection(C,x,y,width,height),ro=cameraPosition(C),sun=sunDirection(C),result=sky(rd,sun);int id=(int)Hit[b+1],mat=(int)Hit[b+2],slot=(int)Surface[b+3];float t=Hit[b],seed=Hit[b+3];
 if(id!=-10000){
  float3 p=ro+rd*t,n=make_float3(Surface[b],Surface[b+1],Surface[b+2]);float fp=fmaxf(.00005f,t*1.08f/(float)height);
  result=litSurface(World,p,n,rd,sun,mat,seed,slot,fp,C[18]<.5f);
  if(glassMaterial(mat)||mat==9){
   float3 baseNormal=n;if(mat==9)n=waterNormal(p,fp);float3 rr=rd-n*(2*dot3(rd,n)),reflection=sky(rr,sun);
   // Reject half-resolution samples from unrelated panes, foreground edges or opposing walls.
   if(C[25]>.5f){int rw=(width+1)/2,rh=(height+1)/2;float3 sum=make_float3(0,0,0);float weights=0;
    for(int k=0;k<4;k++){
     int xx=x/2+(k%2),yy=y/2+(k/2);if(xx>=rw||yy>=rh)continue;int j=(yy*rw+xx)*4,hb=((yy*2)*width+xx*2)*4;
     float dep=Reflection[j+3];float3 nn=make_float3(Surface[hb],Surface[hb+1],Surface[hb+2]);
     if(dep>0&&fabsf(dep-t)<fmaxf(.5f,t*.025f)&&dot3(nn,baseNormal)>.985f&&(int)Hit[hb+2]==mat){float w=1.0f/(1.0f+fabsf(dep-t));sum=sum+make_float3(Reflection[j],Reflection[j+1],Reflection[j+2])*w;weights+=w;}
    }if(weights>0)reflection=sum/weights;
   }
   float nv=sat(-dot3(n,rd)),f0=mat==9?.025f:.055f,fresnel=f0+(1-f0)*powf(1-nv,5);
   if(glassMaterial(mat)){
    float4 pane=make_float4(Room[b],Room[b+1],Room[b+2],Room[b+3]);
    float3 interior=pane.z>0&&C[26]>.5f?roomInterior(pane,n,rd,seed,C[27],fp):make_float3(.018f,.026f,.032f);
    float coating=mat==20?.23f:.08f;float reflected=clampf(fresnel+coating,0,1);result=interior*(1-reflected)+reflection*reflected+result*.10f;
   }else result=result*(1-fresnel)+reflection*make_float3(.65f,.88f,1.0f)*fresnel;
  }
  // Stable art-directed haze, not a screen-space LOD hiding a second geometric model.
  float fog=1-expf(-t*.000055f);float3 haze=sky(norm3(make_float3(rd.x,.004f,rd.z)),sun);result=mix3(result,haze,fog);
  if(C[11]==1){int type=slot>=0?(int)World[slot*LOT_FLOATS+3]:mat;result=make_float3(.2f+.7f*hash1(type),.2f+.7f*hash1(type+31),.2f+.7f*hash1(type+98));}
  if(C[11]==2){int g=id>=0?id/MAX_FEATURES:0;result=make_float3(.15f+.75f*hash1(g),.15f+.75f*hash1(g+31),.15f+.75f*hash1(g+98));}
  if(C[11]==3)result=(n+make_float3(1,1,1))*.5f;
 }
 Linear[b]=result.x;Linear[b+1]=result.y;Linear[b+2]=result.z;Linear[b+3]=1;
}
__device__ float aces(float x){return sat(x*(2.51f*x+0.03f)/(x*(2.43f*x+0.59f)+0.14f));}
__global__ void resolveFrame(const float* Linear,float* History,unsigned int* Pixels,const float* C,const float* Hit,const float* Surface,int width,int height){
 int x=(int)(blockIdx.x*blockDim.x+threadIdx.x),y=(int)(blockIdx.y*blockDim.y+threadIdx.y);if(x>=width||y>=height)return;int b=(y*width+x)*4;
 float3 c=make_float3(Linear[b],Linear[b+1],Linear[b+2]);
 if(C[11]<0.5f&&(int)Hit[b+1]!=-10000&&Hit[b]<250.0f){
  float3 ro=cameraPosition(C),point=ro+rayDirection(C,x,y,width,height)*Hit[b];
  float3 n=make_float3(Surface[b],Surface[b+1],Surface[b+2]);float occ=0.0f;
  float radius=clampf((float)height/(fmaxf(Hit[b],0.5f)*1.08f)*0.8f,3.0f,28.0f);
  for(int k=0;k<8;k++){float a=(float)k*PI*0.25f+0.2f;int xx=(int)clampf((float)x+cosf(a)*radius,0.0f,(float)(width-1)),yy=(int)clampf((float)y+sinf(a)*radius,0.0f,(float)(height-1));int j=(yy*width+xx)*4;
   if((int)Hit[j+1]!=-10000){float3 other=ro+rayDirection(C,xx,yy,width,height)*Hit[j],delta=other-point;float len=length3(delta);if(len>0.04f&&len<2.0f)occ+=fmaxf(0.0f,dot3(n,delta/len)-0.12f)*expf(-len*1.4f)*0.28f;}}
  c=c*clampf(1.0f-occ,0.55f,1.0f);
 }
 float oldCount=History[b+3],count=C[19]<=1.0f?1.0f:fminf(64.0f,oldCount+1.0f);
 float3 old=make_float3(History[b],History[b+1],History[b+2]);
 if(C[19]>=64.0f&&oldCount>=64.0f)c=old;
 else c=mix3(old,c,1.0f/count);
 History[b]=c.x;History[b+1]=c.y;History[b+2]=c.z;History[b+3]=count;
 float sx=((float)x/(float)width-0.5f)*1.3f,sy=((float)y/(float)height-0.5f)*1.3f;
 c=c*(C[9]*(1.0f-(sx*sx+sy*sy)*0.12f));
 c=make_float3(powf(aces(c.x),1.0f/2.2f),powf(aces(c.y),1.0f/2.2f),powf(aces(c.z),1.0f/2.2f));Pixels[y*width+x]=packRGBA(c);
}
