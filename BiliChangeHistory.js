// ==UserScript==
// @name         Bilibili 换一换历史记录
// @namespace    https://github.com/MaoShiSanKe/Bilibili_Change_History
// @version      2.0
// @description  为Bilibili主页上的 换一换 添加回滚功能，可配置历史记录限制
// @author       MaoShiSanKe
// @match        *://www.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置加载 ====================
    let historyLimit     = GM_getValue('historyLimit', 3);
    let autoDelete       = GM_getValue('autoDelete', true);
    let confirmClear     = GM_getValue('confirmClear', true);       // 二次确认，默认开启
    let shortcutEnabled  = GM_getValue('shortcutEnabled', false);   // 快捷键总开关，默认关闭
    let shortcutBack     = GM_getValue('shortcutBack', '');         // 回退快捷键
    let shortcutNext     = GM_getValue('shortcutNext', '');         // 前进快捷键
    let shortcutClear    = GM_getValue('shortcutClear', '');        // 清除快捷键（键盘）
    let clearMouseBtn    = GM_getValue('clearMouseBtn', 2);         // 清除鼠标键 0=左 1=中 2=右，默认右键

    const feedHistory = [];
    let feedHistoryIndex = 0;
    let historyLimitCommandId, autoDeleteCommandId, confirmClearCommandId, shortcutCommandId, clearHistoryCommandId;

    // ==================== 样式注入 ====================
    GM_addStyle(`
        /* ---- 通用弹窗遮罩 ---- */
        #bch-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,.45);
            z-index: 99998;
            display: flex; align-items: center; justify-content: center;
            animation: bch-fade-in .15s ease;
        }
        /* ---- 弹窗主体 ---- */
        #bch-modal {
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,.18);
            padding: 28px 32px 22px;
            min-width: 320px; max-width: 480px;
            position: relative;
            z-index: 99999;
            font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
            color: #333;
            animation: bch-slide-up .18s ease;
        }
        @media (prefers-color-scheme: dark) {
            #bch-modal { background: #1e2328; color: #e0e0e0; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
            .bch-input { background: #2a2f36 !important; color: #e0e0e0 !important; border-color: #444 !important; }
            .bch-section { border-color: #333 !important; }
            .bch-shortcut-row { background: #2a2f36 !important; }
            .bch-shortcut-label { color: #aaa !important; }
            .bch-shortcut-key { background: #1e2328 !important; border-color: #444 !important; color: #e0e0e0 !important; }
        }
        #bch-modal h2 {
            margin: 0 0 16px; font-size: 16px; font-weight: 600;
            display: flex; align-items: center; gap: 8px;
        }
        #bch-modal h2 .bch-icon { font-size: 18px; }
        .bch-modal-close {
            position: absolute; top: 14px; right: 16px;
            font-size: 20px; cursor: pointer; color: #999; line-height: 1;
            background: none; border: none; padding: 2px 6px; border-radius: 4px;
            transition: background .15s;
        }
        .bch-modal-close:hover { background: #f0f0f0; color: #333; }
        /* ---- Toast ---- */
        #bch-toast-container {
            position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
            z-index: 99999; display: flex; flex-direction: column; gap: 8px; align-items: center;
            pointer-events: none;
        }
        .bch-toast {
            background: rgba(30,30,30,.92); color: #fff;
            padding: 9px 20px; border-radius: 20px;
            font-size: 14px; font-family: -apple-system, 'PingFang SC', sans-serif;
            box-shadow: 0 4px 16px rgba(0,0,0,.2);
            animation: bch-fade-in .2s ease;
            transition: opacity .3s;
            white-space: nowrap;
        }
        .bch-toast.success { background: rgba(0,150,80,.92); }
        .bch-toast.warn    { background: rgba(200,100,0,.92); }
        .bch-toast.error   { background: rgba(200,30,30,.92); }
        /* ---- 按钮 ---- */
        .bch-btn-row {
            display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;
        }
        .bch-btn {
            padding: 7px 20px; border-radius: 6px; border: none;
            font-size: 14px; cursor: pointer; font-weight: 500; transition: filter .15s;
        }
        .bch-btn:hover { filter: brightness(.92); }
        .bch-btn-primary { background: #00a1d6; color: #fff; }
        .bch-btn-danger   { background: #e53935; color: #fff; }
        .bch-btn-ghost    { background: #f0f0f0; color: #555; }
        /* ---- 输入框 ---- */
        .bch-input {
            width: 100%; box-sizing: border-box;
            padding: 8px 10px; border-radius: 6px;
            border: 1px solid #ddd; font-size: 14px;
            outline: none; transition: border .15s;
            margin-top: 6px;
        }
        .bch-input:focus { border-color: #00a1d6; }
        .bch-label { font-size: 13px; color: #666; margin-bottom: 4px; display: block; }
        .bch-field { margin-bottom: 14px; }
        /* ---- 开关 ---- */
        .bch-toggle-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 0; border-bottom: 1px solid #f0f0f0;
            font-size: 14px;
        }
        .bch-toggle-row:last-of-type { border-bottom: none; }
        .bch-toggle {
            position: relative; width: 40px; height: 22px; cursor: pointer;
        }
        .bch-toggle input { opacity: 0; width: 0; height: 0; }
        .bch-toggle-slider {
            position: absolute; inset: 0;
            background: #ccc; border-radius: 22px; transition: .25s;
        }
        .bch-toggle-slider:before {
            content: ''; position: absolute;
            height: 16px; width: 16px;
            left: 3px; bottom: 3px;
            background: white; border-radius: 50%; transition: .25s;
        }
        .bch-toggle input:checked + .bch-toggle-slider { background: #00a1d6; }
        .bch-toggle input:checked + .bch-toggle-slider:before { transform: translateX(18px); }
        /* ---- 快捷键录制区 ---- */
        .bch-section {
            border: 1px solid #eee; border-radius: 8px;
            padding: 14px 16px; margin-top: 14px;
        }
        .bch-section-title {
            font-size: 13px; font-weight: 600; color: #888; margin-bottom: 12px;
        }
        .bch-shortcut-row {
            display: flex; align-items: center; gap: 10px;
            background: #f8f8f8; border-radius: 6px;
            padding: 8px 12px; margin-bottom: 8px;
        }
        .bch-shortcut-row:last-child { margin-bottom: 0; }
        .bch-shortcut-label { flex: 1; font-size: 13px; color: #555; }
        .bch-shortcut-key {
            padding: 4px 12px; border-radius: 5px; border: 1px solid #ddd;
            background: #fff; font-size: 13px; cursor: pointer; min-width: 80px;
            text-align: center; color: #333; outline: none; transition: border .15s;
            user-select: none;
        }
        .bch-shortcut-key.recording {
            border-color: #00a1d6; color: #00a1d6;
            animation: bch-pulse .8s infinite;
        }
        .bch-shortcut-key.empty { color: #bbb; font-style: italic; }
        .bch-shortcut-clear {
            font-size: 12px; cursor: pointer; color: #bbb; padding: 2px 6px;
            background: none; border: none; border-radius: 4px; transition: color .15s;
        }
        .bch-shortcut-clear:hover { color: #e53935; }
        .bch-tip {
            font-size: 12px; color: #999; margin-top: 10px; line-height: 1.6;
        }
        .bch-tip a { color: #00a1d6; cursor: pointer; text-decoration: none; }
        /* ---- 动画 ---- */
        @keyframes bch-fade-in  { from { opacity: 0; }        to { opacity: 1; } }
        @keyframes bch-slide-up { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes bch-pulse    { 0%,100% { box-shadow: 0 0 0 0 rgba(0,161,214,.4); } 50% { box-shadow: 0 0 0 5px rgba(0,161,214,0); } }
        /* ---- 禁用态 ---- */
        .biliplus-disabled { opacity: .4; pointer-events: none; cursor: default !important; }
    `);

    // ==================== Toast ====================
    function ensureToastContainer() {
        let c = document.getElementById('bch-toast-container');
        if (!c) { c = document.createElement('div'); c.id = 'bch-toast-container'; document.body.appendChild(c); }
        return c;
    }
    function showToast(msg, type = '', duration = 2200) {
        const c = ensureToastContainer();
        const t = document.createElement('div');
        t.className = 'bch-toast' + (type ? ' ' + type : '');
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            setTimeout(() => t.remove(), 350);
        }, duration);
    }

    // ==================== 通用弹窗 ====================
    function closeModal() {
        const ov = document.getElementById('bch-overlay');
        if (ov) ov.remove();
    }

    // 确认弹窗（二次确认）
    function showConfirm({ title, message, confirmText = '确认', cancelText = '取消', onConfirm, danger = false, tip = '' }) {
        closeModal();
        const overlay = document.createElement('div');
        overlay.id = 'bch-overlay';
        overlay.innerHTML = `
            <div id="bch-modal">
                <button class="bch-modal-close" id="bch-modal-close">×</button>
                <h2><span class="bch-icon">${danger ? '⚠️' : 'ℹ️'}</span>${title}</h2>
                <div style="font-size:14px;line-height:1.7;color:#555;">${message}</div>
                ${tip ? `<div class="bch-tip">${tip}</div>` : ''}
                <div class="bch-btn-row">
                    <button class="bch-btn bch-btn-ghost" id="bch-cancel">${cancelText}</button>
                    <button class="bch-btn ${danger ? 'bch-btn-danger' : 'bch-btn-primary'}" id="bch-confirm">${confirmText}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
        document.getElementById('bch-modal-close').addEventListener('click', closeModal);
        document.getElementById('bch-cancel').addEventListener('click', closeModal);
        document.getElementById('bch-confirm').addEventListener('click', () => { closeModal(); onConfirm && onConfirm(); });
    }

    // 提示弹窗（单按钮）
    function showAlert({ title, message, btnText = '好的', icon = 'ℹ️', tip = '' }) {
        closeModal();
        const overlay = document.createElement('div');
        overlay.id = 'bch-overlay';
        overlay.innerHTML = `
            <div id="bch-modal">
                <button class="bch-modal-close" id="bch-modal-close">×</button>
                <h2><span class="bch-icon">${icon}</span>${title}</h2>
                <div style="font-size:14px;line-height:1.7;color:#555;">${message}</div>
                ${tip ? `<div class="bch-tip">${tip}</div>` : ''}
                <div class="bch-btn-row">
                    <button class="bch-btn bch-btn-primary" id="bch-confirm">${btnText}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
        document.getElementById('bch-modal-close').addEventListener('click', closeModal);
        document.getElementById('bch-confirm').addEventListener('click', closeModal);
    }

    // ==================== 设置面板 ====================
    const MOUSE_BTN_LABELS = { 0: '左键', 1: '中键', 2: '右键' };
    let recordingTarget = null; // 当前录制目标 key
    let tempShortcuts = {};

    function openSettings() {
        closeModal();
        tempShortcuts = {
            back: shortcutBack, next: shortcutNext,
            clear: shortcutClear, clearMouse: clearMouseBtn
        };

        const overlay = document.createElement('div');
        overlay.id = 'bch-overlay';
        overlay.innerHTML = `
            <div id="bch-modal" style="min-width:380px;max-width:520px;">
                <button class="bch-modal-close" id="bch-modal-close">×</button>
                <h2><span class="bch-icon">⚙️</span>换一换历史 · 设置</h2>

                <!-- 开关区 -->
                <div class="bch-toggle-row">
                    <span>🗑️ 自动删除超出历史记录</span>
                    <label class="bch-toggle"><input type="checkbox" id="s-autoDelete" ${autoDelete ? 'checked' : ''}><span class="bch-toggle-slider"></span></label>
                </div>
                <div class="bch-toggle-row">
                    <span>❓ 清除时二次确认</span>
                    <label class="bch-toggle"><input type="checkbox" id="s-confirmClear" ${confirmClear ? 'checked' : ''}><span class="bch-toggle-slider"></span></label>
                </div>
                <div class="bch-toggle-row">
                    <span>⌨️ 启用快捷键</span>
                    <label class="bch-toggle"><input type="checkbox" id="s-shortcutEnabled" ${shortcutEnabled ? 'checked' : ''}><span class="bch-toggle-slider"></span></label>
                </div>

                <!-- 历史限制 -->
                <div class="bch-field" style="margin-top:16px;">
                    <label class="bch-label">📦 历史记录上限（0 = 无限制，自动删除开启时生效）</label>
                    <input class="bch-input" type="number" id="s-historyLimit" min="0" value="${historyLimit}" />
                </div>

                <!-- 快捷键配置 -->
                <div class="bch-section" id="s-shortcut-section" style="${shortcutEnabled ? '' : 'opacity:.45;pointer-events:none;'}">
                    <div class="bch-section-title">快捷键配置（点击方框后按下按键录制，支持修饰键组合）</div>
                    ${buildShortcutRow('back', '⬅️ 回退', shortcutBack)}
                    ${buildShortcutRow('next', '➡️ 前进', shortcutNext)}
                    ${buildShortcutRow('clear-kb', '🗑️ 清除（键盘）', shortcutClear)}
                    ${buildMouseRow()}
                </div>
                <div class="bch-tip">
                    💡 「清除」操作：鼠标按键默认为 <b>右键</b>；清除按钮上响应配置的鼠标键。<br>
                    开启二次确认后首次清除时会提示可关闭确认弹窗。
                </div>
                <div class="bch-btn-row">
                    <button class="bch-btn bch-btn-ghost" id="bch-cancel">取消</button>
                    <button class="bch-btn bch-btn-primary" id="bch-confirm">保存设置</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        // 快捷键开关联动禁用
        document.getElementById('s-shortcutEnabled').addEventListener('change', e => {
            document.getElementById('s-shortcut-section').style.cssText =
                e.target.checked ? '' : 'opacity:.45;pointer-events:none;';
        });

        // 录制快捷键
        overlay.querySelectorAll('.bch-shortcut-key[data-key]').forEach(el => {
            el.addEventListener('click', () => startRecording(el));
        });
        overlay.querySelectorAll('.bch-shortcut-clear').forEach(el => {
            el.addEventListener('click', () => {
                const k = el.dataset.clear;
                tempShortcuts[k] = '';
                const box = overlay.querySelector(`.bch-shortcut-key[data-key="${k}"]`);
                if (box) { box.textContent = '未设置'; box.classList.add('empty'); }
            });
        });

        // 鼠标键选择
        const mouseSelect = overlay.querySelector('#mouse-btn-select');
        if (mouseSelect) {
            mouseSelect.addEventListener('change', () => {
                tempShortcuts.clearMouse = parseInt(mouseSelect.value);
            });
        }

        overlay.addEventListener('click', e => { if (e.target === overlay) { stopRecording(); closeModal(); } });
        document.getElementById('bch-modal-close').addEventListener('click', () => { stopRecording(); closeModal(); });
        document.getElementById('bch-cancel').addEventListener('click', () => { stopRecording(); closeModal(); });
        document.getElementById('bch-confirm').addEventListener('click', saveSettings);
    }

    function buildShortcutRow(key, label, value) {
        const display = value || '未设置';
        const isEmpty = !value;
        return `
        <div class="bch-shortcut-row">
            <span class="bch-shortcut-label">${label}</span>
            <button class="bch-shortcut-key ${isEmpty ? 'empty' : ''}" data-key="${key}">${display}</button>
            <button class="bch-shortcut-clear" data-clear="${key}" title="清除此快捷键">✕</button>
        </div>`;
    }

    function buildMouseRow() {
        const opts = Object.entries(MOUSE_BTN_LABELS).map(([v, l]) =>
            `<option value="${v}" ${clearMouseBtn == v ? 'selected' : ''}>${l}</option>`
        ).join('');
        return `
        <div class="bch-shortcut-row">
            <span class="bch-shortcut-label">🖱️ 清除按钮鼠标键</span>
            <select id="mouse-btn-select" class="bch-shortcut-key" style="cursor:pointer;">${opts}</select>
        </div>`;
    }

    function startRecording(el) {
        if (recordingTarget) stopRecording();
        recordingTarget = el;
        el.classList.add('recording');
        el.textContent = '请按下按键…';

        function onKeyDown(e) {
            e.preventDefault(); e.stopPropagation();
            const parts = [];
            if (e.ctrlKey)  parts.push('Ctrl');
            if (e.altKey)   parts.push('Alt');
            if (e.shiftKey) parts.push('Shift');
            if (e.metaKey)  parts.push('Meta');
            const key = e.key;
            if (!['Control','Alt','Shift','Meta'].includes(key)) {
                parts.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key);
                const combo = parts.join('+');
                el.textContent = combo;
                el.classList.remove('recording', 'empty');
                tempShortcuts[el.dataset.key] = combo;
                stopRecording();
            }
        }
        el._keyHandler = onKeyDown;
        document.addEventListener('keydown', onKeyDown, true);
    }

    function stopRecording() {
        if (!recordingTarget) return;
        document.removeEventListener('keydown', recordingTarget._keyHandler, true);
        recordingTarget.classList.remove('recording');
        recordingTarget = null;
    }

    function saveSettings() {
        stopRecording();
        const newLimit = parseInt(document.getElementById('s-historyLimit').value, 10);
        historyLimit    = isNaN(newLimit) || newLimit < 0 ? 3 : newLimit;
        autoDelete      = document.getElementById('s-autoDelete').checked;
        confirmClear    = document.getElementById('s-confirmClear').checked;
        shortcutEnabled = document.getElementById('s-shortcutEnabled').checked;
        shortcutBack    = tempShortcuts.back || '';
        shortcutNext    = tempShortcuts.next || '';
        shortcutClear   = tempShortcuts['clear-kb'] || '';
        clearMouseBtn   = tempShortcuts.clearMouse ?? 2;

        if (autoDelete && historyLimit === 0) historyLimit = 3;

        GM_setValue('historyLimit', historyLimit);
        GM_setValue('autoDelete', autoDelete);
        GM_setValue('confirmClear', confirmClear);
        GM_setValue('shortcutEnabled', shortcutEnabled);
        GM_setValue('shortcutBack', shortcutBack);
        GM_setValue('shortcutNext', shortcutNext);
        GM_setValue('shortcutClear', shortcutClear);
        GM_setValue('clearMouseBtn', clearMouseBtn);

        closeModal();
        updateMenuCommands();
        bindShortcuts();
        showToast('✅ 设置已保存', 'success');
    }

    // ==================== 历史记录核心操作 ====================
    function doBack() {
        const feedCards = document.getElementsByClassName('feed-card');
        if (feedHistoryIndex === 0) return;
        if (feedHistoryIndex === feedHistory.length) {
            feedHistory.push(listInnerHTMLOfFeedCard(feedCards));
        }
        feedHistoryIndex--;
        for (let i = 0; i < feedCards.length; i++) {
            feedCards[i].innerHTML = feedHistory[feedHistoryIndex][i];
        }
        disableElementById('feed-roll-back-btn', feedHistoryIndex === 0);
        disableElementById('feed-roll-next-btn', false);
    }

    function doNext() {
        const feedCards = document.getElementsByClassName('feed-card');
        if (feedHistoryIndex >= feedHistory.length - 1) return;
        feedHistoryIndex++;
        for (let i = 0; i < feedCards.length; i++) {
            feedCards[i].innerHTML = feedHistory[feedHistoryIndex][i];
        }
        disableElementById('feed-roll-next-btn', feedHistoryIndex === feedHistory.length - 1);
        disableElementById('feed-roll-back-btn', false);
    }

    function doClear() {
        feedHistory.length = 0;
        feedHistoryIndex = 0;
        disableElementById('feed-roll-back-btn', true);
        disableElementById('feed-roll-next-btn', true);
        showToast('🗑️ 历史记录已清除', 'success');
    }

    function requestClear() {
        if (confirmClear) {
            showConfirm({
                title: '清除历史记录',
                message: `确定要清除所有 <b>${feedHistory.length}</b> 条历史记录吗？此操作不可撤销。`,
                tip: '💡 如不需要每次确认，可在 <a id="tip-open-settings">⚙️ 设置</a> 中关闭「二次确认」。',
                confirmText: '清除',
                cancelText: '取消',
                danger: true,
                onConfirm: doClear
            });
            // 设置里的链接跳转
            setTimeout(() => {
                const a = document.getElementById('tip-open-settings');
                if (a) a.addEventListener('click', () => { closeModal(); openSettings(); });
            }, 50);
        } else {
            doClear();
        }
    }

    // ==================== 菜单命令 ====================
    function updateMenuCommands() {
        [historyLimitCommandId, autoDeleteCommandId, confirmClearCommandId, shortcutCommandId, clearHistoryCommandId]
            .filter(Boolean).forEach(id => GM_unregisterMenuCommand(id));

        clearHistoryCommandId  = GM_registerMenuCommand('🗑️ 清除历史记录（点击清除按钮）', () => requestClear());
        autoDeleteCommandId    = GM_registerMenuCommand(`${autoDelete ? '✅' : '❌'} 自动删除：${autoDelete ? '已开启' : '已关闭'}`, openSettings);
        confirmClearCommandId  = GM_registerMenuCommand(`${confirmClear ? '✅' : '❌'} 二次确认：${confirmClear ? '已开启' : '已关闭'}`, openSettings);
        shortcutCommandId      = GM_registerMenuCommand(`${shortcutEnabled ? '✅' : '❌'} 快捷键：${shortcutEnabled ? '已启用' : '已关闭'}`, openSettings);
        historyLimitCommandId  = GM_registerMenuCommand('⚙️ 打开设置面板', openSettings);
    }

    updateMenuCommands();

    // ==================== 快捷键绑定 ====================
    function parseCombo(e) {
        const parts = [];
        if (e.ctrlKey)  parts.push('Ctrl');
        if (e.altKey)   parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        if (e.metaKey)  parts.push('Meta');
        const key = e.key;
        if (!['Control','Alt','Shift','Meta'].includes(key)) {
            parts.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key);
        }
        return parts.join('+');
    }

    let _kbHandler = null;
    function bindShortcuts() {
        if (_kbHandler) document.removeEventListener('keydown', _kbHandler, true);
        if (!shortcutEnabled) return;
        _kbHandler = (e) => {
            // 焦点在输入框时不触发
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
            const combo = parseCombo(e);
            if (!combo) return;
            if (shortcutBack  && combo === shortcutBack)  { e.preventDefault(); doBack(); }
            if (shortcutNext  && combo === shortcutNext)  { e.preventDefault(); doNext(); }
            if (shortcutClear && combo === shortcutClear) { e.preventDefault(); requestClear(); }
        };
        document.addEventListener('keydown', _kbHandler, true);
    }
    bindShortcuts();

    // ==================== 按钮 DOM ====================
    const feedRollBackBtn = `<button id="feed-roll-back-btn" class="primary-btn roll-btn biliplus-disabled" style="margin-top:10px;" title="回退到上一组推荐"><span>回</span></button>`;
    const feedRollNextBtn = `<button id="feed-roll-next-btn" class="primary-btn roll-btn biliplus-disabled" style="margin-top:10px;" title="前进到下一组推荐"><span>行</span></button>`;
    const clearHistoryBtn = `<button id="clear-history-btn" class="primary-btn roll-btn" style="margin-top:10px;" title="清除历史记录"><span>清</span></button>`;
    const settingsBtn     = `<button id="bch-settings-btn" class="primary-btn roll-btn" style="margin-top:10px;" title="换一换历史·设置"><span>设</span></button>`;

    const targetNode = document.querySelector('.recommended-container_floor-aside');
    if (targetNode) {
        const observer = new MutationObserver(() => {
            const feedRollBtn = document.querySelector('.roll-btn');

            if (feedRollBtn && !document.getElementById('feed-roll-back-btn')) {
                [feedRollBackBtn, feedRollNextBtn, clearHistoryBtn, settingsBtn].forEach(html => {
                    const el = document.createElement('span');
                    feedRollBtn.parentNode.appendChild(el);
                    el.outerHTML = html;
                });

                document.getElementById('feed-roll-back-btn').addEventListener('click', doBack);
                document.getElementById('feed-roll-next-btn').addEventListener('click', doNext);

                // 清除按钮：响应配置的鼠标键
                const clearBtn = document.getElementById('clear-history-btn');
                clearBtn.addEventListener('contextmenu', e => { e.preventDefault(); if (clearMouseBtn === 2) requestClear(); });
                clearBtn.addEventListener('click', e => { if (clearMouseBtn === 0) requestClear(); });
                clearBtn.addEventListener('mousedown', e => { if (e.button === 1 && clearMouseBtn === 1) { e.preventDefault(); requestClear(); } });
                // 提示当前鼠标键
                clearBtn.title = `清除历史记录（${MOUSE_BTN_LABELS[clearMouseBtn]}点击）`;

                document.getElementById('bch-settings-btn').addEventListener('click', openSettings);
            }

            if (feedRollBtn && !feedRollBtn.id) {
                feedRollBtn.id = 'feed-roll-btn';
                feedRollBtn.addEventListener('click', () => {
                    setTimeout(() => {
                        if (feedHistoryIndex === feedHistory.length) {
                            const feedCards = listInnerHTMLOfFeedCard(document.getElementsByClassName('feed-card'));
                            feedHistory.push(feedCards);
                            if (autoDelete && historyLimit > 0 && feedHistory.length > historyLimit) {
                                feedHistory.shift();
                                feedHistoryIndex--;
                            }
                        }
                        feedHistoryIndex = feedHistory.length;
                        disableElementById('feed-roll-back-btn', false);
                        disableElementById('feed-roll-next-btn', true);
                    });
                });
                observer.disconnect();
            }
        });
        observer.observe(targetNode, { childList: true, subtree: true });
    }

    // ==================== 工具函数 ====================
    function disableElementById(id, bool) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('biliplus-disabled', bool);
    }

    function listInnerHTMLOfFeedCard(feedCardElements) {
        return Array.from(feedCardElements).map(fc => fc.innerHTML);
    }

})();
