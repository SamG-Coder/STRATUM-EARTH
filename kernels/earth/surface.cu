// Local ENU rays: stable metre-scale positions, source-height terrain and exact polygon walls.
__device__ float eTerrain(const float* T,float x,float z){int n=(int)T[0];float u=fmaxf(0,fminf((float)n-1,(x+T[1])/T[2])),v=fmaxf(0,fminf((float)n-1,(z+T[1])/T[2]));int ix=(int)floorf(u),iz=(int)floorf(v);ix=ix>=n-1?n-2:ix;iz=iz>=n-1?n-2:iz;float fx=u-(float)ix,fz=v-(float)iz;int b=16+iz*n+ix;return (T[b]*(1-fx)+T[b+1]*fx)*(1-fz)+(T[b+n]*(1-fx)+T[b+n+1]*fx)*fz;}
__device__ EarthHit eGround(const float* T,float3 ro,float3 rd){
 EarthHit h=eEmpty();float r=T[1],s=T[2];int n=(int)T[0];float2 bounds=eBox(ro,rd,make_float3(-r,T[4]-2,-r),make_float3(r,T[5]+2,r));float t=fmaxf(.001f,bounds.x),end=bounds.y;if(end<t)return h;
 float3 start=ro+rd*(t+.0001f);int x=(int)floorf((start.x+r)/s),z=(int)floorf((start.z+r)/s);x=x<0?0:(x>=n-1?n-2:x);z=z<0?0:(z>=n-1?n-2:z);
 int sx=rd.x>=0?1:-1,sz=rd.z>=0?1:-1;float tx=(s*(float)(x+(sx>0?1:0))-r-ro.x)*eInv(rd.x),tz=(s*(float)(z+(sz>0?1:0))-r-ro.z)*eInv(rd.z);if(fabsf(rd.x)<.00000001f)tx=E_FAR;if(fabsf(rd.z)<.00000001f)tz=E_FAR;
 float dx=fabsf(s*eInv(rd.x)),dz=fabsf(s*eInv(rd.z));
 for(int step=0;step<260;step++){
  if(x<0||z<0||x>=n-1||z>=n-1||t>end)break;float next=fminf(end,fminf(tx,tz)),span=fmaxf(0,next-t);int b=16+z*n+x;
  float ux=(ro.x+rd.x*t+r)/s-(float)x,vz=(ro.z+rd.z*t+r)/s-(float)z,bx=T[b+1]-T[b],bz=T[b+n]-T[b],bc=T[b+n+1]-T[b+1]-T[b+n]+T[b];
  float a=-bc*rd.x*rd.z/(s*s),lin=rd.y-(bx*rd.x+bz*rd.z+bc*(ux*rd.z+vz*rd.x))/s,c=ro.y+rd.y*t-(T[b]+bx*ux+bz*vz+bc*ux*vz),root=E_FAR;
  if(fabsf(a)<.00000001f){if(fabsf(lin)>.0000001f)root=-c/lin;}else{float dis=lin*lin-4*a*c;if(dis>=0){float q=-.5f*(lin+(lin>=0?1.0f:-1.0f)*sqrtf(dis)),r0=q/a,r1=fabsf(q)>.0000001f?c/q:E_FAR;if(r0>=-.0001f)root=r0;if(r1>=-.0001f&&r1<root)root=r1;}}
  if(root>=-.0001f&&root<=span+.0001f){h.t=t+fmaxf(0,root);float3 p=ro+rd*h.t;float u=(p.x+r)/s-(float)x,v=(p.z+r)/s-(float)z;h.normal=eNorm(make_float3(-(bx+bc*v)/s,1,-(bz+bc*u)/s));return h;}
  if(next>=end)break;bool xx=tx<=tz,zz=tz<=tx;t=next;if(xx){x+=sx;tx+=dx;}if(zz){z+=sz;tz+=dz;}
 }return h;
}
__device__ bool eInside(const float* Edges,int first,int count,float x,float z){bool inside=false;for(int j=0;j<count;j++){int b=(first+j)*4;float x0=Edges[b],z0=Edges[b+1],x1=Edges[b+2],z1=Edges[b+3];if((z0>z)!=(z1>z)&&x<x0+(z-z0)*(x1-x0)/(z1-z0))inside=!inside;}return inside;}
__device__ EarthHit eBuilding(const float* O,const float* E,const float* G,int i,float3 ro,float3 rd,EarthHit hit){
 int b=i*16,first=(int)O[b+4],count=(int)O[b+5];float bottom=O[b+13]+O[b+7],top=O[b+13]+G[i*8];float2 bound=eBox(ro,rd,make_float3(O[b],bottom,O[b+1]),make_float3(O[b+2],top,O[b+3]));if(bound.y<.001f||bound.x>hit.t)return hit;
 if(fabsf(rd.y)>.000001f){float t=(top-ro.y)/rd.y;float3 p=ro+rd*t;if(t>.001f&&t<hit.t&&eInside(E,first,count,p.x,p.z)){hit.t=t;hit.object=i;hit.normal=make_float3(0,1,0);}}
 for(int j=0;j<count;j++){int k=(first+j)*4;float ax=E[k],az=E[k+1],ex=E[k+2]-ax,ez=E[k+3]-az,det=rd.x*ez-rd.z*ex;if(fabsf(det)<.000001f)continue;float rx=ax-ro.x,rz=az-ro.z,t=(rx*ez-rz*ex)/det,u=(rx*rd.z-rz*rd.x)/det;
  if(t>.001f&&t<hit.t&&u>=0&&u<=1){float y=ro.y+rd.y*t;if(y>=bottom&&y<=top){hit.t=t;hit.object=i;hit.normal=eNorm(make_float3(-ez,0,ex));if(eDot(hit.normal,rd)>0)hit.normal=hit.normal*(-1.0f);}}
 }return hit;
}
__device__ EarthHit eObjects(const float* O,const float* E,const float* G,const unsigned int* Index,float radius,float3 ro,float3 rd,EarthHit hit){
 float2 bounds=eBox(ro,rd,make_float3(-radius,-15000,-radius),make_float3(radius,16000,radius));float t=fmaxf(.001f,bounds.x),end=fminf(bounds.y,hit.t);if(t>end)return hit;
 int n=(int)Index[0];float s=2*radius/(float)n;float3 p=ro+rd*(t+.0001f);int x=(int)floorf((p.x+radius)/s),z=(int)floorf((p.z+radius)/s);x=x<0?0:(x>=n?n-1:x);z=z<0?0:(z>=n?n-1:z);int sx=rd.x>=0?1:-1,sz=rd.z>=0?1:-1;
 float tx=(s*(float)(x+(sx>0?1:0))-radius-ro.x)*eInv(rd.x),tz=(s*(float)(z+(sz>0?1:0))-radius-ro.z)*eInv(rd.z),dx=fabsf(s*eInv(rd.x)),dz=fabsf(s*eInv(rd.z));if(fabsf(rd.x)<.00000001f)tx=E_FAR;if(fabsf(rd.z)<.00000001f)tz=E_FAR;
 for(int step=0;step<130;step++){
  if(x<0||z<0||x>=n||z>=n||t>end||t>hit.t)break;int b=4+(z*n+x)*2,first=(int)Index[b],count=(int)Index[b+1];
  for(int k=0;k<count;k++){int i=(int)Index[first+k];if((int)O[i*16+9]==1)hit=eBuilding(O,E,G,i,ro,rd,hit);}
  float next=fminf(tx,tz);bool xx=tx<=tz,zz=tz<=tx;t=next;if(xx){x+=sx;tx+=dx;}if(zz){z+=sz;tz+=dz;}
 }return hit;
}
__device__ float eSegment(float x,float z,float ax,float az,float bx,float bz){float ex=bx-ax,ez=bz-az,u=eSat(((x-ax)*ex+(z-az)*ez)/fmaxf(.000001f,ex*ex+ez*ez));return sqrtf((x-ax-u*ex)*(x-ax-u*ex)+(z-az-u*ez)*(z-az-u*ez));}
__global__ void earthSurface(const float* C,const float* T,const float* Objects,const float* Edges,const unsigned int* Index,const float* Genomes,const unsigned int* Land,unsigned int* Pixels,int width,int height){
 int x=(int)(blockIdx.x*blockDim.x+threadIdx.x),y=(int)(blockIdx.y*blockDim.y+threadIdx.y);if(x>=width||y>=height)return;int id=y*width+x;
 float3 ro=eLoad3(C,0),rd=eRay(C,x,y,width,height,0);EarthHit hit=eGround(T,ro,rd);hit=eObjects(Objects,Edges,Genomes,Index,T[1],ro,rd,hit);
 float3 color=eGlobe(C,Land,eRay(C,x,y,width,height,16));unsigned int pick=0u;
 if(hit.t<E_FAR){float3 p=ro+rd*hit.t,base=make_float3(.17f,.21f,.15f);float shade=.25f+.75f*fmaxf(0,eDot(hit.normal,eLoad3(C,36)));
  if(hit.object>=0){int i=hit.object,b=i*16,g=i*8;pick=(unsigned int)i+1u;base=make_float3(Genomes[g+4],Genomes[g+5],Genomes[g+6]);
   if(fabsf(hit.normal.y)<.5f){float tangent=fabsf(hit.normal.x)>.5f?p.z:p.x,u=eFract(tangent/Genomes[g+1]),v=eFract((p.y-Objects[b+13])/Genomes[g+2]);float footprint=hit.t*C[7]*2/(float)height;
    if(footprint<2.0f&&u>.14f&&u<.8f&&v>.20f&&v<.83f){base=make_float3(.055f,.13f,.19f);float fres=eFourth(1-fabsf(eDot(hit.normal,rd)));base=base+make_float3(.13f,.22f,.29f)*fres;}
   }else base=base*.72f;
   if(C[19]>.5f)base=Objects[b+6]>0?make_float3(.03f,.5f,.35f):make_float3(.75f,.32f,.06f);
  }else{
   float k=eNoise(p.x*.03f,p.z*.03f);base=base*(.8f+k*.4f);int n=(int)Index[0],cx=(int)floorf((p.x+T[1])/(2*T[1])*(float)n),cz=(int)floorf((p.z+T[1])/(2*T[1])*(float)n);
   if(cx>=0&&cz>=0&&cx<n&&cz<n){int ib=4+(cz*n+cx)*2,start=(int)Index[ib],count=(int)Index[ib+1];int surface=0;
    for(int j=0;j<count;j++){int i=(int)Index[start+j],b=i*16,type=(int)Objects[b+9],first=(int)Objects[b+4],edges=(int)Objects[b+5];bool found=false;
     if(type==2){for(int q=0;q<edges;q++){int e=(first+q)*4;if(eSegment(p.x,p.z,Edges[e],Edges[e+1],Edges[e+2],Edges[e+3])<Objects[b+14]*.5f)found=true;}}
     else if(type==3||type==4)found=eInside(Edges,first,edges,p.x,p.z);
     if(found&&(surface!=2||type==2)){surface=type;pick=(unsigned int)i+1u;}
    }
    if(surface==2)base=make_float3(.10f,.115f,.12f);if(surface==3)base=make_float3(.018f,.12f,.17f);if(surface==4)base=make_float3(.065f,.19f,.07f);
   }
   if(C[27]>.5f&&(eFract((p.x+T[1])/(2*T[1])*64)<.03f||eFract((p.z+T[1])/(2*T[1])*64)<.03f))base=make_float3(.1f,.7f,.6f);
  }
  color=base*shade;float fog=1-expf(-hit.t/22000);color=eMix(color,make_float3(.23f,.36f,.44f),fog);
 }
 Pixels[id]=ePack(color);Pixels[width*height+id]=pick;
}
