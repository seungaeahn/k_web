const Utils = (() => {
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function todayStr() {
    return dateToStr(new Date());
  }

  function dateToStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function toDateTimeLocal(iso) {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${formatDate(iso)} ${h}:${min}`;
  }

  function formatDuration(ms) {
    if (!ms || ms < 0) ms = 0;
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0 && m <= 0) return '0분';
    let out = '';
    if (h > 0) out += `${h}시간 `;
    if (m > 0) out += `${m}분`;
    return out.trim();
  }

  function isSameDay(iso, dateStr) {
    return dateToStr(new Date(iso)) === dateStr;
  }

  function debounce(fn, wait) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last < wait) return;
      last = now;
      fn(...args);
    };
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    uid, todayStr, dateToStr, toDateTimeLocal, formatDate, formatDateTime,
    formatDuration, isSameDay, debounce, fileToBase64, escapeHtml,
  };
})();
