/**
 * ═══════════════════════════════════════════════════════════════
 *   WORKER — GitHub API + Blogger API Proxy
 * ═══════════════════════════════════════════════════════════════
 *
 *   Endpoints:
 *     /gitdata    → { profile, repos } dari GitHub (dengan PAT)
 *     /blogdata   → Posts dari Blogger API
 *
 *   Deploy:
 *     1. Buka https://dash.cloudflare.com → Workers & Pages
 *     2. Buat Worker baru, paste isi file ini
 *     3. Set environment variables (wajib):
 *        - GITHUB_TOKEN  → Personal Access Token GitHub
 *        - GITHUB_USER   → Username GitHub (default: Jirankun)
 *        - BLOG_ID       → ID blog Blogger
 *        - BLOG_API_KEY  → API key Blogger
 *        - GROQ_API_KEY  → API key Groq (untuk AI text generation)
 *
 *   Atau via wrangler CLI:
 *     wrangler secret put GITHUB_TOKEN
 *     wrangler secret put BLOG_API_KEY
 *     wrangler secret put GROQ_API_KEY
 *     wrangler deploy
 *
 *   URL worker: https://zhyllan.jirankun.workers.dev
 *   Portofolio: /gitdata, /aitext
 *   Blog:       /blogdata
 * ═══════════════════════════════════════════════════════════════
 */

/* ─── Konfigurasi (fallback untuk development) ─── */
const GITHUB_USER = 'Jirankun';
const BLOGGER_API = 'https://www.googleapis.com/blogger/v3';

/* ─── CORS ─── */
const CORS = {
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  },
};

/* ─── ENTRY POINT ─── */
export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const path = url.pathname;

    /* OPTIONS preflight */
    if (request.method === 'OPTIONS') {
      return new Response(null, CORS);
    }

    /* ── ROUTE: /gitdata ── GitHub Profile + Repos ── */
    if (path === '/gitdata') {
      return handleGitData(env);
    }

    /* ── ROUTE: /aitext ── AI-generated text for portfolio (via Groq) ── */
    if (path === '/aitext') {
      return handleAIText(env);
    }

    /* ── ROUTE: /blogdata ── Blogger Posts (untuk portfolio) ── */
    if (path === '/blogdata') {
      return handleBlogData(env, url);
    }

    /* ── ROUTE: /api/posts/search ── Search posts (harus sebelum /api/posts/:id) ── */
    if (path === '/api/posts/search') {
      return handleBlogData(env, url, true);
    }

    /* ── ROUTE: /api/posts/:id ── Single post detail ── */
    const postMatch = path.match(/^\/api\/posts\/([^\/]+)$/);
    if (postMatch) {
      return handleBlogPost(env, postMatch[1]);
    }

    /* ── ROUTE: /api/posts ── List posts (blog app) ── */
    if (path === '/api/posts') {
      return handleBlogData(env, url);
    }

    /* ── ROUTE: /api/blog ── Blog info ── */
    if (path === '/api/blog') {
      return handleBlogInfo(env);
    }

    /* ── ROUTE: /api/likes/:slug ── GET (baca) / POST (toggle) like ── */
    const likeMatch = path.match(/^\/api\/likes\/(.+)$/);
    if (likeMatch) {
      if (request.method === 'GET') {
        return handleLikeGet(env, likeMatch[1], request);
      }
      if (request.method === 'POST') {
        return handleLikeToggle(env, likeMatch[1], request);
      }
      return json({ error: 'Method not allowed' }, 405);
    }

    /* ── ROOT → Info ── */
    if (path === '/debug') {
      return handleDebug(env);
    }

    /* ── ROOT → Info ── */
    if (path === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          endpoints: {
            gitdata: '/gitdata — GitHub profile & repos',
            blogdata: '/blogdata — Blog posts',
            likes: '/api/likes/:slug — GET read, POST toggle',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS.headers } },
      );
    }

    return json({ error: 'Not Found' }, 404);
  },
};

/* ═══════════════════════════════════════════════
   HANDLER: GitHub Data
   ═══════════════════════════════════════════════ */
