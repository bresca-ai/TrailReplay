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
  const onMessage=event=>{
    if(event.origin!==appOrigin||event.source!==app||event.data?.type!=="trailreplay:ready")return;
    cleanup();
    try{
      const gpx=makeGpx();
      app.postMessage({type:"trailreplay:wikiloc-gpx",fileName:"wikiloc-"+id+".gpx",gpx},appOrigin)
    }catch(error){alert(error instanceof Error?error.message:"Could not import this Wikiloc trail.");app.close()}
  };
  window.addEventListener("message",onMessage);
  timeout=setTimeout(()=>{cleanup();app.close();alert("TrailReplay did not respond. Please try again.")},30000)
})();`;

export const createWikilocBookmarkletHref = (appOrigin: string) =>
  `javascript:${encodeURIComponent(createWikilocBookmarkletSource(appOrigin))}`;
