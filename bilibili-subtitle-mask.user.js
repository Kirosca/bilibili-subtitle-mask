// ==UserScript==
// @name         Bilibili 无字幕观影（字幕遮挡）
// @namespace    http://tampermonkey.net/
// @version      1.4.4
// @description  B站外置极简字幕遮挡条：①独立外置书签手柄(零拉伸零裁切)；②智能呼吸隐藏(全链路统一0.8s隐形/移入常亮/拖拽常亮/暂停换视频全程静默无扰)；③白天浅色与夜间暗黑双主题自适应，边框与背景100%同频平滑高亮B站蓝；④长按/Alt+J 50%透视偷看(手柄与黑条0ms瞬发瞬灭同步)，2px激光实线指引，拖拽零重排极速跟手；⑤Alt+M开启手柄0.8s自动呼吸隐藏，Alt+M关闭手柄0ms立刻同步瞬灭(防长按连发闪烁)；⑥Alt+1~5档位秒切结束0延迟同步隐形；⑦换视频全量原子化首帧同步；⑧四级级联记忆+2000条LRU自动垃圾回收(单P>合集>UP主>默认13%)；⑨智能识别新视频标题与标签【无字幕】自动静默隐藏遮挡条；⑩拖拽手柄右键彻底绝缘；⑪油猴菜单一键呼出B站原生UI记忆管理与二次确认弹窗；⑫智能帧采样自适应定位内嵌字幕高度并锁定常驻(无字幕不遮挡，支持Letterbox黑边补偿)；⑬只监听视频下半部分(50%~97%)；⑭双路常驻重新检测按钮(底栏原生按钮+手柄快捷圆钮)+Alt+O；⑮支持暂停视频即时检测与0ms瞬发覆盖；⑰暂停视频单帧极速判定(即点即测零等待)；⑱播放中未检出字幕严格保持遮挡条原状不改动；⑲精简移除播放器工具栏按钮，专注侧边快捷手柄与快捷键；⑳零冗余紧凑贴合覆盖(精准贴合字幕顶沿字形，不留多余空白空间)；㉑四重视觉特征防御机制(文字发光色过滤/横向居中约束/块厚度压制/25%物理天花板，彻底解决衣物背景误检与30%~40%跳变)；㉒支持【持续监听】与【关闭字幕遮挡】多入口选项(手柄与雷达按钮右键菜单/油猴菜单/管理弹窗)，修复检测结束按钮停止旋转；㉓预留+1.0%微距安全遮蔽空间，彻底杜绝字幕顶沿笔画、抗锯齿羽化边及黑色描边微量外露漏字；㉔全链路打通手柄与雷达检测按钮同频联动(移入同频浮现/移出同频0.8s呼吸隐藏/微调与预设0ms瞬灭)，彻底解决检测按钮未同步隐藏问题；㉕提供新视频起播双策略自由切换选项(【持续监听】vs【默认关闭】，旧视频独立遵从专属记忆)，支持右键菜单/管理弹窗/油猴菜单多端一键秒切；㉖严格限定暂停单帧判定仅响应用户手动点击触发，彻底解决新视频初始系统暂停状态误判画面第0帧及遮挡条跳动问题；㉗记忆管理弹窗文本精简避震折行；检测成功反馈升级为检测按钮全背景绿色渐变微动效闪烁。
// @author       Kirosca
// @license      MIT
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/*
// @match        https://www.bilibili.com/bangumi/play/*
// @match        https://www.bilibili.com/cheese/play/*
// @match        https://www.bilibili.com/medialist/play/*
// @match        https://www.bilibili.com/festival/*
// @match        https://www.bilibili.com/blackboard/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

/* jshint esversion: 11 */
/* global GM_setValue, GM_getValue, GM_registerMenuCommand */