async function handleGitData(env) {
  const username = env.GITHUB_USER || GITHUB_USER;

  async function fetchWithToken(token) {
    const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Zhyllan-Portfolio-Worker/1.0' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const [profileRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { headers }),
      fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers }),
    ]);
    return { profileRes, reposRes };
  }

  try {
    const token = env.GITHUB_TOKEN || '';
    let { profileRes, reposRes } = await fetchWithToken(token);

    /* Jika 403, coba tanpa token (rate limit / invalid token) */
    if (profileRes.status === 403) {
      if (token) {
        const result = await fetchWithToken('');
        profileRes = result.profileRes;
        reposRes = result.reposRes;
      }
      if (profileRes.status === 403) {
        return json({ error: 'GitHub API error: 403 — Mungkin rate limit. Coba lagi nanti.' }, 429);
      }
    }

    if (!profileRes.ok) {
      return json({ error: `GitHub API error: ${profileRes.status}` }, profileRes.status);
    }

    const profile = await profileRes.json();
    const repos = reposRes.ok ? await reposRes.json() : [];

    return json({ profile, repos });
  } catch (err) {
    return json({ error: err.message || 'Internal Server Error' }, 500);
  }
}

/* ═══════════════════════════════════════════════
   HANDLER: Blog Data
   ═══════════════════════════════════════════════ */
