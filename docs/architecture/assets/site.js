/**
 * Site navigation, sidebar behavior, TOC generator, zoom/tree controls, and theme toggling
 */

(() => {
  // Safe storage wrapper for file:// or restricted environments
  const storage = {
    get(key, fallback = null) {
      try {
        const val = localStorage.getItem(key);
        return val !== null ? JSON.parse(val) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch (e) {
        // Ignored
      }
    }
  };

  const rootPrefix = document.body.dataset.root || './';
  const currentPage = document.body.dataset.page || '';

  /* ==========================================================================
     Theme Handling
     ========================================================================== */
  const initTheme = () => {
    const savedTheme = storage.get('docs_theme', 'auto');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      const updateBtnText = () => {
        const current = document.documentElement.getAttribute('data-theme') || 'auto';
        themeBtn.textContent = current === 'dark' ? '🌙 Dark' : current === 'light' ? '☀️ Light' : '🌓 Auto';
      };
      updateBtnText();

      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'auto';
        let next = 'dark';
        if (current === 'dark') next = 'light';
        else if (current === 'light') next = 'auto';

        if (next === 'auto') {
          document.documentElement.removeAttribute('data-theme');
          storage.set('docs_theme', 'auto');
        } else {
          document.documentElement.setAttribute('data-theme', next);
          storage.set('docs_theme', next);
        }
        updateBtnText();
      });
    }
  };

  /* ==========================================================================
     Build Sidebar Navigation & TOC
     ========================================================================== */
  const renderSidebar = () => {
    const sidebarEl = document.getElementById('site-sidebar');
    if (!sidebarEl || !window.DOCS_NAV) return;

    let collapsedGroups = storage.get('docs_collapsed_groups', []);
    if (!Array.isArray(collapsedGroups)) collapsedGroups = [];

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Documentation');

    // Flatten for prev/next navigation
    const allItems = [];

    window.DOCS_NAV.forEach((group, gIdx) => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'nav-group';

      const containsCurrent = group.items.some(item => item.path === currentPage);
      let isCollapsed = collapsedGroups.includes(group.group);
      // The group containing the active page always starts expanded
      if (containsCurrent) {
        isCollapsed = false;
      }

      if (isCollapsed) {
        groupDiv.classList.add('collapsed');
      }

      const groupId = `nav-group-${gIdx}`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-group-btn';
      btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      btn.setAttribute('aria-controls', groupId);
      btn.innerHTML = `<span>${group.group}</span><span class="nav-group-icon">▼</span>`;

      btn.addEventListener('click', () => {
        const collapsed = groupDiv.classList.toggle('collapsed');
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

        let currentCollapsed = storage.get('docs_collapsed_groups', []);
        if (!Array.isArray(currentCollapsed)) currentCollapsed = [];
        if (collapsed) {
          if (!currentCollapsed.includes(group.group)) currentCollapsed.push(group.group);
        } else {
          currentCollapsed = currentCollapsed.filter(g => g !== group.group);
        }
        storage.set('docs_collapsed_groups', currentCollapsed);
      });

      const list = document.createElement('ul');
      list.className = 'nav-list';
      list.id = groupId;

      group.items.forEach(item => {
        allItems.push(item);
        const li = document.createElement('li');
        li.className = 'nav-item';

        const isCurrent = (item.path === currentPage);
        if (isCurrent) {
          li.classList.add('active');
        }

        const a = document.createElement('a');
        a.className = 'nav-link';
        a.href = rootPrefix + item.path;
        a.textContent = item.title;
        if (isCurrent) {
          a.setAttribute('aria-current', 'page');
        }

        li.appendChild(a);

        if (isCurrent) {
          updateOnPageToc(currentPage);
        }

        list.appendChild(li);
      });

      groupDiv.appendChild(btn);
      groupDiv.appendChild(list);
      nav.appendChild(groupDiv);
    });

    sidebarEl.innerHTML = '';
    sidebarEl.appendChild(nav);

    // Initial On-Page TOC population
    updateOnPageToc(currentPage);

    // Render Prev / Next footer links
    renderPrevNext(allItems);
  };

  /* ==========================================================================
     On-Page Table of Contents (TOC) Builder
     ========================================================================== */
  const updateOnPageToc = (targetPage = currentPage) => {
    // Remove existing on-page TOCs
    document.querySelectorAll('.on-page-nav').forEach(el => el.remove());

    const activeLink = document.querySelector(`.site-sidebar a.nav-link[href*="${targetPage}"]`);
    if (!activeLink) return;
    const activeLi = activeLink.closest('.nav-item');
    if (!activeLi) return;

    // Search active view if in standalone mode, otherwise standard main
    const activeContainer = document.querySelector('.archdoc-page-view.active') || document.querySelector('main');
    if (!activeContainer) return;

    const headings = activeContainer.querySelectorAll('h2[id], section[id] > h2, .wrap h2[id]');
    const seen = new Set();
    const uniqueHeadings = [];
    headings.forEach(h => {
      const targetId = h.id || (h.closest('section[id]') ? h.closest('section[id]').id : null);
      if (targetId && !seen.has(targetId)) {
        seen.add(targetId);
        uniqueHeadings.push({ el: h, id: targetId });
      }
    });

    if (uniqueHeadings.length > 0) {
      const tocList = document.createElement('ul');
      tocList.className = 'on-page-nav';
      tocList.setAttribute('aria-label', 'On this page');

      uniqueHeadings.forEach(({ el: h2, id: targetId }) => {
        const hLi = document.createElement('li');
        const hA = document.createElement('a');
        hA.className = 'on-page-link';
        hA.href = `#${targetId}`;
        hA.textContent = h2.textContent.replace(/^#\s*/, '').trim();
        hLi.appendChild(hA);
        tocList.appendChild(hLi);
      });

      activeLi.appendChild(tocList);
    }
  };

  window.__ARCHDOC_UPDATE_TOC__ = updateOnPageToc;

  /* ==========================================================================
     Previous / Next Page Links
     ========================================================================== */
  const renderPrevNext = (allItems) => {
    const wrap = document.querySelector('.wrap');
    if (!wrap || allItems.length === 0) return;

    const currIdx = allItems.findIndex(it => it.path === currentPage);
    if (currIdx === -1) return;

    const prevItem = currIdx > 0 ? allItems[currIdx - 1] : null;
    const nextItem = currIdx < allItems.length - 1 ? allItems[currIdx + 1] : null;

    if (!prevItem && !nextItem) return;

    // Check if nav already exists
    let navEl = wrap.querySelector('.page-nav');
    if (!navEl) {
      navEl = document.createElement('nav');
      navEl.className = 'page-nav';
      navEl.setAttribute('aria-label', 'Page navigation');
      wrap.appendChild(navEl);
    } else {
      navEl.innerHTML = '';
    }

    if (prevItem) {
      const pLink = document.createElement('a');
      pLink.className = 'page-nav-link prev';
      pLink.href = rootPrefix + prevItem.path;
      pLink.innerHTML = `<span class="page-nav-sub">← Previous</span><span class="page-nav-title">${prevItem.title}</span>`;
      navEl.appendChild(pLink);
    } else {
      // Empty placeholder to maintain flex spacing
      const emptyDiv = document.createElement('div');
      navEl.appendChild(emptyDiv);
    }

    if (nextItem) {
      const nLink = document.createElement('a');
      nLink.className = 'page-nav-link next';
      nLink.href = rootPrefix + nextItem.path;
      nLink.innerHTML = `<span class="page-nav-sub">Next →</span><span class="page-nav-title">${nextItem.title}</span>`;
      navEl.appendChild(nLink);
    }
  };

  /* ==========================================================================
     Sidebar Toggle & Drawer Controls
     ========================================================================== */
  const initSidebarToggle = () => {
    const toggleBtn = document.getElementById('sidebar-toggle');
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (!toggleBtn) return;

    const isMobile = () => window.innerWidth <= 900;

    // Restore desktop preference
    const desktopCollapsed = storage.get('docs_sidebar_collapsed', false);
    if (desktopCollapsed && !isMobile()) {
      document.body.classList.add('sidebar-collapsed');
      toggleBtn.setAttribute('aria-expanded', 'false');
    } else {
      toggleBtn.setAttribute('aria-expanded', 'true');
    }

    const toggle = () => {
      if (isMobile()) {
        const isOpen = document.body.classList.toggle('sidebar-open');
        toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      } else {
        const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
        toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        storage.set('docs_sidebar_collapsed', isCollapsed);
      }
    };

    toggleBtn.addEventListener('click', toggle);

    if (backdrop) {
      backdrop.addEventListener('click', () => {
        document.body.classList.remove('sidebar-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      });
    }

    // Close mobile drawer upon navigating to an on-page anchor link
    document.addEventListener('click', (e) => {
      const link = e.target.closest('.on-page-link, .nav-link');
      if (link && isMobile()) {
        document.body.classList.remove('sidebar-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  };

  /* ==========================================================================
     Diagram Zoom & Full-screen Controls (Supports .fig and .figure-container)
     ========================================================================== */
  const initDiagramControls = () => {
    const clamp = (v) => Math.min(4, Math.max(0.5, v));

    document.querySelectorAll('.fig, .figure-container').forEach((f) => {
      const svg = f.querySelector('svg');
      if (!svg) return;
      const base = +svg.dataset.w || (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) || 960;
      const val = f.querySelector('.z-val');
      const tools = f.querySelector('.fig-tools, .figure-actions, .figure-header');
      if (!tools) return;

      let z = null;

      const apply = () => {
        if (z === null) {
          svg.style.width = '100%';
          svg.style.minWidth = '';
          if (val) val.textContent = 'Fit';
        } else {
          svg.style.width = (base * z) + 'px';
          svg.style.minWidth = (base * z) + 'px';
          if (val) val.textContent = Math.round(z * 100) + '%';
        }
      };

      tools.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-z], button[data-action], .fig-btn');
        if (!b) return;
        const cur = z === null ? svg.getBoundingClientRect().width / base : z;
        const rawAction = b.dataset.z || b.dataset.action;
        let a = rawAction;
        if (rawAction === 'zoom-in') a = 'in';
        else if (rawAction === 'zoom-out') a = 'out';
        else if (rawAction === 'reset') a = 'fit';

        if (a === 'in') z = clamp(Math.round((cur + 0.25) * 4) / 4);
        if (a === 'out') z = clamp(Math.round((cur - 0.25) * 4) / 4);
        if (a === 'fit') z = null;
        if (a === 'full') {
          const on = f.classList.toggle('is-full');
          b.textContent = on ? 'Close' : 'Full screen';
          b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
        }
        apply();
      });


      apply();
    });
  };

  /* ==========================================================================
     File Tree Controls
     ========================================================================== */
  const initTreeControls = () => {
    const t = document.getElementById('trees');
    if (!t) return;

    let size = 13;
    const tools = t.querySelector('.tools');
    if (!tools) return;

    tools.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-t]');
      if (!b) return;
      const a = b.dataset.t;
      if (a === 'in') size = Math.min(22, size + 1);
      if (a === 'out') size = Math.max(10, size - 1);
      if (a === 'open' || a === 'close') {
        t.querySelectorAll('details').forEach((d) => {
          d.open = (a === 'open');
        });
      }
      if (a === 'full') {
        const on = t.classList.toggle('is-full');
        b.textContent = on ? 'Close' : 'Full screen';
      }
      t.style.setProperty('--tree-size', size + 'px');
    });
  };

  /* ==========================================================================
     Global Keyboard Handling (Escape)
     ========================================================================== */
  const initKeyHandlers = () => {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Exit any full-screen elements
        document.querySelectorAll('.is-full').forEach((el) => {
          el.classList.remove('is-full');
          const b = el.querySelector('[data-z="full"], [data-t="full"]');
          if (b) b.textContent = 'Full screen';
        });

        // Close mobile sidebar
        if (document.body.classList.contains('sidebar-open')) {
          document.body.classList.remove('sidebar-open');
          const toggleBtn = document.getElementById('sidebar-toggle');
          if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        }
      }
    });
  };

  /* ==========================================================================
     Execution Plans, Task Checkboxes & Live Status Tracking
     ========================================================================== */
  const initStepTracking = () => {
    const badges = document.querySelectorAll('[data-step-status]');
    const checks = document.querySelectorAll('.task-check');
    if (!badges.length && !checks.length) return;

    const STORE_KEY = 'docs_step_states';
    const TASK_KEY = 'docs_task_states';
    const STATES = ['not-started', 'in-progress', 'done'];
    const STATE_LABELS = { 'not-started': 'Not started', 'in-progress': 'In progress', 'done': 'Done' };
    const STATE_CLASSES = { 'not-started': 'st-not-started', 'in-progress': 'st-in-progress', 'done': 'st-done' };

    let stepStates = storage.get(STORE_KEY, {});
    let taskStates = storage.get(TASK_KEY, {});

    const getStepState = (step, badge) => {
      if (stepStates[step]) return stepStates[step];
      if (badge && (badge.classList.contains('st-done') || badge.textContent.includes('Done'))) return 'done';
      return 'not-started';
    };

    const renderBadge = (badge) => {
      const step = badge.dataset.stepStatus;
      const state = getStepState(step, badge);
      badge.className = 'status-badge ' + STATE_CLASSES[state];
      badge.textContent = STATE_LABELS[state];

      const item = badge.closest('.step-item');
      if (item) item.classList.toggle('is-done', state === 'done');
    };

    const updateDashboard = () => {
      const allSteps = document.querySelectorAll('[data-step]');
      if (!allSteps.length) return;

      const total = allSteps.length;
      let done = 0;
      allSteps.forEach(el => {
        const id = el.dataset.step;
        const badge = el.querySelector('[data-step-status]');
        if (getStepState(id, badge) === 'done') done++;
      });

      const todo = total - done;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;

      const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setTxt('dash-total', total);
      setTxt('dash-done', done);
      setTxt('dash-todo', todo);
      setTxt('dash-pct', pct + '%');

      const pFill = document.getElementById('progress-fill');
      if (pFill) pFill.style.width = pct + '%';
      setTxt('progress-text', `${done} of ${total} steps completed`);
    };

    badges.forEach(badge => {
      renderBadge(badge);
      badge.addEventListener('click', () => {
        const step = badge.dataset.stepStatus;
        const current = stepStates[step] || 'not-started';
        const nextIdx = (STATES.indexOf(current) + 1) % STATES.length;
        stepStates[step] = STATES[nextIdx];
        storage.set(STORE_KEY, stepStates);
        renderBadge(badge);
        updateDashboard();
      });
    });

    checks.forEach(cb => {
      const id = cb.dataset.task;
      if (id && taskStates[id]) cb.checked = true;
      cb.addEventListener('change', () => {
        if (id) {
          taskStates[id] = cb.checked;
          storage.set(TASK_KEY, taskStates);
        }
      });
    });

    updateDashboard();
  };

  /* ==========================================================================
     Lightweight Syntax Highlighting (Zero-Dependency)
     ========================================================================== */
  const escapeHtml = (str) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const highlightCodeBlock = (codeEl) => {
    if (codeEl.dataset.highlighted === 'true') return;
    const pre = codeEl.closest('pre');
    if (pre && (pre.classList.contains('tree') || pre.classList.contains('no-highlight'))) return;

    const raw = codeEl.textContent;
    if (!raw.trim()) return;

    // Master syntax token regex:
    // 1: Comments (//..., #..., /*...*/)
    // 2: Strings ("...", '...', `...`)
    // 3: Numbers (\b\d+(\.\d+)?\b)
    // 4: Keywords
    // 5: Types / Booleans / Nulls
    const tokenRegex = /(\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|#[^\r\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|(\b(?:def|class|function|const|let|var|return|if|else|elif|for|while|import|from|export|async|await|try|except|catch|finally|throw|raise|switch|case|break|continue|new|in|is|lambda|type|struct|interface|select|from|where|insert|into|update|delete|join|create|table|drop|alter|group|by|order|limit|sudo|curl|docker|git|python|python3)\b)|(\b(?:true|false|null|undefined|None|True|False|nil|int|str|float|bool|string|boolean)\b)/gi;

    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(raw)) !== null) {
      if (match.index > lastIndex) {
        result += escapeHtml(raw.slice(lastIndex, match.index));
      }

      const [full, comment, str, num, kw, typeVal] = match;

      if (comment) {
        result += `<span class="tok-com">${escapeHtml(comment)}</span>`;
      } else if (str) {
        const nextChars = raw.slice(match.index + full.length, match.index + full.length + 3);
        if (/^\s*:/.test(nextChars)) {
          result += `<span class="tok-prop">${escapeHtml(str)}</span>`;
        } else {
          result += `<span class="tok-str">${escapeHtml(str)}</span>`;
        }
      } else if (num) {
        result += `<span class="tok-num">${escapeHtml(num)}</span>`;
      } else if (kw) {
        result += `<span class="tok-kw">${escapeHtml(kw)}</span>`;
      } else if (typeVal) {
        result += `<span class="tok-type">${escapeHtml(typeVal)}</span>`;
      }

      lastIndex = match.index + full.length;
    }

    if (lastIndex < raw.length) {
      result += escapeHtml(raw.slice(lastIndex));
    }

    codeEl.innerHTML = result;
    codeEl.dataset.highlighted = 'true';
  };

  const initSyntaxHighlighting = () => {
    document.querySelectorAll('pre:not(.tree) code').forEach(highlightCodeBlock);
  };

  /* ==========================================================================
     Code Block Copy Buttons
     ========================================================================== */
  const initCopyButtons = () => {
    document.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.copy-btn')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');

      btn.addEventListener('click', async () => {
        const code = pre.querySelector('code');
        const text = code ? code.innerText : pre.innerText;
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 2000);
        } catch (err) {
          btn.textContent = 'Error';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        }
      });

      pre.appendChild(btn);
    });
  };

  /* ==========================================================================
     Command Palette & Navigation Search (Cmd + K)
     ========================================================================== */
  const initSearchModal = () => {
    if (!window.DOCS_NAV) return;

    const headerRight = document.querySelector('.site-header-right');
    let trigger = document.getElementById('search-trigger');
    if (headerRight && !trigger) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.id = 'search-trigger';
      trigger.className = 'search-trigger';
      trigger.innerHTML = '<span>Search</span> <kbd>⌘K</kbd>';
      trigger.setAttribute('aria-label', 'Search documentation');
      headerRight.insertBefore(trigger, headerRight.firstChild);
    }

    let backdrop = document.getElementById('search-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'search-backdrop';
      backdrop.className = 'search-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.innerHTML = `
        <div class="search-dialog" role="dialog" aria-modal="true" aria-label="Search Documentation">
          <div class="search-input-wrap">
            <span style="color:var(--muted)">🔍</span>
            <input type="text" id="search-input" placeholder="Search pages, topics, architecture..." autocomplete="off">
          </div>
          <ul class="search-results" id="search-results"></ul>
          <div class="search-footer">
            <span>Navigate: ↑ ↓</span>
            <span>Select: ↵</span>
            <span>Close: ESC</span>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
    }

    const input = document.getElementById('search-input');
    const resultsList = document.getElementById('search-results');
    let selectedIdx = 0;
    let filteredItems = [];

    const allItems = [];
    window.DOCS_NAV.forEach(group => {
      group.items.forEach(item => {
        allItems.push({ ...item, group: group.group });
      });
    });

    const renderResults = () => {
      resultsList.innerHTML = '';
      if (!filteredItems.length) {
        resultsList.innerHTML = '<li style="padding:16px;text-align:center;color:var(--muted);font-size:0.88rem;">No matching documentation pages</li>';
        return;
      }
      filteredItems.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'search-item';
        const a = document.createElement('a');
        a.href = rootPrefix + item.path;
        if (idx === selectedIdx) a.classList.add('selected');
        a.innerHTML = `<span class="search-title">${item.title}</span><span class="search-group">${item.group}</span>`;
        li.appendChild(a);
        resultsList.appendChild(li);
      });
    };

    const openSearch = () => {
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
      filteredItems = allItems;
      selectedIdx = 0;
      renderResults();
      setTimeout(() => input.focus(), 50);
    };

    const closeSearch = () => {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      input.value = '';
    };

    if (trigger) trigger.addEventListener('click', openSearch);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeSearch();
    });

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        filteredItems = allItems;
      } else {
        filteredItems = allItems.filter(item => 
          item.title.toLowerCase().includes(q) || item.group.toLowerCase().includes(q)
        );
      }
      selectedIdx = 0;
      renderResults();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, filteredItems.length - 1);
        renderResults();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        renderResults();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIdx]) {
          if (window.__ARCHDOC_STANDALONE__ && typeof window.__ARCHDOC_SWITCH_PAGE__ === 'function') {
            window.__ARCHDOC_SWITCH_PAGE__(filteredItems[selectedIdx].path);
            closeSearch();
          } else {
            window.location.href = rootPrefix + filteredItems[selectedIdx].path;
          }
        }
      } else if (e.key === 'Escape') {
        closeSearch();
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (backdrop.classList.contains('open')) closeSearch();
        else openSearch();
      } else if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        openSearch();
      }
    });
  };

  /* ==========================================================================
     Boot Initialization
     ========================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    renderSidebar();
    initSidebarToggle();
    initDiagramControls();
    initTreeControls();
    initStepTracking();
    initSyntaxHighlighting();
    initCopyButtons();
    initSearchModal();
    initKeyHandlers();
  });

  window.__ARCHDOC_HIGHLIGHT__ = initSyntaxHighlighting;
})();
