// Analytic WGS84 ellipsoid in Earth-centred coordinates. No globe mesh.
__device__ float eLand(const unsigned int* Land,float lat,float lon){
 int x=(int)floorf((lon+E_PI)/(2*E_PI)*1024),y=(int)floorf((.5f-lat/E_PI)*512);x=x<0?0:(x>1023?1023:x);y=y<0?0:(y>511?511:y);return (float)Land[y*1024+x];
}
__device__ float3 eGlobe(const float* C,const unsigned int* Land,float3 rd){
 float3 ro=eLoad3(C,16),o=make_float3(ro.x,ro.y,ro.z/0.996647189335f),d=make_float3(rd.x,rd.y,rd.z/0.996647189335f);
 float a=eDot(d,d),b=eDot(o,d),cc=eDot(o,o)-1,disc=b*b-a*cc;
 float3 sun=eLoad3(C,32),space=make_float3(.0018f,.003f,.007f);float glow=ePow128(fmaxf(0,eDot(rd,sun)));
 if(disc<0){float edge=expf(-fabsf(disc)*90.0f);return space+make_float3(.025f,.12f,.22f)*edge+make_float3(.4f,.32f,.2f)*glow;}
 float t=(-b-sqrtf(disc))/a;if(t<0)t=(-b+sqrtf(disc))/a;if(t<=0)return space;
 float3 p=ro+rd*t,n=eNorm(make_float3(p.x,p.y,p.z/(.996647189335f*.996647189335f)));float lat=atan2f(n.z,sqrtf(n.x*n.x+n.y*n.y)),lon=atan2f(p.y,p.x),land=eLand(Land,lat,lon);
 float k=eNoise(lon*12,lat*12),polar=eSat((fabsf(lat)-1.1f)*4),arid=expf(-eSquare((fabsf(lat)-.48f)*5));
 float3 landColor=eMix(make_float3(.075f,.16f,.11f),make_float3(.29f,.24f,.14f),arid*.75f+k*.25f);landColor=eMix(landColor,make_float3(.75f,.83f,.84f),polar);
 float3 color=eMix(make_float3(.009f,.042f,.075f),landColor,land);if(C[23]<.5f)color=make_float3(.065f,.085f,.10f);
 float day=fmaxf(0,eDot(n,sun)),rim=eCube(1-fmaxf(0,eDot(n,rd*(-1.0f))));color=color*(.12f+day*.94f);color=color+make_float3(.025f,.16f,.30f)*rim*(.2f+day);
 if(land<.5f&&C[23]>.5f){float3 reflected=n*(2*eDot(n,sun))-sun;color=color+make_float3(.25f,.29f,.3f)*ePow80(fmaxf(0,eDot(reflected,rd*(-1.0f))));}
 if(C[27]>.5f){float grid=fminf(fabsf(sinf(lon*18)),fabsf(sinf(lat*18)));if(grid<.035f)color=eMix(color,make_float3(.18f,.7f,.65f),.6f);}
 return color;
}
__global__ void earthGlobe(const float* C,const unsigned int* Land,unsigned int* Pixels,int width,int height){
 int x=(int)(blockIdx.x*blockDim.x+threadIdx.x),y=(int)(blockIdx.y*blockDim.y+threadIdx.y);if(x>=width||y>=height)return;int i=y*width+x;
 Pixels[i]=ePack(eGlobe(C,Land,eRay(C,x,y,width,height,16)));Pixels[width*height+i]=0u;
}