async function handleBlogData(env, url, isSearch = false) {
  const blogId = env.BLOG_ID || '';
  const apiKey = env.BLOG_API_KEY || '';
  const params = url.searchParams;

  if (!blogId || !apiKey) {
    return json({ error: 'Blog ID atau API Key belum dikonfigurasi' }, 500);
  }

  const maxResults = params.get('maxResults') || '5';
  const orderBy = params.get('orderBy') || 'published';
  const query = params.get('q') || '';

  try {
    let apiUrl;
    if (isSearch && query) {
      /* Search endpoint */
      apiUrl = `${BLOGGER_API}/blogs/${blogId}/posts/search?key=${apiKey}&q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    } else {
      apiUrl = `${BLOGGER_API}/blogs/${blogId}/posts?key=${apiKey}&maxResults=${maxResults}&orderBy=${orderBy}`;
    }
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
    });

    const data = await res.json();

    if (!res.ok) {
      return json({ error: data.error?.message || 'Blogger API error', code: res.status }, res.status);
    }

    /* Normalisasi data */
    const posts = (data.items || []).map(post => ({
      id: post.id,
      title: (post.title || '').trim() || 'Tanpa Judul',
      content: post.content || '',
      published: post.published,
      updated: post.updated,
      author: { displayName: post.author?.displayName || 'Anonim' },
      labels: post.labels || [],
      url: post.url,
    }));

    return json({
      posts,
      totalItems: data.totalItems || 0,
      nextPageToken: data.nextPageToken || null,
    });
  } catch (err) {
    return json({ error: err.message || 'Internal Server Error' }, 500);
  }
}

/* ═══════════════════════════════════════════════
   HANDLER: Single Blog Post (by ID)
   ═══════════════════════════════════════════════ */
async function handleBlogPost(env, postId) {
  const blogId = env.BLOG_ID || '';
  const apiKey = env.BLOG_API_KEY || '';

  if (!blogId || !apiKey) {
    return json({ error: 'Blog ID atau API Key belum dikonfigurasi' }, 500);
  }

  try {
    const apiUrl = `${BLOGGER_API}/blogs/${blogId}/posts/${postId}?key=${apiKey}`;
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
    });

    const data = await res.json();

    if (!res.ok) {
      return json({ error: data.error?.message || 'Blogger API error', code: res.status }, res.status);
    }

    return json({
      id: data.id,
      title: (data.title || '').trim() || 'Tanpa Judul',
      content: data.content || '',
      published: data.published,
      updated: data.updated,
      author: data.author || { displayName: 'Anonim' },
      labels: data.labels || [],
      url: data.url,
      blog: { name: env.BLOG_NAME || 'AokazeStudio' },
    });
  } catch (err) {
    return json({ error: err.message || 'Internal Server Error' }, 500);
  }
}

/* ═══════════════════════════════════════════════
   HANDLER: Blog Info
   ═══════════════════════════════════════════════ */
async function handleBlogInfo(env) {
  const blogId = env.BLOG_ID || '';
  const apiKey = env.BLOG_API_KEY || '';

  if (!blogId || !apiKey) {
    return json({ error: 'Blog ID atau API Key belum dikonfigurasi' }, 500);
  }

  try {
    const apiUrl = `${BLOGGER_API}/blogs/${blogId}?key=${apiKey}`;
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
    });

    const data = await res.json();

    if (!res.ok) {
      return json({ error: data.error?.message || 'Blogger API error', code: res.status }, res.status);
    }

    return json(data);
  } catch (err) {
    return json({ error: err.message || 'Internal Server Error' }, 500);
  }
}

/* ═══════════════════════════════════════════════
   HANDLER: AI Text Generation (via Groq)
   ═══════════════════════════════════════════════ */
async function handleAIText(env) {
  const groqKey = env.GROQ_API_KEY;
  if (!groqKey) {
    return json({ error: 'GROQ_API_KEY belum dikonfigurasi' }, 500);
  }

  /* Ambil data GitHub dulu */
  const username = env.GITHUB_USER || 'Jirankun';

  async function fetchWithToken(token) {
    const ghHeaders = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Zhyllan-Portfolio-Worker/1.0' };
    if (token) ghHeaders['Authorization'] = `Bearer ${token}`;
    const [profileRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { headers: ghHeaders }),
      fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers: ghHeaders }),
    ]);
    return { profileRes, reposRes };
  }

  try {
    const token = env.GITHUB_TOKEN || '';
    let { profileRes, reposRes } = await fetchWithToken(token);

    /* Jika 403 dan token dipakai, token mungkin invalid — coba tanpa token */
    if (profileRes.status === 403 && token) {
      const result = await fetchWithToken('');
      profileRes = result.profileRes;
      reposRes = result.reposRes;
    }

    if (profileRes.status === 403) {
      if (token) {
        const result = await fetchWithToken('');
        profileRes = result.profileRes;
        reposRes = result.reposRes;
      }
      if (profileRes.status === 403) {
        return json({ error: 'GitHub API error: 403 — Mungkin rate limit. Coba lagi nanti.' }, 429);
      }
    }

    if (!profileRes.ok) {
      return json({ error: `GitHub API error: ${profileRes.status}` }, profileRes.status);
    }

    const profile = await profileRes.json();
    const repos = reposRes.ok ? await reposRes.json() : [];

    /* Ambil README profile */
    let readmeContent = '';
    const readmeHeaders = { 'Accept': 'application/vnd.github.raw', 'User-Agent': 'Zhyllan-Portfolio-Worker/1.0' };
    if (token) readmeHeaders['Authorization'] = `Bearer ${token}`;
    try {
      const readmeRes = await fetch(`https://api.github.com/repos/${username}/${username}/readme`, { headers: readmeHeaders });
      if (readmeRes.ok) {
        readmeContent = await readmeRes.text();
      }
    } catch {}

    /* Hitung top languages */
    const langCounts = {};
    repos.forEach(r => {
      if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + 1;
    });
    const topLangs = Object.entries(langCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lang]) => lang);

    const totalStars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
    const totalForks = repos.reduce((s, r) => s + (r.forks_count || 0), 0);
    const repoCount = profile.public_repos || repos.length || 0;

    /* Top repos by stars */
    const top3Repos = [...repos]
      .filter(r => (r.stargazers_count || 0) > 0)
      .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
      .slice(0, 3)
      .map(r => r.name)
      .join(', ') || '—';

    /* ── Prompt ke Groq ── */
    const systemPrompt = `Kamu adalah asisten kreatif untuk portofolio developer.
Tugasmu membuat teks dalam bahasa Indonesia yang natural dan spesifik — bukan generik.

Aturan PENTING:
- Teks harus SPESIFIK, bukan template generik
- Gali data dari README: nama sekolah, jurusan, tech stack, OS, project focus
- Jika README bilang "Student at SMKN 1 Lembah Melintang, TKJ" — tulis itu, jangan generik
- Jika README bilang "Linux Mint user" — tulis itu
- Jika README bilang "Kotlin, Flutter, Next.js" — tulis itu
- JANGAN gunakan kata-kata template seperti "terus belajar", "bersemangat", "menjelajahi"
- Boleh pake "saya" sekali atau dua kali, jangan di setiap kalimat`;

    const userPrompt = `Buat teks untuk portofolio developer. Gunakan data README untuk membuat teks yang SPESIFIK dan personal.

DATA USER:
- Nama: ${profile.name || username}
- Bio: ${profile.bio || '-'}
- Lokasi: ${profile.location || 'Indonesia'}
- Followers: ${profile.followers || 0}
- Following: ${profile.following || 0}
- Public Repos: ${repoCount}
- Bergabung: ${profile.created_at || '-'}
- Top Languages: ${topLangs.join(', ') || '-'}
- Total Stars: ${totalStars}
- Total Forks: ${totalForks}
- Top Repos: ${top3Repos}
${readmeContent ? `
ISI README PROFILE — WAJIB gunakan info SPESIFIK dari sini:
${readmeContent.slice(0, 2500)}` : ''}

WAJIB: Setiap teks harus menyebut detail SPESIFIK dari README (sekolah, jurusan, tech stack, OS, tools). Jangan generik!

Buat JSON berikut:

{
  "heroBio": "(1 kalimat pendek max 8 kata. Contoh: 'TKJ Student & Web Developer' atau 'Student | Web & Mobile Dev' — ambil dari README)",
  "heroStatus": "(3-6 kata, ajakan kolaborasi, santai)",
  "aboutBadge": "(2-3 kata, label section)",
  "aboutTitle": "(3-5 kata, judul about)",
  "aboutPara1": "(1-3 kalimat. WAJIB sebut: sekolah SMKN 1 Lembah Melintang jurusan TKJ, minat web & mobile, tech stack: HTML, CSS, JS, Kotlin, Flutter, Next.js, OS Linux Mint. AMBIL DARI README!)",
  "aboutPara2": "(1-2 kalimat. ${repoCount} repositori. Projek web, mobile, dan sekolah. Sebut beberapa jenis proyek dari README)",
  "statsBadge": "(2-3 kata)",
  "statsTitle": "(2-4 kata)",
  "reposBadge": "(1 kata: Karya / Proyek)",
  "reposTitle": "(2-4 kata)",
  "reposDesc": "(1 kalimat ajakan lihat proyek)",
  "contactBadge": "(1-2 kata)",
  "contactTitle": "(2-4 kata, ajakan kolaborasi)",
  "contactDesc": "(1 kalimat natural)",
  "footerText": "(max 10 kata, personal, bisa pake tema coding atau Linux)"
}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return json({ error: 'Groq API error', detail: errText, status: groqRes.status }, 500);
    }

    const groqData = await groqRes.json();
    const content = groqData.choices?.[0]?.message?.content;

    if (!content) {
      return json({ error: 'Groq returned empty response' }, 500);
    }

    /* Parse JSON dari response Groq */
    let textData;
    try {
      textData = JSON.parse(content);
    } catch {
      /* Coba ekstrak JSON dari string */
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          textData = JSON.parse(jsonMatch[0]);
        } catch {
          return json({ error: 'Gagal parse response Groq' }, 500);
        }
      } else {
        return json({ error: 'Gagal parse response Groq' }, 500);
      }
    }

    /* Tambahkan metadata */
    textData._generatedAt = new Date().toISOString();
    textData._repoCount = repoCount;

    return json(textData);
  } catch (err) {
    return json({ error: err.message || 'Internal Server Error' }, 500);
  }
}

/* ═══════════════════════════════════════════════
   HANDLER: Debug — test GitHub API from within worker
   ═══════════════════════════════════════════════ */
async function handleDebug(env) {
  const token = env.GITHUB_TOKEN || '';
  const username = env.GITHUB_USER || 'Jirankun';
  
  async function testGitHub(useToken) {
    const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Zhyllan-Portfolio-Worker/1.0' };
    if (useToken && token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/users/${username}`, { headers });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 100) }; }
    return { status: res.status, login: data.login, name: data.name, message: data.message, docUrl: data.documentation_url };
  }

  const withToken = await testGitHub(true);
  const withoutToken = await testGitHub(false);

  return json({
    env: {
      hasGitHubToken: !!env.GITHUB_TOKEN,
      hasGitHubUser: !!env.GITHUB_USER,
      hasBlogId: !!env.BLOG_ID,
      hasBlogApiKey: !!env.BLOG_API_KEY,
      hasGroqKey: !!env.GROQ_API_KEY,
      tokenLength: token.length,
      tokenPrefix: token.slice(0, 4),
    },
    withToken: withToken,
    withoutToken: withoutToken,
  });
}

