const els = {
  connectBtn: document.getElementById('connectBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  saveRulesBtn: document.getElementById('saveRulesBtn'),
  status: document.getElementById('status'),
  weekStart: document.getElementById('weekStart'),
  calendarSelect: document.getElementById('calendarSelect'),
  totalHours: document.getElementById('totalHours'),
  meetingHours: document.getElementById('meetingHours'),
  focusHours: document.getElementById('focusHours'),
  rangeLabel: document.getElementById('rangeLabel'),
  bars: document.getElementById('bars'),
  patterns: document.getElementById('patterns'),
  rulesInput: document.getElementById('rulesInput')
};

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

async function loadRules() {
  const { customRules = '' } = await chrome.storage.sync.get({ customRules: '' });
  els.rulesInput.value = customRules;
}

async function refreshReport() {
  const weekStart = els.weekStart.value;
  const calendarId = els.calendarSelect.value || 'primary';
  els.status.textContent = 'Building report...';
  const data = await sendMessage('GENERATE_REPORT', { weekStart, calendarId });
  if (data.error) {
    els.status.textContent = data.error;
    return;
  }
  const { report } = data;
  els.status.textContent = `Last updated ${new Date().toLocaleTimeString()}`;
  els.totalHours.textContent = fmtHours(report.totalMinutes);
  els.meetingHours.textContent = fmtHours(report.categoryMinutes.meetings || 0);
  els.focusHours.textContent = fmtHours(report.categoryMinutes.focus || 0);
  els.rangeLabel.textContent = `${report.range.start} → ${report.range.end}`;
  renderBars(report.categoryMinutes, report.totalMinutes);
  renderPatterns(report);
}

els.connectBtn.addEventListener('click', async () => {
  els.status.textContent = 'Connecting...';
  const res = await sendMessage('AUTH');
  els.status.textContent = res?.success ? 'Connected. Loading calendars...' : (res?.error || 'Failed to connect');
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
  const blob = new Blob([JSON.stringify(data.report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weekly-time-report-${data.report.range.start}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

els.saveRulesBtn.addEventListener('click', async () => {
  await chrome.storage.sync.set({ customRules: els.rulesInput.value.trim() });
  els.status.textContent = 'Rules saved.';
  await refreshReport();
});

els.weekStart.addEventListener('change', refreshReport);
els.calendarSelect.addEventListener('change', refreshReport);

(async function init() {
  els.weekStart.value = toDateInput(getMonday());
  await loadRules();
  try {
    await loadCalendars();
    await refreshReport();
    els.status.textContent = 'Ready.';
  } catch (e) {
    els.status.textContent = 'Connect your account to start.';
  }
})();
