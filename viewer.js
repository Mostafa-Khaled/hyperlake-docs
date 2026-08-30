const root = document.documentElement;
const app = document.querySelector('#content');
const sidebar = document.querySelector('#sidebar');
const search = document.querySelector('#search');
let manifest;
let loaded = new Map();

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function getBasePath() {
  const path = location.pathname;
  if (path.startsWith('/hyperlake-docs')) {
    return '/hyperlake-docs';
  }
  if (location.hostname.endsWith('github.io')) {
    const seg = path.split('/').filter(Boolean)[0];
    if (seg && (!manifest || !manifest.products?.some(p => p.id === seg))) {
      return `/${seg}`;
    }
  }
  return '';
}

const pathRoute = () => {
  const base = getBasePath();
  let path = location.pathname;
  if (base && path.startsWith(base)) {
    path = path.slice(base.length);
  }
  path = path.replace(/^\/+|\/+$/g, '');
  if (path === 'index.html' || path === '404.html') path = '';

  // Check SPA redirect query parameter
  if (location.search && location.search.startsWith('?/')) {
    const q = location.search.slice(2).split('&')[0].replace(/^\/+|\/+$/g, '');
    if (q) path = q;
  }

  // Fallback to hash if present
  let hash = location.hash.replace(/^#\/?/, '').replace(/^internal-docs\/?/, '').replace(/^\/+|\/+$/g, '');
  if (hash === 'index.html' || hash === '/') hash = '';

  let route = path || hash;
  if (!route) return '';

  route = route.replace(/^internal-docs\/?/, '');
  const [routePart] = route.split('#');
  return routePart.replace(/^\/+|\/+$/g, '');
};

const hrefFor = route => {
  const base = getBasePath();
  if (!route || route === '/' || route === '#/' || route === '.') return base ? `${base}/` : '/';
  const clean = String(route).replace(/^(\/?#\/?)+/, '').replace(/^internal-docs\/?/, '').replace(/^\/+/, '');
  if (!clean) return base ? `${base}/` : '/';
  return base ? `${base}/${clean}` : `/${clean}`;
};

function productFor(route) {
  return manifest.products.find(p => route === p.id || route.startsWith(`${p.id}/`));
}

const pretty = value => value.split(/[-_/]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ');

async function getPage(product, route) {
  // Strip any trailing hash if present
  const pureRoute = route.split('#')[0].replace(/\/$/, '');
  const ref = product.pages[pureRoute] 
    || product.pages[product.id] 
    || product.pages[`${product.id}/index`]
    || Object.values(product.pages)[0];
  if (!ref) return null;
  if (!loaded.has(ref.chunk)) {
    loaded.set(ref.chunk, await fetch(`${getBasePath()}/data/${ref.chunk}?v=1.0.4`).then(r => r.ok ? r.json() : []));
  }
  return loaded.get(ref.chunk)[ref.index];
}

function cleanImportedHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  
  // 1. Remove specific unwanted interactive widgets, chat assistants, feedback bars, and external git links
  template.content.querySelectorAll(`
    #navbar-transition-maple, #content-side-layout, #table-of-contents-layout, #table-of-contents,
    [class*="chat-assistant"], .theme-doc-version-banner, .versionBadge_QOso, [class*="versionSelector"],
    [class*="theme-doc-version"], .openapi-skeleton, [class*="openapi-skeleton"], .version-banner,
    [class*="version-banner"], .docssubmenu-toggle, #docssubmenu, #leftdocnav,
    [class*="feedback"], [id*="feedback"], .feedback-toolbar,
    [class*="suggestEdit"], [class*="raiseIssue"], [class*="theme-edit-this-page"],
    [class*="edit-this-page"], [class*="editThisPage"],
    a[href*="github.com"][href*="/edit/"], a[href*="github.com"][href*="/issues/"],
    a[href*="github.com"][href*="/tree/"], a[href*="github.com"][href*="/blob/"]
  `).forEach(el => el.remove());

  // 2. Remove text-based feedback prompts and their parent containers
  template.content.querySelectorAll('p, div, span, small, a, button, section, footer').forEach(el => {
    const text = el.textContent.trim().toLowerCase();
    if (
      text === 'was this page helpful?' ||
      text === 'was this helpful?' ||
      text === 'suggest edits' ||
      text === 'raise issue' ||
      text === 'edit this page' ||
      text === 'edit this page on github' ||
      text === 'back to top' ||
      text.startsWith('latest stable (') ||
      text.startsWith('development (')
    ) {
      const container = el.closest('.flex, .feedback, [class*="feedback"], footer, div') || el;
      if (container && container !== template.content && (container.textContent.includes('helpful') || container.textContent.includes('Suggest') || container.textContent.includes('Raise'))) {
        container.remove();
      } else {
        el.remove();
      }
    }
  });

  // 3. Clean up empty headings (like Request heading when no parameters are present)
  template.content.querySelectorAll('h2#request, .openapi-tabs__heading#request').forEach(heading => {
    const next = heading.nextElementSibling;
    if (!next || next.classList.contains('openapi-tabs__container') || next.id === 'responses' || next.querySelector?.('#responses')) {
      heading.remove();
    }
  });

  // 4. Remove broken upstream anchor icons and sprite links
  template.content.querySelectorAll('a.anchor, .anchor, use[href*="svg-sprite"], use[xlink\\:href*="svg-sprite"]').forEach(el => {
    if (el.matches('a.anchor, .anchor')) el.remove();
    else el.closest('a.anchor, .anchor')?.remove() || el.remove();
  });

  return template.innerHTML;
}

function showToast(message) {
  document.querySelector('.copy-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.innerHTML = `<span>✔</span> <span>${esc(message)}</span>`;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 1600);
}

/* ==========================================================================
   Interactive Control Bindings
   ========================================================================== */

function bindDocumentControls() {
  bindCopyButtons();
  bindTabs();
  bindAccordions();
  bindPageActions();
  bindCardNavigation();
  bindImageFallbacks();
  bindAnchorLinks();
}

/**
 * Universal Code Copy Buttons
 */
function bindCopyButtons() {
  const copySvg = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
  const checkSvg = `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;

  app.querySelectorAll('pre, .code-block, .highlight').forEach(block => {
    let btn = block.querySelector('[data-testid="copy-code-button"], button[class*="copyButton"], button.copybtn, .code-copy-btn');
    
    // Auto-inject copy button if block doesn't already have one
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.setAttribute('aria-label', 'Copy code to clipboard');
      btn.setAttribute('type', 'button');
      btn.innerHTML = copySvg;
      if (!block.classList.contains('openapi__method-endpoint')) {
        block.style.position = 'relative';
      }
      block.prepend(btn);
    }

    // Bind click handler
    btn.onclick = async event => {
      event.preventDefault();
      event.stopPropagation();
      const codeEl = block.querySelector('code') || block.querySelector('.openapi__method-endpoint-path') || block;
      const textToCopy = (codeEl.innerText || '').trim();
      
      try {
        await navigator.clipboard.writeText(textToCopy);
        btn.dataset.copied = 'true';
        btn.innerHTML = checkSvg;
        showToast('Copied to clipboard');
        setTimeout(() => {
          btn.dataset.copied = '';
          btn.innerHTML = copySvg;
        }, 1500);
      } catch {
        showToast('Copy unavailable');
      }
    };
  });
}

/**
 * Universal Tab Switching (Docusaurus, OpenAPI, Mintlify, Sphinx, Bootstrap/Docsy, Java Method Tabs)
 */
function bindTabs() {
  // 1. Docusaurus & OpenAPI Tabs (ul.tabs, div.tabs, .openapi-tabs__response-list-container)
  app.querySelectorAll('.tabs, ul.tabs, .openapi-tabs__response-list-container').forEach(tabList => {
    const tabs = Array.from(tabList.querySelectorAll('.tabs__item, [role="tab"], li'));
    if (!tabs.length) return;

    // Find tab panels container
    const container = tabList.closest('.openapi-tabs__container, .tabs-container') || tabList.parentElement?.parentElement || tabList.parentElement;
    const panels = container ? Array.from(container.querySelectorAll('.tabItem, [role="tabpanel"], div[class*="tabItem"], div[class*="tabItem_"]')) : [];

    const activateTab = activeIndex => {
      tabs.forEach((t, i) => {
        const isActive = (i === activeIndex);
        t.classList.toggle('tabs__item--active', isActive);
        t.classList.toggle('active', isActive);
        t.setAttribute('aria-selected', String(isActive));
      });

      if (panels.length) {
        const activeTab = tabs[activeIndex];
        const activeVal = activeTab ? activeTab.getAttribute('value') : null;
        panels.forEach((p, pIdx) => {
          const pVal = p.getAttribute('value');
          const isMatch = (activeVal && pVal) ? (activeVal === pVal) : (pIdx === activeIndex);
          if (isMatch) {
            p.removeAttribute('hidden');
            p.style.display = 'block';
          } else {
            p.setAttribute('hidden', 'true');
            p.style.display = 'none';
          }
        });
      }
    };

    // Determine currently active index or default to 0
    let initialIndex = tabs.findIndex(t => t.classList.contains('active') || t.classList.contains('tabs__item--active') || t.getAttribute('aria-selected') === 'true');
    if (initialIndex < 0) initialIndex = 0;
    activateTab(initialIndex);

    tabs.forEach((tab, idx) => {
      tab.onclick = e => {
        e.preventDefault();
        activateTab(idx);
      };
    });
  });

  // 2. Mintlify & Sphinx Tabs (.docs-tab, [role="tablist"], .sphinx-tabs)
  app.querySelectorAll('.docs-tab, .sphinx-tabs, [role="tablist"]:not(.tabs):not(.table-tabs)').forEach(tabGroup => {
    const tabs = tabGroup.querySelectorAll('button[role="tab"], button, .sphinx-tabs-tab');
    const parent = tabGroup.closest('.sphinx-tabs') || tabGroup.parentElement;
    const panels = parent ? Array.from(parent.querySelectorAll('.sphinx-tabs-panel, [role="tabpanel"]')) : [];

    tabs.forEach((tab, idx) => {
      tab.addEventListener('click', e => {
        e.preventDefault();
        tabs.forEach(t => {
          t.setAttribute('aria-selected', 'false');
          t.classList.remove('active');
        });
        tab.setAttribute('aria-selected', 'true');
        tab.classList.add('active');

        if (panels.length) {
          const ctrl = tab.getAttribute('aria-controls');
          panels.forEach((panel, pIdx) => {
            const pId = panel.getAttribute('id');
            const isMatch = (ctrl && pId) ? (ctrl === pId) : (pIdx === idx);
            if (isMatch) {
              panel.removeAttribute('hidden');
              panel.style.display = 'block';
            } else {
              panel.setAttribute('hidden', 'true');
              panel.style.display = 'none';
            }
          });
        }
      });
    });
  });

  // 3. Bootstrap / Nav-Tabs (ul.nav-tabs in Spark/Kafka docs)
  app.querySelectorAll('.nav-tabs').forEach(nav => {
    const links = nav.querySelectorAll('.nav-link, a, button');
    const parent = nav.parentElement;
    const panes = parent ? Array.from(parent.querySelectorAll('.tab-pane')) : [];

    links.forEach((link, idx) => {
      link.addEventListener('click', e => {
        e.preventDefault();
        links.forEach(l => {
          l.classList.remove('active');
          l.parentElement?.classList.remove('active');
        });
        link.classList.add('active');
        link.parentElement?.classList.add('active');

        const targetId = link.getAttribute('href')?.replace(/^#/, '');
        panes.forEach((pane, pIdx) => {
          if (pane.id === targetId || pIdx === idx) {
            pane.classList.add('active', 'show');
            pane.style.display = 'block';
          } else {
            pane.classList.remove('active', 'show');
            pane.style.display = 'none';
          }
        });
      });
    });
  });

  // 4. Java Method Summary Tabs in HyperStream
  app.querySelectorAll('.table-tabs').forEach(tabList => {
    const buttons = tabList.querySelectorAll('button[role="tab"]');
    const table = tabList.closest('.summary-table, table, .method-summary-table')?.parentElement || tabList.parentElement;
    
    buttons.forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        buttons.forEach(b => b.setAttribute('aria-selected', 'false'));
        btn.setAttribute('aria-selected', 'true');

        const id = btn.id || '';
        const rows = table?.querySelectorAll('.method-summary-table, tr[class*="method-summary-table"]');
        if (!rows || !rows.length) return;

        if (id.includes('tab0')) {
          // Show all
          rows.forEach(r => r.style.display = '');
        } else {
          const tabClass = id.replace(/^.*?-tab/, 'table-tab');
          rows.forEach(r => {
            if (r.classList.contains('table-header') || r.querySelector('th')) {
              r.style.display = '';
            } else if (r.classList.contains(tabClass)) {
              r.style.display = '';
            } else {
              r.style.display = 'none';
            }
          });
        }
      });
    });
  });

  // 5. HyperBI / Ant Carousel Toggle Buttons (.toggleBtns li.toggle)
  app.querySelectorAll('.toggleBtns').forEach(toggleList => {
    const toggles = Array.from(toggleList.querySelectorAll('.toggle'));
    const section = toggleList.closest('section, .css-1y8n189') || toggleList.parentElement;
    const slides = section ? Array.from(section.querySelectorAll('.slick-slide:not(.slick-cloned)')) : [];

    toggles.forEach((btn, idx) => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        toggles.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');

        slides.forEach((slide, sIdx) => {
          if (sIdx === idx) {
            slide.style.display = 'block';
            slide.classList.add('slick-active', 'slick-current');
            slide.setAttribute('aria-hidden', 'false');
          } else {
            slide.style.display = 'none';
            slide.classList.remove('slick-active', 'slick-current');
            slide.setAttribute('aria-hidden', 'true');
          }
        });
      });
    });

    // Initialize first slide visible
    if (slides.length) {
      slides.forEach((s, sIdx) => {
        if (sIdx === 0) {
          s.style.display = 'block';
          s.classList.add('slick-active', 'slick-current');
          s.setAttribute('aria-hidden', 'false');
        } else {
          s.style.display = 'none';
          s.classList.remove('slick-active', 'slick-current');
          s.setAttribute('aria-hidden', 'true');
        }
      });
    }
  });
}

/**
 * Universal Accordions & Collapsibles (UIkit, Docusaurus TOC, Ant Design, <details>)
 */
function bindAccordions() {
  // 1. UIkit Accordions (NiFi / HyperSync) - Default closed, single-click toggle
  app.querySelectorAll('.uk-accordion-title, a.uk-accordion-title, dt.uk-accordion-title').forEach(title => {
    title.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      const parent = title.parentElement;
      const content = title.nextElementSibling?.classList.contains('uk-accordion-content')
        ? title.nextElementSibling
        : parent?.querySelector('.uk-accordion-content');
      
      const isOpen = parent?.classList.contains('uk-open') || title.classList.contains('uk-open') || (content && content.classList.contains('uk-open'));
      
      if (isOpen) {
        parent?.classList.remove('uk-open');
        title.classList.remove('uk-open');
        content?.classList.remove('uk-open');
        if (content) {
          content.setAttribute('hidden', 'true');
          content.style.display = 'none';
        }
      } else {
        parent?.classList.add('uk-open');
        title.classList.add('uk-open');
        content?.classList.add('uk-open');
        if (content) {
          content.removeAttribute('hidden');
          content.style.display = 'block';
        }
      }
    };
  });

  // Expand / Shrink All Toolbar Buttons in HyperSync
  app.querySelectorAll('#expand-property-descriptors, #expand-dynamic-properties').forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      const scope = btn.closest('table, section, div') || app;
      scope.querySelectorAll('.property-descriptor-content, .dynamic-property-content, .uk-accordion-content').forEach(c => {
        c.classList.add('uk-open');
        c.removeAttribute('hidden');
        c.style.display = 'block';
      });
      scope.querySelectorAll('.uk-accordion-title, dt, li').forEach(t => t.classList.add('uk-open'));
      showToast('Expanded all properties');
    };
  });

  app.querySelectorAll('#shrink-dynamic-properties, #shrink-property-descriptors').forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      const scope = btn.closest('table, section, div') || app;
      scope.querySelectorAll('.property-descriptor-content, .dynamic-property-content, .uk-accordion-content').forEach(c => {
        c.classList.remove('uk-open');
        c.setAttribute('hidden', 'true');
        c.style.display = 'none';
      });
      scope.querySelectorAll('.uk-accordion-title, dt, li').forEach(t => t.classList.remove('uk-open'));
      showToast('Collapsed all properties');
    };
  });

  // 2. Docusaurus Mobile TOC Collapsible Dropdowns
  app.querySelectorAll('.tocCollapsibleButton_TO0P, [class*="tocCollapsibleButton"]').forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      const wrap = btn.closest('.tocCollapsible_ETCw, [class*="tocCollapsible_"]') || btn.parentElement;
      wrap?.classList.toggle('tocCollapsible_ETCw--expanded');
    };
  });

  // 3. Ant Design Collapse Panels (HyperBI)
  app.querySelectorAll('.ant-collapse-header').forEach(header => {
    header.onclick = e => {
      e.preventDefault();
      const item = header.closest('.ant-collapse-item');
      item?.classList.toggle('ant-collapse-item-active');
    };
  });
}

/**
 * Page Actions (Copy page, View Markdown, Download PDF, Feedback)
 */
function bindPageActions() {
  // 1. Action bar buttons
  const printPageBtn = app.querySelector('#doc-print-page-btn');
  if (printPageBtn) {
    printPageBtn.onclick = e => {
      e.preventDefault();
      window.print();
    };
  }

  const printProductBtn = app.querySelector('#doc-print-product-btn');
  if (printProductBtn) {
    printProductBtn.onclick = e => {
      e.preventDefault();
      const pureRoute = pathRoute().split('#')[0];
      const product = productFor(pureRoute);
      if (product) printWholeProduct(product);
    };
  }

  const copyTextBtn = app.querySelector('#doc-copy-page-btn');
  if (copyTextBtn) {
    copyTextBtn.onclick = async e => {
      e.preventDefault();
      const article = app.querySelector('article') || app;
      const pageText = `${document.title}\n\n${article.innerText.trim()}`;
      try {
        await navigator.clipboard.writeText(pageText);
        showToast('Page content copied to clipboard');
      } catch {
        showToast('Copy unavailable');
      }
    };
  }

  // 2. Embedded page buttons (Docusaurus/Sphinx/Bootstrap legacy copy or pdf buttons)
  app.querySelectorAll('button, a').forEach(btn => {
    if (btn.id === 'doc-print-page-btn' || btn.id === 'doc-print-product-btn' || btn.id === 'doc-copy-page-btn') return;
    const text = btn.textContent.trim().toLowerCase();
    if (text === 'copy page' || text.startsWith('copy page')) {
      btn.onclick = async e => {
        e.preventDefault();
        const article = app.querySelector('article') || app;
        const pageText = `${document.title}\n\n${article.innerText.trim()}`;
        try {
          await navigator.clipboard.writeText(pageText);
          showToast('Page content copied to clipboard');
        } catch {
          showToast('Copy unavailable');
        }
      };
    } else if (text === 'download pdf' || text.startsWith('download pdf')) {
      btn.onclick = e => {
        e.preventDefault();
        window.print();
      };
    } else if (text === 'view as markdown' || text.startsWith('view as markdown')) {
      btn.onclick = async e => {
        e.preventDefault();
        const article = app.querySelector('article') || app;
        const pageText = `# ${document.title}\n\n${article.innerText.trim()}`;
        try {
          await navigator.clipboard.writeText(pageText);
          showToast('Markdown copied to clipboard');
        } catch {
          showToast('Copy unavailable');
        }
      };
    }
  });

  // 3. Feedback thumbs up / down
  app.querySelectorAll('#feedback-thumbs-up, #feedback-thumbs-down, .feedback-toolbar button, .feedback-toolbar a').forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      const toolbar = btn.closest('.feedback-toolbar') || btn.parentElement;
      toolbar?.querySelectorAll('button, a').forEach(item => item.removeAttribute('data-selected'));
      btn.dataset.selected = 'true';
      showToast('Thank you for your feedback!');
    };
  });
}

