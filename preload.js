const { contextBridge, ipcRenderer } = require('electron')
const MarkdownIt = require('markdown-it')
const hljs = require('highlight.js')
const path = require('path')

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args))
})

contextBridge.exposeInMainWorld('libs', {
  MarkdownIt,
  hljs,
  path
})

const md = MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value
      } catch (__) {}
    }
    return ''
  }
})

function renderMarkdown(content, currentFilePath) {
  let html = md.render(content)
  
  // 无论 currentFilePath 是否存在，都尝试处理图片路径
  html = html.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi, (m, src) => {
    // 对于 blob, http, data 等协议的图片，保持原样
    if (src.startsWith('blob:') || src.startsWith('http') || src.startsWith('data:')) return m
    
    // 如果有 currentFilePath，则使用绝对路径
    if (currentFilePath) {
      const basePath = path.dirname(currentFilePath)
      const absolutePath = path.resolve(basePath, src).replace(/\\/g, '/')
      return m.replace(src, `file:///${absolutePath}`)
    }
    
    // 对于未保存的文档，尝试使用相对路径（在实际保存后会重新渲染）
    return m
  })
  
  return html
}

contextBridge.exposeInMainWorld('mdAPI', {
  renderMarkdown
})
