/* ============================================================
   عيادة الدكتور علي قرابش لطب الأسنان — منطق التطبيق
   التخزين: LocalStorage  |  بدون إنترنت أو قاعدة بيانات
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'qarabesh_clinic_patients_v1';

  /* ---------- عناصر الواجهة ---------- */
  const els = {
    body:        document.getElementById('patientsBody'),
    empty:       document.getElementById('emptyState'),
    search:      document.getElementById('searchInput'),
    addBtn:      document.getElementById('addBtn'),
    // النافذة
    overlay:     document.getElementById('modalOverlay'),
    modalTitle:  document.getElementById('modalTitle'),
    modalClose:  document.getElementById('modalClose'),
    cancelBtn:   document.getElementById('cancelBtn'),
    form:        document.getElementById('patientForm'),
    // الحقول
    fId:         document.getElementById('patientId'),
    fName:       document.getElementById('name'),
    fTreatment:  document.getElementById('treatment'),
    fSession:    document.getElementById('session'),
    fPhone:      document.getElementById('phone'),
    fTotal:      document.getElementById('total'),
    fPaid:       document.getElementById('paid'),
    fRemaining:  document.getElementById('remaining'),
    fSecond:     document.getElementById('secondSession'),
    // الحذف
    confirmOverlay: document.getElementById('confirmOverlay'),
    confirmDelete:  document.getElementById('confirmDelete'),
    confirmCancel:  document.getElementById('confirmCancel'),
    // الإحصائيات
    statTotal:    document.getElementById('statTotal'),
    statToday:    document.getElementById('statToday'),
    statTomorrow: document.getElementById('statTomorrow'),
    statDue:      document.getElementById('statDue'),
    // التنبيه
    bellBtn:     document.getElementById('bellBtn'),
    bellCount:   document.getElementById('bellCount'),
    alertBanner: document.getElementById('alertBanner'),
    alertList:   document.getElementById('alertList'),
    alertClose:  document.getElementById('alertClose'),
  };

  let patients = [];      // قائمة المرضى
  let pendingDeleteId = null;

  /* ============================================================
     التخزين
     ============================================================ */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      patients = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(patients)) patients = [];
    } catch (e) {
      patients = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    } catch (e) {
      alert('تعذّر حفظ البيانات. قد تكون مساحة التخزين ممتلئة.');
    }
  }

  /* ============================================================
     أدوات مساعدة
     ============================================================ */
  function uid() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function toNum(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // تنسيق الأرقام بفواصل آلاف
  function fmt(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  // بداية اليوم لتاريخ معيّن
  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  // فرق الأيام بين موعد واليوم (0 = اليوم، 1 = الغد …)
  function dayDiffFromToday(dateStr) {
    if (!dateStr) return null;
    const appt = new Date(dateStr);
    if (isNaN(appt.getTime())) return null;
    const today = startOfDay(new Date());
    const apptDay = startOfDay(appt);
    return Math.round((apptDay - today) / 86400000);
  }

  // تنسيق التاريخ والوقت بالعربية
  function fmtDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const date = d.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    return date + ' • ' + time;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /* ============================================================
     تنبيه صوتي بسيط (Web Audio — بدون ملفات خارجية)
     ============================================================ */
  function playBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = [880, 1100, 880]; // نغمات قصيرة متتابعة
      let t = ctx.currentTime;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.24);
        t += 0.26;
      });
      setTimeout(() => ctx.close(), 1200);
    } catch (e) { /* تجاهل بصمت */ }
  }

  /* ============================================================
     العرض في الجدول
     ============================================================ */
  function render() {
    const q = els.search.value.trim().toLowerCase();
    const list = patients.filter(p => {
      if (!q) return true;
      return (p.name || '').toLowerCase().includes(q) ||
             (p.phone || '').toLowerCase().includes(q);
    });

    els.body.innerHTML = '';

    if (patients.length === 0) {
      els.empty.hidden = false;
      els.empty.querySelector('p').textContent = 'لا يوجد مرضى مسجّلون بعد.';
      els.empty.querySelector('span').textContent = 'اضغط «إضافة مريض جديد» لبدء تسجيل أول مريض.';
    } else if (list.length === 0) {
      els.empty.hidden = false;
      els.empty.querySelector('p').textContent = 'لا توجد نتائج مطابقة.';
      els.empty.querySelector('span').textContent = 'جرّب البحث باسم آخر أو رقم هاتف مختلف.';
    } else {
      els.empty.hidden = true;
    }

    list.forEach(p => {
      const remaining = toNum(p.total) - toNum(p.paid);
      const diff = dayDiffFromToday(p.secondSession);

      const tr = document.createElement('tr');
      if (diff === 0) tr.className = 'row-today';
      else if (diff === 1) tr.className = 'row-tomorrow';

      let remClass = 'zero';
      if (remaining > 0) remClass = 'pos';

      const apptCls = diff === 0 ? '' : (diff === 1 ? '' : (p.secondSession ? '' : 'none'));

      tr.innerHTML = `
        <td class="cell-name">${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.treatment) || '—'}</td>
        <td>${escapeHtml(p.session) || '—'}</td>
        <td class="cell-num">${fmt(toNum(p.total))}</td>
        <td class="cell-num">${fmt(toNum(p.paid))}</td>
        <td class="cell-num cell-remaining ${remClass}">${fmt(remaining)}</td>
        <td class="cell-num">${escapeHtml(p.phone) || '—'}</td>
        <td><span class="appt-pill ${apptCls}">${fmtDateTime(p.secondSession)}</span></td>
        <td class="cell-actions">
          <button class="row-btn edit" data-id="${p.id}" title="تعديل" aria-label="تعديل">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="row-btn del" data-id="${p.id}" title="حذف" aria-label="حذف">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </td>`;
      els.body.appendChild(tr);
    });

    updateStats();
  }

  /* ============================================================
     الإحصائيات
     ============================================================ */
  function updateStats() {
    let today = 0, tomorrow = 0, due = 0;
    patients.forEach(p => {
      const diff = dayDiffFromToday(p.secondSession);
      if (diff === 0) today++;
      else if (diff === 1) tomorrow++;
      const r = toNum(p.total) - toNum(p.paid);
      if (r > 0) due += r;
    });
    els.statTotal.textContent = patients.length;
    els.statToday.textContent = today;
    els.statTomorrow.textContent = tomorrow;
    els.statDue.textContent = fmt(due);
  }

  /* ============================================================
     التنبيهات (اليوم + الغد)
     ============================================================ */
  function buildAlerts(autoSound) {
    const upcoming = patients
      .map(p => ({ p, diff: dayDiffFromToday(p.secondSession) }))
      .filter(x => x.diff === 0 || x.diff === 1)
      .sort((a, b) => a.diff - b.diff || new Date(a.p.secondSession) - new Date(b.p.secondSession));

    // شارة الجرس
    if (upcoming.length > 0) {
      els.bellCount.hidden = false;
      els.bellCount.textContent = upcoming.length;
    } else {
      els.bellCount.hidden = true;
    }

    // محتوى الشريط
    els.alertList.innerHTML = '';
    upcoming.forEach(({ p, diff }) => {
      const li = document.createElement('li');
      li.className = diff === 1 ? 'tomorrow' : '';
      const tag = diff === 0 ? 'اليوم' : 'غداً';
      li.innerHTML = `
        <span class="tag">${tag}</span>
        <strong>${escapeHtml(p.name)}</strong>
        <span>— ${fmtDateTime(p.secondSession)}</span>
        ${p.phone ? '<span>• ☎ ' + escapeHtml(p.phone) + '</span>' : ''}`;
      els.alertList.appendChild(li);
    });

    if (upcoming.length > 0) {
      els.alertBanner.hidden = false;
      if (autoSound) playBeep();
    } else {
      els.alertBanner.hidden = true;
    }
    return upcoming.length;
  }

  /* ============================================================
     النافذة المنبثقة (إضافة / تعديل)
     ============================================================ */
  function openModal(patient) {
    els.form.reset();
    clearInvalid();
    if (patient) {
      els.modalTitle.textContent = 'تعديل بيانات المريض';
      els.fId.value        = patient.id;
      els.fName.value      = patient.name || '';
      els.fTreatment.value = patient.treatment || '';
      els.fSession.value   = patient.session || '';
      els.fPhone.value     = patient.phone || '';
      els.fTotal.value     = patient.total ?? '';
      els.fPaid.value      = patient.paid ?? '';
      els.fSecond.value    = patient.secondSession || '';
    } else {
      els.modalTitle.textContent = 'إضافة مريض جديد';
      els.fId.value = '';
    }
    recalcRemaining();
    els.overlay.hidden = false;
    setTimeout(() => els.fName.focus(), 50);
  }

  function closeModal() {
    els.overlay.hidden = true;
  }

  function recalcRemaining() {
    const r = toNum(els.fTotal.value) - toNum(els.fPaid.value);
    els.fRemaining.value = fmt(r);
  }

  function clearInvalid() {
    [els.fName].forEach(el => el.classList.remove('invalid'));
  }

  function handleSubmit(e) {
    e.preventDefault();
    clearInvalid();

    const name = els.fName.value.trim();
    if (!name) {
      els.fName.classList.add('invalid');
      els.fName.focus();
      return;
    }

    const data = {
      name,
      treatment:     els.fTreatment.value.trim(),
      session:       els.fSession.value.trim(),
      phone:         els.fPhone.value.trim(),
      total:         toNum(els.fTotal.value),
      paid:          toNum(els.fPaid.value),
      secondSession: els.fSecond.value || '',
    };

    const id = els.fId.value;
    if (id) {
      const idx = patients.findIndex(p => p.id === id);
      if (idx !== -1) patients[idx] = Object.assign({}, patients[idx], data);
    } else {
      data.id = uid();
      patients.unshift(data);
    }

    save();
    render();
    buildAlerts(false);
    closeModal();
  }

  /* ============================================================
     الحذف
     ============================================================ */
  function askDelete(id) {
    pendingDeleteId = id;
    const p = patients.find(x => x.id === id);
    document.getElementById('confirmText').textContent =
      'هل تريد حذف المريض «' + (p ? p.name : '') + '»؟ لا يمكن التراجع عن العملية.';
    els.confirmOverlay.hidden = false;
  }

  function doDelete() {
    if (pendingDeleteId) {
      patients = patients.filter(p => p.id !== pendingDeleteId);
      pendingDeleteId = null;
      save();
      render();
      buildAlerts(false);
    }
    els.confirmOverlay.hidden = true;
  }

  /* ============================================================
     ربط الأحداث
     ============================================================ */
  function bindEvents() {
    els.addBtn.addEventListener('click', () => openModal(null));
    els.modalClose.addEventListener('click', closeModal);
    els.cancelBtn.addEventListener('click', closeModal);
    els.form.addEventListener('submit', handleSubmit);

    els.fTotal.addEventListener('input', recalcRemaining);
    els.fPaid.addEventListener('input', recalcRemaining);

    els.search.addEventListener('input', render);

    // أزرار الجدول (تفويض الأحداث)
    els.body.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.edit');
      const delBtn  = e.target.closest('.del');
      if (editBtn) {
        const p = patients.find(x => x.id === editBtn.dataset.id);
        if (p) openModal(p);
      } else if (delBtn) {
        askDelete(delBtn.dataset.id);
      }
    });

    // الحذف
    els.confirmDelete.addEventListener('click', doDelete);
    els.confirmCancel.addEventListener('click', () => {
      pendingDeleteId = null;
      els.confirmOverlay.hidden = true;
    });

    // التنبيه
    els.bellBtn.addEventListener('click', () => {
      const count = buildAlerts(true);
      if (count === 0) {
        els.alertBanner.hidden = false;
        els.alertList.innerHTML = '<li style="background:var(--teal-100)">لا توجد مواعيد قريبة لليوم أو الغد.</li>';
        setTimeout(() => { if (count === 0) els.alertBanner.hidden = true; }, 2500);
      }
    });
    els.alertClose.addEventListener('click', () => { els.alertBanner.hidden = true; });

    // إغلاق النوافذ عند النقر خارجها أو بمفتاح Esc
    [els.overlay, els.confirmOverlay].forEach(ov => {
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.hidden = true; });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        els.overlay.hidden = true;
        els.confirmOverlay.hidden = true;
      }
    });
  }

  /* ============================================================
     الإقلاع
     ============================================================ */
  function init() {
    load();
    bindEvents();
    render();
    buildAlerts(true); // فحص تلقائي + تنبيه صوتي عند التشغيل
  }

  document.addEventListener('DOMContentLoaded', init);
})();
