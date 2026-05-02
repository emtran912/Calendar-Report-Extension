const els = {
  connectBtn: document.getElementById('connectBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  saveRulesBtn: document.getElementById('saveRulesBtn'),
  status: document.getElementById('status'),

  rangePreset: document.getElementById('rangePreset'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  customRangeFields: document.getElementById('customRangeFields'),

  calendarSelect: document.getElementById('calendarSelect'),
  totalHours: document.getElementById('totalHours'),
  meetingHours: document.getElementById('meetingHours'),
  focusHours: document.getElementById('focusHours'),
  rangeLabel: document.getElementById('rangeLabel'),
  bars: document.getElementById('bars'),
  patterns: document.getElementById('patterns'),
  rulesInput: document.getElementById('rulesInput')
};

console.log(els);

const fmtHours = (mins) => `${(mins / 60).toFixed(1)}h`;

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateInput(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function renderBars(categoryMinutes, totalMinutes) {
  const entries = Object.entries(categoryMinutes).sort((a, b) => b[1] - a[1]);
  els.bars.innerHTML = entries.length ? '' : '<p class="muted">No events found for this week.</p>';
  for (const [name, minutes] of entries) {
    const pct = totalMinutes ? (minutes / totalMinutes) * 100 : 0;
    const item = document.createElement('div');
    item.className = 'bar-item';
    item.innerHTML = `
      <div class="bar-meta"><span>${name}</span><strong>${fmtHours(minutes)} · ${pct.toFixed(0)}%</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    `;
    els.bars.appendChild(item);
  }
}

function renderPatterns(report) {
  const items = [
    { label: 'Longest event', value: report.longestEvent ? `${report.longestEvent.summary} (${fmtHours(report.longestEvent.durationMinutes)})` : 'None' },
    { label: 'Busiest day', value: report.busiestDay ? `${report.busiestDay.date} (${fmtHours(report.busiestDay.minutes)})` : 'None' },
    { label: 'Meeting load', value: `${report.meetingShare}% of scheduled time` },
    { label: 'Context switches', value: `${report.contextSwitches} category changes` }
  ];

  els.patterns.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `<div class="pill">${item.label}</div><p style="margin-top:8px;color:#28251d;">${item.value}</p>`;
    els.patterns.appendChild(div);
  });
}

async function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function loadCalendars() {
  const { calendars = [] } = await sendMessage('LIST_CALENDARS');
  els.calendarSelect.innerHTML = '';
  calendars.forEach(cal => {
    const opt = document.createElement('option');
    opt.value = cal.id;
    opt.textContent = cal.summaryOverride || cal.summary;
    els.calendarSelect.appendChild(opt);
  });
}

function getPresetRange(preset) {
  const today = new Date();

  const toInput = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate() + 0).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getMonday = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  if (preset === 'this_week') {
    const start = getMonday(today);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { startDate: toInput(start), endDate: toInput(end) };
  }

  if (preset === 'last_7_days') {
    const end = today;
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return { startDate: toInput(start), endDate: toInput(end) };
  }

  if (preset === 'last_30_days') {
    const end = today;
    const start = new Date(end);
    start.setDate(end.getDate() - 29);
    return { startDate: toInput(start), endDate: toInput(end) };
  }

  if (preset === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { startDate: toInput(start), endDate: toInput(end) };
  }

  // custom: will be read from the inputs
  return null;
}

async function refreshReport() {

  const preset = els.rangePreset.value;

  // 1) Compute the date range
  let range = getPresetRange(preset);

  if (preset === 'custom') {
    range = {
      startDate: els.startDate.value,
      endDate: els.endDate.value
    };
  }

  if (!range || !range.startDate || !range.endDate) {
    els.status.textContent = 'Please choose a valid date range.';
    return;
  }

  const calendarId = els.calendarSelect.value || 'primary';

  // 2) Call background with new shape
  els.status.textContent = 'Building report...';

  const data = await chrome.runtime.sendMessage({
    type: 'GENERATE_REPORT',
    preset,
    startDate: range.startDate,
    endDate: range.endDate,
    calendarId
  });

  if (data.error) {
    els.status.textContent = data.error;
    return;
  }

  const { report } = data;

  // 3) Update UI from report
  els.status.textContent = `Last updated ${new Date().toLocaleTimeString()}`;
  els.totalHours.textContent = `${(report.totalMinutes / 60).toFixed(1)}h`;
  els.meetingHours.textContent = `${((report.categoryMinutes.meetings || 0) / 60).toFixed(1)}h`;
  els.focusHours.textContent = `${((report.categoryMinutes.focus || 0) / 60).toFixed(1)}h`;
  els.rangeLabel.textContent = `${report.range.start} → ${report.range.end}`;

  // If you have renderBars / renderPatterns helpers, call them here:
  renderBars(report.categoryMinutes, report.totalMinutes);
  renderPatterns(report);
}

function updateRangeInputs() {
  const preset = els.rangePreset.value;
  const isCustom = preset === 'custom';

  els.customRangeFields.classList.toggle('hidden', !isCustom);

  if (!isCustom) {
    const range = getPresetRange(preset);
    if (range) {
      els.startDate.value = range.startDate;
      els.endDate.value = range.endDate;
    }
  }
}

els.connectBtn.addEventListener('click', async () => {
  els.status.textContent = 'Connecting...';
  const res = await sendMessage('AUTH');
  els.status.textContent = res?.success
    ? 'Connected. Loading calendars...'
    : (res?.error || 'Failed to connect');

  if (res?.success) {
    await loadCalendars();
    await refreshReport();
  }
});

els.refreshBtn.addEventListener('click', refreshReport);

els.downloadBtn.addEventListener('click', async () => {
  const data = await sendMessage('GET_LAST_REPORT');
  if (!data?.report) {
    els.status.textContent = 'No report available yet.';
    return;
  }

  const blob = new Blob([JSON.stringify(data.report, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `time-report-${data.report.range.start}-to-${data.report.range.end}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

els.saveRulesBtn.addEventListener('click', async () => {
  await chrome.storage.sync.set({ customRules: els.rulesInput.value.trim() });
  els.status.textContent = 'Rules saved.';
  await refreshReport();
});

els.rangePreset.addEventListener('change', () => {
  updateRangeInputs();
  refreshReport();
});

els.startDate.addEventListener('change', refreshReport);
els.endDate.addEventListener('change', refreshReport);
els.calendarSelect.addEventListener('change', refreshReport);

async function loadRules() {
  const { customRules = '' } = await chrome.storage.sync.get({ customRules: '' });
  els.rulesInput.value = customRules;
}

(async function init() {
  els.rangePreset.value = 'this_week';
  updateRangeInputs();
  await loadRules();

  try {
    await loadCalendars();
    await refreshReport();
    els.status.textContent = 'Ready.';
  } catch (e) {
    els.status.textContent = 'Connect your account to start.';
  }
})();
