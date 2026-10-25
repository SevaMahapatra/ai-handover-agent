// GET /api/flow: live workflow monitor for the demo. Each step lights up when it really fires (polls /api/flow-data).
// "Step" mode: click Next (or press →) to walk the judges through the workflow, with the line to say and a proof link.
const LINKS = {
  board: "https://linear.app/sevamahapatra/team/ZAP",
  handover: "https://sevas-team.slack.com/archives/C0CBQQYD3PD",
  drops: "https://sevas-team.slack.com/archives/C0CBQQXRM99",
  gmail: "https://mail.google.com/mail/u/0/#inbox",
};
const STEPS = [
  { id: "input", icon: "📥", title: "New info lands", sub: "Granola call notes · email · Slack #drops · Sam's replies", say: "A call ends or a message comes in. It lands as a source the AI can cite.", link: LINKS.drops },
  { id: "dispatch", icon: "🧠", title: "Dispatcher", sub: "Claude reads every source: what's owed, to whom, by when", say: "One dispatcher reads the whole week, 70+ sources, and works out every obligation, the right owner and the due date. Dates and $ are checked in code.", link: LINKS.board },
  { id: "linear", icon: "📋", title: "Linear: shared record", sub: "one task per obligation · owner · due · why · next", say: "Every obligation is a Linear task with the right teammate on it. Unowned work gets an owner, duplicates get closed.", link: LINKS.board },
  { id: "shift", icon: "🌗", title: "Shift change", sub: "08:00–20:00 local · done / next / why on every task", say: "At 8pm Austin, Sam's and Dana's AIs sign off and leave a done / next / why note on every open task. Singapore picks up at 8am their time.", link: LINKS.board },
  { id: "ai", icon: "🤖", title: "Each person's AI", sub: "does its part on shift · drafts · proposals from the calendar", say: "Each teammate's AI finishes what it can on its own: checks, docs, drafts, proposed times from the real calendar. It never asks the room.", link: LINKS.handover },
  { id: "decide", icon: "🗂️", title: "Sam's decisions", sub: "one queue · one tap each", say: "Only humans decide prices, payments, approvals. Each decision arrives ready: one tap.", link: LINKS.handover },
  { id: "cards", icon: "🪪", title: "Live handover cards", sub: "one card per person per shift · edits itself", say: "One card per person per shift, editing itself as work closes. Restart the AI and it carries on: nothing lost, nothing duplicated.", link: LINKS.handover },
  { id: "gmail", icon: "✉️", title: "Things go out", sub: "email + calendar invite · only after ✅", say: "Emails and invites go out only after a ✅, and every one says it's from an AI. Placeholders block sending.", link: LINKS.gmail },
];

