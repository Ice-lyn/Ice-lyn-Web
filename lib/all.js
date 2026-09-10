/* lib/all.js - 冰凌呀小栈 公共脚本库 */

// 樱花飘落
function initSakura() {
    const container = document.getElementById('sakuraContainer');
    if (!container) return;
    const petals = ['🌸', '💮', '🌷', '✿', '❀', '🩷', '🌺'];
    function createPetal() {
        const p = document.createElement('span');
        p.className = 'sakura-petal';
        p.textContent = petals[Math.floor(Math.random() * petals.length)];
        p.style.left = Math.random() * 100 + '%';
        p.style.fontSize = (Math.random() * 1.2 + 0.8) + 'rem';
        p.style.animationDuration = (Math.random() * 10 + 10) + 's';
        p.style.animationDelay = Math.random() * 8 + 's';
        container.appendChild(p);
        p.addEventListener('animationend', () => {
            p.remove();
            createPetal();
        });
    }
    for (let i = 0; i < 22; i++) setTimeout(createPetal, i * 300);
}

// 汉堡菜单
function initHamburger() {
    const hamburger = document.getElementById('hamburgerBtn');
    const navLinks = document.getElementById('navLinks');
    if (!hamburger || !navLinks) return;
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('open');
        const icon = hamburger.querySelector('i');
        if (icon) icon.className = navLinks.classList.contains('open') ? 'fas fa-times' : 'fas fa-bars';
    });
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
            const icon = hamburger.querySelector('i');
            if (icon) icon.className = 'fas fa-bars';
        });
    });
}

// 回到顶部
function initBackToTop() {
    const backBtn = document.getElementById('backToTop');
    if (!backBtn) return;
    window.addEventListener('scroll', () => {
        backBtn.classList.toggle('visible', window.scrollY > 500);
    });
    backBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// AOS 初始化 (需要先加载 AOS 库)
function initAOS() {
    if (typeof AOS !== 'undefined') {
        AOS.init({ duration: 700, once: true, offset: 60 });
    }
}

// 解析 Front Matter
function parseFrontMatter(mdText) {
    const result = { meta: {}, content: '' };
    const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = mdText.match(fmRegex);
    if (match) {
        const fmBlock = match[1];
        result.content = match[2].trim();
        fmBlock.split('\n').forEach(line => {
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) return;
            const key = line.substring(0, colonIdx).trim();
            let value = line.substring(colonIdx + 1).trim();
            value = value.replace(/^["']|["']$/g, '');
            if (value.startsWith('[') && value.endsWith(']')) {
                try { value = JSON.parse(value); } catch (e) { }
            }
            result.meta[key] = value;
        });
    } else {
        result.content = mdText.trim();
    }
    return result;
}

// 提取摘要
function extractExcerpt(markdownContent, maxLen = 150) {
    let text = markdownContent
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/!\[.*?\]\([^)]+\)/g, '')
        .replace(/\n+/g, ' ')
        .trim();
    if (text.length > maxLen) {
        text = text.substring(0, maxLen).replace(/\s+\S*$/, '') + '...';
    }
    return text;
}

// 全局启动
document.addEventListener('DOMContentLoaded', () => {
    initSakura();
    initHamburger();
    initBackToTop();
    initAOS();
});