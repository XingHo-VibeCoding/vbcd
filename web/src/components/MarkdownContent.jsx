import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 唯一的 Markdown 渲染组件：详情页显示原文、录入页实时预览都用它
// 安全性：react-markdown 默认不执行内容里的原始 HTML
// components：可选的渲染器覆盖（F15b 的 ima 笔记详情用它把 img 换成带 onError 占位的版本）。
//   不传时行为与之前完全一致——覆盖权在调用方，这个文件本身不放任何业务特例。
export default function MarkdownContent({ content, emptyHint = '（还没有内容）', components }) {
  const text = String(content || '').trim()
  if (!text) {
    return <div className="md-empty">{emptyHint}</div>
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
