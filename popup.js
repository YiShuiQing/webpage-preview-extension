document.addEventListener('DOMContentLoaded', function() {
    const toggleSwitch = document.getElementById('toggleSwitch');
    const statusIndicator = document.getElementById('statusIndicator');
    
    // 加载当前设置
    chrome.runtime.sendMessage({ action: 'getSettings' }, function(response) {
        if (response && response.enabled !== undefined) {
            updateUI(response.enabled);
        }
    });
    
    // 切换开关事件
    toggleSwitch.addEventListener('click', function() {
        const isCurrentlyActive = toggleSwitch.classList.contains('active');
        const newState = !isCurrentlyActive;
        
        // 更新UI
        updateUI(newState);
        
        // 保存设置
        chrome.runtime.sendMessage({ 
            action: 'setEnabled', 
            enabled: newState 
        });
        
        // 显示反馈
        showFeedback(newState);
    });
    
    function updateUI(enabled) {
        if (enabled) {
            toggleSwitch.classList.add('active');
            statusIndicator.classList.add('status-active');
            statusIndicator.classList.remove('status-inactive');
        } else {
            toggleSwitch.classList.remove('active');
            statusIndicator.classList.add('status-inactive');
            statusIndicator.classList.remove('status-active');
        }
    }
    
    function showFeedback(enabled) {
        // 创建反馈提示
        const feedback = document.createElement('div');
        feedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${enabled ? '#10ac84' : '#ff4757'};
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            z-index: 1000;
            animation: fadeInOut 2s ease;
        `;
        
        feedback.textContent = enabled ? '✅ 功能已启用' : '❌ 功能已禁用';
        document.body.appendChild(feedback);
        
        // 添加动画样式
        if (!document.querySelector('#feedback-style')) {
            const style = document.createElement('style');
            style.id = 'feedback-style';
            style.textContent = `
                @keyframes fadeInOut {
                    0%, 100% { opacity: 0; }
                    20%, 80% { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        // 2秒后移除反馈
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
        }, 2000);
    }
});