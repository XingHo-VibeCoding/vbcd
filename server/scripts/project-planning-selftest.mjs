// 全链路只使用临时 PostgreSQL 和临时 DATA_DIR，不读取或迁移真实数据。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
const container = `buddy-project-test-${process.pid}-${Date.now()}`
const docker = (args, input) => execFileSync('docker', args, { encoding:'utf8', input, stdio:['pipe','pipe','pipe'] })
let started = false, appServer, closePool, n = 0
const dir = await mkdtemp(path.join(tmpdir(), 'buddy-project-'))
const verify = async (name, work) => { await work(); console.log(`✅ T${++n} ${name}`) }
try {
  docker(['run','-d','--pull=never','--rm','--name',container,'-e','POSTGRES_USER=tester','-e','POSTGRES_PASSWORD=local-test-only','-e','POSTGRES_DB=project_test','-p','127.0.0.1::5432','postgres:18-alpine']); started = true
  let ready = false
  for(let i=0;i<100;i++){try{docker(['exec',container,'psql','-X','-h','127.0.0.1','-U','tester','-d','project_test','-c','SELECT 1']);ready=true;break}catch{await new Promise(r=>setTimeout(r,100))}}
  assert(ready)
  const sql = text => docker(['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','tester','-d','project_test'],text)
  const migration = await readFile(new URL('../../db/migrations/004_project_tasks.sql',import.meta.url),'utf8')
  sql(await readFile(new URL('../../db/schema.sql',import.meta.url),'utf8'))
  sql(await readFile(new URL('../../db/migrations/002_planning.sql',import.meta.url),'utf8'))
  sql("INSERT INTO plans(id,title) VALUES('old','旧计划'); INSERT INTO schedules(id,plan_id,title,start_at,end_at) VALUES('old-schedule','old','旧安排','2027-01-01T00:00Z','2027-01-01T01:00Z');")
  const oldRows = sql('SELECT md5(to_jsonb(s)::text) FROM schedules s;')
  const oldPlans = sql('SELECT md5(to_jsonb(p)::text) FROM plans p;')
  sql(migration); sql(migration)
  const port = docker(['port',container,'5432/tcp']).trim().split(':').at(-1)
  Object.assign(process.env,{ DATABASE_URL:`postgres://tester:local-test-only@127.0.0.1:${port}/project_test`, DATA_DIR:dir, AUTH_ENABLED:'0',AUTH_WRITE_REQUIRED:'1', PASSWORD_HASH:bcrypt.hashSync('test-password',4),OPENAI_API_KEY:'',CHROMA_URL:'',ASR_SERVICE_URL:'',GITHUB_USERNAME:'',IMA_OPENAPI_CLIENTID:'',IMA_OPENAPI_APIKEY:'' })
  const db = await import('../src/db/pool.js'); closePool=db.closePool
  const {query}=db
  const {proposePlanning,getPlanning}=await import('../src/services/planning.js')
  const {proposePlanningTool}=await import('../src/services/agent/tools/propose-planning.js')
  const {getPlanningTool}=await import('../src/services/agent/tools/get-planning.js')
  const {createApp}=await import('../src/app.js');appServer=createApp().listen(0,'127.0.0.1');await new Promise(r=>appServer.once('listening',r))
  const base=`http://127.0.0.1:${appServer.address().port}`
  let cookie=''
  const api=async(method,url,body,auth=true)=>{const res=await fetch(base+url,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(auth&&cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:res.status,cookie:res.headers.get('set-cookie'),...(res.status===204?{}:await res.json())}}
  const send=(draft,decision='approved',auth=true)=>api('PATCH',`/api/planning/drafts/${draft.id}`,{decision,review_token:draft.review_token},auth)
  const approve=async input=>{const draft=await proposePlanning(input);const r=await send(draft);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.status,'approved',JSON.stringify(r));return r.data}
  const task=async id=>(await getPlanning({type:'project_task',id})).item
  const change=(id,operation,patch)=>({operation,target:{type:'project_task',id},...(patch?{patch}:{})})
  const counts=async()=>(await query(`SELECT (SELECT count(*)::int FROM plans) AS plans,(SELECT count(*)::int FROM project_task_dependencies) AS dependencies,(SELECT count(*)::int FROM project_tasks) AS tasks,(SELECT count(*)::int FROM schedules) AS schedules,(SELECT count(*)::int FROM planning_changes) AS changes`))[0]
  const time={start_at:'2027-02-01T08:00:00+08:00',end_at:'2027-02-01T09:00:00+08:00'}
  await verify('迁移重复执行，旧日程字段/ID保留且新关联为空',async()=>{const row=(await query("SELECT * FROM schedules WHERE id='old-schedule'"))[0];assert.equal(row.plan_id,'old');assert.equal(row.task_id,null);assert.equal(sql("SELECT md5((to_jsonb(s)-'task_id')::text) FROM schedules s;"),oldRows);assert.equal(sql('SELECT md5(to_jsonb(p)::text) FROM plans p;'),oldPlans);assert.equal(row.status,'scheduled')})
  await verify('游客公开读、禁写及禁确认；登录可确认',async()=>{assert.equal((await api('GET','/api/planning',undefined,false)).status,200);assert.equal((await api('POST','/api/planning/drafts',{plan:{title:'游客写'}},false)).status,401);const r=await api('POST','/api/login',{password:'test-password'});assert.equal(r.status,200);cookie=r.cookie.split(';')[0]})
  let root,a,b,c,scheduled
  await verify('Agent一次草案创建Plan/Task/依赖/日程，确认前零业务写入',async()=>{
    const before=await counts()
    const r=JSON.parse(await proposePlanningTool().invoke({plan:{title:'项目链路'},project_tasks:[{ref:'a',title:'前置任务'},{ref:'b',title:'后继任务',due_at:'2027-03-01T00:00:00Z',depends_on:[{ref:'a'}]},{ref:'c',title:'第三任务'}],schedules:[{title:'分次执行',task_ref:'b',...time},{title:'独立安排',plan_id:null,start_at:'2027-02-02T00:00Z',end_at:'2027-02-02T01:00Z'}]}))
    assert.deepEqual(await counts(),before);assert.equal((await send(r.draft,'approved',false)).status,401)
    const saved=await send(r.draft);assert.equal(saved.data.status,'approved',JSON.stringify(saved));root=saved.data.created.plan_id;({a,b,c}=saved.data.created.task_ids_by_ref);scheduled=saved.data.created.schedule_ids[0]
    assert.deepEqual((await task(b)).depends_on,[a]);assert.equal((await getPlanning({type:'schedule',id:scheduled})).project_tasks[0].id,b)
    const again=await send(r.draft);assert.deepEqual(again.data.created,saved.data.created)
  })
  await verify('依赖未满足不能启动/完成；状态与截止格式强校验',async()=>{await assert.rejects(proposePlanning(change(b,'complete')),{code:'VALIDATION_FAILED'});await assert.rejects(proposePlanning(change(b,'update',{status:'doing'})),{code:'VALIDATION_FAILED'});await assert.rejects(proposePlanning(change(b,'update',{due_at:'2027-01-01'})),{code:'VALIDATION_FAILED'});await assert.rejects(proposePlanning({project_tasks:[{ref:'x',title:' ',plan_id:root}]}),{code:'VALIDATION_FAILED'})})
  await verify('拒绝任务变更不改业务与审计',async()=>{const before=await counts();const draft=await proposePlanning(change(a,'complete'));await send(draft,'rejected');assert.deepEqual(await counts(),before);assert.equal((await task(a)).status,'todo')})
  await verify('完成前置、人工阻塞须解除；完成Task不自动取消日程',async()=>{
    await approve(change(a,'complete'));await approve(change(b,'update',{status:'blocked'}));await assert.rejects(proposePlanning(change(b,'complete')),{code:'VALIDATION_FAILED'});await approve(change(b,'update',{status:'doing'}));await approve(change(b,'complete'))
    assert.equal((await task(b)).status,'done');assert((await task(b)).completed_at);assert.equal((await getPlanning({type:'schedule',id:scheduled})).item.status,'scheduled');await assert.rejects(proposePlanning(change(b,'update',{title:'改终态'})),{code:'VALIDATION_FAILED'})
  })
  let d,e
  await verify('尾部追加及活跃列表重排，终态排序保持',async()=>{const r=await approve({project_tasks:[{ref:'d',title:'第四任务',plan_id:root},{ref:'e',title:'第五任务',plan_id:root}]});({d,e}=r.created.task_ids_by_ref);const old=await task(a);await approve({operation:'update',reorder:{plan_id:root,task_ids:[e,d,c]}});assert.equal((await task(e)).position,0);assert.equal((await task(a)).position,old.position);await assert.rejects(proposePlanning({operation:'update',reorder:{plan_id:root,task_ids:[e,d]}}),{code:'VALIDATION_FAILED'})})
  await verify('过期依赖快照先409重审，无批准事实',async()=>{const draft=await proposePlanning(change(d,'update',{description:'等待确认'}));await approve(change(e,'update',{description:'改变快照'}));const r=await send(draft);assert.equal(r.status,409);assert.equal(r.data.confirmation.decision,null);assert.equal((await task(d)).description,'');assert.equal((await send(r.data)).data.status,'approved')})
  await verify('相反并发依赖最多一份成功，最终无环',async()=>{const x=await proposePlanning(change(d,'update',{depends_on:[e]})), y=await proposePlanning(change(e,'update',{depends_on:[d]}));const rs=await Promise.all([send(x),send(y)]);assert.equal(rs.filter(r=>r.status===200&&r.data.status==='approved').length,1);assert(!((await task(d)).depends_on.includes(e)&&(await task(e)).depends_on.includes(d)))})
  await verify('数据库拒绝跨Plan关联、自依赖、重复依赖与删除Plan',async()=>{
    const other=await approve({plan:{title:'另一计划'},project_tasks:[{ref:'o',title:'另一任务'}]});const o=other.created.task_ids_by_ref.o
    await assert.rejects(query('INSERT INTO project_task_dependencies VALUES($1,$2,$3)',[root,c,o]));await assert.rejects(query('INSERT INTO project_task_dependencies VALUES($1,$2,$2)',[root,c]));await assert.rejects(query('DELETE FROM plans WHERE id=$1',[root]));await assert.rejects(query('UPDATE schedules SET task_id=$1 WHERE id=$2',[o,scheduled]))
    const before=await counts();await assert.rejects(proposePlanning({schedules:[{title:'非法关联',plan_id:root,task_id:o,...time}]}),{code:'VALIDATION_FAILED'});assert.deepEqual(await counts(),before)
  })
  await verify('依赖写入或审计失败：业务全撤销但批准事实保留',async()=>{
    await query(`CREATE FUNCTION fail_project_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.object_type='project_task' THEN RAISE EXCEPTION 'test-only'; END IF; RETURN NEW; END $$`);await query('CREATE TRIGGER fail_project_audit BEFORE INSERT ON planning_changes FOR EACH ROW EXECUTE FUNCTION fail_project_audit()')
    const before=await counts();const draft=await proposePlanning({project_tasks:[{ref:'bad',title:'不会保留',plan_id:root}]});const r=await send(draft);assert.equal(r.data.status,'failed');assert.equal(r.data.confirmation.decision,'approved');assert.deepEqual(await counts(),before);assert.equal((await send(draft)).data.status,'failed');await query('DROP TRIGGER fail_project_audit ON planning_changes');await query('DROP FUNCTION fail_project_audit()')
  })
  await verify('查询筛选保留日程父任务上下文，日期不隐藏未排期Task',async()=>{const r=JSON.parse(await getPlanningTool().invoke({plan_id:root,task_status:'todo',q:'分次执行'}));assert.equal(r.schedules[0].id,scheduled);assert.equal(r.project_tasks.length,0);assert.equal(r.related.project_tasks[0].id,b);const date=await getPlanning({planId:root,from:'2030-01-01T00:00Z',to:'2030-01-02T00:00Z'});assert(date.project_tasks.some(t=>t.id===c));assert.equal(date.schedules.length,0)})
  let edge, f, g, h, edgeSchedule
  await verify('前向ref正确解析；来源和截止独立于排期，未知字段不吞掉',async()=>{
    const result=JSON.parse(await proposePlanningTool().invoke({plan:{title:'边界验证'},project_tasks:[{ref:'f',title:'先声明后继',depends_on:[{ref:'g'}],due_at:'2027-04-01T00:00:00Z'},{ref:'g',title:'后声明前置'},{ref:'h',title:'无依赖'}],schedules:[{title:'边界安排',task_ref:'h',start_at:'2027-04-01T00:00Z',end_at:'2027-04-01T01:00Z'}]}))
    const saved=await send(result.draft);assert.equal(saved.data.status,'approved');edge=saved.data.created.plan_id;({f,g,h}=saved.data.created.task_ids_by_ref);edgeSchedule=saved.data.created.schedule_ids[0]
    assert.deepEqual((await task(f)).depends_on,[g]);assert.equal((await task(f)).source,'agent');assert.equal((await getPlanning({type:'project_task',id:f})).schedules.length,0)
    await assert.rejects(proposePlanning({project_tasks:[{ref:'no',title:'没有计划'}]}),{code:'VALIDATION_FAILED'});await assert.rejects(proposePlanning(change(h,'update',{position:10})),{code:'VALIDATION_FAILED'})
  })
  await verify('批量编辑按最终图校验，doing新增未完成依赖须明确退回',async()=>{
    await approve(change(h,'update',{status:'doing'}));await assert.rejects(proposePlanning(change(h,'update',{depends_on:[g]})),{code:'VALIDATION_FAILED'})
    await approve({operation:'update',changes:[{action:'update',target:{type:'project_task',id:h},patch:{status:'todo',depends_on:[g]}},{action:'update',target:{type:'project_task',id:g},patch:{description:'批量说明'}}]});assert.deepEqual((await task(h)).depends_on,[g]);assert.equal((await task(h)).status,'todo')
  })
  await verify('日程解绑必须原子清空，错误组合零业务写入',async()=>{
    const before=await counts();await assert.rejects(proposePlanning({operation:'update',target:{type:'schedule',id:edgeSchedule},patch:{plan_id:null}}),{code:'VALIDATION_FAILED'});assert.deepEqual(await counts(),before)
    await approve({operation:'update',target:{type:'schedule',id:edgeSchedule},patch:{task_id:null,plan_id:null}});const r=(await getPlanning({type:'schedule',id:edgeSchedule})).item;assert.equal(r.task_id,null);assert.equal(r.plan_id,null)
  })
  await verify('重排成员过期先重审；同决定幂等，反向决定冲突',async()=>{
    const draft=await proposePlanning({operation:'update',reorder:{plan_id:edge,task_ids:[h,g,f]}});await approve(change(g,'update',{description:'排序后变化'}));const r=await send(draft);assert.equal(r.status,409);assert.equal(r.data.confirmation.decision,null);assert.equal((await send(r.data)).data.status,'approved');const before=await counts();assert.equal((await send(r.data)).data.status,'approved');assert.deepEqual(await counts(),before);assert.equal((await send(r.data,'rejected')).status,409)
  })
  await verify('取消前置不自动解锁或改写后继；非正常依赖输入被拒绝',async()=>{
    await approve(change(g,'cancel'));assert.equal((await task(f)).status,'todo');await assert.rejects(proposePlanning(change(f,'complete')),{code:'VALIDATION_FAILED'});await assert.rejects(proposePlanning(change(f,'update',{depends_on:[f]})),{code:'VALIDATION_FAILED'});await assert.rejects(proposePlanning(change(h,'update',{depends_on:[f,f]})),{code:'VALIDATION_FAILED'})
  })
  await verify('草案生成后Plan结束，旧新增草案不被批准或部分保存',async()=>{
    const draft=await proposePlanning({project_tasks:[{ref:'later',title:'过期新增',plan_id:edge}]});await approve({operation:'complete',target:{type:'plan',id:edge}});const before=await counts();assert.equal((await send(draft)).status,400);assert.deepEqual(await counts(),before);const reread=await api('GET',`/api/planning/drafts/${draft.id}`);assert.equal(reread.data.confirmation.decision,null)
  })
  await verify('终态Plan不能新增Task，原Task可继续完成不重开Plan',async()=>{await approve({operation:'complete',target:{type:'plan',id:root}});await assert.rejects(proposePlanning({project_tasks:[{ref:'no',title:'禁止新增',plan_id:root}]}),{code:'VALIDATION_FAILED'});await approve(change(c,'complete'));assert.equal((await getPlanning({type:'plan',id:root})).item.status,'done')})
  await verify('隔离备份恢复后Task/依赖/日程与决定记录一致',async()=>{
    const backup=docker(['exec',container,'pg_dump','-U','tester','-d','project_test'])
    sql('CREATE DATABASE project_restore;')
    docker(['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','tester','-d','project_restore'],backup)
    const summary="SELECT json_build_array((SELECT count(*) FROM project_tasks),(SELECT count(*) FROM project_task_dependencies),(SELECT count(*) FROM schedules),(SELECT count(*) FROM confirmations),(SELECT count(*) FROM planning_changes));"
    const original=docker(['exec',container,'psql','-X','-At','-U','tester','-d','project_test','-c',summary])
    const recovered=docker(['exec',container,'psql','-X','-At','-U','tester','-d','project_restore','-c',summary]);assert.equal(recovered,original)
  })
  await verify('退出登录后的旧确认凭据无写权限',async()=>{const draft=await proposePlanning(change(d,'cancel'));const before=await counts();assert.equal((await api('POST','/api/logout')).status,204);assert.equal((await send(draft)).status,401);assert.deepEqual(await counts(),before)})
  if (process.argv.includes('--browser')) {
    const login=await api('POST','/api/login',{password:'test-password'});cookie=login.cookie.split(';')[0]
    const fixture=await approve({plan:{title:'浏览器测试项目'},project_tasks:[{ref:'ui1',title:'浏览器前置'},{ref:'ui2',title:'浏览器后继',depends_on:[{ref:'ui1'}]}]})
    const {createServer}=await import('../../web/node_modules/vite/dist/node/index.js')
    const {fileURLToPath}=await import('node:url'),{spawn}=await import('node:child_process')
    const vite=await createServer({root:fileURLToPath(new URL('../../web/',import.meta.url)),server:{host:'127.0.0.1',port:0,proxy:{'/api':base}}})
    try {
      await vite.listen()
      const url=`http://127.0.0.1:${vite.httpServer.address().port}`
      await new Promise((resolve,reject)=>{
        const child=spawn('/home/bird/.venv/bin/python',[fileURLToPath(new URL('./project-planning-browser.py',import.meta.url)),url,fixture.created.plan_id],{stdio:'inherit'})
        child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`浏览器验收失败 code=${code}`)))
      })
    } finally { await vite.close() }
  }
  console.log(`ProjectTask 专项：${n}/${n} 通过（独立 PostgreSQL，临时数据退出即清理）`)
} finally {
  if(appServer) await new Promise(r=>appServer.close(r))
  if(closePool) await closePool()
  if(started) docker(['rm','-f',container])
  await rm(dir,{recursive:true,force:true})
}