/**
 * Permalinks & In-Page Section Anchor Links
 */
function bindAnchorLinks() {
  app.querySelectorAll('.hash-link, a[aria-label="Navigate to header"], a.anchor, a.headerlink, a[href^="#"]').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (!href || href === '#' || href.startsWith('#/')) return;
    
    link.title = 'Jump to section / copy link';
    link.onclick = async event => {
      event.preventDefault();
      event.stopPropagation();
      
      const targetId = href.replace(/^.*?#/, '');
      if (!targetId) return;

      const targetEl = document.getElementById(targetId) || document.getElementsByName(targetId)[0] || app.querySelector(`[id="${CSS.escape(targetId)}"]`);
      
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        targetEl.classList.add('anchor-highlight');
        setTimeout(() => targetEl.classList.remove('anchor-highlight'), 1200);
      }
      
      const currentRoute = pathRoute();
      if (currentRoute) {
        history.replaceState(null, '', `${hrefFor(currentRoute)}#${targetId}`);
      }
      
      if (link.classList.contains('hash-link') || link.classList.contains('headerlink')) {
        try {
          await navigator.clipboard.writeText(location.href);
          showToast('Section link copied');
        } catch {}
      }
    };
  });
}

/**
 * Documentation Cards Click Navigation
 */
function bindCardNavigation() {
  app.querySelectorAll('.doc-body .card, .card-group .card').forEach(card => {
    const link = card.querySelector('a') || (card.tagName === 'A' ? card : null);
    if (link && link !== card) {
      card.onclick = e => {
        if (e.target.tagName !== 'A') {
          link.click();
        }
      };
    }
  });
}

