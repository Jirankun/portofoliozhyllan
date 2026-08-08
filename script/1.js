/* =============================================
   PORTFOLIO — JavaScript (Optimized)
   ============================================= */

/* ─── Konfigurasi ─── */
const GITHUB_USERNAME = 'Jirankun';
const WORKER_URL = 'https://zhyllan.jirankun.workers.dev';
const BLOG_URL = 'https://blog.zhyllanfyllah.my.id';
const CACHE_TTL = 86400000; // 24 jam dalam ms
const REPOS_PER_PAGE = 5;

/* ─── Cache Helper ─── */
const cache = {
  get(key) {
    try {
      const raw = sessionStorage.getItem(`portfolio_${key}`);
      if (!raw) return null;
      const { data, expiry } = JSON.parse(raw);
      return Date.now() > expiry ? null : data;
    } catch { return null; }
  },
  set(key, data, ttl = CACHE_TTL) {
    try {
      sessionStorage.setItem(`portfolio_${key}`, JSON.stringify({ data, expiry: Date.now() + ttl }));
    } catch { /* quota exceeded — skip */ }
  }
};

// ==================== DOM REFS ====================
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const dom = {};

function cacheDom() {
  dom.themeToggle = $('#themeToggle');
  dom.navToggle = $('#navToggle');
  dom.navLinks = $('#navLinks');
  dom.navLinksItems = $$('.nav-link');
  dom.navbar = $('.navbar');
  dom.scrollTop = $('#scrollTop');
  dom.repoGrid = $('#repoGrid');
  dom.filterBtns = $$('.filter-btn');
  dom.currentYear = $('#currentYear');
  dom.heroParticles = $('#heroParticles');
  dom.blogGrid = $('#blogGrid');
  dom.blogSection = $('#blog');
}

// ==================== THEME ====================
function initTheme() {
  const saved = localStorage.getItem('portfolio-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('portfolio-theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const label = $('#themeLabel');
  if (label) label.textContent = theme === 'dark' ? 'Gelap' : 'Terang';
}

// ==================== NAVIGATION ====================
function toggleNav() {
  dom.navLinks.classList.toggle('open');
  dom.navToggle.classList.toggle('active');
  dom.navToggle.setAttribute('aria-expanded', dom.navLinks.classList.contains('open'));
}

function closeNav() {
  dom.navLinks.classList.remove('open');
  dom.navToggle.classList.remove('active');
  dom.navToggle.setAttribute('aria-expanded', 'false');
}

function updateActiveNav() {
  const sections = $$('section');
  let current = '';
  sections.forEach(section => {
    const top = section.offsetTop - 120;
    const bottom = top + section.offsetHeight;
    if (window.scrollY >= top && window.scrollY < bottom) current = section.id;
  });
  dom.navLinksItems.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
  });
}

// ==================== SCROLL ====================
function handleScroll() {
  dom.navbar.classList.toggle('scrolled', window.scrollY > 50);
  dom.scrollTop.classList.toggle('visible', window.scrollY > 500);
  updateActiveNav();
}

// ==================== PARTICLES (Lebih Ringan) ====================
function createParticles() {
  const container = dom.heroParticles;
  if (!container) return;
  
  // Kurangi jadi 15 particle saja (dari 50) — lebih ringan CPU
  const count = Math.min(15, Math.floor(window.innerWidth / 80));
  const fragment = document.createDocumentFragment();
  
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    const size = Math.random() * 3 + 1.5;
    const duration = Math.random() * 8 + 8;
    p.style.cssText = `
      position:absolute;width:${size}px;height:${size}px;
      background:var(--accent);border-radius:50%;
      left:${Math.random() * 100}%;top:${Math.random() * 100}%;
      opacity:${Math.random() * 0.3 + 0.08};
      animation:floatP ${duration}s ease-in-out infinite;
      animation-delay:${Math.random() * 3}s;
    `;
    fragment.appendChild(p);
  }
  container.appendChild(fragment);
  
  // Inject keyframes (sekali saja)
  if (!document.getElementById('pfk')) {
    const s = document.createElement('style');
    s.id = 'pfk';
    s.textContent = `@keyframes floatP{0%,100%{transform:translate(0,0)}25%{transform:translate(-20px,-15px)}50%{transform:translate(15px,10px)}75%{transform:translate(-25px,-10px)}}`;
    document.head.appendChild(s);
  }
}

