// 规划只读查询与草案入口；任何编辑和排序均需进入确认页后才保存。
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getPlanning, proposePlanningChange } from '../api/planning.js'
const LABELS = { todo:'待办',doing:'进行中',blocked:'人工阻塞',done:'已完成',scheduled:'已安排',completed:'已完成',cancelled:'已取消' }
const CLASS='rounded-xl border border-brand/15 bg-white/40 p-4 dark:bg-white/5'
const INPUT='rounded-lg border border-brand/20 bg-transparent p-2'
const ended=s=>['done','completed','cancelled'].includes(s)
const fmt=iso=>iso?new Date(iso).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未设置'
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10)
const dateInput=iso=>iso?new Date(new Date(iso).getTime()+8*3600000).toISOString().slice(0,16):''
const fromInput=v=>v?`${v}:00+08:00`:null
export default function PlanningPage({canWrite=true}) {
  const navigate=useNavigate(),[params,setParams]=useSearchParams()
  const tab=['tasks','schedules'].includes(params.get('tab'))?params.get('tab'):'plans'
  const planId=params.get('plan')||''
  const [status,setStatus]=useState(''),[date,setDate]=useState(today),[q,setQ]=useState('')
  const [data,setData]=useState(null),[catalog,setCatalog]=useState(null),[error,setError]=useState('')
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0)
  const [editing,setEditing]=useState(null),[form,setForm]=useState({})
  useEffect(()=>{
    let alive=true;setLoading(true);setError('')
    const timer=setTimeout(async()=>{
      try {
        const from=tab==='schedules'&&date?`${date}T00:00:00+08:00`:undefined
        const [value,all]=await Promise.all([getPlanning({from,to:from?new Date(new Date(from).getTime()+86400000).toISOString():undefined,q,planId:planId||undefined,planStatus:tab==='plans'?status||'active':'all',scheduleStatus:tab==='schedules'?status||'all':'all',taskStatus:tab==='tasks'?status||'all':'all'}),getPlanning({planStatus:'all'})])
        if(alive){setData(value);setCatalog(all)}
      }catch(err){if(alive)setError(err.message||'规划读取失败')}finally{if(alive)setLoading(false)}
    },200)
    return()=>{alive=false;clearTimeout(timer)}
  },[tab,status,date,q,planId,retry])
  const allPlans=catalog?.plans??[],allTasks=catalog?.project_tasks??[]
  const planTitle=id=>allPlans.find(p=>p.id===id)?.title||id||'独立日程'
  const taskTitle=id=>allTasks.find(t=>t.id===id)?.title||id||'无'
  function switchTab(value){setStatus('');setData(null);setEditing(null);setParams({...Object.fromEntries(params),tab:value})}
  async function submit(input){
    if(busy||!canWrite)return
    setBusy(true);setError('')
    try{const draft=await proposePlanningChange(input);navigate(`/planning/drafts/${encodeURIComponent(draft.id)}/confirm`)}catch(err){setError(err.message||'草案生成失败，记录保持原样')}finally{setBusy(false)}
  }
  const type=tab==='plans'?'plan':tab==='tasks'?'project_task':'schedule'
  const act=(operation,record,patch)=>submit({operation,target:{type,id:record.id},...(patch?{patch}:{})})
  function openEdit(record){setEditing(record);setForm({title:record.title,description:record.description||'',start_at:dateInput(record.start_at),end_at:dateInput(record.end_at),due_at:dateInput(record.due_at),priority:record.priority??0,status:record.status,all_day:Boolean(record.all_day),plan_id:record.plan_id||'',task_id:record.task_id||'',depends_on:record.depends_on??[]})}
  function newTask(){setEditing({new:true});setForm({title:'',description:'',due_at:'',plan_id:planId,depends_on:[],status:'todo'})}
  function saveEdit(event){
    event.preventDefault()
    if(editing.new){submit({project_tasks:[{ref:'task',title:form.title,description:form.description,plan_id:form.plan_id,due_at:fromInput(form.due_at),depends_on:form.depends_on.map(id=>({id}))}]});return}
    const patch={}
    if(form.title!==editing.title)patch.title=form.title
    if(tab!=='schedules'){
      if(form.description!==(editing.description||''))patch.description=form.description
      if(form.due_at!==dateInput(editing.due_at))patch.due_at=fromInput(form.due_at)
      if(form.status!==editing.status)patch.status=form.status
    }
    if(tab==='plans'){
      if(form.start_at!==dateInput(editing.start_at))patch.start_at=fromInput(form.start_at)
      if(Number(form.priority)!==editing.priority)patch.priority=Number(form.priority)
    } else if(tab==='tasks'){
      if(JSON.stringify([...form.depends_on].sort())!==JSON.stringify([...(editing.depends_on??[])].sort()))patch.depends_on=form.depends_on
    } else {
      if(form.start_at!==dateInput(editing.start_at))patch.start_at=fromInput(form.start_at)
      if(form.all_day!==Boolean(editing.all_day))patch.all_day=form.all_day
      if(!form.all_day&&form.end_at!==dateInput(editing.end_at))patch.end_at=fromInput(form.end_at)
      if(form.plan_id!==(editing.plan_id||'')||form.task_id!==(editing.task_id||'')){patch.plan_id=form.plan_id||null;patch.task_id=form.task_id||null}
    }
    if(!Object.keys(patch).length){setError('没有需要保存的修改');return}
    act('update',editing,patch)
  }
  const active=allTasks.filter(t=>t.plan_id===planId&&!ended(t.status))
  function reorder(record,direction){const ids=active.map(t=>t.id),index=ids.indexOf(record.id),next=index+direction;if(index<0||next<0||next>=ids.length)return;[ids[index],ids[next]]=[ids[next],ids[index]];submit({operation:'update',reorder:{plan_id:planId,task_ids:ids}})}
  const options=tab==='plans'?[['active','未结束'],['all','全部'],['todo','待办'],['doing','进行中'],['done','已完成'],['cancelled','已取消']]:tab==='tasks'?[['all','全部'],['active','未结束'],['todo','待办'],['doing','进行中'],['blocked','人工阻塞'],['done','已完成'],['cancelled','已取消']]:[['all','全部'],['scheduled','已安排'],['completed','已完成'],['cancelled','已取消']]
  const items=data?(tab==='plans'?data.plans:tab==='tasks'?data.project_tasks:data.schedules)??[]:[]
  const set=(key,value)=>setForm(old=>({...old,[key]:value}))
  const field=(label,key,type='text')=><label className="flex flex-col gap-1 text-sm">{label}<input required={key==='title'} className={INPUT} type={type} value={form[key]??''} onChange={e=>set(key,e.target.value)}/></label>
  return <section className="site-glass-card planning-page"><div className="planning-head flex flex-wrap items-center justify-between gap-3"><h1 className="planning-title">规划</h1><Link className="btn-primary" to="/agent">让 agent 安排</Link></div>
    <div className="view-switch mt-4">{[['plans','计划'],['tasks','子任务'],['schedules','日程']].map(([key,label])=><button type="button" key={key} className={tab===key?'active':''} onClick={()=>switchTab(key)}>{label}</button>)}</div>
    <div className="planning-toolbar mt-4 flex flex-wrap items-end gap-3"><label className="flex flex-col gap-1 text-xs">关键词<input className={INPUT} value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索标题或说明"/></label><label className="flex flex-col gap-1 text-xs">状态<select className={INPUT} value={status} onChange={e=>setStatus(e.target.value)}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">所属计划<select className={INPUT} value={planId} onChange={e=>{setEditing(null);const next=new URLSearchParams(params);e.target.value?next.set('plan',e.target.value):next.delete('plan');setParams(next)}}><option value="">全部计划</option>{allPlans.map(p=><option key={p.id} value={p.id}>{p.title} · {LABELS[p.status]}</option>)}</select></label>
      {tab==='schedules'?<><label className="flex flex-col gap-1 text-xs">日期<input type="date" className={INPUT} value={date} onChange={e=>setDate(e.target.value)}/></label><button className="btn-ghost" onClick={()=>setDate('')}>全部日期</button><button className="btn-ghost" onClick={()=>setDate(today())}>今天</button></>:null}<button className="btn-ghost" onClick={()=>setRetry(v=>v+1)}>刷新</button>
      {tab==='tasks'?<button className="btn-primary" disabled={!canWrite||busy||loading} onClick={newTask}>新增子任务</button>:null}
    </div>
    {error?<p className="error-bar mt-4" role="alert">{error}</p>:null}{loading?<p className="loading">正在读取规划…</p>:error?null:<><p className="planning-source mt-4 text-xs text-slate-500">当前筛选 {items.length} 条</p>{items.length?<ul className="planning-list mt-3 flex flex-col gap-3">{items.map(record=><li key={record.id} className={`${CLASS} planning-item`}>
      <div className="flex justify-between gap-3"><strong>{record.title}</strong><span className="text-xs">{LABELS[record.status]}</span></div>
      {tab==='plans'?<><p className="whitespace-pre-wrap text-sm">{record.description}</p><p className="text-xs">开始 {fmt(record.start_at)} · 截止 {fmt(record.due_at)}</p><Link className="text-sm text-brand" to={`/planning?tab=tasks&plan=${encodeURIComponent(record.id)}`}>查看子任务</Link></>:tab==='tasks'?<><p className="whitespace-pre-wrap text-sm">{record.description}</p><p className="text-xs">所属计划：{planTitle(record.plan_id)} · 截止 {fmt(record.due_at)}{record.due_at&&!ended(record.status)&&new Date(record.due_at)<new Date()?' · 已逾期':''}</p><p className="text-xs">前置：{record.depends_on?.map(taskTitle).join('、')||'无'} · {record.dependency_state?.satisfied?'前置已满足':'等待前置任务'}</p></>:<><p className="text-xs">{record.all_day?'全天 · ':''}{fmt(record.start_at)} — {fmt(record.end_at)} · {{upcoming:'未开始',ongoing:'进行中',ended:'已结束'}[record.time_state]}</p><p className="text-xs">所属计划：{planTitle(record.plan_id)} · 子任务：{taskTitle(record.task_id)}</p></>}
      {record.completed_at?<p className="text-xs">完成于 {fmt(record.completed_at)}</p>:null}<p className="mt-1 text-xs text-slate-400">更新时间：{fmt(record.updated_at)}</p>
      {!ended(record.status)?<div className="mt-3 flex flex-wrap gap-2"><button className="btn-ghost" disabled={!canWrite||busy} onClick={()=>openEdit(record)}>编辑</button><button className="btn-ghost" disabled={!canWrite||busy||(tab==='tasks'&&(record.status==='blocked'||!record.dependency_state?.satisfied))} onClick={()=>act('complete',record)}>标记完成</button><button className="btn-ghost" disabled={!canWrite||busy} onClick={()=>act('cancel',record)}>取消安排</button>{tab==='tasks'&&planId&&!q&&(!status||['all','active'].includes(status))?[-1,1].map(dir=><button className="btn-ghost" key={dir} disabled={!canWrite||busy||active.length>50||active.findIndex(t=>t.id===record.id)+dir<0||active.findIndex(t=>t.id===record.id)+dir>=active.length} onClick={()=>reorder(record,dir)}>{dir<0?'上移':'下移'}（生成草案）</button>):null}</div>:<p className="mt-2 text-xs text-slate-400">历史记录保留，可由 agent 查询。</p>}
    </li>)}</ul>:<p className="mt-6 text-center text-sm text-slate-400">当前筛选下没有记录。可调整筛选，或让 agent 生成安排。</p>}</>}
    {editing?<form className={`${CLASS} mt-5 flex flex-col gap-3`} onSubmit={saveEdit}><h2 className="font-bold">{editing.new?'新增子任务':`编辑《${editing.title}》`}</h2>{field('标题','title')}
      {tab!=='schedules'?<><label className="flex flex-col gap-1 text-sm">说明<textarea className={INPUT} value={form.description} onChange={e=>set('description',e.target.value)}/></label>{field('截止时间','due_at','datetime-local')}{tab==='plans'?<>{field('开始时间','start_at','datetime-local')}{field('优先级','priority','number')}</>:null}{!editing.new?<label>状态<select className={INPUT} value={form.status} onChange={e=>set('status',e.target.value)}>{['todo','doing',...(tab==='tasks'?['blocked']:[])].map(v=><option key={v} value={v}>{LABELS[v]}</option>)}</select></label>:null}</>:<>{field('开始时间','start_at','datetime-local')}<label><input type="checkbox" checked={form.all_day} onChange={e=>set('all_day',e.target.checked)}/> 全天日程</label>{!form.all_day?field('结束时间','end_at','datetime-local'):null}</>}
      {(tab==='schedules'||editing.new)?<label className="flex flex-col gap-1 text-sm">所属计划<select required={editing.new} className={INPUT} value={form.plan_id} onChange={e=>setForm(old=>({...old,plan_id:e.target.value,task_id:'',depends_on:[]}))}><option value="">{editing.new?'请选择计划':'独立日程'}</option>{allPlans.filter(p=>!ended(p.status)||p.id===form.plan_id).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>:null}
      {tab==='tasks'?<label className="flex flex-col gap-1 text-sm">前置任务<select multiple className={INPUT} value={form.depends_on} onChange={e=>set('depends_on',Array.from(e.target.selectedOptions,o=>o.value))}>{allTasks.filter(t=>t.plan_id===form.plan_id&&t.id!==editing.id).map(t=><option key={t.id} value={t.id}>{t.title} · {LABELS[t.status]}</option>)}</select></label>:null}
      {tab==='schedules'&&form.plan_id?<label className="flex flex-col gap-1 text-sm">关联子任务<select className={INPUT} value={form.task_id} onChange={e=>set('task_id',e.target.value)}><option value="">直接关联计划</option>{allTasks.filter(t=>t.plan_id===form.plan_id&&(!ended(t.status)||t.id===form.task_id)).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>:null}
      <div className="flex gap-2"><button className="btn-primary" type="submit" disabled={!canWrite||busy}>生成修改草案</button><button className="btn-ghost" type="button" onClick={()=>setEditing(null)}>关闭编辑</button></div>
    </form>:null}
  </section>
}
