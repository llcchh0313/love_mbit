'use strict';
(() => {
  const { questions, AXES, TRAITS, TYPE_NAMES, VERSION, client, config, isConfigured, calculate, escapeHtml } = window.RVT;
  const STORAGE_KEY='rvt-fixed20-db-session-v1';
  const app=document.getElementById('app');
  let submitting=false;
  function newId(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // 오래된 브라우저용 대체 ID. 보안 토큰이 아닌 중복 제출 방지용 식별자입니다.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
      const r=Math.floor(Math.random()*16); return (c==='x'?r:(r&3|8)).toString(16);
    });
  }
  function emptySession(){return {version:VERSION,answers:Array(20).fill(null),index:0,
    id:newId(),completedAt:null,submitted:false,agreed:true};}
  function restore(){try{
    const v=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');
    if(v && v.version===VERSION && Array.isArray(v.answers) && v.answers.length===20 &&
      v.answers.every(x=>x===null||(Number.isInteger(x)&&x>=1&&x<=5)) &&
      Number.isInteger(v.index)&&v.index>=0&&v.index<20 &&
      typeof v.id==='string' && /^[0-9a-f-]{36}$/i.test(v.id)) return v;
  }catch{} return null;}
  let session=restore();
  function save(){try{if(session)sessionStorage.setItem(STORAGE_KEY,JSON.stringify(session));else sessionStorage.removeItem(STORAGE_KEY);}catch{}}
  function count(){return session?session.answers.filter(x=>x!==null).length:0;}
  function start(){session=emptySession();save();renderQuestion();}
  function renderHome(){
    const resume=session&&count()>0&&!session.completedAt;
    const done=session&&session.completedAt&&count()===20;
    app.innerHTML=`<section class="panel hero"><div class="eyebrow">RELATIONSHIP VALUES TEST</div>
      <h1>우리는 왜<br>다르게 생각할까?</h1>
      <p class="hero-lead">실제 연애에서 일어날 법한 20가지 상황을 읽고<br>자신의 생각에 가까운 답을 골라 주세요.</p>
      <div class="tags"><span class="tag">고정 20문항</span><span class="tag">5단계 응답</span><span class="tag">4가지 가치관</span><span class="tag">16가지 유형</span></div>
      <label class="consent"><input id="consent" type="checkbox"> 검사 종료 시 나의 20개 응답과 분석 결과가 발표 통계에 사용되는 것에 동의합니다. 이름·학번·전화번호는 수집하지 않습니다.</label>
      <div class="actions"><button class="btn" type="button" id="start" disabled>검사 시작하기 →</button>
        ${resume?`<button class="btn secondary" type="button" id="resume">이어하기 (${count()}/20)</button>`:''}
        ${done?'<button class="btn secondary" type="button" id="show-result">내 결과 다시 보기</button>':''}</div>
      <p class="note">20개 문항은 모두에게 같은 순서로 출제됩니다. 개인별 답변은 공개되지 않고, 발표에는 집계 그래프를 사용합니다.</p>
      ${!isConfigured?'<div class="status error">DB 설정이 아직 완료되지 않았습니다. 현 상태에서는 검사를 체험할 수 있지만 결과는 서버에 저장되지 않습니다.</div>':''}
      </section>`;
    const checkbox=document.getElementById('consent'),button=document.getElementById('start');
    checkbox.addEventListener('change',()=>{button.disabled=!checkbox.checked;});
    button.addEventListener('click',start);
    if(resume)document.getElementById('resume').addEventListener('click',()=>renderQuestion());
    if(done)document.getElementById('show-result').addEventListener('click',()=>renderResult());
  }
  function renderQuestion(){
    if(!session)return renderHome();
    save();const index=session.index,q=questions[index];
    app.innerHTML=`<section class="panel"><div class="topline"><span>나의 연애 가치관 알아보기</span><b>${index+1} / 20</b></div>
      <div class="progress"><div class="progress-fill" style="width:${(index+1)*5}%"></div></div>
      <div class="category">QUESTION ${String(index+1).padStart(2,'0')}</div>
      <div class="scenario"><p class="scenario-label">SITUATION</p><p class="scenario-text">${escapeHtml(q.scenario)}</p></div>
      <div class="prompt-label">나의 생각</div><h2 class="prompt">${escapeHtml(q.statement)}</h2>
      <div class="choices" role="group" aria-label="동의 정도">${[1,2,3,4,5].map(n=>`<button class="choice ${session.answers[index]===n?'chosen':''}" type="button" data-score="${n}" aria-pressed="${session.answers[index]===n}">${n}</button>`).join('')}</div>
      <div class="choice-guides"><span>1 · 전혀 동의하지 않음</span><span>5 · 매우 동의함</span></div>
      <div class="actions"><button class="btn secondary" type="button" id="back">${index===0?'처음으로':'← 이전'}</button>
        <button class="btn" type="button" id="next" ${session.answers[index]===null?'disabled':''}>${index===19?'결과 확인하기':'다음 →'}</button></div></section>`;
    document.querySelectorAll('[data-score]').forEach(b=>b.addEventListener('click',()=>{
      session.answers[index]=Number(b.dataset.score);save();renderQuestion();
    }));
    document.getElementById('back').addEventListener('click',()=>{if(index===0)renderHome();else{session.index--;renderQuestion();}});
    document.getElementById('next').addEventListener('click',()=>{
      if(session.answers[index]===null)return;
      if(index<19){session.index++;renderQuestion();return;}
      const firstMissing=session.answers.findIndex(x=>x===null);
      if(firstMissing!==-1){session.index=firstMissing;renderQuestion();return;}
      session.completedAt=session.completedAt||new Date().toISOString();save();renderResult();
    });
  }
  function status(message,type='info',retry=false){
    const div=document.getElementById('db-status');if(!div)return;
    div.className=`status ${type}`;
    div.innerHTML=`${escapeHtml(message)}${retry?'<div><button class="btn secondary" id="retry" type="button">다시 저장 시도</button></div>':''}`;
    if(retry)document.getElementById('retry').addEventListener('click',sendSubmission);
  }
  async function sendSubmission(){
    if(!session||session.submitted||submitting)return;
    if(!client){status('DB 설정이 없어 응답이 저장되지 않았습니다. 발표자에게 알려 주세요.','error');return;}
    if(!session.agreed){status('동의 없이 제출할 수 없습니다.','error');return;}
    const sendingSession=session;
    submitting=true;status('응답을 안전하게 저장하고 있습니다…');
    try{
      const {data,error}=await client.rpc('rvt_submit_answers',{
        p_event_code:config.eventCode,p_answers:sendingSession.answers,p_submission_id:sendingSession.id
      });
      if(error)throw error;
      if(!data)throw new Error('서버에서 저장 확인 응답을 받지 못했습니다.');
      if(session===sendingSession){session.submitted=true;save();status('제출 완료! 답변이 발표 통계에 저장되었습니다.','good');}
    }catch(err){
      if(session===sendingSession)status('저장에 실패했습니다. 인터넷 연결과 DB 설정을 확인한 뒤 다시 시도해 주세요. ('+err.message+')','error',true);
    }finally{submitting=false;}
  }
  function renderResult(){
    if(!session||!session.completedAt)return renderHome();
    const r=calculate(session.answers);if(!r)return renderHome();
    const narrative=[...r.code].map(ch=>TRAITS[ch]).join(', ');
    app.innerHTML=`<section class="panel"><div class="result-hero"><p class="eyebrow">YOUR RELATIONSHIP VALUES</p>
      <p class="muted">나의 연애 가치관 유형</p><h1 class="result-code">${r.code}</h1>
      <h2 class="result-name">${TYPE_NAMES[r.code]}</h2><p class="result-lead">당신은 ${narrative} 관계를 선호하는 편입니다.</p></div>
      <div id="db-status" role="status"></div>
      <section class="section"><h3>4가지 가치관 분석</h3><p class="note">각 가치관별 고정 문항 5개를 합산했습니다.</p>
      ${r.values.map(v=>`<div class="axis"><div class="axis-names"><span>${v.left}</span><span>${v.right}</span></div>
      <div class="axis-track"><span class="axis-left" style="width:${v.percent}%"></span><span class="axis-right" style="width:${100-v.percent}%"></span></div>
      <div class="axis-values"><span>${v.percent}%</span><span>${100-v.percent}%</span></div>
      ${v.neutral?'<p class="neutral">중간 성향: 두 방향이 균형입니다. 4글자 코드에서는 왼쪽 문자를 임시로 사용했어요.</p>':''}</div>`).join('')}
      <p class="note">백분율은 문항 점수를 바꾼 상대적 위치입니다. 성격 비율이나 궁합 확률은 아닙니다.</p></section>
      <section class="section"><h3>다른 사람과 비교해 보기</h3><p>상대방의 4글자 유형을 입력하면 두 사람의 공통점과 차이를 살펴볼 수 있어요.</p>
      <label class="label" for="other-type">상대방의 RVT 유형</label><div class="actions" style="margin-top:10px">
      <input id="other-type" class="type-input" placeholder="예: BDCP" maxlength="4" spellcheck="false" autocomplete="off">
      <button class="btn secondary" id="compare" type="button">비교하기</button></div><div id="comparison" class="compare-output"></div></section>
      <section class="section"><h3>차이를 이해하는 관계</h3><p>다른 유형이라고 반드시 맞지 않는 사이는 아닙니다. 왜 그렇게 판단했는지 대화해 보세요.</p></section>
      <div class="actions"><button class="btn" id="share" type="button">결과 공유하기</button><button class="btn secondary" id="restart" type="button">새 검사 시작</button></div>
      <p class="note">RVT는 수업 발표용으로 자체 설계한 검사이며 심리학적 타당화가 이루어진 진단 도구는 아닙니다.</p></section>`;
    if(session.submitted)status('이미 제출한 응답입니다. 서버에 저장된 상태입니다.','good');
    else sendSubmission();
    document.getElementById('restart').addEventListener('click',()=>{session=null;save();renderHome();});
    document.getElementById('compare').addEventListener('click',()=>{
      const other=document.getElementById('other-type').value.trim().toUpperCase();const out=document.getElementById('comparison');
      if(!/^[FB][OD][IC][SP]$/.test(other)){out.innerHTML='<p class="warn">F/B → O/D → I/C → S/P 순서로 입력해 주세요.</p>';return;}
      const same=AXES.filter((a,i)=>r.code[i]===other[i]).map(a=>a.title);
      const diff=AXES.filter((a,i)=>r.code[i]!==other[i]).map(a=>a.title);
      out.innerHTML=`<div class="mini-grid"><div class="mini-card"><span class="label">내 유형</span><strong>${r.code}</strong></div><div class="mini-card"><span class="label">상대 유형</span><strong>${other}</strong></div></div><p><strong>비슷한 기준:</strong> ${same.join(', ')||'없음'}<br><strong>다른 기준:</strong> ${diff.join(', ')||'없음'}</p><p class="note">관계의 적합도를 수치화한 결과가 아닙니다.</p>`;
    });
    document.getElementById('share').addEventListener('click',async()=>{
      const text=`나의 RVT 연애 가치관은 ${r.code} (${TYPE_NAMES[r.code]})!\n${location.href.split('?')[0].split('#')[0]}`;
      try{if(navigator.share)await navigator.share({title:'RVT 연애 가치관',text});
        else if(navigator.clipboard){await navigator.clipboard.writeText(text);alert('결과와 사이트 주소를 복사했습니다.');}
        else prompt('아래 내용을 복사하세요.',text);
      }catch(e){if(e.name!=='AbortError')prompt('아래 내용을 복사하세요.',text);}
    });
  }
  document.getElementById('home-link').addEventListener('click',renderHome);
  renderHome();
})();
