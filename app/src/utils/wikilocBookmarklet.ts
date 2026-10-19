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
    if(!response.ok)return null;
    const gpx=await response.text();
    return /<gpx(?:\\s|>)/i.test(gpx)?gpx:null;
  };
  const onMessage=async event=>{
    if(event.origin!==appOrigin||event.source!==app||event.data?.type!=="trailreplay:ready")return;
    cleanup();
    try{
      let gpx=await fetchGpx("original"),simplified=false;
      if(!gpx){gpx=await fetchGpx("simplified500");simplified=!!gpx}
      if(!gpx)throw new Error("Wikiloc responded without a GPX file. Try the importer again, or download the GPX manually with Download → File → GPX.");
      app.postMessage({type:"trailreplay:wikiloc-gpx",fileName:"wikiloc-"+id+".gpx",gpx,simplified},appOrigin)
    }catch(error){alert(error instanceof Error?error.message:"Could not import this Wikiloc trail.");app.close()}
  };
  window.addEventListener("message",onMessage);
  timeout=setTimeout(()=>{cleanup();app.close();alert("TrailReplay did not respond. Please try again.")},30000)
})();`;

export const createWikilocBookmarkletHref = (appOrigin: string) =>
  `javascript:${encodeURIComponent(createWikilocBookmarkletSource(appOrigin))}`;
