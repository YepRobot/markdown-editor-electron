const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')  // 添加同步版本的 fs

let mainWindow
let currentFilePath = null

let windowState = {
  bounds: { width: 1200, height: 800 },
  isMaximized: false
}

async function saveWindowState() {
  if (!mainWindow.isMaximized()) {
    windowState.bounds = mainWindow.getBounds()
  }
  windowState.isMaximized = mainWindow.isMaximized()
  
  try {
    await fs.writeFile(
      path.join(app.getPath('userData'), 'window-state.json'),
      JSON.stringify(windowState)
    )
  } catch (e) {
    console.error('保存窗口状态失败:', e)
  }
}

function createWindow() {
  try {
    const data = fsSync.readFileSync(
      path.join(app.getPath('userData'), 'window-state.json'),
      'utf8'
    )
    Object.assign(windowState, JSON.parse(data))
  } catch (e) {
    // 忽略错误，使用默认值
  }

  mainWindow = new BrowserWindow({
    ...windowState.bounds,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false,  // 允许加载本地文件
      allowRunningInsecureContent: true  // 允许加载不安全内容
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#fff'
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  // 添加协议拦截器
  protocol.interceptFileProtocol('file', (request, callback) => {
    const url = request.url.substr(8)
    callback(decodeURI(url))
  })

  // 改用异步方式处理窗口关闭
  mainWindow.on('close', async (e) => {
    e.preventDefault()  // 暂时阻止窗口关闭
    await saveWindowState()
    mainWindow.destroy()  // 手动关闭窗口
  })

  mainWindow.loadFile('index.html')
  
  // 创建应用菜单
  require('./menu').createMenu(mainWindow)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 文件操作相关 IPC 处理
ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0]
    const content = await fs.readFile(filePath, 'utf8')
    currentFilePath = filePath
    return { content, filePath }
  }
})

// 修改保存文件的处理器
ipcMain.handle('save-file', async (event, { content, savePath }) => {
  try {
    let finalPath;
    if (!savePath) {
      const dialogOptions = {
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      };

      // 如果有当前文件路径，设置为默认路径
      if (currentFilePath) {
        dialogOptions.defaultPath = currentFilePath;
      } else {
        // 使用用户的文档目录作为默认路径
        dialogOptions.defaultPath = path.join(app.getPath('documents'), 'untitled.md');
      }

      const result = await dialog.showSaveDialog(mainWindow, dialogOptions);
      
      if (result.canceled) return null;
      finalPath = result.filePath;
    } else {
      finalPath = savePath;
    }
    
    await fs.writeFile(finalPath, content, 'utf8');
    currentFilePath = finalPath;
    return finalPath;
  } catch (error) {
    console.error('保存文件失败:', error);
    return null;
  }
});

// 修改另存为处理器
ipcMain.handle('save-file-as', async (event, { content }) => {
  try {
    const dialogOptions = {
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultPath: currentFilePath || path.join(app.getPath('documents'), 'untitled.md')
    };

    const result = await dialog.showSaveDialog(mainWindow, dialogOptions);
    
    if (result.canceled) return null;
    
    await fs.writeFile(result.filePath, content, 'utf8');
    currentFilePath = result.filePath;
    return result.filePath;
  } catch (error) {
    console.error('另存为失败:', error);
    return null;
  }
});

ipcMain.handle('get-current-file', () => currentFilePath)

// 添加图片选择处理
ipcMain.handle('select-image', async () => {
  return dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] }]
  })
})

// 处理粘贴的图片
ipcMain.handle('save-pasted-image', async (event, { file, buffer }) => {
  if (!currentFilePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled) return null
    currentFilePath = result.filePath
  }

  try {
    const assetsDir = path.join(path.dirname(currentFilePath), 'assets')
    await fs.mkdir(assetsDir, { recursive: true })
    const timestamp = Date.now()
    const imagePath = path.join(assetsDir, `image-${timestamp}.png`)
    
    // 直接使用传入的 buffer 保存图片
    if (buffer) {
      await fs.writeFile(imagePath, Buffer.from(buffer))
    } else {
      await fs.copyFile(file, imagePath)
    }
    
    // 返回绝对路径
    return imagePath.replace(/\\/g, '/')
  } catch (error) {
    console.error('保存图片失败:', error)
    return null
  }
})