// ==================== GITHUB API via Worker (dengan cache) ====================
async function fetchGitHubData() {
  // Cek cache dulu
  const cached = cache.get('gitdata');
  if (cached) {
    if (cached.profile) updateProfileUI(cached.profile);
    if (Array.isArray(cached.repos)) {
      renderRepos(cached.repos);
      renderStatsSection(cached.repos);
    }
    return cached;
  }

  try {
    const res = await fetch(`${WORKER_URL}/gitdata`);
    if (!res.ok) throw new Error('Worker error: ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    
    // Simpan ke cache
    cache.set('gitdata', data);
    
    if (data.profile) updateProfileUI(data.profile);
    if (Array.isArray(data.repos)) {
      if (data.repos.length > 0) {
        renderRepos(data.repos);
        renderStatsSection(data.repos);
      } else {
        dom.repoGrid.innerHTML = '<div class="loading-spinner"><p>Tidak ada repository ditemukan.</p></div>';
        renderStatsSection([]);
      }
    }
    return data;
  } catch (err) {
    console.error('GitHub fetch error:', err.message);
    dom.repoGrid.innerHTML = '<div class="loading-spinner"><p>Gagal memuat repository. Silakan refresh.</p></div>';
    renderStatsSection([]);
  }
}

function updateProfileUI(data) {
  if (!data) return;
  const setText = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.textContent = val; };
  
  setText('userName', data.name);
  if (data.avatar_url) $('#avatar').src = data.avatar_url;
  if (data.bio) setText('userBio', data.bio);
  if (data.location) { setText('userLocation', data.location); setText('contactLocation', data.location); }
  if (data.followers != null) setText('followersCount', data.followers);
  if (data.following != null) setText('followingCount', data.following);
  if (data.public_repos != null) {
    setText('repoCount', data.public_repos);
  }
  if (data.created_at) {
    const d = new Date(data.created_at);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    setText('joinDate', `${months[d.getMonth()]} ${d.getFullYear()}`);
  }
}

function renderRepos(repos) {
  dom.repoGrid._repos = Array.isArray(repos) ? repos : [];
  dom.repoGrid._currentFilter = 'all';
  dom.repoGrid._loadedCount = 0;
  renderFilterButtons(repos);
  renderRepoBatch();
}

function renderFilterButtons(repos) {
  const container = document.getElementById('repoFilters');
  if (!container) return;
  const langSet = new Set();
  repos.forEach(r => { if (r.language) langSet.add(r.language); });
  const languages = [...langSet].sort();
  dom.repoGrid._languages = languages;
  
  let html = '<button class="filter-btn active" data-filter="all">Semua</button>';
  languages.forEach(lang => { html += `<button class="filter-btn" data-filter="${escHtml(lang)}">${escHtml(lang)}</button>`; });
  container.innerHTML = html;
  
  dom.filterBtns = $$('.filter-btn', container);
  dom.filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dom.filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterRepos(btn.dataset.filter);
    });
  });
}

function renderRepoBatch() {
  const all = dom.repoGrid._repos;
  if (!Array.isArray(all) || all.length === 0) return;
  
  const filter = dom.repoGrid._currentFilter || 'all';
  let filtered = all;
  if (filter !== 'all') {
    filtered = filter === 'other'
      ? all.filter(r => !dom.repoGrid._languages?.includes(r.language))
      : all.filter(r => r.language === filter);
  }
  dom.repoGrid._filteredRepos = filtered;
  
  const loaded = dom.repoGrid._loadedCount || 0;
  if (loaded === 0) {
    const batch = filtered.slice(0, REPOS_PER_PAGE);
    dom.repoGrid.innerHTML = batch.length === 0
      ? '<div class="loading-spinner empty-message"><p style="color:var(--text-muted)">Tidak ada repository dengan bahasa ini.</p></div>'
      : batch.map(r => createRepoCard(r)).join('');
    dom.repoGrid._loadedCount = batch.length;
  } else {
    const batch = filtered.slice(loaded, loaded + REPOS_PER_PAGE);
    if (batch.length > 0) {
      dom.repoGrid.innerHTML += batch.map(r => createRepoCard(r)).join('');
      dom.repoGrid._loadedCount = loaded + batch.length;
    }
  }
  $$('.repo-card', dom.repoGrid).forEach(c => c.classList.add('animate-in'));
  updateLoadMoreBtn(filtered.length - dom.repoGrid._loadedCount);
}

function updateLoadMoreBtn(remaining) {
  const el = document.getElementById('repoPagination');
  if (!el) return;
  el.innerHTML = remaining <= 0
    ? ''
    : `<button class="load-more-btn" id="loadMoreReposBtn"><span>Muat lebih banyak (${remaining} lagi)</span><i class="fas fa-chevron-down"></i></button>`;
}

