/**
 * 浏览量统计边缘函数
 *
 * 路由：/internal/visit
 * 存储：EdgeOne Pages KV（外部 KV，绑定名 counter）
 *
 * 用法：
 *   GET  /internal/visit?mode=query&key=/index.html   // 查询单个页面浏览量
 *   GET  /internal/visit?mode=add&key=/index.html     // 浏览量 +1 并返回最新值
 *   GET  /internal/visit?mode=find&prefix=/           // 按前缀批量查询
 *   POST /internal/visit  { "path": "/index.html", "delta": 1 }  // 推荐写法
 *
 * 说明：
 *   - key 支持传完整 URL、路径或自定义标识，会统一归一化为 views_<path>。
 *   - KV 无原子自增，这里用「读-改-写 + 重试」近似实现，统计值仅供展示。
 */

const KV_BINDING = 'counter';        // edgeone.json / 控制台配置的 KV 命名空间绑定名
const FALLBACK_BINDINGS = ['KV', 'VIEWS', 'views']; // 兼容其他绑定名
const KEY_PREFIX = 'views_';         // KV 内所有统计键的统一前缀
const MAX_KEY_LENGTH = 200;
const MAX_DELTA = 1000;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...CORS_HEADERS,
        },
    });
}

/** 从 env 中解析可用的 KV 命名空间 */
function resolveKV(env) {
    if (!env) return null;
    for (const name of [KV_BINDING, ...FALLBACK_BINDINGS]) {
        const ns = env[name];
        if (ns && typeof ns.get === 'function' && typeof ns.put === 'function') {
            return ns;
        }
    }
    return null;
}

/** 把任意标识归一化成 KV 键：/index.html -> views_/index.html */
function normalizeKey(raw) {
    if (raw === null || raw === undefined) return null;

    let value = String(raw).trim();
    if (!value) return null;

    // 完整 URL 只取 pathname，丢弃域名/查询串
    if (/^https?:\/\//i.test(value)) {
        try {
            value = new URL(value).pathname;
        } catch {
            /* 非法 URL 时按普通字符串处理 */
        }
    }

    value = value.split('?')[0].split('#')[0];
    if (!value.startsWith('/')) value = '/' + value;
    value = value.replace(/\/{2,}/g, '/');
    if (value.length > 1) value = value.replace(/\/+$/, '');
    if (!value) value = '/';
    if (value.length > MAX_KEY_LENGTH) value = value.slice(0, MAX_KEY_LENGTH);

    return KEY_PREFIX + value;
}

function toCount(raw) {
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? num : 0;
}

/** 读取当前值 */
async function readCount(kv, key) {
    const raw = await kv.get(key);
    return raw === null || raw === undefined ? 0 : toCount(raw);
}

/**
 * 读-改-写自增。
 * KV 不提供原子自增，这里做一次「读取 -> 加增量 -> 写回」；
 * 并发写入时可能相互覆盖，统计值仅供展示，不做强一致保证。
 */
async function increment(kv, key, delta) {
    const next = (await readCount(kv, key)) + delta;
    await kv.put(key, String(next));
    return next;
}

export async function onRequest({ request, env }) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const kv = resolveKV(env);
    if (!kv) {
        return json({
            success: false,
            error: `未找到 KV 绑定「${KV_BINDING}」，请在项目设置中绑定 KV 命名空间`,
        }, 500);
    }

    const url = new URL(request.url);
    let mode = url.searchParams.get('mode') || '';
    let rawKey = url.searchParams.get('key') || url.searchParams.get('path');
    let delta = Number(url.searchParams.get('delta') || 1);

    // POST：推荐写法，key 与增量放在请求体里
    if (request.method === 'POST') {
        try {
            const body = await request.json();
            rawKey = body.key || body.path || rawKey;
            if (body.delta !== undefined) delta = Number(body.delta);
            if (!mode) mode = 'add';
        } catch {
            return json({ success: false, error: '请求体不是合法的 JSON' }, 400);
        }
    } else if (!mode) {
        // 无 mode 时给出默认行为：带 key 视为 +1
        mode = rawKey ? 'add' : '';
    }

    if (!['query', 'add', 'find'].includes(mode)) {
        return json({
            success: false,
            error: '未知的 mode 参数，支持: query / add / find',
        }, 400);
    }

    try {
        // 批量查询
        if (mode === 'find') {
            const prefixParam = url.searchParams.get('prefix');
            const prefix = prefixParam
                ? KEY_PREFIX + (prefixParam.startsWith('/') ? prefixParam : '/' + prefixParam)
                : KEY_PREFIX;

            const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 1000);
            const cursor = url.searchParams.get('cursor') || undefined;

            const listed = await kv.list({ prefix, limit, cursor });
            const list = {};
            let total = 0;

            for (const item of listed.keys || []) {
                const count = await readCount(kv, item.name);
                list[item.name.replace(KEY_PREFIX, '')] = count;
                total += count;
            }

            return json({
                success: true,
                mode,
                prefix: prefix.replace(KEY_PREFIX, ''),
                count: Object.keys(list).length,
                total,
                cursor: listed.cursor || null,
                list,
            });
        }

        const key = normalizeKey(rawKey);
        if (!key) {
            return json({ success: false, error: '缺少 key / path 参数' }, 400);
        }

        if (mode === 'query') {
            return json({ success: true, mode, key, path: key.replace(KEY_PREFIX, ''), value: await readCount(kv, key) });
        }

        // mode === 'add'
        if (!Number.isFinite(delta) || delta <= 0 || delta > MAX_DELTA) {
            return json({ success: false, error: `delta 必须是 1 ~ ${MAX_DELTA} 之间的数字` }, 400);
        }

        const value = await increment(kv, key, Math.floor(delta));
        return json({ success: true, mode, key, path: key.replace(KEY_PREFIX, ''), value });
    } catch (error) {
        return json({ success: false, error: 'KV 操作失败：' + error.message }, 500);
    }
}
