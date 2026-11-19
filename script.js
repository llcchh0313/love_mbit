'use strict';

const BANK = window.RVT_QUESTION_BANK;
const VERSION = 'RVT-situation-v2-40';
const STORAGE_KEY = 'rvt-situation-session';
const app = document.getElementById('app');
const byId = new Map(BANK.map(q => [q.id, q]));
const AXES = [
  { key: 'F', opposite: 'B', title: '관계의 경계', left: 'F · 자유 중시', right: 'B · 경계 중시' },
  { key: 'O', opposite: 'D', title: '정보의 공유', left: 'O · 투명성 중시', right: 'D · 선택적 공유' },
  { key: 'I', opposite: 'C', title: '삶의 우선순위', left: 'I · 개인 생활 중시', right: 'C · 공동생활 중시' },
  { key: 'S', opposite: 'P', title: '상황의 판단', left: 'S · 상황 중심', right: 'P · 원칙 중심' }
];
const TRAITS = {
  F: '친구 관계와 서로의 자율성을 존중하는',
  B: '연인이 합의한 경계와 배려를 중요하게 보는',
  O: '생각과 감정을 솔직하게 나누려는',
  D: '사생활과 선택적인 공유를 존중하는',
  I: '각자의 활동과 독립적인 시간을 소중히 여기는',
  C: '함께하는 경험과 공동의 계획을 우선하는',
  S: '행동이 나온 상황과 맥락을 살피는',
  P: '서로 합의한 기준의 일관성을 중요하게 보는'
};
const TYPE_NAMES = {
  FOIS: '자유로운 소통가', FOIP: '솔직한 기준가', FOCS: '유연한 동행자', FOCP: '함께하는 설계자',
  FDIS: '독립적인 관찰자', FDIP: '신중한 자유인', FDCS: '조용한 동행자', FDCP: '배려하는 계획가',
  BOIS: '경계를 아는 대화가', BOIP: '원칙적인 소통가', BOCS: '따뜻한 협의가', BOCP: '약속을 지키는 동반자',
  BDIS: '독립적인 신중파', BDIP: '일관된 원칙가', BDCS: '마음을 살피는 동반자', BDCP: '단단한 약속의 수호자'
};
let session = restore();
let lastView = 'home';

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createSession() {
  // 각 차원에서 5문항. 두 방향을 각각 2개/3개 선택하여 출제 균형 유지.
  const selected = [];
  for (const axis of AXES) {
    const first = shuffled(BANK.filter(q => q.axis === axis.key && q.pole === axis.key));
    const second = shuffled(BANK.filter(q => q.axis === axis.key && q.pole === axis.opposite));
    const countFirst = Math.random() < 0.5 ? 2 : 3;
    selected.push(...first.slice(0, countFirst), ...second.slice(0, 5 - countFirst));
  }
  // 20문항 순서도 무작위. 차원이 연속되는 경우를 줄이는 방식.
  let ordered = shuffled(selected);
  for (let attempt = 0; attempt < 40; attempt++) {
    const hasTriple = ordered.some((q, i) => i >= 2 && q.axis === ordered[i - 1].axis && q.axis === ordered[i - 2].axis);
    if (!hasTriple) break;
    ordered = shuffled(selected);
  }
  return {
    version: VERSION,
    questionIds: ordered.map(q => q.id),
    answers: {},
    index: 0,
    completedAt: null,
    startedAt: new Date().toISOString()
  };
}

