/**
 * 通用请求代理边缘函数（EdgeOne Pages Edge Function）
 *
 * 路由：/v1/proxy
 * 文件：edge-functions/v1/proxy/index.js
 *
 * 作用：
 *   把一个目标地址的响应「原封不动」地转发回来，用于绕过浏览器跨域（CORS）限制。
 *   支持 GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS，支持任意二进制数据
 *   （图片、音频、文件流等），状态码、响应头、响应体均保持原样。
 *
 * 指定目标地址的方式（优先级从高到低）：
 *   1. 请求头    X-Proxy-Target: https://api.example.com/path?a=1
 *   2. 查询参数  /v1/proxy?url=https%3A%2F%2Fapi.example.com%2Fpath&a=1
 *                /v1/proxy?target=https://api.example.com/path
 *   3. 路径后缀  /v1/proxy/https://api.example.com/path?a=1
 *                /v1/proxy/api.example.com/path            （自动补全 https://）
 *   4. 默认目标  DEFAULT_TARGET / 环境变量 PROXY_TARGET
 *
 * POST 小技巧：
 *   若请求体是 JSON 且包含 "url" 或 "target" 字段，会取出该字段作为目标地址，
 *   并把它从转发给上游的请求体中剔除，其余字段原样转发。
 *
 * 可选控制参数（不会转发给上游）：
 *   _method=POST          用 GET 触发其它请求方法（浏览器无法发送自定义方法的场合）
 *   _timeout=15000        自定义超时毫秒数
 *   _headers={"X-A":"1"}  追加 / 覆盖转发给上游的请求头（JSON 字符串）
 *   _redirect=manual      不跟随上游重定向，原样返回 3xx
 *
 * 环境变量（可选，均非必需）：
 *   PROXY_TARGET              默认目标地址
 *   PROXY_ALLOWED_HOSTS       域名白名单，逗号分隔，支持 *.example.com
 *   PROXY_TIMEOUT             超时毫秒数
 *   PROXY_ALLOW_CREDENTIALS   为 "true" 时回显 Origin 并允许携带凭证
 *
 * 安全说明：
 *   默认放行任意公网地址，但始终拦截 localhost / 内网 / 链路本地 / 云元数据地址，
 *   防止被当作 SSRF 跳板；需要更严格时请配置 PROXY_ALLOWED_HOSTS 白名单。
 */

// ============================== 可配置项 ==============================

/** 默认目标地址（为空则必须通过参数指定目标） */
const DEFAULT_TARGET = '';
/** 允许代理的域名白名单，空数组表示不限制（仍会拦截内网地址） */
const ALLOWED_HOSTS = [];
/** 是否回显 Origin 并允许携带凭证（默认关闭，保持 Access-Control-Allow-Origin: *） */
const ALLOW_CREDENTIALS = false;
/** 上游请求超时（毫秒） */
const TIMEOUT_MS = 30000;
/** 请求体大小上限（字节） */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

// ============================== 常量 ==============================

const ROUTE_PREFIX = '/v1/proxy';
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const ALLOW_METHODS_HEADER = ALLOWED_METHODS.join(', ');

/** 只在本函数内部使用、不透传给上游的查询参数 */
const CONTROL_PARAMS = new Set(['url', 'target', '_target', '_method', '_timeout', '_headers', '_redirect']);

/** 逐跳首部 + 由运行时自行决定的请求头，不转发给上游 */
const DROP_REQUEST_HEADERS = new Set([
    'host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade', 'expect',
    'content-length', 'accept-encoding',
    'origin', 'referer', 'cookie',
    // 避免把访问者真实 IP 暴露给第三方，如需保留可自行删掉这两行
    'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip',
]);

/** 逐跳首部 + 由运行时自行决定的响应头，不透传给客户端 */
const DROP_RESPONSE_HEADERS = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade',
    'access-control-allow-origin', 'access-control-allow-methods',
    'access-control-allow-headers', 'access-control-allow-credentials',
    'access-control-expose-headers', 'access-control-max-age',
]);

