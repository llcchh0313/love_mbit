'use strict';
(() => {
  const {client,config,isConfigured,questions,AXES,TYPE_NAMES,VERSION,calculate,escapeHtml}=window.RVT;
  const app=document.getElementById('admin-app');
  const MAX_ROWS=20000;
  const PAGE_SIZE=500;
  let rows=[],stats=null,isOpen=true,pollTimer=null,loading=false,selectedQuestion=0;
  function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}
  function setMessage(msg,type='info'){
    const el=document.getElementById('admin-status');if(!el)return;
    el.className='status '+type;el.textContent=msg;
  }
  function buttonBusy(id,busy){const el=document.getElementById(id);if(el)el.disabled=busy;}
  function showLogin(error=''){
    stopPolling();
    app.innerHTML=`<section class="panel"><p class="eyebrow">PRESENTER ONLY</p><h1>발표자 로그인</h1>
      <p class="muted">검사 참여자는 로그인이 필요하지 않습니다. 통계와 개별 답변은 등록된 관리자에게만 공개됩니다.</p>
      <form id="login-form" class="form-grid"><label>관리자 이메일<input class="form-control" type="email" name="email" required autocomplete="username"></label>
      <label>비밀번호<input class="form-control" type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn" type="submit" id="login-submit">로그인</button></form><div id="admin-status" role="status"></div></section>`;
    if(error)setMessage(error,'error');
    document.getElementById('login-form').addEventListener('submit',async e=>{
      e.preventDefault();buttonBusy('login-submit',true);
      const data=new FormData(e.currentTarget);
      try{
        const result=await client.auth.signInWithPassword({email:data.get('email'),password:data.get('password')});
        if(result.error)throw result.error;
        const ok=await checkAdmin();
        if(!ok){await client.auth.signOut();throw new Error('이 계정은 rvt_admins 테이블에 관리자 등록이 되어 있지 않습니다.');}
        showDashboard();
      }catch(err){setMessage('로그인 실패: '+err.message,'error');buttonBusy('login-submit',false);}
    });
  }
  async function checkAdmin(){const {data,error}=await client.rpc('rvt_is_admin');if(error)throw error;return data===true;}
  function showDashboard(){
    stopPolling();
    app.innerHTML=`<section class="panel"><div class="admin-top"><div><p class="eyebrow">PRESENTER DASHBOARD</p>
      <h1 style="margin:10px 0">실시간 연애 가치관 통계</h1><p class="subhead">이벤트 코드: <strong>${escapeHtml(config.eventCode)}</strong> · 10초마다 새 데이터 조회</p></div>
      <div class="actions"><button class="btn secondary" id="refresh" type="button">새로고침</button><button class="btn secondary" id="signout" type="button">로그아웃</button></div></div>
      <div id="admin-status" role="status" class="status">데이터를 불러오는 중입니다…</div>
      <div class="actions"><button class="btn" id="toggle-event" type="button" disabled>접수 상태 불러오는 중</button>
      <a class="btn secondary" href="./index.html" target="_blank" rel="noopener">검사 페이지 열기</a></div>
      <div id="statistics"></div>
      <section class="section"><h3>PPT에 넣을 QR코드</h3><p class="note">발표 화면에 이 QR코드를 띄우면 참여자들이 바로 검사할 수 있습니다.</p>
        <div class="qr-area"><canvas id="qr-canvas" aria-label="검사 사이트 QR코드"></canvas></div>
        <div class="mini-actions"><button class="btn secondary" id="save-qr" type="button">QR코드 PNG 다운로드</button>
        <button class="btn secondary" id="copy-link" type="button">검사 링크 복사</button></div></section>
      </section>`;
    document.getElementById('refresh').onclick=()=>loadStats();
    document.getElementById('signout').onclick=async()=>{stopPolling();await client.auth.signOut();showLogin();};
    document.getElementById('toggle-event').onclick=toggleEvent;
    document.getElementById('save-qr').onclick=()=>saveCanvas(document.getElementById('qr-canvas'),'RVT_참여_QR.png');
    document.getElementById('copy-link').onclick=async()=>{
      const url=new URL('./index.html',location.href).href;
      try{await navigator.clipboard.writeText(url);setMessage('검사 링크를 복사했습니다.','good');}
      catch{prompt('검사 링크를 복사하세요.',url);}
    };
    makeQr();loadStats();pollTimer=setInterval(()=>loadStats(true),10000);
  }
  async function makeQr(){
    const canvas=document.getElementById('qr-canvas');
    if(!window.QRCode||!canvas){setMessage('QR 생성 라이브러리를 불러오지 못했습니다. 검사 링크를 직접 공유하세요.','error');return;}
    const url=new URL('./index.html',location.href).href;
    try{await window.QRCode.toCanvas(canvas,url,{width:320,margin:3,color:{dark:'#201326',light:'#ffffff'}});}
    catch(err){setMessage('QR코드를 만들지 못했습니다: '+err.message,'error');}
  }
  async function toggleEvent(){
    buttonBusy('toggle-event',true);
    const desired=!isOpen;
    try{
      const {data,error}=await client.rpc('rvt_set_event_open',{p_event_code:config.eventCode,p_is_open:desired});
      if(error)throw error;isOpen=data===true;
      updateEventButton();setMessage(isOpen?'검사 접수를 다시 시작했습니다.':'검사 접수를 마감했습니다.','good');
    }catch(err){setMessage('접수 상태 변경 실패: '+err.message,'error');}
    finally{buttonBusy('toggle-event',false);}
  }
  function updateEventButton(){const b=document.getElementById('toggle-event');if(b){b.disabled=false;b.textContent=isOpen?'검사 접수 마감':'검사 접수 재개';}}
  async function fetchAllRows(){
    const collected=[];
    for(let offset=0;offset<MAX_ROWS;offset+=PAGE_SIZE){
      const {data,error}=await client.from('rvt_submissions')
        .select('id,questionnaire_version,answers,type_code,axis_scores,submitted_at')
        .eq('event_code',config.eventCode).order('submitted_at',{ascending:false})
        .range(offset,offset+PAGE_SIZE-1);
      if(error)throw error;
      collected.push(...(data||[]));
      if(!data||data.length<PAGE_SIZE)break;
    }
    return collected;
  }
  async function loadStats(silent=false){
    if(loading)return;
    loading=true;
    if(!silent)setMessage('데이터를 불러오는 중입니다…');
    try{
      const {data:eventRows,error:eventError}=await client.from('rvt_events')
        .select('is_open,title').eq('code',config.eventCode).limit(1);
      if(eventError)throw eventError;
      if(!eventRows || eventRows.length!==1)throw new Error('이벤트를 찾을 수 없습니다. setup.sql과 eventCode를 확인하세요.');
      isOpen=eventRows[0].is_open;updateEventButton();
      rows=await fetchAllRows();
      const onlyCorrectVersion=rows.filter(r=>r.questionnaire_version===VERSION && Array.isArray(r.answers)&&r.answers.length===20);
      const excluded=rows.length-onlyCorrectVersion.length;
      stats=analyze(onlyCorrectVersion);drawStats(stats);
      setMessage(`마지막 갱신: ${new Date().toLocaleTimeString('ko-KR')} · 저장된 응답 ${rows.length}건${excluded?' · 다른 버전/형식 '+excluded+'건 제외':''} · ${isOpen?'접수 중':'접수 마감'}`,'good');
    }catch(err){setMessage('데이터 조회 실패: '+err.message,'error');}
    finally{loading=false;}
  }
  function analyze(data){
    const typeCounts=Object.fromEntries(Object.keys(TYPE_NAMES).map(t=>[t,0]));
    const qCounts=questions.map(()=>[0,0,0,0,0]);
    const sums=[0,0,0,0];
    let valid=0;
    for(const record of data){
      const answers=record.answers;const result=calculate(answers);if(!result)continue;
      valid++;
      typeCounts[result.code]=(typeCounts[result.code]||0)+1;
      answers.forEach((a,i)=>qCounts[i][a-1]++);
      result.values.forEach((v,i)=>{sums[i]+=v.sum;});
    }
    const qStats=qCounts.map((counts,i)=>{
      const n=counts.reduce((a,b)=>a+b,0);
      const mean=n?counts.reduce((acc,v,j)=>acc+(j+1)*v,0)/n:0;
      const variance=n?counts.reduce((acc,v,j)=>acc+v*((j+1)-mean)**2,0)/n:0;
      return {question:questions[i],index:i,counts,n,mean,sd:Math.sqrt(variance)};
    });
    return {total:valid,typeCounts,qStats,averages:sums.map(s=>valid?(s/valid+10)*5:50),
      diversity:qStats.filter(x=>x.n>0).sort((a,b)=>b.sd-a.sd)};
  }
  function drawStats(s){
    const maxCount=Math.max(1,...Object.values(s.typeCounts));
    const ordered=Object.entries(s.typeCounts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    const peak=ordered[0];
    const selectedBefore=document.getElementById('question-select');
    if(selectedBefore) selectedQuestion=Number(selectedBefore.value)||0;
    document.getElementById('statistics').innerHTML=`
      <div class="kpi-grid"><div class="kpi"><span class="small">응답 완료 인원</span><strong>${s.total}명</strong></div>
        <div class="kpi"><span class="small">가장 많은 유형</span><strong>${s.total?peak[0]:'—'}</strong></div>
        <div class="kpi"><span class="small">검사 상태</span><strong style="font-size:23px">${isOpen?'접수 중':'접수 마감'}</strong></div></div>
      <section class="section"><h3>16가지 유형 분포</h3><p class="note">각 유형의 응답 인원과 전체 응답 대비 비율입니다.</p>
        <div class="type-rows">${ordered.map(([type,n])=>`<div class="type-line"><strong>${type}</strong><div class="bar-bg"><div class="bar-fg" style="width:${n/maxCount*100}%"></div></div><span class="value">${n}명 (${s.total?Math.round(n/s.total*100):0}%)</span></div>`).join('')}</div>
        <div class="mini-actions"><button class="btn secondary" id="type-png" type="button">유형 분포 PNG 저장</button>
        <button class="btn secondary" id="raw-csv" type="button">개별 응답 CSV</button>
        <button class="btn secondary" id="summary-csv" type="button">문항 통계 CSV</button></div></section>
      <section class="section"><h3>4가지 성향의 전체 평균</h3><p class="note">평균 점수를 선형 변환한 값입니다. 심리학적 비율이 아닙니다.</p>
        ${AXES.map((a,i)=>`<div class="axis"><div class="axis-names"><span>${a.left}</span><span>${a.right}</span></div>
          <div class="axis-track"><span class="axis-left" style="width:${s.averages[i]}%"></span><span class="axis-right" style="width:${100-s.averages[i]}%"></span></div>
          <div class="axis-values"><span>${s.averages[i].toFixed(1)}%</span><span>${(100-s.averages[i]).toFixed(1)}%</span></div></div>`).join('')}
        <div class="mini-actions"><button class="btn secondary" id="axis-png" type="button">가치관 평균 PNG 저장</button></div></section>
      <section class="section"><h3>문항별 5단계 응답 분포</h3>
        <p class="note">1 = 전혀 동의하지 않음 · 3 = 보통 · 5 = 매우 동의함</p>
        <div class="legend">${['#8b89d5','#b3a3e3','#8a7f98','#eea6ca','#ec739e'].map((c,i)=>`<span style="--swatch:${c}">${i+1}점</span>`).join('')}</div>
        <div class="questions-list">${s.qStats.map(q=>questionRow(q)).join('')}</div></section>
      <section class="section"><h3>의견이 가장 다양했던 질문 TOP 3</h3>
        <p class="note">응답의 표준편차가 큰 순서입니다. 값이 크다고 반드시 찬반으로 양극화된 것은 아닙니다.</p>
        <div class="questions-list">${s.diversity.slice(0,3).map(q=>questionRow(q)).join('')||'<p class="note">응답이 들어오면 표시됩니다.</p>'}</div></section>
      <section class="section"><h3>PPT용 질문 그래프 다운로드</h3>
        <label class="label" for="question-select">다운로드할 질문 선택</label>
        <select class="form-control choice-select" id="question-select" style="margin-top:8px">${questions.map((q,i)=>`<option value="${i}" ${i===selectedQuestion?'selected':''}>Q${String(i+1).padStart(2,'0')} · ${escapeHtml(q.statement)}</option>`).join('')}</select>
        <div class="mini-actions"><button class="btn" id="question-png" type="button">선택한 질문 PNG 저장</button></div></section>`;
    document.getElementById('type-png').onclick=()=>pngTypes(stats);
    document.getElementById('axis-png').onclick=()=>pngAxes(stats);
    document.getElementById('question-png').onclick=()=>pngQuestion(stats,selectedQuestion);
    document.getElementById('question-select').onchange=e=>{selectedQuestion=Number(e.target.value);};
    document.getElementById('raw-csv').onclick=()=>csvRaw();
    document.getElementById('summary-csv').onclick=()=>csvSummary(stats);
  }
  function questionRow(q){
    return `<div class="question-stat"><header><span class="eyebrow">Q${String(q.index+1).padStart(2,'0')}</span><span class="pill-status">${q.n}명 · 평균 ${q.n?q.mean.toFixed(2):'—'}</span></header>
      <h4>${escapeHtml(q.question.statement)}</h4><div class="stackbar">${q.counts.map((v,i)=>`<span class="seg${i+1}" style="width:${q.n?v/q.n*100:0}%" title="${i+1}점: ${v}명"></span>`).join('')}</div>
      <div class="stats-meta">${q.counts.map((v,i)=>`${i+1}점 ${v}명`).join(' · ')} | 표준편차 ${q.n?q.sd.toFixed(2):'—'}</div></div>`;
  }
  function makeCanvas(w=1500,h=900){
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,w,h);
    g.fillStyle='#23202c';g.textBaseline='alphabetic';return {c,g,w,h};
  }
  function drawText(g,text,x,y,size=24,color='#23202c',bold=false){
    g.fillStyle=color;g.font=`${bold?'700':'400'} ${size}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;g.fillText(String(text),x,y);
  }
  function wrap(g,text,maxWidth){
    const parts=String(text).split('');const lines=[''];
    for(const char of parts){const i=lines.length-1;
      if(g.measureText(lines[i]+char).width>maxWidth && lines[i])lines.push(char);
      else lines[i]+=char;
    }
    return lines;
  }
  function frame(g,w,title,subtitle){
    g.fillStyle='#b65f85';g.fillRect(0,0,w,12);
    drawText(g,'RVT · RELATIONSHIP VALUES TEST',75,83,22,'#ae6b8e',true);
    drawText(g,title,75,152,49,'#24202e',true);
    drawText(g,subtitle,75,200,22,'#777080');
  }
  function saveCanvas(canvas,name){
    if(!canvas||!canvas.width)return;
    canvas.toBlob(blob=>{if(blob)download(blob,name);},'image/png');
  }
  function download(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function pngTypes(s){
    const {c,g,w}=makeCanvas(1600,1080);frame(g,w,'연애 가치관 16유형 분포',`참여자 ${s.total}명 · 실제 설문 결과`);
    const ordered=Object.entries(s.typeCounts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    const max=Math.max(...ordered.map(d=>d[1]),1);
    ordered.forEach(([code,n],idx)=>{
      const col=Math.floor(idx/8),row=idx%8,x=75+col*765,y=265+row*96;
      drawText(g,code,x,y,25,'#35293b',true);
      g.fillStyle='#eee8ef';g.fillRect(x+105,y-22,370,23);
      g.fillStyle='#d17a9e';g.fillRect(x+105,y-22,370*n/max,23);
      drawText(g,`${n}명 (${s.total?(n/s.total*100).toFixed(1):'0.0'}%)`,x+490,y,21,'#59505f');
    });
    drawText(g,'응답 인원과 비율은 발표 참여자를 기준으로 합니다.',80,1030,21,'#817983');
    saveCanvas(c,'RVT_16유형_분포.png');
  }
  function pngAxes(s){
    const {c,g,w}=makeCanvas(1550,860);frame(g,w,'4가지 연애 가치관 평균',`참여자 ${s.total}명 · 중간값 50%`);
    const colors=['#e99abc','#9697d5'];
    AXES.forEach((a,i)=>{
      const y=273+i*132,p=s.averages[i];
      drawText(g,a.left,85,y,27,'#413343',true);
      drawText(g,a.right,1170,y,27,'#413343',true);
      g.fillStyle=colors[0];g.fillRect(85,y+17,1100*p/100,27);
      g.fillStyle=colors[1];g.fillRect(85+1100*p/100,y+17,1100*(1-p/100),27);
      drawText(g,`${p.toFixed(1)}%`,85,y+74,22,'#695b68');
      drawText(g,`${(100-p).toFixed(1)}%`,1120,y+74,22,'#695b68');
    });
    drawText(g,'이 비율은 설문 점수의 상대적 위치이며, 궁합이나 확률을 나타내지 않습니다.',85,815,21,'#817983');
    saveCanvas(c,'RVT_가치관_평균.png');
  }
  function pngQuestion(s,index){
    const q=s.qStats[index],{c,g,w}=makeCanvas(1550,1020);
    frame(g,w,`Q${String(index+1).padStart(2,'0')} · 문항별 응답 분포`,`응답 ${q.n}명 · 평균 ${q.n?q.mean.toFixed(2):'—'}점 · 실제 설문 결과`);
    drawText(g,'상황',85,254,22,'#b65f85',true);
    g.font='400 25px "Malgun Gothic",sans-serif';
    const scenario=wrap(g,q.question.scenario,1365).slice(0,3);
    scenario.forEach((line,i)=>drawText(g,line,85,290+i*35,25,'#5d5663'));
    const statementStart=295+scenario.length*35;
    drawText(g,'나의 판단',85,statementStart+9,22,'#b65f85',true);
    g.font='700 28px "Malgun Gothic",sans-serif';
    const lines=wrap(g,q.question.statement,1365).slice(0,3);
    lines.forEach((line,i)=>drawText(g,line,85,statementStart+50+i*39,28,'#332b3a',true));
    const colors=['#8b89d5','#b3a3e3','#8a7f98','#eea6ca','#ec739e'];
    const max=Math.max(...q.counts,1);
    q.counts.forEach((n,i)=>{
      const x=150+i*265,height=320*n/max;
      g.fillStyle=colors[i];g.fillRect(x,865-height,145,height);
      drawText(g,`${n}명`,x+38,853-height,29,'#2f2a35',true);
      drawText(g,`${i+1}점`,x+47,916,26,'#635c69',true);
    });
    drawText(g,'1점 = 전혀 동의하지 않음   |   3점 = 보통   |   5점 = 매우 동의함',90,981,24,'#817983');
    saveCanvas(c,`RVT_Q${String(index+1).padStart(2,'0')}_응답분포.png`);
  }
  function csvValue(v){const s=String(v??'');return '"'+s.replace(/"/g,'""')+'"';}
  function toCSV(arr,name){const txt='\ufeff'+arr.map(cols=>cols.map(csvValue).join(',')).join('\r\n');
    download(new Blob([txt],{type:'text/csv;charset=utf-8'}),name);}
  function csvRaw(){
    const cols=['submission_id','submitted_at','event_code','type_code','F_score','O_score','I_score','S_score',...questions.map(q=>q.id)];
    const records=rows.filter(r=>r.questionnaire_version===VERSION && calculate(r.answers));
    const lines=records.map(r=>[r.id,r.submitted_at,config.eventCode,r.type_code,
      ...AXES.map(a=>r.axis_scores?.[a.key]??''),...r.answers]);
    toCSV([cols,...lines],`RVT_${config.eventCode}_응답원본.csv`);
  }
  function csvSummary(s){
    const cols=['question_no','question_id','scenario','statement','n','mean','stddev','1점','2점','3점','4점','5점'];
    toCSV([cols,...s.qStats.map(q=>[q.index+1,q.question.id,q.question.scenario,q.question.statement,
      q.n,q.n?q.mean.toFixed(3):'',q.n?q.sd.toFixed(3):'',...q.counts])],`RVT_${config.eventCode}_문항통계.csv`);
  }
  async function init(){
    if(!isConfigured||!client){
      app.innerHTML='<section class="panel"><h1>Supabase 설정이 필요합니다</h1><p class="muted">config.js에 Supabase 프로젝트 URL과 공개용 API 키를 입력한 다음 다시 접속하세요.</p></section>';
      return;
    }
    try{
      const {data:{user},error}=await client.auth.getUser();
      if(error||!user)return showLogin();
      if(await checkAdmin())showDashboard();else{await client.auth.signOut();showLogin('관리자 권한이 없습니다. Supabase rvt_admins 등록을 확인하세요.');}
    }catch(err){showLogin('인증 확인 실패: '+err.message);}
  }
  init();
})();
