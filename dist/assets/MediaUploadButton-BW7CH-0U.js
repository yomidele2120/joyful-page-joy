import{a1 as x,r as n,j as e,B as m}from"./index-D2WrvUMx.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=x("Image",[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2",key:"1m3agn"}],["circle",{cx:"9",cy:"9",r:"2",key:"af1f0g"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",key:"1xmnt7"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=x("Mic",[["path",{d:"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z",key:"131961"}],["path",{d:"M19 10v2a7 7 0 0 1-14 0v-2",key:"1vc78b"}],["line",{x1:"12",x2:"12",y1:"19",y2:"22",key:"x3vr5v"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=x("Square",[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}]]);function b({onRecorded:u,disabled:l}){const[c,t]=n.useState(!1),[i,r]=n.useState(0),f=n.useRef(null),d=n.useRef([]),h=n.useRef(null),p=async()=>{try{const a=await navigator.mediaDevices.getUserMedia({audio:!0}),o=new MediaRecorder(a);f.current=o,d.current=[],o.ondataavailable=s=>{s.data.size>0&&d.current.push(s.data)},o.onstop=()=>{const s=new Blob(d.current,{type:"audio/webm"});u(s),a.getTracks().forEach(y=>y.stop()),r(0)},o.start(),t(!0),r(0),h.current=setInterval(()=>r(s=>s+1),1e3)}catch{}},g=()=>{var a;(a=f.current)==null||a.stop(),t(!1),h.current&&clearInterval(h.current)},v=a=>`${Math.floor(a/60)}:${(a%60).toString().padStart(2,"0")}`;return c?e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("span",{className:"text-xs text-destructive animate-pulse",children:["● ",v(i)]}),e.jsx(m,{type:"button",size:"icon",variant:"destructive",onClick:g,className:"h-8 w-8",children:e.jsx(w,{className:"w-3 h-3 fill-current"})})]}):e.jsx(m,{type:"button",size:"icon",variant:"ghost",onClick:p,disabled:l,className:"h-9 w-9",children:e.jsx(j,{className:"w-4 h-4"})})}function M({onFileSelected:u,disabled:l}){const c=n.useRef(null);return e.jsxs(e.Fragment,{children:[e.jsx(m,{type:"button",size:"icon",variant:"ghost",onClick:()=>{var t;return(t=c.current)==null?void 0:t.click()},disabled:l,className:"h-9 w-9",children:e.jsx(k,{className:"w-4 h-4"})}),e.jsx("input",{ref:c,type:"file",accept:"image/*,video/*",className:"hidden",onChange:t=>{var r;const i=(r=t.target.files)==null?void 0:r[0];i&&(u(i),t.target.value="")}})]})}export{M,b as V};