// Demo cues: every scenario from the brief (page 2) and the efficiency PDF, with what to do, what to open, what they'll
// see, and the line to say. `show` is resolved to a live link; `auto` ticks the cue when it's detected happening.
const CUES = [
  { src: "Brief · 8:30 chain", title: "The call that ends at night (Northwind)", do: "Open the task: price → Sam, layout → Wei Lin (done), Tom call → Dana, VP one-pager → Priya. Point at Due, Why, Based on.", show: "issue:[ZAP-102]", see: "Owner, due date, the done/next/why note, readable sources", say: "6pm Austin, Maria wants a layout and a price. Austin logs off. Every piece already has the right owner, and nothing is made up." },
  { src: "Brief · 8:30 chain", title: "The shift changes", do: "Open Sam's card (🌙 handed over) and its thread, then Wei Lin's card (🟢).", show: "card:sam", see: "🌙 'Sam signed off', then Wei Lin's card with 🤖 / ⚠️ badges per task", say: "At 8pm Sam's AI signed off with done/next/why on every task. Singapore picked up without asking anyone." },
  { src: "Live", title: "New info arrives mid-demo", do: "From your phone, paste the hosts' drop into #drops.", show: "url:drops", see: "👀 on your message, then '📥 Read it. N updates' with Linear links; 📥🧠📋 light up here", say: "A fact changed. The right person's task updated, and it says why.", auto: "drop" },
  { src: "Brief + Doc #9", title: "The money that sits ($640 reimbursement)", do: "Tap ✅ on 'Approve and reimburse Wei Lin' in Sam's decisions.", show: "queue:reimburse", see: "'✅ Approved', the Linear task closes, Sam's card shows 🔒 Closed", say: "It checked $640 in both sources, says there are no receipts, and one tap queues the payment in test mode.", auto: "reimburse" },
  { src: "Brief · 8:30 chain", title: "Things go out (email + invite)", do: "Tap ✅ on Dana's draft to Rachel (Cedar engineer call), then open Gmail.", show: "draft:cedar-engineer-call", see: "'📤 Sent · open in Gmail', an email from Dana's AI with a calendar invite", say: "Nothing goes out without a ✅. Every email says it's from an AI, and the meeting times come from the calendar.", auto: "sent" },
  { src: "Brief + Doc #2", title: "The double-booked afternoon", do: "Open the clash task, then the 3-slot draft in Sam's decisions thread.", show: "issue:[ZAP-121]", see: "'Clash detected from the calendar' and three PROPOSED slots for Farah", say: "It spotted the clash itself and offers three slots computed from the calendar. Sam's tap approves them." },
  { src: "Brief", title: "The promise nobody else saw", do: "Open Priya's draft sending Wei Lin the Crestline one-pager.", show: "draft:scn-double-booked-onepager", see: "An internal email to Wei Lin: 'you weren't cc'd'", say: "The one-pager was promised with only Sam cc'd. The engineer now has it before the call." },
  { src: "Brief + Doc #3", title: "The proposal stuck on a price", do: "Open the consolidated Northwind draft and point at [PRICE: Sam to decide]. Optional: tap ✅ to show it refuses.", show: "draft:northwind-proposal", see: "'✋ Not sent yet. Fill in [PRICE…] first.'", say: "No pricing rules in the pack, so it won't invent one. The supplier quote is our cost. It waits for Sam's number." },
  { src: "Brief + Doc #12", title: "The person on leave (deploy alerts)", do: "Open the deploy-alerts task and its runbook comment.", show: "issue:[ZAP-161]", see: "'How deploy alerts work': facts with sources, a 'What's NOT known' section, questions for Wei Lin", say: "Alex is on leave. It wrote down what the alert emails and chat show, and says what it doesn't know." },
  { src: "Brief", title: "The helper that forgets (restart)", do: "Ctrl+C the supervisor in the terminal, then run node scripts/supervise.js again.", show: "card:weilin", see: "It reconnects, the cards keep updating, 0 duplicate posts", say: "Restart it: it carries on from Linear, Slack and its saved state. Nothing is drafted twice." },
  { src: "Doc #1", title: "Factory install (Harbor Point)", do: "Open the IP task: 'IP plan checked: 6 cameras ↔ 6 addresses'. Then the Raj date draft.", show: "issue:[ZAP-111]", see: "The IP check done in code, the camera-3 fix, PROPOSED 13:30–16:00", say: "It checked the customer's IT details against our device list, and proposed a start that fits the forklifts." },
  { src: "Doc #5", title: "Hiring (Jordan's onboarding)", do: "Open the onboarding task and its 6 sub-issues.", show: "issue:[ZAP-130]", see: "Owned checklist items due Mon 26 Oct, plus the welcome draft waiting on the location", say: "Jordan starts Monday with nothing. The checklist became owned tasks; the email waits on one fact only Sam has." },
  { src: "Doc #10", title: "Case studies (Bayview)", do: "Open the case-study task: an honest draft plus LinkedIn copy marked WAITING.", show: "issue:[ZAP-170]", see: "'DRAFT, not public until Bayview approves', with cam 5 still bad included", say: "Drafted honestly, sent for the customer's approval, and the post is held until they say yes." },
  { src: "Doc #4 #6 #7 #8 #11", title: "Not in tonight's data (say it, don't fake it)", do: "Say one line, no clicks.", show: "", see: "", say: "Shipyard pilot, call engine, advisor deal, grant pilot, event night: not in the work pack, so we didn't fake them." },
];

