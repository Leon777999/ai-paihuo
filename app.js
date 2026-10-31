const $=s=>document.querySelector(s),K='paihuo_tasks';
let tasks=JSON.parse(localStorage.getItem(K)||'[]');const save=()=>localStorage.setItem(K,JSON.stringify(tasks));
const pad=n=>String(n).padStart(2,'0'),toLocal=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const WD='日一二三四五六';
function fmt(ts){const d=new Date(ts),n=new Date();const day=Math.round((new Date(d).setHours(0,0,0,0)-new Date(n).setHours(0,0,0,0))/864e5);
 const lab=day==0?'今天':day==1?'明天':day==-1?'昨天':day==2?'后天':`${d.getMonth()+1}月${d.getDate()}日(周${WD[d.getDay()]})`;return `${lab} ${pad(d.getHours())}:${pad(d.getMinutes())}`}
function toast(t){const e=$('#toast');e.textContent=t;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',3500)}
const CN={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
function cnum(s){if(/^\d+$/.test(s))return+s;if(s.length==1)return CN[s];if(s[0]=='十')return 10+(CN[s[1]]||0);if(s[1]=='十')return CN[s[0]]*10+(CN[s[2]]||0);return NaN}
function parse(text){let s=text.replace(/[，。,.！!？?]/g,' ').trim(),now=new Date(),d=null,who='';
 // deadline day
 let m;
 if(/今天|今晚|今日/.test(s))d=new Date(now);else if(/明天|明早|明晚/.test(s)){d=new Date(now);d.setDate(d.getDate()+1)}
 else if(/后天/.test(s)){d=new Date(now);d.setDate(d.getDate()+2)}
 else if(m=s.match(/(下)?(?:周|星期|礼拜)([一二三四五六日天1-7])/)){let w='日一二三四五六'.indexOf(m[2]);if(m[2]=='天')w=0;if(/\d/.test(m[2]))w=+m[2]%7;
  d=new Date(now);let diff=(w-d.getDay()+7)%7;if(m[1])diff+=7;else if(diff==0&&w!==now.getDay())diff=7;d.setDate(d.getDate()+diff)}
 else if(m=s.match(/(\d{1,2}|[一二三四五六七八九十]+)月(\d{1,2}|[一二三四五六七八九十]+)[日号]/)){d=new Date(now.getFullYear(),cnum(m[1])-1,cnum(m[2]));if(d<now.setHours(0,0,0,0))d.setFullYear(d.getFullYear()+1)}
 else if(m=s.match(/(\d+|[一二三四五六七八九十两]+)天[内后之]/)){d=new Date();d.setDate(d.getDate()+cnum(m[1]))}
 let h=18,mi=0;if(m=s.match(/(上午|早上|中午|下午|晚上|今晚|明晚|明早)?\s*(\d{1,2}|[一二三四五六七八九十两]+)\s*[点:：]\s*(半|(\d{1,2})分?)?/)){h=cnum(m[2]);mi=m[3]=='半'?30:(+m[4]||0);if(/下午|晚|今晚|明晚/.test(m[1]||'')&&h<12)h+=12;if(!m[1]&&h<7)h+=12;if(!d)d=new Date()}
 else if(/中午/.test(s))h=12;else if(/早上|上午|明早/.test(s))h=10;
 if(!d){d=new Date();d.setDate(d.getDate()+1)}d.setHours(h,mi,0,0);
 // who
 if(m=s.match(/(?:让|叫|请|通知|安排|派|告诉)\s*([\u4e00-\u9fa5]{1,3}?)(?=在|于|今|明|后|下|周|星期|礼拜|这|本|\d|[一二三四五六七八九十]+月|把|去|给|做|完成|负责|准备|跟|和|整理|写|提交|处理|上午|下午|晚上|中午|早上|\s)/))who=m[1];
 else if(m=s.match(/^([小老][\u4e00-\u9fa5]|[\u4e00-\u9fa5]{2,3}(?:总|经理|工|哥|姐))/))who=m[1];
 // task
 let t=s.replace(/^(?:让|叫|请|通知|安排|派|告诉)/,'');if(who)t=t.replace(who,'');
 t=t.replace(/(下)?(?:周|星期|礼拜)[一二三四五六日天1-7]|今天|今晚|今日|明天|明早|明晚|后天|\d{1,2}月\d{1,2}[日号]|(上午|早上|中午|下午|晚上)?\s*(\d{1,2}|[一二三四五六七八九十两]+)\s*[点:：]\s*(半|\d{1,2}分?)?|上午|下午|晚上|中午|早上|(\d+|[一二三四五六七八九十两]+)天[内后之]|之前|以前|前|在|于|务必|一定要|尽快/g,'')
  .replace(/^(?:把|将|去|负责)/,'').replace(/把/,'').replace(/(做完|做好|完成|搞定|弄好|弄完|搞完)$/,'').replace(/\s+/g,'').trim();
 let std='';if(m=t.match(/(?:要求|标准是?|并且|要)(.+)$/)){std=m[1];t=t.slice(0,m.index)}
 if(t&&!/^(完成|做|写|整理|提交|准备|处理|核对|安排|发|联系|跟进|检查)/.test(t))t='完成'+t;
 const rem=new Date(d);rem.setHours(rem.getHours()-(d-new Date()>36e5*30?24:2));if(rem<new Date())rem.setTime(Date.now()+6e5);
 return{who:who||'',task:t||s,std:std||'按时完成，完成后回复我',due:d,rem}}
async function smart(text){try{const r=await fetch('/api/parse',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});if(r.ok){const j=await r.json();if(j&&j.task)return{...j,due:new Date(j.due),rem:new Date(j.rem)}}}catch(e){}return parse(text)}
function fill(p){$('#f_who').value=p.who;$('#f_task').value=p.task;$('#f_std').value=p.std;$('#f_due').value=toLocal(p.due);$('#f_rem').value=toLocal(p.rem);$('#draft').style.display='block';$('#msgbox').style.display='none'}
$('#parse').onclick=async()=>{const v=$('#say').value.trim();if(!v)return toast('先说一句或打字');fill(await smart(v))};
const msgOf=t=>`${t.who||'你好'}，交给你一个任务：\n【任务】${t.task}\n【标准】${t.std}\n【截止】${fmt(t.due)}\n收到请回复，谢谢！`;
const urgeOf=t=>`${t.who||'你好'}，${t.task}${Date.now()>t.due?`已经过了截止时间（${fmt(t.due)}）`:`截止时间是${fmt(t.due)}`}，现在进度怎么样？有困难请及时告诉我。`;
$('#save').onclick=()=>{const t={id:Date.now(),who:$('#f_who').value.trim(),task:$('#f_task').value.trim(),std:$('#f_std').value.trim(),due:+new Date($('#f_due').value),rem:+new Date($('#f_rem').value),done:0,replies:[],created:Date.now(),reminded:0,urges:0};
 if(!t.task||!t.due)return toast('任务和截止时间不能为空');tasks.unshift(t);save();$('#msg').textContent=msgOf(t);$('#msgbox').style.display='block';$('#draft').style.display='none';$('#say').value='';render();askNotify()};
async function copy(txt){try{await navigator.clipboard.writeText(txt)}catch(e){const a=document.createElement('textarea');a.value=txt;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove()}toast('已复制，去微信粘贴')}
async function share(txt){if(navigator.share){try{await navigator.share({text:txt});return}catch(e){if(e&&e.name==='AbortError')return}}copy(txt)}
$('#copy').onclick=()=>share($('#msg').textContent);$('#copy2').onclick=()=>copy($('#msg').textContent);
// speech
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null;
if(SR){rec=new SR();rec.lang='zh-CN';rec.interimResults=true;rec.continuous=false;
 rec.onresult=e=>{$('#say').value=[...e.results].map(r=>r[0].transcript).join('')};
 rec.onend=()=>{$('#mic').classList.remove('on');$('#hint').textContent='按住说话 · 松开识别';if($('#say').value.trim())$('#parse').click()};
 rec.onerror=e=>toast('语音识别失败：'+e.error+'，可以直接打字');
 const st=e=>{e.preventDefault();try{$('#say').value='';rec.start();$('#mic').classList.add('on');$('#hint').textContent='正在听…松开结束'}catch(_){}},sp=e=>{e.preventDefault();try{rec.stop()}catch(_){}};
 $('#mic').addEventListener('pointerdown',st);$('#mic').addEventListener('pointerup',sp);$('#mic').addEventListener('pointerleave',sp);
}else{$('#mic').onclick=()=>{toast('这个浏览器不支持语音识别，请用键盘上的🎤语音输入');$('#say').focus()}}
// status
const status=t=>t.done?'done':Date.now()>t.due?'late':'doing',CH={done:['g','已完成'],doing:['b','进行中'],late:['r','已逾期']};
function render(){const L=$('#list');$('#cnt').textContent=`共 ${tasks.length} 项`;
 L.innerHTML=tasks.length?'':'<div class="hint">还没有任务，去「派活」说一句吧</div>';
 tasks.forEach(t=>{const s=status(t),e=document.createElement('div');e.className='card';
  e.innerHTML=`<div class="t"><div></div><span class="chip ${CH[s][0]}">${CH[s][1]}</span></div><div class="m"></div><div class="rp"></div>
  <button class="btn s sm" data-a="done">${t.done?'改回进行中':'标记完成'}</button><button class="btn s sm" data-a="reply">贴员工回复</button><button class="btn s sm" data-a="urge">催办·发到微信</button><button class="btn s sm" data-a="msg">派活·发到微信</button><button class="btn s sm" data-a="cp">复制</button><button class="btn s sm" data-a="del" style="color:#b91c1c">删除</button>`;
  e.querySelector('.t div').textContent=t.task;
  e.querySelector('.m').textContent=`${t.who||'未指定'} · 截止 ${fmt(t.due)}`+(t.done?` · 完成于 ${fmt(t.done)}`:` · ⏰ ${fmt(t.rem)} 提醒`)+(t.urges?` · 已催办 ${t.urges} 次`:'');
  t.replies.forEach(r=>{const p=document.createElement('div');p.className='m';p.style.color='#334155';p.textContent=`💬 “${r.text}” (${fmt(r.at)})`;e.querySelector('.rp').appendChild(p)});
  e.onclick=ev=>{const a=ev.target.dataset.a;if(!a)return;
   if(a=='done')t.done=t.done?0:Date.now();
   if(a=='reply'){const r=prompt('粘贴员工在微信里的回复：');if(r&&r.trim())t.replies.push({text:r.trim(),at:Date.now()});if(r&&/完成|做完|搞定|已提交|已发|好了/.test(r)&&!/没|未|还没/.test(r)&&confirm('看起来已完成，标记为完成？'))t.done=Date.now()}
   if(a=='urge'){t.urges++;share(urgeOf(t))}if(a=='msg')share(msgOf(t));if(a=='cp')copy(msgOf(t));
   if(a=='del'&&confirm('删除这个任务？'))tasks=tasks.filter(x=>x!==t);save();render()};L.appendChild(e)});
 summary()}
function summary(){const n=new Date(),c={done:0,doing:0,late:0};tasks.forEach(t=>c[status(t)]++);
 $('#today').textContent=`${n.getMonth()+1}月${n.getDate()}日 周${WD[n.getDay()]} · 自动生成`;
 const late=tasks.filter(t=>status(t)=='late'),soon=tasks.filter(t=>status(t)=='doing'&&t.due-Date.now()<864e5),doneT=tasks.filter(t=>t.done&&new Date(t.done).toDateString()==n.toDateString());
 let txt=!tasks.length?'还没有任务。':late.length?`需要你关注：${late.map(t=>`${t.who}的「${t.task}」已逾期`).join('；')}。`:'今天整体顺利，没有逾期任务。';
 if(doneT.length)txt+=` 今天完成了 ${doneT.length} 项：${doneT.map(t=>t.task).join('、')}。`;if(soon.length)txt+=` 24小时内到期 ${soon.length} 项：${soon.map(t=>`${t.who}「${t.task}」`).join('、')}。`;
 const S=$('#sum');S.innerHTML=`<div class="stats"><div class="st" style="background:#dcfce7;color:#15803d"><div>${c.done}</div><span>已完成</span></div><div class="st" style="background:#dbeafe;color:#1d4ed8"><div>${c.doing}</div><span>进行中</span></div><div class="st" style="background:#fee2e2;color:#b91c1c"><div>${c.late}</div><span>已逾期</span></div></div>
 <div class="card" style="background:#eef2ff;border-color:#c7d2fe;font-size:14px;line-height:1.6">✨ <span id="sumtxt"></span></div><button class="btn" id="cpsum">汇总发到微信</button><button class="btn s sm" id="cpsum2">复制</button><div style="font-weight:700;margin:14px 0 8px">员工回复</div>`;
 $('#sumtxt').textContent=txt;const st=`【${n.getMonth()+1}月${n.getDate()}日 工作汇总】完成${c.done} 进行中${c.doing} 逾期${c.late}\n`+txt;$('#cpsum').onclick=()=>share(st);$('#cpsum2').onclick=()=>copy(st);
 tasks.filter(t=>t.replies.length).forEach(t=>{const s=status(t),e=document.createElement('div');e.className='card';e.innerHTML=`<div class="t"><div></div><span class="chip ${CH[s][0]}">${CH[s][1]}</span></div><div class="m" style="font-size:13px;color:#334155"></div>`;
  e.querySelector('.t div').textContent=`${t.who} · ${t.task}`;e.querySelector('.m').textContent=`“${t.replies.at(-1).text}”`;S.appendChild(e)})}
// reminders
function askNotify(){if('Notification'in window&&Notification.permission=='default')Notification.requestPermission()}
function tick(){let ch=0;tasks.forEach(t=>{if(!t.done&&!t.reminded&&Date.now()>=t.rem){t.reminded=1;ch=1;const b=`${t.who}「${t.task}」截止 ${fmt(t.due)}，点「催办」发到微信`;
 toast('⏰ 到点提醒：'+b);try{navigator.vibrate&&navigator.vibrate(300)}catch(e){}if('Notification'in window&&Notification.permission=='granted')try{new Notification('AI 派活助手 · 到点提醒',{body:b})}catch(e){}}});if(ch)save();render()}
setInterval(tick,20000);
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button,.pg').forEach(x=>x.classList.remove('a'));b.classList.add('a');$('#p'+b.dataset.p).classList.add('a');render()});
tick();
