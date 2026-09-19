import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 唯一的 Markdown 渲染组件：详情页显示原文、录入页实时预览都用它
// 安全性：react-markdown 默认不执行内容里的原始 HTML
export default function MarkdownContent({ content, emptyHint = '（还没有内容）' }) {
  const text = String(content || '').trim()
  if (!text) {
    return <div className="md-empty">{emptyHint}</div>
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}
