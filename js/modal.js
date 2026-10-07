const Modal = (() => {
  function open({ title, bodyHtml, buttons }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          ${title ? `<h3 class="modal-title">${title}</h3>` : ''}
          <div class="modal-body">${bodyHtml || ''}</div>
          <div class="modal-actions">
            ${buttons.map((b) => `<button type="button" data-modal-btn="${b.id}" class="btn ${b.variant || ''}">${b.label}</button>`).join('')}
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const firstInput = overlay.querySelector('input, textarea');
      if (firstInput) firstInput.focus();

      overlay.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-modal-btn]');
        if (!btn) return;
        const id = btn.dataset.modalBtn;
        const values = {};
        overlay.querySelectorAll('[data-field]').forEach((el) => {
          values[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
        });
        overlay.remove();
        resolve({ id, values });
      });
    });
  }

  async function confirm({ title, message, okLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
    const res = await open({
      title,
      bodyHtml: `<p>${message}</p>`,
      buttons: [
        { id: 'cancel', label: cancelLabel, variant: 'ghost' },
        { id: 'ok', label: okLabel, variant: danger ? 'danger' : 'primary' },
      ],
    });
    return res.id === 'ok';
  }

  // 목록에서 하나 고르기: 검색 + (묶음이 2개 이상이면) 탭. 항목을 누르면 바로 골라지고 value를 돌려줌.
  // sections: [{ label, items: [{ value, label, meta }] }] — 항목 순서는 호출하는 쪽에서 정함
  // 닫기(×)나 바깥을 누르면 null
  function pick({ title, sections, placeholder = '검색', emptyText = '찾는 항목이 없어요.' }) {
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const groups = sections.filter((sec) => sec.items.length);
    return new Promise((resolve) => {
      let tab = -1; // -1 = 전체
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal picker" role="dialog" aria-modal="true">
          <div class="picker-head">
            ${title ? `<h3 class="modal-title">${esc(title)}</h3>` : ''}
            <button type="button" class="icon-btn" data-picker-close aria-label="닫기">×</button>
          </div>
          <input type="search" class="picker-search" placeholder="${esc(placeholder)}" enterkeyhint="search">
          ${groups.length > 1 ? `
            <div class="status-row picker-tabs">
              <button type="button" class="chip display-chip active" data-picker-tab="-1">All</button>
              ${groups.map((g, i) => `<button type="button" class="chip display-chip" data-picker-tab="${i}">${esc(g.label)}</button>`).join('')}
            </div>` : ''}
          <div class="picker-list"></div>
        </div>`;
      document.body.appendChild(overlay);
      const searchEl = overlay.querySelector('.picker-search');
      const listEl = overlay.querySelector('.picker-list');

      const close = (value) => {
        overlay.remove();
        resolve(value);
      };

      function renderList() {
        const q = searchEl.value.trim().toLowerCase();
        const match = (it) => !q || `${it.label} ${it.meta || ''}`.toLowerCase().includes(q);
        const shown = groups
          .map((g, i) => ({ ...g, i, items: g.items.filter(match) }))
          .filter((g) => (tab === -1 || g.i === tab) && g.items.length);
        listEl.innerHTML = shown.length ? shown.map((g) => `
          ${tab === -1 && groups.length > 1 ? `<p class="picker-group">${esc(g.label)}</p>` : ''}
          ${g.items.map((it) => `
            <button type="button" class="picker-item" data-picker-value="${esc(it.value)}">
              <span class="picker-item-name">${esc(it.label)}</span>
              ${it.meta ? `<span class="picker-item-meta">${esc(it.meta)}</span>` : ''}
            </button>`).join('')}`).join('')
          : `<p class="picker-empty">${esc(emptyText)}</p>`;
      }

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-picker-close]')) return close(null);
        const item = e.target.closest('[data-picker-value]');
        if (item) return close(item.dataset.pickerValue);
        const tabBtn = e.target.closest('[data-picker-tab]');
        if (tabBtn) {
          tab = Number(tabBtn.dataset.pickerTab);
          overlay.querySelectorAll('[data-picker-tab]').forEach((b) => b.classList.toggle('active', b === tabBtn));
          renderList();
        }
      });
      searchEl.addEventListener('input', renderList);
      renderList();
    });
  }

  return { open, confirm, pick };
})();
