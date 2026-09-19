// CPU reference and regression tests for the SAME authored CUDA used by WebGPU.
// No claim of hardware GPU frame rate is made by this harness.
#include <algorithm>
#include <cassert>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
#include <set>
#include <stdexcept>
#define __device__
#define __global__
#define __shared__
#define __syncthreads() ((void)0)
struct Index {unsigned x=0,y=0,z=0;};
thread_local Index threadIdx,blockIdx,blockDim,gridDim;
struct float2 {float x,y;};struct float3 {float x,y,z;};struct float4{float x,y,z,w;};
float2 make_float2(float x,float y){return {x,y};}float3 make_float3(float x,float y,float z){return {x,y,z};}float4 make_float4(float x,float y,float z,float w){return{x,y,z,w};}
float3 operator+(float3 a,float3 b){return{a.x+b.x,a.y+b.y,a.z+b.z};}float3 operator-(float3 a,float3 b){return{a.x-b.x,a.y-b.y,a.z-b.z};}
float3 operator*(float3 a,float b){return{a.x*b,a.y*b,a.z*b};}float3 operator*(float b,float3 a){return a*b;}float3 operator*(float3 a,float3 b){return{a.x*b.x,a.y*b.y,a.z*b.z};}
float3 operator/(float3 a,float b){return{a.x/b,a.y/b,a.z/b};}
unsigned int atomicAdd(unsigned int* p,unsigned int v){auto old=*p;*p+=v;return old;}
#include <array>
#include "../Stratum.cu"
// Frozen pre-refactor emitter: check identities, not only a new implementation against itself.
namespace reference {
constexpr int CITY=64,PER_CLUSTER=32,PRIMS=2048,PS=16,REQUESTS=8,NODES=4096,MS=12;
constexpr float HALF_CITY=1152;
int pageIndex(int x,int z){return imod(z,16)*16+imod(x,16);}
bool inCity(int x,int z){return x>=-32&&x<32&&z>=-32&&z<32;}
int worldIndex(int x,int z){return(z+32)*64+x+32;}
#include "reference/assets-original.cu"
#define localPoint legacyLocalPoint
#define worldNormal legacyWorldNormal
#define leafNormal legacyLeafNormal
#define foliageHit legacyFoliageHit
#include "reference/trace-original.cu"
#undef localPoint
#undef worldNormal
#undef leafNormal
#undef foliageHit
}
void scalar(){threadIdx={};blockIdx={};blockDim={1,1,1};}
template<class F>void dispatch(int n,F f){for(int i=0;i<n;i++){blockDim={64,1,1};blockIdx={unsigned(i/64),0,0};threadIdx={unsigned(i%64),0,0};f();}}
void require(bool ok,const char* name){if(!ok)throw std::runtime_error(name);std::cout<<"PASS "<<name<<"\n";}
std::vector<Feature> enumerate(Lot l,int g){Sink count=newSink(1,{0,0,0},{0,0,1},FAR);count=cityGroup(l,g,count);std::vector<Feature> out;for(int i=0;i<count.count;i++){Sink s=newSink(2,{0,0,0},{0,0,1},FAR);s.target=i;s=cityGroup(l,g,s);out.push_back(s.feature);}return out;}
std::vector<float> bounds(Lot l){std::vector<float> n(GROUP_NODES*8);for(int g=0;g<CLUSTERS;g++){Sink s=newSink(1,{0,0,0},{0,0,1},FAR);s=cityGroup(l,g,s);int b=(CLUSTERS+g)*8;n[b]=s.lo.x;n[b+1]=s.lo.y;n[b+2]=s.lo.z;n[b+3]=s.count;n[b+4]=s.hi.x;n[b+5]=s.hi.y;n[b+6]=s.hi.z;}
for(int j=CLUSTERS-1;j>=1;j--){int b=j*8,a=j*16,c=a+8;for(int k=0;k<3;k++){n[b+k]=std::min(n[a+k],n[c+k]);n[b+4+k]=std::max(n[a+4+k],n[c+4+k]);}n[b+3]=n[a+3]+n[c+3];}return n;}
float delta(float3 a,float3 b){return std::max({std::fabs(a.x-b.x),std::fabs(a.y-b.y),std::fabs(a.z-b.z)});}
void testGrammar(){
 std::vector<float> world(64*64*8),req(256*8),p(2048*16);int queue[2]={1,0};long checked=0;int maxcount=0;
 for(int type=0;type<=4;type++)for(int v=0;v<3;v++){
  Lot l;l.w=11+v;l.d=10.5f+v;l.floors=3+v;l.storey=3.8f;l.h=4.2f+l.floors*l.storey;l.type=type;l.mat=v%2;l.seed=1788+v*317;l.roofScale=1;l.turn=0;l.ox=0;l.oz=0;l.palette=0;
  int b=reference::worldIndex(0,0)*8;world[b]=l.w;world[b+1]=l.d;world[b+2]=l.h;world[b+3]=type;world[b+4]=l.mat;world[b+5]=l.floors;world[b+6]=l.seed;req[2]=5;
  for(int g=0;g<CLUSTERS;g++){
   blockDim={64,1,1};blockIdx={0,0,0};threadIdx={unsigned(g),0,0};reference::generatePages(world.data(),req.data(),queue,p.data());
   auto features=enumerate(l,g);maxcount=std::max(maxcount,int(features.size()));
   for(int j=0;j<32;j++){int q=(g*32+j)*16;if(p[q+3]<0)continue;if(features.size()<=size_t(j))throw std::runtime_error("feature dropped");const auto& f=features[j];
    if(delta(f.p,{p[q],p[q+1],p[q+2]})>.0001f||delta(f.h,{p[q+4],p[q+5],p[q+6]})>.0001f||f.shape!=int(p[q+3])||f.material!=int(p[q+7])||f.turn!=int(p[q+8])||f.seed!=p[q+9])throw std::runtime_error("Original grammar mismatch type="+std::to_string(type)+" g="+std::to_string(g)+" feature="+std::to_string(j));checked++;
   }
  }
 }
 std::cout<<"Original feature records compared: "<<checked<<"; maximum group size: "<<maxcount<<"\n";
 require(checked>5000&&maxcount<=MAX_FEATURES&&maxcount>32,"exact original geometry/material/seed identity and unclipped hyperdetail additions");
}
std::array<float,320> plan{};std::array<float,12> genes{};
void testCity(){
 Genome g=readGenome(genes.data());int buildings=0,parks=0,waters=0;std::set<int> families;float maxHeight=0;
 for(int z=-64;z<64;z++)for(int x=-64;x<64;x++){
  Lot l=describeCityLot(x,z,g,plan.data()),q=describeCityLot(x,z,g,plan.data());if(l.type!=q.type||l.h!=q.h||l.seed!=q.seed)throw std::runtime_error("nondeterministic descriptor");
  if(l.type==5)waters++;else if(l.type==3)parks++;else if(l.type<3||(l.type>=6&&l.type<=8)){buildings++;families.insert(l.type);maxHeight=std::max(maxHeight,l.h);auto mask=coastMask(float(x)*CELL,float(z)*CELL,plan.data());if(mask.x<.5f)throw std::runtime_error("building in water");}
 }
 std::cout<<"CITY BUILDINGS "<<buildings<<" PARK LOTS "<<parks<<" WATER LOTS "<<waters<<" FAMILIES "<<families.size()<<" MAX HEIGHT "<<maxHeight<<"\n";
 require(buildings>800&&parks>100&&waters>8000&&families.size()>=4&&maxHeight>350,"finite plan contains mixed architecture, parks, water and landmark anchors");
 require(cityGround(2500,0,plan.data())==9&&cityGround(190,1290,plan.data())==7,"water and park masks match the shape plan");
 int rays=0,hits=0,maxcount=0;float worst=0;
 for(int v=0;v<15;v++){
  Lot l=describeCityLot(-6,-32,g,plan.data());l.type=v%3+6;l.w=15;l.d=16;l.storey=3.8f;l.floors=v==14?99:4+v*3;l.h=4.2f+l.floors*l.storey;l.roofScale=.22f;l.mat=l.type==6?22:1;
  auto n=bounds(l);std::vector<Feature> all;for(int group=0;group<CLUSTERS;group++){auto f=enumerate(l,group);maxcount=std::max(maxcount,int(f.size()));all.insert(all.end(),f.begin(),f.end());}
  if(n[8]<-24.1f||n[10]<-24.1f||n[12]>24.1f||n[14]>24.1f)throw std::runtime_error("features escape their DDA cell");
  for(int i=0;i<64;i++){float a=hash1(i*71+v)*6.28318f;float3 ro={cosf(a)*32,hash1(i+v*19)*l.h*1.25f,sinf(a)*32},target={hash1(i+87)*22-11,hash1(i+41)*l.h,hash1(i+109)*22-11},rd=norm3(target-ro);float best=FAR;for(auto&f:all)best=std::min(best,featureHit(f,ro,rd,0));auto h=queryLot(l,n.data(),0,ro,rd,FAR,0);worst=std::max(worst,std::fabs(h.t-best));rays++;if(h.fid>=0)hits++;}
 }
 std::cout<<"NEW FAMILY RAYS "<<rays<<" HITS "<<hits<<" WORST "<<worst<<" MAX GROUP FEATURES "<<maxcount<<"\n";
 require(worst<.001f&&hits>500&&maxcount<=MAX_FEATURES,"new families: accelerated intersections agree with exhaustive exact features");
 FarmMetrics train=measureGenome(g,plan.data(),1),audit=measureGenome(g,plan.data(),917);require(std::isfinite(train.loss)&&std::isfinite(audit.loss)&&train.count>100&&audit.count>100,"finite independent seed-farming train/audit metrics");
 float4 pane={.2f,.1f,1.2f,1.5f};float3 front=roomInterior(pane,{0,0,1},{0,0,-1},1788,genes[10],.002f),angle=roomInterior(pane,{0,0,1},norm3({.6f,.1f,-1}),1788,genes[10],.002f);
 require(std::isfinite(front.x+front.y+front.z+angle.x+angle.y+angle.z)&&delta(front,angle)>.00001f,"interior ray is finite and changes with view direction");
 float c[64]={},input[32]={};scalar();initCamera(c,1788,int(genes[10]));for(int i=0;i<160;i++)stepCamera(c,input,0,1600,900);auto r1=rayDirection(c,88,51,1600,900);for(int i=0;i<128;i++)stepCamera(c,input,0,1600,900);
 require(c[19]==64&&delta(r1,rayDirection(c,88,51,1600,900))==0,"stationary samples settle without endless jitter");
}
void renderCity(const std::string&path,int width,int height,int samples,int bookmark){
 std::vector<float> world(WORLD_LOTS*LOT_FLOATS),nodes(WORLD_LOTS*GROUP_NODES*8),c(64),input(32),hit(width*height*4),surface(hit.size()),room(hit.size()),linear(hit.size()),history(hit.size()),reflection(((width+1)/2)*((height+1)/2)*4);
 std::vector<unsigned> queue(WORLD_LOTS+1),pixels(width*height);
 scalar();initCamera(c.data(),int(genes[0]),int(genes[10]));input[8]=float(bookmark);stepCamera(c.data(),input.data(),0,width,height);clearQueue(queue.data());dispatch(WORLD_LOTS,[&]{prepareLots(genes.data(),plan.data(),world.data(),queue.data());});
 #pragma omp parallel for schedule(dynamic,16)
 for(int slot=0;slot<WORLD_LOTS;slot++){auto l=readLot(world.data(),slot);auto n=bounds(l);std::copy(n.begin(),n.end(),nodes.begin()+slot*GROUP_NODES*8);}
 for(int sample=0;sample<samples;sample++){
  c[19]=float(sample+1);
  #pragma omp parallel for schedule(dynamic,4)
  for(int y=0;y<height;y++)for(int x=0;x<width;x++){blockDim={8,8,1};blockIdx={unsigned(x/8),unsigned(y/8),0};threadIdx={unsigned(x%8),unsigned(y%8),0};tracePrimary(world.data(),nodes.data(),plan.data(),c.data(),hit.data(),surface.data(),room.data(),width,height,0,height);}
  #pragma omp parallel for schedule(dynamic,4)
  for(int y=0;y<(height+1)/2;y++)for(int x=0;x<(width+1)/2;x++){blockDim={8,8,1};blockIdx={unsigned(x/8),unsigned(y/8),0};threadIdx={unsigned(x%8),unsigned(y%8),0};reflectPixels(world.data(),nodes.data(),plan.data(),c.data(),hit.data(),surface.data(),reflection.data(),width,height,0,(height+1)/2);}
  #pragma omp parallel for schedule(dynamic,4)
  for(int y=0;y<height;y++)for(int x=0;x<width;x++){blockDim={8,8,1};blockIdx={unsigned(x/8),unsigned(y/8),0};threadIdx={unsigned(x%8),unsigned(y%8),0};shadePixels(world.data(),c.data(),hit.data(),surface.data(),room.data(),reflection.data(),linear.data(),width,height,0,height);}
  #pragma omp parallel for schedule(dynamic,4)
  for(int y=0;y<height;y++)for(int x=0;x<width;x++){blockDim={8,8,1};blockIdx={unsigned(x/8),unsigned(y/8),0};threadIdx={unsigned(x%8),unsigned(y%8),0};resolveFrame(linear.data(),history.data(),pixels.data(),c.data(),hit.data(),surface.data(),width,height);}
  std::cout<<"Rendered CPU sample "<<sample+1<<"\n";
 }
 require(std::all_of(linear.begin(),linear.end(),[](float x){return std::isfinite(x);}),"finite primary, reflection and interior lighting");
 std::ofstream out(path,std::ios::binary);out<<"P6\n"<<width<<" "<<height<<"\n255\n";for(auto p:pixels){char bytes[3]={char(p&255u),char((p>>8)&255u),char((p>>16)&255u)};out.write(bytes,3);}std::cout<<"Saved CPU reference "<<path<<"\n";
}
void writeFixtures(){
 std::cout<<"[";bool first=true;
 for(int type: {0,1,3,6,7,8})for(int g: {0,1,6,31,50,58,62,63}){
  float input[17]={float(g),1,15,16,type>=6?95.4f:23.2f,float(type),type==6?22.0f:1.0f,type>=6?24.0f:5.0f,1788,3.8f,type>=6?.22f:1.0f,0,140,40,0,-.94f,-.342f},output[16]={};scalar();probeGrammar(input,output);
  if(!first)std::cout<<",";first=false;std::cout<<"{\"input\":[";for(int j=0;j<17;j++){if(j)std::cout<<",";std::cout<<input[j];}std::cout<<"],\"expected\":[";for(int j=0;j<16;j++){if(j)std::cout<<",";std::cout<<output[j];}std::cout<<"]}";
 }std::cout<<"]";
}
int main(int argc,char**argv){try{
 if(argc<3)throw std::runtime_error("Expected plan and genome float buffers");std::ifstream p(argv[1],std::ios::binary),g(argv[2],std::ios::binary);p.read(reinterpret_cast<char*>(plan.data()),1280);g.read(reinterpret_cast<char*>(genes.data()),48);if(p.gcount()!=1280||g.gcount()!=48)throw std::runtime_error("Wrong input buffer size");
 if(argc>3&&std::string(argv[3])=="fixtures"){writeFixtures();return 0;}
 if(argc>3&&std::string(argv[3])=="render"){renderCity(argv[4],argc>5?std::stoi(argv[5]):640,argc>6?std::stoi(argv[6]):360,argc>7?std::stoi(argv[7]):2,argc>8?std::stoi(argv[8]):1);return 0;}
 testGrammar();testCity();std::cout<<"ALL CITY NATIVE CHECKS PASSED\n";return 0;
}catch(const std::exception&e){std::cerr<<"FAIL "<<e.what()<<"\n";return 1;}}
