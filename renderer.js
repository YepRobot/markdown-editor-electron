const ipc = (typeof window !== 'undefined' && window.electronAPI)
  ? window.electronAPI
  : require('electron').ipcRenderer
const path = (typeof window !== 'undefined' && window.libs) ? window.libs.path : require('path')

// 使用预加载暴露的 Markdown 渲染函数

let currentFilePath = null
let isDocumentModified = false

// 监听主进程发送的更新当前文件路径事件
ipc.on('update-current-filepath', (filePath) => {
  currentFilePath = filePath;
  isDocumentModified = true;
  updateTitle();
});

// DOM 元素
const editor = document.getElementById('editor')
const preview = document.getElementById('preview')
const filePathElement = document.getElementById('file-path')
const outlineSection = document.getElementById('outline-section')

// 更新预览
function updatePreview() {
  const content = editor.value
  const renderer = (typeof window !== 'undefined' && window.mdAPI)
    ? window.mdAPI
    : { renderMarkdown: (c) => c }
  preview.innerHTML = renderer.renderMarkdown(content, currentFilePath)
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
  const result = await ipc.invoke('open-file')
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
      savePath = await ipc.invoke('save-file', { 
        content, 
        savePath: currentFilePath 
      });
    } else {
      // 如果没有当前文件路径，显示保存对话框
      savePath = await ipc.invoke('save-file', { content });
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
    const savePath = await ipc.invoke('save-file-as', { content });
    
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
ipc.on('save-file-triggered', saveFile);
ipc.on('save-file-as-triggered', saveFileAs);

// IPC 事件监听
ipc.on('new-file', () => {
  editor.value = ''
  currentFilePath = null
  isDocumentModified = false
  updatePreview()
  updateTitle()
})

ipc.on('open-file-triggered', openFile)

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

// 修改图片处理功能
document.getElementById('insertImage').addEventListener('click', async () => {
  const result = await ipc.invoke('select-image');
  if (result && result.success) {
    const imageMarkdown = `![](${result.path})\n`;
    const start = editor.selectionStart;
    editor.value = editor.value.slice(0, start) + imageMarkdown + editor.value.slice(editor.selectionEnd);
    editor.focus();
    updatePreview();
  } else if (result && !result.success) {
    showNotification('插入图片失败: ' + result.error, 'error');
  }
});

// 修改图片粘贴处理
editor.addEventListener('paste', async (e) => {
  e.preventDefault();
  const items = e.clipboardData?.items;
  if (!items) return;

  let hasHandledItem = false;

  // 优先处理图片
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      if (file) {
        try {
          // 读取图片数据
          const buffer = await file.arrayBuffer();
          // 保存图片并获取路径
          const result = await ipc.invoke('save-pasted-image', { buffer });
          
          if (result && result.success) {
            const imageMarkdown = `![](${result.path})\n`;
            insertAtCursor(imageMarkdown);
            hasHandledItem = true;
            
            // 如果返回了更新后的文件路径，则更新 currentFilePath
            if (result.filePath) {
              currentFilePath = result.filePath;
              isDocumentModified = true;
              updateTitle();
            }
            
            // 确保在图片保存并插入后更新预览
            setTimeout(updatePreview, 0);
          } else {
            showNotification('图片粘贴失败: ' + (result?.error || '未知错误'), 'error');
          }
        } catch (error) {
          console.error('图片处理失败:', error);
          showNotification('图片处理失败', 'error');
        }
      }
      break;
    }
  }

  // 如果没有处理图片，则处理文本内容
  if (!hasHandledItem) {
    const text = e.clipboardData.getData('text');
    if (text) {
      insertAtCursor(text);
      updatePreview();
    }
  }
});

// 修改图片插入处理
const insertImageToEditor = async (filename, url) => {
  let imageMarkdown;
  if (url.startsWith('blob:')) {
    // 对于粘贴的图片，保存到文件
    const result = await ipc.invoke('save-pasted-image', { buffer: await fetch(url).then(res => res.arrayBuffer()) });
    if (result && result.success) {
      imageMarkdown = `![${filename}](${result.path})\n`;
    }
  } else {
    // 对于选择的图片文件，使用相对路径
    imageMarkdown = `![${filename}](${url})\n`;
  }

  if (imageMarkdown) {
    const start = editor.selectionStart;
    editor.value = editor.value.slice(0, start) + imageMarkdown + editor.value.slice(editor.selectionEnd);
    editor.focus();
    updatePreview();
  }
}

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

// 预览区链接点击：在外部浏览器打开 http/https 链接
preview.addEventListener('click', async (e) => {
  const anchor = e.target.closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href') || ''
  if (!href || href.startsWith('#')) return
  if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) {
    e.preventDefault()
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.invoke('open-external', href)
        if (!result?.success) showNotification('无法打开链接', 'error')
      } else {
        const { shell } = require('electron')
        shell.openExternal(href)
      }
    } catch (_) {
      showNotification('无法打开链接', 'error')
    }
  }
})

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

    const result = await ipc.invoke('export-pdf', { content: preview.innerHTML });
    
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
ipc.on('export-pdf-triggered', exportToPDF)

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
ipc.on('toggle-outline', () => {
  outlineSection.classList.toggle('hidden')
  ipc.send('update-outline-menu', !outlineSection.classList.contains('hidden'))
})

// 初始化时检查大纲栏状态
ipc.send('update-outline-menu', !outlineSection.classList.contains('hidden'))

// ...existing code...

// 渲染进程启动时同步当前文件路径
(async () => {
  try {
    const filePath = await ipc.invoke('get-current-file')
    if (filePath) {
      currentFilePath = filePath
      isDocumentModified = false
      updateTitle()
    }
  } catch (e) {}
})()
