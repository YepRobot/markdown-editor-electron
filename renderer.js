const { ipcRenderer } = require('electron')
const MarkdownIt = require('markdown-it')
const hljs = require('highlight.js')
const path = require('path')

// 修改 markdown-it 配置以支持文件协议
const md = new MarkdownIt({
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

// 修改图片渲染规则
md.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  const srcIndex = token.attrIndex('src')
  const src = token.attrs[srcIndex][1]
  const alt = token.content || ''
  
  // 保持 blob URL 和 http(s) URL 不变，只处理本地文件路径
  if (!src.startsWith('blob:') && !src.startsWith('http') && !src.startsWith('data:')) {
    token.attrs[srcIndex][1] = `file:///${src.replace(/\\/g, '/')}`
  }
  
  return `<p class="image-container"><img src="${token.attrs[srcIndex][1]}" alt="${alt}" /></p>`
}

let currentFilePath = null
let isDocumentModified = false

// DOM 元素
const editor = document.getElementById('editor')
const preview = document.getElementById('preview')
const filePathElement = document.getElementById('file-path')

// 更新预览
function updatePreview() {
  const content = editor.value
  preview.innerHTML = md.render(content)
  updateOutline() // 添加大纲更新
  if (!isDocumentModified) {
    isDocumentModified = true
    updateTitle()
  }
}

// 更新标题
function updateTitle() {
  const fileName = currentFilePath ? currentFilePath.split('/').pop() : '未保存的文档'
  filePathElement.textContent = fileName + (isDocumentModified ? ' *' : '')
}

// 事件监听
editor.addEventListener('input', updatePreview)

// 文件操作
async function openFile() {
  const result = await ipcRenderer.invoke('open-file')
  if (result) {
    editor.value = result.content
    currentFilePath = result.filePath
    isDocumentModified = false
    updatePreview()
    updateTitle()
  }
}

// 修改保存文件函数
async function saveFile() {
  try {
    const content = editor.value;
    let savePath;

    if (currentFilePath) {
      // 如果有当前文件路径，直接保存
      savePath = await ipcRenderer.invoke('save-file', { 
        content, 
        savePath: currentFilePath 
      });
    } else {
      // 如果没有当前文件路径，显示保存对话框
      savePath = await ipcRenderer.invoke('save-file', { content });
    }

    if (savePath) {
      currentFilePath = savePath;
      isDocumentModified = false;
      updateTitle();
      showNotification('文件保存成功');
    }
  } catch (error) {
    console.error('保存文件失败:', error);
    showNotification('保存失败，请重试', 'error');
  }
}

// 添加另存为函数
async function saveFileAs() {
  try {
    const content = editor.value;
    const savePath = await ipcRenderer.invoke('save-file-as', { content });
    
    if (savePath) {
      currentFilePath = savePath;
      isDocumentModified = false;
      updateTitle();
      showNotification('文件保存成功');
    }
  } catch (error) {
    console.error('另存为失败:', error);
    showNotification('保存失败，请重试', 'error');
  }
}

// 添加保存相关的事件监听
ipcRenderer.on('save-file-triggered', saveFile);
ipcRenderer.on('save-file-as-triggered', saveFileAs);

// IPC 事件监听
ipcRenderer.on('new-file', () => {
  editor.value = ''
  currentFilePath = null
  isDocumentModified = false
  updatePreview()
  updateTitle()
})

ipcRenderer.on('open-file-triggered', openFile)

// 修改代码块插入功能
document.getElementById('insertCode').addEventListener('click', () => {
  // 定义支持的语言列表
  const languages = {
    'JavaScript': 'javascript',
    'Python': 'python',
    'Java': 'java',
    'C++': 'cpp',
    'TypeScript': 'typescript',
    'HTML': 'html',
    'CSS': 'css',
    'SQL': 'sql',
    'Shell': 'bash',
    'JSON': 'json'
  }

  // 创建选择框 HTML
  const options = Object.entries(languages)
    .map(([name, value]) => `<option value="${value}">${name}</option>`)
    .join('')

  // 创建自定义对话框
  const dialog = document.createElement('div')
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 1000;
  `
  dialog.innerHTML = `
    <h3 style="margin: 0 0 15px 0; font-size: 16px;">选择编程语言</h3>
    <select id="langSelect" style="width: 200px; padding: 8px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px;">
      ${options}
    </select>
    <div style="text-align: right;">
      <button id="cancelBtn" style="margin-right: 10px; padding: 6px 12px;">取消</button>
      <button id="confirmBtn" style="padding: 6px 12px; background: #1a73e8; color: white; border: none; border-radius: 4px;">确定</button>
    </div>
  `

  // 创建遮罩层
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 999;
  `

  // 添加到文档
  document.body.appendChild(overlay)
  document.body.appendChild(dialog)

  // 处理按钮点击
  const closeDialog = () => {
    document.body.removeChild(dialog)
    document.body.removeChild(overlay)
  }

  document.getElementById('cancelBtn').onclick = closeDialog

  document.getElementById('confirmBtn').onclick = () => {
    const select = document.getElementById('langSelect')
    const lang = select.value
    closeDialog()

    const template = `\`\`\`${lang}\n// 在这里输入代码\n\`\`\`\n`
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const selectedText = editor.value.substring(start, end)

    const codeBlock = selectedText
      ? `\`\`\`${lang}\n${selectedText}\n\`\`\`\n`
      : template

    editor.value = editor.value.slice(0, start) + codeBlock + editor.value.slice(end)
    editor.focus()
    
    if (!selectedText) {
      const newPos = start + lang.length + 4
      editor.selectionStart = editor.selectionEnd = newPos
    }
    
    updatePreview()
  }

  // 处理 ESC 键关闭
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeDialog()
      window.removeEventListener('keydown', handleEscape)
    }
  }
  window.addEventListener('keydown', handleEscape)
})

