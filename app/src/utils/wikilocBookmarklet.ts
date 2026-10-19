const createWikilocBookmarkletSource = (appOrigin: string) => `(()=>{
  if(!/(^|\\.)wikiloc\\.com$/i.test(location.hostname)){
    alert("Open a Wikiloc trail page before using the TrailReplay bookmark.");return
  }
  const match=location.pathname.match(/-(\\d+)(?:\\/|$)/);
  if(!match){alert("Open a Wikiloc trail page before using the TrailReplay bookmark.");return}
  const id=match[1],appOrigin=${JSON.stringify(appOrigin)};
  const app=window.open(appOrigin+"/?wikilocImport=1","_blank");
  if(!app){alert("Allow pop-ups for Wikiloc, then click the TrailReplay bookmark again.");return}
  let timeout;
  const cleanup=()=>{window.removeEventListener("message",onMessage);clearTimeout(timeout)};
  const fetchGpx=async filter=>{
    const form=new FormData();
    form.append("id",id);form.append("event","download");form.append("format","gpx");form.append("selFormat","gpx");form.append("filter",filter);
    const response=await fetch(location.origin+"/wikiloc/downloadToFile.do",{method:"POST",body:form,credentials:"include"});
    const gpx=await response.text();
    if(response.ok&&/<gpx(?:\\s|>)/i.test(gpx))return {gpx,error:null};
    const title=(gpx.match(/<title[^>]*>([^<]{1,120})</i)||[])[1]?.replace(/\\s+/g," ").trim();
    const path=new URL(response.url).pathname;
    return {gpx:null,error:filter+": HTTP "+response.status+" ("+(title||path)+")"};
  };
  const onMessage=async event=>{
    if(event.origin!==appOrigin||event.source!==app||event.data?.type!=="trailreplay:ready")return;
    cleanup();
    try{
      let result=await fetchGpx("original"),simplified=false;
      if(!result.gpx){
        const originalError=result.error;
        result=await fetchGpx("simplified500");
        simplified=!!result.gpx;
        if(!result.gpx)throw new Error("Wikiloc returned no GPX. "+originalError+"; "+result.error+". Please send these details so I can fix the importer.");
      }
      const gpx=result.gpx;
      app.postMessage({type:"trailreplay:wikiloc-gpx",fileName:"wikiloc-"+id+".gpx",gpx,simplified},appOrigin)
    }catch(error){alert(error instanceof Error?error.message:"Could not import this Wikiloc trail.");app.close()}
  };
  window.addEventListener("message",onMessage);
  timeout=setTimeout(()=>{cleanup();app.close();alert("TrailReplay did not respond. Please try again.")},30000)
})();`;

export const createWikilocBookmarkletHref = (appOrigin: string) =>
  `javascript:${encodeURIComponent(createWikilocBookmarkletSource(appOrigin))}`;
