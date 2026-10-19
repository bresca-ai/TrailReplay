const createRouteImportBookmarkletSource = (appOrigin: string) => `(()=>{
  const isStrava=/^(www\\.)?strava\\.com$/i.test(location.hostname);
  const isWikiloc=/(^|\\.)wikiloc\\.com$/i.test(location.hostname);
  if(!isStrava&&!isWikiloc){alert("Open a Strava activity or Wikiloc trail before using Send to TrailReplay.");return}
  const match=isStrava?location.pathname.match(/^\\/activities\\/(\\d+)/):location.pathname.match(/-(\\d+)(?:\\/|$)/);
  if(!match){alert(isStrava?"Open a Strava activity before using Send to TrailReplay.":"Open a Wikiloc trail before using Send to TrailReplay.");return}
  const id=match[1],appOrigin=${JSON.stringify(appOrigin)};
  const app=window.open(appOrigin+(isStrava?"/?stravaImport=1":"/?wikilocImport=1"),"_blank");
  if(!app){alert("Allow pop-ups for this site, then click Send to TrailReplay again.");return}
  let timeout;
  const cleanup=()=>{window.removeEventListener("message",onMessage);clearTimeout(timeout)};
  const escapeXml=value=>String(value).replace(/[&<>"']/g,char=>char==="&"?"&amp;":char==="<"?"&lt;":char===">"?"&gt;":char==='"'?"&quot;":"&apos;");
  const makeGpx=()=>{
    const trail=window.mapData?.mapData?.find(item=>String(item.spaId)===id&&!item.waypoint);
    if(!trail?.geom||!window.twkb?.toGeoJSON){
      throw new Error("Wikiloc's route map is not ready. Wait for the map to load and try again, or use Manual to download the GPX.")
    }
    const bytes=Uint8Array.from(atob(trail.geom),char=>char.charCodeAt(0));
    const geometry=window.twkb.toGeoJSON(bytes).features[0]?.geometry;
    const points=geometry?.type==="LineString"?geometry.coordinates:geometry?.type==="MultiLineString"?geometry.coordinates.flat():null;
    if(!points||points.length<2)throw new Error("Wikiloc's route map has no usable track. Use Manual to download the GPX.");
    const start=Number(trail.trackStartTimestamp),firstMeasure=Number(points[0][3]);
    const timeShift=Number.isFinite(start)&&start>0&&Number.isFinite(firstMeasure)?start-firstMeasure:null;
    const track=points.map(point=>{
      const lon=Number(point[0]),lat=Number(point[1]);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){
        throw new Error("Wikiloc's route map contains invalid coordinates. Use Manual to download the GPX.")
      }
      let xml='<trkpt lat="'+lat+'" lon="'+lon+'">';
      if(point.length>2&&Number.isFinite(Number(point[2])))xml+='<ele>'+Number(point[2])+'</ele>';
      if(timeShift!==null&&point.length>3&&Number.isFinite(Number(point[3]))){
        const date=new Date(Number(point[3])+timeShift);
        if(!Number.isNaN(date.getTime()))xml+='<time>'+date.toISOString()+'</time>';
      }
      return xml+'</trkpt>'
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="TrailReplay" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>'+escapeXml(trail.nom||'Wikiloc trail')+'</name><trkseg>'+track+'</trkseg></trk></gpx>'
  };
  const fetchStravaGpx=async()=>{
    const response=await fetch(location.origin+"/activities/"+id+"/export_gpx",{credentials:"include"});
    if(!response.ok)throw new Error("Strava could not export this activity ("+response.status+").");
    const gpx=await response.text();
    if(!/<gpx(?:\\s|>)/i.test(gpx))throw new Error("Strava did not return a GPX file. Check that you can export this activity.");
    return gpx
  };
  const onMessage=async event=>{
    if(event.origin!==appOrigin||event.source!==app||event.data?.type!=="trailreplay:ready")return;
    cleanup();
    try{
      const gpx=isStrava?await fetchStravaGpx():makeGpx();
      const provider=isStrava?"strava":"wikiloc";
      app.postMessage({type:"trailreplay:"+provider+"-gpx",fileName:provider+"-"+id+".gpx",gpx},appOrigin)
    }catch(error){alert(error instanceof Error?error.message:"Could not import this route.");app.close()}
  };
  window.addEventListener("message",onMessage);
  timeout=setTimeout(()=>{cleanup();app.close();alert("TrailReplay did not respond. Please try again.")},30000)
})();`;

export const createRouteImportBookmarkletHref = (appOrigin: string) =>
  `javascript:${encodeURIComponent(createRouteImportBookmarkletSource(appOrigin))}`;
