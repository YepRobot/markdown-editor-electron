const { Menu, ipcMain } = require('electron')

function createMenu(mainWindow) {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('new-file')
        },
        {
          label: '打开',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('open-file-triggered')
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('save-file-triggered')
        },
        {
          label: '另存为',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('save-file-as-triggered')
        },
        { type: 'separator' },
        {
          label: '导出为PDF',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('export-pdf-triggered')
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '显示大纲',
          accelerator: 'CmdOrCtrl+T',
          type: 'checkbox',
          checked: false,
          click: () => mainWindow.webContents.send('toggle-outline')
        },
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '切换开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  // 监听大纲菜单状态更新
  ipcMain.on('update-outline-menu', (event, isVisible) => {
    const viewMenu = menu.items.find(item => item.label === '视图')
    const outlineMenuItem = viewMenu.submenu.items.find(item => item.label === '显示大纲')
    outlineMenuItem.checked = isVisible
  })
}

exports.createMenu = createMenu
