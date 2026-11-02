'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Drive the actual page handlers with small DOM and browser-service adapters.
function boot(options = {}) {
  const elements = new Map(), listeners = new Map(), writes = [], requests = [], speech = [];
  let clipWrites = 0, execCalls = 0;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.value = ''; this.textContent = ''; this.style = {};
      this.dataset = {}; this.children = []; this.listeners = new Map(); this.attributes = {};
      this.disabled = false; this.files = []; this.hidden = false; this._html = ''; this.sub = new Map();
      this.className = ''; this.classList = { add(){}, remove(){}, toggle(){} };
    }
    get innerHTML() { return this._html; }
    set innerHTML(html) { this._html = html; this.children = []; }
    appendChild(el) { this.children.push(el); return el; }
    append(...els) { this.children.push(...els); }
    replaceChildren(...els) { this.children = els; }
    remove() { this.removed = true; }
    select() {}
    focus() { this.focused = true; }
    setAttribute(k,v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] ?? null; }
    addEventListener(k,fn) { this.listeners.set(k, fn); }
    removeEventListener(k) { this.listeners.delete(k); }
    querySelector(sel) { if (!this.sub.has(sel)) this.sub.set(sel,new Element()); return this.sub.get(sel); }
    querySelectorAll() { return []; }
    closest() { return this; }
    async click() { return this.onclick?.({ target:this, preventDefault(){}, stopPropagation(){} }); }
  }
  const el = id => { if (!elements.has(id)) elements.set(id,new Element()); return elements.get(id); };
  const nav = ['0','1','2'].map(p=>{const n=new Element('button');n.dataset.p=p;return n;});
  const pages = ['p0','p1','p2'].map(el);
  const document = {
    body: new Element('body'), visibilityState:'visible', hidden:false,
    querySelector:sel=>el(sel.replace(/^#/,'')),
    querySelectorAll:sel=>sel==='nav button'?nav:sel==='nav button,.pg'?[...nav,...pages]:[],
    createElement:tag=>new Element(tag), getElementById:el,
    addEventListener:(k,fn)=>listeners.set('document:'+k,fn),
    execCommand:()=>{execCalls++;return options.execResult??true;}
  };
  const data = new Map(Object.entries(options.storage || {}));
  const localStorage = {
    getItem:k=>{if(options.readBlocked)throw Error('storage disabled');return data.get(k)??null;},
    setItem:(k,v)=>{if(options.writeBlocked)throw Error('quota exceeded');data.set(k,String(v));writes.push([k,String(v)]);},
    removeItem:k=>data.delete(k)
  };
  const fixed = options.now ?? Date.parse('2026-11-02T02:00:00Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length?args:[fixed])); }
    static now(){return fixed;}
  }
  class Recognition {
    constructor(){speech.push(this);}
    start(){this.onstart?.();}
    stop(){this.onend?.();}
    abort(){this.onend?.();}
  }
  class Notification {
    constructor(title,opts){Notification.sent.push({title,opts});}
    static permission=options.notificationPermission??'denied';
    static sent=[];
    static async requestPermission(){return Notification.permission;}
  }
  const navigator = {
    language:'zh-CN',
    clipboard:{writeText:async()=>{clipWrites++;if(options.clipboardFails)throw Error('denied');}},
    vibrate:()=>true
  };
  if(options.share) navigator.share=options.share;
  const context = {
    document, localStorage, navigator, Date:Clock, Intl, URL, Blob, TextEncoder,
    console, AbortController, Notification,
    location:{protocol:'https:',hostname:'leon777999.github.io',origin:'https://leon777999.github.io',href:'https://leon777999.github.io/ai-paihuo/'},
    crypto:{randomUUID:()=> 'task-test-uuid'},
    fetch:async(url,init)=>{requests.push({url,init});return options.fetch?options.fetch(url,init):{ok:false,status:404,json:async()=>({})};},
    setTimeout:()=>1, clearTimeout(){},
    setInterval:fn=>{listeners.set('interval',fn);return 1;},clearInterval(){},
    addEventListener:(k,fn)=>listeners.set('window:'+k,fn),
    confirm:()=>true, prompt:()=>null,
  };
  context.window=context;
  if(options.speech)context.SpeechRecognition=Recognition;
  vm.createContext(context);
  const corePath=path.join(__dirname,'../core.js');
  if(fs.existsSync(corePath))vm.runInContext(fs.readFileSync(corePath,'utf8'),context,{filename:'core.js'});
  let error;
  try { vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context,{filename:'app.js'}); }
  catch(e) {error=e;}
  return {
    context,el,elements,listeners,writes,requests,speech,data,error,Notification,
    get clipWrites(){return clipWrites;},get execCalls(){return execCalls;}
  };
}
async function configure(h) {
  h.el('api_url').value='https://paihuo.example.workers.dev/api/parse';
  h.el('api_token').value='private-test-application-token-1234567890';
  await h.el('config_save').click();
}
async function parse(h,text='让小王明天下午三点半整理报价，要求包含运费') {
  assert.ifError(h.error); h.el('say').value=text; await h.el('parse').click();
}
function task(overrides={}) {
  return {
    id:'test-task',who:'小王',task:'整理报价',std:'含运费',
    due:Date.parse('2026-11-03T07:30:00Z'),rem:Date.parse('2026-11-02T01:59:00Z'),
    done:0,replies:[],created:Date.parse('2026-11-01T01:00:00Z'),reminded:0,urges:0,...overrides
  };
}

