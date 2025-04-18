// 工具函数：异步延迟
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 获取窗口和视口信息
function collectWindowInfo() {
    return {
        window: [
            window.screenX,
            window.screenY,
            window.innerWidth,
            window.innerHeight
        ],
        viewportSize: {
            viewportWidth: window.visualViewport.width,
            viewportHeight: window.visualViewport.height
        }
    };
}

// 获取页面尺寸
function getPageDimensions() {
    return {
        width: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0),
        height: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
    };
}

// 规范化边界框数据
function normalizeBoundingBox(rect, pageWidth, pageHeight) {
    if (!rect || (rect.width === 0 && rect.height === 0)) {
        return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    }
    const box = {
        left: Math.max(0, 100 * Math.round(rect.left) / 100),
        top: Math.max(0, 100 * Math.round(rect.top) / 100),
        right: Math.min(pageWidth, 100 * Math.round(rect.right) / 100),
        bottom: Math.min(pageHeight, 100 * Math.round(rect.bottom) / 100)
    };
    return {
        ...box,
        width: Math.round((box.right - box.left) * 100) / 100,
        height: Math.round((box.bottom - box.top) * 100) / 100
    };
}

// 递归遍历 DOM 树，仅返回元素节点
function* traverseDOM(root, includeShadow = true) {
    if (!(root instanceof Node)) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
        yield root;
    }
    if (includeShadow && root.shadowRoot) {
        yield* traverseDOM(root.shadowRoot, includeShadow);
    }
    const children = root.childNodes || [];
    for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
            yield* traverseDOM(child, includeShadow);
        }
    }
}

// 判断元素是否可交互
function isInteractiveElement(element) {
    // 确保 element 是有效的 DOM 元素
    if (!(element instanceof Element)) {
        return false;
    }

    const tag = element.tagName.toLowerCase();

    // 1. 基本交互元素：常见交互标签
    const interactiveTags = [
        'input', 'textarea', 'select', 'button', 'a', 'img', 'video',
        'iframe', 'object', 'embed', 'details', 'svg', 'label'
    ];
    if (interactiveTags.includes(tag)) {
        if (tag === 'label' && element.control?.disabled) {
            return false;
        }
        if (tag === 'img' && element.getAttribute('usemap')) {
            const mapName = element.getAttribute('usemap').replace(/^#/, '');
            return !!document.querySelector(`map[name="${mapName}"]`);
        }
        return true;
    }

    // 2. 事件和样式：onclick、cursor: pointer
    if (element.hasAttribute('onclick') || window.getComputedStyle(element).cursor === 'pointer') {
        return true;
    }

    // 3. 角色属性：role 表示交互元素
    const role = element.getAttribute('role')?.toLowerCase();
    if (role && [
        'button', 'link', 'checkbox', 'tab', 'menuitem', 'menuitemcheckbox',
        'menuitemradio', 'radio', 'option', 'listbox'
    ].includes(role)) {
        return true;
    }

    // 4. 可编辑内容：contenteditable
    const contentEditable = element.getAttribute('contenteditable')?.toLowerCase();
    if (contentEditable && ['', 'contenteditable', 'true'].includes(contentEditable)) {
        return true;
    }

    // 5. 事件绑定：jsaction 属性
    if (element.hasAttribute('jsaction')) {
        const actions = element.getAttribute('jsaction').split(';');
        for (let action of actions) {
            const [event, handler] = action.trim().split(':').map(s => s.trim());
            if (event === 'click' && handler && handler !== 'none') {
                return true;
            }
        }
    }

    // 6. 其他通用交互特征
    const tabindex = parseInt(element.getAttribute('tabindex') || '-1');
    if (tabindex >= 0) {
        return true;
    }

    // 使用 classList 替代 className
    if (element.classList && element.classList.contains('button')) {
        return true;
    }

    if (tag === 'img' && ['zoom-in', 'zoom-out'].includes(element.style.cursor)) {
        return true;
    }

    return false;
}

// 压缩 HTML 代码（极致压缩）
function compressHtml(html) {
    // 移除 HTML 注释
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    // 移除 CDATA 部分
    html = html.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
    // 压缩内联 CSS
    html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, function(match, style) {
        return '<style>' + style
            .replace(/\s+/g, ' ')
            .replace(/:\s+/g, ':')
            .replace(/;\s+/g, ';')
            .replace(/,\s+/g, ',')
            .trim() + '</style>';
    });
    // 压缩内联 JavaScript
    html = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, function(match, script) {
        return '<script>' + script
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s+|\s+$/g, '')
            .replace(/\s+/g, ' ')
            .replace(/\s*([=+\-*/{}\[\](),;:<>])\s*/g, '$1') + '</script>';
    });
    // 处理 HTML
    return html
        // 移除换行、回车、制表符
        .replace(/[\n\r\t]/g, '')
        // 移除多余空格
        .replace(/\s{2,}/g, ' ')
        // 移除标签间的空格
        .replace(/>\s+</g, '><')
        // 优化布尔属性
        .replace(/(\w+)="(true|false)"/g, (m, attr, val) => val === 'true' ? attr : `${attr}=false`)
        // 只移除安全属性值的引号（不包含数字）
        .replace(/="([a-zA-Z\-_]+)"/g, '=$1')
        // 压缩空格
        .replace(/\s+([<>])/g, '$1')
        .replace(/([<>])\s+/g, '$1')
        // 处理自闭合标签
        .replace(/\s*\/>/g, '/>')
        // 移除属性间多余空格
        .replace(/\s+/g, ' ')
        .trim();
}

