'use strict';
const $ = s => document.querySelector(s);
const Core = window.PaihuoCore;
const K = 'paihuo_tasks', CONFIG = 'paihuo_config';
let tasks = [], storageBlocked = false, lastStored = null;
const pad = n => String(n).padStart(2, '0');
const toLocal = d => d ? `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
const WD = '日一二三四五六';
function fmt(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日(周${WD[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toast(t) {
  const e = $('#toast'); e.textContent = t; e.style.display = 'block';
  clearTimeout(e._t); e._t = setTimeout(() => { e.style.display = 'none'; }, 5000);
}
function storageNote(message) { $('#storage_note').textContent = message; }
function validateTasks(value) {
  if (!Array.isArray(value) || value.length > 5000) throw Error('任务数据格式错误');
  const ids = new Set();
  return value.map(t => {
    if (!t || !['string','number'].includes(typeof t.id) || ids.has(String(t.id))) throw Error('任务编号错误或重复');
    ids.add(String(t.id));
    for (const key of ['due','rem','created','done']) {
      if (typeof t[key] !== 'number' || !Number.isFinite(t[key]) || t[key] < 0 || t[key] > 8640000000000000) throw Error('任务时间格式错误');
    }
    Core.normalizeParsed({who:t.who,task:t.task,std:t.std,due:new Date(t.due).toISOString(),rem:new Date(t.rem).toISOString(),warnings:[]});
    if (!Array.isArray(t.replies) || t.replies.length > 1000 || t.replies.some(r => !r || typeof r.text !== 'string' || r.text.length > 4000 || !Number.isFinite(r.at))) throw Error('回复格式错误');
    return {...t, replies:t.replies.map(r=>({...r})), reminded:t.reminded ? 1 : 0, urges:Number.isInteger(t.urges) && t.urges >= 0 ? t.urges : 0};
  });
}
function loadTasks() {
  try {
    lastStored = localStorage.getItem(K);
    tasks = validateTasks(JSON.parse(lastStored || '[]'));
    storageNote('任务仅保存在此浏览器；清理网站数据会丢失，请定期导出备份。');
  } catch (_) {
    storageBlocked = true;
    storageNote('本机数据不可读取：为避免覆盖，已暂停保存。请先导出原始备份，再修复数据或导入有效备份。');
  }
}
function persist(next, recovery = false) {
  if (storageBlocked && !recovery) { toast('保存未成功：请先处理本机数据异常并备份'); return false; }
  try {
    if (!recovery && localStorage.getItem(K) !== lastStored) throw Error('其他标签页已更新任务，请刷新后重试');
    const raw = JSON.stringify(validateTasks(next));
    localStorage.setItem(K, raw); lastStored = raw; tasks = next; storageBlocked = false;
    storageNote('已保存在此浏览器；请定期导出备份。'); return true;
  } catch (e) { toast('保存未成功：' + (e.message || '浏览器禁止保存或空间不足')); return false; }
}
let config = {apiURL:''}, appToken = '';
try {
  const stored = JSON.parse(localStorage.getItem(CONFIG) || '{}');
  if (typeof stored.apiURL === 'string') config.apiURL = checkedURL(stored.apiURL);
} catch (_) { /* Configuration errors do not damage tasks. */ }
function checkedURL(value) {
  if (!value.trim()) return '';
  const u = new URL(value.trim());
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/api/parse') throw Error('请输入 HTTPS 接口完整地址，以 /api/parse 结尾且不含参数');
  return u.href;
}
$('#api_url').value = config.apiURL;
$('#config_save').onclick = () => {
  try {
    const next = {apiURL:checkedURL($('#api_url').value)};
    const token = $('#api_token').value.trim();
    if (next.apiURL && token.length < 32) throw Error('请填写至少32字符的私人访问口令');
    localStorage.setItem(CONFIG, JSON.stringify(next)); config = next; appToken = token;
    $('#api_token').value = '';
    toast(next.apiURL ? 'AI 接口已配置；访问口令仅在本页内存中，刷新后需重填' : '已切换为免费本地规则');
  } catch (e) { toast('配置未保存：' + e.message); }
};
async function smart(text) {
  if (!config.apiURL || !appToken) {
    return {...Core.parseLocal(text), source:'local', reason:config.apiURL ? '访问口令未填写，本次使用本地规则' : '未连接 AI 服务，本次使用本地规则'};
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(config.apiURL, {method:'POST', signal:controller.signal, credentials:'omit', redirect:'error', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + appToken}, body:JSON.stringify({text,now:new Date().toISOString(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})});
    if (!r.ok) throw Error('服务返回 ' + r.status);
    const j = await r.json();
    if (j.source !== 'workers-ai') throw Error('返回来源无效');
    return {...Core.normalizeParsed(j), source:'workers-ai', reason:'AI 已整理，请核对负责人、标准和时间'};
  } catch (e) {
    return {...Core.parseLocal(text), source:'local', reason:'AI 未成功（' + (e.name === 'AbortError' ? '超时' : e.message) + '），已使用本地规则'};
  } finally { clearTimeout(timeout); }
}
function fill(p) {
  $('#f_who').value=p.who; $('#f_task').value=p.task; $('#f_std').value=p.std;
  $('#f_due').value=toLocal(p.due); $('#f_rem').value=toLocal(p.rem);
  $('#parse_note').textContent=[p.reason,...p.warnings].join('；');
  $('#draft').style.display='block'; $('#msgbox').style.display='none';
}
$('#parse').onclick=async()=>{
  const v=$('#say').value.trim();
  if (!v) return toast('先说一句或打字');
  if (v.length > 2000) return toast('请控制在2000字内，并一次整理一项任务');
  $('#parse').disabled=true;
  try { const p=await smart(v); if ($('#say').value.trim() === v) fill(p); else toast('输入已改变，请重新整理'); }
  catch (e) { toast('无法整理：'+e.message); }
  finally { $('#parse').disabled=false; }
};
const msgOf=t=>`${t.who||'你好'}，交给你一个任务：\n【任务】${t.task}\n【标准】${t.std}\n【截止】${fmt(t.due)}\n收到请回复，谢谢！`;
const urgeOf=t=>`${t.who||'你好'}，${t.task}${Date.now()>t.due?`已经过了截止时间（${fmt(t.due)}）`:`截止时间是${fmt(t.due)}`}，现在进度怎么样？有困难请及时告诉我。`;
$('#save').onclick=()=>{
  const due=+new Date($('#f_due').value),rem=+new Date($('#f_rem').value);
  const t={id:window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,who:$('#f_who').value.trim(),task:$('#f_task').value.trim(),std:$('#f_std').value.trim()||'完成后回复我',due,rem,done:0,replies:[],created:Date.now(),reminded:0,urges:0};
  if (!t.task || !Number.isFinite(due) || !Number.isFinite(rem)) return toast('请填写任务、明确的截止时间和提醒时间');
  if (rem > due) return toast('提醒时间不能晚于截止时间');
  if (rem <= Date.now()) return toast('提醒时间已经过去，请选择未来时间');
  if (!persist([t,...tasks])) return;
  $('#msg').textContent=msgOf(t); $('#msgbox').style.display='block'; $('#draft').style.display='none'; $('#say').value=''; render();
};
async function copy(txt) {
  let copied=false;
  try { await navigator.clipboard.writeText(txt); copied=true; }
  catch (_) {
    const a=document.createElement('textarea'); a.value=txt; document.body.appendChild(a); a.select();
    try { copied=document.execCommand('copy') === true; } catch (_) { /* Manual copy is still possible. */ }
    a.remove();
  }
  toast(copied?'已复制，请自行粘贴并发送':'复制失败，请长按或选中文字手动复制'); return copied;
}
async function share(txt) {
  if (navigator.share) {
    try { await navigator.share({text:txt}); toast('分享操作已结束；请在目标应用中确认是否发送'); return; }
    catch (e) { if (e?.name === 'AbortError') return; }
  }
  await copy(txt);
}
$('#copy').onclick=()=>share($('#msg').textContent); $('#copy2').onclick=()=>copy($('#msg').textContent);
// Click-to-toggle also works with keyboard activation; errors never auto-submit old text.
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null, listening=false, speechFailed=false, finalSpeech='', lastTranscript=null, speechEdited=false;
function speechEnd() { listening=false; $('#mic').classList.remove('on'); $('#mic').setAttribute('aria-pressed','false'); $('#hint').textContent='点击开始 · 再点结束；也可使用键盘语音输入'; }
if (SR) {
  rec=new SR(); rec.lang='zh-CN'; rec.interimResults=true; rec.continuous=false;
  rec.onresult=e=>{
    if (speechEdited || (lastTranscript !== null && $('#say').value !== lastTranscript)) { speechEdited=true; return; }
    const results=Array.from(e.results);
    lastTranscript=results.map(r=>r[0].transcript).join(''); $('#say').value=lastTranscript;
    finalSpeech=results.filter(r=>r.isFinal).map(r=>r[0].transcript).join('');
  };
  rec.onerror=e=>{ speechFailed=true; speechEnd(); toast('语音未成功：'+e.error+'。可以用键盘语音输入或打字'); };
  rec.onend=()=>{ speechEnd(); if (!speechFailed && !speechEdited && finalSpeech.trim() && $('#say').value === lastTranscript) { $('#say').value=finalSpeech; $('#parse').click(); } };
  $('#mic').onclick=()=>{
    if (listening) { try { rec.stop(); } catch (_) { speechEnd(); } return; }
    speechFailed=false; finalSpeech=''; lastTranscript=$('#say').value; speechEdited=false;
    try { rec.start(); listening=true; $('#mic').classList.add('on'); $('#mic').setAttribute('aria-pressed','true'); $('#hint').textContent='正在听…再次点击结束'; }
    catch (_) { speechFailed=true; speechEnd(); toast('暂时无法开始语音，请改用键盘输入'); }
  };
} else {
  $('#mic').onclick=()=>{ toast('此浏览器不支持网页语音识别，请使用键盘的语音输入'); $('#say').focus(); };
}
const status=t=>t.done?'done':Date.now()>t.due?'late':'doing';
const CH={done:['g','已完成'],doing:['b','进行中'],late:['r','已逾期']};
function download(text,name,type) {
  const url=URL.createObjectURL(new Blob([text],{type})); const a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function calendar(t) {
  try { download(Core.buildCalendar(t),`paihuo-${t.id}.ics`,'text/calendar;charset=utf-8'); toast('已导出日历文件：还需导入日历，并检查时间与提醒是否保留。任务修改后需同步修改日历。'); }
  catch(e) { toast('日历导出未成功：'+e.message); }
}
function render() {
  const L=$('#list'); $('#cnt').textContent=`共 ${tasks.length} 项`;
  L.innerHTML=tasks.length?'':'<div class="hint">还没有任务，去「派活」说一句吧</div>';
  tasks.forEach(t=>{
    const s=status(t), e=document.createElement('div'); e.className='card';
    e.innerHTML=`<div class="t"><div></div><span class="chip ${CH[s][0]}">${CH[s][1]}</span></div><div class="m"></div><div class="rp"></div>
    <button class="btn s sm" data-a="done">${t.done?'改回进行中':'标记完成'}</button><button class="btn s sm" data-a="reply">贴员工回复</button><button class="btn s sm" data-a="urge">催办分享</button><button class="btn s sm" data-a="msg">分享派活消息</button><button class="btn s sm" data-a="cp">复制</button><button class="btn s sm" data-a="calendar">导出日历</button><button class="btn s sm" data-a="del">删除</button>`;
    e.querySelector('.t div').textContent=t.task;
    e.querySelector('.m').textContent=`${t.who||'未指定'} · 截止 ${fmt(t.due)}`+(t.done?` · 完成于 ${fmt(t.done)}`:` · 页面内提醒 ${fmt(t.rem)}`)+(t.reminded?' · 已显示页面提示':'');
    t.replies.forEach(r=>{ const p=document.createElement('div'); p.className='m'; p.textContent=`回复：“${r.text}” (${fmt(r.at)})`; e.querySelector('.rp').appendChild(p); });
    e.onclick=ev=>{
      const a=ev.target.dataset.a; if (!a) return;
      if (a==='msg') return share(msgOf(t)); if(a==='cp')return copy(msgOf(t)); if(a==='calendar')return calendar(t);
      let next=tasks.map(x=>({...x,replies:x.replies.slice()})), n=next.find(x=>x.id===t.id);
      if(a==='done') n.done=n.done?0:Date.now();
      else if(a==='reply') { const r=prompt('粘贴员工回复（保存后才会进入汇总）：'); if (!r?.trim()) return; if(r.length>4000)return toast('回复请控制在4000字内'); n.replies.push({text:r.trim(),at:Date.now()}); }
      else if(a==='urge') n.urges++;
      else if(a==='del') { if (!confirm('删除此任务？已导出的日历事件需另外删除。建议先备份。')) return; next=next.filter(x=>x.id!==t.id); }
      else return;
      if(persist(next)) { render(); if(a==='urge')share(urgeOf(t)); }
    }; L.appendChild(e);
  }); summary();
}
function summary() {
  const n=new Date(), c={done:0,doing:0,late:0}; tasks.forEach(t=>c[status(t)]++);
  $('#today').textContent=`${n.getMonth()+1}月${n.getDate()}日 周${WD[n.getDay()]} · 打开页面时计算`;
  const late=tasks.filter(t=>status(t)==='late'), soon=tasks.filter(t=>status(t)==='doing' && t.due-Date.now()<864e5), doneT=tasks.filter(t=>t.done && new Date(t.done).toDateString()===n.toDateString());
  let txt=!tasks.length?'还没有任务。':late.length?`需要关注：${late.map(t=>`${t.who||'未指定'}的「${t.task}」已逾期`).join('；')}。`:'当前没有逾期任务。';
  if(doneT.length)txt+=` 今天完成${doneT.length}项：${doneT.map(t=>t.task).join('、')}。`;
  if(soon.length)txt+=` 24小时内到期${soon.length}项：${soon.map(t=>t.task).join('、')}。`;
  const S=$('#sum'); S.innerHTML=`<div class="stats"><div class="st g"><div>${c.done}</div><span>累计已完成</span></div><div class="st b"><div>${c.doing}</div><span>进行中</span></div><div class="st r"><div>${c.late}</div><span>已逾期</span></div></div><div class="card"><span id="sumtxt"></span></div><button class="btn" id="cpsum">分享汇总</button><button class="btn s sm" id="cpsum2">复制</button>`;
  $('#sumtxt').textContent=txt; const st=`【${n.getMonth()+1}月${n.getDate()}日 工作汇总】累计完成${c.done} 进行中${c.doing} 逾期${c.late}\n${txt}`;
  $('#cpsum').onclick=()=>share(st); $('#cpsum2').onclick=()=>copy(st);
  tasks.filter(t=>t.replies.length).forEach(t=>{
    const e=document.createElement('div'); e.className='card';
    const title=document.createElement('div'), reply=document.createElement('div');
    title.textContent=`${t.who||'未指定'} · ${t.task}`; reply.className='m';
    reply.textContent=`最新回复：“${t.replies.at(-1).text}”`;
    e.appendChild(title); e.appendChild(reply); S.appendChild(e);
  });
}
$('#notify').onclick=async()=>{
  if(!('Notification' in window))return toast('此浏览器不支持页面通知；可导出到系统日历');
  try { const p=await Notification.requestPermission(); toast(p==='granted'?'已允许页面通知；关闭页面后仍不能保证提醒':'通知未获允许，仍可显示页面提示或导出日历'); }
  catch(_) { toast('无法申请通知权限，请使用系统日历'); }
};
function tick() {
  // A hidden toast is not a delivered reminder. Defer until the page can show it.
  if (document.visibilityState !== 'visible') return;
  const due=tasks.filter(t=>!t.done && !t.reminded && Date.now()>=t.rem);
  if(due.length) {
    toast(`页面内到点提醒：${due.map(t=>t.task).join('；')}。关闭页面后无法保证提醒。`);
    for(const t of due) {
      if('Notification' in window && Notification.permission==='granted') {
        try { new Notification('派活助手 · 页面内提醒',{body:`${t.who} ${t.task}；截止 ${fmt(t.due)}`}); } catch(_) { /* The visible page prompt is the fallback. */ }
      }
    }
    const ids=new Set(due.map(t=>t.id)); persist(tasks.map(t=>ids.has(t.id)?{...t,reminded:1}:t));
  }
  render();
}
$('#backup').onclick=()=>{
  try { download(localStorage.getItem(K)||'[]','paihuo-backup.json','application/json'); toast('已导出备份；请确认文件已下载'); }
  catch(_) { toast('无法读取本机备份；请检查浏览器存储权限'); }
};
$('#restore').onchange=async ev=>{
  const f=ev.target.files?.[0]; if(!f)return;
  try {
    if(f.size>5000000)throw Error('备份文件过大');
    const imported=validateTasks(JSON.parse(await f.text()));
    if(!confirm('用备份替换当前本机任务？请先导出当前备份。日历事件不会自动更新。'))return;
    if(persist(imported,true)){render();toast('备份已导入；请核对任务与日历');}
  }catch(e){toast('导入失败：'+e.message);}finally{ev.target.value='';}
};
window.addEventListener('storage',e=>{
  if(e.key!==K)return;
  try { tasks=validateTasks(JSON.parse(e.newValue||'[]')); lastStored=e.newValue; storageBlocked=false; render(); toast('已同步另一标签页的任务变更'); }
  catch(_){storageBlocked=true;storageNote('另一标签页写入异常数据，已暂停保存。请先导出备份。');}
});
window.addEventListener('focus',tick); window.addEventListener('pageshow',tick);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tick();});
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('nav button,.pg').forEach(x=>x.classList.remove('a'));
  b.classList.add('a'); $('#p'+b.dataset.p).classList.add('a'); render();
});
loadTasks(); tick(); setInterval(tick,20000);