test('corrupt saved data does not crash startup or overwrite original bytes',()=>{
  const h=boot({storage:{paihuo_tasks:'{broken-json'}});
  assert.ifError(h.error);
  assert.equal(h.data.get('paihuo_tasks'),'{broken-json');
  assert.match(h.el('storage_note').textContent,/损坏|无法|失败|备份|异常|读取/);
});
test('local mode parses without contacting a nonexistent API',async()=>{
  const h=boot();await parse(h);
  assert.equal(h.requests.length,0);
  assert.equal(h.el('f_who').value,'小王');
  assert.match(h.el('f_task').value,/报价/);
  assert.match(h.el('parse_note').textContent,/规则|本地/);
});
test('storage write failure preserves the editable draft and reports failure',async()=>{
  const h=boot({writeBlocked:true});await parse(h);
  h.el('f_due').value='2026-11-03T15:30';h.el('f_rem').value='2026-11-03T13:30';
  await h.el('save').click();
  assert.notEqual(h.el('draft').style.display,'none');
  assert.equal(h.data.has('paihuo_tasks'),false);
  assert.match(h.el('toast').textContent+' '+h.el('storage_note').textContent,/保存失败|保存未成功|无法保存|未保存|写入失败|存储/);
});
test('AI config uses Authorization at runtime without persisting its token',async()=>{
  const h=boot({fetch:async()=>({
    ok:true,status:200,json:async()=>({
      source:'workers-ai',who:'小王',task:'整理报价',std:'包含运费',
      due:'2026-11-03T15:30:00+08:00',rem:'2026-11-03T13:30:00+08:00',warnings:[]
    })
  })});
  assert.ifError(h.error);await configure(h);await parse(h);
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].url,'https://paihuo.example.workers.dev/api/parse');
  assert.match(h.requests[0].init.headers.Authorization??h.requests[0].init.headers.authorization,/Bearer private-test-application-token-1234567890/);
  const body=JSON.parse(h.requests[0].init.body);
  assert.equal(typeof body.timeZone,'string');assert.ok(Number.isFinite(Date.parse(body.now)));
  assert.match(h.el('parse_note').textContent,/AI|模型/);
  assert.ok([...h.data.values()].every(v=>!v.includes('private-test-application-token-1234567890')));
});
for(const [name,response] of [
  ['HTTP failure',{ok:false,status:503,json:async()=>({error:'busy'})}],
  ['malformed model date',{ok:true,status:200,json:async()=>({
    source:'workers-ai',who:'小王',task:'报价',std:'',due:'not-a-date',
    rem:'2026-11-03T13:30:00+08:00',warnings:[]
  })}]
])test(name+' explicitly falls back to local parsing',async()=>{
  const h=boot({fetch:async()=>response});assert.ifError(h.error);await configure(h);await parse(h);
  assert.match(h.el('parse_note').textContent,/规则|本地/);
  assert.match(h.el('parse_note').textContent,/失败|未成功|不可用|错误|回退|异常|有效/);
  assert.match(h.el('f_task').value,/报价/);
});
test('failed clipboard and failed legacy copy do not claim a successful copy',async()=>{
  const h=boot({clipboardFails:true,execResult:false});assert.ifError(h.error);
  h.el('msg').textContent='test message';await h.el('copy2').click();
  assert.equal(h.clipWrites,1);assert.equal(h.execCalls,1);
  assert.doesNotMatch(h.el('toast').textContent,/已复制/);
  assert.match(h.el('toast').textContent,/复制失败|无法复制|手动|长按/);
});
test('speech recognition error preserves text and never auto-parses stale input',async()=>{
  const h=boot({speech:true});assert.ifError(h.error);h.el('say').value='先前输入';
  const rec=h.speech[0];assert.ok(rec);rec.onerror({error:'not-allowed'});rec.onend();
  await Promise.resolve();
  assert.equal(h.requests.length,0);
  assert.notEqual(h.el('draft').style.display,'block');
  assert.equal(h.el('say').value,'先前输入');
});
test('overdue local reminder is surfaced and persisted, completed task is skipped',()=>{
  const pending=task(),done=task({id:'done-task',done:Date.parse('2026-11-01T02:00:00Z')});
  const h=boot({storage:{paihuo_tasks:JSON.stringify([pending,done])}});assert.ifError(h.error);
  assert.match(h.el('toast').textContent,/提醒|报价/);
  const saved=JSON.parse(h.data.get('paihuo_tasks'));
  assert.ok(saved.find(t=>t.id==='test-task').reminded);
  assert.equal(saved.find(t=>t.id==='done-task').reminded,0);
  assert.ok(h.listeners.has('window:focus')||h.listeners.has('document:visibilitychange'),
    'must check due reminders again after background suspension');
});


