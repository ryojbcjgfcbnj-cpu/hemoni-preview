'use strict';
(() => {
  const node = (tag, text, className) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  };
  const dialog = node('dialog'); dialog.id = 'post-check-editor';
  dialog.setAttribute('aria-labelledby', 'pce-heading');
  const shell = node('form', undefined, 'pce-shell');
  shell.innerHTML = '<header class="pce-header"><div><h2 id="pce-heading">核对完成 · 修改内容</h2><p id="pce-context"></p></div><button type="button" id="pce-close">返回核对</button></header><div class="pce-body"><div class="pce-columns"><label>核查时原文<textarea id="pce-before" readonly></textarea></label><label>修改稿<textarea id="pce-after" maxlength="30000" required></textarea></label></div><div class="pce-fields"><label>关联核查依据<select id="pce-source"></select></label><label>修改说明（选填）<input id="pce-reason" maxlength="1000" placeholder="记录修改原因或需要继续复核的地方"></label></div><blockquote id="pce-evidence" class="pce-evidence"></blockquote><details class="pce-history"><summary id="pce-history-title">修改记录</summary><div id="pce-history"></div></details></div><footer class="pce-footer"><p id="pce-feedback" role="status" aria-live="polite"></p><div class="pce-actions"><button type="button" id="pce-export">导出记录</button><button type="button" id="pce-pending">保存待复核</button><button type="submit" id="pce-save" class="pce-primary">确认并保存改稿</button></div></footer>';
  dialog.append(shell); document.body.append(dialog);
  const $ = id => document.getElementById(id);
  let capture = null, records = [];
  const plain = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };
  function sourceText() { return SENTENCE_DATA.map(p => plain(p.html)).join('\n\n'); }
  function currentContext() {
    const task = $('task-title').value || '未命名核查任务';
    return { task, signature: readingDocumentSignature(), text: sourceText(), review: JSON.parse(readingReviewSnapshot()) };
  }
  function key(context) { return 'jiaozhen:post-check-revisions:v1:' + encodeURIComponent(context.task) + ':' + context.signature; }
  function read(context) {
    const value = JSON.parse(localStorage.getItem(key(context)) || '[]');
    if (!Array.isArray(value) || value.some(r => !r || typeof r.id !== 'string' || typeof r.before !== 'string' || typeof r.after !== 'string')) throw Error('修改记录无法读取，请先导出或检查浏览器存储');
    return value;
  }
  function feedback(message, error = false) { $('pce-feedback').textContent = message; $('pce-feedback').classList.toggle('pce-error', error); }
  function updateEvidence() {
    const item = ORIGINAL_ITEMS.find(i => i.key === $('pce-source').value);
    $('pce-evidence').textContent = item ? item.label + '\n' + item.rows.map(r => r.label + '：' + r.value).join('\n') : '暂未关联依据，可先保存待复核。';
  }
  function renderHistory() {
    $('pce-history-title').textContent = '修改记录 · ' + records.length + ' 版';
    $('pce-export').disabled = !records.length;
    $('pce-history').replaceChildren(...records.slice().reverse().map((record, i) => {
      const row = node('article');
      row.append(node('strong', '第 ' + (records.length - i) + ' 版 · ' + (record.status === 'confirmed' ? '已确认' : '待复核') + ' · ' + new Date(record.at).toLocaleString()), node('pre', record.after));
      if (record.reason) row.append(node('p', record.reason));
      return row;
    }));
  }
  window.openPostCheckEditor = () => {
    try {
      const context = currentContext();
      records = read(context);
      const previous = records.at(-1);
      capture = { ...context, previousId: previous?.id || null };
      $('pce-context').textContent = context.task + ' · 原核查记录保留，修改稿单独保存';
      $('pce-before').value = context.text;
      $('pce-after').value = previous?.after ?? context.text;
      $('pce-reason').value = '';
      $('pce-source').replaceChildren(new Option('暂不关联', ''), ...ORIGINAL_ITEMS.map(i => new Option(i.label, i.key)));
      $('pce-source').value = previous?.evidence?.key || '';
      updateEvidence(); renderHistory(); feedback('');
      if (!dialog.open) dialog.showModal();
      $('pce-after').focus();
    } catch (error) { window.alert(error.message); }
  };
  function save(status) {
    try {
      if (!capture) throw Error('请重新打开修改内容');
      const current = currentContext(), currentRows = read(capture);
      if (current.task !== capture.task || current.signature !== capture.signature || current.text !== capture.text || (currentRows.at(-1)?.id || null) !== capture.previousId) throw Error('材料、任务或修改记录已变化，请返回后重新打开，避免覆盖其他修改');
      const after = $('pce-after').value;
      if (!after.trim() || after.length > 30000) throw Error('请输入不超过3万字的修改稿');
      const source = ORIGINAL_ITEMS.find(i => i.key === $('pce-source').value);
      const record = {
        schema_version: 1, id: crypto.randomUUID(), previous_id: capture.previousId,
        at: new Date().toISOString(), status, origin: 'supplied_workbench_synthetic_demo',
        task: capture.task, document_signature: capture.signature,
        before: capture.text, previous_text: currentRows.at(-1)?.after ?? capture.text, after,
        reason: $('pce-reason').value.trim(), evidence: source ? { key: source.key, title: source.label, rows: structuredClone(source.rows) } : null,
        review_snapshot: current.review,
      };
      const next = [...currentRows, record];
      localStorage.setItem(key(capture), JSON.stringify(next));
      records = next; capture.previousId = record.id;
      renderHistory();
      feedback(status === 'confirmed' ? '修改稿已确认保存。原核查报告保留，可重开查看或继续修改。' : '已保存待复核，原文与核查记录保持不变。');
    } catch (error) { feedback(error.message, true); }
  }
  shell.onsubmit = e => { e.preventDefault(); save('confirmed'); };
  $('pce-pending').onclick = () => save('pending');
  $('pce-close').onclick = () => dialog.close();
  $('pce-source').onchange = updateEvidence;
  $('pce-after').oninput = () => feedback('修改稿尚未保存');
  $('pce-export').onclick = () => {
    try {
      const values = read(capture); if (!values.length) return;
      const url = URL.createObjectURL(new Blob([values.map(r => JSON.stringify(r)).join('\n') + '\n'], { type: 'application/x-ndjson;charset=utf-8' }));
      const a = node('a'); a.href = url; a.download = '核查后修改记录.jsonl'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { feedback(error.message, true); }
  };
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
})();