function validSession(data) {
  if (!data || data.version !== VERSION || !Array.isArray(data.questionIds) || data.questionIds.length !== 20) return false;
  if (new Set(data.questionIds).size !== 20 || !data.questionIds.every(id => byId.has(id))) return false;
  if (!Number.isInteger(data.index) || data.index < 0 || data.index > 19 || !data.answers || typeof data.answers !== 'object') return false;
  for (const axis of AXES) {
    const subset = data.questionIds.map(id => byId.get(id)).filter(q => q.axis === axis.key);
    if (subset.length !== 5) return false;
    const polarityCount = subset.filter(q => q.pole === axis.key).length;
    if (polarityCount !== 2 && polarityCount !== 3) return false;
  }
  return Object.values(data.answers).every(v => Number.isInteger(v) && v >= 1 && v <= 5);
}
function restore() {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    return validSession(value) ? value : null;
  } catch { return null; }
}
function save() {
  try { if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* 브라우저가 저장을 제한해도 검사 진행 가능 */ }
}
function answerCount() {
  return session ? session.questionIds.filter(id => Number.isInteger(session.answers[id])).length : 0;
}
function startNew() {
  session = createSession();
  save();
  renderQuestion();
}
function renderHome() {
  lastView = 'home';
  const progress = session ? answerCount() : 0;
  const resume = session && progress > 0 && !session.completedAt;
  const resultAgain = session && session.completedAt && progress === 20;
  app.innerHTML = `
    <section class="panel hero">
      <div class="eyebrow">RELATIONSHIP VALUES TEST</div>
      <h1>우리는 왜<br>다르게 생각할까?</h1>
      <p class="hero-lead">같은 연애 상황을 보고도 서로 다른 판단을 내립니다.<br>실제 일어날 법한 20가지 상황에서 <strong>당신의 선택</strong>을 알려주세요.</p>
      <div class="tags">
        <span class="tag">40문항 중 무작위 20문항</span>
        <span class="tag">5단계 응답</span>
        <span class="tag">4가지 가치관</span>
        <span class="tag">16가지 유형</span>
      </div>
      <div class="actions">
        <button class="btn" type="button" id="new-test">${session ? '새 검사 시작하기' : '검사 시작하기'} →</button>
        ${resume ? `<button class="btn secondary" type="button" id="resume">이어하기 (${progress}/20)</button>` : ''}
        ${resultAgain ? '<button class="btn secondary" type="button" id="review-result">이전 결과 보기</button>' : ''}
      </div>
      <p class="note">모든 사람은 네 가지 가치관에서 각각 5문항씩 응답합니다. 답변에 정답은 없습니다.<br>현재 버전은 응답을 서버에 전송하지 않습니다.</p>
    </section>`;
  document.getElementById('new-test').addEventListener('click', startNew);
  if (resume) document.getElementById('resume').addEventListener('click', renderQuestion);
  if (resultAgain) document.getElementById('review-result').addEventListener('click', renderResult);
}
function renderQuestion() {
  if (!session) return renderHome();
  lastView = 'quiz';
  save();
  const q = byId.get(session.questionIds[session.index]);
  const answered = session.answers[q.id] ?? null;
  app.innerHTML = `
    <section class="panel">
      <div class="topline"><span>20가지 연애 상황</span><strong>${session.index + 1} / 20</strong></div>
      <div class="progress" role="progressbar" aria-label="검사 진행률" aria-valuemin="0" aria-valuemax="20" aria-valuenow="${session.index + 1}"><div class="progress-fill" style="width:${(session.index + 1) * 5}%"></div></div>
      <div class="category">QUESTION ${String(session.index + 1).padStart(2, '0')}</div>
      <div class="scenario"><p class="scenario-label">상황</p><p class="scenario-text" id="situation">${escapeHtml(q.scenario)}</p></div>
      <div class="prompt-label">나는 이렇게 생각한다</div>
      <h2 class="prompt" id="statement">${escapeHtml(q.statement)}</h2>
      <div class="choices" role="group" aria-label="동의 정도를 1부터 5까지 선택">
        ${[1, 2, 3, 4, 5].map(n => `<button class="choice ${answered === n ? 'chosen' : ''}" type="button" data-value="${n}" aria-pressed="${answered === n}">${n}</button>`).join('')}
      </div>
      <div class="choice-guides"><span>1 · 전혀 동의하지 않음</span><span>5 · 매우 동의함</span></div>
      <div class="actions"><button class="btn secondary" id="prev" type="button">${session.index ? '← 이전' : '← 처음으로'}</button><button class="btn" id="next" type="button" ${answered == null ? 'disabled' : ''}>${session.index === 19 ? '결과 확인하기 →' : '다음 →'}</button></div>
      <p class="note">3점은 중립적인 입장이야. 이전 질문으로 돌아가 답변을 수정할 수도 있어.</p>
    </section>`;
  document.querySelectorAll('.choice').forEach(button => {
    button.addEventListener('click', () => {
      session.answers[q.id] = Number(button.dataset.value);
      save();
      document.querySelectorAll('.choice').forEach(x => { const current = x === button; x.classList.toggle('chosen', current); x.setAttribute('aria-pressed', String(current)); });
      document.getElementById('next').disabled = false;
    });
  });
  document.getElementById('prev').addEventListener('click', () => {
    if (session.index === 0) return renderHome();
    session.index -= 1; renderQuestion();
  });
  document.getElementById('next').addEventListener('click', () => {
    if (!Number.isInteger(session.answers[q.id])) return;
    if (session.index === 19) {
      const firstMissing = session.questionIds.findIndex(id => !Number.isInteger(session.answers[id]));
      if (firstMissing !== -1) { session.index = firstMissing; renderQuestion(); return; }
      session.completedAt = new Date().toISOString(); save(); renderResult();
    } else { session.index += 1; renderQuestion(); }
  });
}
function scoreResult() {
  if (!session || answerCount() !== 20) return null;
  const values = AXES.map(axis => {
    const questions = session.questionIds.map(id => byId.get(id)).filter(q => q.axis === axis.key);
    const sum = questions.reduce((total, q) => total + (session.answers[q.id] - 3) * (q.pole === axis.key ? 1 : -1), 0);
    const percent = (sum + 10) * 5;
    return { ...axis, sum, percent, neutral: sum === 0, letter: sum >= 0 ? axis.key : axis.opposite };
  });
  return { code: values.map(v => v.letter).join(''), values };
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
function renderResult() {
  const r = scoreResult();
  if (!r) return renderHome();
  lastView = 'result';
  const narrative = [...r.code].map(char => TRAITS[char]).join(', ');
  const isNeutral = r.values.some(v => v.neutral);
  app.innerHTML = `
    <section class="panel">
      <div class="result-hero"><p class="eyebrow">YOUR RELATIONSHIP VALUES</p><p class="muted">나의 연애 가치관 유형</p><h1 class="result-code">${r.code}</h1><h2 class="result-name">${TYPE_NAMES[r.code]}</h2><p class="result-lead">당신은 ${narrative} 관계를 선호하는 편입니다.</p></div>
      <section class="section"><h3>4가지 가치관 분석</h3><p class="note">각 영역에서 답변한 5개 문항을 합산한 결과입니다.</p>
        ${r.values.map(v => `<div class="axis"><div class="axis-names"><span>${v.left}</span><span>${v.right}</span></div><div class="axis-track"><span class="axis-left" style="width:${v.percent}%"></span><span class="axis-right" style="width:${100-v.percent}%"></span></div><div class="axis-values"><span>${v.percent}%</span><span>${100-v.percent}%</span></div>${v.neutral ? '<p class="neutral">중간 성향: 두 방향이 균형입니다. 4글자 코드에서는 왼쪽 문자를 임시로 사용했어요.</p>' : ''}</div>`).join('')}
        <p class="note">백분율은 답변 점수를 변환한 상대적 위치이며, 성격 비율이나 궁합 확률을 뜻하지 않습니다.</p>
      </section>
      <section class="section"><h3>다른 사람의 유형과 비교해 보기</h3><p>상대방에게도 검사를 해 달라고 한 뒤 결과의 4글자를 입력해 보세요. 같은 기준과 다른 기준을 비교할 수 있습니다.</p>
        <label class="label" for="other-type">상대방의 RVT 유형</label><div class="actions" style="margin-top:10px"><input id="other-type" class="type-input" placeholder="예: BDCP" maxlength="4" spellcheck="false" autocomplete="off"/><button class="btn secondary" type="button" id="compare">비교하기</button></div><div id="comparison" class="compare-output" aria-live="polite"></div>
      </section>
      <section class="section"><h3>중요한 것은 결과보다 대화</h3><p>유형이 서로 달라도 행복한 관계를 만들 수 있습니다. 서로가 왜 그런 판단을 했는지 이야기하고, 존중할 부분과 합의가 필요한 부분을 구분해 보세요.</p></section>
      <div class="actions"><button class="btn" type="button" id="share">결과 공유하기</button><button class="btn secondary" type="button" id="restart">다른 20문항으로 다시 검사</button></div>
      <p class="note">${isNeutral ? '중간 성향이 있는 차원은 문자 구분보다 점수 자체를 참고해 주세요. ' : ''}이 검사는 수업 발표용으로 자체 제작한 가치관 탐색 도구입니다.</p>
    </section>`;
  document.getElementById('restart').addEventListener('click', startNew);
  document.getElementById('share').addEventListener('click', async () => {
    const text = `나의 RVT 연애 가치관은 ${r.code} (${TYPE_NAMES[r.code]})!\n${window.location.href.split('?')[0].split('#')[0]}`;
    try {
      if (navigator.share) await navigator.share({ title: 'RVT 연애 가치관', text });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); alert('결과와 사이트 주소가 복사됐습니다.'); }
      else window.prompt('아래 내용을 복사하세요.', text);
    } catch (error) {
      if (error.name !== 'AbortError') window.prompt('아래 내용을 복사하세요.', text);
    }
  });
  document.getElementById('compare').addEventListener('click', () => {
    const candidate = document.getElementById('other-type').value.trim().toUpperCase();
    const output = document.getElementById('comparison');
    if (!/^[FB][OD][IC][SP]$/.test(candidate)) {
      output.innerHTML = '<p class="warn">F/B → O/D → I/C → S/P 순서로 네 글자를 입력해 주세요.</p>';
      return;
    }
    const same = AXES.filter((v, i) => r.code[i] === candidate[i]).map(v => v.title);
    const different = AXES.filter((v, i) => r.code[i] !== candidate[i]).map(v => v.title);
    output.innerHTML = `<div class="mini-grid"><div class="mini-card"><span class="label">내 유형</span><strong>${r.code}</strong></div><div class="mini-card"><span class="label">상대 유형</span><strong>${candidate}</strong></div></div><p><strong>비슷한 가치관:</strong> ${same.length ? same.join(', ') : '없음'}<br><strong>차이가 있는 가치관:</strong> ${different.length ? different.join(', ') : '없음'}</p><p class="note">다른 유형이 나왔다고 해서 맞지 않는 사이라는 의미는 아닙니다.</p>`;
  });
}

// 향후 Supabase 연동 시 사용할 수 있는 익명 제출 데이터 예시를 만드는 함수.
// 현재는 호출하지 않으며, 어떤 네트워크 요청도 보내지 않습니다.
function buildAnonymousSubmission() {
  const result = scoreResult();
  if (!result) return null;
  return {
    questionnaire_version: VERSION,
    completed_at: session.completedAt,
    responses: session.questionIds.map(id => ({ question_id: id, value: session.answers[id] })),
    type_code: result.code,
    dimension_scores: Object.fromEntries(result.values.map(v => [v.key, v.sum]))
  };
}

// 시작 화면으로 가더라도 검사 진행 내역은 유지됩니다.
document.getElementById('home-link').addEventListener('click', renderHome);
renderHome();
