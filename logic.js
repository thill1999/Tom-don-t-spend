// Money maths for the budget app. No screen code in here, so it can be tested on its own
// (open tests.html). Dates are plain "YYYY-MM-DD" strings so timezones can't shift them.
(function (root) {
  'use strict';

  // ---------- small helpers ----------

  /** Round to whole pennies so sums like 0.1 + 0.2 don't drift. */
  function pennies(x) {
    return Math.round((Number(x) || 0) * 100) / 100;
  }

  function sum(list, pick) {
    return pennies(list.reduce((t, x) => t + (Number(pick ? pick(x) : x) || 0), 0));
  }

  /** £1,234 or £1,234.50: whole pounds when there are no pennies. */
  function money(x) {
    const v = pennies(x);
    const sign = v < 0 ? '−' : '';
    const abs = Math.abs(v);
    const opts = abs % 1 === 0
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return sign + '£' + abs.toLocaleString('en-GB', opts);
  }

  // ---------- dates ----------

  function toDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function ymd(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(s, n) {
    const d = toDate(s);
    d.setUTCDate(d.getUTCDate() + n);
    return ymd(d);
  }

  function daysBetween(a, b) {
    return Math.round((toDate(b) - toDate(a)) / 86400000);
  }

  /** 0 = Sunday, 1 = Monday ... 6 = Saturday */
  function weekday(s) {
    return toDate(s).getUTCDay();
  }

  function todayLocal(now) {
    const d = now || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** Payday in a given month; a payday of 31 becomes the 30th in a 30-day month. */
  function paydayIn(year, month, day) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12 here
    const pad = (n) => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(Math.min(day, last))}`;
  }

  /**
   * The pay cycle that contains `today`: from the last payday up to (not including) the next.
   * Returns { start, end }.
   */
  function cycleFor(today, paydayDay) {
    const [y, m] = today.split('-').map(Number);
    const thisMonth = paydayIn(y, m, paydayDay);
    if (today >= thisMonth) {
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      return { start: thisMonth, end: paydayIn(ny, nm, paydayDay) };
    }
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return { start: paydayIn(py, pm, paydayDay), end: thisMonth };
  }

  /**
   * Days the weekly spender gets topped up in a cycle: payday itself (unless it is already a
   * top-up day), then every top-up weekday before the next payday.
   */
  function topUpDates(cycle, topUpWeekday) {
    const dates = [];
    if (weekday(cycle.start) !== topUpWeekday) dates.push(cycle.start);
    for (let d = cycle.start; d < cycle.end; d = addDays(d, 1)) {
      if (weekday(d) === topUpWeekday) dates.push(d);
    }
    return dates;
  }

  /** The current "week" of weekly money: from the latest top-up to the next one (or payday). */
  function currentWeek(today, dates, cycleEnd) {
    let i = 0;
    for (let k = 0; k < dates.length; k++) if (dates[k] <= today) i = k;
    return { start: dates[i], end: dates[i + 1] || cycleEnd, index: i, count: dates.length };
  }

  // ---------- the monthly plan ----------

  /** Debt payments that fall inside the cycle, e.g. Flex on the 2nd. */
  function debtPaymentsIn(debts, cycle) {
    const out = [];
    for (const debt of debts) {
      for (const p of debt.payments || []) {
        if (p.date >= cycle.start && p.date < cycle.end) {
          out.push({ name: debt.name, date: p.date, amount: pennies(p.amount) });
        }
      }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  /**
   * Everything the plan screen shows: what's fixed, what the sliders use and what's left.
   * Flags:
   *   over          - more allocated than you have
   *   weeklyLow     - weekly spender is under your minimum (food money)
   *   weeklySqueezed - the pots leave too little room for even the minimum weekly amount
   */
  function planSummary(state, plan, cycle) {
    const dates = topUpDates(cycle, state.settings.topUpWeekday);
    const drops = dates.length;
    const adjustments = sum(plan.adjustments || [], (a) => a.amount);
    const total = pennies((Number(plan.startTotal) || 0) + adjustments);
    const bills = sum(state.bills, (b) => b.amount);
    const debtPays = debtPaymentsIn(state.debts, cycle);
    const debts = sum(debtPays, (p) => p.amount);
    const fixed = pennies(bills + debts);
    const weekly = Number(plan.weekly) || 0;
    const weeklyTotal = pennies(weekly * drops);
    const potsTotal = sum(Object.values(plan.pots || {}));
    const left = pennies(total - fixed - weeklyTotal - potsTotal);
    const maxWeekly = drops ? Math.floor((total - fixed - potsTotal) / drops) : 0;
    const min = Number(state.settings.minWeekly) || 0;

    const flags = [];
    if (left < 0) flags.push('over');
    if (weekly < min) flags.push('weeklyLow');
    if (maxWeekly < min) flags.push('weeklySqueezed');

    return {
      total, adjustments, bills, debts, debtPays, fixed, weekly, drops, dates,
      weeklyTotal, potsTotal, left, maxWeekly, flags,
      perDay: pennies(weekly / 7),
    };
  }

  /** How much weekly money is left this week, given what you've logged. */
  function weekLeft(weekly, spends, week) {
    const spent = sum(spends.filter((s) => s.date >= week.start && s.date < week.end), (s) => s.amount);
    return { spent, left: pennies(weekly - spent), days: daysBetween(week.start, week.end) };
  }

  // ---------- subscriptions ----------

  const PER_MONTH = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };

  function monthlyCost(sub) {
    return pennies((Number(sub.amount) || 0) * (PER_MONTH[sub.freq] || 1));
  }

  function subsTotals(subs) {
    const perMonth = sum(subs, monthlyCost);
    const cancel = subs.filter((s) => s.verdict === 'cancel');
    return {
      perMonth,
      perYear: pennies(perMonth * 12),
      savePerYear: pennies(sum(cancel, monthlyCost) * 12),
    };
  }

  // ---------- reading bank CSV exports ----------

  /** Splits CSV text into rows, handling quoted fields with commas and "" inside. */
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const t = text.replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (quoted) {
        if (c === '"' && t[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((f) => f.trim() !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
    return rows;
  }

  /** "£1,234.50", "-12.00", "(12.00)" → number; blank → null. */
  function parseMoney(s) {
    if (s == null) return null;
    let t = String(s).trim().replace(/[£$€,\s]/g, '');
    if (!t) return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return neg ? -n : n;
  }

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  /** Accepts 2026-10-28 (with or without a time), 28/10/2026, 28/10/26, 28-10-2026, 28 Oct 2026. */
  function parseDate(s) {
    const t = String(s || '').trim();
    const pad = (n) => String(n).padStart(2, '0');
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return `${y}-${pad(m[2])}-${pad(m[1])}`;
    }
    m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/);
    if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
    return null;
  }

  /**
   * Best guess at which columns hold the date, description and amount. Banks name them
   * differently, so the screen always lets you change the guess.
   */
  function guessColumns(headers) {
    const h = headers.map((x) => String(x).toLowerCase());
    const find = (re) => h.findIndex((x) => re.test(x));
    const date = find(/date|completed|started|time/);
    let desc = find(/description|merchant|payee|counter ?party|name|details|reference/);
    let amount = find(/debit|paid out|money out/);
    let outPositive = amount !== -1;
    if (amount === -1) { amount = find(/amount|value/); outPositive = false; }
    if (desc === date) desc = -1;
    return { date, desc, amount, outPositive };
  }

  /** Rows + column choice → [{ date, desc, amount }] with money out as negative amounts. */
  function toTransactions(rows, cols) {
    const out = [];
    for (const r of rows) {
      const date = parseDate(r[cols.date]);
      let amount = parseMoney(r[cols.amount]);
      if (!date || amount == null || amount === 0) continue;
      if (cols.outPositive) amount = -Math.abs(amount);
      out.push({ date, desc: String(r[cols.desc] || '').trim(), amount });
    }
    return out;
  }

  /** "CARD PAYMENT TO SPOTIFY P2C3A1 ON 02/10" → "spotify" (roughly: words without digits). */
  function merchantKey(desc) {
    const words = String(desc).toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !/\d/.test(w))
      .filter((w) => !['card', 'payment', 'to', 'on', 'from', 'ltd', 'www', 'com', 'co', 'uk', 'the', 'direct', 'debit', 'dd', 'so', 'pos', 'purchase', 'contactless'].includes(w));
    return words.slice(0, 2).join(' ');
  }

  function median(xs) {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /**
   * Finds payments that repeat: same merchant, similar amount (within 20%), at a steady weekly,
   * monthly or yearly gap. Returns the likely subscriptions, priciest first.
   */
  function findRecurring(transactions, today) {
    const groups = new Map();
    for (const t of transactions) {
      if (t.amount >= 0) continue;
      const key = merchantKey(t.desc);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const found = [];
    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      list.sort((a, b) => (a.date < b.date ? -1 : 1));
      const amounts = list.map((t) => -t.amount);
      const mid = median(amounts);
      if (amounts.some((a) => Math.abs(a - mid) > mid * 0.2)) continue;
      const gaps = [];
      for (let i = 1; i < list.length; i++) gaps.push(daysBetween(list[i - 1].date, list[i].date));
      const gap = median(gaps);
      let freq = null;
      if (gap >= 5 && gap <= 9) freq = 'weekly';
      else if (gap >= 26 && gap <= 35) freq = 'monthly';
      else if (gap >= 355 && gap <= 375) freq = 'yearly';
      if (!freq) continue;
      const last = list[list.length - 1];
      const stillGoing = today ? daysBetween(last.date, today) <= gap * 1.5 + 3 : true;
      const sub = { key, name: last.desc, amount: pennies(-last.amount), freq, count: list.length, lastDate: last.date, stillGoing };
      sub.monthly = monthlyCost(sub);
      found.push(sub);
    }
    return found.sort((a, b) => b.monthly - a.monthly);
  }

  root.Budget = {
    pennies, sum, money,
    toDate, ymd, addDays, daysBetween, weekday, todayLocal, paydayIn, cycleFor, topUpDates, currentWeek,
    debtPaymentsIn, planSummary, weekLeft,
    monthlyCost, subsTotals,
    parseCSV, parseMoney, parseDate, guessColumns, toTransactions, merchantKey, findRecurring,
  };
})(typeof window !== 'undefined' ? window : globalThis);
