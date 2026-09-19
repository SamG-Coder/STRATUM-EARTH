// Even/odd fill of SOURCE polygon edges, binned by latitude on the host.
__global__ void earthLandMask(const float* Edges,const unsigned int* Rows,unsigned int* Land,int width,int height){
 int x=(int)(blockIdx.x*blockDim.x+threadIdx.x),y=(int)(blockIdx.y*blockDim.y+threadIdx.y);if(x>=width||y>=height)return;
 float lon=((float)x+.5f)/(float)width*360-180,lat=90-((float)y+.5f)/(float)height*180;bool inside=false;
 int start=(int)Rows[y*2],count=(int)Rows[y*2+1];
 for(int i=0;i<count;i++){int j=(int)Rows[start+i]*4;float x0=Edges[j],y0=Edges[j+1],x1=Edges[j+2],y1=Edges[j+3];if((y0>lat)!=(y1>lat)){float hit=x0+(lat-y0)*(x1-x0)/(y1-y0);if(lon<hit)inside=!inside;}}
 Land[y*width+x]=inside?1u:0u;
}