// ============================== 工具函数 ==============================

/** 统一的 CORS 响应头 */
function corsHeaders(request) {
    const origin = request.headers.get('Origin') || '';
    const allowCredentials = ALLOW_CREDENTIALS && origin;
    const headers = {
        'Access-Control-Allow-Origin': allowCredentials ? origin : '*',
        'Access-Control-Allow-Methods': ALLOW_METHODS_HEADER,
        'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
        'Access-Control-Expose-Headers': '*',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
    if (allowCredentials) headers['Access-Control-Allow-Credentials'] = 'true';
    return headers;
}

/** 统一错误响应（同样带 CORS，方便前端直接看到原因） */
function errorResponse(request, message, status = 400, extra = {}) {
    return new Response(JSON.stringify({ success: false, error: message, proxy: true, ...extra }), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...corsHeaders(request),
        },
    });
}

/** 判断是否为内网 / 保留地址，防止 SSRF */
function isPrivateHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return true;
    if (host === 'localhost' || host.endsWith('.localhost') ||
        host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) {
        return true;
    }
    if (host === '0.0.0.0' || host === '::' || host === '::1') return true;

    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const [a, b] = ipv4.slice(1).map(Number);
        if (ipv4.slice(1).some(n => n > 255)) return true; // 非法地址，直接拒绝
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;            // 链路本地 / 云元数据
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT
        if (a >= 224) return true;                           // 组播 / 保留
        return false;
    }

    if (host.includes(':')) {
        if (host.startsWith('fc') || host.startsWith('fd')) return true;   // ULA
        if (host.startsWith('fe80')) return true;                          // 链路本地
    }
    return false;
}

/** 域名白名单校验（支持 *.example.com 与 example.com 两种写法） */
function isHostAllowed(hostname, whitelist) {
    const host = String(hostname || '').toLowerCase();
    if (!whitelist.length) return true;
    return whitelist.some(rule => {
        const item = rule.trim().toLowerCase();
        if (!item) return false;
        if (item.startsWith('*.')) {
            const base = item.slice(2);
            return host === base || host.endsWith('.' + base);
        }
        return host === item;
    });
}

