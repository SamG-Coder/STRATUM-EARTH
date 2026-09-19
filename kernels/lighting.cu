// Bounded single-bounce lighting, not a path tracer. Architectural ray hits are exact;
// shadow occlusion uses conservative building masses for the fixed lighting budget.
__device__ bool glassMaterial(int m){return m==4||m==18||m==20;}
__device__ float3 waterNormal(float3 p,float footprint){
 float a=frequencyWeight(footprint,.35f),b=frequencyWeight(footprint,1.3f);
 return norm3(make_float3((cosf(p.x*.21f+p.z*.14f)*.13f+sinf(p.x*.37f-p.z*.23f)*.06f)*a+cosf(p.x*1.3f+p.z*.8f)*.025f*b,1.0f,(sinf(p.z*.27f+p.x*.17f)*.10f+cosf(p.z*.48f-p.x*.11f)*.07f)*a));
}
__device__ float buildingShadow(const float* World,float3 p,float3 light){
 if(light.y<.005f)return .06f;
 float limit=fminf(2000.0f,fmaxf(0.0f,(SCENE_TOP-p.y)/light.y)),t=0;
 float3 ro=p+light*.08f;int cx=(int)floorf((ro.x+24)/CELL),cz=(int)floorf((ro.z+24)/CELL),sx=light.x>0?1:-1,sz=light.z>0?1:-1;
 float tx=((float)cx*CELL+(sx>0?24.0f:-24.0f)-ro.x)*safeInv(light.x),tz=((float)cz*CELL+(sz>0?24.0f:-24.0f)-ro.z)*safeInv(light.z),dx=CELL*fabsf(safeInv(light.x)),dz=CELL*fabsf(safeInv(light.z));
 for(int step=0;step<88;step++){
  if(t>limit)break;
  if(insideCity(cx,cz)){
   Lot l=readLot(World,citySlot(cx,cz));if(l.type<3||(l.type>=6&&l.type<=8)){
    float3 lr=turnLocal(ro-make_float3((float)cx*CELL+l.ox,0,(float)cz*CELL+l.oz),l.turn),ld=turnLocal(light,l.turn);
    // Contract the blocker inside the visible wall to avoid self-shadowing glass panes.
    float f=l.type==7?1.0f-l.roofScale*.6f:(l.type==6?.9f:1.0f);
    float2 span=boxRange(lr,ld,make_float3(-l.w*f+.08f,4.1f,-l.d*f+.08f),make_float3(l.w*f-.08f,l.h-.08f,l.d*f-.08f));
    if(span.y>fmaxf(.06f,span.x)&&span.x<limit)return .055f;
   }
  }
  if(tx<tz){t=tx;tx+=dx;cx+=sx;}else{t=tz;tz+=dz;cz+=sz;}
 }
 return 1.0f;
}
__device__ float ambientVisibility(const float* World,float3 p){
 int cx=(int)floorf((p.x+24)/CELL),cz=(int)floorf((p.z+24)/CELL);float occ=0;
 for(int z=-1;z<=1;z++)for(int x=-1;x<=1;x++){
  if(!insideCity(cx+x,cz+z))continue;Lot l=readLot(World,citySlot(cx+x,cz+z));if(!(l.type<3||(l.type>=6&&l.type<=8)))continue;
  float3 q=turnLocal(p-make_float3((float)(cx+x)*CELL+l.ox,0,(float)(cz+z)*CELL+l.oz),l.turn);
  float xx=fmaxf(0,fabsf(q.x)-l.w),zz=fmaxf(0,fabsf(q.z)-l.d),dist=sqrtf(xx*xx+zz*zz);
  if(dist>.10f)occ+=sat((l.h-p.y)/(dist+l.h+1))*expf(-dist*.09f)*.48f;
 }return clampf(1-occ,.36f,1);
}
__device__ float3 paletteTint(float palette,int mat){
 if(mat!=0&&mat!=1&&mat!=13)return make_float3(1,1,1);int p=(int)palette;
 if(p==0)return make_float3(1.06f,.94f,.85f);if(p==1)return make_float3(.81f,.91f,1.02f);if(p==2)return make_float3(1.10f,.82f,.75f);if(p==3)return make_float3(1.11f,1.09f,1.02f);if(p==4)return make_float3(.76f,.79f,.78f);if(p==5)return make_float3(.96f,.97f,.91f);if(p==6)return make_float3(1.04f,.96f,.99f);return make_float3(1,1,1);
}
__device__ float3 litSurface(const float* World,float3 p,float3 n,float3 rd,float3 sun,int mat,float seed,int slot,float footprint,bool shadows){
 float3 q=p,qn=n;float palette=0;int turn=0;
 if(slot>=0){Lot l=readLot(World,slot);q=turnLocal(p-cityCell(slot)-make_float3(l.ox,0,l.oz),l.turn);qn=turnLocal(n,l.turn);palette=l.palette;turn=l.turn;}
 if(mat==7&&dot3(n,rd)>0){n=n*-1;qn=qn*-1;}
 float fp=footprint/fmaxf(.18f,fabsf(dot3(n,rd)));float2 uv=masonryUV(q,qn);float3 base=substrateMean(mat);
 if(mat==0||mat==1)base=substrate(uv.x,uv.y,seed,mat);
 float3 albedo=surfaceColor(q,qn,mat,seed,fp,base)*paletteTint(palette,mat),original=n;
 if((mat==0||mat==1)&&fabsf(qn.y)<.5f&&fp<.12f){
  float e=fmaxf(.002f,fp*.6f),du=(masonryHeight(uv.x+e,uv.y,mat)-masonryHeight(uv.x-e,uv.y,mat))/(2*e),dv=(masonryHeight(uv.x,uv.y+e,mat)-masonryHeight(uv.x,uv.y-e,mat))/(2*e);
  float3 tangent=fabsf(qn.x)>.5f?make_float3(0,0,1):make_float3(1,0,0);float fade=frequencyWeight(fp,5);
  n=turnWorld(norm3(qn-tangent*(du*fade)-make_float3(0,dv*fade,0)),turn);
 }
 if(mat==9){albedo=make_float3(.018f,.072f,.092f);n=waterNormal(p,footprint);}
 float nl=fmaxf(0,dot3(n,sun)),nv=fmaxf(.03f,-dot3(n,rd)),shadow=shadows?buildingShadow(World,p+original*.035f,sun):1.0f;
 float ao=ambientVisibility(World,p),rough=.74f;if(mat==6||mat==23)rough=.32f;if(glassMaterial(mat))rough=.12f;if(mat==9)rough=.16f;
 float3 halfv=norm3(sun-rd);float nh=fmaxf(0,dot3(n,halfv)),vh=fmaxf(0,-dot3(rd,halfv)),a=rough*rough;
 float denom=nh*nh*(a*a-1)+1,distribution=a*a/(PI*denom*denom+.000001f),k=(rough+1)*(rough+1)/8;
 float geometry=nv/(nv*(1-k)+k)*nl/(nl*(1-k)+k+.00001f),f0=(mat==6||mat==23)? .45f:.04f,fresnel=f0+(1-f0)*powf(1-vh,5);
 float spec=fminf(8.0f,distribution*geometry*fresnel/(4*nv*nl+.0001f));
 float3 ambient=make_float3(.25f,.33f,.43f)*((.35f+.32f*sat(n.y*.5f+.5f))*ao)+make_float3(.20f,.14f,.09f)*((1-sat(n.y))*.25f*ao);
 float3 result=albedo*(make_float3(2.3f,1.92f,1.5f)*(nl*shadow)+ambient)+make_float3(1,.92f,.8f)*(spec*nl*shadow*1.7f);
 if(mat==8)result=result+make_float3(1.4f,.81f,.28f);
 if(mat==7)result=result+albedo*(powf(fmaxf(0,dot3(rd,sun)),4)*.28f);
 return result;
}
// Actual box-room intersection behind a pane, not a flat emissive window pattern.
__device__ float3 roomInterior(float4 pane,float3 normal,float3 rd,float seed,float genomeSeed,float footprint){
 float hw=fmaxf(.2f,pane.z),hy=fmaxf(.25f,pane.w),depth=2.7f+hash1((int)(seed+genomeSeed))*3.5f;
 float3 tangent=norm3(cross3(make_float3(0,1,0),normal));float3 d=make_float3(dot3(rd,tangent),rd.y,fmaxf(.02f,-dot3(rd,normal))),o=make_float3(pane.x,pane.y,0);
 float2 span=boxRange(o,d,make_float3(-hw,-hy,0),make_float3(hw,hy,depth));float3 point=o+d*fmaxf(0,span.y);
 float illuminated=hash1((int)(seed+genomeSeed+91))>.63f?1.0f:.24f;
 float3 col=make_float3(.32f,.28f,.23f);if(point.y<-hy+.04f)col=make_float3(.10f,.075f,.05f);if(point.y>hy-.04f)col=make_float3(.54f,.49f,.38f);
 float pattern=(1-smoothf(.035f,.07f,fabsf(fractf((point.x+hw)*.42f)-.5f)))*frequencyWeight(footprint,.42f);col=col*(1-pattern*.11f);
 // A desk/cabinet and a low sofa are analytic interior solids, with seed-specific placement.
 for(int k=0;k<2;k++){
  float side=hash1((int)seed+k*173)>.5f?1.0f:-1.0f;float3 c=make_float3(side*hw*.42f,-hy+.40f,depth*(k==0?.62f:.85f)),h=make_float3(hw*.31f,.40f,.40f);
  float2 furniture=boxRange(o,d,c-h,c+h);if(furniture.y>=fmaxf(0.001f,furniture.x)&&furniture.x<span.y){col=k==0?make_float3(.09f,.065f,.045f):make_float3(.11f,.15f,.17f);span.y=furniture.x;}
 }
 float light=illuminated*(.19f+.55f*sat(point.y/(hy*2)+.5f));col=col*light;
 float blind=hash1((int)seed+421);if(blind>.65f){float slat=(1-smoothf(.30f,.43f,fractf((pane.y+hy)*5.5f)))*frequencyWeight(footprint,5.5f);col=mix3(col,make_float3(.34f,.31f,.24f)*illuminated,slat*.80f);}
 if(illuminated>.8f&&point.y>hy-.04f&&fabsf(point.x)<hw*.55f)col=col+make_float3(.9f,.67f,.32f)*.5f;
 return col;
}
