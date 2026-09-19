#include "../tests/cuda_compat.hpp"
#include <array>
#include <iomanip>
#include <random>
#include <cstdlib>
#include "../kernels/common.cu"
#include "../kernels/plan.cu"
#include "../kernels/farm.cu"
struct Candidate{std::array<float,12> g;float train=0,audit=0;};
const std::array<float,12> lo={1,18,45,45,.15f,.42f,.15f,.08f,0,1,1,1}, hi={16777215,52,180,190,.85f,.90f,.85f,.32f,7,16777215,16777215,1};
Genome unpack(const Candidate&c){return readGenome(c.g.data());}
void genes(const Candidate&c){std::cout<<"[";for(int j=0;j<12;j++){if(j)std::cout<<",";std::cout<<c.g[j];}std::cout<<"]";}
void vector4(float4 v){std::cout<<"["<<v.x<<","<<v.y<<","<<v.z<<","<<v.w<<"]";}
void metrics(const FarmMetrics&m){std::cout<<"{\"loss\":"<<m.loss<<",\"means\":";vector4(m.mean);std::cout<<",\"tallFractions\":";vector4(m.tall);std::cout<<",\"glassFractions\":";vector4(m.glass);std::cout<<",\"coverage\":"<<m.coverage<<",\"heightCV\":"<<m.variation<<",\"buildingSamples\":"<<m.count<<"}";}
int main(int argc,char**argv){try{
 if(argc<2)throw std::runtime_error("usage: seed-farm plan.f32 [candidates] [searchSeed]");
 std::array<float,320> plan{};std::ifstream in(argv[1],std::ios::binary);in.read(reinterpret_cast<char*>(plan.data()),plan.size()*4);if(in.gcount()!=1280)throw std::runtime_error("Invalid plan buffer");
 int budget=argc>2?std::stoi(argv[2]):8192;unsigned seed=argc>3?unsigned(std::stoul(argv[3])):20260919u;if(budget<64||budget>1000000)throw std::runtime_error("Candidate budget must be 64..1000000");
 std::mt19937 rng(seed);auto randf=[&](){return float(rng()>>8)*(1.f/16777216.f);};
 auto bound=[&](Candidate&c){for(int j=0;j<12;j++){c.g[j]=std::max(lo[j],std::min(hi[j],c.g[j]));if(j==0||j==8||j==9||j==10||j==11)c.g[j]=std::floor(c.g[j]+.5f);}};
 Candidate base;base.g={1788,30,125,140,.48f,.76f,.42f,.18f,3,317,619,1};base.train=measureGenome(unpack(base),plan.data(),1).loss;
 std::vector<Candidate> elite={base};std::vector<float> history;int evaluations=0;const int population=128;
 while(evaluations<budget){std::vector<Candidate> round=elite;
  for(int k=0;k<population&&evaluations<budget;k++){
   Candidate c;float phase=float(evaluations)/budget;
   if(evaluations<population||k%8==0){for(int j=0;j<12;j++)c.g[j]=lo[j]+randf()*(hi[j]-lo[j]);}
   else{c=elite[rng()%elite.size()];auto partner=elite[rng()%elite.size()];for(int j=1;j<8;j++){if(randf()<.22f)c.g[j]=partner.g[j];if(randf()<.62f)c.g[j]+=(randf()+randf()+randf()-1.5f)*(hi[j]-lo[j])*(.20f-.15f*phase);}if(randf()<.22f)c.g[0]=lo[0]+randf()*(hi[0]-lo[0]);}
   bound(c);c.train=measureGenome(unpack(c),plan.data(),1).loss;round.push_back(c);evaluations++;
  }
  std::stable_sort(round.begin(),round.end(),[](auto&a,auto&b){return a.train<b.train;});elite.clear();
  // Retain different genotype families, not 16 duplicate copies of the current champion.
  for(auto&c:round){bool duplicate=false;for(auto&e:elite)if(e.g==c.g)duplicate=true;if(!duplicate)elite.push_back(c);if(elite.size()==16)break;}
  history.push_back(elite[0].train);
 }
 // Fresh, different descriptor sample set selects among the finalists, not from all history.
 for(auto&e:elite)e.audit=measureGenome(unpack(e),plan.data(),917).loss;
 std::stable_sort(elite.begin(),elite.end(),[](auto&a,auto&b){return a.audit<b.audit;});auto best=elite[0];
 std::cout<<std::setprecision(9)<<"{\"evaluated\":"<<evaluations<<",\"searchSeed\":"<<seed<<",\"baseline\":";metrics(measureGenome(unpack(base),plan.data(),1));
 std::cout<<",\"train\":";metrics(measureGenome(unpack(best),plan.data(),1));std::cout<<",\"audit\":";metrics(measureGenome(unpack(best),plan.data(),917));
 std::cout<<",\"genes\":";genes(best);std::cout<<",\"bestTrainingHistory\":[";for(size_t i=0;i<history.size();i++){if(i)std::cout<<",";std::cout<<history[i];}
 std::cout<<"],\"finalists\":[";for(size_t i=0;i<std::min(size_t(8),elite.size());i++){if(i)std::cout<<",";std::cout<<"{\"train\":"<<elite[i].train<<",\"audit\":"<<elite[i].audit<<",\"genes\":";genes(elite[i]);std::cout<<"}";}std::cout<<"]}\n";return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<"\n";return 1;}}
