// Finite world ray query: the same detailed grammar for primary and reflected rays.
__device__ CityHit sceneRay(const float* World,const float* Nodes,const float* Plan,float3 ro,float3 rd,float cone,float limit){
 CityHit out;out.t=limit;out.fid=-10000;out.material=10;out.seed=0;out.normal=make_float3(0,1,0);out.slot=-1;out.pane=make_float4(0,0,0,0);
 if(rd.y<-.000001f){float t=-ro.y/rd.y;if(t>.001f&&t<out.t){out.t=t;out.fid=-1;float3 p=ro+rd*t;out.material=cityGround(p.x,p.z,Plan);}}
 float2 scene=boxRange(ro,rd,make_float3(-3096,-.5f,-3096),make_float3(3048,SCENE_TOP,3048));
 float near=fmaxf(.001f,scene.x),far=fminf(out.t,scene.y);
 if(near<=far){
  float t=near+.0002f;float3 start=ro+rd*t;int cx=(int)floorf((start.x+24)/CELL),cz=(int)floorf((start.z+24)/CELL);
  // Bounds use the half-open grid [-64,64); tolerate the tiny entry epsilon at its edge.
  cx=cx<-64?-64:(cx>63?63:cx);cz=cz<-64?-64:(cz>63?63:cz);
  int sx=rd.x>0?1:-1,sz=rd.z>0?1:-1;
  float tx=((float)cx*CELL+(sx>0?24.0f:-24.0f)-ro.x)*safeInv(rd.x),tz=((float)cz*CELL+(sz>0?24.0f:-24.0f)-ro.z)*safeInv(rd.z);
  float dx=CELL*fabsf(safeInv(rd.x)),dz=CELL*fabsf(safeInv(rd.z));
  for(int step=0;step<260;step++){
   if(!insideCity(cx,cz)||t>out.t||t>far)break;
   int slot=citySlot(cx,cz);Lot lot=readLot(World,slot);float3 cp=make_float3((float)cx*CELL+lot.ox,0,(float)cz*CELL+lot.oz);
   float3 lr=turnLocal(ro-cp,lot.turn),ld=turnLocal(rd,lot.turn);
   if(nodeNear(Nodes,slot*GROUP_NODES+1,lr,ld,out.t)<out.t){
    Sink hit=queryLot(lot,Nodes,slot,lr,ld,out.t,cone);
    if(hit.fid>=0&&hit.t<out.t){
     out.t=hit.t;out.fid=hit.fid;out.material=hit.feature.material;out.seed=hit.feature.seed;out.slot=slot;
     float3 point=lr+ld*out.t,ln=featureNormal(hit.feature,point);out.normal=turnWorld(ln,lot.turn);
     out.pane=make_float4(0,0,0,0);
     if((out.material==4||out.material==18||out.material==20)&&fabsf(out.normal.y)<.2f){
      float3 tangent=norm3(cross3(make_float3(0,1,0),ln)),delta=point-hit.feature.p;
      float u=dot3(delta,tangent),hw=fabsf(ln.x)>.5f?hit.feature.h.z:hit.feature.h.x;
      out.pane=make_float4(u,delta.y,hw,hit.feature.h.y);
     }
    }
   }
   if(tx<tz){t=tx;tx+=dx;cx+=sx;}else{t=tz;tz+=dz;cz+=sz;}
  }
 }
 return out;
}
__global__ void tracePrimary(const float* World,const float* Nodes,const float* Plan,const float* C,float* Hit,float* Surface,float* Room,int width,int height,int rowStart,int rowCount){
 int x=(int)(blockIdx.x*blockDim.x+threadIdx.x),y=rowStart+(int)(blockIdx.y*blockDim.y+threadIdx.y);if(x>=width||y>=height||y>=rowStart+rowCount)return;
 int b=(y*width+x)*4;CityHit hit=sceneRay(World,Nodes,Plan,cameraPosition(C),rayDirection(C,x,y,width,height),1.08f/(float)height,FAR);
 Hit[b]=hit.t;Hit[b+1]=(float)hit.fid;Hit[b+2]=(float)hit.material;Hit[b+3]=hit.seed;
 Surface[b]=hit.normal.x;Surface[b+1]=hit.normal.y;Surface[b+2]=hit.normal.z;Surface[b+3]=(float)hit.slot;
 Room[b]=hit.pane.x;Room[b+1]=hit.pane.y;Room[b+2]=hit.pane.z;Room[b+3]=hit.pane.w;
}
