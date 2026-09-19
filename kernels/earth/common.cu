// STRATUM EARTH: shared analytic math, no mesh or scene graph.
#define E_PI 3.14159265358979323846f
#define E_FAR 100000000.0f
__device__ float eSat(float x){return fminf(1.0f,fmaxf(0.0f,x));}
__device__ float eDot(float3 a,float3 b){return a.x*b.x+a.y*b.y+a.z*b.z;}
__device__ float3 eNorm(float3 v){return v/fmaxf(.0000001f,sqrtf(eDot(v,v)));}
__device__ float3 eMix(float3 a,float3 b,float f){return a+(b-a)*eSat(f);}
__device__ float eFract(float x){return x-floorf(x);}
__device__ unsigned int eHash(unsigned int v){v^=v>>16;v*=2146121005u;v^=v>>15;v*=2221713035u;return v^(v>>16);}
__device__ float eRandom(unsigned int v){return (float)(eHash(v)&16777215u)/16777216.0f;}
__device__ float3 eLoad3(const float* a,int i){return make_float3(a[i],a[i+1],a[i+2]);}
__device__ float3 eRay(const float* C,int x,int y,int width,int height,int offset){
 float u=(2.0f*((float)x+.5f)/(float)width-1.0f)*C[11]*C[7],v=(1.0f-2.0f*((float)y+.5f)/(float)height)*C[7];
 return eNorm(eLoad3(C,4+offset)+eLoad3(C,8+offset)*u+eLoad3(C,12+offset)*v);
}
// Rendering-only float32 powers: do not invoke the compiler's exact powf/f64 path.
__device__ float eSquare(float x){return x*x;}
__device__ float eCube(float x){return x*x*x;}
__device__ float eFourth(float x){float y=x*x;return y*y;}
__device__ float ePow80(float x){float x2=x*x,x4=x2*x2,x8=x4*x4,x16=x8*x8,x32=x16*x16,x64=x32*x32;return x64*x16;}
__device__ float ePow128(float x){float x2=x*x,x4=x2*x2,x8=x4*x4,x16=x8*x8,x32=x16*x16,x64=x32*x32;return x64*x64;}
__device__ float eGamma(float x){x=eSat(x);return x>0?expf(logf(x)*.454545f):0.0f;}
__device__ unsigned int ePack(float3 c){c=make_float3(eGamma(c.x),eGamma(c.y),eGamma(c.z));return (unsigned int)(c.x*255.0f)|((unsigned int)(c.y*255.0f)<<8)|((unsigned int)(c.z*255.0f)<<16)|4278190080u;}
__device__ float eInv(float x){return fabsf(x)>.00000001f?1.0f/x:(x<0?-1.0e20f:1.0e20f);}
__device__ float2 eBox(float3 ro,float3 rd,float3 lo,float3 hi){
 float3 a=(lo-ro)*make_float3(eInv(rd.x),eInv(rd.y),eInv(rd.z)),b=(hi-ro)*make_float3(eInv(rd.x),eInv(rd.y),eInv(rd.z));
 return make_float2(fmaxf(fmaxf(fminf(a.x,b.x),fminf(a.y,b.y)),fminf(a.z,b.z)),fminf(fminf(fmaxf(a.x,b.x),fmaxf(a.y,b.y)),fmaxf(a.z,b.z)));
}
struct EarthHit {float t;float3 normal;int object;};
__device__ EarthHit eEmpty(){EarthHit h;h.t=E_FAR;h.normal=make_float3(0,1,0);h.object=-1;return h;}
__device__ float eNoise(float x,float y){float a=floorf(x),b=floorf(y),u=eFract(x),v=eFract(y);u=u*u*(3-2*u);v=v*v*(3-2*v);float r=eRandom((unsigned int)(a+65536)*317u+(unsigned int)(b+65536)*911u),s=eRandom((unsigned int)(a+65537)*317u+(unsigned int)(b+65536)*911u),t=eRandom((unsigned int)(a+65536)*317u+(unsigned int)(b+65537)*911u),w=eRandom((unsigned int)(a+65537)*317u+(unsigned int)(b+65537)*911u);return (r+(s-r)*u)*(1-v)+(t+(w-t)*u)*v;}
