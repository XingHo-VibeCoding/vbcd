// 保持来源列表不变；仅为关于页派生按精选顺序排列的项目视图。
export function selectAboutProjects(group, repositories = []) {
  if (!group?.enabled) return repositories
  const byId = new Map(repositories.map(repo => [String(repo.id), repo]))
  return [...group.items].sort((a, b) => a.order - b.order)
    .filter(item => item.visible !== false)
    .flatMap(item => {
      const repo = byId.get(item.id)
      return repo ? [{ ...repo, cover: item.image || '' }] : []
    })
}