/** 把路径后缀还原成完整 URL：/v1/proxy/https://a.com/x -> https://a.com/x */
function targetFromPath(pathname) {
    let rest = pathname.slice(ROUTE_PREFIX.length);
    if (!rest || rest === '/') return '';
    if (rest.startsWith('/')) rest = rest.slice(1);
    if (!rest) return '';

    // 兼容被浏览器/网关折叠过的协议写法：https:/a.com、https%3A%2F%2Fa.com
    if (/^https?%3a/i.test(rest)) {
        try { rest = decodeURIComponent(rest); } catch { /* 忽略非法编码 */ }
    }
    if (/^https?:\/[^/]/i.test(rest)) {
        rest = rest.replace(/^(https?):\/?/i, '$1://');
    }

    if (/^https?:\/\//i.test(rest)) return rest;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(rest)) return 'https://' + rest;
    return '';
}

/** 追加查询串（保留目标地址已有的查询参数） */
function appendQuery(target, pairs) {
    if (!pairs.length) return target;
    const qs = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return target + (target.includes('?') ? '&' : '?') + qs;
}

/** 读取请求体并转成 Uint8Array（二进制安全） */
async function readBody(request) {
    const buffer = await request.arrayBuffer();
    return buffer.byteLength ? new Uint8Array(buffer) : null;
}

/** 尝试从 JSON 请求体中取出 url / target 字段，返回 { target, body } */
function extractTargetFromJson(bytes, contentType) {
    if (!bytes || !/application\/(?:[a-z0-9.+-]*\+)?json/i.test(contentType || '')) {
        return { target: '', body: bytes };
    }
    try {
        const text = new TextDecoder().decode(bytes);
        const json = JSON.parse(text);
        if (!json || typeof json !== 'object' || Array.isArray(json)) return { target: '', body: bytes };

        const found = ['url', 'target'].find(key => typeof json[key] === 'string' && json[key].trim());
        if (!found) return { target: '', body: bytes };

        const target = json[found].trim();
        delete json[found];
        return { target, body: new TextEncoder().encode(JSON.stringify(json)) };
    } catch {
        return { target: '', body: bytes };
    }
}

// ============================== 主入口 ==============================

export async function onRequest(context) {
    const { request, env = {} } = context;

    // 预检请求直接放行
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (!ALLOWED_METHODS.includes(request.method)) {
        return errorResponse(request, `不支持的请求方法：${request.method}`, 405);
    }

    const url = new URL(request.url);
    const ownHost = url.hostname;

    // ---------- 1. 解析目标地址 ----------
    const runtimeConfig = {
        defaultTarget: env.PROXY_TARGET || DEFAULT_TARGET,
        allowedHosts: env.PROXY_ALLOWED_HOSTS
            ? String(env.PROXY_ALLOWED_HOSTS).split(',').map(s => s.trim()).filter(Boolean)
            : ALLOWED_HOSTS,
        timeout: Number(env.PROXY_TIMEOUT) > 0 ? Number(env.PROXY_TIMEOUT) : TIMEOUT_MS,
    };

    let rawTarget = '';
    const headerTarget = request.headers.get('X-Proxy-Target');

    /** 依次取出 url / target 参数中第一个非空值 */
    function firstNonEmptyParam(...names) {
        for (const name of names) {
            const value = url.searchParams.get(name);
            if (value && value.trim()) return value.trim();
        }
        return '';
    }

    if (headerTarget && headerTarget.trim()) {
        rawTarget = headerTarget.trim();
    } else {
        rawTarget = firstNonEmptyParam('url', 'target');
    }

    if (!rawTarget) rawTarget = targetFromPath(url.pathname);

    // 读取请求体（一次性读取，之后按需复用）
    let bodyBytes = await readBody(request);

    // POST 场景：允许把目标地址写在 JSON body 里
    if (!rawTarget && bodyBytes) {
        const extracted = extractTargetFromJson(bodyBytes, request.headers.get('Content-Type'));
        if (extracted.target) {
            rawTarget = extracted.target;
            bodyBytes = extracted.body;
        }
    }

    if (!rawTarget) rawTarget = runtimeConfig.defaultTarget;

    if (!rawTarget) {
        return errorResponse(request, '缺少目标地址。请使用 ?url=<目标地址>、X-Proxy-Target 请求头或 /v1/proxy/<目标地址> 路径形式。', 400, {
            usage: {
                query: '/v1/proxy?url=https%3A%2F%2Fapi.example.com%2Fpath&a=1',
                path: '/v1/proxy/https://api.example.com/path?a=1',
                header: 'X-Proxy-Target: https://api.example.com/path',
                body: 'POST { "url": "https://api.example.com/path", "其余字段": "原样转发" }',
            },
        });
    }

    // ---------- 2. 拼装最终 URL ----------
    let targetUrl;
    try {
        if (!/^https?:\/\//i.test(rawTarget)) rawTarget = 'https://' + rawTarget.replace(/^\/+/, '');
        targetUrl = new URL(rawTarget);
    } catch {
        return errorResponse(request, `目标地址不是合法的 URL：${rawTarget}`, 400);
    }

    // 查询参数：除 url / target / _xxx 等控制参数外，其余参数原样转发给上游
    const extraPairs = [];
    for (const [key, value] of url.searchParams.entries()) {
        if (CONTROL_PARAMS.has(key)) continue;
        extraPairs.push([key, value]);
    }
    targetUrl = new URL(appendQuery(targetUrl.toString(), extraPairs));

    // ---------- 3. 安全校验 ----------
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        return errorResponse(request, `仅支持代理 http / https 协议，当前为 ${targetUrl.protocol}`, 400);
    }
    if (isPrivateHost(targetUrl.hostname)) {
        return errorResponse(request, `出于安全考虑，不允许代理内网地址：${targetUrl.hostname}`, 403);
    }
    if (!isHostAllowed(targetUrl.hostname, runtimeConfig.allowedHosts)) {
        return errorResponse(request, `目标域名不在白名单内：${targetUrl.hostname}`, 403);
    }
    if (targetUrl.hostname === ownHost) {
        return errorResponse(request, '不允许代理本站自身，以免造成死循环。', 400);
    }
    if (bodyBytes && bodyBytes.byteLength > MAX_BODY_BYTES) {
        return errorResponse(request, `请求体过大（上限 ${Math.round(MAX_BODY_BYTES / 1024 / 1024)} MB）`, 413);
    }

    // ---------- 4. 组装转发请求 ----------
    const method = (url.searchParams.get('_method') || request.method).toUpperCase();
    if (!ALLOWED_METHODS.includes(method)) {
        return errorResponse(request, `_method 不合法：${method}`, 400);
    }

    const forwardHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
        const lower = key.toLowerCase();
        if (DROP_REQUEST_HEADERS.has(lower) || lower.startsWith('x-proxy-')) continue;
        if (['accept-encoding', 'x-forwarded-for'].includes(lower)) continue;
        forwardHeaders.set(key, value);
    }
    // 统一用 identity，保证上游返回的字节流可被原样透传
    forwardHeaders.set('Accept-Encoding', 'identity');
    forwardHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

    // GET / HEAD 没有请求体，顺便去掉 body 相关的首部，避免上游误判
    if (method === 'GET' || method === 'HEAD') {
        forwardHeaders.delete('Content-Type');
        forwardHeaders.delete('Content-Length');
    }

    // 自定义转发头：?\_headers={"X-A":"1"}
    const extraHeaders = url.searchParams.get('_headers');
    if (extraHeaders) {
        try {
            const parsed = JSON.parse(extraHeaders);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                for (const [k, v] of Object.entries(parsed)) {
                    if (v === null || v === undefined || v === '') forwardHeaders.delete(k);
                    else forwardHeaders.set(k, String(v));
                }
            }
        } catch {
            return errorResponse(request, '_headers 需要是合法的 JSON 对象字符串', 400);
        }
    }

    const timeout = Math.min(
        Math.max(Number(url.searchParams.get('_timeout')) || runtimeConfig.timeout, 1000),
        120000
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), timeout);

    // ---------- 5. 发起上游请求 ----------
    const started = Date.now();
    let upstream;
    try {
        upstream = await fetch(targetUrl.toString(), {
            method,
            headers: forwardHeaders,
            body: method === 'GET' || method === 'HEAD' ? undefined : bodyBytes || undefined,
            redirect: url.searchParams.get('_redirect') === 'manual' ? 'manual' : 'follow',
            signal: controller.signal,
        });
    } catch (error) {
        clearTimeout(timer);
        const aborted = controller.signal.aborted;
        return errorResponse(
            request,
            aborted
                ? `上游请求超时（${timeout} ms）：${targetUrl.hostname}`
                : `请求上游失败：${error && error.message ? error.message : '未知错误'}`,
            aborted ? 504 : 502,
            { target: targetUrl.toString(), elapsed: Date.now() - started }
        );
    } finally {
        clearTimeout(timer);
    }

    // ---------- 6. 原封不动地返回上游响应 ----------
    const responseHeaders = new Headers();
    for (const [key, value] of upstream.headers.entries()) {
        if (DROP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
        responseHeaders.set(key, value);
    }
    // 叠加 CORS 与调试信息
    for (const [key, value] of Object.entries(corsHeaders(request))) {
        responseHeaders.set(key, value);
    }
    responseHeaders.set('X-Proxy-Target', targetUrl.toString());
    responseHeaders.set('X-Proxy-Status', String(upstream.status));
    responseHeaders.set('X-Proxy-Elapsed', String(Date.now() - started));

    // 204 / 304 不允许携带响应体
    const noBody = method === 'HEAD' || upstream.status === 204 || upstream.status === 304;

    return new Response(noBody ? null : upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
    });
}