// 处理 DOM 元素
async function processDOM() {
    const page = getPageDimensions();
    let nodeId = 0;
    const usedLabelIds = new Set();
    let labelId = 0;
    const processedElements = new Set();

    // 处理单个元素
    function processElement(element) {
        if (processedElements.has(element)) return;
        processedElements.add(element);

        try {
            const tag = element.tagName.toLowerCase();
            if (tag === 'html' || tag === 'body') return;

            element.setAttribute('data-backend-node-id', nodeId++);

            // 分配 data-bbox
            const rects = element.getClientRects();
            const box = normalizeBoundingBox(rects.length > 0 ? rects[0] : null, page.width, page.height);
            element.setAttribute('data-bbox', `${box.left},${box.top},${box.width},${box.height}`);

            // 处理文本内容
            const skipTags = ['style', 'script', 'noscript', 'title', 'object'];
            if (element.hasChildNodes() && !skipTags.includes(tag)) {
                const textNodes = Array.from(element.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent.trim().replace(/\s{2,}/g, ' ') || '')
                    .filter(text => text.length > 0);
                if (textNodes.length > 0) {
                    element.setAttribute('data-text', textNodes.join(','));
                }
            }

            // 处理特殊元素类型
            if (tag === 'input' || tag === 'textarea') {
                element.setAttribute('data-text', element.getAttribute('placeholder') || '');
                element.setAttribute('data-value', element.value || '');
                if (tag === 'input') {
                    if (element.getAttribute('type') === 'checkbox') {
                        element.setAttribute('data-status', element.checked ? 'checked' : 'not-checked');
                    }
                }
            }
            if (tag === 'select') {
                const value = element.value;
                const selectedText = element.options[element.selectedIndex]?.text || '';
                element.setAttribute('data-value', value);
                element.setAttribute('data-text', selectedText);
                element.options[element.selectedIndex]?.setAttribute('data-status', 'selected');
            }
        } catch (error) {
            console.warn(`Failed to process element ${element.tagName}:`, error);
        }
    }

    // 遍历并处理所有 DOM 元素
    console.log('Starting DOM traversal...');
    for (const element of traverseDOM(document.documentElement)) {
        console.log(`Processing element: ${element.tagName}`);
        processElement(element);
    }

    // 处理 iframe 内容
    for (const iframe of document.querySelectorAll('iframe')) {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc) {
                for (const element of traverseDOM(iframeDoc.documentElement)) {
                    processElement(element);
                }
            }
        } catch (error) {
            console.warn(`Cannot access iframe content:`, error);
        }
    }

    // 可交互元素标记
    for (const element of document.querySelectorAll('*')) {
        if (isInteractiveElement(element) && element.getAttribute('data-bbox') !== '0,0,0,0') {
            element.classList.add('possible-clickable-element');
            while (usedLabelIds.has(labelId)) labelId++;
            element.setAttribute('data-label-id', labelId);
            usedLabelIds.add(labelId++);
        }
    }

    // 清理标记
    await delay(50);
    await delay(100);
    for (const marker of document.querySelectorAll('.our-dom-marker')) {
        marker.remove();
    }

    function isInvisible(element) {
        const style = element.getAttribute('style');
        const isHidden =
            style && (
                style.includes('display: none') ||
                style.includes('display:none') ||
                style.includes('visibility: hidden') ||
                style.includes('visibility:hidden') ||
                style.includes('opacity: 0') ||
                style.includes('opacity:0') ||
                (style.includes('position: absolute') && (style.includes('left: -9999px') || style.includes('left: -10000px'))) ||
                style.includes('clip: rect(0, 0, 0, 0)') ||
                style.includes('clip-path: inset(100%)')
            );
        const isSpecialHidden =
            (element.tagName.toLowerCase() === 'xft-popup-container' || element.classList.contains('dropdown-items') || element.classList.contains('start-chat-btn')) ||
            (element.hasAttribute('data-sg-type') && element.getAttribute('data-sg-type') === 'placeholder') ||
            (element.getAttribute('id')?.includes('_mail_emailhide_'));
        return isHidden || isSpecialHidden;
    }

    function removeInvisibleElements(doc) {
        doc.querySelectorAll('*').forEach(element => {
            if (isInvisible(element)) {
                element.remove();
            }
        });
        const emailHideDiv = doc.querySelector('div[id*="_mail_emailhide_"]');
        if (emailHideDiv) emailHideDiv.remove();
    }

    // 生成 modifiedHtml
    function generateModifiedHtml() {
        const docClone = document.documentElement.cloneNode(true);
        // 移除 <script> 和 <style> 元素
        const scriptsAndStyles = docClone.querySelectorAll('script, style, link, noscript, plasmo-csui');
        scriptsAndStyles.forEach(element => element.remove());

        // 处理 DraftEditor 占位符
        docClone.querySelectorAll('div[class="DraftEditor-root"]').forEach(editor => {
            const placeholder = editor.querySelector('div[class="public-DraftEditorPlaceholder-inner"]');
            const contentEditable = editor.querySelector('div[contenteditable="true"]');
            if (placeholder?.hasAttribute('data-text') && contentEditable) {
                contentEditable.setAttribute('data-text', placeholder.getAttribute('data-text'));
            }
        });

        // 移除不可见元素
        removeInvisibleElements(docClone);

        // 遍历所有元素，清理多余属性
        const allElements = docClone.querySelectorAll('*');
        allElements.forEach(element => {
            const bbox = element.getAttribute('data-bbox');
            const labelId = element.getAttribute('data-label-id');
            const text = element.getAttribute('data-text');
            const status = element.getAttribute('data-status');
            const value = element.getAttribute("data-value")
            if (bbox === '0,0,0,0') {
                element.remove();
                return;
            }

            const attributes = Array.from(element.attributes);
            attributes.forEach(attr => {
                element.removeAttribute(attr.name);
            });

            if (bbox) {
                element.setAttribute('data-bbox', bbox);
            }
            if (labelId) {
                element.setAttribute('id', labelId);
            }
            if (text) {
                element.setAttribute('data-text', text);
            }
            if (status) {
                element.setAttribute('data-status', text)
            }
            if (value) {
                element.setAttribute('data-value', value)
            }
        });

        return compressHtml(docClone.outerHTML);
    }

    // 保存结果
    const result = collectWindowInfo();
    result.modifiedHtml = generateModifiedHtml();

    // 收集元素信息
    function collectElementInfo(element) {
        if (!(element instanceof Element)) {
            console.warn('Skipping non-element node:', element);
            return null;
        }
        try {
            return {
                nid: element.getAttribute('data-backend-node-id') || '',
                label: element.getAttribute('data-label-id') || '',
                tag: element.tagName.toLowerCase(),
                area: element.getAttribute('data-bbox')?.split(',').map(Number) || [0, 0, 0, 0],
                text: element.innerText?.trim().replace(/\s{2,}/g, ' ') || '',
                id: element.getAttribute('id') || '',
                role: element.getAttribute('role') || '',
                ariaLabel: element.getAttribute('aria-label') || '',
                href: element.getAttribute('href') || ''
            };
        } catch (error) {
            console.warn(`Failed to collect info for element ${element.tagName}:`, error);
            return null;
        }
    }

    result.elementInfo = {
        allElements: Array.from(traverseDOM(document.documentElement))
            .map(collectElementInfo)
            .filter(info => info !== null),
        clickableElements: Array.from(document.querySelectorAll('[data-label-id]'))
            .map(collectElementInfo)
            .filter(info => info !== null)
    };

    // 验证分配
    let missingInteractiveId = 0;
    let missingBbox = 0;
    for (const element of document.querySelectorAll('*')) {
        if (isInteractiveElement(element) && !element.hasAttribute('data-backend-node-id')) {
            console.warn(`Interactive element missing data-backend-node-id:`, element);
            missingInteractiveId++;
        }
        if (!element.hasAttribute('data-bbox')) {
            console.warn(`Element missing data-bbox:`, element);
            missingBbox++;
        }
    }
    console.log(`Verification: ${missingInteractiveId} interactive elements missing data-backend-node-id, ${missingBbox} elements missing bbox`);

    return result;
}

// 动态监听 DOM 变化
function observeDOMChanges() {
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        for (const element of traverseDOM(node)) {
                            processDOM().then(() => console.log('Processed new DOM nodes'));
                        }
                    }
                }
            }
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
}

// 确保 DOM 加载完成后再执行
document.addEventListener('DOMContentLoaded', () => {
    processDOM().then(result => {
        console.log('DOM processing complete:', result);
        observeDOMChanges();
    }).catch(error => {
        console.error('DOM processing failed:', error);
    });
});