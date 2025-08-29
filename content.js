class FullWebpagePreview {
    constructor() {
        this.previewElement = null;
        this.previewIframe = null;
        this.altIndicator = null;
        this.loadingOverlay = null;
        this.currentUrl = null;
        this.isLockedOpen = false;
        this.isAltPressed = false;
        this.isResizing = false;
        this.startX = 0;
        this.startY = 0;
        this.startWidth = 0;
        this.startHeight = 0;
        this.isDragging = false;
        this.previewContainer = null;
        this.showTimeout = null;
        this.hideTimeout = null;
        this.isEnabled = true;
        // 添加自定义尺寸状态
        this.customWidth = null;
        this.customHeight = null;
        this.hasCustomSize = false;
        this.init();
    }

    init() {
        // 检查是否已经初始化
        if (document.querySelector('#webpage-preview-extension')) {
            return;
        }

        // 创建UI元素
        this.createUI();
        this.bindEvents();
        this.loadSettings();
    }

    loadSettings() {
        chrome.storage.sync.get(['enabled'], (result) => {
            this.isEnabled = result.enabled !== false;
        });
    }

    createUI() {
        // 创建Alt键状态指示器
        this.altIndicator = document.createElement('div');
        this.altIndicator.id = 'alt-indicator-preview';
        this.altIndicator.className = 'alt-indicator';
        this.altIndicator.textContent = '🎯 Alt 键激活 - 悬停链接预览完整网页';
        document.body.appendChild(this.altIndicator);

        // 创建预览窗口
        this.previewElement = document.createElement('div');
        this.previewElement.id = 'webpage-preview-extension';
        this.previewElement.className = 'webpage-preview';
        
        this.previewElement.innerHTML = `
            <div class="preview-container">
                <div class="preview-header">
                    <div class="preview-header-left">
                        <img id="preview-favicon" class="preview-favicon" src="" alt="">
                        <div>
                            <div id="preview-title" class="preview-title">加载中...</div>
                            <div id="preview-url" class="preview-url"></div>
                        </div>
                    </div>
                    <div class="preview-controls">
                        <button class="control-btn" id="open-in-new-tab">
                            🔗 新标签页打开
                        </button>
                        <button class="control-btn" id="copy-link">
                            📋 复制链接
                        </button>
                        <button class="close-btn" id="close-preview">
                            ✕
                        </button>
                    </div>
                </div>
                <div class="preview-content">
                    <div id="loading-overlay" class="loading-overlay">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">正在加载网页...</div>
                        <div id="loading-url" class="loading-url"></div>
                    </div>
                    <iframe id="preview-iframe" class="preview-iframe" src="" sandbox="allow-scripts allow-forms allow-popups allow-top-navigation"></iframe>
                </div>
                <div id="preview-resizer" class="preview-resizer"></div>
            </div>
        `;

        document.body.appendChild(this.previewElement);

        // 获取子元素引用
        this.previewIframe = document.getElementById('preview-iframe');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.previewContainer = this.previewElement.querySelector('.preview-container');
    }

    bindEvents() {
        // Alt键监听
        document.addEventListener('keydown', (e) => {
            if (e.altKey && !this.isAltPressed && this.isEnabled) {
                this.isAltPressed = true;
                this.altIndicator.classList.add('active');
            }
        });

        document.addEventListener('keyup', (e) => {
            if (!e.altKey && this.isAltPressed) {
                this.isAltPressed = false;
                this.altIndicator.classList.remove('active');
                if (!this.isLockedOpen) {
                    this.hidePreview();
                }
            }
        });

        // ESC键关闭预览
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.previewElement.classList.contains('show')) {
                this.hidePreview();
            }
        });

        // 鼠标事件 - 使用事件委托，支持悬停在链接的子元素
        document.addEventListener('mouseover', (e) => {
            const link = this.getClosestLink(e.target);
            if (link && this.isAltPressed && this.isEnabled) {
                this.highlightLink(link);
            }
        });

        document.addEventListener('mouseout', (e) => {
            const link = this.getClosestLink(e.target);
            if (link) {
                this.unhighlightLink(link);
            }
        });

        // Alt + 点击链接时，阻止默认下载/导航行为
        document.addEventListener('click', (e) => {
            if (!this.isEnabled) return;
            const link = this.getClosestLink(e.target);
            if (link && this.isAltPressed && e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                this.openPreviewForLink(link);
            }
        }, true);

        // 预览窗口控制按钮
        document.getElementById('close-preview').addEventListener('click', () => {
            this.hidePreview();
        });

        document.getElementById('open-in-new-tab').addEventListener('click', () => {
            if (this.currentUrl) {
                window.open(this.currentUrl, '_blank');
            }
        });

        document.getElementById('copy-link').addEventListener('click', () => {
            if (this.currentUrl) {
                navigator.clipboard.writeText(this.currentUrl).then(() => {
                    this.showNotification('链接已复制到剪贴板！');
                }).catch(() => {
                    // 备用方案
                    const textArea = document.createElement('textarea');
                    textArea.value = this.currentUrl;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    this.showNotification('链接已复制到剪贴板！');
                });
            }
        });

        // 点击背景关闭
        this.previewElement.addEventListener('click', (e) => {
            if (e.target === this.previewElement) {
                this.hidePreview();
            }
        });

        // iframe加载完成事件
        this.previewIframe.addEventListener('load', () => {
            this.hideLoading();
            this.updatePreviewTitle();
        });

        // iframe加载错误事件
        this.previewIframe.addEventListener('error', () => {
            this.showError();
        });

        // 监听设置变化
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.action === 'toggleEnabled') {
                    this.isEnabled = request.enabled;
                    if (!this.isEnabled) {
                        this.hidePreview();
                        this.altIndicator.classList.remove('active');
                    }
                }
            });
        }

        // 修复后的拉伸功能
        this.setupResizer();
    }

    setupResizer() {
        const resizer = document.getElementById('preview-resizer');
        let isMouseDown = false;
        let hasMovedEnough = false;
        
        const handleMouseMove = (e) => {
            if (!isMouseDown) return;
            
            const dx = e.clientX - this.startX;
            const dy = e.clientY - this.startY;
            
            // 检查是否移动了足够距离才开始拉伸
            if (!hasMovedEnough && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
                hasMovedEnough = true;
                this.isResizing = true;
                
                // 设置初始样式
                this.previewContainer.style.setProperty('width', this.startWidth + 'px', 'important');
                this.previewContainer.style.setProperty('height', this.startHeight + 'px', 'important');
                this.previewContainer.style.setProperty('max-width', 'none', 'important');
                this.previewContainer.style.setProperty('max-height', 'none', 'important');
                document.body.classList.add('preview-resizing');
                
                if (this.previewIframe) {
                    this.previewIframe.style.pointerEvents = 'none';
                }
            }
            
            // 只有开始拉伸后才调整大小
            if (!this.isResizing) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const minW = 480;
            const minH = 320;
            const maxW = Math.min(window.innerWidth - 60, 2000);
            const maxH = Math.min(window.innerHeight - 60, 1400);
            const newW = Math.max(minW, Math.min(maxW, this.startWidth + dx));
            const newH = Math.max(minH, Math.min(maxH, this.startHeight + dy));
            
            this.previewContainer.style.setProperty('width', newW + 'px', 'important');
            this.previewContainer.style.setProperty('height', newH + 'px', 'important');
            
            // 保存自定义尺寸
            this.customWidth = newW;
            this.customHeight = newH;
            this.hasCustomSize = true;
        };
        
        const handleMouseUp = (e) => {
            if (isMouseDown) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            isMouseDown = false;
            hasMovedEnough = false;
            this.isResizing = false;
            
            // 清理事件监听器
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
            document.removeEventListener('pointermove', handleMouseMove, true);
            document.removeEventListener('pointerup', handleMouseUp, true);
            
            document.body.classList.remove('preview-resizing');
            
            if (this.previewIframe) {
                this.previewIframe.style.pointerEvents = '';
            }
        };
        
        // 鼠标事件
        resizer.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // 只响应左键
            e.preventDefault();
            e.stopPropagation();
            if (!this.previewElement.classList.contains('show')) return;
            
            isMouseDown = true;
            hasMovedEnough = false;
            
            const rect = this.previewContainer.getBoundingClientRect();
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.startWidth = rect.width;
            this.startHeight = rect.height;
            
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        });
        
        // Pointer事件兜底
        resizer.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            if (!this.previewElement.classList.contains('show')) return;
            
            isMouseDown = true;
            hasMovedEnough = false;
            
            const rect = this.previewContainer.getBoundingClientRect();
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.startWidth = rect.width;
            this.startHeight = rect.height;
            
            document.addEventListener('pointermove', handleMouseMove, true);
            document.addEventListener('pointerup', handleMouseUp, true);
            
            try {
                resizer.setPointerCapture(e.pointerId);
            } catch (_) {}
        });
    }

    isLinkElement(element) {
        return element && element.tagName === 'A' && element.href && element.href.startsWith('http');
    }

    getClosestLink(element) {
        if (!element) return null;
        const link = element.closest && element.closest('a[href]');
        if (this.isLinkElement(link)) return link;
        return null;
    }

    highlightLink(linkElement) {
        linkElement.classList.add('preview-link-hover');
    }

    unhighlightLink(linkElement) {
        linkElement.classList.remove('preview-link-hover');
    }

    showPreview(linkElement) {
        clearTimeout(this.hideTimeout);
        const url = linkElement && linkElement.href ? linkElement.href : null;
        if (!url) return;
        
        // 避免预览相同页面
        if (url === window.location.href) {
            return;
        }

        this.currentUrl = url;
        // 悬停触发路径：保留延迟以免太敏感
        this.showTimeout = setTimeout(() => {
            if (this.isAltPressed && this.isEnabled) {
                this.displayPreview(url);
            }
        }, 300);
    }

    openPreviewForLink(linkElement) {
        if (!linkElement || !linkElement.href) return;
        const url = linkElement.href;
        if (url === window.location.href) return;
        this.currentUrl = url;
        this.isLockedOpen = true;
        this.displayPreview(url);
    }

    hidePreview() {
        clearTimeout(this.showTimeout);
        this.previewElement.classList.remove('show');
        this.isLockedOpen = false;
        
        // 清空iframe以节省资源
        setTimeout(() => {
            if (!this.previewElement.classList.contains('show')) {
                this.previewIframe.src = '';
                this.currentUrl = null;
            }
        }, 400);
    }

    displayPreview(url) {
        // 显示加载状态
        this.showLoading(url);
        
        // 更新预览信息
        let domain = '';
        try {
            domain = new URL(url).hostname;
        } catch (e) {
            domain = '';
        }
        document.getElementById('preview-url').textContent = url;
        document.getElementById('preview-favicon').src = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
        
        // 应用自定义尺寸（如果存在）
        if (this.hasCustomSize && this.customWidth && this.customHeight) {
            this.previewContainer.style.setProperty('width', this.customWidth + 'px', 'important');
            this.previewContainer.style.setProperty('height', this.customHeight + 'px', 'important');
            this.previewContainer.style.setProperty('max-width', 'none', 'important');
            this.previewContainer.style.setProperty('max-height', 'none', 'important');
        } else {
            // 重置为默认样式
            this.previewContainer.style.removeProperty('width');
            this.previewContainer.style.removeProperty('height');
            this.previewContainer.style.removeProperty('max-width');
            this.previewContainer.style.removeProperty('max-height');
        }
        
        // 显示预览窗口
        this.previewElement.classList.add('show');
        
        // 加载iframe
        setTimeout(() => {
            this.previewIframe.src = url;
        }, 100);
    }

    showLoading(url) {
        this.loadingOverlay.classList.remove('hide');
        document.getElementById('loading-url').textContent = url;
        document.getElementById('preview-title').textContent = '加载中...';
    }

    hideLoading() {
        this.loadingOverlay.classList.add('hide');
    }

    showError() {
        this.loadingOverlay.innerHTML = `
            <div class="error-message">
                <h3>⚠️ 无法加载网页</h3>
                <p>该网站可能不支持iframe嵌入，或者网络连接出现问题。</p>
                <button class="control-btn error-btn" style="margin-top: 15px;">
                    在新标签页中打开
                </button>
            </div>
        `;
        
        // 为错误按钮添加事件
        this.loadingOverlay.querySelector('.error-btn').addEventListener('click', () => {
            window.open(this.currentUrl, '_blank');
        });
        
        this.loadingOverlay.classList.remove('hide');
    }

    updatePreviewTitle() {
        if (!this.currentUrl) {
            return;
        }
        try {
            const iframeDoc = this.previewIframe.contentDocument || this.previewIframe.contentWindow.document;
            let hostname = '';
            try {
                hostname = new URL(this.currentUrl).hostname;
            } catch (e) {
                hostname = '';
            }
            const title = iframeDoc.title || hostname;
            document.getElementById('preview-title').textContent = title;
        } catch (e) {
            let hostname = '';
            try {
                hostname = new URL(this.currentUrl).hostname;
            } catch (err) {
                hostname = '';
            }
            document.getElementById('preview-title').textContent = hostname;
        }
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #10ac84;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 1000001;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            animation: slideInRight 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// 添加动画样式
const animationStyle = document.createElement('style');
animationStyle.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(animationStyle);

// 等待DOM加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new FullWebpagePreview();
    });
} else {
    new FullWebpagePreview();
}