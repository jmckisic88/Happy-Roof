const P=window.POSTS;
const clrs={"Myth Busters":"#E6A817","Tampa Homeowner Tips":"#D4920C","Behind the Scenes":"#7c3aed","What We Found":"#dc2626","The Process":"#047857"};
const emo={"Myth Busters":"💥","Tampa Homeowner Tips":"🏠","Behind the Scenes":"👷","What We Found":"🔍","The Process":"🔨"};
const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const cal=document.getElementById("calendar");
const det=document.getElementById("detail");
const leg=document.getElementById("legend");

// Legend
Object.keys(clrs).forEach(k=>{
  const s=document.createElement("span");
  s.className="pill";
  s.style.background=clrs[k];
  s.textContent=emo[k]+" "+k;
  leg.appendChild(s);
});

// Day headers (desktop only)
days.forEach(d=>{
  const el=document.createElement("div");
  el.className="cal-header";
  el.style.cssText="text-align:center;font-weight:800;font-size:13px;color:#8B7355;padding:8px 0;font-family:Barlow Condensed,sans-serif;text-transform:uppercase;letter-spacing:.05em";
  el.textContent=d;
  cal.appendChild(el);
});

// April 2026 starts Wednesday (index 3)
var sd=3;
for(var i=0;i<sd;i++){
  var bl=document.createElement("div");
  bl.className="cal-header";
  cal.appendChild(bl);
}

for(var day=1;day<=30;day++){
  var cell=document.createElement("div");
  var post=P[day];
  var dow=(sd+day-1)%7;
  var isWE=dow===0||dow===6;
  if(post){
    var clr=clrs[post.p]||"#888";
    cell.className="day-cell";
    cell.style.borderColor=clr;
    cell.style.background=clr+"15";
    var trunc=post.h.length>45?post.h.substring(0,45)+"...":post.h;
    cell.innerHTML='<div style="font-weight:800;font-size:18px;color:'+clr+'">'+day+'</div>'+
      '<div style="font-size:12px;font-weight:700;margin-top:4px">'+emo[post.p]+' '+post.p+'</div>'+
      '<div style="font-size:11px;color:#6B5744;margin-top:4px;line-height:1.3">'+trunc+'</div>';
    (function(d,p){cell.onclick=function(){showDetail(d,p)}})(day,post);
  } else if(isWE){
    cell.className="rest-cell";
    cell.innerHTML='<div style="font-weight:800;font-size:18px;color:#8B7355">'+day+'</div><div style="font-size:11px;color:#8B7355;margin-top:4px">Rest day</div>';
  } else {
    cell.className="day-cell";
    cell.style.borderStyle="dashed";
    cell.style.borderColor="#E5D5C0";
    cell.style.cursor="default";
    cell.innerHTML='<div style="font-weight:800;font-size:18px;color:#8B7355">'+day+'</div><div style="font-size:11px;color:#8B7355;margin-top:4px">Open slot</div>';
  }
  cal.appendChild(cell);
}

// Rhythm section
var rhy=document.getElementById("rhythm");
var rdays=[
  {d:"Mon",p:"Myth Busters",bg:"#FEF3C7"},
  {d:"Tue",p:"Tampa Tips",bg:"#FEF0D0"},
  {d:"Wed",p:"Behind Scenes",bg:"#EDE9FE"},
  {d:"Thu",p:"What We Found",bg:"#FEE2E2"},
  {d:"Fri",p:"The Process",bg:"#D1FAE5"}
];
rdays.forEach(function(r){
  var d=document.createElement("div");
  d.style.cssText="background:"+r.bg+";border-radius:10px;padding:12px 8px";
  d.innerHTML='<div style="font-weight:800;font-family:Barlow Condensed,sans-serif;font-size:15px;text-transform:uppercase">'+r.d+'</div><div style="font-size:12px;color:#6B5744;margin-top:2px">'+r.p+'</div>';
  rhy.appendChild(d);
});

function showDetail(day,post){
  var clr=clrs[post.p]||"#888";
  det.style.display="block";
  det.innerHTML='<div class="detail-panel" style="border-color:'+clr+'">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">'+
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
        '<span class="pill" style="background:'+clr+'">'+emo[post.p]+' '+post.p+'</span>'+
        '<span style="color:#8B7355;font-size:14px">April '+day+', 2026</span>'+
      '</div>'+
      '<button onclick="document.getElementById(\'detail\').style.display=\'none\'" style="background:none;border:1px solid #E5D5C0;border-radius:8px;padding:6px 14px;cursor:pointer;font-weight:700;color:#8B7355;font-size:14px">Close</button>'+
    '</div>'+
    '<h2 style="font-family:Barlow Condensed,sans-serif;font-size:26px;font-weight:900;text-transform:uppercase;letter-spacing:-.02em;margin-bottom:16px;color:#2C1810">&ldquo;'+post.h+'&rdquo;</h2>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">'+
      '<div class="section-box"><div style="font-size:11px;font-weight:800;color:#8B7355;text-transform:uppercase;margin-bottom:4px;letter-spacing:.05em">Format</div><div style="font-size:14px;font-weight:700">'+post.f+'</div></div>'+
      '<div class="section-box"><div style="font-size:11px;font-weight:800;color:#8B7355;text-transform:uppercase;margin-bottom:4px;letter-spacing:.05em">Platforms</div><div style="font-size:14px;font-weight:700">'+post.pl+'</div></div>'+
    '</div>'+
    '<div class="section-box" style="margin-bottom:16px"><div style="font-size:11px;font-weight:800;color:#8B7355;text-transform:uppercase;margin-bottom:4px;letter-spacing:.05em">Content Direction</div><p style="font-size:14px;line-height:1.6">'+post.c+'</p></div>'+
    '<div style="background:'+clr+'15;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid '+clr+'30"><div style="font-size:11px;font-weight:800;color:'+clr+';text-transform:uppercase;margin-bottom:4px;letter-spacing:.05em">Call to Action</div><p style="font-size:15px;font-weight:700;color:'+clr+'">&ldquo;'+post.cta+'&rdquo;</p></div>'+
    (post.cap?'<div style="margin-bottom:20px;position:relative;margin-top:28px"><div class="caption-box" id="cap-'+day+'">'+post.cap.replace(/\n/g,'<br>')+'</div><button class="copy-btn" onclick="copyText(\'cap-'+day+'\')">Copy Caption</button></div>':'')+
    (post.scr?'<div style="position:relative;margin-top:28px"><div class="script-box" id="scr-'+day+'">'+post.scr.replace(/\n/g,'<br>')+'</div><button class="copy-btn" onclick="copyText(\'scr-'+day+'\')">Copy Script</button></div>':'')+
  '</div>';
  det.scrollIntoView({behavior:'smooth',block:'start'});
}

function copyText(id){
  var el=document.getElementById(id);
  var text=el.innerText;
  navigator.clipboard.writeText(text).then(function(){
    var btn=el.parentElement.querySelector('.copy-btn');
    btn.textContent='Copied!';
    setTimeout(function(){btn.textContent=btn.textContent.includes('Script')?'Copy Script':'Copy Caption'},1500);
  });
}