test('incomplete deadline cannot be saved as a fabricated task',async()=>{
  const h=boot();await parse(h,'请小王整理在建项目的前期资料');
  assert.equal(h.el('f_due').value,'');
  await h.el('save').click();
  assert.equal(h.data.has('paihuo_tasks'),false);
  assert.equal(h.el('draft').style.display,'block');
  assert.match(h.el('toast').textContent,/填写|时间/);
});

test('an insecure API endpoint is rejected before any request or secret persistence',async()=>{
  const h=boot();assert.ifError(h.error);
  h.el('api_url').value='http://untrusted.example/api/parse';
  h.el('api_token').value='private-test-application-token-1234567890';
  await h.el('config_save').click();await parse(h);
  assert.equal(h.requests.length,0);
  assert.equal(h.data.has('paihuo_config'),false);
});

test('another tab update cannot be silently overwritten by saving an old draft',async()=>{
  const h=boot();await parse(h);
  const changed=JSON.stringify([task({rem:Date.parse('2026-11-03T06:00:00Z')})]);
  h.data.set('paihuo_tasks',changed);
  await h.el('save').click();
  assert.equal(h.data.get('paihuo_tasks'),changed);
  assert.equal(h.el('draft').style.display,'block');
  assert.match(h.el('toast').textContent,/标签页|刷新/);
});

test('user-cancelled native sharing does not fall through to clipboard',async()=>{
  const h=boot({share:async()=>{const e=new Error('cancelled');e.name='AbortError';throw e;}});
  assert.ifError(h.error);h.el('msg').textContent='do not send';await h.el('copy').click();
  assert.equal(h.clipWrites,0);assert.equal(h.execCalls,0);
});