function getLangColor(lang) {
  if (!lang) return '#888';
  let h = 0;
  for (let i = 0; i < lang.length; i++) h = lang.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 55%, 55%)`;
}

function createRepoCard(repo) {
  const langColor = getLangColor(repo.language);
  const topics = repo.topics || [];
  return `
    <div class="repo-card" data-repo="${escHtml(repo.name)}" data-lang="${escHtml(repo.language || 'N/A')}">
      <div class="repo-card-header">
        <i class="fas fa-book"></i>
        <span class="repo-name">${escHtml(repo.name)}</span>
      </div>
      ${repo.description ? `<p class="repo-desc">${escHtml(repo.description)}</p>` : ''}
      ${topics.length > 0 ? `<div class="repo-topics">${topics.slice(0, 4).map(t => `<span class="repo-topic">${escHtml(t)}</span>`).join('')}${topics.length > 4 ? `<span class="repo-topic">+${topics.length - 4}</span>` : ''}</div>` : ''}
      <div class="repo-card-footer">
        ${repo.language ? `<span class="repo-lang"><span class="lang-dot" style="background:${langColor}"></span>${repo.language}</span>` : ''}
        ${(repo.stargazers_count || 0) > 0 ? `<span class="repo-stars"><i class="fas fa-star"></i> ${repo.stargazers_count}</span>` : ''}
        ${(repo.forks_count || 0) > 0 ? `<span class="repo-forks"><i class="fas fa-code-fork"></i> ${repo.forks_count}</span>` : ''}
      </div>
    </div>`;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function calcRepoStats(repos) {
  return {
    totalStars: repos.reduce((s, r) => s + (r.stargazers_count || 0), 0),
    totalForks: repos.reduce((s, r) => s + (r.forks_count || 0), 0)
  };
}

function renderStatsSection(repos) {
  const container = document.getElementById('statsShowcase');
  if (!container || !Array.isArray(repos)) return;
  
  const { totalStars, totalForks } = calcRepoStats(repos);
  
  // Language counts
  const langMap = {};
  repos.forEach(r => { if (r.language) langMap[r.language] = (langMap[r.language] || 0) + 1; });
  const langEntries = Object.entries(langMap).sort((a, b) => b[1] - a[1]);
  const totalLangRepos = langEntries.reduce((s, [, c]) => s + c, 0);
  
  // Top repos
  const topRepos = [...repos].filter(r => (r.stargazers_count || 0) > 0)
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0)).slice(0, 3);
  
  let html = '';
  
  if (langEntries.length > 0) {
    html += `<div class="stats-card-main"><h3><i class="fas fa-code"></i> Top Languages</h3><div class="stats-lang-list">`;
    html += langEntries.map(([lang, count]) => {
      const pct = totalLangRepos > 0 ? Math.round((count / totalLangRepos) * 100) : 0;
      const color = getLangColor(lang);
      return `<div class="stats-lang-item"><div class="stats-lang-header"><span class="stats-lang-name"><span class="stats-lang-dot" style="background:${color}"></span>${escHtml(lang)}</span><span class="stats-lang-pct">${pct}%</span></div><div class="stats-lang-bar-bg"><div class="stats-lang-bar" style="width:${pct}%;background:${color}"></div></div></div>`;
    }).join('');
    html += `</div></div>`;
  }
  
  if (topRepos.length > 0) {
    html += `<div class="stats-card-main"><h3><i class="fas fa-trophy"></i> Repository Terpopuler</h3><div class="stats-toprepos">`;
    html += topRepos.map(r => {
      // Buat URL GitHub dari nama repo saja — tanpa terekspos html_url
      const repoUrl = `https://github.com/${GITHUB_USERNAME}/${r.name}`;
      return `<a href="${repoUrl}" target="_blank" rel="noopener noreferrer" class="stats-toprepo-item"><div class="stats-toprepo-icon"><i class="fas fa-book"></i></div><div class="stats-toprepo-info"><div class="stats-toprepo-name">${escHtml(r.name)}</div><div class="stats-toprepo-desc">${escHtml(r.description || '')}</div></div><div class="stats-toprepo-stars"><i class="fas fa-star"></i> ${r.stargazers_count || 0}</div></a>`;
    }).join('');
    html += `</div></div>`;
  }
  
  container.innerHTML = html;
  
  // Update totals
  const starsEl = $('#totalStars');
  if (starsEl) starsEl.textContent = totalStars;
  const forksEl = $('#totalForks');
  if (forksEl) forksEl.textContent = totalForks;
}

