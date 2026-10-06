// 云端知识库只读视图（F15 / SPEC 3.6）+ ima 笔记只读列表（F15b / SPEC 3.7）：档案页 /notes?src=ima 的内容区。
// 地址栏即状态：?src=ima&kb=<id>&folder=<id>&q=<词>&panel=notes —— 刷新 / 分享 / 前进后退都能还原。
// 四种形态：
//   ① 未选库未搜词      → 列知识库卡片（名称 / 描述 / 条目数）+ 末尾一张「笔记」入口卡片
//   ② 选库未搜词        → 浏览条目：文件与文件夹混排，文件夹可下钻，「加载更多」续页
//   ③ 搜词              → 库内搜索；未选库时对全部库并发扇出（上限 4），按库分组、标 truncated
//   ④ panel=notes       → ima 笔记列表（只读；详情走 /notes/ima/:docid 独立路由）
// 只读：知识库条目没有正文接口，只显示标题与命中片段，不跳详情；笔记有正文（另一个模块），在详情页渲染。
// 未配 Key（503 IMA_NOT_CONFIGURED）不算错误态：显示说明文字引导去 server/.env 配凭据。
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { listImaKbs, listImaItems, searchImaKb, listImaNotes } from '../api/ima.js'
import StateBlock from './StateBlock.jsx'

const FANOUT_CONCURRENCY = 4 // 跨库扇出并发上限
const PAGE_LIMIT = 20 // 每页条数（ima limit 上限 50）

/** 写地址栏时丢弃空值，保持 URL 干净（?src=ima 而不是 ?src=ima&kb=&q=） */
function cleanParams(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''))
}

// 档案列表同款摘要：压掉所有空白、120 字截断加「…」（与后端 storage/files.js 的 excerptOf 同口径）
function excerptOf(text, len = 120) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  return flat.length > len ? `${flat.slice(0, len)}…` : flat
}

