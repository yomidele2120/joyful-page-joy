import{a4 as n}from"./index-Cq5XW427.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const s=n("RotateCcw",[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=n("Share2",[["circle",{cx:"18",cy:"5",r:"3",key:"gq8acd"}],["circle",{cx:"6",cy:"12",r:"3",key:"w7nqdw"}],["circle",{cx:"18",cy:"19",r:"3",key:"1xt0gg"}],["line",{x1:"8.59",x2:"15.42",y1:"13.51",y2:"17.49",key:"47mynk"}],["line",{x1:"15.41",x2:"8.59",y1:"6.51",y2:"10.49",key:"1n3mei"}]]),o=t=>`/feed?post=${encodeURIComponent(t)}`;function i(t,a=window.location.origin){return`${a}${o(t)}`}async function d(t){var a;try{if((a=navigator.clipboard)!=null&&a.writeText)return await navigator.clipboard.writeText(t),!0}catch{}try{const e=document.createElement("textarea");e.value=t,e.setAttribute("readonly",""),e.style.position="fixed",e.style.opacity="0",document.body.appendChild(e),e.select();const c=document.execCommand("copy");return document.body.removeChild(e),c}catch{return!1}}async function u(t){const a=i(t.id),e=(t.caption??"").trim(),c={title:t.vendorName?`${t.vendorName} on IT Hub Africa`:"Watch this on IT Hub Africa",text:e?e.length>100?`${e.slice(0,97)}...`:e:void 0,url:a};if(typeof navigator.share=="function")try{return await navigator.share(c),"shared"}catch(r){if((r==null?void 0:r.name)==="AbortError")return"cancelled"}return await d(a)?"copied":"failed"}export{s as R,l as S,u as s};