// ==================== BLOG POSTS via Worker (dengan cache) ====================
async function fetchBlogPosts() {
  if (!dom.blogGrid) return;
  
  // Cek cache
  const cached = cache.get('blogdata');
  if (cached) {
    if (cached.posts && cached.posts.length > 0) renderBlogPosts(cached.posts);
    else dom.blogGrid.innerHTML = '<p style="color:var(--text-muted);text-align:center">Belum ada artikel blog.</p>';
    return;
  }
  
  try {
    const res = await fetch(`${WORKER_URL}/blogdata?maxResults=3`);
    if (!res.ok) throw new Error('Worker error: ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    
    cache.set('blogdata', data);
    
    if (data.posts && data.posts.length > 0) renderBlogPosts(data.posts);
    else dom.blogGrid.innerHTML = '<p style="color:var(--text-muted);text-align:center">Belum ada artikel blog.</p>';
  } catch (err) {
    console.error('Blog fetch error:', err.message);
    dom.blogGrid.innerHTML = '<p style="color:var(--text-muted);text-align:center">Gagal memuat artikel blog.</p>';
  }
}

function renderBlogPosts(posts) {
  dom.blogGrid.innerHTML = posts.map(post => {
    return `<a href="${BLOG_URL}/read/?post=${escHtml(slugifyBlog(post.title))}" target="_blank" rel="noopener noreferrer" class="blog-card">
      <div class="blog-card-header"><i class="fas fa-newspaper"></i><span class="blog-date">${formatDate(post.published)}</span></div>
      <h3 class="blog-title">${escHtml(post.title)}</h3>
      <p class="blog-excerpt">${extractExcerpt(post.content, 120)}</p>
      ${post.labels && post.labels.length > 0 ? `<div class="blog-labels">${post.labels.slice(0, 3).map(l => `<span class="repo-topic">${escHtml(l)}</span>`).join('')}</div>` : ''}
    </a>`;
  }).join('');
}

function extractExcerpt(content, max) {
  if (!content) return '';
  const safe = content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=\s*["'][^"']*["']/gi, '').replace(/on\w+\s*=\s*\S+/gi, '')
    .replace(/<(?!\/?(b|strong|i|em|u|s|br|code)(\s[^>]*)?>)[^>]*>/gi, '');
  const div = document.createElement('div');
  div.innerHTML = safe;
  let len = 0;
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_ALL, null, false);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeType === Node.TEXT_NODE) {
      const r = max - len;
      if (r <= 0) n.textContent = '';
      else if (n.textContent.length > r) { n.textContent = n.textContent.slice(0, r) + '…'; len = max; }
      else len += n.textContent.length;
    }
  }
  return div.innerHTML.replace(/\s+/g, ' ').trim() || '';
}

function formatDate(d) {
  if (!d) return '';
  try {
    const date = new Date(d);
    return `${date.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'][date.getMonth()]} ${date.getFullYear()}`;
  } catch { return d; }
}

function slugifyBlog(str) {
  if (!str) return 'untitled';
  return str.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'untitled';
}

// ==================== AI TEXT (dengan cache) ====================
function setGradientTitle(containerId, gradientId, text) {
  const el = document.getElementById(containerId);
  if (!el || !text) return;
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return;
  const last = words.pop();
  el.innerHTML = words.length > 0
    ? escHtml(words.join(' ')) + ' <span class="gradient-text" id="' + gradientId + '">' + escHtml(last) + '</span>'
    : '<span class="gradient-text" id="' + gradientId + '">' + escHtml(last) + '</span>';
}

async function fetchAIText() {
  // Cek cache
  const cached = cache.get('aitext');
  if (cached) { applyAIText(cached); return; }
  
  try {
    const res = await fetch(`${WORKER_URL}/aitext`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.error) return;
    cache.set('aitext', data);
    applyAIText(data);
  } catch {}
}