// 毫秒时间戳 → YYYY-MM-DD（本地时区），观感对齐档案列表行的日期
function fmtDate(ms) {
  const d = new Date(Number(ms))
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function ImaPanel() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const kbId = searchParams.get('kb') || ''
  const folderId = searchParams.get('folder') || ''
  const q = (searchParams.get('q') || '').trim()
  // F15b：panel=notes 时整页换成笔记列表（与知识库三种形态并列，互斥）
  const panel = searchParams.get('panel') === 'notes' ? 'notes' : ''

  const [qDraft, setQDraft] = useState(q)
  const debounceRef = useRef(null)

  const [kbs, setKbs] = useState(null) // null=载入中；未配置时保持 null 且 configured=false
  const [kbsError, setKbsError] = useState('')
  const [configured, setConfigured] = useState(true)

  // groups 统一承载「浏览单库」与「搜索多库」：每组一个库的条目 + 续页信息
  const [groups, setGroups] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retryTick, setRetryTick] = useState(0)

  // F15b · ima 笔记：进入云端就拉一次（首页卡片的「N 篇」也靠它），续页信息独立存
  const [notes, setNotes] = useState(null) // null=还没拉到
  const [notesError, setNotesError] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)
  const [notesNext, setNotesNext] = useState({ cursor: '', hasMore: false })

  const loginRedirect = () =>
    navigate(`/login?from=${encodeURIComponent('/notes?src=ima')}`, { replace: true })

  // 知识库列表：进来先拉一次；未配置 / 401 在这里就分流掉
  useEffect(() => {
    if (!configured) return
    listImaKbs({ limit: 50 })
      .then((d) => setKbs(d.items))
      .catch((err) => {
        if (err.code === 'AUTH_REQUIRED') return loginRedirect()
        if (err.code === 'IMA_NOT_CONFIGURED') return setConfigured(false)
        setKbsError(err.message || '加载失败')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, retryTick, navigate])

  // 地址栏的 q 变化（前进后退/清词）同步回输入框
  useEffect(() => {
    setQDraft(q)
  }, [q])

  // F15b · 笔记列表：与库列表并行拉；失败不连累知识库视图（卡片只失去篇数）
  useEffect(() => {
    if (!configured) return
    let cancelled = false
    setNotesLoading(true)
    setNotesError('')
    listImaNotes()
      .then((d) => {
        if (cancelled) return
        setNotes(d.items)
        setNotesNext({ cursor: d.next_cursor, hasMore: d.has_more })
      })
      .catch((err) => {
        if (cancelled) return
        if (err.code === 'AUTH_REQUIRED') return loginRedirect()
        if (err.code === 'IMA_NOT_CONFIGURED') return setConfigured(false)
        setNotesError(err.message || '加载失败')
        setNotes([])
      })
      .finally(() => {
        if (!cancelled) setNotesLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, retryTick, navigate])

  /** 笔记「加载更多」：ima 单页最多 20 条，超了才用得着 */
  async function loadMoreNotes() {
    if (!notesNext.hasMore || notesLoading) return
    setNotesLoading(true)
    try {
      const d = await listImaNotes({ cursor: notesNext.cursor })
      setNotes((prev) => [...(prev ?? []), ...d.items])
      setNotesNext({ cursor: d.next_cursor, hasMore: d.has_more })
    } catch (e) {
      setNotesError(e.message || '加载失败')
    } finally {
      setNotesLoading(false)
    }
  }

  // 主数据流：参数（kb/folder/q）变化就重取；搜索用扇出，浏览用单库
  useEffect(() => {
    if (!configured || !kbs) return
    if (!q && !kbId) {
      // 形态①：只需库列表，groups 置空
      setGroups(null)
      setLoading(false)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    const run = async () => {
      try {
        if (q) {
          // 形态③：选了库查单库，没选库扇出全部库；结果按库顺序排回
          const targets = kbId ? kbs.filter((k) => k.id === kbId) : kbs
          const order = new Map(targets.map((k, i) => [k.id, i]))
          const acc = []
          let idx = 0
          await Promise.all(
            Array.from({ length: Math.min(FANOUT_CONCURRENCY, targets.length) }, async () => {
              while (idx < targets.length) {
                const kb = targets[idx++]
                try {
                  const d = await searchImaKb({ kb_id: kb.id, q })
                  acc.push({
                    kbId: kb.id, kbName: kb.name, items: d.items,
                    truncated: d.truncated, nextCursor: d.next_cursor, hasMore: d.has_more, error: '',
                  })
                } catch (e) {
                  acc.push({ kbId: kb.id, kbName: kb.name, items: [], truncated: false, nextCursor: '', hasMore: false, error: e.message || '搜索失败' })
                }
              }
            }),
          )
          acc.sort((a, b) => order.get(a.kbId) - order.get(b.kbId))
          if (!cancelled) setGroups(acc)
        } else {
          // 形态②：单库浏览（folder 下钻时 folder_id 进参）
          const d = await listImaItems({ kb_id: kbId, folder_id: folderId })
          const kb = kbs.find((k) => k.id === kbId)
          if (!cancelled) {
            setGroups([{
              kbId, kbName: kb?.name || '知识库', items: d.items,
              truncated: false, nextCursor: d.next_cursor, hasMore: d.has_more,
              error: '', currentPath: d.current_path ?? [],
            }])
          }
        }
      } catch (err) {
        if (cancelled) return
        if (err.code === 'AUTH_REQUIRED') return loginRedirect()
        if (err.code === 'IMA_NOT_CONFIGURED') return setConfigured(false)
        setError(err.message || '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, kbs, kbId, folderId, q, retryTick, navigate])

  /** 「加载更多」：对某组按它自己的 nextCursor 续一页并追加 */
  async function loadMore(groupIdx) {
    const g = groups[groupIdx]
    if (!g?.hasMore || g.loadingMore) return
    setGroups((prev) => prev.map((x, i) => (i === groupIdx ? { ...x, loadingMore: true } : x)))
    try {
      const d = q
        ? await searchImaKb({ kb_id: g.kbId, q, cursor: g.nextCursor })
        : await listImaItems({ kb_id: g.kbId, folder_id: folderId, cursor: g.nextCursor })
      setGroups((prev) =>
        prev.map((x, i) =>
          i === groupIdx
            ? { ...x, items: [...x.items, ...d.items], nextCursor: d.next_cursor, hasMore: d.has_more, loadingMore: false }
            : x,
        ),
      )
    } catch (e) {
      setGroups((prev) => prev.map((x, i) => (i === groupIdx ? { ...x, loadingMore: false, error: e.message || '加载失败' } : x)))
    }
  }

  // ---------- 未配置：说明性空态（不是报错条） ----------
  if (!configured) {
    return (
      <div className="empty">
        ima 未配置：请在 <code>server/.env</code> 填 <code>IMA_OPENAPI_CLIENTID</code> 与{' '}
        <code>IMA_OPENAPI_APIKEY</code>（到 ima.qq.com/agent-interface 自建），重启后端后回来。
      </div>
    )
  }

  // ---------- 形态④：ima 笔记列表（?src=ima&panel=notes） ----------
  // 与知识库形态互斥；列表行照抄档案列表（标题 → 摘要 → 徽标+日期），详情走独立路由。
  if (panel === 'notes') {
    const nstate = notesError ? 'error' : notes === null ? 'loading' : notes.length === 0 ? 'empty' : 'ok'
    return (
      <div>
        <nav className="meta" aria-label="云端视图位置">
          <button type="button" className="btn-ghost" onClick={() => setSearchParams({ src: 'ima' })}>
            ← 云端
          </button>
          <span> / 笔记</span>
        </nav>
        <StateBlock
          state={nstate}
          errorText={notesError || '加载失败'}
          onRetry={() => setRetryTick((t) => t + 1)}
          emptyText="你的 ima 笔记里还没有内容"
        >
          <ul className="note-list">
            {(notes ?? []).map((n) => (
              <li key={n.id} className="note-item">
                <Link to={`/notes/ima/${encodeURIComponent(n.id)}`}>
                  <div className="note-item-title">{n.title}</div>
                  {n.summary ? <div className="note-item-excerpt">{excerptOf(n.summary)}</div> : null}
                  <div className="note-item-meta">
                    <span className="badge">笔记</span>
                    {n.updated_at ? <span>{fmtDate(n.updated_at)}</span> : null}
                    {n.folder_name ? <span>{n.folder_name}</span> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {notesNext.hasMore ? (
            <button type="button" className="btn-ghost" disabled={notesLoading} onClick={loadMoreNotes}>
              {notesLoading ? '加载中…' : '加载更多'}
            </button>
          ) : null}
        </StateBlock>
      </div>
    )
  }

  // ---------- 形态与四态判定 ----------
  const inBrowse = !q && Boolean(kbId)
  const inSearch = Boolean(q)
  const inHome = !q && !kbId

  let state
  if (inHome) {
    // 首页形态看库列表自己的状态
    state = kbsError ? 'error' : kbs === null ? 'loading' : kbs.length === 0 ? 'empty' : 'ok'
  } else {
    const hits = groups?.reduce((n, g) => n + g.items.length, 0) ?? 0
    state = error
      ? 'error'
      : loading && groups === null
        ? 'loading'
        : groups === null
          ? 'loading'
          : hits === 0 && !groups.some((g) => g.error)
            ? 'empty'
            : 'ok'
  }

  function onSearchInput(v) {
    setQDraft(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      // 搜词变化时丢弃 folder：搜索是整个库的范围，不沿目录下钻
      setSearchParams(cleanParams({ src: 'ima', kb: kbId, q: v.trim() }))
    }, 250)
  }

  function onKbChange(v) {
    // 换库清空 folder 与 q——语义上是「换了一个地方」，不带着旧词旧目录走
    setSearchParams(cleanParams({ src: 'ima', kb: v }))
  }

  return (
    <div>
      <div className="toolbar">
        <select value={kbId} onChange={(e) => onKbChange(e.target.value)} aria-label="选择知识库">
          <option value="">全部知识库</option>
          {(kbs ?? []).map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
              {k.content_count != null ? `（${k.content_count} 条）` : ''}
            </option>
          ))}
        </select>
        <input
          className="search-input"
          type="search"
          value={qDraft}
          onChange={(e) => onSearchInput(e.target.value)}
          placeholder={kbId ? '在当前知识库内搜索…' : '跨全部知识库搜索…'}
        />
      </div>

      {/* 形态②的面包屑：current_path 根项 = 库根目录，点它清掉 folder */}
      {inBrowse && groups?.[0]?.currentPath?.length ? (
        <nav className="meta" aria-label="云端目录位置">
          {groups[0].currentPath.map((f, i, arr) => {
            const isLast = i === arr.length - 1
            const isRoot = i === 0
            return (
              <span key={f.folder_id || i}>
                {i > 0 ? ' / ' : ''}
                {isLast ? (
                  <span aria-current="page">{f.name}</span>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setSearchParams(
                        cleanParams({ src: 'ima', kb: kbId, folder: isRoot ? '' : f.folder_id }),
                      )
                    }
                  >
                    {f.name}
                  </button>
                )}
              </span>
            )
          })}
        </nav>
      ) : null}

      <StateBlock
        state={state}
        errorText={error || kbsError || '加载失败'}
        onRetry={() => setRetryTick((t) => t + 1)}
        emptyText={inSearch ? '云端知识库里没有命中，试试换个词' : '这里是空的'}
        emptyAction={
          inSearch ? (
            <button type="button" className="btn-ghost" onClick={() => setSearchParams(cleanParams({ src: 'ima', kb: kbId }))}>
              清空关键词
            </button>
          ) : null
        }
      >
        {inHome ? (
          // 形态①：知识库卡片 + 末尾「笔记」入口卡片（F15b），点进即浏览
          <ul className="note-list">
            {(kbs ?? []).map((k) => (
              <li key={k.id} className="note-item">
                <Link to={`/notes?src=ima&kb=${encodeURIComponent(k.id)}`}>
                  <div className="note-item-title">{k.name}</div>
                  {k.description ? <div className="note-item-excerpt">{k.description}</div> : null}
                  <div className="note-item-meta">
                    <span className="badge">{k.base_type || '知识库'}</span>
                    {k.content_count != null ? <span>内容 {k.content_count} 条</span> : null}
                    {k.member_count != null ? <span>成员 {k.member_count}</span> : null}
                  </div>
                </Link>
              </li>
            ))}
            {/* 笔记入口：篇数以已拉到的为准（hasMore 说明没拉完 → 「N+」）；拉失败也不挡知识库卡片 */}
            <li className="note-item">
              <Link to="/notes?src=ima&panel=notes">
                <div className="note-item-title">笔记</div>
                <div className="note-item-excerpt">你自己在 ima 里写的东西，只读</div>
                <div className="note-item-meta">
                  <span className="badge">私有</span>
                  <span>
                    {notes === null
                      ? '载入中…'
                      : notesError
                        ? '列表暂不可用'
                        : `${notes.length}${notesNext.hasMore ? '+' : ''} 篇`}
                  </span>
                </div>
              </Link>
            </li>
          </ul>
        ) : (
          // 形态②③：按库分组的条目列表
          groups.map((g, gi) => (
            <section key={g.kbId}>
              {/* 组标题只在跨库搜索时有必要标注命中数；浏览单库时面包屑已交代位置 */}
              {inSearch ? (
                <p className="meta">
                  {g.kbName}（命中 {g.items.length} 条{g.truncated ? '，可能被截断' : ''}）
                </p>
              ) : null}
              {g.error ? (
                <div className="error-bar">
                  {g.kbName}：{g.error}{' '}
                  <button type="button" className="btn-ghost" onClick={() => setRetryTick((t) => t + 1)}>
                    重试
                  </button>
                </div>
              ) : g.items.length === 0 ? (
                <p className="meta">本库无命中</p>
              ) : (
                <ul className="note-list">
                  {g.items.map((it) => (
                    <li key={it.id} className="note-item">
                      {it.kind === 'folder' && inBrowse ? (
                        // 浏览态的文件夹可下钻（搜索态不给链接，避免跳进不完整的上下文）
                        <Link to={`/notes?src=ima&kb=${encodeURIComponent(kbId)}&folder=${encodeURIComponent(it.id)}`}>
                          <div className="note-item-title">{it.name}</div>
                          <div className="note-item-meta">
                            <span className="badge">文件夹</span>
                            <span>文件 {it.file_number} · 子文件夹 {it.folder_number}</span>
                          </div>
                        </Link>
                      ) : (
                        // 静态行（不可点）：吃 .note-item > div 的卡片样式，与链接行观感一致
                        <div>
                          <div className="note-item-title">{it.name}</div>
                          {it.highlight ? <div className="note-item-excerpt">{it.highlight}</div> : null}
                          <div className="note-item-meta">
                            <span className="badge">{it.kind === 'folder' ? '文件夹' : '条目'}</span>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {g.hasMore ? (
                <button type="button" className="btn-ghost" disabled={g.loadingMore} onClick={() => loadMore(gi)}>
                  {g.loadingMore ? '加载中…' : '加载更多'}
                </button>
              ) : null}
            </section>
          ))
        )}
      </StateBlock>
    </div>
  )
}
