// Screens for Tom Don't Spend. All the money maths lives in logic.js (window.Budget).
// Everything is saved on this phone only (localStorage); use More → Backup to keep a copy.
(function () {
  'use strict';
  const B = window.Budget;
  const KEY = 'pots-budget-v1';
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const CATS = ['Food', 'Going out', 'Other'];

  // ---------- state ----------

  function emptyState() {
    return {
      version: 1,
      settings: { paydayDay: 28, payAmount: null, topUpWeekday: 1, minWeekly: 60, safetyFloor: null, floorAccount: null, spendAccount: null },
      accounts: [], bills: [], debts: [], pots: [], plans: {}, spends: [], subs: [], subHunt: {},
      balancesUpdated: null,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(emptyState(), JSON.parse(raw));
    } catch (e) { /* private mode or blocked storage: start empty */ }
    return emptyState();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save on this device. Export a backup from More.'); }
  }

  let state = load();
  const ui = { tab: 'home', cat: 'Food', showTotals: false, csv: null, found: null, starter: null, stmt: null, stmtAccount: null };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = B.money;
  const isEmpty = () => !state.accounts.length && !state.bills.length && !state.pots.length;

  function fmtDate(s) {
    return B.toDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- this month ----------

  function today() { return B.todayLocal(); }
  function cycle() { return B.cycleFor(today(), Number(state.settings.paydayDay) || 28); }

  /** This cycle's plan, created from last month's sliders the first time it's needed. */
  function currentPlan() {
    const c = cycle();
    if (!state.plans[c.start]) {
      const previous = Object.keys(state.plans).filter((k) => k < c.start).sort().pop();
      const prev = previous ? state.plans[previous] : null;
      state.plans[c.start] = {
        startTotal: state.settings.payAmount || 0,
        weekly: prev ? prev.weekly : 100,
        pots: prev ? { ...prev.pots } : {},
        locked: false, lockedAt: null, adjustments: [], checklist: {},
      };
      save();
    }
    const plan = state.plans[c.start];
    for (const p of state.pots) if (plan.pots[p.id] == null) plan.pots[p.id] = 0;
    return plan;
  }

  function floorAccount() {
    return state.accounts.find((a) => a.id === state.settings.floorAccount) || null;
  }

  function checklistItems(plan, s) {
    const items = [];
    const where = floorAccount() ? floorAccount().name : 'your main account';
    if (state.bills.length) {
      items.push({ key: 'bills', text: `Leave ${money(s.bills)} in ${where} for bills (${state.bills.map((b) => b.name).join(', ')})` });
    }
    for (const p of s.debtPays) {
      items.push({ key: `debt:${p.name}:${p.date}`, text: `Pay ${p.name} ${money(p.amount)} on ${fmtDate(p.date)}` });
    }
    items.push({ key: 'weekly', text: `Standing order: ${money(plan.weekly)} every ${DAYS[state.settings.topUpWeekday]} into your weekly spender` });
    for (const pot of state.pots) {
      const amt = Number(plan.pots[pot.id]) || 0;
      if (amt > 0) items.push({ key: `pot:${pot.id}`, potId: pot.id, amount: amt, text: `Move ${money(amt)} → ${pot.name}${pot.where ? ' (' + pot.where + ')' : ''}` });
    }
    return items;
  }

  // ---------- small pieces of markup ----------

  function bar(fraction, cls, markAt) {
    const pct = Math.max(0, Math.min(1, fraction)) * 100;
    const mark = markAt != null ? `<i class="mark" style="left:${Math.min(100, markAt * 100)}%"></i>` : '';
    return `<div class="bar ${cls || ''}"><span style="width:${pct}%"></span>${mark}</div>`;
  }

  function editInput(path, value, type, extra) {
    const t = type === 'text' ? 'text' : type === 'date' ? 'date' : 'number';
    const mode = t === 'number' ? ' inputmode="decimal" step="0.01"' : '';
    return `<input type="${t}"${mode} data-edit="${path}" data-type="${type}" value="${esc(value == null ? '' : value)}" ${extra || ''}>`;
  }

  function flagHtml(cls, html) { return `<div class="flag ${cls}">${html}</div>`; }

  const COLOURS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'];
  const colour = (i) => `var(${COLOURS[i % COLOURS.length]})`;
  const monogram = (name) => `<span class="monogram">${esc((String(name || '?').trim()[0] || '?').toUpperCase())}</span>`;

  /** £96.50 with the pennies greyed, like the reference's $98,123.30. */
  function bigMoney(x) {
    const s = money(x);
    const m = s.match(/^(.*?)(\.\d\d)$/);
    return m ? `${esc(m[1])}<span class="pence">${m[2]}</span>` : esc(s);
  }

  /** Thick ring: bright = still to spend, deep = spent. All ink when you're over. */
  function ring(spentFraction, over) {
    const r = 70;
    const c = 2 * Math.PI * r;
    const spent = Math.max(0, Math.min(1, spentFraction)) * c;
    return `
      <svg class="ring" viewBox="0 0 200 200" role="img" aria-label="${Math.round(Math.min(1, spentFraction) * 100)}% of this week's money spent">
        <circle cx="100" cy="100" r="${r}" fill="none" stroke="${over ? 'var(--ink)' : 'var(--brand)'}" stroke-width="52"/>
        <circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--brand-deep)" stroke-width="52"
          stroke-dasharray="${spent} ${c}" transform="rotate(-90 100 100)" ${over ? 'opacity="0"' : ''}/>
      </svg>`;
  }

  // ---------- Home ----------

  function viewWelcome() {
    return `
      <section class="hero">
        <h1 style="font-size:52px">Tom<br>Don't<br>Spend</h1>
        ${ring(0.3, false)}
      </section>
      <div class="card stack">
        <p>Your money planner. Everything stays on this phone.</p>
        ${ui.starter ? '<button class="full" data-action="load-starter">Load my starter numbers</button>' : ''}
        <label class="btn soft full" style="display:block;text-align:center">Import a backup<input type="file" accept=".json,application/json" data-action="import" hidden></label>
        <button class="ghost full" data-action="go" data-to="money">Start from scratch</button>
      </div>`;
  }

  function viewHome() {
    if (isEmpty()) return viewWelcome();
    const c = cycle();
    const plan = currentPlan();
    const s = B.planSummary(state, plan, c);
    const t = today();
    const week = B.currentWeek(t, s.dates, c.end);
    const wl = B.weekLeft(plan.weekly, state.spends, week);
    const daysToTopUp = Math.max(1, B.daysBetween(t, week.end));
    const spentFraction = plan.weekly ? wl.spent / plan.weekly : 1;
    const nextIsPayday = week.end === c.end;
    const parts = [];

    const flags = [];
    const sincePay = B.daysBetween(c.start, t);
    if (sincePay < 7) {
      flags.push(flagHtml('warn', `<b>Payday week, the danger zone.</b> The bank says you've got loads, but only ${money(Math.max(0, wl.left))} of it is yours to spend this week. ${7 - sincePay} day${7 - sincePay === 1 ? '' : 's'} to get through.`));
    }
    const fa = floorAccount();
    if (fa && state.settings.safetyFloor != null && Number(fa.balance) < Number(state.settings.safetyFloor)) {
      flags.push(flagHtml('bad', `<b>${esc(fa.name)} is at ${money(fa.balance)}</b>, under your ${money(state.settings.safetyFloor)} safety floor. Essentials only until payday.`));
    }
    if (!plan.locked) {
      flags.push(flagHtml('warn', `This month's plan isn't locked in yet. <button class="ghost" data-action="go" data-to="plan">Set it now →</button>`));
    }

    parts.push(`
      <section class="hero">
        <div class="hero-head"><h1>Left this<br>week</h1>
          <span class="label" style="text-align:right">${nextIsPayday ? 'payday' : 'tops up'}<br><b>${fmtDate(week.end)}</b></span></div>
        ${ring(spentFraction, wl.left < 0)}
        <div class="hero-num">
          <span class="label">${money(wl.spent)} spent<br>of ${money(plan.weekly)}</span>
          <span class="huge ${wl.left < 0 ? 'bad' : ''}">${bigMoney(wl.left)}</span>
        </div>
        <p class="label" style="text-align:right;margin-top:6px">${wl.left > 0 ? `about ${money(B.pennies(wl.left / daysToTopUp))} a day for ${daysToTopUp} day${daysToTopUp === 1 ? '' : 's'}` : wl.left < 0 ? `${money(-wl.left)} over: it comes out of next week` : 'all spent, top-up soon'}</p>
      </section>`);
    parts.push(flags.join(''));

    const weekSpends = state.spends.filter((x) => x.date >= week.start && x.date < week.end).sort((a, b) => (a.date < b.date ? 1 : -1));
    parts.push(`
      <div class="card stack">
        <h2>Spent something?</h2>
        <div class="row">
          <input id="qa-amount" class="grow qa-amount" type="number" inputmode="decimal" step="0.01" placeholder="£0">
          <button class="circle" data-action="add-spend">Add</button>
        </div>
        <div class="chips">${CATS.map((c2) => `<button class="chip ${ui.cat === c2 ? 'on' : ''}" data-action="cat" data-cat="${c2}">${c2}</button>`).join('')}</div>
        <input id="qa-note" type="text" placeholder="What was it? (optional)">
        <div class="row">
          <label class="btn soft grow" style="text-align:center">Import Apple Pay taps<input type="file" accept=".txt,text/plain" data-action="inbox-file" hidden></label>
          <button class="soft" data-action="inbox-paste">Paste</button>
        </div>
        ${state.inboxLast ? `<p class="label">Apple Pay taps last imported ${fmtDate(state.inboxLast)}. Set-up is in More.</p>` : '<p class="label">Want taps logged automatically? Set-up is in More.</p>'}
        ${weekSpends.length ? `<div class="list">${weekSpends.map((x) => `
          <div class="item row">${monogram(x.note || x.cat)}<div class="grow">${esc(x.note || x.cat)}<br><span class="label">${esc(x.cat)} · ${fmtDate(x.date)}</span></div>
          <span class="card-amount">−${money(x.amount)}</span><button class="ghost" data-action="del-spend" data-id="${x.id}" aria-label="Delete">✕</button></div>`).join('')}</div>` : '<p class="label">Nothing logged this week yet.</p>'}
      </div>`);

    if (plan.locked) {
      const items = checklistItems(plan, s);
      const done = items.filter((i) => plan.checklist[i.key]).length;
      if (done < items.length) {
        parts.push(`
          <div class="card colour" style="background:var(--c3)">
            <div class="row between"><h2>Payday checklist</h2><span class="muted small">${done} of ${items.length}</span></div>
            <div class="list">${items.map((i) => `
              <label class="item row"><input type="checkbox" data-action="tick" data-key="${esc(i.key)}" ${plan.checklist[i.key] ? 'checked' : ''}><span class="grow">${esc(i.text)}</span></label>`).join('')}</div>
          </div>`);
      }
    }

    // Countdowns: payday, debt-free day, pot goals.
    const cd = [];
    cd.push(`<div class="item row between"><span>Payday</span><b>${fmtDate(c.end)} · ${B.daysBetween(t, c.end)} days</b></div>`);
    const future = state.debts.flatMap((d) => (d.payments || []).filter((p) => p.date >= t).map((p) => ({ ...p, name: d.name })));
    if (future.length) {
      const last = future.sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
      cd.push(`<div class="item row between"><span>Last debt payment</span><b>${esc(last.name)} · ${fmtDate(last.date)} · ${B.daysBetween(t, last.date)} days</b></div>`);
    }
    for (const pot of state.pots.filter((p) => Number(p.target) > 0)) {
      const f = (Number(pot.saved) || 0) / Number(pot.target);
      cd.push(`<div class="item"><div class="row between"><span>${esc(pot.name)}</span><b class="num">${money(pot.saved || 0)} / ${money(pot.target)}</b></div>${bar(f, f >= 1 ? 'good' : '')}${pot.deadline ? `<p class="muted small" style="margin-top:4px">by ${fmtDate(pot.deadline)}</p>` : ''}</div>`);
    }
    parts.push(`<div class="card ink"><h2>Countdowns</h2><div class="list">${cd.join('')}</div></div>`);

    // Totals stay blurred until tapped: seeing the big number is the trigger.
    const sumKind = (...kinds) => B.sum(state.accounts.filter((a) => kinds.includes(a.kind)), (a) => a.balance);
    const cash = sumKind('cash', 'savings');
    const invest = sumKind('invest');
    const owed = B.sum(state.debts, (d) => d.balance);
    parts.push(`
      <div class="card" data-action="toggle-totals" style="cursor:pointer">
        <div class="row between"><h2>Total money</h2><span class="muted small">${ui.showTotals ? 'tap to hide' : 'tap to show'}</span></div>
        <div class="${ui.showTotals ? '' : 'hidden-total'}">
          <div class="list">
            <div class="item row between"><span>Cash and savings</span><b class="num">${money(cash)}</b></div>
            <div class="item row between"><span>ISA and LISA</span><b class="num">${money(invest)}</b></div>
            <div class="item row between"><span>Owed</span><b class="num bad">${money(-owed)}</b></div>
            <div class="item row between"><span><b>Worth overall</b></span><b class="num">${money(cash + invest - owed)}</b></div>
          </div>
          ${state.balancesUpdated ? `<p class="muted small">Balances last updated ${fmtDate(state.balancesUpdated)}</p>` : ''}
        </div>
      </div>`);
    return parts.join('');
  }

  // ---------- Plan ----------

  function planFlags(s, plan) {
    const out = [];
    const min = Number(state.settings.minWeekly) || 0;
    if (s.flags.includes('over')) {
      out.push(flagHtml('bad', plan.locked
        ? `<b>You're ${money(-s.left)} short</b> after that unexpected cost. Unlock and slide a pot down, or spend less from the weekly money.`
        : `<b>You've planned ${money(-s.left)} more than you have.</b> Pull a slider down.`));
    }
    if (s.flags.includes('weeklySqueezed')) {
      out.push(flagHtml('bad', `<b>Your pots leave only ${money(Math.max(0, s.maxWeekly))} a week</b> for the weekly spender, under your ${money(min)} food minimum.`));
    } else if (s.flags.includes('weeklyLow')) {
      out.push(flagHtml('warn', `<b>Weekly spender is under your ${money(min)} minimum.</b> That's your food money, so it'll run out.`));
    }
    if (!out.length && s.left >= 0) {
      out.push(flagHtml('good', s.left > 0 ? `${money(s.left)} not given a job yet. Give it a pot, or leave it as a buffer.` : 'Every pound has a job.'));
    }
    return out.join('');
  }

  function potHint(pot) {
    const target = Number(pot.target) || 0;
    if (!target) return '';
    const saved = Number(pot.saved) || 0;
    let hint = `${money(saved)} of ${money(target)} saved`;
    if (pot.deadline && saved < target) {
      const months = Math.max(1, Math.round(B.daysBetween(today(), pot.deadline) / 30.4));
      hint += ` · needs about ${money(Math.ceil((target - saved) / months))}/month to hit ${fmtDate(pot.deadline)}`;
    }
    return hint;
  }

  /** One slider card. `cardClass`/`bg` give it the ink or colourful look. */
  function slider(id, label, value, max, hint, locked, cardClass, bg) {
    return `
      <div class="card ${cardClass}"${bg ? ` style="background:${bg}"` : ''}>
        <div class="row between"><span class="card-title">${esc(label)}</span><span class="card-amount" id="lbl-${id}">${money(value)}</span></div>
        <input type="range" min="0" max="${max}" step="5" value="${value}" data-slider="${id}" ${locked ? 'disabled' : ''} aria-label="${esc(label)}">
        <p class="label" id="hint-${id}">${hint || ''}</p>
      </div>`;
  }

  function weeklyHint(s) {
    const min = money(Number(state.settings.minWeekly) || 0);
    let warning = '';
    if (s.flags.includes('weeklySqueezed')) warning = `<br><b class="bad">⚠ Too low: your pots only leave ${money(Math.max(0, s.maxWeekly))}/week, under your ${min} food minimum.</b>`;
    else if (s.flags.includes('weeklyLow')) warning = `<br><b class="warn">⚠ Under your ${min} food minimum.</b>`;
    else if (s.weekly > s.maxWeekly) warning = `<br><b class="bad">⚠ More than you can afford with these pots.</b>`;
    return `× ${s.drops} top-ups = <b>${money(s.weeklyTotal)}</b> · about ${money(s.perDay)} a day. Most you can afford with these pots: ${money(Math.max(0, s.maxWeekly))}/week.${warning}`;
  }

  function viewPlan() {
    if (isEmpty()) return viewWelcome();
    const c = cycle();
    const plan = currentPlan();
    const s = B.planSummary(state, plan, c);
    const locked = plan.locked;
    const parts = [];
    parts.push(`<h1>This month's<br>plan</h1><p class="label">${fmtDate(c.start)} to ${fmtDate(B.addDays(c.end, -1))} · weekly money tops up ${s.drops} times</p>`);
    if (locked) {
      parts.push(flagHtml('good', `<b>Locked in on ${fmtDate(plan.lockedAt)}.</b> The sliders are frozen. If something unexpected comes out, add it below and the plan updates. <button class="ghost" data-action="unlock">Unlock</button>`));
    }

    parts.push(`
      <div class="card stack">
        <h2>Money for this month</h2>
        <div class="row between"><span class="grow muted small">What's in your main account on payday (after anything that's already gone)</span>
          ${editInput('plan.startTotal', plan.startTotal, 'num', `class="money" ${locked ? 'disabled' : ''}`)}</div>
        ${(plan.adjustments || []).length ? `<div class="list">${plan.adjustments.map((a) => `
          <div class="item row"><span class="grow">${esc(a.note || 'Unexpected')} <span class="muted small">· ${fmtDate(a.date)}</span></span>
          <b class="num ${a.amount < 0 ? 'bad' : 'good'}">${money(a.amount)}</b><button class="ghost" data-action="del-adj" data-id="${a.id}" aria-label="Delete">✕</button></div>`).join('')}</div>` : ''}
        <p class="small muted">Something random came out (or came in)?</p>
        <div class="row">
          <input id="adj-amount" class="grow" type="number" inputmode="decimal" step="0.01" placeholder="£">
          <select id="adj-dir" style="width:auto"><option value="-1">came out</option><option value="1">came in</option></select>
        </div>
        <div class="row"><input id="adj-note" class="grow" type="text" placeholder="What was it?"><button data-action="add-adj">Add</button></div>
      </div>`);

    parts.push(`
      <div class="card">
        <div class="row between"><h2>Goes out anyway</h2><b class="num">${money(s.fixed)}</b></div>
        <div class="list">
          ${state.bills.map((b) => `<div class="item row between"><span>${esc(b.name)}${b.day ? ` <span class="muted small">· ${b.day}${ordinal(b.day)}</span>` : ''}</span><span class="num">${money(b.amount)}</span></div>`).join('')}
          ${s.debtPays.map((p) => `<div class="item row between"><span>${esc(p.name)} <span class="muted small">· ${fmtDate(p.date)}</span></span><span class="num">${money(p.amount)}</span></div>`).join('')}
        </div>
        <button class="ghost" data-action="go" data-to="money">Edit bills and debts →</button>
      </div>`);

    parts.push(`<h2 style="margin-top:18px">Weekly spender</h2>
      ${slider('weekly', 'Every ' + DAYS[state.settings.topUpWeekday], plan.weekly, 300, weeklyHint(s), locked, 'ink')}`);

    parts.push(`<h2 style="margin-top:18px">Pots</h2>
      ${state.pots.length
        ? `<div class="stackcards">${state.pots.map((p, i) => slider('pot-' + p.id, p.name, Number(plan.pots[p.id]) || 0, Math.max(1000, Number(plan.pots[p.id]) || 0), potHint(p), locked, 'colour', colour(i))).join('')}</div>`
        : '<p class="muted">No pots yet. Add them in More.</p>'}`);

    parts.push(`<div id="plan-flags">${planFlags(s, plan)}</div>`);
    parts.push(`
      <div class="summary">
        <div class="cells">
          <div>Money<b class="num" id="sum-total">${money(s.total)}</b></div>
          <div>Fixed<b class="num" id="sum-fixed">${money(s.fixed)}</b></div>
          <div>Weekly<b class="num" id="sum-weekly">${money(s.weeklyTotal)}</b></div>
          <div>Pots<b class="num" id="sum-pots">${money(s.potsTotal)}</b></div>
        </div>
        <div class="row between" style="margin-top:8px"><span>Left over</span><span class="left num ${s.left < 0 ? 'bad' : ''}" id="sum-left">${money(s.left)}</span></div>
      </div>`);
    if (!locked) {
      parts.push(`<button class="full" id="lock-btn" data-action="lock" ${s.left < 0 ? 'disabled' : ''}>${s.left < 0 ? 'Over-allocated: can\'t lock yet' : 'Lock in this plan'}</button>`);
    }
    return parts.join('');
  }

  function ordinal(n) {
    const d = Number(n);
    if (d >= 11 && d <= 13) return 'th';
    return { 1: 'st', 2: 'nd', 3: 'rd' }[d % 10] || 'th';
  }

  /** Called while a slider moves: update numbers in place so the drag isn't interrupted. */
  function updatePlanLive() {
    const plan = currentPlan();
    const s = B.planSummary(state, plan, cycle());
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('sum-total', money(s.total));
    set('sum-fixed', money(s.fixed));
    set('sum-weekly', money(s.weeklyTotal));
    set('sum-pots', money(s.potsTotal));
    set('sum-left', money(s.left));
    const left = document.getElementById('sum-left');
    if (left) left.className = 'left num ' + (s.left < 0 ? 'bad' : '');
    set('hint-weekly', weeklyHint(s));
    set('plan-flags', planFlags(s, plan));
    const btn = document.getElementById('lock-btn');
    if (btn) {
      btn.disabled = s.left < 0;
      btn.textContent = s.left < 0 ? 'Over-allocated: can\'t lock yet' : 'Lock in this plan';
    }
  }

  // ---------- Money ----------

  // ---------- statement import ----------

  function rebuildStatement() {
    const st = ui.stmt;
    const tx = B.toTransactions(st.rows, st.cols);
    st.preview = B.statementPreview(tx, state.spends, cycle().start);
    st.notSpendAccount = ui.stmtAccount !== state.settings.spendAccount;
    if (st.notSpendAccount) st.preview.forEach((r) => { r.include = false; });
    st.latest = st.cols.balance >= 0 ? B.latestBalance(st.rows, st.cols, st.cols.balance) : null;
  }

  function viewStatement() {
    if (!state.accounts.length) return '';
    if (!ui.stmtAccount) ui.stmtAccount = state.settings.spendAccount || state.accounts[0].id;
    let html = `
      <div class="card stack">
        <h2>Import a statement</h2>
        <p class="label">Export a CSV from your banking app and pick it here. It logs this month's spending and can update the balance. The file is read on this phone only.</p>
        <label class="field">Which account is it?
          <select id="stmt-account">${state.accounts.map((a) => `<option value="${a.id}" ${ui.stmtAccount === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
        <label class="btn soft full" style="display:block;text-align:center">Choose CSV file<input type="file" accept=".csv,text/csv" data-action="stmt-file" hidden></label>`;
    const st = ui.stmt;
    if (st) {
      const pick = (field, allowNone) => `<select data-stmt="${field}">${allowNone ? `<option value="-1" ${st.cols[field] < 0 ? 'selected' : ''}>none</option>` : ''}${st.headers.map((h, i) => `<option value="${i}" ${st.cols[field] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select>`;
      const ticked = st.preview.filter((r) => r.include).length;
      html += `
        <table class="map">
          <tr><td>Date</td><td>${pick('date')}</td></tr>
          <tr><td>Description</td><td>${pick('desc')}</td></tr>
          <tr><td>Amount</td><td>${pick('amount')}</td></tr>
          <tr><td>Balance</td><td>${pick('balance', true)}</td></tr>
        </table>
        <label class="row small"><input type="checkbox" data-stmt="outPositive" ${st.cols.outPositive ? 'checked' : ''}> This column only has money going out (no minus signs)</label>
        ${st.notSpendAccount ? flagHtml('warn', "This isn't your weekly spender account, so nothing is ticked. Only tick everyday spends, not bills or pot moves.") : ''}
        ${st.preview.length ? `
          <p class="small"><b>${ticked}</b> of ${st.preview.length} payments since payday (${fmtDate(cycle().start)}) will be logged. Pot moves and ones already logged start unticked.</p>
          <div class="list">${st.preview.map((r, i) => `
            <label class="item row"><input type="checkbox" data-stmt-row="${i}" ${r.include ? 'checked' : ''}>
              <span class="grow">${esc(r.desc)}<br><span class="label">${fmtDate(r.date)} · ${r.cat}${r.duplicate ? ' · already logged' : ''}${r.transfer ? ' · looks like a transfer' : ''}</span></span>
              <span class="card-amount">−${money(r.amount)}</span></label>`).join('')}</div>`
          : '<p class="muted">No money going out since payday in this file. Check the columns above.</p>'}
        ${st.latest ? `<label class="row small"><input type="checkbox" id="stmt-bal" checked> Set the balance to <b>${money(st.latest.balance)}</b> (from ${fmtDate(st.latest.date)})</label>` : ''}
        <div class="row"><button class="grow" data-action="stmt-import">Import</button><button class="soft" data-action="stmt-cancel">Cancel</button></div>`;
    }
    return html + '</div>';
  }

  function viewMoney() {
    const accounts = state.accounts.map((a, i) => `
      <div class="item stack">
        <div class="row">${editInput(`accounts.${i}.name`, a.name, 'text', 'class="grow" placeholder="Name"')}
          ${editInput(`accounts.${i}.balance`, a.balance, 'num', 'class="money"')}</div>
        <div class="row"><select data-edit="accounts.${i}.kind" data-type="text" class="grow">
          ${[['cash', 'Spending / current'], ['savings', 'Savings pot'], ['invest', 'ISA / investments']].map(([v, l]) => `<option value="${v}" ${a.kind === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select><button class="ghost" data-action="del" data-path="accounts.${i}">Remove</button></div>
      </div>`).join('');

    const bills = state.bills.map((b, i) => `
      <div class="item row">
        ${editInput(`bills.${i}.name`, b.name, 'text', 'class="grow" placeholder="Bill"')}
        ${editInput(`bills.${i}.day`, b.day, 'int', 'style="width:64px" placeholder="Day" min="1" max="31"')}
        ${editInput(`bills.${i}.amount`, b.amount, 'num', 'class="money" style="max-width:90px"')}
        <button class="ghost" data-action="del" data-path="bills.${i}" aria-label="Remove">✕</button>
      </div>`).join('');

    const debts = state.debts.map((d, i) => {
      const limit = Number(d.limit) || 0;
      const used = limit ? (Number(d.balance) || 0) / limit : 0;
      const target = Number(d.targetPct) || 0;
      const meter = limit ? `
        ${bar(used, target && used > target / 100 ? 'warn' : 'good', target ? target / 100 : null)}
        <p class="muted small" style="margin-top:4px">${Math.round(used * 100)}% of ${money(limit)} used${target ? ` · aim for under ${target}% (${money(limit * target / 100)})` : ''}</p>` : '';
      return `
        <div class="item stack">
          <div class="row">${editInput(`debts.${i}.name`, d.name, 'text', 'class="grow"')}
            <span class="muted small">owe</span>${editInput(`debts.${i}.balance`, d.balance, 'num', 'class="money" style="max-width:90px"')}</div>
          <div class="row">
            <label class="field grow">Limit ${editInput(`debts.${i}.limit`, d.limit, 'num')}</label>
            <label class="field grow">Aim under % ${editInput(`debts.${i}.targetPct`, d.targetPct, 'num')}</label>
          </div>
          ${meter}
          ${editInput(`debts.${i}.note`, d.note, 'text', 'placeholder="Note (e.g. £4/month if fully used)"')}
          <div class="small muted">Payments coming up</div>
          ${(d.payments || []).map((p, j) => `
            <div class="row">${editInput(`debts.${i}.payments.${j}.date`, p.date, 'date', 'class="grow"')}
              ${editInput(`debts.${i}.payments.${j}.amount`, p.amount, 'num', 'class="money" style="max-width:90px"')}
              <button class="ghost" data-action="del" data-path="debts.${i}.payments.${j}" aria-label="Remove">✕</button></div>`).join('')}
          <div class="row between"><button class="ghost" data-action="add-payment" data-i="${i}">+ Payment</button>
            <button class="ghost" data-action="del" data-path="debts.${i}">Remove debt</button></div>
        </div>`;
    }).join('');

    return `
      <h1>Money</h1>
      <div class="card">
        <div class="row between"><h2>Accounts</h2><button class="ghost" data-action="add-account">+ Add</button></div>
        <p class="muted small">Update these whenever you check your banking apps.${state.balancesUpdated ? ` Last updated ${fmtDate(state.balancesUpdated)}.` : ''}</p>
        <div class="list">${accounts || '<p class="muted">No accounts yet.</p>'}</div>
      </div>
      ${viewStatement()}
      <div class="card">
        <div class="row between"><h2>Monthly bills</h2><b class="num">${money(B.sum(state.bills, (b) => b.amount))}</b></div>
        <div class="list">${bills || '<p class="muted">No bills yet.</p>'}</div>
        <button class="ghost" data-action="add-bill">+ Add bill</button>
      </div>
      <div class="card">
        <div class="row between"><h2>Debts</h2><button class="ghost" data-action="add-debt">+ Add</button></div>
        <div class="list">${debts || '<p class="muted">No debts. Nice.</p>'}</div>
      </div>`;
  }

  // ---------- Subscriptions ----------

  const HUNT = [
    ['apple', 'iPhone: Settings → your name → Subscriptions'],
    ['paypal', 'PayPal: Settings → Payments → Automatic payments'],
    ['revolut', 'Revolut: check the card\'s recurring / saved merchants'],
    ['lloyds', 'Lloyds: Direct Debits and standing orders'],
    ['monzo', 'Monzo: Payments → Direct Debits and recurring card payments'],
    ['amazon', 'Amazon: Prime and other memberships'],
    ['trials', 'Free trials you signed up for and forgot about'],
  ];

  function viewSubs() {
    const totals = B.subsTotals(state.subs);
    const list = state.subs.map((s, i) => `
      <div class="card colour stack" style="background:${colour(i + 1)}">
        <div class="row">${monogram(s.name)}${editInput(`subs.${i}.name`, s.name, 'text', 'class="grow"')}
          ${editInput(`subs.${i}.amount`, s.amount, 'num', 'class="money" style="max-width:90px"')}</div>
        <div class="row between">
          <select data-edit="subs.${i}.freq" data-type="text" style="width:auto">${['weekly', 'monthly', 'yearly'].map((f) => `<option ${s.freq === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
          <div class="chips">${['keep', 'review', 'cancel'].map((v) => `<button class="chip ${s.verdict === v ? 'on' : ''}" data-action="verdict" data-i="${i}" data-v="${v}">${v}</button>`).join('')}</div>
          <button class="ghost" data-action="del" data-path="subs.${i}" aria-label="Remove">✕</button>
        </div>
        <p class="label">${money(B.monthlyCost(s))}/month · ${money(B.monthlyCost(s) * 12)}/year${s.from === 'csv' ? ' · found in your statement' : ''}</p>
      </div>`).join('');

    let importer = `
      <p class="muted small">Export your transactions as a CSV from Revolut, Lloyds or Monzo (a few months is best) and pick the file here. It's read on this phone only and never uploaded.</p>
      <label class="btn soft full" style="display:block;text-align:center">Choose CSV file<input type="file" accept=".csv,text/csv" data-action="csv" hidden></label>`;
    if (ui.csv) {
      const { headers, cols } = ui.csv;
      const pick = (field) => `<select data-csv="${field}">${headers.map((h, i) => `<option value="${i}" ${cols[field] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select>`;
      importer += `
        <p class="small" style="margin-top:10px">${ui.csv.rows.length} rows found. Check the columns are right:</p>
        <table class="map">
          <tr><td>Date</td><td>${pick('date')}</td></tr>
          <tr><td>Description</td><td>${pick('desc')}</td></tr>
          <tr><td>Amount</td><td>${pick('amount')}</td></tr>
        </table>
        <label class="row small" style="margin:8px 0"><input type="checkbox" data-csv="outPositive" ${cols.outPositive ? 'checked' : ''}> This column only has money going out (no minus signs)</label>
        <button class="full" data-action="find-subs">Find repeat payments</button>`;
    }
    if (ui.found) {
      const known = new Set(state.subs.map((s) => B.merchantKey(s.name)));
      importer += ui.found.length ? `<div class="list" style="margin-top:10px">${ui.found.map((f, i) => `
        <div class="item row"><div class="grow"><b>${esc(f.name)}</b><br><span class="muted small">${money(f.amount)} ${f.freq} · ${f.count} payments · last ${fmtDate(f.lastDate)}${f.stillGoing ? '' : ' · may have stopped'}</span></div>
        ${known.has(f.key) ? '<span class="muted small">added</span>' : `<button class="soft" data-action="add-found" data-i="${i}">Add</button>`}</div>`).join('')}</div>`
        : '<p class="muted" style="margin-top:10px">No repeat payments found. Try a longer date range, or check the columns.</p>';
    }

    return `
      <section class="hero">
        <h1>Secret<br>subscriptions</h1>
        <div class="hero-num">
          <span class="label">${money(totals.perYear)} a year<br>${state.subs.length} subscription${state.subs.length === 1 ? '' : 's'}</span>
          <span class="huge">${bigMoney(totals.perMonth)}<span class="pence" style="font-size:20px">/mo</span></span>
        </div>
      </section>
      ${totals.savePerYear ? flagHtml('good', `Cancelling the ones marked <b>cancel</b> saves <b>${money(totals.savePerYear)} a year</b>.`) : ''}
      <div class="row between"><h2>Yours</h2><button class="ghost" data-action="add-sub">+ Add</button></div>
      ${list ? `<div class="stackcards">${list}</div>` : '<div class="card"><p class="muted">None yet. Add them by hand or find them in a bank statement below.</p></div>'}
      <div class="card"><h2>Find them in a statement</h2>${importer}</div>
      <div class="card">
        <h2>Where they hide</h2>
        <div class="list">${HUNT.map(([k, t]) => `<label class="item row"><input type="checkbox" data-action="hunt" data-key="${k}" ${state.subHunt[k] ? 'checked' : ''}><span class="grow">${t}</span></label>`).join('')}</div>
      </div>`;
  }

  // ---------- More ----------

  function viewMore() {
    const st = state.settings;
    const pots = state.pots.map((p, i) => `
      <div class="item stack">
        <div class="row">${editInput(`pots.${i}.name`, p.name, 'text', 'class="grow"')}<button class="ghost" data-action="del" data-path="pots.${i}">Remove</button></div>
        <div class="row">
          <label class="field grow">Target ${editInput(`pots.${i}.target`, p.target, 'num')}</label>
          <label class="field grow">Saved so far ${editInput(`pots.${i}.saved`, p.saved, 'num')}</label>
        </div>
        <div class="row">
          <label class="field grow">Goal date ${editInput(`pots.${i}.deadline`, p.deadline, 'date')}</label>
          <label class="field grow">Where it lives ${editInput(`pots.${i}.where`, p.where, 'text')}</label>
        </div>
      </div>`).join('');
    return `
      <h1>More</h1>
      <div class="card">
        <div class="row between"><h2>Pots</h2><button class="ghost" data-action="add-pot">+ Add</button></div>
        <p class="muted small">Ticking "Move £X → pot" on the payday checklist adds it to "saved so far" for you.</p>
        <div class="list">${pots || '<p class="muted">No pots yet.</p>'}</div>
      </div>
      <div class="card stack">
        <h2>Settings</h2>
        <div class="row">
          <label class="field grow">Payday (day of month) ${editInput('settings.paydayDay', st.paydayDay, 'int', 'min="1" max="31"')}</label>
          <label class="field grow">Usual take-home pay ${editInput('settings.payAmount', st.payAmount, 'num')}</label>
        </div>
        <div class="row">
          <label class="field grow">Weekly top-up day <select data-edit="settings.topUpWeekday" data-type="int">${DAYS.map((d, i) => `<option value="${i}" ${Number(st.topUpWeekday) === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
          <label class="field grow">Weekly minimum (food) ${editInput('settings.minWeekly', st.minWeekly, 'num')}</label>
        </div>
        <div class="row">
          <label class="field grow">Safety floor ${editInput('settings.safetyFloor', st.safetyFloor, 'num', 'placeholder="e.g. 300"')}</label>
          <label class="field grow">For account <select data-edit="settings.floorAccount" data-type="text"><option value="">none</option>${state.accounts.map((a) => `<option value="${a.id}" ${st.floorAccount === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
        </div>
        <label class="field">Weekly spender account (statements from this one are ticked by default)
          <select data-edit="settings.spendAccount" data-type="text"><option value="">none</option>${state.accounts.map((a) => `<option value="${a.id}" ${st.spendAccount === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      </div>
      <div class="card colour stack" style="background:var(--c1)">
        <h2>Apple Pay auto-log</h2>
        <p>Each time you tap your card with Apple Pay, an iPhone Shortcut quietly writes it to a small file. Tap <b>Import Apple Pay taps</b> on Home and pick that file, and every new tap gets logged. Importing the same file again never counts anything twice.</p>
        <p class="label">One-time set-up, about 3 minutes. Menu names can differ a little between iOS versions.</p>
        <ol style="padding-left:20px;margin:0">
          <li>Open <b>Shortcuts</b> → <b>Automation</b> → <b>+</b> → <b>Transaction</b>.</li>
          <li>Pick your <b>Revolut</b> card (your weekly spender), choose <b>Run Immediately</b>, then <b>Next</b> → <b>New Blank Automation</b>.</li>
          <li>Add <b>Format Date</b>: Current Date, Date Format <b>Custom</b>: <code>yyyy-MM-dd HH:mm</code></li>
          <li>Add <b>Text</b> and build this line, tapping each [bit] in as a variable:<br><code>DS|[Formatted Date]|[Shortcut Input → Amount]|[Shortcut Input → Merchant]|[Shortcut Input → Card]</code></li>
          <li>Add <b>Append to Text File</b>: append the Text to <code>dont-spend-inbox.txt</code> in iCloud Drive / Shortcuts, with <b>Make New Line</b> on.</li>
          <li>Pay for something small with Apple Pay, then import the file on Home to check it worked.</li>
        </ol>
        <p class="label">It only sees Apple Pay taps, not online card payments or direct debits. Import a statement on the Money tab once a week to catch the rest. Anything already logged from a tap won't be counted again.</p>
      </div>
      <div class="card stack">
        <h2>Backup</h2>
        <p class="muted small">Your numbers live only on this phone. Export a backup now and then and save it to Files or iCloud Drive.</p>
        <button class="full" data-action="export">Export backup</button>
        <label class="btn soft full" style="display:block;text-align:center">Import backup<input type="file" accept=".json,application/json" data-action="import" hidden></label>
        ${ui.starter ? '<button class="soft full" data-action="load-starter">Load starter numbers</button>' : ''}
        <button class="ghost full" data-action="reset" style="color:var(--bad)">Wipe everything</button>
      </div>
      <p class="muted small">Tom Don't Spend is a planner, not financial advice. For investment or debt decisions, MoneyHelper is free and impartial.</p>`;
  }

  // ---------- rendering and events ----------

  const VIEWS = { home: viewHome, plan: viewPlan, money: viewMoney, subs: viewSubs, more: viewMore };

  function render() {
    document.getElementById('view').innerHTML = VIEWS[ui.tab]();
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  }

  function getParent(path) {
    const parts = path.split('.');
    const last = parts.pop();
    let obj = parts[0] === 'plan' ? { plan: currentPlan() } : state;
    for (const p of parts) obj = obj[p];
    return [obj, last];
  }

  function readValue(el) {
    const type = el.dataset.type;
    if (type === 'text' || type === 'date') return el.value === '' && type === 'date' ? null : el.value;
    if (el.value === '') return null;
    const n = type === 'int' ? parseInt(el.value, 10) : B.pennies(el.value);
    return Number.isFinite(n) ? n : null;
  }

  function onEdit(el) {
    const path = el.dataset.edit;
    const [obj, key] = getParent(path);
    obj[key] = readValue(el);
    if (path.startsWith('accounts.') && path.endsWith('.balance')) state.balancesUpdated = today();
    save();
    render();
  }

  function remove(path) {
    const [list, idx] = getParent(path);
    list.splice(Number(idx), 1);
    save();
    render();
  }

  function importState(obj) {
    if (!obj || typeof obj !== 'object' || !obj.settings || !Array.isArray(obj.accounts)) {
      toast("That file doesn't look like a Tom Don't Spend backup.");
      return;
    }
    state = Object.assign(emptyState(), obj);
    save();
    ui.tab = 'home';
    render();
    toast('Loaded.');
  }

  function readFile(input, cb) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => cb(String(reader.result));
    reader.readAsText(file);
    input.value = '';
  }

  /** Logs new Apple Pay taps from the Shortcut's inbox text (see More → Apple Pay auto-log). */
  function importInbox(text) {
    const taps = B.parseInbox(text);
    if (!taps.length) { toast('No Apple Pay taps found in that.'); return; }
    const { fresh, skipped } = B.inboxToAdd(taps, state.spends, cycle().start);
    for (const t of fresh) {
      state.spends.push({ id: uid(), date: t.date, amount: t.amount, cat: B.guessCategory(t.merchant), note: t.merchant, source: 'applepay', key: t.key });
    }
    state.inboxLast = today();
    save(); render();
    toast(`${fresh.length} new tap${fresh.length === 1 ? '' : 's'} logged${skipped ? `, ${skipped} already in` : ''}`);
  }

  const actions = {
    go(el) { ui.tab = el.dataset.to; render(); window.scrollTo(0, 0); },
    cat(el) { ui.cat = el.dataset.cat; document.querySelectorAll('[data-action="cat"]').forEach((b) => b.classList.toggle('on', b.dataset.cat === ui.cat)); },
    'add-spend'() {
      const amt = B.pennies(document.getElementById('qa-amount').value);
      if (!(amt > 0)) { toast('Type an amount first.'); return; }
      const note = document.getElementById('qa-note').value.trim();
      state.spends.push({ id: uid(), date: today(), amount: amt, cat: ui.cat, note, source: 'manual' });
      save(); render(); toast(`Logged ${money(amt)}`);
    },
    'del-spend'(el) { state.spends = state.spends.filter((x) => x.id !== el.dataset.id); save(); render(); },
    tick(el) {
      const plan = currentPlan();
      const key = el.dataset.key;
      const on = el.checked;
      plan.checklist[key] = on;
      if (key.startsWith('pot:')) {
        const pot = state.pots.find((p) => p.id === key.slice(4));
        const amt = Number(plan.pots[pot && pot.id]) || 0;
        if (pot) pot.saved = B.pennies((Number(pot.saved) || 0) + (on ? amt : -amt));
      }
      save(); render();
      if (on) toast('Done ✓');
    },
    'toggle-totals'() { ui.showTotals = !ui.showTotals; render(); },
    lock() {
      const plan = currentPlan();
      plan.locked = true; plan.lockedAt = today();
      save(); ui.tab = 'home'; render(); window.scrollTo(0, 0);
      toast('Locked in. Your payday checklist is on Home.');
    },
    unlock() {
      if (!confirm('Unlock this month\'s plan so you can move the sliders?')) return;
      currentPlan().locked = false; save(); render();
    },
    'add-adj'() {
      const amt = B.pennies(document.getElementById('adj-amount').value);
      if (!(amt > 0)) { toast('Type an amount first.'); return; }
      const dir = Number(document.getElementById('adj-dir').value);
      const note = document.getElementById('adj-note').value.trim();
      currentPlan().adjustments.push({ id: uid(), date: today(), amount: B.pennies(amt * dir), note });
      save(); render();
    },
    'del-adj'(el) { const p = currentPlan(); p.adjustments = p.adjustments.filter((a) => a.id !== el.dataset.id); save(); render(); },
    del(el) { remove(el.dataset.path); },
    'add-account'() { state.accounts.push({ id: uid(), name: 'New account', kind: 'cash', balance: 0 }); save(); render(); },
    'add-bill'() { state.bills.push({ id: uid(), name: 'New bill', amount: 0, day: null }); save(); render(); },
    'add-debt'() { state.debts.push({ id: uid(), name: 'New debt', balance: 0, limit: null, targetPct: null, note: '', payments: [] }); save(); render(); },
    'add-payment'(el) { state.debts[Number(el.dataset.i)].payments.push({ date: today(), amount: 0 }); save(); render(); },
    'add-pot'() { state.pots.push({ id: uid(), name: 'New pot', target: null, saved: 0, deadline: null, where: '' }); save(); render(); },
    'add-sub'() { state.subs.push({ id: uid(), name: 'New subscription', amount: 0, freq: 'monthly', verdict: 'review', from: 'manual' }); save(); render(); },
    verdict(el) { state.subs[Number(el.dataset.i)].verdict = el.dataset.v; save(); render(); },
    hunt(el) { state.subHunt[el.dataset.key] = el.checked; save(); },
    'inbox-paste'() {
      if (!navigator.clipboard || !navigator.clipboard.readText) { toast('Paste isn\'t available here. Use the file button.'); return; }
      navigator.clipboard.readText().then(importInbox, () => toast('Couldn\'t read the clipboard. Use the file button.'));
    },
    'stmt-import'() {
      const st = ui.stmt;
      let n = 0;
      for (const r of st.preview) {
        if (!r.include) continue;
        state.spends.push({ id: uid(), date: r.date, amount: r.amount, cat: r.cat, note: r.desc, source: 'statement', key: B.spendKey(r.date, r.amount, r.desc) });
        n++;
      }
      const bal = document.getElementById('stmt-bal');
      if (st.latest && bal && bal.checked) {
        const acct = state.accounts.find((a) => a.id === ui.stmtAccount);
        if (acct) { acct.balance = st.latest.balance; state.balancesUpdated = today(); }
      }
      ui.stmt = null;
      save(); render();
      toast(`${n} spend${n === 1 ? '' : 's'} logged${bal && bal.checked ? ', balance updated' : ''}`);
    },
    'stmt-cancel'() { ui.stmt = null; render(); },
    'find-subs'() {
      const { rows, cols } = ui.csv;
      const tx = B.toTransactions(rows, cols);
      ui.found = B.findRecurring(tx, today());
      render();
      toast(`${tx.length} payments read, ${ui.found.length} repeat${ui.found.length === 1 ? '' : 's'} found`);
    },
    'add-found'(el) {
      const f = ui.found[Number(el.dataset.i)];
      state.subs.push({ id: uid(), name: f.name, amount: f.amount, freq: f.freq, verdict: 'review', from: 'csv' });
      save(); render();
    },
    export() {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `dont-spend-backup-${today()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
    'load-starter'() {
      if (!isEmpty() && !confirm('Replace what\'s in the app now with the starter numbers?')) return;
      importState(JSON.parse(JSON.stringify(ui.starter)));
    },
    reset() {
      if (!confirm('Wipe all your numbers from this phone? Export a backup first if you might want them.')) return;
      state = emptyState(); save(); ui.tab = 'home'; render();
    },
  };

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('#tabs button');
    if (tab) { ui.tab = tab.dataset.tab; render(); window.scrollTo(0, 0); return; }
    const el = e.target.closest('[data-action]');
    if (!el || el.type === 'file' || el.type === 'checkbox') return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el); }
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset.slider) return;
    const plan = currentPlan();
    const v = Number(el.value);
    if (el.dataset.slider === 'weekly') plan.weekly = v;
    else plan.pots[el.dataset.slider.slice(4)] = v;
    const lbl = document.getElementById('lbl-' + el.dataset.slider);
    if (lbl) lbl.textContent = money(v);
    updatePlanLive();
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.slider) { save(); return; }
    if (el.dataset.edit) { onEdit(el); return; }
    if (el.dataset.csv) {
      ui.csv.cols[el.dataset.csv] = el.type === 'checkbox' ? el.checked : Number(el.value);
      ui.found = null;
      return;
    }
    if (el.dataset.stmt) {
      ui.stmt.cols[el.dataset.stmt] = el.type === 'checkbox' ? el.checked : Number(el.value);
      rebuildStatement(); render();
      return;
    }
    if (el.dataset.stmtRow) { ui.stmt.preview[Number(el.dataset.stmtRow)].include = el.checked; return; }
    if (el.id === 'stmt-account') { ui.stmtAccount = el.value; if (ui.stmt) { rebuildStatement(); render(); } return; }
    const action = el.dataset.action;
    if (action === 'tick' || action === 'hunt') { actions[action](el); return; }
    if (action === 'inbox-file') readFile(el, importInbox);
    if (action === 'stmt-file') {
      readFile(el, (text) => {
        const rows = B.parseCSV(text);
        if (rows.length < 2) { toast('That CSV looks empty.'); return; }
        const headers = rows[0];
        const cols = B.guessColumns(headers);
        for (const k of ['date', 'desc', 'amount']) if (cols[k] < 0) cols[k] = 0;
        cols.balance = B.balanceColumn(headers);
        ui.stmt = { headers, rows: rows.slice(1), cols };
        rebuildStatement(); render();
      });
    }
    if (action === 'import') {
      readFile(el, (text) => { try { importState(JSON.parse(text)); } catch (err) { toast('Couldn\'t read that file.'); } });
    }
    if (action === 'csv') {
      readFile(el, (text) => {
        const rows = B.parseCSV(text);
        if (rows.length < 2) { toast('That CSV looks empty.'); return; }
        const headers = rows[0];
        const cols = B.guessColumns(headers);
        for (const k of ['date', 'desc', 'amount']) if (cols[k] < 0) cols[k] = 0;
        ui.csv = { headers, rows: rows.slice(1), cols };
        ui.found = null;
        render();
      });
    }
  });

  // A starter file sits next to the app on your Mac only (it's never published).
  fetch('private/starter.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) { ui.starter = j; if (isEmpty() || ui.tab === 'more') render(); } })
    .catch(() => {});

  render();
})();
