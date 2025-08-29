// 安装时初始化默认设置
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({
        enabled: true
    });
});

// 处理来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSettings') {
        chrome.storage.sync.get(['enabled'], (result) => {
            sendResponse({ enabled: result.enabled !== false });
        });
        return true; // 保持消息通道开启
    }
    
    if (request.action === 'setEnabled') {
        chrome.storage.sync.set({ enabled: request.enabled });
        
        // 通知所有内容脚本
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'toggleEnabled',
                    enabled: request.enabled
                }).catch(() => {
                    // 忽略错误
                });
            });
        });
    }
});