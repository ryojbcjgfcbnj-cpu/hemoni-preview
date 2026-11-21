'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const key = 'jiaozhen-interactive-demo-v2';
  const cases = {
    acquisition: { title: '并购条款 · 补偿与奖励口径', threshold: 90, reward: 80, answer: '当收入达成比例低于80%时触发收入补偿，达到80%（含本数）则不触发。\n\n超额奖励按超额利润的90%计算，奖励金额不超过交易价格的20%。' },
    same: { title: '同为 75% · 数字相同，字段不同', threshold: 75, reward: 75, answer: '收入补偿门槛应引用超额奖励比例，取值为75%。\n\n超额奖励按超额利润的75%计算，奖励金额不超过交易价格的20%。' },
  };
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
  let state = { caseId: 'acquisition', text: cases.acquisition.answer, version: 1, records: [], tokens: [], ...saved };
  if (!cases[state.caseId] || typeof state.text !== 'string' || !Number.isSafeInteger(state.version) || !Array.isArray(state.records) || !Array.isArray(state.tokens)) state = { caseId: 'acquisition', text: cases.acquisition.answer, version: 1, records: [], tokens: [] };
  let report = null, capture = null;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  function persist() { try { localStorage.setItem(key, JSON.stringify(state)); } catch { $('status').textContent = '当前浏览器无法保存，仍可体验；关闭页面后记录可能丢失。'; } }
  function clauses(id = state.caseId) {
    const c = cases[id];
    return [
      { id: 'threshold', title: '第 4.1 条 · 收入补偿触发线', text: '收入补偿触发线为' + c.threshold + '%。累计实际收入达到约定目标的' + c.threshold + '%（含本数）时，不触发本条收入补偿；低于该线时按合同另行计算补偿。' },
      { id: 'reward', title: '第 4.2 条 · 超额奖励比例', text: '达到超额奖励条件时，以超额利润的' + c.reward + '%计算奖励。该比例不用于判断收入补偿是否触发。' },
      { id: 'cap', title: '第 4.3 条 · 奖励上限', text: '超额奖励金额上限为标的资产交易价格的20%。奖励上限与收入补偿触发线分别适用。' },
    ];
  }
  function button(label, fn, cls = 'secondary') { const b = el('button', label, cls); b.type = 'button'; b.onclick = fn; return b; }
  function show(view) {
    for (const v of ['work', 'files', 'history', 'tokens', 'square']) $('view-' + v).hidden = v !== view;
    document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('status').textContent = '';
    if (view === 'files') renderFiles();
    if (view === 'history') renderHistory();
    if (view === 'tokens') renderTokens();
    if (view === 'square') renderSquare();
  }
  function reviewMode(enabled) { $('task-config').hidden = enabled; $('review-workspace').hidden = !enabled; }
  function locate(id) {
    show('work');
    reviewMode(true);
    document.querySelectorAll('.clause').forEach(n => n.classList.toggle('located', n.id === 'clause-' + id));
    $('clause-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('status').textContent = '已定位到虚构交易条款第 3 页 · ' + clauses().find(c => c.id === id).title;
  }
  function updateSteps(n) { document.querySelectorAll('.step').forEach((s, i) => s.classList.toggle('active', i <= n)); }
  function renderWork() {
    $('case-select').value = state.caseId; $('answer').value = state.text;
    $('version-label').textContent = '回答版本 v' + state.version;
    $('source').replaceChildren(...clauses().map(c => { const n = el('div', undefined, 'clause'); n.id = 'clause-' + c.id; n.append(el('h3', c.title), el('p', c.text)); return n; }));
    $('history-count').textContent = state.records.length;
    $('task-title').value = state.taskTitle || '未命名核查任务';
    $('task-requirements').value = state.requirements || '';
    if (state.dimensions) document.querySelectorAll('.dimension-card input').forEach(c => { c.checked = state.dimensions.includes(c.value); });
    if (state.scene) document.querySelectorAll('.scenario-option').forEach(c => { const yes = c.textContent.trim() === state.scene; c.classList.toggle('selected', yes); c.setAttribute('aria-pressed', String(yes)); });
    renderKnowledge();
  }
  function invalidate() {
    report = null;
    $('results').className = 'empty-state';
    $('results').replaceChildren(el('span', '◎', 'empty-symbol'), el('h3', '数字一致，还要口径一致'), el('p', '点击「较真一下」，看看回答引用了哪条合同依据。'));
    $('coverage').textContent = '等待开始'; $('result-count').textContent = '';
    $('knowledge').hidden = true; updateSteps(0);
  }
  function analyze() {
    const dimensions = [...document.querySelectorAll('.dimension-card input:checked')].map(c => c.value);
    if (!dimensions.length) { $('config-error').textContent = '请选择至少一个核查维度'; reviewMode(false); return; }
    $('config-error').textContent = '';
    state.dimensions = dimensions;
    state.taskTitle = $('task-title').value.trim() || '未命名核查任务';
    state.requirements = $('task-requirements').value;
    persist();
    reviewMode(true);
    const c = cases[state.caseId], text = state.text;
    const rows = [
      { id: 'threshold', title: '收入补偿触发口径', value: c.threshold, regex: /(?:收入补偿门槛应引用[^。]*?取值为|低于)(\d+(?:\.\d+)?)%/, replacement: '当收入达成比例低于' + c.threshold + '%时触发收入补偿，达到' + c.threshold + '%（含本数）则不触发。', match: text.split(/\n+/)[0], wrongRole: /收入补偿门槛应引用超额奖励比例/.test(text) },
      { id: 'reward', title: '超额奖励计算比例', value: c.reward, regex: /超额奖励按超额利润的(\d+(?:\.\d+)?)%/, replacement: null },
      { id: 'cap', title: '奖励金额上限', value: 20, regex: /奖励金额不超过交易价格的(\d+(?:\.\d+)?)%/, replacement: null },
    ];
    for (const r of rows) {
      const m = text.match(r.regex);
      r.verdict = !m ? 'unknown' : r.wrongRole || Number(m[1]) !== r.value ? 'conflict' : 'support';
      r.message = !m ? '预设规则无法识别这段表述，需要人工核查；本演示不做通用语义理解。' : r.wrongRole ? '显示值都是75%，但补偿判断引用了奖励字段。相同数值无法替代正确字段。' : r.verdict === 'conflict' ? '回答使用' + m[1] + '%，对应条款为' + r.value + '%，请核对字段用途。' : '在本案例预设规则范围内，字段表述与证据数值一致。';
      if (r.id !== 'threshold' && m) { r.match = m[0]; r.replacement = m[0].replace(m[1] + '%', r.value + '%'); }
    }
    const activeRows = rows.filter(r => dimensions.includes(r.id === 'threshold' ? 'scope' : 'numeric'));
    if (dimensions.includes('evidence')) activeRows.push({ id: 'citation', sourceId: 'threshold', title: '引用定位', verdict: /第\s*4[.．]1\s*条/.test(text) ? 'support' : 'unknown', message: /第\s*4[.．]1\s*条/.test(text) ? '回答中的第4.1条可定位到当前材料；结论支持关系仍需结合具体表述复核。' : '回答未标注具体条款位置，请对照原文补充引用。' });
    report = { text, version: state.version, rows: activeRows };
    $('results').className = '';
    $('results').replaceChildren(...activeRows.map(r => {
      const card = el('article', undefined, 'result-card ' + r.verdict);
      const text = el('div'); text.append(el('h3', r.title + ' · ' + ({ conflict: '需修订', support: '已核对', unknown: '待核' })[r.verdict]), el('p', r.message));
      const actions = el('div', undefined, 'result-actions'); actions.append(button('定位证据', () => locate(r.sourceId || r.id), 'quiet'));
      if (r.verdict === 'conflict') actions.append(button('记录修订', () => begin(r)));
      card.append(el('span', r.verdict === 'conflict' ? '!' : r.verdict === 'support' ? '✓' : '?', 'result-icon'), text, actions);
      return card;
    }));
    const bad = activeRows.filter(r => r.verdict === 'conflict').length;
    $('result-count').textContent = activeRows.length + ' 项';
    $('coverage').textContent = bad ? bad + ' 项需修订' : '核查完成';
    $('report-state').textContent = bad ? '待复核' : '待确认';
    updateSteps(1); renderKnowledge();
  }
  function begin(row, previous) {
    capture = previous ? { ...previous, snapshot: previous.snapshot, pendingId: previous.id } : { caseId: state.caseId, version: state.version, snapshot: state.text, before: row.match, after: row.replacement, field: row.id, quote: clauses().find(c => c.id === row.id).text };
    $('revision-before').value = capture.before;
    $('revision-after').value = previous?.after ?? capture.after;
    $('revision-quote').textContent = capture.quote;
    $('revision-kind').value = previous?.kind ?? '口径澄清';
    $('revision-reason').value = previous?.reason ?? (capture.field === 'threshold' ? '补偿判断应引用补偿触发线，奖励比例用于另一个计算。' : '按照对应奖励条款核对比例。');
    $('revision-error').textContent = '';
    $('revision-dialog').showModal();
  }
  function commit(apply) {
    if (!capture) return;
    const after = $('revision-after').value.trim();
    if (!after) { $('revision-error').textContent = '请填写建议改稿。'; return; }
    if (apply && (capture.caseId !== state.caseId || capture.version !== state.version || capture.snapshot !== state.text || !state.text.includes(capture.before))) { $('revision-error').textContent = '正文或案例版本已变化。请关闭并重新核查、定位，避免覆盖其他修改。'; return; }
    const record = { id: capture.pendingId || crypto.randomUUID(), caseId: capture.caseId, version: capture.version, snapshot: capture.snapshot, before: capture.before, after, quote: capture.quote, field: capture.field, kind: $('revision-kind').value, reason: $('revision-reason').value, status: apply ? 'applied' : 'pending', at: new Date().toISOString() };
    const index = state.records.findIndex(r => r.id === record.id);
    const previous = index >= 0 ? state.records[index] : null;
    record.history = previous ? [...(previous.history || []), { ...previous, history: undefined }] : [];
    if (apply) { state.text = state.text.replace(capture.before, after); state.version++; record.appliedVersion = state.version; }
    if (index >= 0) state.records[index] = record; else state.records.unshift(record);
    persist(); $('revision-dialog').close(); renderWork();
    if (apply) { show('work'); analyze(); updateSteps(2); } else { updateSteps(2); if (!$('view-history').hidden) renderHistory(); }
    $('status').textContent = apply ? '已确认并应用。前后稿与证据已保存，可在「核查记录」重开。' : '已保存待复核，正文保持原样。可从「核查记录」继续复核。';
  }
  function candidate() {
    const r = state.records.find(r => r.status === 'applied' && r.caseId === state.caseId && r.field === 'threshold' && r.appliedVersion === state.version);
    if (!r || r.before === r.after || r.kind === '表达调整') return null;
    const value = cases[state.caseId].threshold;
    const rx = new RegExp('低于' + value + '%.*达到' + value + '%');
    return rx.test(r.after) && !/应引用超额奖励比例/.test(r.after) ? r : null;
  }
  function renderKnowledge() {
    const r = candidate(); $('knowledge').hidden = !r;
    if (r) $('rule-text').textContent = '判断合同约定的收入补偿是否触发，应使用「收入补偿触发线」，不能用「超额奖励比例」替代；本案例达到触发线（含本数）时不触发该收入补偿。';
    $('trial-result').textContent = '';
  }
  function renderFiles() {
    const source = el('article', undefined, 'panel file-row'); const desc = el('div'); desc.append(el('strong', '虚构交易条款摘录.pdf'), el('p', '原始材料 · 第 3 页 · 3 条字段证据'));
    source.append(el('span', 'PDF', 'file-symbol'), desc, button('查看材料', () => locate('threshold')));
    const answer = el('article', undefined, 'panel file-row'); const info = el('div'); info.append(el('strong', cases[state.caseId].title + ' · AI 回答'), el('p', '待查材料 · v' + state.version + ' · 已关联 ' + state.records.filter(r => r.caseId === state.caseId).length + ' 条修订'));
    answer.append(el('span', 'TXT', 'file-symbol'), info, button('打开回答', () => { show('work'); reviewMode(true); }));
    $('file-list').replaceChildren(source, answer);
  }
  const seedPosts = () => [
    { id: 'post-scope', tag: '口径核对', title: '两个比例都是75%，为什么还需要核对引用字段？', body: '并购案例里，收入补偿触发线与超额奖励比例刚好相同。AI使用了奖励比例来解释补偿条件，这样的判断能否采纳？', author: '研究员 A · 示例', replies: ['先区分字段用途。显示值相同，不能证明使用了正确条款。'], adopted: -1 },
    { id: 'post-cite', tag: '引用核查', title: '找到了原文，就能认定引用支持结论吗？', body: '材料确实提到一笔订单，但原句说的是正在洽谈，回答却写成已获得订单。应该如何记录引用与结论的关系？', author: '分析师 B · 示例', replies: ['引文可定位和支持结论是两件事，应保留洽谈中的状态限定。'], adopted: -1 },
    { id: 'post-condition', tag: '表述限定', title: '“满足条件后可以”被改写为“必然可以”', body: '核查一段业务说明时，发现原文中的条件和例外没有出现在回答中。这类问题应如何记录？', author: '复核人 C · 示例', replies: ['关联原文条件，记录为补充限定，并分别标注原文与改稿的判断。'], adopted: -1 },
  ];
  let squareFilter = 'all';
  function posts() { if (!Array.isArray(state.posts)) state.posts = seedPosts(); return state.posts; }
  function renderSquare() {
    const all = posts();
    $('square-post-count').textContent = all.length;
    $('square-reply-count').textContent = all.reduce((n, p) => n + p.replies.length, 0);
    const visible = all.filter(p => squareFilter === 'all' || p.tag === squareFilter);
    $('post-list').replaceChildren(...visible.map(p => {
      const article = el('article', undefined, 'post-card panel');
      const head = el('div', undefined, 'post-meta'); head.append(el('span', p.author), el('span', p.tag, 'post-tag'), el('span', p.adopted >= 0 ? '已采纳' : '待核对', p.adopted >= 0 ? 'tag' : 'tag neutral'));
      const title = button(p.title, () => openPost(p.id), 'post-title');
      const bottom = el('div', undefined, 'post-bottom'); bottom.append(el('span', p.replies.length + ' 条讨论'), button('查看讨论', () => openPost(p.id), 'text-button'));
      article.append(head, title, el('p', p.body), bottom); return article;
    }));
    document.querySelectorAll('[data-tag]').forEach(b => b.classList.toggle('active', b.dataset.tag === squareFilter));
  }
  function openPost(id) {
    const p = posts().find(p => p.id === id); if (!p) return;
    $('post-title').textContent = p.title;
    const body = $('post-detail'); body.replaceChildren(el('p', p.author + ' · ' + p.tag, 'muted'), el('p', p.body));
    const replies = el('div', undefined, 'post-replies');
    p.replies.forEach((text, index) => { const row = el('article', undefined, 'reply-row'); row.append(el('strong', index === p.adopted ? '已采纳的核查意见' : '核查意见'), el('p', text), button(index === p.adopted ? '取消采纳' : '采纳意见', () => { p.adopted = p.adopted === index ? -1 : index; persist(); openPost(id); renderSquare(); }, 'text-button')); replies.append(row); });
    const form = el('form'); const label = el('label', '补充核查意见'); const input = el('textarea'); input.required = true; input.maxLength = 1000; input.placeholder = '描述依据与判断，内容仅保存到当前浏览器'; label.append(input); const submit = el('button', '保存意见', 'primary'); submit.type = 'submit'; form.append(label, submit);
    form.onsubmit = e => { e.preventDefault(); if (!input.value.trim()) return; p.replies.push(input.value.trim()); persist(); openPost(id); renderSquare(); };
    body.append(replies, form); if (!$('post-dialog').open) $('post-dialog').showModal();
  }
  function showMaterial(answer = false) {
    $('material-title').textContent = answer ? '待查材料' : '原始材料';
    const content = $('material-body'); content.replaceChildren();
    if (answer) {
      const textarea = el('textarea'); textarea.id = 'preview-answer-editor'; textarea.value = state.text; textarea.maxLength = 4000;
      content.append(textarea, button('保存正文', () => { if (textarea.value !== state.text) { state.text = textarea.value; state.version++; invalidate(); persist(); renderWork(); } $('material-dialog').close(); }));
    } else { content.append(el('h3', '虚构交易条款摘录 · 第3页')); clauses().forEach(c => content.append(el('h3', c.title), el('p', c.text))); }
    $('material-dialog').showModal();
  }
  $('brand-home').onclick = () => { show('work'); reviewMode(false); };
  $('back-config').onclick = () => reviewMode(false);
  $('start-check').onclick = () => { analyze(); $('status').textContent = ''; };
  $('preview-source').onclick = () => showMaterial();
  $('preview-answer').onclick = () => showMaterial(true);
  $('close-material').onclick = () => $('material-dialog').close();
  $('save-task').onclick = () => { state.taskTitle = $('task-title').value.trim() || '未命名核查任务'; state.requirements = $('task-requirements').value; state.dimensions = [...document.querySelectorAll('.dimension-card input:checked')].map(c => c.value); persist(); $('task-saved').textContent = '已保存'; $('task-saved').classList.add('saved'); };
  ['task-title', 'task-requirements'].forEach(id => { $(id).oninput = () => { $('task-saved').textContent = '未保存'; $('task-saved').classList.remove('saved'); }; });
  $('select-dimensions').onclick = () => { const inputs = [...document.querySelectorAll('.dimension-card input')]; const all = inputs.every(c => c.checked); inputs.forEach(c => { c.checked = !all; }); $('select-dimensions').textContent = all ? '全选' : '取消全选'; };
  document.querySelectorAll('.scenario-option').forEach(b => { b.onclick = () => { const selected = b.getAttribute('aria-pressed') !== 'true'; document.querySelectorAll('.scenario-option').forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); }); if (selected) { b.classList.add('selected'); b.setAttribute('aria-pressed', 'true'); } state.scene = selected ? b.textContent.trim() : ''; persist(); }; });
  $('square-tab').onclick = () => { $('square-content').hidden = false; $('experts-content').hidden = true; $('square-tab').classList.add('selected'); $('experts-tab').classList.remove('selected'); };
  $('experts-tab').onclick = () => {
    $('square-content').hidden = true; $('experts-content').hidden = false; $('experts-tab').classList.add('selected'); $('square-tab').classList.remove('selected');
    $('experts-content').replaceChildren(...[['财务分析', '指标口径、财报表述与计算依据'], ['引用复核', '来源定位、引用与结论支持关系']].map(([title, text]) => { const card = el('article', undefined, 'panel expert-card'); card.append(el('div', '◇', 'expert-avatar'), el('h3', title + ' · 示例行家'), el('p', text), button('发起求助', () => { $('compose-dialog').showModal(); })); return card; }));
  };
  document.querySelectorAll('[data-tag]').forEach(b => { b.onclick = () => { squareFilter = b.dataset.tag; renderSquare(); }; });
  $('close-post').onclick = () => $('post-dialog').close();
  $('new-post').onclick = () => $('compose-dialog').showModal();
  $('close-compose').onclick = () => $('compose-dialog').close();
  $('compose-form').onsubmit = e => { e.preventDefault(); const title = $('compose-heading').value.trim(), body = $('compose-body').value.trim(); if (!title || !body) return; posts().unshift({ id: crypto.randomUUID(), title, body, tag: $('compose-tag').value, author: '体验用户 · 本地', replies: [], adopted: -1 }); persist(); squareFilter = 'all'; renderSquare(); $('square-tab').click(); $('compose-dialog').close(); $('compose-form').reset(); };
  function renderHistory() {
    $('export').disabled = !state.records.length;
    if (!state.records.length) { $('history-list').replaceChildren(el('div', '还没有修订记录。回到工作台，核查后点击「记录修订」。', 'empty-state')); return; }
    $('history-list').replaceChildren(...state.records.map(r => {
      const article = el('article', undefined, 'panel history-card'); article.append(el('h3', (r.status === 'applied' ? '已应用' : '待复核') + ' · ' + cases[r.caseId].title), el('p', new Date(r.at).toLocaleString() + ' · 原始回答 v' + r.version, 'muted'), el('strong', '修改前'), el('pre', r.before), el('strong', '修改后'), el('pre', r.after), el('blockquote', r.quote), el('p', r.kind + ' · ' + (r.reason || '未填写理由'), 'muted'));
      if (r.history?.length) { const d = el('details'); d.append(el('summary', '查看此前保存的版本')); r.history.forEach(h => d.append(el('p', new Date(h.at).toLocaleString() + ' · ' + h.status), el('pre', h.after))); article.append(d); }
      if (r.status === 'pending') article.append(button('继续复核', () => begin(null, r)));
      return article;
    }));
  }
  function renderTokens() {
    const total = state.tokens.reduce((a, b) => a + b, 0), latest = state.tokens.at(-1) || 0;
    $('token-total').textContent = total.toLocaleString(); $('token-calls').textContent = state.tokens.length;
    $('token-rate').replaceChildren(document.createTextNode(latest.toLocaleString() + ' '), el('small', 'Token/分'));
    const max = Math.max(2000, ...state.tokens), values = state.tokens.slice(-18), points = values.map((v, i) => (30 + i * 740 / Math.max(1, values.length - 1)) + ',' + (175 - v / max * 145)).join(' ');
    const svg = $('chart'); svg.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    for (let y = 30; y <= 175; y += 48) { const line = document.createElementNS(ns, 'line'); for (const [k, v] of Object.entries({ x1: 30, x2: 770, y1: y, y2: y, stroke: '#e9edf5' })) line.setAttribute(k, v); svg.append(line); }
    if (values.length) { const poly = document.createElementNS(ns, 'polyline'); for (const [k, v] of Object.entries({ points, fill: 'none', stroke: '#7762db', 'stroke-width': 3, 'stroke-linejoin': 'round' })) poly.setAttribute(k, v); svg.append(poly); }
    $('token-notice').textContent = !values.length ? '点击按钮，生成第一条模拟调用。' : latest >= 6000 ? '异常提示：本次模拟用量明显上升，请检查工作流是否重复调用。' : '模拟调用正常。每第四次点击会出现一次预设用量峰值。';
  }
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => show(b.dataset.view));
  $('answer').oninput = () => { state.text = $('answer').value; state.version++; persist(); $('version-label').textContent = '回答版本 v' + state.version; invalidate(); };
  $('case-select').onchange = () => { state.caseId = $('case-select').value; state.text = cases[state.caseId].answer; state.version++; persist(); invalidate(); renderWork(); };
  $('run').onclick = () => { analyze(); $('status').textContent = ''; };
  $('save-pending').onclick = () => commit(false);
  $('revision-form').onsubmit = e => { e.preventDefault(); commit(true); };
  $('close-dialog').onclick = () => $('revision-dialog').close();
  $('trial-run').onclick = () => { if (!candidate()) return; updateSteps(3); $('trial-result').textContent = $('trial-field').value === 'threshold' ? '通过：75%来自收入补偿触发线，字段角色正确。' : $('trial-field').value === 'reward' ? '错误：虽然也是75%，但奖励字段不支持补偿门槛判断。' : '待核：无法确认引用字段，数字相同不足以给出通过结论。'; };
  $('trial-field').onchange = () => { $('trial-result').textContent = ''; };
  $('simulate').onclick = () => { const n = state.tokens.length; state.tokens.push(n % 4 === 3 ? 8400 : [920, 1440, 1180][n % 4]); if (state.tokens.length > 100) state.tokens.shift(); persist(); renderTokens(); };
  $('export').onclick = () => { if (!state.records.length) return; const records = state.records.map(r => ({ ...r, origin: 'synthetic_browser_demo', evidence_location: '虚构交易条款摘录.pdf · 第3页', candidate_rule: r.field === 'threshold' && r.status === 'applied' ? '需在工作台重新核对候选条件' : null })); const url = URL.createObjectURL(new Blob([records.map(r => JSON.stringify(r)).join('\n') + '\n'], { type: 'application/x-ndjson;charset=utf-8' })); const a = el('a'); a.href = url; a.download = '较真一下-虚构演示核查记录.jsonl'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  $('reset').onclick = () => { state = { caseId: 'acquisition', text: cases.acquisition.answer, version: 1, records: [], tokens: [], scene: document.querySelector('.scenario-option').textContent.trim() }; document.querySelectorAll('.dimension-card input').forEach(c => { c.checked = true; }); $('task-saved').textContent = '未保存'; $('task-saved').classList.remove('saved'); persist(); invalidate(); renderWork(); reviewMode(false); $('status').textContent = '示例已重置'; };
  renderWork(); renderTokens();
})();
