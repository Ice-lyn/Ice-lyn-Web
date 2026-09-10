export async function onRequest({ request, env }) {
    const url = new URL(request.url);
    const method = request.method;

    // 处理 CORS 预检请求
    if (method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    // GET：获取评论列表
    if (method === 'GET') {
        const postId = url.searchParams.get('postId');
        if (!postId) {
            return new Response(JSON.stringify({ error: '缺少 postId 参数' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }

        const key = `comments_${postId}`;
        const raw = await env.counter.get(key);
        let comments = [];

        if (raw) {
            try {
                comments = JSON.parse(raw);
            } catch (e) {
                comments = [];
            }
        }

        // 按时间升序排列（旧评论在上，新评论在下）
        comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        return new Response(JSON.stringify({ success: true, comments, count: comments.length }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }

    // POST：提交新评论
    if (method === 'POST') {
        try {
            const body = await request.json();
            const { postId, nickname, email, content } = body;

            // 参数校验
            if (!postId || !nickname || !content) {
                return new Response(JSON.stringify({ error: '昵称和评论内容不能为空' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                });
            }

            // 长度限制
            if (nickname.length > 20) {
                return new Response(JSON.stringify({ error: '昵称不能超过20个字符' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                });
            }

            if (content.length > 500) {
                return new Response(JSON.stringify({ error: '评论内容不能超过500个字符' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                });
            }

            // 获取客户端 IP
            const clientIP = request.headers.get('cf-connecting-ip') ||
                request.headers.get('x-forwarded-for')?.split(',')[0] ||
                'unknown';

            const key = `comments_${postId}`;
            const raw = await env.counter.get(key);
            let comments = [];

            if (raw) {
                try {
                    comments = JSON.parse(raw);
                } catch (e) {
                    comments = [];
                }
            }

            // 创建新评论
            const newComment = {
                id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 6),
                nickname: nickname.trim(),
                email: email ? email.trim() : '',
                content: content.trim(),
                createdAt: new Date().toISOString(),
                ip: clientIP,
            };

            comments.push(newComment);
            await env.counter.put(key, JSON.stringify(comments));

            // 返回时隐藏 IP 信息
            const { ip, ...commentForClient } = newComment;

            return new Response(JSON.stringify({ success: true, comment: commentForClient }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: '服务器错误：' + error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }
    }

    // 其他方法
    return new Response(JSON.stringify({ error: '不支持的请求方法' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
}