import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { VideoJobResponse } from '../types';

export function VideoRenderThumbnails({ client, job }: { client: ApiClient; job: VideoJobResponse }) {
  const [images,setImages]=useState<Array<{id:string;url:string;label:string}>>([]);
  const scenes=job.project?.scenes;
  const signature=scenes?.map(scene=>scene.id).join(',') ?? '';
  useEffect(()=>{
    const controller=new AbortController();const urls:string[]=[];
    setImages([]);
    if(job.status!=='completed' || !scenes) return ()=>controller.abort();
    void Promise.all(scenes.map(async scene=>{
      try {
        const blob=await client.videoThumbnail(job.job_id,scene.id,controller.signal);
        if(controller.signal.aborted)return null;
        const url=URL.createObjectURL(blob);urls.push(url);
        return {id:scene.id,url,label:scene.headline};
      }catch{return null;}
    })).then(result=>{if(!controller.signal.aborted)setImages(result.filter((image):image is NonNullable<typeof image>=>image!==null));});
    return ()=>{controller.abort();urls.forEach(url=>URL.revokeObjectURL(url));};
    // Scene IDs identify the immutable render project; polling object identity is irrelevant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[client,job.job_id,job.status,signature]);
  if(!images.length)return null;
  return <div className="v2-render-thumbnails" aria-label="Rendered scene thumbnails">{images.map(image=><figure key={image.id}><img src={image.url} alt={image.label}/><figcaption>{image.label}</figcaption></figure>)}</div>;
}