export default function handler(req, res) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Handover workflow · live</title>
<style>
:root{--bg:#0b0d12;--panel:#141821;--line:#262c3a;--text:#e7eaf0;--muted:#8a93a6;--glow:#5b8cff;--ok:#3ecf8e;--warn:#f5a524}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.4 system-ui,-apple-system,Segoe UI,sans-serif}
header{display:flex;align-items:center;gap:16px;padding:18px 28px;border-bottom:1px solid var(--line)}
h1{font-size:22px;margin:0;font-weight:650}h1 small{color:var(--muted);font-weight:400;margin-left:8px}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}.pill{background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:14px;white-space:nowrap}
.mode{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}.mode button{background:none;border:0;color:var(--muted);padding:8px 14px;font:inherit;cursor:pointer}.mode button.on{background:var(--glow);color:#fff}
main{padding:24px 28px}
.flow{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.node{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;min-height:150px;transition:all .4s}
.node .n{position:absolute;top:12px;right:14px;color:var(--muted);font-size:13px}
.node .ic{font-size:30px}.node h3{margin:6px 0 2px;font-size:18px}.node p{margin:0;color:var(--muted);font-size:14px}
.node .last{margin-top:10px;font-size:13px;color:var(--text);opacity:.85;min-height:2.6em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.node .ago{font-size:12px;color:var(--muted);margin-top:4px}
.node.hot{border-color:var(--glow);box-shadow:0 0 0 2px var(--glow),0 0 32px rgba(91,140,255,.45);transform:translateY(-3px)}
.node.focus{border-color:var(--ok);box-shadow:0 0 0 3px var(--ok),0 0 40px rgba(62,207,142,.45);transform:scale(1.03)}
.node.dim{opacity:.35}
.arrow{position:absolute;right:-16px;top:50%;color:var(--muted);font-size:18px}
.bottom{display:grid;grid-template-columns:2fr 1fr;gap:18px;margin-top:22px}
.box{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 18px}
.box h4{margin:0 0 10px;font-size:14px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.feed div{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14px}.feed div:last-child{border:0}
.feed .t{color:var(--muted);width:64px;flex:none}.feed .s{width:24px;flex:none}.feed a{color:var(--glow);text-decoration:none}
.stat{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:15px}.stat:last-child{border:0}.stat b{font-size:18px}
#stage{display:none;margin-top:22px;background:linear-gradient(135deg,#16203a,#141821);border:1px solid var(--glow);border-radius:16px;padding:22px 24px}
#stage .k{color:var(--muted);font-size:14px}#stage .say{font-size:24px;margin:8px 0 16px;line-height:1.35}
#stage .row{display:flex;gap:10px;align-items:center}#stage button,#stage a.btn{background:var(--glow);color:#fff;border:0;border-radius:10px;padding:10px 18px;font:inherit;cursor:pointer;text-decoration:none}
#stage button.ghost{background:none;border:1px solid var(--line);color:var(--text)}
.cues{margin-top:22px}.cues h4 span{float:right;color:var(--text);text-transform:none;letter-spacing:0}
.cue{display:grid;grid-template-columns:34px 1fr auto;gap:12px;align-items:start;padding:10px 0;border-bottom:1px solid var(--line)}.cue:last-child{border:0}
.cue .tick{width:26px;height:26px;border-radius:50%;border:2px solid var(--line);background:none;color:#fff;cursor:pointer;font-size:14px}
.cue.done .tick{background:var(--ok);border-color:var(--ok)}.cue.done .t{opacity:.55}
.cue .tag{font-size:12px;color:var(--warn);margin-right:6px}.cue .t b{font-size:16px}.cue .d{font-size:14px;margin-top:2px}.cue .d em{color:var(--muted);font-style:normal}
.cue a{color:#fff;background:var(--line);border-radius:8px;padding:6px 12px;text-decoration:none;font-size:13px;white-space:nowrap}
@media(max-width:900px){.flow{grid-template-columns:repeat(2,1fr)}.bottom{grid-template-columns:1fr}.arrow{display:none}}
</style></head><body>
<header><h1>The 24/7 Handover <small>live workflow</small></h1>
<div class="pills" id="pills"></div>
<div class="mode"><button id="mLive" class="on">Live</button><button id="mStep">Step</button></div></header>
<main>
<div class="flow" id="flow"></div>
<div id="stage"><div class="k" id="sk"></div><div class="say" id="ss"></div>
<div class="row"><button class="ghost" id="prev">◀ Back</button><button id="next">Next ▶</button><a class="btn" id="proof" target="_blank" rel="noopener">Open proof ↗</a></div></div>
<div class="bottom"><div class="box"><h4>What just happened</h4><div class="feed" id="feed"></div></div>
<div class="box"><h4>Right now</h4><div id="stats"></div></div></div>
<div class="box cues"><h4>Scenario checklist <span id="cueCount"></span></h4><div id="cues"></div></div>
</main>
<script>
const STEPS=${JSON.stringify(STEPS)};
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const ago=ts=>{const s=Math.round((Date.now()-new Date(ts))/1000);return s<60?s+"s ago":s<3600?Math.round(s/60)+"m ago":Math.round(s/3600)+"h ago"};
const hm=ts=>new Date(ts).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
const names={sam:"Sam",weilin:"Wei Lin",dana:"Dana",priya:"Priya"};
let mode="live",step=0,data={events:[],shifts:{},counts:{}};
document.getElementById("flow").innerHTML=STEPS.map((s,i)=>'<div class="node" id="n-'+s.id+'"><span class="n">'+(i+1)+'</span><div class="ic">'+s.icon+'</div><h3>'+s.title+'</h3><p>'+s.sub+'</p><div class="last"></div><div class="ago"></div>'+(i%4<3?'<span class="arrow">→</span>':'')+'</div>').join("");
function render(){
  const last={};for(const e of data.events)if(!last[e.step])last[e.step]=e;
  for(const s of STEPS){const el=document.getElementById("n-"+s.id),e=last[s.id];
    el.querySelector(".last").textContent=e?e.text:"waiting…";el.querySelector(".ago").textContent=e?ago(e.ts):"";
    const hot=e&&Date.now()-new Date(e.ts)<90000;
    el.classList.toggle("hot",mode==="live"&&hot);el.classList.toggle("focus",mode==="step"&&STEPS[step].id===s.id);el.classList.toggle("dim",mode==="step"&&STEPS[step].id!==s.id);}
  const sh=data.shifts||{};document.getElementById("pills").innerHTML=Object.keys(names).filter(k=>sh[k]).map(k=>'<span class="pill">'+(sh[k].onShift?"🟢 ":"🌙 ")+names[k]+'</span>').join("");
  const icon=Object.fromEntries(STEPS.map(s=>[s.id,s.icon]));
  document.getElementById("feed").innerHTML=data.events.slice(0,12).map(e=>'<div><span class="t">'+hm(e.ts)+'</span><span class="s">'+icon[e.step]+'</span><span>'+esc(e.text).slice(0,140)+(e.link?' <a href="'+esc(e.link)+'" target="_blank" rel="noopener">open ↗</a>':'')+'</span></div>').join("")||"<div>waiting for the first event…</div>";
  const c=data.counts||{};document.getElementById("stats").innerHTML=[["Sources read",c.sources],["Obligations tracked",c.obligations],["Sam's decisions waiting",c.decisionsPending],["Decisions made",c.decisionsDone],["Drafts waiting for ✅",c.draftsWaiting],["Emails sent",c.draftsSent]].map(([k,v])=>'<div class="stat"><span>'+k+'</span><b>'+(v??"–")+'</b></div>').join("");
  const st=document.getElementById("stage");st.style.display=mode==="step"?"block":"none";
  if(mode==="step"){const s=STEPS[step];document.getElementById("sk").textContent="Step "+(step+1)+" of "+STEPS.length+" · "+s.title;document.getElementById("ss").textContent=s.say;document.getElementById("proof").href=s.link;document.getElementById("next").textContent=step===STEPS.length-1?"Done ✓":"Next ▶";}
}
const CUES=${JSON.stringify(CUES)}, LINKS=${JSON.stringify(LINKS)};
let ticked={};try{ticked=JSON.parse(localStorage.getItem("cues")||"{}")}catch{}
const saveTicks=()=>{try{localStorage.setItem("cues",JSON.stringify(ticked))}catch{}};
function linkFor(show){
  const [t,k]=[show.split(":")[0],show.slice(show.indexOf(":")+1)];
  if(t==="url")return LINKS[k];
  if(t==="issue"){const hit=Object.keys(data.issues||{}).find(x=>x.startsWith(k));return hit?data.issues[hit]:LINKS.board;}
  if(t==="card")return (data.cards||[]).find(c=>c.person===k)?.link||LINKS.handover;
  if(t==="queue")return (data.queueItems||[]).find(q=>new RegExp(k,"i").test(q.title))?.link||LINKS.handover;
  if(t==="draft")return (data.drafts||[]).find(d=>d.id.includes(k))?.link||LINKS.handover;
  return "";
}
function autoDone(a){
  if(a==="drop")return (data.dropsToday||0)>0;
  if(a==="reimburse")return (data.queueItems||[]).some(q=>/reimburse/i.test(q.title)&&q.status==="approved");
  if(a==="sent")return (data.drafts||[]).some(d=>d.status==="sent");
  return false;
}
function renderCues(){
  let n=0;
  document.getElementById("cues").innerHTML=CUES.map((c,i)=>{const done=ticked[i]||(c.auto&&autoDone(c.auto));if(done)n++;const l=c.show&&linkFor(c.show);
    return '<div class="cue'+(done?' done':'')+'"><button class="tick" data-i="'+i+'">'+(done?'✓':'')+'</button><div class="t"><span class="tag">'+esc(c.src)+'</span><b>'+esc(c.title)+'</b>'+
    '<div class="d"><em>Do:</em> '+esc(c.do)+'</div>'+(c.see?'<div class="d"><em>They see:</em> '+esc(c.see)+'</div>':'')+'<div class="d"><em>Say:</em> “'+esc(c.say)+'”</div></div>'+
    (l?'<a href="'+esc(l)+'" target="_blank" rel="noopener">Open ↗</a>':'<span></span>')+'</div>';}).join("");
  document.getElementById("cueCount").textContent=n+" / "+CUES.length+" shown";
  for(const b of document.querySelectorAll(".cue .tick"))b.onclick=()=>{const i=b.dataset.i;ticked[i]=!ticked[i];saveTicks();renderCues();};
}
async function poll(){try{data=await (await fetch("/api/flow-data",{cache:"no-store"})).json();render();renderCues();}catch{}}
const setMode=m=>{mode=m;document.getElementById("mLive").classList.toggle("on",m==="live");document.getElementById("mStep").classList.toggle("on",m==="step");render();};
document.getElementById("mLive").onclick=()=>setMode("live");document.getElementById("mStep").onclick=()=>setMode("step");
document.getElementById("next").onclick=()=>{if(step<STEPS.length-1)step++;else setMode("live");render();};
document.getElementById("prev").onclick=()=>{if(step>0)step--;render();};
document.addEventListener("keydown",e=>{if(mode!=="step")return;if(e.key==="ArrowRight"||e.key===" "){e.preventDefault();document.getElementById("next").click();}if(e.key==="ArrowLeft")document.getElementById("prev").click();});
poll();setInterval(poll,2000);
</script></body></html>`);
}
