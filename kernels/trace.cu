// Every visible lot uses the exact shared assets.cu grammar; bounds only reject missed groups.
__device__ float nodeNear(const float* Nodes,int node,float3 ro,float3 rd,float best){
 int b=node*8;if(Nodes[b+3]<0.5f)return FAR;
 float2 range=boxRange(ro,rd,make_float3(Nodes[b],Nodes[b+1],Nodes[b+2]),make_float3(Nodes[b+4],Nodes[b+5],Nodes[b+6]));
 if(range.y<fmaxf(0.001f,range.x)||range.x>best)return FAR;
 return fmaxf(0.001f,range.x);
}
__device__ Sink queryLot(Lot lot,const float* Nodes,int slot,float3 ro,float3 rd,float best,float cone){
 Sink hit=newSink(0,ro,rd,best);hit.pixelCone=cone;
 int stack[8];int top=0,node=1,steps=0;
 while(node>0&&steps<GROUP_NODES){
  steps++;float near=nodeNear(Nodes,slot*GROUP_NODES+node,ro,rd,hit.t);
  if(near< hit.t&&node<CLUSTERS){
   int left=node*2,right=left+1;
   float ln=nodeNear(Nodes,slot*GROUP_NODES+left,ro,rd,hit.t),rn=nodeNear(Nodes,slot*GROUP_NODES+right,ro,rd,hit.t);
   bool lh=ln<hit.t,rh=rn<hit.t;
   if(lh&&rh){int next=ln<rn?left:right;int other=ln<rn?right:left;stack[top]=other;top++;node=next;}
   else if(lh)node=left;else if(rh)node=right;else{node=0;if(top>0){top--;node=stack[top];}}
  }else{
   if(near<hit.t&&node>=CLUSTERS){
    Sink s=newSink(0,ro,rd,hit.t);s.pixelCone=cone;s=cityGroup(lot,node-CLUSTERS,s);
    if(s.fid>=0&&s.t<hit.t){hit=s;hit.fid=(node-CLUSTERS)*MAX_FEATURES+s.fid;}
   }
   node=0;if(top>0){top--;node=stack[top];}
  }
 }
 return hit;
}
