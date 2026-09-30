// ==UserScript==
// @name         Bilibili 换一换历史记录
// @namespace    https://github.com/MaoShiSanKe/Bilibili_Change_History
// @version      3.0
// @description  为Bilibili主页上的 换一换 添加回滚功能，配置导出/导入、统计、历史浏览器等
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

    // ==================== 默认配置 ====================
    const DEFAULTS = {
        historyLimit:    3,
        autoDelete:      true,
        confirmClear:    true,
        shortcutEnabled: false,
        shortcutBack:    '',
        shortcutNext:    '',
        shortcutClear:   '',
        clearMouseBtn:   2,
        autoSave:        true,
        showPreview:     true,
        showStats:       true,
    };

    // ==================== 配置加载 ====================
    let historyLimit    = GM_getValue('historyLimit',    DEFAULTS.historyLimit);
    let autoDelete      = GM_getValue('autoDelete',      DEFAULTS.autoDelete);
    let confirmClear    = GM_getValue('confirmClear',    DEFAULTS.confirmClear);
    let shortcutEnabled = GM_getValue('shortcutEnabled', DEFAULTS.shortcutEnabled);
    let shortcutBack    = GM_getValue('shortcutBack',    DEFAULTS.shortcutBack);
    let shortcutNext    = GM_getValue('shortcutNext',    DEFAULTS.shortcutNext);
    let shortcutClear   = GM_getValue('shortcutClear',   DEFAULTS.shortcutClear);
    let clearMouseBtn   = GM_getValue('clearMouseBtn',   DEFAULTS.clearMouseBtn);
    let autoSave        = GM_getValue('autoSave',        DEFAULTS.autoSave);
    let showPreview     = GM_getValue('showPreview',     DEFAULTS.showPreview);
    let showStats       = GM_getValue('showStats',       DEFAULTS.showStats);

    // ==================== 统计数据 ====================
    let stats = GM_getValue('stats', { rollCount: 0, backCount: 0, nextCount: 0, clearCount: 0 });
    function saveStats() { GM_setValue('stats', stats); }

    // ==================== 历史记录状态 ====================
    const feedHistory = [];   // [{ cards: [...innerHTML], titles: [...string], time: timestamp }]
    let feedHistoryIndex = 0;

    // ==================== 会话恢复 ====================
    const SESSION_KEY = 'bch_session';

    function saveSession() {
        if (!autoSave) return;
        try {
            const feedCards = document.getElementsByClassName('feed-card');
            if (!feedCards.length) return;
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                cards:  Array.from(feedCards).map(fc => fc.innerHTML),
                titles: extractTitlesLive(),
                time:   Date.now()
            }));
        } catch(e) {}
    }

    function restoreSession() {
        if (!autoSave) return;
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) return;
            const snapshot = JSON.parse(raw);
            if (!snapshot || !snapshot.cards) return;
            const tryRestore = setInterval(() => {
                const feedCards = document.getElementsByClassName('feed-card');
                if (feedCards.length >= snapshot.cards.length) {
                    clearInterval(tryRestore);
                    for (let i = 0; i < Math.min(feedCards.length, snapshot.cards.length); i++) {
                        feedCards[i].innerHTML = snapshot.cards[i];
                    }
                    showToast('🔄 已恢复上次离开时的内容', '', 3000);
                }
            }, 300);
            setTimeout(() => clearInterval(tryRestore), 8000);
        } catch(e) {}
    }

    window.addEventListener('beforeunload', saveSession);

    // ==================== 标题提取 ====================
    function extractTitlesLive() {
        const feedCards = document.getElementsByClassName('feed-card');
        return Array.from(feedCards).map(fc => {
            const title = fc.querySelector('h3')?.textContent?.trim();
            return title || '未知标题';
        });
    }

    function extractTitlesFromHTML(htmlArr) {
        return htmlArr.map(html => {
            const div = document.createElement('div');
            div.innerHTML = html;
            const title = div.querySelector('h3')?.textContent?.trim();
            return title || '未知标题';
        });
    }

    function snapTitles(snap) {
        return snap.titles || extractTitlesFromHTML(snap.cards || snap);
    }

    // ==================== 样式 ====================
    GM_addStyle(`
        #bch-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,.45);
            z-index: 99998; display: flex; align-items: center; justify-content: center;
            animation: bch-fade-in .15s ease;
        }
        #bch-modal {
            background: #fff; border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,.18);
            padding: 28px 32px 22px;
            min-width: 320px; max-width: 540px; width: 90vw;
            max-height: 88vh; overflow-y: auto;
            position: relative; z-index: 99999;
            font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
            color: #333; animation: bch-slide-up .18s ease; scrollbar-width: thin;
        }
        @media (prefers-color-scheme: dark) {
            #bch-modal              { background: #1e2328; color: #e0e0e0; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
            .bch-input              { background: #2a2f36 !important; color: #e0e0e0 !important; border-color: #444 !important; }
            .bch-section            { border-color: #333 !important; }
            .bch-shortcut-row       { background: #2a2f36 !important; }
            .bch-shortcut-label     { color: #aaa !important; }
            .bch-shortcut-key       { background: #1e2328 !important; border-color: #444 !important; color: #e0e0e0 !important; }
            .bch-toggle-row         { border-color: #333 !important; }
            .bch-btn-ghost          { background: #2a2f36 !important; color: #ccc !important; }
            .bch-modal-close:hover  { background: #333 !important; }
            .bch-history-item       { background: #2a2f36 !important; border-color: #444 !important; }
            .bch-history-item:hover { background: #333 !important; }
            .bch-history-item.cur   { border-color: #00a1d6 !important; background: #1a3040 !important; }
            .bch-stat-card          { background: #2a2f36 !important; }
            .bch-preview-box        { background: #1e2328 !important; color: #ccc !important; border-color: #444 !important; }
            .bch-tab                { color: #aaa !important; }
            .bch-tab.active         { color: #00a1d6 !important; border-color: #00a1d6 !important; }
            .bch-import-area        { border-color: #444 !important; color: #666 !important; }
            .bch-divider            { border-color: #333 !important; }
        }
        #bch-modal h2 { margin: 0 0 16px; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
        .bch-modal-close {
            position: absolute; top: 14px; right: 16px; font-size: 20px;
            cursor: pointer; color: #999; line-height: 1;
            background: none; border: none; padding: 2px 6px; border-radius: 4px; transition: background .15s;
        }
        .bch-modal-close:hover { background: #f0f0f0; color: #333; }
        /* toast */
        #bch-toast-container {
            position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
            z-index: 999999; display: flex; flex-direction: column; gap: 8px; align-items: center;
            pointer-events: none;
        }
        .bch-toast {
            background: rgba(30,30,30,.92); color: #fff; padding: 9px 20px; border-radius: 20px;
            font-size: 14px; font-family: -apple-system, 'PingFang SC', sans-serif;
            box-shadow: 0 4px 16px rgba(0,0,0,.2); animation: bch-fade-in .2s ease;
            transition: opacity .3s; white-space: nowrap;
        }
        .bch-toast.success { background: rgba(0,150,80,.92); }
        .bch-toast.warn    { background: rgba(200,100,0,.92); }
        .bch-toast.error   { background: rgba(200,30,30,.92); }
        /* buttons */
        .bch-btn-row { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
        .bch-btn { padding: 7px 20px; border-radius: 6px; border: none; font-size: 14px; cursor: pointer; font-weight: 500; transition: filter .15s; }
        .bch-btn:hover   { filter: brightness(.92); }
        .bch-btn-primary { background: #00a1d6; color: #fff; }
        .bch-btn-danger  { background: #e53935; color: #fff; }
        .bch-btn-ghost   { background: #f0f0f0; color: #555; }
        .bch-btn-warn    { background: #f57c00; color: #fff; }
        /* inputs */
        .bch-input { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; border: 1px solid #ddd; font-size: 14px; outline: none; transition: border .15s; margin-top: 6px; }
        .bch-input:focus { border-color: #00a1d6; }
        .bch-label  { font-size: 13px; color: #666; margin-bottom: 4px; display: block; }
        .bch-field  { margin-bottom: 14px; }
        /* toggles */
        .bch-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
        .bch-toggle { position: relative; width: 40px; height: 22px; cursor: pointer; }
        .bch-toggle input { opacity: 0; width: 0; height: 0; }
        .bch-toggle-slider { position: absolute; inset: 0; background: #ccc; border-radius: 22px; transition: .25s; }
        .bch-toggle-slider:before { content: ''; position: absolute; height: 16px; width: 16px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .25s; }
        .bch-toggle input:checked + .bch-toggle-slider { background: #00a1d6; }
        .bch-toggle input:checked + .bch-toggle-slider:before { transform: translateX(18px); }
        /* shortcut */
        .bch-section { border: 1px solid #eee; border-radius: 8px; padding: 14px 16px; margin-top: 14px; }
        .bch-section-title { font-size: 13px; font-weight: 600; color: #888; margin-bottom: 12px; }
        .bch-shortcut-row { display: flex; align-items: center; gap: 10px; background: #f8f8f8; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; }
        .bch-shortcut-row:last-child { margin-bottom: 0; }
        .bch-shortcut-label { flex: 1; font-size: 13px; color: #555; }
        .bch-shortcut-key { padding: 4px 12px; border-radius: 5px; border: 1px solid #ddd; background: #fff; font-size: 13px; cursor: pointer; min-width: 80px; text-align: center; color: #333; outline: none; transition: border .15s; user-select: none; }
        .bch-shortcut-key.recording { border-color: #00a1d6; color: #00a1d6; animation: bch-pulse .8s infinite; }
        .bch-shortcut-key.empty { color: #bbb; font-style: italic; }
        .bch-shortcut-clear { font-size: 12px; cursor: pointer; color: #bbb; padding: 2px 6px; background: none; border: none; border-radius: 4px; transition: color .15s; }
        .bch-shortcut-clear:hover { color: #e53935; }
        .bch-tip { font-size: 12px; color: #999; margin-top: 10px; line-height: 1.6; }
        .bch-tip a { color: #00a1d6; cursor: pointer; text-decoration: none; }
        /* tabs */
        .bch-tabs { display: flex; border-bottom: 2px solid #f0f0f0; margin-bottom: 16px; }
        .bch-tab { padding: 8px 18px; font-size: 14px; cursor: pointer; color: #888; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color .15s, border-color .15s; background: none; border-top: none; border-left: none; border-right: none; }
        .bch-tab.active { color: #00a1d6; border-bottom-color: #00a1d6; font-weight: 600; }
        .bch-tab-panel { display: none; }
        .bch-tab-panel.active { display: block; }
        /* stats */
        .bch-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
        .bch-stat-card { background: #f8f8f8; border-radius: 8px; padding: 14px 16px; text-align: center; }
        .bch-stat-num   { font-size: 28px; font-weight: 700; color: #00a1d6; line-height: 1; }
        .bch-stat-label { font-size: 12px; color: #888; margin-top: 4px; }
        /* stats badge */
        #bch-stats-badge { position: absolute; top: -4px; right: -4px; background: #00a1d6; color: #fff; font-size: 10px; border-radius: 10px; padding: 1px 5px; line-height: 1.4; pointer-events: none; font-weight: 600; }
        /* history browser */
        .bch-history-list { max-height: 340px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; scrollbar-width: thin; }
        .bch-history-item { border: 1px solid #eee; border-radius: 8px; padding: 10px 14px; cursor: pointer; transition: background .15s, border-color .15s; background: #fafafa; }
        .bch-history-item:hover { background: #f0f8ff; border-color: #b0d8ee; }
        .bch-history-item.cur   { border-color: #00a1d6; background: #e8f5fc; }
        .bch-history-hdr  { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .bch-history-idx  { font-size: 12px; font-weight: 700; color: #00a1d6; }
        .bch-history-time { font-size: 11px; color: #bbb; }
        .bch-history-ttls { font-size: 12px; color: #777; line-height: 1.7; }
        /* preview tooltip */
        .bch-preview-box { position: fixed; z-index: 999997; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px 14px; box-shadow: 0 4px 20px rgba(0,0,0,.12); font-size: 12px; color: #555; line-height: 1.8; max-width: 240px; pointer-events: none; animation: bch-fade-in .15s ease; }
        .bch-preview-ttl { font-size: 11px; font-weight: 600; color: #888; margin-bottom: 6px; }
        /* import */
        .bch-import-area { border: 2px dashed #ddd; border-radius: 8px; padding: 16px; text-align: center; cursor: pointer; transition: border-color .2s; font-size: 13px; color: #aaa; margin-top: 8px; }
        .bch-import-area:hover { border-color: #00a1d6; color: #00a1d6; }
        .bch-import-area.drag  { border-color: #00a1d6; background: #e8f5fc; }
        /* divider */
        .bch-divider { border: none; border-top: 1px solid #f0f0f0; margin: 16px 0; }
        /* animations */
        @keyframes bch-fade-in  { from { opacity:0; }                        to { opacity:1; } }
        @keyframes bch-slide-up { from { transform:translateY(12px);opacity:0; } to { transform:translateY(0);opacity:1; } }
        @keyframes bch-pulse    { 0%,100% { box-shadow:0 0 0 0 rgba(0,161,214,.4); } 50% { box-shadow:0 0 0 5px rgba(0,161,214,0); } }
        .biliplus-disabled { opacity:.4; pointer-events:none; cursor:default !important; }
        #bch-settings-btn  { position: relative; }
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
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 350); }, duration);
    }

    // ==================== 通用弹窗 ====================
    function closeModal() {
        stopRecording();
        const ov = document.getElementById('bch-overlay');
        if (ov) ov.remove();
    }

    function showConfirm({ title, message, confirmText = '确认', cancelText = '取消', onConfirm, danger = false, tip = '' }) {
        closeModal();
        const overlay = document.createElement('div');
        overlay.id = 'bch-overlay';
        overlay.innerHTML = `
            <div id="bch-modal">
                <button class="bch-modal-close" id="bch-modal-close">×</button>
                <h2><span>${danger ? '⚠️' : 'ℹ️'}</span>${title}</h2>
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

    // ==================== 统计面板 ====================
    function openStats() {
        closeModal();
        const overlay = document.createElement('div');
        overlay.id = 'bch-overlay';
        overlay.innerHTML = `
            <div id="bch-modal">
                <button class="bch-modal-close" id="bch-modal-close">×</button>
                <h2><span>📊</span>使用统计</h2>
                <div class="bch-stat-grid">
                    <div class="bch-stat-card"><div class="bch-stat-num">${stats.rollCount}</div><div class="bch-stat-label">换一换次数</div></div>
                    <div class="bch-stat-card"><div class="bch-stat-num">${stats.backCount}</div><div class="bch-stat-label">回退次数</div></div>
                    <div class="bch-stat-card"><div class="bch-stat-num">${stats.nextCount}</div><div class="bch-stat-label">前进次数</div></div>
                    <div class="bch-stat-card"><div class="bch-stat-num">${stats.clearCount}</div><div class="bch-stat-label">清除次数</div></div>
                </div>
                <div style="font-size:12px;color:#aaa;text-align:center;">当前会话历史：${feedHistory.length} 组 &nbsp;|&nbsp; 当前指针：第 ${feedHistoryIndex + 1} 组</div>
                <div class="bch-btn-row">
                    <button class="bch-btn bch-btn-danger" id="stat-reset">重置统计</button>
                    <button class="bch-btn bch-btn-primary" id="bch-confirm">关闭</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
        document.getElementById('bch-modal-close').addEventListener('click', closeModal);
        document.getElementById('bch-confirm').addEventListener('click', closeModal);
        document.getElementById('stat-reset').addEventListener('click', () => {
            stats = { rollCount: 0, backCount: 0, nextCount: 0, clearCount: 0 };
            saveStats(); closeModal(); showToast('📊 统计数据已重置', 'success');
        });
    }

    // ==================== 历史浏览器 ====================
    function openHistoryBrowser() {
        closeModal();
        if (!feedHistory.length) { showToast('暂无历史记录', 'warn'); return; }

        const items = feedHistory.map((snap, i) => {
            const titles = snapTitles(snap);
            const time = snap.time ? new Date(snap.time).toLocaleTimeString() : '—';
            const isCur = (i === feedHistoryIndex);
            const ttls = titles.slice(0, 4).map(t => `<div>• ${t}</div>`).join('');
            return `
            <div class="bch-history-item${isCur ? ' cur' : ''}" data-index="${i}">
                <div class="bch-history-hdr">
                    <span class="bch-history-idx">第 ${i + 1} 组${isCur ? ' ← 当前' : ''}</span>
                    <span class="bch-history-time">${time}</span>
                </div>
                <div class="bch-history-ttls">${ttls}${titles.length > 4 ? `<div style="color:#bbb">…共 ${titles.length} 条</div>` : ''}</div>
            </div>`;
        }).join('');

        const overlay = document.createElement('div');
        overlay.id = 'bch-overlay';
        overlay.innerHTML = `
            <div id="bch-modal">
                <button class="bch-modal-close" id="bch-modal-close">×</button>
                <h2><span>📋</span>历史记录浏览器 <span style="font-size:13px;font-weight:400;color:#aaa;">共 ${feedHistory.length} 组</span></h2>
                <div class="bch-history-list">${items}</div>
                <div class="bch-tip" style="margin-top:10px;">💡 点击任意一组可直接跳转到该历史内容</div>
                <div class="bch-btn-row">
                    <button class="bch-btn bch-btn-ghost"  id="bch-cancel">关闭</button>
                    <button class="bch-btn bch-btn-danger" id="hist-clear">清除全部</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
        document.getElementById('bch-modal-close').addEventListener('click', closeModal);
        document.getElementById('bch-cancel').addEventListener('click', closeModal);
        document.getElementById('hist-clear').addEventListener('click', () => { closeModal(); requestClear(); });
        overlay.querySelectorAll('.bch-history-item').forEach(el => {
            el.addEventListener('click', () => { jumpToHistory(parseInt(el.dataset.index)); closeModal(); });
        });
    }

    function jumpToHistory(idx) {
        if (idx < 0 || idx >= feedHistory.length) return;
        const snap = feedHistory[idx];
        const cards = snap.cards || snap;
        const feedCards = document.getElementsByClassName('feed-card');
        for (let i = 0; i < Math.min(feedCards.length, cards.length); i++) {
            feedCards[i].innerHTML = cards[i];
        }
        feedHistoryIndex = idx;
        disableElementById('feed-roll-back-btn', feedHistoryIndex === 0);
        disableElementById('feed-roll-next-btn', feedHistoryIndex >= feedHistory.length - 1);
        updateStatsBadge();
        showToast(`📋 已跳转至第 ${idx + 1} 组`, '', 1800);
    }

    // ==================== 悬浮预览 ====================
    let previewBox = null;
    function removePreview() { if (previewBox) { previewBox.remove(); previewBox = null; } }
    function attachPreview(btn, getSnap, label) {
        btn.addEventListener('mouseenter', e => {
            if (!showPreview) return;
            const snap = getSnap();
            if (!snap) return;
            const titles = snapTitles(snap);
            removePreview();
            previewBox = document.createElement('div');
            previewBox.className = 'bch-preview-box';
            previewBox.innerHTML = `<div class="bch-preview-ttl">${label}</div>` +
                titles.slice(0, 6).map(t => `<div>• ${t}</div>`).join('') +
                (titles.length > 6 ? `<div style="color:#bbb">…共 ${titles.length} 条</div>` : '');
            document.body.appendChild(previewBox);
            positionPreview(e);
        });
        btn.addEventListener('mousemove', positionPreview);
        btn.addEventListener('mouseleave', removePreview);
    }
    function positionPreview(e) {
        if (!previewBox) return;
        const x = e.clientX + 14, y = e.clientY + 14;
        const pw = previewBox.offsetWidth || 240, ph = previewBox.offsetHeight || 100;
        previewBox.style.left = (x + pw > window.innerWidth  ? x - pw - 28 : x) + 'px';
        previewBox.style.top  = (y + ph > window.innerHeight ? y - ph - 28 : y) + 'px';
    }

    // ==================== 统计徽章 ====================
    function updateStatsBadge() {
        const btn = document.getElementById('bch-settings-btn');
        if (!btn) return;
        let badge = document.getElementById('bch-stats-badge');
        if (!showStats) { if (badge) badge.remove(); return; }
        if (!badge) { badge = document.createElement('span'); badge.id = 'bch-stats-badge'; btn.appendChild(badge); }
        badge.textContent = feedHistory.length;
    }

    // ==================== 配置管理 ====================
    const CONFIG_KEYS = ['historyLimit','autoDelete','confirmClear','shortcutEnabled',
        'shortcutBack','shortcutNext','shortcutClear','clearMouseBtn','autoSave','showPreview','showStats'];

    function exportConfig() {
        const cfg = {};
        CONFIG_KEYS.forEach(k => { cfg[k] = GM_getValue(k, DEFAULTS[k]); });
        cfg._stats = stats; cfg._version = '3.0'; cfg._exported = new Date().toISOString();
        const json = JSON.stringify(cfg, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `bch-config-${Date.now()}.json`; a.click();
        URL.revokeObjectURL(url);
        showToast('📤 配置已导出', 'success');
    }

    function importConfig(json) {
        let cfg;
        try { cfg = JSON.parse(json); } catch(e) { showToast('❌ 文件格式错误', 'error'); return; }
        CONFIG_KEYS.forEach(k => { if (k in cfg) GM_setValue(k, cfg[k]); });
        if (cfg._stats) { stats = cfg._stats; saveStats(); }
        applyConfig(); updateMenuCommands(); bindShortcuts();
        showToast('📥 配置已导入并生效', 'success');
    }

    function applyConfig() {
        historyLimit    = GM_getValue('historyLimit',    DEFAULTS.historyLimit);
        autoDelete      = GM_getValue('autoDelete',      DEFAULTS.autoDelete);
        confirmClear    = GM_getValue('confirmClear',    DEFAULTS.confirmClear);
        shortcutEnabled = GM_getValue('shortcutEnabled', DEFAULTS.shortcutEnabled);
        shortcutBack    = GM_getValue('shortcutBack',    DEFAULTS.shortcutBack);
        shortcutNext    = GM_getValue('shortcutNext',    DEFAULTS.shortcutNext);
        shortcutClear   = GM_getValue('shortcutClear',   DEFAULTS.shortcutClear);
        clearMouseBtn   = GM_getValue('clearMouseBtn',   DEFAULTS.clearMouseBtn);
        autoSave        = GM_getValue('autoSave',        DEFAULTS.autoSave);
        showPreview     = GM_getValue('showPreview',     DEFAULTS.showPreview);
        showStats       = GM_getValue('showStats',       DEFAULTS.showStats);
    }

    function resetToDefaults() {
        CONFIG_KEYS.forEach(k => GM_setValue(k, DEFAULTS[k]));
        applyConfig(); updateMenuCommands(); bindShortcuts();
        showToast('🔄 已恢复默认配置', 'success');
    }

    // ==================== 设置面板 ====================
    const MOUSE_BTN_LABELS = { 0: '左键', 1: '中键', 2: '右键' };
    let recordingTarget = null, tempShortcuts = {};

    function openSettings(initialTab) {
        initialTab = initialTab || 'general';
        closeModal();
        tempShortcuts = { back: shortcutBack, next: shortcutNext, 'clear-kb': shortcutClear, clearMouse: clearMouseBtn };

        const overlay = document.createElement('div');
        overlay.id = 'bch-overlay';
        overlay.innerHTML = `
        <div id="bch-modal" style="min-width:380px;max-width:540px;">
            <button class="bch-modal-close" id="bch-modal-close">×</button>
            <h2><span>⚙️</span>换一换历史 · 设置</h2>
            <div class="bch-tabs">
                <button class="bch-tab ${initialTab==='general'  ?'active':''}" data-tab="general">常规</button>
                <button class="bch-tab ${initialTab==='shortcuts'?'active':''}" data-tab="shortcuts">快捷键</button>
                <button class="bch-tab ${initialTab==='data'     ?'active':''}" data-tab="data">数据与备份</button>
            </div>

            <!-- 常规 tab -->
            <div class="bch-tab-panel ${initialTab==='general'?'active':''}" id="tab-general">
                <div class="bch-toggle-row">
                    <span>🗑️ 自动删除超出的历史</span>
                    <label class="bch-toggle"><input type="checkbox" id="s-autoDelete" ${autoDelete?'checked':''}><span class="bch-toggle-slider"></span></label>
                </div>
                <div class="bch-toggle-row">
                    <span>❓ 清除时二次确认</span>
                    <label class="bch-toggle"><input type="checkbox" id="s-confirmClear" ${confirmClear?'checked':''}><span class="bch-toggle-slider"></span></label>
                </div>
                <div class="bch-toggle-row">
                    <span>🔄 刷新后自动恢复页面内容</span>
                    <label class="bch-toggle"><input type="checkbox" id="s-autoSave" ${autoSave?'checked':''}><span class="bch-toggle-slider"></span></label>
                </div>
                <div class="bch-toggle-row">
                    <span>👁️ 悬浮预览视频标题</span>
                    <label class="bch-toggle"><input type="checkbox" id="s-showPreview" ${showPreview?'checked':''}><span class="bch-toggle-slider"></span></label>
                </div>
                <div class="bch-toggle-row">
                    <span>🔢 「设」按钮显示历史数量徽章</span>
                    <label class="bch-toggle"><input type="checkbox" id="s-showStats" ${showStats?'checked':''}><span class="bch-toggle-slider"></span></label>
                </div>
                <div class="bch-field" style="margin-top:14px;">
                    <label class="bch-label">📦 历史记录上限（0 = 无限制，自动删除开启时生效）</label>
                    <input class="bch-input" type="number" id="s-historyLimit" min="0" value="${historyLimit}" />
                </div>
            </div>

            <!-- 快捷键 tab -->
            <div class="bch-tab-panel ${initialTab==='shortcuts'?'active':''}" id="tab-shortcuts">
                <div class="bch-toggle-row" style="margin-bottom:14px;">
                    <span>⌨️ 启用快捷键</span>
                    <label class="bch-toggle"><input type="checkbox" id="s-shortcutEnabled" ${shortcutEnabled?'checked':''}><span class="bch-toggle-slider"></span></label>
                </div>
                <div id="s-shortcut-section" style="${shortcutEnabled?'':'opacity:.45;pointer-events:none;'}">
                    <div class="bch-section-title">点击方框后按下按键录制，支持 Ctrl / Alt / Shift 组合</div>
                    ${buildShortcutRow('back',     '⬅️ 回退',         shortcutBack)}
                    ${buildShortcutRow('next',     '➡️ 前进',         shortcutNext)}
                    ${buildShortcutRow('clear-kb', '🗑️ 清除（键盘）', shortcutClear)}
                    ${buildMouseRow()}
                </div>
                <div class="bch-tip">💡 鼠标键作用于页面「清」按钮；键盘快捷键全局响应（输入框内除外）。</div>
            </div>

            <!-- 数据 tab -->
            <div class="bch-tab-panel ${initialTab==='data'?'active':''}" id="tab-data">
                <div class="bch-section-title">配置导出 / 导入</div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                    <button class="bch-btn bch-btn-primary" id="btn-export">📤 导出配置</button>
                    <button class="bch-btn bch-btn-ghost"   id="btn-import-trigger">📥 导入配置</button>
                </div>
                <input type="file" id="btn-import-file" accept=".json" style="display:none;">
                <div class="bch-import-area" id="import-drop-area">拖拽 .json 配置文件至此，或点击上方「导入配置」</div>
                <hr class="bch-divider">
                <div class="bch-section-title">其他操作</div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button class="bch-btn bch-btn-ghost" id="btn-stats">📊 使用统计</button>
                    <button class="bch-btn bch-btn-ghost" id="btn-history">📋 历史浏览器</button>
                    <button class="bch-btn bch-btn-warn"  id="btn-reset">🔄 恢复默认配置</button>
                </div>
                <div class="bch-tip" style="margin-top:12px;">💡 导出的 .json 文件包含所有设置和统计数据，可在新设备或重装后导入恢复。</div>
            </div>

            <div class="bch-btn-row">
                <button class="bch-btn bch-btn-ghost"   id="bch-cancel">取消</button>
                <button class="bch-btn bch-btn-primary" id="bch-confirm">保存设置</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        // Tab 切换
        overlay.querySelectorAll('.bch-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                overlay.querySelectorAll('.bch-tab, .bch-tab-panel').forEach(el => el.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
            });
        });

        // 快捷键开关
        document.getElementById('s-shortcutEnabled').addEventListener('change', e => {
            document.getElementById('s-shortcut-section').style.cssText = e.target.checked ? '' : 'opacity:.45;pointer-events:none;';
        });

        // 录制按键
        overlay.querySelectorAll('.bch-shortcut-key[data-key]').forEach(el => el.addEventListener('click', () => startRecording(el)));
        overlay.querySelectorAll('.bch-shortcut-clear').forEach(el => {
            el.addEventListener('click', () => {
                const k = el.dataset.clear;
                tempShortcuts[k] = '';
                const box = overlay.querySelector(`.bch-shortcut-key[data-key="${k}"]`);
                if (box) { box.textContent = '未设置'; box.classList.add('empty'); }
            });
        });

        const mouseSelect = overlay.querySelector('#mouse-btn-select');
        if (mouseSelect) mouseSelect.addEventListener('change', () => { tempShortcuts.clearMouse = parseInt(mouseSelect.value); });

        // 数据 tab
        document.getElementById('btn-export').addEventListener('click', exportConfig);
        document.getElementById('btn-import-trigger').addEventListener('click', () => document.getElementById('btn-import-file').click());
        document.getElementById('btn-import-file').addEventListener('change', e => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => { importConfig(ev.target.result); };
            reader.readAsText(file);
        });
        const dropArea = document.getElementById('import-drop-area');
        dropArea.addEventListener('dragover',  e => { e.preventDefault(); dropArea.classList.add('drag'); });
        dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag'));
        dropArea.addEventListener('drop', e => {
            e.preventDefault(); dropArea.classList.remove('drag');
            const file = e.dataTransfer.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => { closeModal(); importConfig(ev.target.result); };
            reader.readAsText(file);
        });
        document.getElementById('btn-stats').addEventListener('click',   () => { closeModal(); openStats(); });
        document.getElementById('btn-history').addEventListener('click', () => { closeModal(); openHistoryBrowser(); });
        document.getElementById('btn-reset').addEventListener('click', () => {
            showConfirm({ title: '恢复默认配置', message: '将重置所有设置为默认值，统计数据不受影响。确认？', confirmText: '恢复默认', onConfirm: resetToDefaults });
        });

        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
        document.getElementById('bch-modal-close').addEventListener('click', closeModal);
        document.getElementById('bch-cancel').addEventListener('click', closeModal);
        document.getElementById('bch-confirm').addEventListener('click', saveSettings);
    }

    function buildShortcutRow(key, label, value) {
        return `
        <div class="bch-shortcut-row">
            <span class="bch-shortcut-label">${label}</span>
            <button class="bch-shortcut-key ${value?'':'empty'}" data-key="${key}">${value||'未设置'}</button>
            <button class="bch-shortcut-clear" data-clear="${key}" title="清除此快捷键">✕</button>
        </div>`;
    }
    function buildMouseRow() {
        const opts = Object.entries(MOUSE_BTN_LABELS).map(([v, l]) =>
            `<option value="${v}" ${clearMouseBtn == v ? 'selected' : ''}>${l}</option>`).join('');
        return `
        <div class="bch-shortcut-row">
            <span class="bch-shortcut-label">🖱️ 清除按钮触发鼠标键</span>
            <select id="mouse-btn-select" class="bch-shortcut-key" style="cursor:pointer;">${opts}</select>
        </div>`;
    }

    function startRecording(el) {
        if (recordingTarget) stopRecording();
        recordingTarget = el;
        el.classList.add('recording'); el.textContent = '请按下按键…';
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
                el.textContent = combo; el.classList.remove('recording', 'empty');
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
        clearMouseBtn   = tempShortcuts.clearMouse !== undefined ? tempShortcuts.clearMouse : 2;
        autoSave        = document.getElementById('s-autoSave').checked;
        showPreview     = document.getElementById('s-showPreview').checked;
        showStats       = document.getElementById('s-showStats').checked;

        if (autoDelete && historyLimit === 0) historyLimit = 3;

        GM_setValue('historyLimit',    historyLimit);
        GM_setValue('autoDelete',      autoDelete);
        GM_setValue('confirmClear',    confirmClear);
        GM_setValue('shortcutEnabled', shortcutEnabled);
        GM_setValue('shortcutBack',    shortcutBack);
        GM_setValue('shortcutNext',    shortcutNext);
        GM_setValue('shortcutClear',   shortcutClear);
        GM_setValue('clearMouseBtn',   clearMouseBtn);
        GM_setValue('autoSave',        autoSave);
        GM_setValue('showPreview',     showPreview);
        GM_setValue('showStats',       showStats);

        const clearBtn = document.getElementById('clear-history-btn');
        if (clearBtn) clearBtn.title = `清除历史记录（${MOUSE_BTN_LABELS[clearMouseBtn]}点击）`;

        closeModal(); updateMenuCommands(); bindShortcuts(); updateStatsBadge();
        showToast('✅ 设置已保存', 'success');
    }

    // ==================== 历史核心操作 ====================
    function doBack() {
        const feedCards = document.getElementsByClassName('feed-card');
        if (feedHistoryIndex === 0) return;
        if (feedHistoryIndex === feedHistory.length) {
            feedHistory.push({ cards: listInnerHTMLOfFeedCard(feedCards), titles: extractTitlesLive(), time: Date.now() });
        }
        feedHistoryIndex--;
        const snap = feedHistory[feedHistoryIndex];
        const cards = snap.cards || snap;
        for (let i = 0; i < feedCards.length; i++) feedCards[i].innerHTML = cards[i];
        disableElementById('feed-roll-back-btn', feedHistoryIndex === 0);
        disableElementById('feed-roll-next-btn', false);
        stats.backCount++; saveStats(); updateStatsBadge();
    }

    function doNext() {
        const feedCards = document.getElementsByClassName('feed-card');
        if (feedHistoryIndex >= feedHistory.length - 1) return;
        feedHistoryIndex++;
        const snap = feedHistory[feedHistoryIndex];
        const cards = snap.cards || snap;
        for (let i = 0; i < feedCards.length; i++) feedCards[i].innerHTML = cards[i];
        disableElementById('feed-roll-next-btn', feedHistoryIndex === feedHistory.length - 1);
        disableElementById('feed-roll-back-btn', false);
        stats.nextCount++; saveStats(); updateStatsBadge();
    }

    function doClear() {
        feedHistory.length = 0; feedHistoryIndex = 0;
        disableElementById('feed-roll-back-btn', true);
        disableElementById('feed-roll-next-btn', true);
        stats.clearCount++; saveStats(); updateStatsBadge();
        showToast('🗑️ 历史记录已清除', 'success');
    }

    function requestClear() {
        if (confirmClear) {
            showConfirm({
                title: '清除历史记录',
                message: `确定要清除所有 <b>${feedHistory.length}</b> 条历史记录吗？此操作不可撤销。`,
                tip: '💡 如不需要每次确认，可在 <a id="tip-open-settings">⚙️ 设置</a> 中关闭「二次确认」。',
                confirmText: '清除', cancelText: '取消', danger: true, onConfirm: doClear
            });
            setTimeout(() => {
                const a = document.getElementById('tip-open-settings');
                if (a) a.addEventListener('click', () => { closeModal(); openSettings('general'); });
            }, 50);
        } else { doClear(); }
    }

    // ==================== 菜单命令 ====================
    let _menuIds = [];
    function updateMenuCommands() {
        _menuIds.filter(Boolean).forEach(id => { try { GM_unregisterMenuCommand(id); } catch(e) {} });
        _menuIds = [
            GM_registerMenuCommand('⚙️ 打开设置面板',                                                   () => openSettings()),
            GM_registerMenuCommand('📋 历史记录浏览器',                                                   openHistoryBrowser),
            GM_registerMenuCommand('📊 使用统计',                                                         openStats),
            GM_registerMenuCommand('📤 导出配置',                                                         exportConfig),
            GM_registerMenuCommand('🔄 恢复默认配置',                                                     () => showConfirm({ title:'恢复默认配置', message:'将重置所有设置为默认值，统计数据不受影响。确认？', confirmText:'恢复', onConfirm: resetToDefaults })),
            GM_registerMenuCommand(`${autoDelete    ?'✅':'❌'} 自动删除：${autoDelete    ?'已开启':'已关闭'}`, () => openSettings('general')),
            GM_registerMenuCommand(`${confirmClear  ?'✅':'❌'} 二次确认：${confirmClear  ?'已开启':'已关闭'}`, () => openSettings('general')),
            GM_registerMenuCommand(`${shortcutEnabled?'✅':'❌'} 快捷键：${shortcutEnabled?'已启用':'已关闭'}`, () => openSettings('shortcuts')),
        ];
    }
    updateMenuCommands();

    // ==================== 快捷键绑定 ====================
    function parseCombo(e) {
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl'); if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift'); if (e.metaKey) parts.push('Meta');
        const key = e.key;
        if (!['Control','Alt','Shift','Meta'].includes(key))
            parts.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key);
        return parts.join('+');
    }
    let _kbHandler = null;
    function bindShortcuts() {
        if (_kbHandler) document.removeEventListener('keydown', _kbHandler, true);
        if (!shortcutEnabled) return;
        _kbHandler = e => {
            const tag = document.activeElement && document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;
            const combo = parseCombo(e);
            if (!combo) return;
            if (shortcutBack  && combo === shortcutBack)  { e.preventDefault(); doBack(); }
            if (shortcutNext  && combo === shortcutNext)  { e.preventDefault(); doNext(); }
            if (shortcutClear && combo === shortcutClear) { e.preventDefault(); requestClear(); }
        };
        document.addEventListener('keydown', _kbHandler, true);
    }
    bindShortcuts();

    // ==================== 按钮注入 ====================
    const BTN_BACK     = `<button id="feed-roll-back-btn" class="roll-btn biliplus-disabled" style="margin-top:10px;" title="回退到上一组推荐"><span>回</span></button>`;
    const BTN_NEXT     = `<button id="feed-roll-next-btn" class="roll-btn biliplus-disabled" style="margin-top:10px;" title="前进到下一组推荐"><span>行</span></button>`;
    const BTN_CLEAR    = `<button id="clear-history-btn"  class="roll-btn" style="margin-top:10px;" title="清除历史记录（右键点击）"><span>清</span></button>`;
    const BTN_SETTINGS = `<button id="bch-settings-btn"   class="roll-btn" style="margin-top:10px;position:relative;" title="换一换历史 · 设置"><span>设</span></button>`;

    const targetNode = document.querySelector('.recommended-container_floor-aside');
    if (targetNode) {
        const observer = new MutationObserver(() => {
            const feedRollBtn = document.querySelector('.roll-btn');

            if (feedRollBtn && !document.getElementById('feed-roll-back-btn')) {
                [BTN_BACK, BTN_NEXT, BTN_CLEAR, BTN_SETTINGS].forEach(html => {
                    const el = document.createElement('span');
                    feedRollBtn.parentNode.appendChild(el);
                    el.outerHTML = html;
                });

                const backBtn  = document.getElementById('feed-roll-back-btn');
                const nextBtn  = document.getElementById('feed-roll-next-btn');
                const clearBtn = document.getElementById('clear-history-btn');

                backBtn.addEventListener('click', doBack);
                nextBtn.addEventListener('click', doNext);
                document.getElementById('bch-settings-btn').addEventListener('click', () => openSettings());

                clearBtn.addEventListener('contextmenu', e => { e.preventDefault(); if (clearMouseBtn === 2) requestClear(); });
                clearBtn.addEventListener('click',       () => { if (clearMouseBtn === 0) requestClear(); });
                clearBtn.addEventListener('mousedown',   e => { if (e.button === 1 && clearMouseBtn === 1) { e.preventDefault(); requestClear(); } });
                clearBtn.title = `清除历史记录（${MOUSE_BTN_LABELS[clearMouseBtn]}点击）`;

                attachPreview(backBtn, () => feedHistoryIndex > 0 ? feedHistory[feedHistoryIndex - 1] : null, '⬅️ 上一组内容预览');
                attachPreview(nextBtn, () => feedHistoryIndex < feedHistory.length - 1 ? feedHistory[feedHistoryIndex + 1] : null, '➡️ 下一组内容预览');

                updateStatsBadge();
            }

            if (feedRollBtn && !feedRollBtn.id) {
                feedRollBtn.id = 'feed-roll-btn';
                feedRollBtn.addEventListener('click', () => {
                    setTimeout(() => {
                        if (feedHistoryIndex === feedHistory.length) {
                            feedHistory.push({
                                cards:  listInnerHTMLOfFeedCard(document.getElementsByClassName('feed-card')),
                                titles: extractTitlesLive(),
                                time:   Date.now()
                            });
                            if (autoDelete && historyLimit > 0 && feedHistory.length > historyLimit) {
                                feedHistory.shift(); feedHistoryIndex--;
                            }
                        }
                        feedHistoryIndex = feedHistory.length;
                        disableElementById('feed-roll-back-btn', false);
                        disableElementById('feed-roll-next-btn', true);
                        stats.rollCount++; saveStats(); updateStatsBadge();
                    });
                });
                observer.disconnect();
                restoreSession();
            }
        });
        observer.observe(targetNode, { childList: true, subtree: true });
    }

    // ==================== 工具函数 ====================
    function disableElementById(id, bool) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('biliplus-disabled', bool);
    }
    function listInnerHTMLOfFeedCard(els) {
        return Array.from(els).map(fc => fc.innerHTML);
    }

})();