// 图片处理功能
document.getElementById('insertImage').addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('select-image')
  if (result && !result.canceled && result.filePaths.length > 0) {
    const imagePath = result.filePaths[0]
    const imageMarkdown = `![](${imagePath})\n`
    const start = editor.selectionStart
    editor.value = editor.value.slice(0, start) + imageMarkdown + editor.value.slice(editor.selectionEnd)
    editor.focus()
    updatePreview()
  }
})

// 修改图片插入处理
const insertImageToEditor = async (filename, url) => {
  let imageMarkdown
  if (url.startsWith('blob:')) {
    // 对于粘贴的图片，保存到文件
    const result = await ipcRenderer.invoke('save-pasted-image', { url })
    if (result) {
      imageMarkdown = `![${filename}](${result})\n`
    }
  } else {
    // 对于选择的图片文件，使用相对路径
    imageMarkdown = `![${filename}](${url})\n`
  }

  if (imageMarkdown) {
    const start = editor.selectionStart
    editor.value = editor.value.slice(0, start) + imageMarkdown + editor.value.slice(editor.selectionEnd)
    editor.focus()
    updatePreview()
  }
}

// 修改粘贴事件处理
editor.addEventListener('paste', async (e) => {
  e.preventDefault() // 阻止默认粘贴行为
  const items = e.clipboardData?.items
  if (!items) return

  let hasHandledItem = false

  // 优先处理图片
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile()
      if (file) {
        try {
          // 直接使用 blob URL
          const url = URL.createObjectURL(file)
          const imageMarkdown = `![Pasted Image](${url})\n`
          insertAtCursor(imageMarkdown)
          hasHandledItem = true
        } catch (error) {
          console.error('图片处理失败:', error)
        }
      }
      break
    }
  }

  // 如果没有处理图片，则处理文本内容
  if (!hasHandledItem) {
    const text = e.clipboardData.getData('text')
    if (text) {
      insertAtCursor(text)
    }
  }

  updatePreview()
})

// 辅助函数：在光标位置插入文本
function insertAtCursor(text) {
  const start = editor.selectionStart
  editor.value = editor.value.slice(0, start) + text + editor.value.slice(editor.selectionEnd)
  editor.focus()
  editor.selectionStart = editor.selectionEnd = start + text.length
}

// 添加自动保存功能
let autoSaveTimeout
function setupAutoSave() {
  if (autoSaveTimeout) clearTimeout(autoSaveTimeout)
  autoSaveTimeout = setTimeout(async () => {
    if (currentFilePath && isDocumentModified) {
      await saveFile()
    }
  }, 3000)
}

editor.addEventListener('input', () => {
  updatePreview()
  setupAutoSave()
})

// 替换 onBeforeUnmount 为 window unload 事件监听
window.addEventListener('unload', () => {
  // 清理所有创建的 Blob URLs
  const content = editor.value
  const urls = content.match(/\(blob:.*?\)/g)
  if (urls) {
    urls.forEach(url => {
      const blobUrl = url.slice(1, -1) // 移除括号
      URL.revokeObjectURL(blobUrl)
    })
  }
})

// 添加通知功能
function showNotification(message, type = 'success') {
  const notification = document.createElement('div')
  notification.className = `notification ${type}`
  notification.textContent = message
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 24px;
    background: ${type === 'success' ? '#4caf50' : '#f44336'};
    color: white;
    border-radius: 4px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    z-index: 1000;
    animation: fadeIn 0.3s ease;
  `
  document.body.appendChild(notification)
  
  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.3s ease'
    setTimeout(() => notification.remove(), 300)
  }, 3000)
}

// 添加样式
const style = document.createElement('style')
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(20px); }
  }
`
document.head.appendChild(style)

// 图片处理
// ...existing image handling code...

// 修改 PDF 导出功能
async function exportToPDF() {
  try {
    const content = editor.value;
    if (!content.trim()) {
      showNotification('文档内容为空', 'error');
      return;
    }

    // 确保预览区域内容是最新的
    updatePreview();

    const result = await ipcRenderer.invoke('export-pdf', { content: preview.innerHTML });
    
    if (result.success) {
      showNotification('PDF导出成功');
    } else {
      showNotification('PDF导出失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('PDF导出错误:', error);
    showNotification('PDF导出失败', 'error');
  }
}

// 确保事件监听器被正确添加
ipcRenderer.on('export-pdf-triggered', exportToPDF)

// 大纲功能
function updateOutline() {
  const outlineContent = document.getElementById('outline-content')
  outlineContent.innerHTML = ''

  const headings = preview.querySelectorAll('h1, h2, h3, h4, h5, h6')
  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName.substring(1))
    const text = heading.textContent
    
    const item = document.createElement('div')
    item.className = `outline-item outline-h${level}`
    item.textContent = text
    item.addEventListener('click', () => {
      heading.scrollIntoView({ behavior: 'smooth' })
      // 更新当前活动项
      document.querySelectorAll('.outline-item').forEach(i => i.classList.remove('active'))
      item.classList.add('active')
    })
    
    outlineContent.appendChild(item)
  })
}

// 监听大纲显示/隐藏事件
ipcRenderer.on('toggle-outline', () => {
  const outlineSection = document.getElementById('outline-section')
  outlineSection.classList.toggle('show')
})

// ...existing code...
