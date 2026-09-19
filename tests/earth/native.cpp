#include "../cuda_compat.hpp"
#include "../../kernels/earth/common.cu"
#include "../../kernels/earth/farm.cu"
#include "../../kernels/earth/globe.cu"
#include "../../kernels/earth/surface.cu"
#include <cassert>
int main(){
 float O[16]={-30,-30,30,30,0,4,37.25f,0,12345,1,3600,240,12,0,6,0},G[8]={};
 blockIdx={0,0,0};threadIdx={0,0,0};blockDim={64,1,1};earthFarm(O,G,1,64);assert(G[0]==37.25f);
 const float E[]={-30,-30,30,-30,30,-30,30,30,30,30,-30,30,-30,30,-30,-30};
 auto wall=eBuilding(O,E,G,0,make_float3(0,20,-100),make_float3(0,0,1),eEmpty());assert(std::abs(wall.t-70)<.001f&&wall.object==0);
 auto roof=eBuilding(O,E,G,0,make_float3(0,100,0),make_float3(0,-1,0),eEmpty());assert(std::abs(roof.t-62.75f)<.001f);
 const float holes[]={-30,-30,30,-30,30,-30,30,30,30,30,-30,30,-30,30,-30,-30,-10,-10,10,-10,10,-10,10,10,10,10,-10,10,-10,10,-10,-10};
 assert(!eInside(holes,0,8,0,0));assert(eInside(holes,0,8,20,0));
 std::vector<float>T(16+129*129,0);T[0]=129;T[1]=1000;T[2]=2000.f/128;T[3]=1;T[4]=0;T[5]=0;
 for(int z=0;z<10;z++){auto d=eNorm(make_float3(.1f*z,-1,.07f*z));auto h=eGround(T.data(),make_float3(0,100,0),d);assert(std::abs(h.t-(-100/d.y))<.03f);}
 for(int z=0;z<129;z++)for(int x=0;x<129;x++)T[16+z*129+x]=(.1f*(float)x+.07f*(float)z);T[5]=22;
 auto h=eGround(T.data(),make_float3(0,100,0),make_float3(0,-1,0));assert(std::abs(h.t-(100-T[16+64*129+64]))<.001f);
 std::cout<<"PASS Earth CUDA source: known heights, wall/roof intersections, holes, sloped and flat terrain roots\n";
}
