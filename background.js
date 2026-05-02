const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('weekly-report', { periodInMinutes: 60 * 24 * 7 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'weekly-report') return;

  try {
    const { startDate, endDate } = getPresetDateRange('this_week');
    const report = await generateTimeReport({
      startDate,
      endDate,
      preset: 'this_week',
      calendarId: 'primary'
    });
    await chrome.storage.local.set({ lastReport: report });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Time report ready',
      message: `You scheduled ${formatHours(report.totalMinutes)} in the latest report.`
    });
  } catch (err) {
    console.error('Scheduled report failed:', err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'AUTH') {
        const token = await getAuthToken(true);
        sendResponse({ success: true, token });
        return;
      }

      if (message.type === 'LIST_CALENDARS') {
        const calendars = await api('/users/me/calendarList');
        sendResponse({ calendars: calendars.items || [] });
        return;
      }

      if (message.type === 'GENERATE_REPORT') {
        const report = await generateTimeReport({
          preset: message.preset,
          startDate: message.startDate,
          endDate: message.endDate,
          calendarId: message.calendarId || 'primary'
        });
        await chrome.storage.local.set({ lastReport: report });
        sendResponse({ report });
        return;
      }

      if (message.type === 'GET_LAST_REPORT') {
        const { lastReport } = await chrome.storage.local.get('lastReport');
        sendResponse({ report: lastReport || null });
        return;
      }

      sendResponse({ error: `Unknown message type: ${message.type}` });
    } catch (error) {
      console.error('Message handler failed:', error);
      sendResponse({ error: error.message || 'Unexpected error' });
    }
  })();

  return true;
});

async function getAuthToken(interactive = false) {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    if (!result) {
      throw new Error('No auth token returned.');
    }

    if (typeof result === 'string') {
      return result;
    }

    if (result.token) {
      return result.token;
    }

    throw new Error('Unexpected auth token response.');
  } catch (error) {
    throw new Error(error?.message || 'Authentication failed.');
  }
}

async function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

async function api(path, params = {}) {
  let token;

  try {
    token = await getAuthToken(false);
  } catch (silentError) {
    console.warn('Silent auth failed:', silentError.message);
    token = await getAuthToken(true);
  }

  const url = new URL(`${CALENDAR_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) url.searchParams.set(key, value);
  });

  let res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (res.status === 401) {
    await removeCachedToken(token);
    token = await getAuthToken(true);

    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API error: ${res.status} ${text}`);
  }

  return res.json();
}

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

function addDays(dateString, days) {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateInput(d);
}

function getPresetDateRange(preset) {
  const today = new Date();

  if (preset === 'this_week') {
    const start = getMonday(today);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { startDate: toDateInput(start), endDate: toDateInput(end) };
  }

  if (preset === 'last_7_days') {
    const end = today;
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return { startDate: toDateInput(start), endDate: toDateInput(end) };
  }

  if (preset === 'last_30_days') {
    const end = today;
    const start = new Date(end);
    start.setDate(end.getDate() - 29);
    return { startDate: toDateInput(start), endDate: toDateInput(end) };
  }

  if (preset === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { startDate: toDateInput(start), endDate: toDateInput(end) };
  }

  return null;
}

function eventDurationMinutes(event) {
  const start = new Date(event.start?.dateTime || event.start?.date);
  const end = new Date(event.end?.dateTime || event.end?.date);
  return Math.max(0, Math.round((end - start) / 60000));
}

function isAllDay(event) {
  return Boolean(event.start?.date && !event.start?.dateTime);
}

function parseRules(text) {
  const rules = [];
  if (!text) return rules;

  text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .forEach(line => {
      const [category, keywords] = line.split(':');
      if (!category || !keywords) return;

      rules.push({
        category: category.trim().toLowerCase(),
        keywords: keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
      });
    });

  return rules;
}

function categorizeEvent(event, rules) {
  const text = `${event.summary || ''} ${(event.description || '')}`.toLowerCase();

  for (const rule of rules) {
    if (rule.keywords.some(keyword => text.includes(keyword))) return rule.category;
  }

  if (isAllDay(event)) return 'all_day';
  if ((event.attendees?.length || 0) >= 2 || /1:1|sync|standup|meeting|interview|catch up|retro|planning/.test(text)) return 'meetings';
  if (/focus|deep work|study|revision|research|build|coding|learning|analysis|write/.test(text)) return 'focus';
  if (/commute|travel/.test(text)) return 'travel';
  if (/gym|badminton|swim|run|yoga|workout/.test(text)) return 'health';
  if (/lunch|break|dinner/.test(text)) return 'breaks';

  return 'admin';
}

function formatHours(minutes) {
  return `${(minutes / 60).toFixed(1)}h`;
}

async function generateTimeReport({ startDate, endDate, preset = 'custom', calendarId = 'primary' }) {
  // Allow callers to pass only a preset
  if ((!startDate || !endDate) && preset !== 'custom') {
    const computed = getPresetDateRange(preset);
    if (!computed) throw new Error('Unknown preset.');
    startDate = computed.startDate;
    endDate = computed.endDate;
  }

  if (!startDate || !endDate) {
    throw new Error('Start date and end date are required.');
  }

  const { customRules = '' } = await chrome.storage.sync.get({ customRules: '' });
  const rules = parseRules(customRules);

  const timeMin = new Date(`${startDate}T00:00:00`).toISOString();
  // timeMax is exclusive; add 1 day after endDate
  const endDateObj = new Date(`${endDate}T00:00:00`);
  endDateObj.setDate(endDateObj.getDate() + 1);
  const timeMax = new Date(`${toDateInput(endDateObj)}T00:00:00`).toISOString();

  const response = await api(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin,
    timeMax,
    maxResults: 2500
  });

  const items = (response.items || []).filter(event => event.status !== 'cancelled');
  const categoryMinutes = {};
  const dayMinutes = {};
  let totalMinutes = 0;
  let longestEvent = null;
  let contextSwitches = 0;
  let prevCategory = null;

  const normalized = items.map(event => {
    const durationMinutes = eventDurationMinutes(event);
    const category = categorizeEvent(event, rules);
    const day = (event.start?.dateTime || `${event.start?.date}T00:00:00`).slice(0, 10);

    totalMinutes += durationMinutes;
    categoryMinutes[category] = (categoryMinutes[category] || 0) + durationMinutes;
    dayMinutes[day] = (dayMinutes[day] || 0) + durationMinutes;

    if (!longestEvent || durationMinutes > longestEvent.durationMinutes) {
      longestEvent = {
        summary: event.summary || 'Untitled event',
        durationMinutes
      };
    }

    if (prevCategory && prevCategory !== category) contextSwitches += 1;
    prevCategory = category;

    return {
      summary: event.summary || 'Untitled event',
      start: event.start,
      end: event.end,
      durationMinutes,
      category,
      attendees: event.attendees?.length || 0,
      location: event.location || ''
    };
  });

  const busiestDayEntry = Object.entries(dayMinutes).sort((a, b) => b[1] - a[1])[0];
  const meetingMinutes = categoryMinutes.meetings || 0;

  return {
    generatedAt: new Date().toISOString(),
    preset,
    range: { start: startDate, end: endDate },
    totalMinutes,
    meetingShare: totalMinutes ? Math.round((meetingMinutes / totalMinutes) * 100) : 0,
    contextSwitches,
    longestEvent,
    busiestDay: busiestDayEntry ? { date: busiestDayEntry[0], minutes: busiestDayEntry[1] } : null,
    categoryMinutes,
    events: normalized
  };
}