test('a partial speech result stays editable and is not silently submitted',async()=>{
  const h=boot({speech:true});assert.ifError(h.error);
  const r=[{transcript:'让小王明天'}];r.isFinal=false;
  h.speech[0].onresult({results:[r]});h.speech[0].onend();await Promise.resolve();
  assert.equal(h.el('say').value,'让小王明天');
  assert.notEqual(h.el('draft').style.display,'block');
  assert.equal(h.requests.length,0);
});

test('valid backup import replaces browser tasks only after validation',async()=>{
  const h=boot();assert.ifError(h.error);
  const restored=task({rem:Date.parse('2026-11-03T06:00:00Z')});
  const input=h.el('restore');input.files=[{size:200,text:async()=>JSON.stringify([restored])}];
  await input.onchange({target:input});
  const saved=JSON.parse(h.data.get('paihuo_tasks'));assert.equal(saved.length,1);
  assert.equal(saved[0].task,'整理报价');
  const again=boot({storage:{paihuo_tasks:h.data.get('paihuo_tasks')}});
  assert.ifError(again.error);assert.match(again.el('cnt').textContent,/1/);
});

test('invalid backup import preserves current tasks instead of overwriting them',async()=>{
  const current=JSON.stringify([task({rem:Date.parse('2026-11-03T06:00:00Z')})]);
  const h=boot({storage:{paihuo_tasks:current}});assert.ifError(h.error);
  const input=h.el('restore');input.files=[{size:20,text:async()=>JSON.stringify([{task:'bad'}])}];
  await input.onchange({target:input});
  assert.equal(h.data.get('paihuo_tasks'),current);
  assert.match(h.el('toast').textContent,/导入失败/);
});

test('speech completion cannot overwrite text edited after the latest transcript',async()=>{
  const h=boot({speech:true});assert.ifError(h.error);
  const r=[{transcript:'让小王明天下午三点报价'}];r.isFinal=true;
  h.speech[0].onresult({results:[r]});
  h.el('say').value='我改成明天上午十点联系客户';
  h.el('say').listeners.get('input')?.({target:h.el('say')});
  h.el('say').oninput?.({target:h.el('say')});
  h.speech[0].onend();await Promise.resolve();
  assert.equal(h.el('say').value,'我改成明天上午十点联系客户');
  assert.notEqual(h.el('draft').style.display,'block');
});

test('a later speech result cannot clobber a manual edit made during capture',()=>{
  const h=boot({speech:true});assert.ifError(h.error);
  const partial=[{transcript:'让小王明天'}];partial.isFinal=false;
  h.speech[0].onresult({results:[partial]});
  h.el('say').value='我决定改为给小李发邮件';
  h.el('say').listeners.get('input')?.({target:h.el('say')});
  h.el('say').oninput?.({target:h.el('say')});
  const final=[{transcript:'让小王明天下午三点报价'}];final.isFinal=true;
  h.speech[0].onresult({results:[final]});
  assert.equal(h.el('say').value,'我决定改为给小李发邮件');
});

test('hidden-tab timer preserves reminders for visible catch-up instead of treating an unseen toast as delivered',()=>{
  const pending=task({rem:Date.parse('2026-11-02T02:01:00Z')});
  const h=boot({storage:{paihuo_tasks:JSON.stringify([pending])},notificationPermission:'granted'});
  assert.ifError(h.error);
  assert.equal(JSON.parse(h.data.get('paihuo_tasks'))[0].reminded,0);
  h.context.document.visibilityState='hidden';
  h.context.document.hidden=true;
  h.context.Date.now=()=>Date.parse('2026-11-02T02:02:00Z');
  h.listeners.get('interval')();
  assert.equal(JSON.parse(h.data.get('paihuo_tasks'))[0].reminded,0);
  assert.equal(h.Notification.sent.length,0);
  assert.doesNotMatch(h.el('toast').textContent,/到点提醒/);
  h.context.document.visibilityState='visible';
  h.context.document.hidden=false;
  h.listeners.get('document:visibilitychange')();
  assert.equal(JSON.parse(h.data.get('paihuo_tasks'))[0].reminded,1);
  assert.equal(h.Notification.sent.length,1);
  assert.match(h.el('toast').textContent,/到点提醒.*报价/);
});