/* ═══════════════════════════════════════════════
   HANDLER: Like — Baca jumlah like
   ═══════════════════════════════════════════════
   GET /api/likes/:slug?deviceId=xxx
   ═══════════════════════════════════════════════ */
async function handleLikeGet(env, slug, request) {
  try {
    let count = 0;
    let liked = false;

    /* Baca deviceId dari query string */
    const url = new URL(request.url);
    const deviceId = url.searchParams.get('deviceId') || '';
    const deviceKey = deviceId ? `dev_${deviceId}` : '';

    if (env.LIKES) {
      const raw = await env.LIKES.get(`like:${slug}`);
      if (raw) count = parseInt(raw, 10) || 0;
      if (deviceKey) {
        const dev = await env.LIKES.get(`like:${slug}:${deviceKey}`);
        liked = !!dev;
      }
    } else {
      /* Fallback in-memory (tanpa device tracking) */
      const cur = fallbackLikes.get(slug);
      count = cur?.count || 0;
    }

    return json({ slug, count, liked });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/* ═══════════════════════════════════════════════
   HANDLER: Like — Toggle like (LIKE / UNLIKE akurat)
   ═══════════════════════════════════════════════
   POST /api/likes/{slug}
   Body: { "deviceId": "dev_xxx" }
   ═══════════════════════════════════════════════ */
async function handleLikeToggle(env, slug) {
  try {
    let body = {};
    try { body = await request.json(); } catch {}
    const deviceId = body.deviceId;
    if (!deviceId) {
      return json({ error: 'deviceId diperlukan' }, 400);
    }

    const deviceKey = `dev_${deviceId}`;
    let count = 0;
    let liked = false;

    if (env.LIKES) {
      const raw = await env.LIKES.get(`like:${slug}`);
      count = raw ? parseInt(raw, 10) || 0 : 0;

      const devRaw = await env.LIKES.get(`like:${slug}:${deviceKey}`);
      const alreadyLiked = !!devRaw;

      if (alreadyLiked) {
        /* UNLIKE — hapus device key, kurangi count */
        await env.LIKES.delete(`like:${slug}:${deviceKey}`);
        count = Math.max(0, count - 1);
        liked = false;
      } else {
        /* LIKE — buat device key, tambah count */
        await env.LIKES.put(`like:${slug}:${deviceKey}`, '1', { expirationTtl: 31536000 });
        count += 1;
        liked = true;
      }

      await env.LIKES.put(`like:${slug}`, String(count));
    } else {
      /* Fallback in-memory */
      let cur = fallbackLikes.get(slug) || { slug, count: 0, liked: new Set() };
      if (cur.liked.has(deviceKey)) {
        cur.liked.delete(deviceKey);
        cur.count = Math.max(0, cur.count - 1);
        liked = false;
      } else {
        cur.liked.add(deviceKey);
        cur.count += 1;
        liked = true;
      }
      fallbackLikes.set(slug, cur);
      count = cur.count;
    }

    return json({ slug, count, liked });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/* Fallback in-memory jika KV tidak terkonfigurasi */
const fallbackLikes = new Map();

/* ═══════════════════════════════════════════════
   HELPER: JSON Response
   ═══════════════════════════════════════════════ */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS.headers,
    },
  });
}
