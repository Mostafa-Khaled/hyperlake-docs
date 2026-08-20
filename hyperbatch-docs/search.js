(function () {
  const input    = document.getElementById('docs-search-input');
  const dropdown = document.getElementById('docs-search-results');
  if (!input || !dropdown) return;

  const docsRoot = (document.body.dataset.docsRoot || './').replace(/\/?$/, '/');
  let index      = null;
  let results    = [];
  let activeIdx  = -1;
  let timer      = null;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function snippet(text, query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const lower = text.toLowerCase();
    let pos = 0;
    for (const w of words) {
      const i = lower.indexOf(w);
      if (i > -1) { pos = i; break; }
    }
    const start = Math.max(0, pos - 50);
    const raw   = text.slice(start, start + 140).trim();
    return (start > 0 ? '\u2026' : '') + raw + (text.length > start + 140 ? '\u2026' : '');
  }

  function score(entry, words) {
    const title = entry.title.toLowerCase();
    const text  = entry.text.toLowerCase();
    let s = 0;
    for (const w of words) {
      if (title.startsWith(w)) s += 30;
      else if (title.includes(w)) s += 15;
      const idx = text.indexOf(w);
      if (idx > -1) s += (5 - Math.min(4, Math.floor(idx / 500)));
    }
    return s;
  }

  function doSearch(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !index) return [];
    return index
      .map(e => ({ ...e, score: score(e, words) }))
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }

  function setActive(idx) {
    activeIdx = idx;
    dropdown.querySelectorAll('.sr-item').forEach((el, i) =>
      el.classList.toggle('sr-item--active', i === idx)
    );
  }

  function render(query) {
    dropdown.innerHTML = '';
    if (!results.length) { dropdown.removeAttribute('data-open'); return; }
    dropdown.dataset.open = '';
    results.forEach((entry, i) => {
      const url  = docsRoot + entry.url;
      const item = document.createElement('a');
      item.href  = url;
      item.className = 'sr-item';
      item.innerHTML =
        `<span class="sr-title">${esc(entry.title)}</span>` +
        `<span class="sr-snip">${esc(snippet(entry.text, query))}</span>`;
      item.addEventListener('mousedown', e => { e.preventDefault(); location.href = url; });
      dropdown.appendChild(item);
    });
    setActive(-1);
  }

  async function loadIndex() {
    if (index) return;
    try {
      const r = await fetch(docsRoot + 'search-index.json');
      index = await r.json();
    } catch { index = []; }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { results = []; render(''); return; }
    timer = setTimeout(async () => {
      await loadIndex();
      results = doSearch(q);
      render(q);
    }, 140);
  });

  input.addEventListener('keydown', e => {
    if (!dropdown.hasAttribute('data-open')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIdx + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIdx - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) location.href = docsRoot + results[activeIdx].url;
    } else if (e.key === 'Escape') {
      dropdown.removeAttribute('data-open');
      input.blur();
    }
  });

  input.addEventListener('focus', () => { if (results.length) dropdown.dataset.open = ''; });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.removeAttribute('data-open');
    }
  });

  document.addEventListener('keydown', e => {
    const tag = document.activeElement && document.activeElement.tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable);
    if (e.key === '/' && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  window.downloadCurrentPageText = function () {
    const content = document.querySelector('.page-content');
    if (!content) return;
    const title = (document.title || 'document').split('—')[0].trim();
    const text = title + '\n' + '='.repeat(title.length) + '\n\n' + content.innerText;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = title.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  document.addEventListener('click', e => {
    const exportBtn = e.target.closest('.export-toggle-btn');
    const exportMenu = document.querySelector('.export-menu');
    if (exportBtn && exportMenu) {
      const isOpen = exportMenu.classList.toggle('export-menu--open');
      exportBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    } else if (exportMenu && !exportMenu.contains(e.target)) {
      exportMenu.classList.remove('export-menu--open');
      const btn = document.querySelector('.export-toggle-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
})();
