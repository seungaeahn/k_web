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

  async function confirm({ title, message, okLabel = '확인', cancelLabel = '취소', danger = false }) {
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

  return { open, confirm };
})();