function applyAIText(data) {
  if (!data) return;
  
  const heroBio = $('#userBio');
  if (heroBio && data.heroBio) heroBio.textContent = data.heroBio;
  
  const status = $('#heroStatusTextVisible');
  if (status && data.heroStatus) status.textContent = data.heroStatus;
  
  const aboutBadge = $('#aboutBadge');
  if (aboutBadge && data.aboutBadge) aboutBadge.textContent = data.aboutBadge;
  if (data.aboutTitle) setGradientTitle('aboutTitle', 'aboutTitleGrad', data.aboutTitle);
  
  const p1 = $('#aboutPara1');
  if (p1 && data.aboutPara1) { p1.textContent = data.aboutPara1; p1.style.display = ''; }
  const p2 = $('#aboutPara2');
  if (p2 && data.aboutPara2) { p2.textContent = data.aboutPara2; p2.style.display = ''; }
  
  const statsBadge = $('#statsBadge');
  if (statsBadge && data.statsBadge) statsBadge.textContent = data.statsBadge;
  if (data.statsTitle) setGradientTitle('statsTitle', 'statsTitleGrad', data.statsTitle);
  
  const reposBadge = $('#reposBadge');
  if (reposBadge && data.reposBadge) reposBadge.textContent = data.reposBadge;
  if (data.reposTitle) setGradientTitle('reposTitle', 'reposTitleGrad', data.reposTitle);
  const reposDesc = $('#reposDesc');
  if (reposDesc && data.reposDesc) reposDesc.textContent = data.reposDesc;
  
  const contactBadge = $('#contactBadge');
  if (contactBadge && data.contactBadge) contactBadge.textContent = data.contactBadge;
  if (data.contactTitle) setGradientTitle('contactTitle', 'contactTitleGrad', data.contactTitle);
  const contactDesc = $('#contactDesc');
  if (contactDesc && data.contactDesc) contactDesc.textContent = data.contactDesc;
  
  const footer = $('#footerText');
  if (footer && data.footerText) {
    footer.textContent = data.footerText + ' ';
    const heart = document.createElement('i');
    heart.className = 'fas fa-heart';
    heart.style.color = 'var(--accent)';
    footer.appendChild(heart);
    footer.append(' oleh ');
    const name = document.createElement('strong');
    name.textContent = 'Zhyllan Fyllah';
    footer.appendChild(name);
  }
}

// ==================== FILTER ====================
function filterRepos(filter) {
  dom.repoGrid._currentFilter = filter;
  dom.repoGrid._loadedCount = 0;
  renderRepoBatch();
}

// ==================== SCROLL ANIMATIONS ====================
function initScrollAnimations() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  
  $$('section:not(.hero), .repo-card, .stat-card, .stats-card-main, .contact-item').forEach(el => {
    if (!el.classList.contains('animate-in')) { el.style.opacity = '0'; observer.observe(el); }
  });
}

function addAnimationStyles() {
  if (document.getElementById('animate-styles')) return;
  const s = document.createElement('style');
  s.id = 'animate-styles';
  s.textContent = `
    section:not(.hero),.repo-card,.stat-card,.stats-card-main,.contact-item{opacity:0;transform:translateY(30px);transition:opacity .6s ease,transform .6s ease}
    section.animate-in,.repo-card.animate-in,.stat-card.animate-in,.stats-card-main.animate-in,.contact-item.animate-in{opacity:1!important;transform:translateY(0)!important}`;
  document.head.appendChild(s);
}

// ==================== CURRENT YEAR ====================
function setCurrentYear() {
  if (dom.currentYear) dom.currentYear.textContent = new Date().getFullYear();
}

// ==================== AVATAR FALLBACK ====================
function handleAvatarError(img) {
  img.style.display = 'none';
  const fb = document.getElementById('avatarFallback');
  if (fb) fb.style.display = 'flex';
}

// ==================== REPO CARD CLICK HANDLER ====================
function handleRepoClick(e) {
  const card = e.target.closest('.repo-card[data-repo]');
  if (card) {
    // Buka repo via worker redirect atau langsung — pakai nama repo
    window.open(`https://github.com/${GITHUB_USERNAME}/${card.dataset.repo}`, '_blank');
    return;
  }
  const loadBtn = e.target.closest('#loadMoreReposBtn');
  if (loadBtn) renderRepoBatch();
}

// ==================== INIT (Parallel fetches + cache) ====================
async function init() {
  cacheDom();
  addAnimationStyles();
  initTheme();
  setCurrentYear();
  
  // Particles — ringan, pake requestAnimationFrame
  requestAnimationFrame(() => createParticles());
  
  // Event listeners
  dom.themeToggle.addEventListener('click', toggleTheme);
  dom.navToggle.addEventListener('click', toggleNav);
  dom.navLinksItems.forEach(link => link.addEventListener('click', closeNav));
  dom.scrollTop.addEventListener('click', () => {
    if (typeof lenis !== 'undefined') {
      lenis.scrollTo(0, { duration: 1.2 });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  window.addEventListener('scroll', handleScroll, { passive: true });
  document.addEventListener('click', handleRepoClick);
  
  // Fetch ALL data secara PARALEL (lebih cepat dari sequential)
  const [gitData] = await Promise.all([
    fetchGitHubData(),
    fetchBlogPosts(),  // blog posts independen
  ]);
  
  // AI text butuh GitHub data — jalankan setelah
  fetchAIText();
  
  // Init scroll animations setelah konten termuat
  requestAnimationFrame(() => setTimeout(initScrollAnimations, 50));
}

// Start
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
