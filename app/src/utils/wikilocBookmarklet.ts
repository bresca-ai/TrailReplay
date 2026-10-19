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
  const readGpx=async(response,label)=>{
    const gpx=await response.text();
    if(response.ok&&/<gpx(?:\\s|>)/i.test(gpx))return {gpx,error:null};
    const title=(gpx.match(/<title[^>]*>([^<]{1,120})</i)||[])[1]?.replace(/\\s+/g," ").trim();
    const path=new URL(response.url).pathname;
    const bodyText=new DOMParser().parseFromString(gpx,"text/html").body.textContent||"";
    const excerpt=bodyText.replace(/\\s+/g," ").trim().slice(0,140);
    const contentType=response.headers.get("content-type")||"unknown content type";
    return {gpx:null,error:label+": HTTP "+response.status+", "+contentType+", "+gpx.length+" characters ("+(title||path)+")"+(excerpt?" — "+excerpt:"")};
  };
  const fetchOriginalGpx=async()=>{
    const pageResponse=await fetch(location.origin+"/wikiloc/download.do?id="+encodeURIComponent(id)+"&event=file",{credentials:"include"});
    const html=await pageResponse.text();
    const documentFromPage=new DOMParser().parseFromString(html,"text/html");
    const form=Array.from(documentFromPage.forms).find(candidate=>candidate.action.includes("downloadToFile.do"))||documentFromPage.forms[0];
    if(!pageResponse.ok||!form)return {gpx:null,error:"file form: HTTP "+pageResponse.status+" ("+((documentFromPage.title||new URL(pageResponse.url).pathname))+ ")"};
    const originalOption=Array.from(form.querySelectorAll("select option")).find(option=>/original/i.test(option.textContent||""));
    const originalLabel=Array.from(form.querySelectorAll("label")).find(label=>/original/i.test(label.textContent||""));
    const originalControl=originalOption?.parentElement||originalLabel?.control;
    if(!originalControl?.name)return {gpx:null,error:"file form: Original quality option was not found"};
    const data=new FormData(form);
    data.set("id",id);data.set("event","download");data.set("format","gpx");data.set("selFormat","gpx");
    if(originalOption)data.set(originalControl.name,originalOption.value);
    else data.set(originalControl.name,originalControl.value);
    const action=new URL(form.getAttribute("action")||"/wikiloc/downloadToFile.do",pageResponse.url).href;
    const response=await fetch(action,{method:"POST",body:data,credentials:"include",referrer:pageResponse.url});
    return await readGpx(response,"Original form");
  };
  const fetchGpx=async filter=>{
    const form=new FormData();
    form.append("id",id);form.append("event","download");form.append("format","gpx");form.append("selFormat","gpx");form.append("filter",filter);
    const downloadPage=new URL("/wikiloc/download.do?id="+encodeURIComponent(id)+"&event=file",location.origin).href;
    const response=await fetch(location.origin+"/wikiloc/downloadToFile.do",{method:"POST",body:form,credentials:"include",referrer:downloadPage});
    return await readGpx(response,filter);
  };
  const onMessage=async event=>{
    if(event.origin!==appOrigin||event.source!==app||event.data?.type!=="trailreplay:ready")return;
    cleanup();
    try{
      let result=await fetchOriginalGpx(),simplified=false;
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
