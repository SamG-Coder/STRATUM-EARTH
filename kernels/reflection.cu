// Half-resolution, one-bounce exact city reflections. Same sceneRay, same detailed buildings.
// No recursive paths, no screen-space-only city impostors. Presentation validates depth/normal.
__global__ void reflectPixels(const float* World,const float* Nodes,const float* Plan,const float* C,const float* Hit,const float* Surface,float* Reflection,int width,int height,int rowStart,int rowCount){
 int rx=(int)(blockIdx.x*blockDim.x+threadIdx.x),ry=rowStart+(int)(blockIdx.y*blockDim.y+threadIdx.y),rw=(width+1)/2,rh=(height+1)/2;
 if(rx>=rw||ry>=rh||ry>=rowStart+rowCount)return;int rb=(ry*rw+rx)*4,x=rx*2,y=ry*2,b=(y*width+x)*4;
 Reflection[rb]=0;Reflection[rb+1]=0;Reflection[rb+2]=0;Reflection[rb+3]=-1;
 int mat=(int)Hit[b+2];if(C[25]<.5f||(!glassMaterial(mat)&&mat!=9)||(int)Hit[b+1]==-10000)return;
 float3 rd=rayDirection(C,x,y,width,height),p=cameraPosition(C)+rd*Hit[b],normal=make_float3(Surface[b],Surface[b+1],Surface[b+2]);
 float fp=fmaxf(.00005f,Hit[b]*1.08f/(float)height);if(mat==9)normal=waterNormal(p,fp);
 float3 rr=norm3(rd-normal*(2*dot3(rd,normal))),sun=sunDirection(C),color=sky(rr,sun);
 CityHit hit=sceneRay(World,Nodes,Plan,p+normal*.04f,rr,2.16f/(float)height,1600.0f);
 if(hit.fid!=-10000){float3 q=p+normal*.04f+rr*hit.t;color=litSurface(World,q,hit.normal,rr,sun,hit.material,hit.seed,hit.slot,fp+hit.t*2.16f/(float)height,false);if(glassMaterial(hit.material))color=mix3(color,sky(rr-hit.normal*(2*dot3(rr,hit.normal)),sun),.45f);}
 Reflection[rb]=color.x;Reflection[rb+1]=color.y;Reflection[rb+2]=color.z;Reflection[rb+3]=Hit[b];
}
