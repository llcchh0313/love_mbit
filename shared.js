'use strict';
(() => {
  const questions = window.RVT_QUESTIONS;
  const AXES = [
    {key:'F', opposite:'B', title:'관계의 경계', left:'F · 자유 중시', right:'B · 경계 중시'},
    {key:'O', opposite:'D', title:'정보의 공유', left:'O · 투명성 중시', right:'D · 선택적 공유'},
    {key:'I', opposite:'C', title:'삶의 우선순위', left:'I · 개인 생활 중시', right:'C · 공동생활 중시'},
    {key:'S', opposite:'P', title:'상황의 판단', left:'S · 상황 중심', right:'P · 원칙 중심'}
  ];
  const TRAITS = {
    F:'친구 관계와 서로의 자율성을 존중하는', B:'연인이 합의한 경계와 배려를 중요하게 보는',
    O:'생각과 감정을 솔직하게 나누려는', D:'사생활과 선택적인 공유를 존중하는',
    I:'각자의 활동과 독립적인 시간을 소중히 여기는', C:'함께하는 경험과 공동의 계획을 우선하는',
    S:'행동이 나온 상황과 맥락을 살피는', P:'서로 합의한 기준의 일관성을 중요하게 보는'
  };
  const TYPE_NAMES = {
    FOIS:'자유로운 소통가', FOIP:'솔직한 기준가', FOCS:'유연한 동행자', FOCP:'함께하는 설계자',
    FDIS:'독립적인 관찰자', FDIP:'신중한 자유인', FDCS:'조용한 동행자', FDCP:'배려하는 계획가',
    BOIS:'경계를 아는 대화가', BOIP:'원칙적인 소통가', BOCS:'따뜻한 협의가', BOCP:'약속을 지키는 동반자',
    BDIS:'독립적인 신중파', BDIP:'일관된 원칙가', BDCS:'마음을 살피는 동반자', BDCP:'단단한 약속의 수호자'
  };
  const VERSION = 'RVT-fixed20-v1';
  const config = window.RVT_CONFIG || {};
  const isConfigured = Boolean(
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl || '') &&
    config.supabasePublishableKey && !config.supabasePublishableKey.startsWith('YOUR_') &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(config.eventCode || '')
  );
  const client = isConfigured && window.supabase
    ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:false }
      })
    : null;
  function calculate(answers) {
    if(!Array.isArray(answers) || answers.length !== 20 ||
      !answers.every(x=>Number.isInteger(x) && x>=1 && x<=5)) return null;
    const values = AXES.map(axis => {
      const sum=questions.reduce((acc,q,i) => acc+(q.axis===axis.key
        ? (answers[i]-3)*(q.pole===axis.key ? 1 : -1) : 0),0);
      return {...axis, sum, percent:(sum+10)*5, neutral:sum===0,
        letter:sum>=0?axis.key:axis.opposite};
    });
    return { code:values.map(v=>v.letter).join(''), values };
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function getErrorMessage(error) {return error && error.message ? error.message : String(error || '알 수 없는 오류');}
  window.RVT = { questions, AXES, TRAITS, TYPE_NAMES, VERSION, config,
    isConfigured, client, calculate, escapeHtml, getErrorMessage };
})();
