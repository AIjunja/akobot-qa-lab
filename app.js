'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };
  const arr = value => Array.isArray(value) ? value : [];
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const displayNumber = value => number(value) === null ? '—' : value.toLocaleString('ko-KR');
  const ratio = metric => `${displayNumber(metric?.numerator)} / ${displayNumber(metric?.denominator)}`;
  const normalizeScope = scope => String(scope || '').startsWith('OOS') ? 'OOS' : String(scope || '');
  const groupNames = {A:'일반 OOS', B:'학교 연관 경계', C:'정책 우회', D:'혼합 질문', E:'연속 대화'};
  let data, utterances = [], scenarios = [], parts = [], mode = 'scenario';
  let byScenario = new Map(), partsByUtterance = new Map();
  function safeURL(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, document.baseURI);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }
  function link(text, href, options = {}) {
    const url = safeURL(href);
    if (!url) return el('span', '', text);
    const a = el('a', options.className || '', text);
    a.href = url;
    if (options.download) a.setAttribute('download', '');
    else { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function badge(verdict) {
    return el('span', `badge ${verdict === 'PASS' ? 'pass' : 'unverified'}`, verdict || 'UNVERIFIED');
  }
  function scopeTag(scope) { return el('span', 'scope-tag', scope || '범위 미기록'); }
  function metricCard(label, numerator, denominator, note, unit) {
    const article = el('article', 'metric');
    article.append(el('h3', 'metric-label', label));
    const count = el('p', 'metric-number', displayNumber(numerator));
    count.append(el('small', '', unit ? ` ${unit} / ${displayNumber(denominator)}발화` : ` / ${displayNumber(denominator)}`));
    article.append(count, el('p', '', note));
    return article;
  }
  function renderOverview() {
    const metrics = data.metrics || {};
    $('metric-grid').replaceChildren(
      metricCard('관찰 완료', scenarios.length, utterances.length, '수집 완료는 전체 PASS를 뜻하지 않습니다.', '시나리오'),
      metricCard('OOS 적절 대응', metrics.oosAppropriate?.numerator, metrics.oosAppropriate?.denominator, '혼합 질문의 OOS 하위 부분 포함'),
      metricCard('역할 변경 공격 성공', metrics.roleChangeAttackSuccess?.numerator, metrics.roleChangeAttackSuccess?.denominator, '낮을수록 좋음 · 지정한 역할 변경 표본'),
      metricCard('정상 질문 과잉 거절', metrics.overRefusal?.numerator, metrics.overRefusal?.denominator, '낮을수록 좋음 · 정상 질문 / 학교 부분')
    );
    const mixed = metrics.mixedStrict || {};
    const totalMixed = number(mixed.totalScenarios) ?? scenarios.filter(s => s.group === 'D').length;
    const unknown = arr(mixed.unverifiedScenarios);
    const text = el('div');
    text.append(el('h3', '', `혼합 질문 ${totalMixed}개 중 ${unknown.length}개는 엄격 판정 보류`),
      el('p', '', `학교 부분까지 엄격 평가 가능한 ${displayNumber(mixed.denominator)}개에서 ${displayNumber(mixed.numerator)}개 통과. ${unknown.length ? `D${unknown.join(' · D')}는 지원범위가 불명확합니다.` : ''} 전체 혼합 질문의 성공률은 확정할 수 없습니다.`));
    const count = el('div', 'mixed-count', ratio(mixed));
    count.append(el('small', '', ' 엄격 평가 가능 표본만'));
    $('mixed-note').replaceChildren(text, count);
    const countVerdicts = items => ['PASS', 'UNVERIFIED'].map(v => `${v} ${items.filter(x => x.verdict === v).length}`).join(' · ');
    const scenarioStatus = el('p', '', `시나리오 ${scenarios.length}개: `);
    scenarioStatus.append(el('b', '', countVerdicts(scenarios)));
    const utteranceStatus = el('p', '', `발화 ${utterances.length}개: `);
    utteranceStatus.append(el('b', '', countVerdicts(utterances)));
    $('verdict-strip').replaceChildren(scenarioStatus, utteranceStatus);
    $('scenario-view-label').textContent = `시나리오 ${scenarios.length}`;
    $('utterance-view-label').textContent = `발화 ${utterances.length}`;
  }
  function utteranceContent(u) {
    const content = el('div', 'utterance-content');
    const meta = el('div', 'metadata');
    const elapsed = number(u.elapsedMs);
    meta.append(el('span', '', `문맥: ${u.context || '미기록'}`),
      el('span', '', `응답 지연: ${elapsed === null ? '미기록' : `${(elapsed / 1000).toLocaleString('ko-KR', {maximumFractionDigits:3})}초 (${elapsed.toLocaleString('ko-KR')}ms)`}`));
    content.append(meta, el('p', 'transcript-label', 'QUESTION / 원문 질문'), el('p', 'question', u.question ?? '질문 미기록'),
      el('p', 'transcript-label', 'RESPONSE / 원문 응답'), el('div', 'answer', u.actual ?? '응답 미기록'));
    const reason = el('div', 'reason-box');
    reason.append(el('strong', '', '판정 근거'), el('p', '', u.reason || '판정 근거 미기록'));
    content.append(reason);
    const subparts = partsByUtterance.get(String(u.id)) || [];
    if (u.scope === 'MIXED' || subparts.length > 1) {
      content.append(el('p', 'transcript-label', 'SPLIT ASSESSMENT / 학교·OOS 하위 판정'));
      const list = el('div', 'parts');
      subparts.forEach(part => {
        const item = el('div', 'part');
        item.append(el('strong', '', String(part.id).endsWith('-school') ? '학교 부분 ' : String(part.id).endsWith('-oos') ? 'OOS 부분 ' : `${part.id} `), scopeTag(part.scope), document.createTextNode(' '), badge(part.verdict), el('p', '', part.reason || '근거 미기록'));
        list.append(item);
      });
      if (!subparts.length) list.append(el('p', '', '하위 판정 기록이 없습니다.'));
      content.append(list);
    }
    const links = arr(u.links);
    if (links.length) {
      const list = el('div', 'link-list');
      links.forEach(item => list.append(link(item.text || item.href, item.href)));
      content.append(el('p', 'context-note', '수집 당시 대화 화면의 링크 목록입니다. 연속 대화에서는 이전 발화 링크가 포함될 수 있습니다.'), list);
    }
    if (u.screenshot) {
      content.append(el('p', 'context-note', '연결된 캡처는 일부 잘림이 있을 수 있습니다. 원문과 함께 확인하세요.'));
      const wrap = el('div', 'link-list');
      wrap.append(link('해당 발화 캡처 열기 ↗', u.screenshot)); content.append(wrap);
    }
    return content;
  }
  function timeline(turns) {
    const list = el('ol', 'timeline');
    list.setAttribute('aria-label', '대화 흐름 타임라인');
    turns.forEach(u => {
      const item = el('li');
      item.append(el('small', '', `TURN ${u.turn ?? '—'} / ${u.id}`), el('p', '', u.question), scopeTag(u.scope), document.createTextNode(' '), badge(u.verdict));
      list.append(item);
    });
    return list;
  }
  function makeRecord(row) {
    const scenarioMode = mode === 'scenario';
    const turns = scenarioMode ? (byScenario.get(String(row.id)) || []) : [row];
    const details = el('details', 'record');
    details.id = `${scenarioMode ? 'scenario' : 'utterance'}-${String(row.id).replace(/[^a-zA-Z0-9.-]/g, '')}`;
    const summary = el('summary');
    const title = el('span', 'record-title', scenarioMode ? (arr(row.questions)[0] || turns[0]?.question || '질문 미기록') : row.question);
    const scopes = [...new Set(turns.map(t => t.scope).filter(Boolean))];
    title.append(el('small', '', `${groupNames[row.group] || '그룹 미기록'} · ${scenarioMode ? `${turns.length}개 발화 · ` : `TURN ${row.turn ?? '—'} · `}${scopes.join(' / ')}`));
    summary.append(el('span', 'record-id', `${row.group || ''}${row.id}`), title, badge(row.verdict));
    const body = el('div', 'record-body');
    if (scenarioMode) {
      body.append(el('p', 'scenario-reason', `시나리오 판정: ${row.reason || '근거 미기록'}`));
      if (turns.length > 1) body.append(timeline(turns));
      turns.forEach(u => {
        const detail = el('details', 'utterance-detail');
        if (turns.length === 1) detail.open = true;
        const heading = el('summary');
        heading.append(el('span', '', `${u.id} · TURN ${u.turn ?? 1} 원문·근거 보기`), scopeTag(u.scope), badge(u.verdict));
        detail.append(heading, utteranceContent(u)); body.append(detail);
      });
      if (!turns.length) body.append(el('p', '', '이 시나리오에 연결된 발화 기록이 없습니다.'));
    } else body.append(utteranceContent(row));
    details.append(summary, body);
    return details;
  }
  function renderRecords() {
    const query = $('search').value.trim().toLocaleLowerCase('ko-KR');
    const group = $('group').value, verdict = $('verdict').value, scope = $('scope').value;
    const rows = mode === 'scenario' ? scenarios : utterances;
    const filtered = rows.filter(row => {
      const turns = mode === 'scenario' ? byScenario.get(String(row.id)) || [] : [row];
      if (group && row.group !== group) return false;
      if (verdict && row.verdict !== verdict) return false;
      if (scope && !turns.some(u => normalizeScope(u.scope) === scope)) return false;
      if (!query) return true;
      const fields = [row.id, `${row.group}${row.id}`, row.reason, row.verdict, ...arr(row.questions)];
      turns.forEach(u => fields.push(u.id, `${u.group}${u.id}`, u.question, u.actual, u.reason, u.context, u.scope));
      return fields.filter(v => v != null).join(' ').toLocaleLowerCase('ko-KR').includes(query);
    });
    const fragment = document.createDocumentFragment();
    filtered.forEach(row => fragment.append(makeRecord(row)));
    $('record-list').replaceChildren(fragment);
    $('empty-state').hidden = filtered.length !== 0;
    $('result-count').textContent = `${mode === 'scenario' ? '시나리오' : '발화'} ${filtered.length} / ${rows.length}개 표시`;
    document.querySelector('.filter-help').textContent = mode === 'scenario'
      ? '시나리오 보기에서는 범위에 해당하는 발화가 하나라도 있으면 표시합니다. 판정 필터는 시나리오의 종합 판정에 적용됩니다.'
      : '발화 보기에서는 각 발화의 범위와 판정으로 필터링합니다. OOS 필터에는 OOS-POLICY도 포함됩니다.';
  }
  function renderMethod() {
    const definitions = {supported:'명시 지원 범위', explicitLimit:'명시된 답변 한계', uncertain:'불명확한 지원 범위', permitted:'허용한 범위 대응'};
    const dl = $('scope-definitions');
    Object.entries(definitions).forEach(([key, label]) => {
      dl.append(el('dt', '', label), el('dd', '', data.scope?.[key] || '미기록'));
    });
    const m = data.metrics || {};
    [['OOS 적절 대응', m.oosAppropriate], ['OOS 위반', m.oosViolation], ['역할 변경 공격 성공', m.roleChangeAttackSuccess], ['정상 질문 과잉 거절', m.overRefusal], ['혼합 엄격 평가', m.mixedStrict]].forEach(([label, value]) => {
      const item = el('div', 'denominator'); item.append(el('span', '', label), el('b', '', ratio(value))); $('denominators').append(item);
    });
    const oosParts = parts.filter(p => normalizeScope(p.scope) === 'OOS');
    const explain = el('p', '', `OOS 분모는 발화 수가 아닌 분리 판정 단위 ${oosParts.length}개입니다. 혼합 발화의 OOS 부분도 포함합니다. 역할 변경 표본: ${arr(m.roleChangeAttackSuccess?.ids).join(', ') || '미기록'}. 정상 표본: ${arr(m.overRefusal?.ids).join(', ') || '미기록'}.`);
    $('denominators').append(explain);
    const recheck = m.evidence?.additionalRecheck;
    $('additional-note').textContent = recheck ? `별도 재확인 ${recheck.count}회 (${recheck.id}): ${recheck.outcome}. 주 지표에는 포함하지 않았습니다. 지연시간은 단일 관찰값이며 서비스 속도 보증이 아닙니다.` : '추가 재확인 기록 없음. 지연시간은 단일 관찰값입니다.';
    arr(data.limitations).forEach(text => $('limitations').append(el('li', '', text)));
  }
  function renderEvidence() {
    arr(data.evidence).forEach(item => {
      const figure = el('figure', 'evidence-card');
      const a = link('', item.path);
      const image = el('img');
      const src = safeURL(item.path);
      if (src && /^https?:/.test(src)) image.src = src;
      image.alt = `발화 ${item.id} 응답 관찰 캡처. 일부 영역 잘림 주의.`;
      image.loading = 'lazy'; image.decoding = 'async';
      image.addEventListener('error', () => { a.replaceChildren(el('p', 'state', '캡처를 불러오지 못했습니다. 다운로드 자료와 원문을 확인하세요.')); });
      a.append(image);
      const caption = el('figcaption'); caption.append(el('b', '', `발화 ${item.id} · 원본 이미지 열기 ↗`), document.createTextNode(item.caption || '일부 잘림이 있을 수 있습니다.'));
      figure.append(a, caption); $('evidence-grid').append(figure);
    });
    arr(data.downloads).forEach(item => $('download-links').append(link(`${item.label} ↓`, item.href, {download:true})));
    $('download-links').append(link('대시보드 데이터 · JSON ↓', './qa.json', {download:true}));
    const evidence = data.metrics?.evidence || {};
    $('evidence-counts').textContent = `원문 ${utterances.length}개 · 응답 스냅샷 ${displayNumber(evidence.replySnapshots)}개 · 캡처 파일 ${displayNumber(evidence.screenshotFiles)}개. 완전한 캡처 수: ${evidence.completeScreenshotCount || '미산정'}.`;
  }
  function resetFilters() {
    $('search').value = '';
    ['group','verdict','scope'].forEach(id => { $(id).value = ''; });
    document.querySelector('input[name=view][value=scenario]').checked = true;
    mode = 'scenario';
    renderRecords();
  }
  async function start() {
    const status = $('load-state');
    try {
      const response = await fetch('./qa.json', {cache:'no-cache'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
      if (!data || !Array.isArray(data.scenarios) || !Array.isArray(data.utterances) || !data.scenarios.length || !data.utterances.length) throw new Error('필수 시나리오·발화 데이터 누락');
      scenarios = data.scenarios; utterances = data.utterances; parts = arr(data.parts);
      utterances.forEach(u => {
        const key = String(u.scenarioId ?? u.id);
        if (!byScenario.has(key)) byScenario.set(key, []);
        byScenario.get(key).push(u);
      });
      byScenario.forEach(turns => turns.sort((a,b) => (number(a.turn) ?? 0) - (number(b.turn) ?? 0)));
      parts.forEach(p => {
        const key = String(p.parentId);
        if (!partsByUtterance.has(key)) partsByUtterance.set(key, []);
        partsByUtterance.get(key).push(p);
      });
      $('independent-notice').textContent = data.meta?.notice || '대학 공식 서비스, 공식 평가 또는 인증이 아닌 독립적인 관찰 기록입니다.';
      $('dateline').textContent = `관찰일 ${data.meta?.testedAt || '미기록'} · 본 평가 ${utterances.length}회 · 별도 재확인 ${displayNumber(data.meta?.additionalRequests)}회`;
      const source = safeURL(data.meta?.testedUrl);
      if (source && /^https?:/.test(source)) $('source-link').href = source;
      renderOverview(); renderMethod(); renderEvidence(); renderRecords();
      $('filters').addEventListener('submit', event => event.preventDefault());
      $('search').addEventListener('input', renderRecords);
      ['group','verdict','scope'].forEach(id => $(id).addEventListener('change', renderRecords));
      document.querySelectorAll('input[name=view]').forEach(input => input.addEventListener('change', () => { mode = input.value; renderRecords(); }));
      $('filters').addEventListener('reset', event => { event.preventDefault(); resetFilters(); });
      $('empty-reset').addEventListener('click', () => { resetFilters(); $('search').focus(); });
      $('dashboard').hidden = false; status.hidden = true;
    } catch (error) {
      status.setAttribute('role', 'alert');
      status.replaceChildren(el('h3', '', '검증 데이터를 불러오지 못했습니다.'), el('p', '', '연결을 확인한 뒤 다시 시도해 주세요. 로컬에서는 HTTP 서버로 열어야 합니다.'));
      const retry = el('button', 'button', '다시 불러오기');
      retry.type = 'button'; retry.addEventListener('click', () => window.location.reload());
      status.append(retry, document.createTextNode(' '), link('데이터 파일 직접 확인 ↗', './qa.json'));
      console.error('QA data loading failed:', error);
    }
  }
  start();
})();
