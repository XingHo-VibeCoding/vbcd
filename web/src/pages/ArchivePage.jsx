// 归档页（原 /new 新建资料，2026-09-28 从主页内嵌表单拆回独立页）。
// 主页的「归档」方格只是跳转入口，真正的表单在这里；组件本身与主页时代完全一致。
import NoteArchiveForm from '../components/NoteArchiveForm.jsx'

export default function ArchivePage() {
  return (
    <section className="card">
      <h2>归档</h2>
      <p className="hint">写一条资料存入本项目 data/ 目录，Obsidian 里也能看到</p>
      <NoteArchiveForm />
    </section>
  )
}