/**
 * Online Image Fallback on Network Error
 */
function bindImageFallbacks() {
  app.querySelectorAll('.doc-body img').forEach(img => {
    img.onerror = () => {
      const alt = img.getAttribute('alt') || 'Documentation image';
      const fallback = document.createElement('div');
      fallback.className = 'img-fallback';
      fallback.innerHTML = `<span>🖼️</span> <span>[Image: ${esc(alt)}]</span>`;
      img.replaceWith(fallback);
    };
  });
}

/* ==========================================================================
   Sidebar & Layout Rendering
   ========================================================================== */

function formatSidebarEntry(route, ref, product) {
  let rel = route.slice(product.id.length).replace(/^\/+/, '');
  if (!rel) return { section: 'Overview', label: 'Overview', route };

  // Remove common noisy prefixes
  rel = rel.replace(/^(?:documentation\/reference\/3\.6\/|documentation\/reference\/|documentation\/|docs\/latest\/|docs\/current\/|docs\/|platform\/)/i, '');
  
  const parts = rel.split('/').filter(Boolean);
  let section = 'Overview';

  if (parts.length > 1) {
    section = parts[0];
    if (section === 'user-docs' || section === 'admin-docs' || section === 'developer-docs') {
      if (parts.length > 2) {
        section = `${parts[0].replace(/-docs$/, '')} / ${parts[1]}`;
      } else {
        section = parts[0].replace(/-docs$/, '');
      }
    }
  }

  // Clean label from ref.title or pretty filename
  let cleanTitle = (ref?.title || '')
    .replace(/\s+(?:\||::|—|-)\s+.*(?:documentation|hyper|apache|pimcore|trino|clickhouse|debezium|spark|kafka|minio).*$/i, '')
    .replace(/^HyperCDC\s+(?:connector\s+for\s+|connectors?\s+|server\s+|integrations?\s+|transformations?\s+)?/i, '')
    .replace(/^HyperBI\s+/i, '')
    .trim();

  const prettyPart = parts[parts.length - 1]
    .split(/[-_]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const displayLabel = cleanTitle && cleanTitle.length > 0 && cleanTitle.length < 45 ? cleanTitle : prettyPart;
  const prettySection = section
    .split(/[-_]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return { section: prettySection, label: displayLabel, route };
}

/* ==========================================================================
   Runtime Whole Product Print Generator
   ========================================================================== */

function showPrintProgress(brand, totalPages) {
  document.querySelector('.print-progress-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'print-progress-modal';
  modal.innerHTML = `
    <div class="print-progress-card">
      <div class="print-spinner"></div>
      <h3>Preparing Print Document</h3>
      <p class="print-progress-desc">Assembling complete documentation for <strong>${esc(brand)}</strong> (${totalPages} pages)...</p>
      <div class="print-progress-bar-wrap">
        <div class="print-progress-bar" style="width: 15%"></div>
      </div>
      <p class="print-progress-status">Downloading chapters...</p>
    </div>
  `;
  document.body.appendChild(modal);
  return {
    update(percent, status) {
      const bar = modal.querySelector('.print-progress-bar');
      const stat = modal.querySelector('.print-progress-status');
      if (bar) bar.style.width = `${percent}%`;
      if (stat) stat.textContent = status;
    },
    close() {
      modal.remove();
    }
  };
}

async function loadAllProductPages(product, onProgress) {
  const chunks = product.chunks || [];
  let loadedChunks = 0;
  
  await Promise.all(chunks.map(async chunk => {
    if (!loaded.has(chunk)) {
      const data = await fetch(`${getBasePath()}/data/${chunk}?v=1.0.4`).then(r => r.ok ? r.json() : []);
      loaded.set(chunk, data);
    }
    loadedChunks++;
    if (onProgress) {
      const percent = Math.min(85, Math.round((loadedChunks / Math.max(1, chunks.length)) * 75) + 10);
      onProgress(percent, `Loaded chunk ${loadedChunks} of ${chunks.length}...`);
    }
  }));
}

function compileProductPrintHtml(product) {
  const entries = Object.entries(product.pages).map(([route, ref]) => {
    const formatted = formatSidebarEntry(route, ref, product);
    const chunkData = loaded.get(ref.chunk) || [];
    const pageData = chunkData[ref.index] || { title: ref.title, html: `<p>${esc(ref.text || '')}</p>` };
    return {
      ...formatted,
      pageData
    };
  });

  // Group by section
  const groups = new Map();
  entries.forEach(e => {
    if (!groups.has(e.section)) groups.set(e.section, []);
    groups.get(e.section).push(e);
  });

  // Cover page
  const coverHtml = `
    <div class="print-cover">
      <div class="print-cover-brand-mark">H</div>
      <div class="print-cover-company">HyperLake Internal Documentation</div>
      <h1 class="print-cover-title">${esc(product.brand)}</h1>
      <p class="print-cover-subtitle">Complete Reference Manual & Documentation</p>
      <div class="print-cover-meta">
        <div><strong>Total Pages:</strong> ${entries.length} pages</div>
        <div><strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        <div><strong>Platform:</strong> HyperLake Documentation Platform</div>
      </div>
    </div>
  `;

  // Table of Contents
  let tocCount = 1;
  const tocHtml = `
    <div class="print-toc">
      <h2 class="print-toc-title">Table of Contents</h2>
      ${[...groups].map(([sectionName, items]) => `
        <div class="print-toc-section">
          <h3 class="print-toc-section-title">${esc(sectionName)}</h3>
          <ul class="print-toc-list">
            ${items.map(item => `
              <li class="print-toc-item">
                <span class="print-toc-num">${tocCount++}.</span>
                <span class="print-toc-name">${esc(item.label)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
  `;

  // Chapters
  let chapterIndex = 1;
  const chaptersHtml = [...groups].map(([sectionName, items]) => {
    return items.map(item => {
      const p = item.pageData;
      const displayTitle = (p.title || item.label).replace(/\s+(?:\||—|-)\s+.*documentation.*$/i, '').trim();
      const cleanContent = cleanImportedHtml(p.html || '');
      
      return `
        <section class="print-chapter">
          <div class="print-chapter-header">
            <span class="print-chapter-kicker">${esc(product.brand)} &bull; ${esc(sectionName)}</span>
            <h2 class="print-chapter-title"><span class="print-chapter-number">${chapterIndex++}.</span> ${esc(displayTitle)}</h2>
          </div>
          <div class="doc-body">${cleanContent}</div>
          <div class="print-chapter-footer">
            <span>${esc(product.brand)} Complete Documentation &bull; Chapter ${chapterIndex - 1} of ${entries.length}</span>
            <span>HyperLake Internal</span>
          </div>
        </section>
      `;
    }).join('');
  }).join('');

  return `
    <div class="print-document">
      ${coverHtml}
      ${tocHtml}
      ${chaptersHtml}
    </div>
  `;
}

async function printWholeProduct(product) {
  if (!product) return;
  const totalPages = Object.keys(product.pages).length;
  const progress = showPrintProgress(product.brand, totalPages);

  try {
    progress.update(20, 'Downloading documentation chapters...');
    await loadAllProductPages(product, (pct, status) => {
      progress.update(pct, status);
    });

    progress.update(85, 'Assembling complete print document & table of contents...');
    await new Promise(r => setTimeout(r, 60));

    const printContainer = document.getElementById('print-container') || (() => {
      const el = document.createElement('div');
      el.id = 'print-container';
      document.body.appendChild(el);
      return el;
    })();

    printContainer.innerHTML = compileProductPrintHtml(product);

    progress.update(100, 'Opening print dialog...');
    await new Promise(r => setTimeout(r, 120));

    document.body.classList.add('printing-entire-product');
    progress.close();

    window.print();

    const cleanup = () => {
      document.body.classList.remove('printing-entire-product');
      printContainer.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);
  } catch (err) {
    console.error('Error generating print document:', err);
    progress.close();
    showToast('Failed to generate print document');
  }
}

function renderSidebar(product, active) {
  if (!product) {
    sidebar.innerHTML = '';
    return;
  }
  const entries = Object.entries(product.pages).map(([route, ref]) => formatSidebarEntry(route, ref, product));
  const groups = new Map();
  entries.forEach(e => {
    if (!groups.has(e.section)) groups.set(e.section, []);
    groups.get(e.section).push(e);
  });

  const activeEntry = entries.find(e => e.route === active);
  const activeSection = activeEntry?.section || 'Overview';

  const sections = [...groups].map(([sectionName, items]) => {
    const isExpanded = (sectionName === activeSection) || groups.size <= 3;
    return `
      <section class="side-section ${isExpanded ? 'is-open' : ''}">
        <button class="side-section-toggle" type="button" aria-expanded="${isExpanded}">
          <span class="side-section-title">${esc(sectionName)}</span>
          <span class="side-section-badge">${items.length}</span>
          <svg class="side-section-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
        <div class="side-section-list" ${isExpanded ? '' : 'hidden'}>
          ${items.map(item => `
            <a class="side-link${item.route === active ? ' active' : ''}" href="${hrefFor(item.route)}" data-route="${item.route}">${esc(item.label)}</a>
          `).join('')}
        </div>
      </section>
    `;
  }).join('');

  sidebar.innerHTML = `
    <div class="sidebar-inner">
      <p class="side-kicker">Product docs</p>
      <div class="side-title">${esc(product.brand)}</div>
      <div class="side-actions">
        <button class="side-print-btn" type="button" id="side-print-product-btn" title="Generate and print all pages of ${esc(product.brand)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          <span>Print All (${Object.keys(product.pages).length} pages)</span>
        </button>
      </div>
      ${sections}
    </div>
  `;
  
  // Bind sidebar section toggle clicks
  sidebar.querySelectorAll('.side-section-toggle').forEach(btn => {
    btn.onclick = () => {
      const sec = btn.closest('.side-section');
      const list = sec.querySelector('.side-section-list');
      const open = sec.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      if (open) {
        list.removeAttribute('hidden');
      } else {
        list.setAttribute('hidden', 'true');
      }
    };
  });

  // Bind sidebar print product click
  const sidePrintBtn = sidebar.querySelector('#side-print-product-btn');
  if (sidePrintBtn) {
    sidePrintBtn.onclick = () => printWholeProduct(product);
  }

  // Scroll active sidebar item into view
  const activeLink = sidebar.querySelector('.side-link.active');
  if (activeLink) {
    activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

const PRODUCT_METADATA = {
  hyperstream:  { abbr: 'HS', color: '#2563eb', category: 'Streaming',   desc: 'Distributed event streaming and Kafka broker management with Connect and Streams APIs.' },
  hyperbatch:   { abbr: 'HB', color: '#e11d48', category: 'Computation',  desc: 'Large-scale analytics engine with SQL, PySpark, DataFrames, MLlib, and GraphX.' },
  hypervault:   { abbr: 'HV', color: '#059669', category: 'Security',     desc: 'Centralized security, role-based access policies, column masking, and audit logging.' },
  hyperbi:      { abbr: 'BI', color: '#0891b2', category: 'Analytics',    desc: 'Visual analytics platform with interactive dashboards, SQL Lab, and 40+ database connectors.' },
  hypergrid:    { abbr: 'HG', color: '#7c3aed', category: 'Streaming',    desc: 'Stateful stream processing with low-latency event-driven apps and complex event processing.' },
  hyperhouse:   { abbr: 'HH', color: '#d97706', category: 'Storage',      desc: 'Columnar database for real-time analytical queries at petabyte scale.' },
  hypersync:    { abbr: 'HC', color: '#0284c7', category: 'Integration',  desc: 'Dataflow orchestration, automated routing, transformation, and system integration.' },
  hypergovern:  { abbr: 'GO', color: '#4f46e5', category: 'Governance',   desc: 'Data governance, metadata management, classification, and end-to-end lineage.' },
  hypermdm:     { abbr: 'MD', color: '#0d9488', category: 'Management',   desc: 'Master data management, deduplication, identity resolution, and golden records.' },
  hypercdc:     { abbr: 'CD', color: '#b45309', category: 'Streaming',    desc: 'Low-latency change data capture streaming row-level mutations into Kafka.' },
  hypericeberg: { abbr: 'HI', color: '#3b82f6', category: 'Storage',      desc: 'Open table format for large analytic datasets with ACID transactions and time travel.' },
};

function renderHome() {
  // Enter portal mode: hide sidebar, make content full-width
  const layoutEl = document.querySelector('.layout') || document.getElementById('app');
  if (layoutEl) layoutEl.classList.add('portal-mode');
  if (sidebar) sidebar.innerHTML = '';
  updateProductPickerLabel(null);

  const totalPages = manifest.products.reduce((acc, p) => acc + Object.keys(p.pages).length, 0);

  app.innerHTML = `
    <div class="ph-wrap">

      <!-- Hero -->
      <section class="ph-hero">
        <p class="ph-eyebrow">HYPERLAKE DOCUMENTATION</p>
        <h1 class="ph-title">Everything you need<br>to build with HyperLake</h1>
        <p class="ph-sub">Technical guides, API references, and operator manuals for every platform component.</p>
        <div class="ph-stats">
          <div class="ph-stat"><strong>${manifest.products.length}</strong><span>Products</span></div>
          <div class="ph-stat-div"></div>
          <div class="ph-stat"><strong>${totalPages.toLocaleString()}</strong><span>Pages</span></div>
        </div>

      </section>

      <!-- Cards -->
      <section class="ph-section">
        <div class="ph-grid">
          ${manifest.products.map(p => {
            const meta = PRODUCT_METADATA[p.id] || { abbr: p.id.slice(0,2).toUpperCase(), color: '#146ef5', category: 'Platform', desc: 'Documentation and reference guide.' };
            const pageCount = Object.keys(p.pages).length;
            return `
              <a class="ph-card" href="${hrefFor(p.id)}">
                <div class="ph-card-head">
                  <div class="ph-mark" style="background:${meta.color}">${esc(meta.abbr)}</div>
                  <span class="ph-cat">${esc(meta.category).toUpperCase()}</span>
                </div>
                <h3 class="ph-name">${esc(p.brand)}</h3>
                <p class="ph-desc">${esc(meta.desc)}</p>
                <div class="ph-foot">
                  <span class="ph-pages">${pageCount.toLocaleString()} pages</span>
                  <span class="ph-arr">→</span>
                </div>
              </a>
            `;
          }).join('')}
        </div>
      </section>

    </div>
  `;

  document.title = 'HyperLake Documentation';
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function teardownPortalMode() {
  const layoutEl = document.querySelector('.layout') || document.getElementById('app');
  if (layoutEl) layoutEl.classList.remove('portal-mode');
}

async function renderRoute() {
  const route = pathRoute();
  if (!route) return renderHome();
  // Leaving home — restore sidebar+content layout if needed
  teardownPortalMode();
  const pureRoute = route.split('#')[0];
  const hash = location.hash;
  const lastHashIdx = hash.lastIndexOf('#');
  const sectionId = (lastHashIdx > 1) ? hash.slice(lastHashIdx + 1) : (hash.startsWith('#') && !hash.startsWith('#/') ? hash.slice(1) : '');
  
  const product = productFor(pureRoute);
  if (!product) {
    updateProductPickerLabel(null);
    renderSidebar(null, '');
    app.innerHTML = `<section class="hero"><h1>Page not found</h1><p>The requested documentation page could not be found.</p><p><a href="${hrefFor('')}">← Return to all products</a></p></section>`;
    return;
  }
  
  updateProductPickerLabel(product);
  
  const page = await getPage(product, pureRoute);
  if (!page) {
    renderSidebar(product, '');
    app.innerHTML = `<section class="hero"><h1>Page not found</h1><p>The requested documentation page could not be found.</p><p><a href="${hrefFor('')}">← Return to all products</a></p></section>`;
    return;
  }
  
  const displayTitle = page.title.replace(/\s+(?:\||—|-)\s+.*documentation.*$/i, '').trim();
  renderSidebar(product, page.route);
  
  app.innerHTML = `
    <article class="doc">
      <div class="doc-header">
        <div class="doc-header-main">
          <p class="eyebrow">${esc(product.brand)}</p>
          <h1>${esc(displayTitle || page.title)}</h1>
        </div>
        <div class="doc-actions-bar">
          <button class="doc-action-btn" type="button" id="doc-print-page-btn" title="Print this single page">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            <span>Print page</span>
          </button>
          <button class="doc-action-btn doc-action-primary" type="button" id="doc-print-product-btn" title="Assemble and print all ${Object.keys(product.pages).length} pages of ${esc(product.brand)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            <span>Print entire product</span>
          </button>
          <button class="doc-action-btn" type="button" id="doc-copy-page-btn" title="Copy page text to clipboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy text</span>
          </button>
        </div>
      </div>
      <div class="doc-body">${cleanImportedHtml(page.html)}</div>
      <div class="doc-footer">
        <span>HyperLake Documentation &bull; ${esc(product.brand)}</span>
      </div>
    </article>
  `;
  
  bindDocumentControls();
  document.title = `${page.title} — ${product.brand}`;
  
  // Rewrite legacy doc links in imported content
  app.querySelectorAll('a[href]').forEach(a => {
    const h = a.getAttribute('href') || '';
    if (h.startsWith('/internal-docs/')) {
      a.setAttribute('href', hrefFor(h.replace('/internal-docs/', '')));
    } else if (h.startsWith('#/internal-docs/')) {
      a.setAttribute('href', hrefFor(h.replace('#/internal-docs/', '')));
    }
  });

  // Scroll to hash target if provided
  if (sectionId) {
    const targetEl = document.getElementById(sectionId) || document.getElementsByName(sectionId)[0] || app.querySelector(`[id="${CSS.escape(sectionId)}"]`);
    if (targetEl) {
      setTimeout(() => {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        targetEl.classList.add('anchor-highlight');
        setTimeout(() => targetEl.classList.remove('anchor-highlight'), 1200);
      }, 50);
    }
  } else {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

// Global click delegator for in-page anchors and SPA internal links
document.addEventListener('click', e => {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  
  // Ignore external links, mailto, tel, downloads, or target="_blank"
  if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:') || /^https?:\/\//i.test(href) || a.target === '_blank') {
    return;
  }
  if (a.closest('.page-action-btn') || a.closest('.code-copy-btn')) return;

  // 1. In-page anchor link (e.g. href="#features" or href="#_interner_metrics")
  if (href.startsWith('#') && !href.startsWith('#/')) {
    e.preventDefault();
    const id = href.replace(/^#/, '');
    if (!id) return;
    const target = document.getElementById(id) || document.getElementsByName(id)[0] || app.querySelector(`[id="${CSS.escape(id)}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('anchor-highlight');
      setTimeout(() => target.classList.remove('anchor-highlight'), 1200);
      const currentRoute = pathRoute();
      if (currentRoute) {
        history.replaceState(null, '', `${hrefFor(currentRoute)}#${id}`);
      }
    }
    return;
  }

  // 2. SPA internal link navigation
  e.preventDefault();
  
  let targetUrl = href;
  if (targetUrl === '#/' || targetUrl === './' || targetUrl === '.' || targetUrl === '/') {
    targetUrl = hrefFor('');
  } else if (targetUrl.startsWith('#/internal-docs/')) {
    targetUrl = hrefFor(targetUrl.replace('#/internal-docs/', ''));
  } else if (targetUrl.startsWith('#/')) {
    targetUrl = hrefFor(targetUrl.replace('#/', ''));
  } else if (targetUrl.startsWith('/internal-docs/')) {
    targetUrl = hrefFor(targetUrl.replace('/internal-docs/', ''));
  } else if (!targetUrl.startsWith('/')) {
    targetUrl = hrefFor(targetUrl);
  }

  const [routeAndQuery, hashPart] = targetUrl.split('#');
  
  if (location.pathname + location.search !== routeAndQuery) {
    history.pushState(null, '', targetUrl);
    renderRoute();
    if (!hashPart) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  } else if (hashPart) {
    const target = document.getElementById(hashPart) || document.getElementsByName(hashPart)[0] || app.querySelector(`[id="${CSS.escape(hashPart)}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('anchor-highlight');
      setTimeout(() => target.classList.remove('anchor-highlight'), 1200);
      history.replaceState(null, '', targetUrl);
    }
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

/* ==========================================================================
   Product Picker Dropdown
   ========================================================================== */

function initProductPicker() {
  const trigger = document.querySelector('#product-picker-trigger');
  const menu = document.querySelector('#product-picker-menu');
  if (!trigger || !menu) return;

  menu.innerHTML = manifest.products.map(p => `
    <a class="product-picker-item" href="${hrefFor(p.id)}" data-product="${p.id}">
      <span>${esc(p.brand)}</span>
      <span class="product-picker-badge">${Object.keys(p.pages).length} pages</span>
    </a>
  `).join('');

  trigger.onclick = e => {
    e.stopPropagation();
    const open = !menu.hasAttribute('hidden');
    if (open) {
      menu.setAttribute('hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      menu.removeAttribute('hidden');
      trigger.setAttribute('aria-expanded', 'true');
    }
  };

  document.addEventListener('click', e => {
    if (!trigger.contains(e.target) && !menu.contains(e.target)) {
      menu.setAttribute('hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  menu.querySelectorAll('.product-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      menu.setAttribute('hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
    });
  });
}

function updateProductPickerLabel(product) {
  const label = document.querySelector('#current-product-name');
  const menu = document.querySelector('#product-picker-menu');
  if (label) {
    label.textContent = product ? product.brand : 'All Products';
  }
  if (menu) {
    menu.querySelectorAll('.product-picker-item').forEach(item => {
      const isCurrent = product && item.dataset.product === product.id;
      item.classList.toggle('active', isCurrent);
    });
  }
}

/* ==========================================================================
   Modern Floating Search Palette & Keyboard Navigation
   ========================================================================== */

let selectedSearchIndex = -1;
const searchDropdown = document.querySelector('#search-dropdown');
const searchDropdownList = document.querySelector('#search-dropdown-list');
const searchResultsCount = document.querySelector('#search-results-count');
const searchClearBtn = document.querySelector('#search-clear-btn');
const searchKbdBadge = document.querySelector('#search-kbd-badge');

if (searchKbdBadge && (navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac'))) {
  searchKbdBadge.innerHTML = '<kbd>⌘</kbd><kbd>K</kbd>';
}

function highlightMatches(text, query) {
  if (!query) return esc(text);
  const qClean = query.trim();
  if (!qClean) return esc(text);
  const regex = new RegExp(`(${qClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return esc(text).replace(regex, '<mark>$1</mark>');
}

function extractSnippet(text, query, maxLen = 140) {
  const pureText = (text || '').replace(/\s+/g, ' ').trim();
  if (!query) return esc(pureText.slice(0, maxLen));
  const idx = pureText.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return esc(pureText.slice(0, maxLen));
  
  const start = Math.max(0, idx - 35);
  const end = Math.min(pureText.length, idx + query.length + 85);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < pureText.length ? ' …' : '';
  const snippet = pureText.slice(start, end);
  return `${prefix}${highlightMatches(snippet, query)}${suffix}`;
}

function closeSearchDropdown() {
  if (searchDropdown) searchDropdown.setAttribute('hidden', 'true');
  selectedSearchIndex = -1;
}

function openSearchDropdown() {
  if (searchDropdown) searchDropdown.removeAttribute('hidden');
}

function performSearch() {
  const q = search.value.trim();
  if (searchClearBtn) {
    searchClearBtn.hidden = !q;
  }
  
  if (!q) {
    closeSearchDropdown();
    return;
  }

  const queryLower = q.toLowerCase();
  selectedSearchIndex = -1;
  const hits = [];

  for (const p of manifest.products) {
    for (const [route, ref] of Object.entries(p.pages)) {
      const matchInTitle = ref.title.toLowerCase().includes(queryLower);
      const matchInText = (ref.text || '').toLowerCase().includes(queryLower);
      if (matchInTitle || matchInText) {
        hits.push({
          product: p,
          route,
          title: ref.title,
          text: ref.text,
          matchInTitle
        });
      }
    }
  }

  // Sort matches so title matches appear first
  hits.sort((a, b) => (b.matchInTitle ? 1 : 0) - (a.matchInTitle ? 1 : 0));

  if (searchResultsCount) {
    searchResultsCount.textContent = `${hits.length} result${hits.length === 1 ? '' : 's'} found`;
  }

  if (!hits.length) {
    searchDropdownList.innerHTML = `
      <div class="search-empty-state">
        <p>No documentation found matching "<strong>${esc(q)}</strong>".</p>
      </div>
    `;
    openSearchDropdown();
    return;
  }

  const topHits = hits.slice(0, 30);
  searchDropdownList.innerHTML = topHits.map((hit, idx) => `
    <a class="search-item" href="${hrefFor(hit.route)}" data-route="${hit.route}" data-index="${idx}">
      <div class="search-item-top">
        <span class="search-item-title">${highlightMatches(hit.title, q)}</span>
        <span class="search-item-badge">${esc(hit.product.brand)}</span>
      </div>
      <div class="search-item-snippet">${extractSnippet(hit.text, q)}</div>
    </a>
  `).join('');

  searchDropdownList.querySelectorAll('.search-item').forEach(item => {
    item.addEventListener('click', () => {
      search.value = '';
      if (searchClearBtn) searchClearBtn.hidden = true;
      closeSearchDropdown();
    });
  });

  openSearchDropdown();
}

search.addEventListener('input', performSearch);
search.addEventListener('focus', () => {
  if (search.value.trim()) {
    performSearch();
  }
});

if (searchClearBtn) {
  searchClearBtn.onclick = () => {
    search.value = '';
    searchClearBtn.hidden = true;
    closeSearchDropdown();
    search.focus();
  };
}

document.addEventListener('click', e => {
  if (search && searchDropdown && !search.contains(e.target) && !searchDropdown.contains(e.target)) {
    closeSearchDropdown();
  }
});

document.addEventListener('keydown', event => {
  // Focus search with ⌘K / Ctrl+K
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    search.focus();
    search.select();
    if (search.value.trim()) performSearch();
    return;
  }

  // Escape clears search and closes dropdown
  if (event.key === 'Escape') {
    if (searchDropdown && !searchDropdown.hasAttribute('hidden')) {
      closeSearchDropdown();
      search.blur();
    } else if (search.value) {
      search.value = '';
      if (searchClearBtn) searchClearBtn.hidden = true;
      closeSearchDropdown();
      search.blur();
    }
    return;
  }

  // Keyboard navigation in search results
  if (searchDropdown && !searchDropdown.hasAttribute('hidden')) {
    const items = Array.from(searchDropdownList.querySelectorAll('.search-item'));
    if (items.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectedSearchIndex = (selectedSearchIndex + 1) % items.length;
        updateSearchSelection(items);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectedSearchIndex = (selectedSearchIndex - 1 + items.length) % items.length;
        updateSearchSelection(items);
      } else if (event.key === 'Enter' && selectedSearchIndex >= 0) {
        event.preventDefault();
        items[selectedSearchIndex]?.click();
        search.value = '';
        if (searchClearBtn) searchClearBtn.hidden = true;
        closeSearchDropdown();
      }
    }
  }
});

function updateSearchSelection(items) {
  items.forEach((item, i) => {
    if (i === selectedSearchIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

window.addEventListener('popstate', renderRoute);
window.addEventListener('hashchange', renderRoute);

// Initialize application
manifest = await fetch(`${getBasePath()}/data/manifest.json?v=1.0.4`).then(r => r.json());
initProductPicker();
renderRoute();