(function () {
    'use strict';

    const DB_STORAGE_KEY = 'bili_mask_cascading_database_v7';
    const MAX_STORAGE_RECORDS = 2000;
    const NEW_VIDEO_STRATEGY_KEY = 'bili_mask_new_video_strategy'; // 'continuous' | 'closed'

    function getNewVideoStrategy() {
        try {
            if (typeof GM_getValue !== 'undefined') {
                const val = GM_getValue(NEW_VIDEO_STRATEGY_KEY, null);
                if (val) { return val; }
            }
            const localVal = localStorage.getItem(NEW_VIDEO_STRATEGY_KEY);
            if (localVal) { return localVal; }
        } catch (e) {
            void e;
        }
        return 'continuous'; // 默认策略：新视频后台持续监听直到遮挡
    }

    function setNewVideoStrategy(strategy) {
        try {
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue(NEW_VIDEO_STRATEGY_KEY, strategy);
            }
            localStorage.setItem(NEW_VIDEO_STRATEGY_KEY, strategy);
        } catch (e) {
            void e;
        }
    }

    const defaultConfig = {
        visible: false, // 🌟 新视频默认初始不遮挡，交由智能检测决定是否唤起
        heightPercent: 13.0
    };

    // 1. 全站多场景上下文深度提取
    function getVideoContext() {
        const path = window.location.pathname;
        const search = window.location.search;

        let pId = null;
        let listId = null;
        let upId = null;

        const bvMatch = path.match(/(BV[a-zA-Z0-9]+|av\d+)/i) || search.match(/[?&](bvid|aid)=(BV[a-zA-Z0-9]+|av\d+)/i);
        if (bvMatch) {
            const bv = bvMatch[1] || bvMatch[2];
            const pMatch = search.match(/[?&]p=(\d+)/) || path.match(/\/p(\d+)/i);
            const pNum = pMatch ? `_p${pMatch[1]}` : '_p1';
            pId = `${bv}${pNum}`;
        }

        const epMatch = path.match(/\/(bangumi|cheese)\/play\/(ep\d+|ss\d+)/i);
        if (epMatch) {
            pId = epMatch[2];
        }

        const mediaListMatch = path.match(/\/medialist\/play\/(watchlater|ml\d+|\d+)/i);
        const listMatch = path.match(/\/list\/(ml\d+|ol\d+)/i) || search.match(/[?&](sid|season_id|series_id|csid|business_id)=(\d+)/i);
        
        if (mediaListMatch) {
            listId = `medialist_${mediaListMatch[1]}`;
        } else if (listMatch) {
            listId = listMatch[1] || listMatch[2];
        } else if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.season_id) {
            listId = `ss_${window.__INITIAL_STATE__.season_id}`;
        } else if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.epInfo && window.__INITIAL_STATE__.epInfo.season_id) {
            listId = `cheese_${window.__INITIAL_STATE__.epInfo.season_id}`;
        }

        if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.upData && window.__INITIAL_STATE__.upData.mid) {
            upId = String(window.__INITIAL_STATE__.upData.mid);
        } else if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.videoData && window.__INITIAL_STATE__.videoData.owner && window.__INITIAL_STATE__.videoData.owner.mid) {
            upId = String(window.__INITIAL_STATE__.videoData.owner.mid);
        } else if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.mediaInfo && window.__INITIAL_STATE__.mediaInfo.up_info && window.__INITIAL_STATE__.mediaInfo.up_info.mid) {
            upId = String(window.__INITIAL_STATE__.mediaInfo.up_info.mid);
        } else {
            const upLink = document.querySelector('.up-name, .bili-avatar, a[href*="space.bilibili.com/"]');
            if (upLink && upLink.href) {
                const midM = upLink.href.match(/space\.bilibili\.com\/(\d+)/);
                if (midM) {
                    upId = midM[1];
                }
            }
        }

        return { pId, listId, upId };
    }

    // 2. 双重持久化存储 + LRU 智能垃圾回收
    function loadDatabase() {
        try {
            if (typeof GM_getValue !== 'undefined') {
                const gmData = GM_getValue(DB_STORAGE_KEY, null);
                if (gmData) {
                    return typeof gmData === 'string' ? JSON.parse(gmData) : gmData;
                }
            }
            const localData = localStorage.getItem(DB_STORAGE_KEY);
            if (localData) {
                return JSON.parse(localData);
            }
        } catch (e) {
            void e;
        }
        return {};
    }

    function pruneDatabaseLRU(db) {
        try {
            const keys = Object.keys(db);
            if (keys.length > MAX_STORAGE_RECORDS) {
                keys.sort((a, b) => {
                    const timeA = (db[a] && db[a].updatedAt) ? db[a].updatedAt : 0;
                    const timeB = (db[b] && db[b].updatedAt) ? db[b].updatedAt : 0;
                    return timeA - timeB;
                });

                const deleteCount = keys.length - MAX_STORAGE_RECORDS;
                for (let i = 0; i < deleteCount; i++) {
                    delete db[keys[i]];
                }
            }
        } catch (e) {
            void e;
        }
        return db;
    }

    function saveDatabase(db) {
        try {
            const prunedDb = pruneDatabaseLRU(db);

            if (typeof GM_setValue !== 'undefined') {
                GM_setValue(DB_STORAGE_KEY, prunedDb);
            }
            localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(prunedDb));
        } catch (e) {
            void e;
        }
    }

    // 🌟 智能检测视频标题与标签中是否包含【无字幕】关键词 🌟
    function isNoSubtitleVideo() {
        try {
            // 1. 检查网页 document.title
            if (document.title && document.title.includes('无字幕')) {
                return true;
            }

            // 2. 检查 DOM 中的各场景标题元素
            const titleSelectors = 'h1.video-title, .video-info-title-inner, .media-title, .ep-title, .season-title, .video-title';
            const titleEl = document.querySelector(titleSelectors);
            if (titleEl && titleEl.textContent && titleEl.textContent.includes('无字幕')) {
                return true;
            }

            // 3. 检查 B站原生 __INITIAL_STATE__ 数据源（极速且准确）
            if (typeof window.__INITIAL_STATE__ !== 'undefined' && window.__INITIAL_STATE__) {
                const initState = window.__INITIAL_STATE__;

                // 视频标题
                if (initState.videoData && initState.videoData.title && initState.videoData.title.includes('无字幕')) {
                    return true;
                }
                // 番剧/媒体标题
                if (initState.mediaInfo && initState.mediaInfo.title && initState.mediaInfo.title.includes('无字幕')) {
                    return true;
                }
                // 单集剧集标题
                if (initState.epInfo) {
                    if (initState.epInfo.title && initState.epInfo.title.includes('无字幕')) { return true; }
                    if (initState.epInfo.long_title && initState.epInfo.long_title.includes('无字幕')) { return true; }
                    if (initState.epInfo.share_copy && initState.epInfo.share_copy.includes('无字幕')) { return true; }
                }

                // 视频标签 Tags 数组
                if (Array.isArray(initState.tags)) {
                    for (let i = 0; i < initState.tags.length; i++) {
                        const tagObj = initState.tags[i];
                        if (tagObj && tagObj.tag_name && tagObj.tag_name.includes('无字幕')) {
                            return true;
                        }
                    }
                }
            }

            // 4. 检查 DOM 标签元素
            const tagSelectors = '.tag-link, .tag-container .tag, .video-tag-container .tag, .tag-panel .tag-link, a[href*="/topic/"], .tag-box .tag-item, .tag_item, .tag-item';
            const tagEls = document.querySelectorAll(tagSelectors);
            for (let j = 0; j < tagEls.length; j++) {
                if (tagEls[j].textContent && tagEls[j].textContent.includes('无字幕')) {
                    return true;
                }
            }
        } catch (e) {
            void e;
        }
        return false;
    }

    // 3. 四级级联记忆 + 新视频默认不遮挡（等待检测）
    function getActiveHeightAndVisibility() {
        const ctx = getVideoContext();
        const db = loadDatabase();

        // 1. 如果该单P已有明确的历史修改记录，绝对遵从用户的单P专属记忆
        if (ctx.pId && db['P_' + ctx.pId]) {
            return Object.assign({}, defaultConfig, db['P_' + ctx.pId]);
        }

        // 2. 属于未记录的新视频：默认初始不遮挡 (visible: false)，交由智能检测判断是否包含内嵌字幕
        let baseConfig = Object.assign({}, defaultConfig, { visible: false });

        // 3. 若有合集/UP主级联记忆，先继承其高度配置（若后续检测到字幕，可作为备用高度）
        if (ctx.listId && db['LIST_' + ctx.listId]) {
            baseConfig.heightPercent = db['LIST_' + ctx.listId].heightPercent;
        } else if (ctx.upId && db['UP_' + ctx.upId]) {
            baseConfig.heightPercent = db['UP_' + ctx.upId].heightPercent;
        }

        // 4. 如果命中【无字幕】关键词，坚决保持不显示
        if (isNoSubtitleVideo()) {
            baseConfig.visible = false;
        }

        return baseConfig;
    }

    function saveCascadingConfig(cfg) {
        const ctx = getVideoContext();
        const db = loadDatabase();

        const record = {
            heightPercent: cfg.heightPercent,
            visible: cfg.visible,
            updatedAt: Date.now()
        };

        if (ctx.pId) { db['P_' + ctx.pId] = record; }
        if (ctx.listId) { db['LIST_' + ctx.listId] = record; }
        if (ctx.upId) { db['UP_' + ctx.upId] = record; }

        saveDatabase(db);
    }

    let config = getActiveHeightAndVisibility();
    let lastObservedUrl = window.location.href;
    let isRouteChanging = false;
    let isKeyboardPeeking = false;
    let currentRouteSeq = 0;
    let pendingRouteTimer = null;

    const style = document.createElement('style');
    style.textContent = `
        /* 纯黑遮罩本体（位于视频内部底端） */
        .bili-subtitle-mask-box-standalone {
            position: absolute !important;
            bottom: 0 !important;
            left: 0 !important;
            width: 100% !important;
            background: #000000 !important;
            opacity: 1 !important;
            z-index: 30 !important;
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            transition: background 0.12s ease, border-color 0.12s ease;
            display: ${config.visible ? 'block' : 'none'};
            pointer-events: none !important;
            box-sizing: border-box !important;
            will-change: height;
        }

        /* 2px 绝对实心激光实线 + 背景半透 */
        .bili-subtitle-mask-box-standalone.is-pressing-preview {
            background: rgba(0, 0, 0, 0.52) !important;
            border-top: 2px solid #00b5fe !important;
        }

        /* 独立外置浮动书签基础样式 */
        .bili-mask-standalone-outside-btn {
            position: fixed !important;
            width: 18px !important;
            height: 9px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 0 5px 5px 0 !important;
            cursor: pointer !important;
            z-index: 999999 !important;
            user-select: none !important;
            touch-action: none !important;
            padding-right: 1px !important;
            transform: translateY(-50%) !important;
            opacity: 0 !important;
            pointer-events: none !important;
            transition: opacity 0.22s ease, background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease !important;
            will-change: top, opacity;
        }

        /* 激活/靠近浮现 */
        .bili-mask-standalone-outside-btn.is-shown {
            opacity: 0.85 !important;
            pointer-events: auto !important;
        }
        .bili-mask-standalone-outside-btn.is-dragging {
            cursor: ns-resize !important;
            opacity: 1.0 !important;
        }

        /* 1. 白天亮色模式 */
        .bili-mask-standalone-outside-btn {
            background: rgba(241, 242, 243, 0.95) !important;
            color: #61666d !important;
            border: 1px solid rgba(0, 0, 0, 0.08) !important;
            border-left: none !important;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06) !important;
        }
        .bili-mask-standalone-outside-btn svg rect {
            fill: #61666d !important;
            transition: fill 0.18s ease !important;
        }

        /* 2. 暗黑夜间模式 */
        html.dark .bili-mask-standalone-outside-btn,
        html[data-theme="dark"] .bili-mask-standalone-outside-btn,
        body.dark-theme .bili-mask-standalone-outside-btn,
        body.dark .bili-mask-standalone-outside-btn {
            background: rgba(38, 38, 38, 0.88) !important;
            color: #ffffff !important;
            border: 1px solid rgba(255, 255, 255, 0.04) !important;
            border-left: none !important;
            box-shadow: none !important;
        }
        html.dark .bili-mask-standalone-outside-btn svg rect,
        html[data-theme="dark"] .bili-mask-standalone-outside-btn svg rect,
        body.dark-theme .bili-mask-standalone-outside-btn svg rect,
        body.dark .bili-mask-standalone-outside-btn svg rect {
            fill: #ffffff !important;
            transition: fill 0.18s ease !important;
        }

        /* 无论开/关状态，鼠标移入(Hover)时边框与背景100%同步渐变至B站蓝 */
        .bili-mask-standalone-outside-btn:hover,
        html.dark .bili-mask-standalone-outside-btn:hover,
        html[data-theme="dark"] .bili-mask-standalone-outside-btn:hover,
        body.dark-theme .bili-mask-standalone-outside-btn:hover,
        body.dark .bili-mask-standalone-outside-btn:hover {
            opacity: 1.0 !important;
            background: #00aeec !important;
            border-color: #00aeec !important;
        }
        .bili-mask-standalone-outside-btn:hover svg rect,
        html.dark .bili-mask-standalone-outside-btn:hover svg rect,
        html[data-theme="dark"] .bili-mask-standalone-outside-btn:hover svg rect,
        body.dark-theme .bili-mask-standalone-outside-btn:hover svg rect,
        body.dark .bili-mask-standalone-outside-btn:hover svg rect {
            fill: #ffffff !important;
        }

        .bili-mask-standalone-outside-btn svg {
            display: block !important;
            pointer-events: none !important;
            width: 10px !important;
            height: 5px !important;
        }

        /* 🌟 B站风格记忆管理弹窗 🌟 */
        #bili-mask-modal-backdrop {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.6) !important;
            z-index: 1000000 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
            backdrop-filter: blur(2px);
        }
        #bili-mask-modal-backdrop.is-open {
            opacity: 1 !important;
            pointer-events: auto !important;
        }
        .bili-mask-modal-card {
            width: 380px !important;
            border-radius: 12px !important;
            padding: 20px 24px 24px !important;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2) !important;
            transform: scale(0.95);
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            box-sizing: border-box !important;
            user-select: none !important;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif !important;
        }
        #bili-mask-modal-backdrop.is-open .bili-mask-modal-card {
            transform: scale(1) !important;
        }

        /* 亮色模式卡片 */
        .bili-mask-card-light {
            background: #ffffff !important;
            color: #18191c !important;
            border: 1px solid #e3e5e7 !important;
        }
        /* 暗色模式卡片 */
        .bili-mask-card-dark {
            background: #232323 !important;
            color: #e3e5e7 !important;
            border: 1px solid #333333 !important;
        }

        .bili-mask-modal-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            margin-bottom: 16px !important;
        }
        .bili-mask-modal-title {
            font-size: 16px !important;
            font-weight: 600 !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
        }
        .bili-mask-modal-close {
            cursor: pointer !important;
            font-size: 20px !important;
            line-height: 1 !important;
            color: #9499a0 !important;
            padding: 4px 8px !important;
            border-radius: 6px !important;
            transition: background 0.15s ease, color 0.15s ease;
        }
        .bili-mask-modal-close:hover {
            color: #18191c !important;
            background: rgba(0, 0, 0, 0.06) !important;
        }
        .bili-mask-card-dark .bili-mask-modal-close:hover {
            color: #ffffff !important;
            background: rgba(255, 255, 255, 0.1) !important;
        }

        .bili-mask-modal-info {
            font-size: 12.5px !important;
            color: #61666d !important;
            line-height: 1.6 !important;
            margin-bottom: 18px !important;
            padding: 10px 12px !important;
            border-radius: 8px !important;
            background: #f6f7f8 !important;
        }
        .bili-mask-card-dark .bili-mask-modal-info {
            background: #2c2c2c !important;
            color: #a6abb2 !important;
        }

        .bili-mask-btn-group {
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
        }
        .bili-mask-action-btn {
            height: 38px !important;
            border-radius: 8px !important;
            font-size: 13.5px !important;
            font-weight: 500 !important;
            border: 1px solid transparent !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            transition: all 0.2s ease !important;
            outline: none !important;
        }

        /* 浅色模式按钮 */
        .bili-mask-card-light .bili-mask-action-btn.btn-normal {
            background: #f1f2f3 !important;
            color: #18191c !important;
            border-color: #e3e5e7 !important;
        }
        .bili-mask-card-light .bili-mask-action-btn.btn-normal:hover {
            background: #00aeec !important;
            color: #ffffff !important;
            border-color: #00aeec !important;
        }
        .bili-mask-card-light .bili-mask-action-btn.btn-danger {
            background: #fff0f0 !important;
            color: #f85a5a !important;
            border-color: #ffd6d6 !important;
        }
        .bili-mask-card-light .bili-mask-action-btn.btn-danger:hover {
            background: #f85a5a !important;
            color: #ffffff !important;
            border-color: #f85a5a !important;
        }

        /* 暗色模式按钮 */
        .bili-mask-card-dark .bili-mask-action-btn.btn-normal {
            background: #2e2e2e !important;
            color: #e3e5e7 !important;
            border-color: #3e3e3e !important;
        }
        .bili-mask-card-dark .bili-mask-action-btn.btn-normal:hover {
            background: #00aeec !important;
            color: #ffffff !important;
            border-color: #00aeec !important;
        }
        .bili-mask-card-dark .bili-mask-action-btn.btn-danger {
            background: rgba(248, 90, 90, 0.12) !important;
            color: #ff6b6b !important;
            border-color: rgba(248, 90, 90, 0.3) !important;
        }
        .bili-mask-card-dark .bili-mask-action-btn.btn-danger:hover {
            background: #f85a5a !important;
            color: #ffffff !important;
            border-color: #f85a5a !important;
        }

        

        /* 伴随外置手柄快捷【重新检测】按钮 */
        .bili-mask-standalone-redetect-btn {
            position: fixed !important;
            width: 18px !important;
            height: 18px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 0 5px 5px 0 !important;
            cursor: pointer !important;
            z-index: 999999 !important;
            user-select: none !important;
            touch-action: none !important;
            transform: translateY(-50%) !important;
            opacity: 0 !important;
            pointer-events: none !important;
            transition: opacity 0.22s ease, background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease !important;
            will-change: top, opacity;
            overflow: hidden !important;
        }
        .bili-mask-standalone-redetect-btn svg {
            position: relative !important;
            z-index: 2 !important;
            transition: color 0.18s ease !important;
        }
        .bili-mask-standalone-redetect-btn::after {
            content: '' !important;
            position: absolute !important;
            inset: 0 !important;
            background: linear-gradient(135deg, #2ac864, #00c06d) !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: 1 !important;
        }
        .bili-mask-standalone-redetect-btn.is-success-flash {
            border-color: #00c06d !important;
            border-left: none !important;
            color: #ffffff !important;
            box-shadow: 0 0 10px rgba(0, 192, 109, 0.75) !important;
        }
        .bili-mask-standalone-redetect-btn.is-success-flash::after {
            animation: bili-mask-btn-green-flash 1.15s cubic-bezier(0.22, 1, 0.36, 1) forwards !important;
        }
        @keyframes bili-mask-btn-green-flash {
            0% {
                opacity: 0;
            }
            15% {
                opacity: 1;
            }
            40% {
                opacity: 1;
            }
            100% {
                opacity: 0;
            }
        }
        .bili-mask-standalone-redetect-btn.is-shown {
            opacity: 0.85 !important;
            pointer-events: auto !important;
        }
        .bili-mask-standalone-redetect-btn:hover {
            opacity: 1 !important;
            background: #00aeec !important;
            color: #ffffff !important;
            border-color: #00aeec !important;
        }

        /* 白天浅色主题 */
        .bili-mask-standalone-redetect-btn {
            background: rgba(241, 242, 243, 0.95) !important;
            color: #61666d !important;
            border: 1px solid rgba(0, 0, 0, 0.08) !important;
            border-left: none !important;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06) !important;
        }

        /* 夜间暗黑主题 */
        html.dark .bili-mask-standalone-redetect-btn,
        html[data-theme="dark"] .bili-mask-standalone-redetect-btn,
        body.dark-theme .bili-mask-standalone-redetect-btn,
        body.dark .bili-mask-standalone-redetect-btn {
            background: rgba(38, 38, 38, 0.88) !important;
            color: #ffffff !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            border-left: none !important;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35) !important;
        }

        /* 检测中雷达旋转与发光动效 */
        @keyframes bili-mask-scan-rotate {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        @keyframes bili-mask-scan-glow {
            0%, 100% {
                color: #00aeec !important;
                filter: drop-shadow(0 0 5px rgba(0, 174, 236, 0.8));
            }
            50% {
                color: #ffffff !important;
                filter: drop-shadow(0 0 1px rgba(0, 174, 236, 0.2));
            }
        }
        
        .bili-mask-standalone-redetect-btn.is-detecting svg {
            animation: bili-mask-scan-rotate 1.8s linear infinite, bili-mask-scan-glow 1.2s ease-in-out infinite !important;
        }

        /* 伴随按钮与外置手柄右键选项菜单 */
        .bili-mask-quick-menu {
            position: fixed !important;
            z-index: 1000002 !important;
            min-width: 175px !important;
            padding: 6px !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.22) !important;
            font-size: 13px !important;
            line-height: 1.5 !important;
            user-select: none !important;
            display: none;
            flex-direction: column !important;
            gap: 2px !important;
            transition: opacity 0.15s ease, transform 0.15s ease !important;
            transform: scale(0.95);
            opacity: 0;
            backdrop-filter: blur(8px) !important;
        }
        .bili-mask-quick-menu.is-open {
            display: flex !important;
            transform: scale(1);
            opacity: 1;
        }
        .bili-mask-quick-menu-light {
            background: rgba(255, 255, 255, 0.96) !important;
            border: 1px solid rgba(0, 0, 0, 0.08) !important;
            color: #18191c !important;
        }
        .bili-mask-quick-menu-dark {
            background: rgba(34, 34, 34, 0.95) !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            color: #e3e5e7 !important;
        }
        .bili-mask-menu-item {
            padding: 8px 10px !important;
            border-radius: 6px !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            font-weight: 500 !important;
            transition: background 0.15s ease, color 0.15s ease !important;
        }
        .bili-mask-quick-menu-light .bili-mask-menu-item:hover {
            background: #f1f2f3 !important;
            color: #00aeec !important;
        }
        .bili-mask-quick-menu-dark .bili-mask-menu-item:hover {
            background: rgba(255, 255, 255, 0.08) !important;
            color: #00aeec !important;
        }
        .bili-mask-menu-divider {
            height: 1px !important;
            margin: 4px 2px !important;
            background: rgba(128, 128, 128, 0.18) !important;
        }
    `;
    document.head.appendChild(style);

    let maskBox = null;
    let outsideBtn = null;
    let redetectBtn = null;
    let trackedPlayer = null;
    let wheelPreviewTimer = null;
    let autoHideTimer = null;
    let isHovered = false;
    let isInteracting = false;
    let rafPositionId = null;

    let cachedBtnCenterX = 0;
    let cachedBtnCenterY = 0;

    // 🌟 智能帧采样：内嵌字幕高度自适应定位与常驻锁定 🌟
    let autoDetectTimer = null;
    let autoDetectSamples = 0;
    let autoDetectCandidates = [];
    let isAutoDetecting = false;
    let isContinuousDetecting = false;
    let offscreenCanvas = null;
    let offscreenCtx = null;
    let quickMenuEl = null;

    function updateDetectionUIState(isDetecting, isContinuous = false) {
        const oldCtrl = document.getElementById('bili-mask-ctrl-redetect-btn');
        if (oldCtrl) {
            oldCtrl.remove();
        }
        if (redetectBtn) {
            redetectBtn.classList.toggle('is-detecting', isDetecting);
            if (isDetecting) {
                redetectBtn.title = isContinuous ? '🔄 正在持续监听字幕... (点击可停止)' : '🎯 正在检测画面字幕... (点击可停止)';
            } else {
                redetectBtn.title = '🎯 重新检测字幕 (左键：单次 / 右键：选项菜单)';
            }
        }
        const modalAutoDetectBtn = document.getElementById('bili-btn-auto-detect');
        if (modalAutoDetectBtn) {
            modalAutoDetectBtn.textContent = isDetecting ? '🔄 正在检测画面字幕...' : '🎯 重新单次检测 (Alt+O)';
        }
        const modalContinuousBtn = document.getElementById('bili-btn-continuous-detect');
        if (modalContinuousBtn) {
            modalContinuousBtn.textContent = (isDetecting && isContinuous) ? '⏹️ 停止持续监听' : '🔄 持续监听直到遮挡';
        }
    }

    function stopSubtitleDetection() {
        if (autoDetectTimer) {
            clearInterval(autoDetectTimer);
            autoDetectTimer = null;
        }
        isAutoDetecting = false;
        isContinuousDetecting = false;
        autoDetectSamples = 0;
        autoDetectCandidates = [];
        if (offscreenCanvas) {
            offscreenCanvas.width = 0;
            offscreenCanvas.height = 0;
            offscreenCanvas = null;
            offscreenCtx = null;
        }
        // 🌟 核心修复：监听停止或结束时，立即取消旋转动效恢复静止状态
        updateDetectionUIState(false);
    }

    // 🌟 选项功能：关闭字幕遮挡条 🌟
    function closeSubtitleMask() {
        stopSubtitleDetection();
        config.visible = false;
        if (maskBox) {
            maskBox.style.display = 'none';
        }
        updateBtnStateClass();
        saveCascadingConfig(config);
        triggerBtnVisibility(800);
        showToast('🚫 字幕遮挡条已关闭 (Alt+M 或右键菜单可重新开启)');
    }

    // 🌟 伴随手柄与雷达按钮右键快捷选项菜单 🌟
    function getQuickOptionsMenu() {
        if (quickMenuEl) { return quickMenuEl; }
        quickMenuEl = document.createElement('div');
        quickMenuEl.id = 'bili-mask-quick-menu';
        quickMenuEl.className = 'bili-mask-quick-menu';
        document.body.appendChild(quickMenuEl);

        document.addEventListener('click', (e) => {
            if (quickMenuEl && !quickMenuEl.contains(e.target)) {
                quickMenuEl.classList.remove('is-open');
            }
        });
        window.addEventListener('blur', () => {
            if (quickMenuEl) { quickMenuEl.classList.remove('is-open'); }
        });

        return quickMenuEl;
    }

    function showQuickOptionsMenu(clientX, clientY) {
        const menu = getQuickOptionsMenu();
        const isDark = document.documentElement.classList.contains('dark') || 
                       document.body.classList.contains('dark') || 
                       document.querySelector('.bili-theme-dark') !== null;

        menu.className = `bili-mask-quick-menu ${isDark ? 'bili-mask-quick-menu-dark' : 'bili-mask-quick-menu-light'}`;
        const isMaskVisible = config.visible && maskBox && maskBox.style.display !== 'none';
        const currentStrategy = getNewVideoStrategy();
        const strategyDesc = currentStrategy === 'continuous' ? '持续监听' : '默认关闭';

        menu.innerHTML = `
            <div class="bili-mask-menu-item" id="bili-menu-detect-once">
                <span>🎯</span>
                <span>单次重新检测 (Alt+O)</span>
            </div>
            <div class="bili-mask-menu-item" id="bili-menu-detect-continuous">
                <span>${isContinuousDetecting ? '⏹️' : '🔄'}</span>
                <span>${isContinuousDetecting ? '停止持续监听' : '持续监听直到遮挡'}</span>
            </div>
            <div class="bili-mask-menu-item" id="bili-menu-toggle-mask">
                <span>${isMaskVisible ? '🚫' : '👁️'}</span>
                <span>${isMaskVisible ? '关闭字幕遮挡' : '开启字幕遮挡 (Alt+M)'}</span>
            </div>
            <div class="bili-mask-menu-divider"></div>
            <div class="bili-mask-menu-item" id="bili-menu-toggle-strategy" title="切换新视频默认规则（旧视频保留记忆）：持续监听 vs 默认关闭">
                <span>${currentStrategy === 'continuous' ? '🔄' : '🚫'}</span>
                <span>新视频：${strategyDesc} (点击切换)</span>
            </div>
            <div class="bili-mask-menu-item" id="bili-menu-open-modal">
                <span>⚙️</span>
                <span>观影记忆管理...</span>
            </div>
        `;

        document.getElementById('bili-menu-detect-once').onclick = (e) => {
            e.stopPropagation();
            menu.classList.remove('is-open');
            triggerManualDetection(false);
        };
        document.getElementById('bili-menu-detect-continuous').onclick = (e) => {
            e.stopPropagation();
            menu.classList.remove('is-open');
            if (isContinuousDetecting) {
                stopSubtitleDetection();
                showToast('⏹️ 已停止持续监听');
            } else {
                triggerManualDetection(true);
            }
        };
        document.getElementById('bili-menu-toggle-mask').onclick = (e) => {
            e.stopPropagation();
            menu.classList.remove('is-open');
            if (isMaskVisible) {
                closeSubtitleMask();
            } else {
                toggleVisibility();
            }
        };
        document.getElementById('bili-menu-toggle-strategy').onclick = (e) => {
            e.stopPropagation();
            menu.classList.remove('is-open');
            const next = currentStrategy === 'continuous' ? 'closed' : 'continuous';
            setNewVideoStrategy(next);
            showToast(`⚙️ 新视频默认策略已设为：${next === 'continuous' ? '🔄 持续监听直到遮挡' : '🚫 默认完全关闭'}`);
        };
        document.getElementById('bili-menu-open-modal').onclick = (e) => {
            e.stopPropagation();
            menu.classList.remove('is-open');
            showMemoryModal();
        };

        menu.classList.add('is-open');
        const mRect = menu.getBoundingClientRect();
        const vW = window.innerWidth;
        const vH = window.innerHeight;

        let left = clientX;
        let top = clientY;
        if (left + mRect.width > vW - 12) {
            left = vW - mRect.width - 12;
        }
        if (top + mRect.height > vH - 12) {
            top = vH - mRect.height - 12;
        }

        menu.style.left = `${Math.max(10, left)}px`;
        menu.style.top = `${Math.max(10, top)}px`;
    }

    function detectFrameSubtitle(video, allowPaused = false) {
        if (!video || (!allowPaused && video.paused) || video.ended || video.readyState < 2) {
            return [];
        }
        const vW = video.videoWidth;
        const vH = video.videoHeight;
        if (!vW || !vH || vW <= 0 || vH <= 0) {
            return [];
        }

        const targetW = 480;
        const targetH = Math.round(targetW * (vH / vW)) || 270;

        if (!offscreenCanvas) {
            offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = targetW;
            offscreenCanvas.height = targetH;
            offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
        } else if (offscreenCanvas.width !== targetW || offscreenCanvas.height !== targetH) {
            offscreenCanvas.width = targetW;
            offscreenCanvas.height = targetH;
        }

        try {
            offscreenCtx.drawImage(video, 0, 0, targetW, targetH);
            const imgDataObj = offscreenCtx.getImageData(0, 0, targetW, targetH);
            const data = imgDataObj.data;

            // 🌟 核心优化 1：精确定位台词区间（从顶部 58% 至 96%），彻底规避 50% 中间区域的人脸、眼镜与中景布景
            const roiYStart = Math.floor(targetH * 0.58);
            const roiYEnd = Math.floor(targetH * 0.96);
            const roiXStart = Math.floor(targetW * 0.05);
            const roiXEnd = Math.floor(targetW * 0.95);

            const rowEdges = new Array(targetH).fill(0);
            const rowXBounds = new Array(targetH);

            let maxEdgeInRoi = 0;
            for (let y = roiYStart; y <= roiYEnd; y++) {
                let edgeCount = 0;
                let rowMinX = -1;
                let rowMaxX = -1;
                const rowOffset = y * targetW;
                for (let x = roiXStart; x < roiXEnd; x++) {
                    const idx1 = (rowOffset + x) * 4;
                    const idx2 = (rowOffset + (x + 1)) * 4;
                    const r1 = data[idx1], g1 = data[idx1 + 1], b1 = data[idx1 + 2];
                    const r2 = data[idx2], g2 = data[idx2 + 1], b2 = data[idx2 + 2];
                    const lum1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
                    const lum2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
                    if (Math.abs(lum1 - lum2) > 24) {
                        // 🌟 防御 1：文字字芯发光色校验（过滤暗色衣物褶皱、肤色、阴影，仅保留高光白或醒目黄）
                        const isWhite = lum1 >= 165 || lum2 >= 165;
                        const isYellow = (r1 > 160 && g1 > 140 && b1 < 120) || (r2 > 160 && g2 > 140 && b2 < 120);
                        if (isWhite || isYellow) {
                            edgeCount++;
                            if (rowMinX === -1) { rowMinX = x; }
                            rowMaxX = x;
                        }
                    }
                }
                rowEdges[y] = edgeCount;
                rowXBounds[y] = { minX: rowMinX, maxX: rowMaxX };
                if (edgeCount > maxEdgeInRoi) {
                    maxEdgeInRoi = edgeCount;
                }
            }

            // 🌟 核心优化 2：自适应背景噪点分离门槛（引入字芯特征后，噪点行边缘数 <= 4，真实字幕达 30~180）
            const coreThreshold = Math.max(16, Math.min(24, Math.floor(maxEdgeInRoi * 0.20)));

            // 🌟 核心优化 3：双行/折行字幕自适应合并（行间允许 12 行间隙，确保双行长句紧凑连通，避免长距离误连）
            const clusters = [];
            let currentCluster = null;

            for (let y = roiYStart; y <= roiYEnd; y++) {
                if (rowEdges[y] >= coreThreshold) {
                    if (!currentCluster) {
                        currentCluster = { rows: [y], startY: y, endY: y };
                    } else {
                        currentCluster.rows.push(y);
                        currentCluster.endY = y;
                    }
                } else {
                    if (currentCluster) {
                        let hasNearby = false;
                        for (let g = y; g <= Math.min(roiYEnd, y + 12); g++) {
                            if (rowEdges[g] >= coreThreshold) {
                                hasNearby = true;
                                break;
                            }
                        }
                        if (!hasNearby) {
                            clusters.push(currentCluster);
                            currentCluster = null;
                        }
                    }
                }
            }
            if (currentCluster) {
                clusters.push(currentCluster);
            }

            // 换算播放器容器 Letterbox（黑边）补偿
            let offsetBottomPx = 0;
            let renderH = targetH;
            let containerH = targetH;

            if (trackedPlayer) {
                const pRect = trackedPlayer.getBoundingClientRect();
                const pW = pRect.width || trackedPlayer.clientWidth;
                const pH = pRect.height || trackedPlayer.clientHeight;
                if (pW > 0 && pH > 0) {
                    containerH = pH;
                    const playerRatio = pW / pH;
                    const videoRatio = vW / vH;
                    if (videoRatio > playerRatio) {
                        renderH = pW / videoRatio;
                        offsetBottomPx = (pH - renderH) / 2;
                    } else {
                        renderH = pH;
                        offsetBottomPx = 0;
                    }
                }
            }

            const candidateList = [];

            // 逐个聚类展开并计算参数
            for (const cl of clusters) {
                if (cl.rows.length < 2) { continue; }
                let minY = cl.startY;
                let maxY = cl.endY;

                // 弱笔画边缘微探（向上最多微探 2 像素捕获字形顶沿，避免长距离爬上人物白色胡须、白发或浅色衣物）
                let extUp = 0;
                while (minY > roiYStart && rowEdges[minY - 1] >= 16 && extUp < 2) {
                    minY--;
                    extUp++;
                }
                let extDown = 0;
                while (maxY < roiYEnd && rowEdges[maxY + 1] >= 16 && extDown < 2) {
                    maxY++;
                    extDown++;
                }

                // 🌟 防御 2：单块纵向厚度约束（常规双行字幕占画面约 8%~12%，严控在 <= 15%，防止垂直爬梯把整个人身串联）
                const textSpan = maxY - minY;
                if (textSpan < 4 || textSpan > Math.round(targetH * 0.15)) {
                    continue;
                }

                // 计算水平跨度
                let textMinX = targetW;
                let textMaxX = 0;
                for (let y = minY; y <= maxY; y++) {
                    if (rowXBounds[y] && rowXBounds[y].minX !== -1) {
                        if (rowXBounds[y].minX < textMinX) { textMinX = rowXBounds[y].minX; }
                        if (rowXBounds[y].maxX > textMaxX) { textMaxX = rowXBounds[y].maxX; }
                    }
                }
                const textWidthPx = Math.max(0, textMaxX - textMinX);
                const widthPercent = parseFloat(((textWidthPx / targetW) * 100).toFixed(1));

                if (widthPercent < 5.0 || widthPercent > 95.0) {
                    continue;
                }

                // 🌟 防御 3：水平中心对齐校验（对话字幕必然处于横向 36%~64% 核心居中区间，过滤画面侧边偏位动作与道具）
                const textCenterX = (textMinX + textMaxX) / 2;
                const centerPercent = (textCenterX / targetW) * 100;
                if (centerPercent < 36.0 || centerPercent > 64.0) {
                    continue;
                }

                // 🌟 精准遮盖 + 1.0% 安全冗余空间：彻底覆盖字幕文字顶沿抗锯齿羽化边、黑色描边及细微顶部笔画，杜绝漏字
                const subVideoPx = ((targetH - minY) / targetH) * renderH;
                const totalMaskPx = offsetBottomPx + subVideoPx;
                const rawHeightPercent = (totalMaskPx / containerH) * 100;
                const heightPercent = parseFloat((rawHeightPercent + 1.0).toFixed(1));

                // 🌟 防御 4：物理天花板硬上限截断（标准对话字幕绝不会超过 25%，宽银幕黑边自适应限幅，彻底杜绝跳变至 30%~40%）
                const maxAllowedHeight = offsetBottomPx > 0
                    ? parseFloat((((offsetBottomPx + renderH * 0.18) / containerH) * 100).toFixed(1))
                    : 25.0;

                if (heightPercent >= 6.0 && heightPercent <= maxAllowedHeight) {
                    candidateList.push({
                        heightPercent,
                        widthPercent,
                        minY,
                        maxY,
                        clusterBottomY: maxY // 在纵向坐标系中，数值越大表示越靠近画面底部
                    });
                }
            }

            // 🌟 核心排序规则：按 clusterBottomY 降序排序，确保排在首位的是【最靠近画面底部】的完整台词组！
            candidateList.sort((a, b) => b.clusterBottomY - a.clusterBottomY);
            return candidateList;

        } catch (err) {
            console.warn('[BiliMask] 视频帧像素读取受限(CORS):', err);
            if (allowPaused) {
                return [{ isClippedByCors: true }];
            }
        }
        return [];
    }

    function applyDetectedSubtitleHeight(detectedHeight) {
        stopSubtitleDetection();
        config.heightPercent = detectedHeight;
        config.visible = true; // 🌟 真正检测到内嵌字幕后，才正式唤起遮罩
        syncPositionAndHeight();
        if (maskBox) {
            maskBox.style.height = `${config.heightPercent}%`;
            maskBox.style.display = 'block';
        }
        updateBtnStateClass();
        saveCascadingConfig(config);
        triggerBtnVisibility(3000);
        flashDetectSuccessButton(); // 🌟 检测成功反馈：整个检测按钮背景渐变绿色微动效闪烁
    }

    function startSubtitleDetection(isManual = false, continuous = false) {
        if (isAutoDetecting) {
            stopSubtitleDetection();
            if (isManual) {
                showToast('⏹️ 已停止字幕监听');
            }
            return;
        }

        stopSubtitleDetection();

        const ctx = getVideoContext();
        const db = loadDatabase();

        // 若不是手动强制触发，且单P已有明确专属记录或为【无字幕】视频，则不自动触发
        if (!isManual && !continuous) {
            if (ctx.pId && db['P_' + ctx.pId]) {
                return;
            }
            if (isNoSubtitleVideo()) {
                return;
            }
        }

        const video = (trackedPlayer && trackedPlayer.querySelector('video')) || document.querySelector('video');
        if (!video) {
            if (isManual || continuous) {
                showToast('⚠️ 未定位到当前视频播放组件');
            }
            return;
        }

        // 🌟 核心防御：仅当用户【手动点击重新检测】（单次模式）且当前视频处于暂停状态时，才直接分析该单帧画面
        // 严禁自动/持续监听在视频刚载入时的系统暂停（Frame 0）进行任何单帧抓取，避免误检片头封面或改动遮挡条
        if (isManual && !continuous && video.paused) {
            showToast('🎯 正在分析当前暂停画面字幕...');
            const pausedCands = detectFrameSubtitle(video, true);
            if (pausedCands && pausedCands.length > 0) {
                if (pausedCands[0].isClippedByCors) {
                    applyDetectedSubtitleHeight(13.5);
                    showToast('⚠️ 视频受跨域保护，已自动应用推荐高度 13.5%');
                    return;
                }
                applyDetectedSubtitleHeight(pausedCands[0].heightPercent);
                return;
            } else {
                showToast('ℹ️ 当前暂停画面未检测到文字，保持现有状态');
                return;
            }
        }

        // 🌟 视频播放中或后台静默持续监听
        isAutoDetecting = true;
        isContinuousDetecting = continuous;
        updateDetectionUIState(true, continuous);

        if (continuous) {
            if (isManual) {
                showToast('🔄 已开启持续监听：画面出现台词时将自动遮挡并锁定');
            }
            // 仅在视频真正处于播放中状态时，才允许提取初始瞬时帧；暂停状态绝不提取第 0 帧
            if (!video.paused) {
                const instantCands = detectFrameSubtitle(video, false);
                if (instantCands && instantCands.length > 0 && !instantCands[0].isClippedByCors) {
                    applyDetectedSubtitleHeight(instantCands[0].heightPercent);
                    return;
                }
            }
        } else if (isManual) {
            showToast('🎯 正在分析画面字幕...');
            if (!video.paused) {
                const instantCands = detectFrameSubtitle(video, false);
                if (instantCands && instantCands.length > 0 && !instantCands[0].isClippedByCors) {
                    applyDetectedSubtitleHeight(instantCands[0].heightPercent);
                    return;
                }
            }
        }

        autoDetectSamples = 0;
        autoDetectCandidates = [];

        autoDetectTimer = setInterval(() => {
            const currentVideo = (trackedPlayer && trackedPlayer.querySelector('video')) || document.querySelector('video');
            if (!currentVideo || currentVideo.paused) {
                // 视频处于暂停状态（包括未起播、缓冲或中途暂停）时静默待命，严禁执行采样计算，不损耗采样计次
                return;
            }

            const cands = detectFrameSubtitle(currentVideo, false);
            if (cands && cands.length > 0) {
                if (cands[0].isClippedByCors) {
                    applyDetectedSubtitleHeight(13.5);
                    return;
                }

                // 核心判定：在所有满足【同一高度且宽度发生变化（动态台词）】的候选中，选取【最下面的】
                const dynamicMatches = [];
                for (const cand of cands) {
                    const matched = autoDetectCandidates.find(prev => {
                        const heightDiff = Math.abs(prev.heightPercent - cand.heightPercent);
                        const widthDiff = Math.abs(prev.widthPercent - cand.widthPercent);
                        return heightDiff <= 1.8 && widthDiff >= 4.0;
                    });

                    if (matched) {
                        dynamicMatches.push({
                            cand,
                            matchedPrev: matched,
                            finalHeight: parseFloat(Math.max(matched.heightPercent, cand.heightPercent).toFixed(1)),
                            clusterBottomY: cand.clusterBottomY
                        });
                    }
                }

                if (dynamicMatches.length > 0) {
                    dynamicMatches.sort((a, b) => b.clusterBottomY - a.clusterBottomY);
                    applyDetectedSubtitleHeight(dynamicMatches[0].finalHeight);
                    return;
                }

                // 持续监听或采样模式下，若已出现连续稳定出现同一位置的字幕
                if (autoDetectSamples >= 6 && autoDetectCandidates.length > 0) {
                    const stableCand = autoDetectCandidates.find(prev =>
                        Math.abs(prev.heightPercent - cands[0].heightPercent) <= 0.8
                    );
                    if (stableCand) {
                        applyDetectedSubtitleHeight(cands[0].heightPercent);
                        return;
                    }
                }

                if (!continuous && isManual && autoDetectSamples >= 3) {
                    // 手动单次模式下若已采样多帧已有候选但由于语速慢未触发宽度差分，直接以最底部的候选为准
                    applyDetectedSubtitleHeight(cands[0].heightPercent);
                    return;
                }

                for (const cand of cands) {
                    const isDuplicate = autoDetectCandidates.some(prev => 
                        Math.abs(prev.heightPercent - cand.heightPercent) <= 1.0 && 
                        Math.abs(prev.widthPercent - cand.widthPercent) < 2.5
                    );
                    if (!isDuplicate) {
                        autoDetectCandidates.push(cand);
                    }
                }
                if (autoDetectCandidates.length > 16) {
                    autoDetectCandidates.splice(0, autoDetectCandidates.length - 16);
                }
            }

            autoDetectSamples++;
            // 仅在非持续模式下设置最大采样轮数超时退出（约 9.6s）
            if (!continuous && autoDetectSamples >= (isManual ? 24 : 32)) {
                stopSubtitleDetection();
                // 🌟 未检出字幕时，静默停止且绝不修改遮挡条
                if (isManual) {
                    showToast('ℹ️ 播放中未检测到明显字幕，保持现有状态');
                }
            }
        }, 400);
    }

    
    const REDETECT_ICON_SVG = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="8"></circle>
            <line x1="12" y1="2" x2="12" y2="5"></line>
            <line x1="12" y1="19" x2="12" y2="22"></line>
            <line x1="2" y1="12" x2="5" y2="12"></line>
            <line x1="19" y1="12" x2="22" y2="12"></line>
            <circle cx="12" cy="12" r="2.5" fill="currentColor"></circle>
        </svg>
    `;

    let lastTriggerDetectTime = 0;
    function triggerManualDetection(continuous = false) {
        const now = Date.now();
        if (now - lastTriggerDetectTime < 300) { return; }
        lastTriggerDetectTime = now;
        if (isAutoDetecting) {
            stopSubtitleDetection();
            showToast('⏹️ 已停止字幕监听');
            return;
        }
        startSubtitleDetection(true, continuous);
    }

    const MINIMAL_DOUBLE_BARS_SVG = `
        <svg viewBox="0 0 10 5">
            <rect x="1.5" y="1.0" width="7" height="1.1" rx="0.55"/>
            <rect x="1.5" y="2.9" width="7" height="1.1" rx="0.55"/>
        </svg>
    `;

    function triggerBtnVisibility(stayMs) {
        const ms = stayMs || 800;
        if (!outsideBtn || isRouteChanging) { return; }
        outsideBtn.classList.add('is-shown');
        if (redetectBtn) {
            redetectBtn.classList.add('is-shown');
        }
        clearTimeout(autoHideTimer);

        autoHideTimer = setTimeout(() => {
            if (!isInteracting && !isHovered) {
                if (outsideBtn) {
                    outsideBtn.classList.remove('is-shown');
                }
                if (redetectBtn) {
                    redetectBtn.classList.remove('is-shown');
                }
            }
        }, ms);
    }

    function instantForceHideButton() {
        isHovered = false;
        isInteracting = false;
        clearTimeout(autoHideTimer);
        if (outsideBtn) {
            outsideBtn.style.setProperty('transition', 'none', 'important');
            outsideBtn.style.setProperty('opacity', '0', 'important');
            outsideBtn.classList.remove('is-shown');
            void outsideBtn.offsetHeight;
            outsideBtn.style.removeProperty('transition');
            outsideBtn.style.removeProperty('opacity');
        }
        if (redetectBtn) {
            redetectBtn.style.setProperty('transition', 'none', 'important');
            redetectBtn.style.setProperty('opacity', '0', 'important');
            redetectBtn.classList.remove('is-shown');
            void redetectBtn.offsetHeight;
            redetectBtn.style.removeProperty('transition');
            redetectBtn.style.removeProperty('opacity');
        }
    }

    function syncPositionAndHeight() {
        if (!trackedPlayer) { return; }

        if (maskBox) {
            maskBox.style.height = `${config.heightPercent}%`;
            maskBox.style.display = config.visible ? 'block' : 'none';
        }

        if (outsideBtn) {
            const rect = trackedPlayer.getBoundingClientRect();
            const vHeight = window.innerHeight || document.documentElement.clientHeight;
            const vWidth = window.innerWidth || document.documentElement.clientWidth;

            if (rect.bottom <= 0 || rect.top >= vHeight || rect.right <= 0 || rect.left >= vWidth) {
                outsideBtn.style.display = 'none';
                return;
            }

            outsideBtn.style.display = 'flex';
            const btnLeft = rect.right + 4;
            const maskTopY = rect.bottom - (rect.height * (config.heightPercent / 100));

            outsideBtn.style.left = `${btnLeft}px`;
            outsideBtn.style.top = `${maskTopY}px`;

            cachedBtnCenterX = btnLeft + 9;
            cachedBtnCenterY = maskTopY;
        }

        if (redetectBtn) {
            const rect = trackedPlayer.getBoundingClientRect();
            const vHeight = window.innerHeight || document.documentElement.clientHeight;
            const vWidth = window.innerWidth || document.documentElement.clientWidth;

            if (rect.bottom <= 0 || rect.top >= vHeight || rect.right <= 0 || rect.left >= vWidth) {
                redetectBtn.style.display = 'none';
            } else {
                redetectBtn.style.display = 'flex';
                const btnLeft = rect.right + 4;
                const maskTopY = rect.bottom - (rect.height * (config.heightPercent / 100));
                redetectBtn.style.left = `${btnLeft}px`;
                redetectBtn.style.top = `${maskTopY - 18}px`;
            }
        }
    }

    function requestSyncPosition() {
        if (rafPositionId) { return; }
        rafPositionId = requestAnimationFrame(() => {
            rafPositionId = null;
            syncPositionAndHeight();
        });
    }

    function updateBtnStateClass() {
        if (!outsideBtn) { return; }
        outsideBtn.classList.toggle('is-active', config.visible);
        outsideBtn.classList.toggle('is-inactive', !config.visible);
    }

    function initVicinitySensor() {
        window.addEventListener('mousemove', (e) => {
            if (!outsideBtn || !trackedPlayer || isInteracting || cachedBtnCenterX === 0 || isRouteChanging) { return; }

            const dx = e.clientX - cachedBtnCenterX;
            const dy = e.clientY - cachedBtnCenterY;
            const distance = Math.hypot(dx, dy);

            if (distance < 60) {
                isHovered = true;
                outsideBtn.classList.add('is-shown');
                if (redetectBtn) {
                    redetectBtn.classList.add('is-shown');
                }
                clearTimeout(autoHideTimer);
            } else {
                if (isHovered) {
                    isHovered = false;
                    triggerBtnVisibility(800);
                }
            }
        }, { passive: true });
    }

    // 🌟 Alt+M 开关：开启时手柄0.8s自动呼吸隐形，关闭时手柄0ms立刻同步瞬灭 🌟
    function toggleVisibility() {
        stopSubtitleDetection();
        config.visible = !config.visible;
        if (maskBox) {
            maskBox.style.display = config.visible ? 'block' : 'none';
        }
        updateBtnStateClass();

        if (config.visible) {
            triggerBtnVisibility(800);
        } else {
            if (!isHovered && outsideBtn) {
                instantForceHideButton();
            }
        }

        saveCascadingConfig(config);
    }

    // 🌟 Alt+1~5 预设秒切：300ms 预览结束手柄与指示线 0 延迟同步隐形 🌟
    function applyPresetHeight(percent) {
        stopSubtitleDetection();
        config.heightPercent = percent;
        if (!config.visible) {
            config.visible = true;
            updateBtnStateClass();
        }
        syncPositionAndHeight();

        if (maskBox) {
            maskBox.style.display = 'block';
            maskBox.classList.add('is-pressing-preview');

            if (outsideBtn) {
                outsideBtn.style.setProperty('transition', 'none', 'important');
                outsideBtn.style.setProperty('opacity', '1', 'important');
                outsideBtn.classList.add('is-shown');
                void outsideBtn.offsetHeight;
            }
            if (redetectBtn) {
                redetectBtn.style.setProperty('transition', 'none', 'important');
                redetectBtn.style.setProperty('opacity', '1', 'important');
                redetectBtn.classList.add('is-shown');
                void redetectBtn.offsetHeight;
            }

            clearTimeout(wheelPreviewTimer);
            wheelPreviewTimer = setTimeout(() => {
                if (maskBox) {
                    maskBox.classList.remove('is-pressing-preview');
                    maskBox.style.display = config.visible ? 'block' : 'none';
                }
                if (!isHovered && outsideBtn) {
                    instantForceHideButton();
                }
                saveCascadingConfig(config);
            }, 300);
        } else {
            saveCascadingConfig(config);
        }
    }

    // 🌟 键盘微调：微调结束手柄立即同步瞬灭 🌟
    function adjustHeightStep(step, isUp) {
        stopSubtitleDetection();
        let newPercent = config.heightPercent + (isUp ? step : -step);
        newPercent = Math.max(0, Math.min(85, parseFloat(newPercent.toFixed(2))));

        config.heightPercent = newPercent;

        if (!config.visible && isUp) {
            config.visible = true;
            updateBtnStateClass();
        }

        syncPositionAndHeight();

        if (maskBox) {
            maskBox.style.display = 'block';
            maskBox.classList.add('is-pressing-preview');

            if (outsideBtn) {
                outsideBtn.style.setProperty('transition', 'none', 'important');
                outsideBtn.style.setProperty('opacity', '1', 'important');
                outsideBtn.classList.add('is-shown');
                void outsideBtn.offsetHeight;
            }
            if (redetectBtn) {
                redetectBtn.style.setProperty('transition', 'none', 'important');
                redetectBtn.style.setProperty('opacity', '1', 'important');
                redetectBtn.classList.add('is-shown');
                void redetectBtn.offsetHeight;
            }
        }

        clearTimeout(wheelPreviewTimer);
        wheelPreviewTimer = setTimeout(() => {
            if (maskBox && !isKeyboardPeeking) {
                maskBox.classList.remove('is-pressing-preview');
                maskBox.style.display = config.visible ? 'block' : 'none';
            }
            if (!isHovered && outsideBtn) {
                instantForceHideButton();
            }
            saveCascadingConfig(config);
        }, 350);
    }

    function initWheelAdjustment() {
        window.addEventListener('wheel', (e) => {
            if (!e.altKey) { return; }
            if (!trackedPlayer) { return; }

            const rect = trackedPlayer.getBoundingClientRect();
            const vHeight = window.innerHeight || document.documentElement.clientHeight;
            if (rect.bottom <= 0 || rect.top >= vHeight) { return; }

            e.preventDefault();
            e.stopPropagation();

            adjustHeightStep(0.8, e.deltaY < 0);
        }, { passive: false, capture: true });
    }

    function initHybridBtnInteraction(container) {
        let isMouseDown = false;
        let isDragging = false;
        let startY = 0;
        let startPercent = 0;
        let startTime = 0;
        let cachedPlayerHeight = 0;
        let cachedPlayerBottom = 0;

        // 屏蔽拖动按钮上的右键菜单与右键点击响应
        // 右键点击呼出快捷选项菜单（持续监听/关闭遮挡/记忆管理）
        outsideBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showQuickOptionsMenu(e.clientX, e.clientY);
        });

        outsideBtn.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) { return; } // 仅响应鼠标左键，右键及其他按键完全不响应
            e.stopPropagation();
            stopSubtitleDetection();

            isMouseDown = true;
            isDragging = false;
            isInteracting = true;
            outsideBtn.classList.add('is-shown');
            if (redetectBtn) {
                redetectBtn.classList.add('is-shown');
            }
            outsideBtn.classList.add('is-dragging');
            clearTimeout(autoHideTimer);

            startY = e.clientY;
            startPercent = config.heightPercent;
            startTime = Date.now();

            const rect = container.getBoundingClientRect();
            cachedPlayerHeight = rect.height || container.offsetHeight;
            cachedPlayerBottom = rect.bottom;

            if (maskBox) {
                maskBox.style.display = 'block';
                maskBox.classList.add('is-pressing-preview');
            }

            try {
                outsideBtn.setPointerCapture(e.pointerId);
            } catch (err) {
                void err;
            }

            const onPointerMove = (moveEvt) => {
                moveEvt.stopPropagation();
                if (!isMouseDown) { return; }

                const dy = moveEvt.clientY - startY;

                if (Math.abs(dy) > 2) {
                    isDragging = true;
                    if (!config.visible) {
                        config.visible = true;
                        updateBtnStateClass();
                    }

                    if (cachedPlayerHeight <= 0) { return; }

                    const currentPx = (startPercent / 100) * cachedPlayerHeight;
                    const newHeightPx = Math.max(0, Math.min(cachedPlayerHeight * 0.85, currentPx - dy));
                    let newPercent = (newHeightPx / cachedPlayerHeight) * 100;
                    newPercent = Math.max(0, Math.min(85, newPercent));

                    config.heightPercent = parseFloat(newPercent.toFixed(2));

                    if (maskBox) {
                        maskBox.style.height = `${newPercent}%`;
                    }
                    if (outsideBtn) {
                        const newTop = cachedPlayerBottom - newHeightPx;
                        outsideBtn.style.top = `${newTop}px`;
                        cachedBtnCenterY = newTop;
                        if (redetectBtn) {
                            redetectBtn.style.top = `${newTop - 18}px`;
                        }
                    }
                }
            };

            const onPointerUp = (upEvt) => {
                upEvt.stopPropagation();
                if (isMouseDown) {
                    isMouseDown = false;
                    isInteracting = false;
                    outsideBtn.classList.remove('is-dragging');

                    if (maskBox && !isKeyboardPeeking) {
                        maskBox.classList.remove('is-pressing-preview');
                        maskBox.style.display = config.visible ? 'block' : 'none';
                    }

                    try {
                        outsideBtn.releasePointerCapture(upEvt.pointerId);
                    } catch (err) {
                        void err;
                    }

                    window.removeEventListener('pointermove', onPointerMove, true);
                    window.removeEventListener('pointerup', onPointerUp, true);

                    syncPositionAndHeight();

                    if (!isHovered) {
                        triggerBtnVisibility(800);
                    }

                    if (!isDragging && (Date.now() - startTime < 350)) {
                        toggleVisibility();
                    } else if (isDragging) {
                        saveCascadingConfig(config);
                    }
                }
            };

            window.addEventListener('pointermove', onPointerMove, true);
            window.addEventListener('pointerup', onPointerUp, true);
            e.preventDefault();
        });
    }

    function createMaskSystem(playerContainer) {
        if (document.getElementById('bili-subtitle-mask-box-standalone')) { return; }

        trackedPlayer = playerContainer;
        config = getActiveHeightAndVisibility();

        // A. 视频内部遮罩
        maskBox = document.createElement('div');
        maskBox.id = 'bili-subtitle-mask-box-standalone';
        maskBox.className = 'bili-subtitle-mask-box-standalone';
        playerContainer.appendChild(maskBox);

        // B. 独立外置浮动按钮
        outsideBtn = document.createElement('div');
        outsideBtn.id = 'bili-mask-standalone-outside-btn';
        outsideBtn.className = `bili-mask-standalone-outside-btn ${config.visible ? 'is-active' : 'is-inactive'}`;
        outsideBtn.title = '按住/Alt+J：50%透光看字幕 | 拖动调节高度 | Alt+M 开关 | Alt+O 智能重识别 | Alt+1~5 预设秒切 | Alt+↑/↓ 微调';
        outsideBtn.innerHTML = MINIMAL_DOUBLE_BARS_SVG;
        document.body.appendChild(outsideBtn);

        // C. 伴随外置手柄快捷重新检测按钮
        redetectBtn = document.createElement('div');
        redetectBtn.id = 'bili-mask-standalone-redetect-btn';
        redetectBtn.className = 'bili-mask-standalone-redetect-btn';
        redetectBtn.title = '🎯 重新检测字幕高度 (Alt+O)';
        redetectBtn.innerHTML = REDETECT_ICON_SVG;
        document.body.appendChild(redetectBtn);

        redetectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isAutoDetecting) {
                stopSubtitleDetection();
                showToast('⏹️ 已停止字幕监听');
                return;
            }
            triggerManualDetection(false);
        });
        redetectBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });
        redetectBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showQuickOptionsMenu(e.clientX, e.clientY);
        });
        redetectBtn.addEventListener('mouseenter', () => {
            isHovered = true;
            outsideBtn.classList.add('is-shown');
            redetectBtn.classList.add('is-shown');
            clearTimeout(autoHideTimer);
        });
        redetectBtn.addEventListener('mouseleave', () => {
            isHovered = false;
            triggerBtnVisibility(800);
        });

        

        instantForceHideButton();
        syncPositionAndHeight();
        updateBtnStateClass();

        initHybridBtnInteraction(playerContainer);
        initWheelAdjustment();
        initVicinitySensor();

        window.addEventListener('scroll', requestSyncPosition, { passive: true });
        window.addEventListener('resize', requestSyncPosition, { passive: true });

        const resizeObserver = new ResizeObserver(() => requestSyncPosition());
        resizeObserver.observe(playerContainer);

        // 统一委托 handleRouteChange 完成首帧路由策略与字幕检测控制（遵循新视频策略与单P专属记忆）
        handleRouteChange();
    }

    // 🌟 检测成功极简微动效反馈：整个检测按钮背景色渐变绿色闪烁 🌟
    let btnSuccessFlashTimer = null;
    function flashDetectSuccessButton() {
        if (!redetectBtn) { return; }
        triggerBtnVisibility(3000);
        redetectBtn.classList.remove('is-success-flash');
        void redetectBtn.offsetWidth; // 触发回流重置动效
        redetectBtn.classList.add('is-success-flash');
        if (btnSuccessFlashTimer) {
            clearTimeout(btnSuccessFlashTimer);
        }
        btnSuccessFlashTimer = setTimeout(() => {
            if (redetectBtn) {
                redetectBtn.classList.remove('is-success-flash');
            }
        }, 1150);
    }

    // 彻底移除全局冗余提示信息，保持空实现避免外部引用报错
    function showToast() {}

    // 🌟 B站原生UI风格记忆管理弹窗 🌟
    function showMemoryModal() {
        let backdrop = document.getElementById('bili-mask-modal-backdrop');
        const ctx = getVideoContext();
        const isDark = document.documentElement.classList.contains('dark') || 
                       document.body.classList.contains('dark') || 
                       document.querySelector('.bili-theme-dark') !== null;

        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'bili-mask-modal-backdrop';
            backdrop.innerHTML = `
                <div class="bili-mask-modal-card ${isDark ? 'bili-mask-card-dark' : 'bili-mask-card-light'}">
                    <!-- 视图 1：主管理菜单 -->
                    <div id="bili-mask-view-main">
                        <div class="bili-mask-modal-header">
                            <div class="bili-mask-modal-title">
                                <span>🎬</span>
                                <span>无字幕观影 · 记忆管理</span>
                            </div>
                            <div class="bili-mask-modal-close" id="bili-mask-close-btn">&times;</div>
                        </div>
                        <div class="bili-mask-modal-info" id="bili-mask-info-text">
                            正在获取当前视频信息...
                        </div>
                        <div style="margin-bottom: 14px; padding: 10px 12px; border-radius: 8px; background: rgba(0, 174, 236, 0.08); border: 1px solid rgba(0, 174, 236, 0.2); font-size: 13px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                                <span style="font-weight:600;">🆕 新视频规则：</span>
                                <span id="bili-strategy-badge" style="color:#00aeec; font-weight:600;">持续监听</span>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button class="bili-mask-action-btn btn-normal" id="bili-btn-strat-continuous" style="flex:1; height:32px; font-size:12px;">🔄 持续监听</button>
                                <button class="bili-mask-action-btn btn-normal" id="bili-btn-strat-closed" style="flex:1; height:32px; font-size:12px;">🚫 默认关闭</button>
                            </div>
                        </div>
                        <div class="bili-mask-btn-group">
                            <button class="bili-mask-action-btn btn-normal" id="bili-btn-auto-detect">🎯 重新单次检测 (Alt+O)</button>
                            <button class="bili-mask-action-btn btn-normal" id="bili-btn-continuous-detect">🔄 持续监听直到遮挡</button>
                            <button class="bili-mask-action-btn btn-normal" id="bili-btn-close-mask">🚫 关闭字幕遮挡 (Alt+M)</button>
                            <button class="bili-mask-action-btn btn-normal" id="bili-btn-clear-list">🧹 清除当前合集记忆</button>
                            <button class="bili-mask-action-btn btn-normal" id="bili-btn-clear-up">👤 清除当前UP主记忆</button>
                            <button class="bili-mask-action-btn btn-danger" id="bili-btn-clear-all">🗑️ 清除所有全部记忆</button>
                        </div>
                    </div>

                    <!-- 视图 2：B站原生UI二次确认视图（彻底告别系统原生丑陋弹窗） -->
                    <div id="bili-mask-view-confirm" style="display:none;">
                        <div class="bili-mask-modal-header">
                            <div class="bili-mask-modal-title" style="color:#f85a5a;">
                                <span>⚠️</span>
                                <span>确定清除所有记忆？</span>
                            </div>
                            <div class="bili-mask-confirm-close-btn" id="bili-mask-confirm-close-btn">&times;</div>
                        </div>
                        <div class="bili-mask-modal-info" style="color:#f85a5a; background:rgba(248, 90, 90, 0.08); border:1px solid rgba(248, 90, 90, 0.2);">
                            ⚠️ 此操作将彻底清空所有视频、合集以及 UP 主的专属遮挡高度，恢复至默认初始状态，不可撤销。
                        </div>
                        <div style="display:flex; gap:10px; margin-top:14px;">
                            <button class="bili-mask-action-btn btn-normal" id="bili-btn-confirm-cancel" style="flex:1;">取消</button>
                            <button class="bili-mask-action-btn btn-danger" id="bili-btn-confirm-ok" style="flex:1;">确认清除</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(backdrop);

            const viewMain = document.getElementById('bili-mask-view-main');
            const viewConfirm = document.getElementById('bili-mask-view-confirm');

            const resetViews = () => {
                viewMain.style.display = 'block';
                viewConfirm.style.display = 'none';
            };

            // 点击遮罩外部或关闭按钮退出
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    backdrop.classList.remove('is-open');
                    resetViews();
                }
            });
            document.getElementById('bili-mask-close-btn').addEventListener('click', () => {
                backdrop.classList.remove('is-open');
                resetViews();
            });
            document.getElementById('bili-mask-confirm-close-btn').addEventListener('click', () => {
                resetViews();
            });
            document.getElementById('bili-btn-confirm-cancel').addEventListener('click', () => {
                resetViews();
            });

            // 新视频策略切换
            const updateStrategyButtonsUI = () => {
                const strat = getNewVideoStrategy();
                const badge = document.getElementById('bili-strategy-badge');
                if (badge) {
                    badge.textContent = strat === 'continuous' ? '持续监听' : '默认关闭';
                }
                const bCont = document.getElementById('bili-btn-strat-continuous');
                const bClose = document.getElementById('bili-btn-strat-closed');
                if (bCont && bClose) {
                    if (strat === 'continuous') {
                        bCont.style.setProperty('background', '#00aeec', 'important');
                        bCont.style.setProperty('color', '#ffffff', 'important');
                        bCont.style.setProperty('border-color', '#00aeec', 'important');
                        bClose.style.removeProperty('background');
                        bClose.style.removeProperty('color');
                        bClose.style.removeProperty('border-color');
                    } else {
                        bClose.style.setProperty('background', '#00aeec', 'important');
                        bClose.style.setProperty('color', '#ffffff', 'important');
                        bClose.style.setProperty('border-color', '#00aeec', 'important');
                        bCont.style.removeProperty('background');
                        bCont.style.removeProperty('color');
                        bCont.style.removeProperty('border-color');
                    }
                }
            };

            document.getElementById('bili-btn-strat-continuous').addEventListener('click', () => {
                setNewVideoStrategy('continuous');
                updateStrategyButtonsUI();
            });
            document.getElementById('bili-btn-strat-closed').addEventListener('click', () => {
                setNewVideoStrategy('closed');
                updateStrategyButtonsUI();
            });

            // 按钮 0：重新单次检测字幕
            document.getElementById('bili-btn-auto-detect').addEventListener('click', () => {
                backdrop.classList.remove('is-open');
                resetViews();
                triggerManualDetection(false);
            });

            // 按钮 0.1：持续监听直到遮挡
            document.getElementById('bili-btn-continuous-detect').addEventListener('click', () => {
                backdrop.classList.remove('is-open');
                resetViews();
                if (isContinuousDetecting) {
                    stopSubtitleDetection();
                    showToast('⏹️ 已停止持续监听');
                } else {
                    triggerManualDetection(true);
                }
            });

            // 按钮 0.2：关闭字幕遮挡
            document.getElementById('bili-btn-close-mask').addEventListener('click', () => {
                backdrop.classList.remove('is-open');
                resetViews();
                closeSubtitleMask();
            });

            // 按钮 1：清除当前合集记忆
            document.getElementById('bili-btn-clear-list').addEventListener('click', () => {
                const currentCtx = getVideoContext();
                if (!currentCtx.listId) {
                    showToast('ℹ️ 当前视频未归属于任何合集/番剧');
                    return;
                }
                const db = loadDatabase();
                if (db['LIST_' + currentCtx.listId]) {
                    delete db['LIST_' + currentCtx.listId];
                    saveDatabase(db);
                }
                config = getActiveHeightAndVisibility();
                syncPositionAndHeight();
                if (maskBox) { maskBox.style.display = config.visible ? 'block' : 'none'; }
                updateBtnStateClass();
                triggerBtnVisibility(800);
                showToast('✅ 当前合集专属记忆已清除');
                backdrop.classList.remove('is-open');
                resetViews();
            });

            // 按钮 2：清除当前UP主记忆
            document.getElementById('bili-btn-clear-up').addEventListener('click', () => {
                const currentCtx = getVideoContext();
                if (!currentCtx.upId) {
                    showToast('ℹ️ 未能检测到当前 UP 主信息');
                    return;
                }
                const db = loadDatabase();
                if (db['UP_' + currentCtx.upId]) {
                    delete db['UP_' + currentCtx.upId];
                    saveDatabase(db);
                }
                config = getActiveHeightAndVisibility();
                syncPositionAndHeight();
                if (maskBox) { maskBox.style.display = config.visible ? 'block' : 'none'; }
                updateBtnStateClass();
                triggerBtnVisibility(800);
                showToast('✅ 当前 UP 主专属记忆已清除');
                backdrop.classList.remove('is-open');
                resetViews();
            });

            // 按钮 3：点击“清除所有全部记忆”，平滑切换至 B 站原生二次确认页面
            document.getElementById('bili-btn-clear-all').addEventListener('click', () => {
                viewMain.style.display = 'none';
                viewConfirm.style.display = 'block';
            });

            // 二次确认：执行清除全部
            document.getElementById('bili-btn-confirm-ok').addEventListener('click', () => {
                try {
                    if (typeof GM_setValue !== 'undefined') {
                        GM_setValue(DB_STORAGE_KEY, {});
                    }
                    localStorage.removeItem(DB_STORAGE_KEY);
                } catch (err) {
                    void err;
                }
                config = getActiveHeightAndVisibility();
                syncPositionAndHeight();
                if (maskBox) { maskBox.style.display = config.visible ? 'block' : 'none'; }
                updateBtnStateClass();
                triggerBtnVisibility(800);
                showToast('✅ 已清空所有全部记忆数据');
                backdrop.classList.remove('is-open');
                resetViews();
            });
        }

        // 动态更新主题样式与当前上下文摘要
        const card = backdrop.querySelector('.bili-mask-modal-card');
        if (card) {
            card.className = `bili-mask-modal-card ${isDark ? 'bili-mask-card-dark' : 'bili-mask-card-light'}`;
        }
        const infoEl = document.getElementById('bili-mask-info-text');
        if (infoEl) {
            infoEl.innerHTML = `
                <div>📌 <b>当前合集/番剧</b>：${ctx.listId ? ctx.listId : '<span style="opacity:0.65">无 (单篇视频)</span>'}</div>
                <div style="margin-top:3px;">👤 <b>当前 UP 主 UID</b>：${ctx.upId ? ctx.upId : '<span style="opacity:0.65">未知</span>'}</div>
                <div style="margin-top:3px;">📏 <b>当前高度状态</b>：${config.heightPercent}%（${config.visible ? '开启' : '关闭'}）</div>
            `;
        }

        const updateStrategyButtonsUI = () => {
            const strat = getNewVideoStrategy();
            const badge = document.getElementById('bili-strategy-badge');
            if (badge) {
                badge.textContent = strat === 'continuous' ? '持续监听' : '默认关闭';
            }
            const bCont = document.getElementById('bili-btn-strat-continuous');
            const bClose = document.getElementById('bili-btn-strat-closed');
            if (bCont && bClose) {
                if (strat === 'continuous') {
                    bCont.style.setProperty('background', '#00aeec', 'important');
                    bCont.style.setProperty('color', '#ffffff', 'important');
                    bCont.style.setProperty('border-color', '#00aeec', 'important');
                    bClose.style.removeProperty('background');
                    bClose.style.removeProperty('color');
                    bClose.style.removeProperty('border-color');
                } else {
                    bClose.style.setProperty('background', '#00aeec', 'important');
                    bClose.style.setProperty('color', '#ffffff', 'important');
                    bClose.style.setProperty('border-color', '#00aeec', 'important');
                    bCont.style.removeProperty('background');
                    bCont.style.removeProperty('color');
                    bCont.style.removeProperty('border-color');
                }
            }
        };
        updateStrategyButtonsUI();

        const viewMain = document.getElementById('bili-mask-view-main');
        const viewConfirm = document.getElementById('bili-mask-view-confirm');
        if (viewMain && viewConfirm) {
            viewMain.style.display = 'block';
            viewConfirm.style.display = 'none';
        }

        backdrop.classList.add('is-open');
    }

    // 🌟 油猴菜单注册：一键唤起管理弹窗与重新识别 🌟
    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand !== 'undefined') {
            const currentStrat = getNewVideoStrategy();
            const stratLabel = currentStrat === 'continuous' ? '持续监听' : '默认关闭';
            GM_registerMenuCommand(`⚙️ 新视频规则：${stratLabel} (点击切换)`, () => {
                const next = getNewVideoStrategy() === 'continuous' ? 'closed' : 'continuous';
                setNewVideoStrategy(next);
            });
            GM_registerMenuCommand('🎯 重新单次检测字幕 (Alt+O)', () => {
                triggerManualDetection(false);
            });
            GM_registerMenuCommand('🔄 持续监听直到遮挡', () => {
                triggerManualDetection(true);
            });
            GM_registerMenuCommand('🚫 关闭字幕遮挡 (Alt+M)', () => {
                closeSubtitleMask();
            });
            GM_registerMenuCommand('👁️ 开启字幕遮挡 (Alt+M)', () => {
                if (!config.visible) { toggleVisibility(); }
            });
            GM_registerMenuCommand('⚙️ 观影记忆管理', () => {
                showMemoryModal();
            });
        }
    }

    // 🌟 全局快捷键处理 🌟
    function handleGlobalHotkey(e) {
        // ESC 键关闭弹窗
        if (e.key === 'Escape' || e.code === 'Escape') {
            const backdrop = document.getElementById('bili-mask-modal-backdrop');
            if (backdrop && backdrop.classList.contains('is-open')) {
                backdrop.classList.remove('is-open');
                return;
            }
        }

        const target = e.target;
        if (target) {
            const tag = target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
                return;
            }
        }

        if (e.altKey) {
            // A. Alt + M 开关
            if (e.key === 'm' || e.key === 'M' || e.code === 'KeyM') {
                e.preventDefault();
                e.stopPropagation();
                if (e.repeat) { return; }
                toggleVisibility();
                return;
            }

            // B. Alt + J 50% 透视查看
            if (e.key === 'j' || e.key === 'J' || e.code === 'KeyJ') {
                e.preventDefault();
                e.stopPropagation();
                if (!isKeyboardPeeking) {
                    isKeyboardPeeking = true;
                    if (maskBox) {
                        maskBox.style.display = 'block';
                        maskBox.classList.add('is-pressing-preview');
                    }
                    if (outsideBtn) {
                        outsideBtn.style.setProperty('transition', 'none', 'important');
                        outsideBtn.style.setProperty('opacity', '1', 'important');
                        outsideBtn.classList.add('is-shown');
                        void outsideBtn.offsetHeight;
                    }
                    if (redetectBtn) {
                        redetectBtn.style.setProperty('transition', 'none', 'important');
                        redetectBtn.style.setProperty('opacity', '1', 'important');
                        redetectBtn.classList.add('is-shown');
                        void redetectBtn.offsetHeight;
                    }
                }
                return;
            }

            // C. Alt + ↑ / ↓ 纯键盘微调
            if (e.key === 'ArrowUp' || e.code === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                adjustHeightStep(1.0, true);
                return;
            }
            if (e.key === 'ArrowDown' || e.code === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                adjustHeightStep(1.0, false);
                return;
            }

            // D. Alt + 1~5 预设档位秒切
            let preset = null;
            if (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') { preset = 8.5; }
            else if (e.key === '2' || e.code === 'Digit2' || e.code === 'Numpad2') { preset = 13.0; }
            else if (e.key === '3' || e.code === 'Digit3' || e.code === 'Numpad3') { preset = 18.0; }
            else if (e.key === '4' || e.code === 'Digit4' || e.code === 'Numpad4') { preset = 24.0; }
            else if (e.key === '5' || e.code === 'Digit5' || e.code === 'Numpad5') { preset = 30.0; }

            if (preset !== null) {
                e.preventDefault();
                e.stopPropagation();
                if (e.repeat) { return; }
                applyPresetHeight(preset);
                return;
            }

            // E. Alt + O 手动重新自动识别
            if (e.key === 'o' || e.key === 'O' || e.code === 'KeyO') {
                e.preventDefault();
                e.stopPropagation();
                if (e.repeat) { return; }
                startSubtitleDetection(true);
                return;
            }
        }
    }

    function handleGlobalKeyUp(e) {
        if (isKeyboardPeeking) {
            if (e.key === 'j' || e.key === 'J' || e.key === 'Alt' || e.code === 'KeyJ') {
                isKeyboardPeeking = false;
                if (maskBox) {
                    maskBox.classList.remove('is-pressing-preview');
                    maskBox.style.display = config.visible ? 'block' : 'none';
                }
                if (!isHovered && outsideBtn) {
                    instantForceHideButton();
                }
            }
        }
    }

    window.addEventListener('keydown', handleGlobalHotkey, { capture: true, passive: false });
    document.addEventListener('keydown', handleGlobalHotkey, { capture: true, passive: false });
    window.addEventListener('keyup', handleGlobalKeyUp, { capture: true, passive: false });
    document.addEventListener('keyup', handleGlobalKeyUp, { capture: true, passive: false });

    // 🌟 全量原子化首帧同步 🌟
    function handleRouteChange() {
        isRouteChanging = true;
        stopSubtitleDetection();
        instantForceHideButton();

        const thisSeq = ++currentRouteSeq;

        const applyNewVideoConfig = () => {
            if (thisSeq !== currentRouteSeq) { return; }

            config = getActiveHeightAndVisibility();
            syncPositionAndHeight();

            if (maskBox) {
                maskBox.style.display = config.visible ? 'block' : 'none';
            }
            updateBtnStateClass();
            
            isRouteChanging = false;

            // 🌟 旧视频严格遵从单P记忆；新视频根据策略决定【持续监听直到遮挡】或【默认完全关闭】
            const db = loadDatabase();
            const thisCtx = getVideoContext();
            const isNewVideo = !thisCtx.pId || !db['P_' + thisCtx.pId];

            if (isNewVideo) {
                if (!isNoSubtitleVideo()) {
                    const strategy = getNewVideoStrategy();
                    if (strategy === 'continuous') {
                        // 策略一：新视频起播后后台静默持续监听，检出首句字幕时自动开启遮挡并锁定
                        startSubtitleDetection(false, true);
                    } else {
                        // 策略二：新视频默认关闭，不自动监听
                        stopSubtitleDetection();
                    }
                }
            }
        };

        const video = document.querySelector('video');
        if (video) {
            let hasFired = false;
            const onFrameReady = () => {
                if (hasFired) { return; }
                hasFired = true;
                video.removeEventListener('loadeddata', onFrameReady);
                video.removeEventListener('playing', onFrameReady);
                video.removeEventListener('canplay', onFrameReady);
                applyNewVideoConfig();
            };

            if (video.readyState >= 2) {
                onFrameReady();
            } else {
                video.addEventListener('loadeddata', onFrameReady, { once: true });
                video.addEventListener('playing', onFrameReady, { once: true });
                video.addEventListener('canplay', onFrameReady, { once: true });

                clearTimeout(pendingRouteTimer);
                pendingRouteTimer = setTimeout(onFrameReady, 600);
            }
        } else {
            applyNewVideoConfig();
        }
    }

    function checkUrlChange() {
        const currentUrl = window.location.href;
        if (currentUrl === lastObservedUrl) { return; }
        lastObservedUrl = currentUrl;
        handleRouteChange();
    }

    setInterval(checkUrlChange, 200);

    window.addEventListener('popstate', () => {
        lastObservedUrl = window.location.href;
        handleRouteChange();
    });

    const wrapHistory = (type) => {
        const orig = history[type];
        return function (...args) {
            const rv = orig.apply(this, args);
            lastObservedUrl = window.location.href;
            handleRouteChange();
            return rv;
        };
    };
    history.pushState = wrapHistory('pushState');
    history.replaceState = wrapHistory('replaceState');

    function initObserver() {
        let isMounting = false;

        const checkAndMount = () => {
            if (isMounting) { return; }
            isMounting = true;

            const hasMask = document.getElementById('bili-subtitle-mask-box-standalone');
            if (!hasMask) {
                const player = document.querySelector('.bpx-player-video-area') || 
                               document.querySelector('.bilibili-player-video-wrap') ||
                               document.querySelector('.squirtle-video-wrapper') ||
                               document.querySelector('#bilibili-player .player-wrap') ||
                               document.querySelector('.bpx-player-container');
                if (player) {
                    createMaskSystem(player);
                }
            }
            
            isMounting = false;
        };

        checkAndMount();
        const observer = new MutationObserver(checkAndMount);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // 初始化注册油猴菜单
    registerMenuCommands();
    initObserver();
})();
