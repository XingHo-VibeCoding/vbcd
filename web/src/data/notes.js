// 一份测试数据：字段对齐 SPEC.md 第 2.1 节（Note）
// 仅用于本地演示；真实数据第 3 周起接后端与私有仓库
// 内容取自本项目这几天的真实工作，便于在页面上"一眼认出是 buddy"
export const notes = [
  {
    id: '2026-09-19-prd-review',
    title: 'PRD 首轮 AI 自检抓出的 4 个问题',
    category: 'work',
    date: '2026-09-19',
    tags: ['prd', '自检'],
    source_url: '',
    created_at: '2026-09-19T10:20:00+08:00',
    updated_at: '2026-09-19T10:20:00+08:00',
    content:
      'PRD 首轮自检发现 4 条必须修改：F1 与数据策略冲突（"仓库中出现"指代不清）、F3 索引更新两条标准自相矛盾、手机端访问前提缺失、F6 的"谁"在单人场景无定义。\n\n教训：验收标准要能"点一下、看到结果"。',
  },
  {
    id: '2026-09-19-wsl-env',
    title: '本机 WSL 环境备忘',
    category: 'life',
    date: '2026-09-19',
    tags: ['wsl', '环境'],
    source_url: '',
    created_at: '2026-09-19T12:33:00+08:00',
    updated_at: '2026-09-19T12:33:00+08:00',
    content:
      'WSL 发行版 Debian 13 (trixie)，WSL2，systemd 已启用。\n已装 Node 20.19.2 与 Docker 26.1.5（免 sudo）。\n注意：Docker Hub 直连超时，拉镜像要在海外服务器做或配加速器。\nWindows 盘挂载点：/mnt/c、/mnt/e。',
  },
  {
    id: '2026-09-19-atomic-commit',
    title: '原子化修改：一次提交只含一个意图',
    category: 'learning',
    date: '2026-09-19',
    tags: ['git', '软件工程'],
    source_url: 'https://jyywiki.cn/GSE/2026/lect3.md',
    created_at: '2026-09-19T15:39:00+08:00',
    updated_at: '2026-09-19T15:39:00+08:00',
    content:
      '原子变更 = 围绕一个明确意图的完整修改，能解释、能验证、能单独撤销，不一定只改一个文件。\n项目是由原子变更推进的快照。\n反例：把 SPEC、环境约定、gitignore 混进一次提交（96c2c8a）。',
  },
  {
    id: '2026-09-19-proxy-502',
    title: '推送 502 的根因：失效代理',
    category: 'work',
    date: '2026-09-19',
    tags: ['git', '排错'],
    source_url: '',
    created_at: '2026-09-19T15:05:00+08:00',
    updated_at: '2026-09-19T15:05:00+08:00',
    content:
      '症状：git push 报 CONNECT tunnel failed 502 / TLS handshake failed。\n根因：环境变量里的代理端口（127.0.0.1:3792）无人监听。\n解法：推送加 -c http.proxy= -c https.proxy= 绕过；或设 NO_PROXY=github.com。',
  },
]
