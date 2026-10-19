// Opens the capture page and hands over this page's URL + text via postMessage. Sites that send
// Cross-Origin-Opener-Policy: same-origin sever window.opener, so after 5 s without a handshake it
// copies "url\n\ntext" to the clipboard instead (the capture page splits it with splitPasted).
// Avoid "%" and "#" in the source: browsers percent-decode / truncate javascript: URLs.
export function bookmarkletHref(appUrl: string): string {
  const origin = JSON.stringify(new URL(appUrl).origin);
  const src = `(function(){var O=${origin},ok=0,w=open(O+"/app/new?via=bm","jobtracker"),
t=document.body.innerText.slice(0,100000),u=location.href;
addEventListener("message",function(e){if(e.origin==O&&e.data&&e.data.type=="jobtracker-ready"){ok=1;
e.source.postMessage({type:"jobtracker-capture",url:u,text:t},O)}});
function cp(){return navigator.clipboard.writeText(u+"\\n\\n"+t).then(function(){alert("Copied \\u2014 paste into JobTracker")})}
setTimeout(function(){if(!ok)cp().catch(function(){confirm("JobTracker could not connect. Copy this job to the clipboard?")&&cp().catch(function(){alert("Copy failed")})})},5000)})()`;
  return "javascript:" + src.replace(/\n/g, "");
}

// A pasted "url\n\ntext" blob (the bookmarklet's clipboard fallback) → its parts.
export function splitPasted(s: string): { url: string; text: string } {
  const [first = "", ...rest] = s.trim().split("\n");
  return /^https?:\/\/\S+$/.test(first.trim()) ? { url: first.trim(), text: rest.join("\n").trim() } : { url: "", text: s };
}
