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

// AOS 初始化 (需要先加载 AOS 库，避免与页面内联的 AOS.init 重复初始化)
function initAOS() {
    if (typeof AOS === 'undefined') return;
    // 页面内联脚本若已初始化过 AOS，则只刷新，让动态渲染的导航/页脚也参与动画
    if (document.querySelector('[data-aos].aos-init')) {
        AOS.refreshHard();
        return;
    }
    AOS.init({ duration: 700, once: true, offset: 60 });
}

/* ============================================================
   全站公共页面配置（导航栏 / 页脚）
   各页面只需放置 <div id="siteNav"></div> 与 <div id="siteFooter"></div>
   ============================================================ */
const SITE_CONFIG = {
    brand: {
        href: '/',
        icon: '❄️',
        text: '冰凌呀 · 小栈'
    },
    // 顶部导航项：match 为路径前缀，用于自动高亮当前页（按 location.pathname 匹配）
    nav: [
        {
            key: 'home', label: '首页', icon: 'fas fa-home', href: '/',
            match: ['/index.html', '/']
        },
        {
            key: 'tools', label: '工具', icon: 'fas fa-wand-magic-sparkles', href: '/tools/',
            match: ['/tools']
        },
        {
            key: 'api', label: 'API', icon: 'fas fa-plug', href: '/apis/',
            match: ['/api']
        },
        {
            key: 'github', label: 'GitHub', icon: 'fab fa-github', href: 'https://github.com/Ice-lyn',
            external: true
        }
    ],
    footer: {
        copyright: '© 2026 Ice_lyn · 保持好奇，保持温柔',
        author: 'Ice_lyn',
        authorUrl: 'https://github.com/Ice-lyn',
        authorText: '冰凌呀',
        ai: 'DeepSeek',
        aiUrl: 'https://deepseek.com/',
        aiVersion: 'v4 Pro'
    }
};

// 根据当前路径计算需要高亮的导航项（支持子路径，如 /tools/tool/000.html）
function getActiveNavKey(pathname) {
    const path = pathname.replace(/\/index\.html$/, '/');
    // 先精确匹配，再按前缀匹配；首页 '/' 放最后兜底
    const exact = SITE_CONFIG.nav.find(item => item.match && item.match.includes(path));
    if (exact) return exact.key;
    const prefix = SITE_CONFIG.nav.find(item =>
        item.match && item.match.some(prefix => prefix !== '/' && path.startsWith(prefix))
    );
    if (prefix) return prefix.key;
    return path === '/' ? 'home' : '';
}

// 渲染公共导航栏
function renderSiteNav() {
    const mount = document.getElementById('siteNav');
    if (!mount) return;
    const activeKey = getActiveNavKey(window.location.pathname);
    const links = SITE_CONFIG.nav.map(item => {
        const cls = item.key === activeKey ? ' class="active"' : '';
        const ext = item.external ? ' target="_blank" rel="noopener"' : '';
        return `<li><a href="${item.href}"${cls}${ext}><i class="${item.icon}"></i> ${item.label}</a></li>`;
    }).join('\n                ');
    mount.outerHTML = `
    <nav class="navbar" data-aos="fade-down" data-aos-duration="600">
        <div class="navbar-inner">
            <a href="${SITE_CONFIG.brand.href}" class="nav-brand"><span class="brand-icon">${SITE_CONFIG.brand.icon}</span>${SITE_CONFIG.brand.text}</a>
            <button class="hamburger" id="hamburgerBtn" aria-label="菜单">
                <i class="fas fa-bars"></i>
            </button>
            <ul class="nav-links" id="navLinks">
                ${links}
            </ul>
        </div>
    </nav>`;
}

// 渲染公共页脚
function renderSiteFooter() {
    const mount = document.getElementById('siteFooter');
    if (!mount) return;
    const f = SITE_CONFIG.footer;
    mount.outerHTML = `
    <footer class="footer" data-aos="fade-up" data-aos-duration="700">
        <p style="margin-top:4px;font-size:0.78rem;">${f.copyright}</p>
        <p>Made with <span class="footer-heart">💗</span> by <a href="${f.authorUrl}" target="_blank"
                rel="noopener">${f.author}</a> · ${f.authorText} & <a href="${f.aiUrl}" target="_blank"
                rel="noopener">${f.ai}</a> ${f.aiVersion}</p>
    </footer>`;
}

// 渲染回到顶部按钮（页面已有 #backToTop 时跳过）
function renderBackToTop() {
    if (document.getElementById('backToTop')) return;
    const btn = document.createElement('button');
    btn.className = 'back-to-top';
    btn.id = 'backToTop';
    btn.title = '回到顶部';
    btn.setAttribute('aria-label', '回到顶部');
    btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    document.body.appendChild(btn);
}

// 初始化公共布局（导航 / 页脚 / 回到顶部）
function initCommonLayout() {
    renderSiteNav();
    renderSiteFooter();
    renderBackToTop();
}

// 全局启动
document.addEventListener('DOMContentLoaded', () => {
    initCommonLayout();
    initSakura();
    initHamburger();
    initBackToTop();
    initAOS();
});