-- RVT 고정 20문항 + Supabase 익명 응답 수집 / 관리자 조회
-- Supabase Dashboard → SQL Editor에서 이 파일 전체를 한 번 실행하세요.
-- 질문 순서 또는 pole(채점 방향)을 변경하면 rvt_submit_answers의 v_directions를 반드시 동기화해야 합니다.

create table if not exists public.rvt_events (
  code text primary key,
  title text not null,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  constraint rvt_event_code_format check (code ~ '^[a-zA-Z0-9_-]{1,64}$')
);

create table if not exists public.rvt_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.rvt_submissions (
  id uuid primary key,
  event_code text not null references public.rvt_events(code),
  questionnaire_version text not null,
  answers jsonb not null,
  type_code text not null,
  axis_scores jsonb not null,
  submitted_at timestamptz not null default now(),
  constraint rvt_type_code_format check (type_code ~ '^[FB][OD][IC][SP]$'),
  constraint rvt_answers_array check (jsonb_typeof(answers)='array' and jsonb_array_length(answers)=20)
);
create index if not exists rvt_submissions_event_time_idx
  on public.rvt_submissions(event_code, submitted_at desc);

insert into public.rvt_events(code,title,is_open)
values ('main','발표용 RVT 검사',true)
on conflict(code) do nothing;

alter table public.rvt_events enable row level security;
alter table public.rvt_admins enable row level security;
alter table public.rvt_submissions enable row level security;

-- 절대로 응답 테이블에 anon INSERT 또는 SELECT 정책을 만들지 않습니다.
revoke all on table public.rvt_events, public.rvt_admins, public.rvt_submissions
  from public, anon, authenticated;

drop policy if exists rvt_admin_events_select on public.rvt_events;
drop policy if exists rvt_admin_submissions_select on public.rvt_submissions;

create or replace function public.rvt_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rvt_admins a
    where a.user_id = (select auth.uid())
  );
$$;

-- 관리자만 이벤트와 응답을 조회 가능
create policy rvt_admin_events_select on public.rvt_events
  for select to authenticated using ((select public.rvt_is_admin()));
create policy rvt_admin_submissions_select on public.rvt_submissions
  for select to authenticated using ((select public.rvt_is_admin()));
grant select on table public.rvt_events, public.rvt_submissions to authenticated;

-- DB가 클라이언트 점수/유형을 신뢰하지 않고, 정해진 20문항 답변으로 직접 채점합니다.
create or replace function public.rvt_submit_answers(
  p_event_code text,
  p_answers jsonb,
  p_submission_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i integer;
  v_answer integer;
  v_index integer;
  v_score integer[] := array[0,0,0,0];
  -- 1~20번의 채점 방향 (+ 첫 번째 성향 / - 반대 성향)
  -- 질문: F01 O01 I01 S01 F02 O02 I02 S07 F04 O03 I03 S04 F05 O04 I04 S02 F09 O05 I05 S08
  v_directions integer[] := array[1,1,1,1, -1,-1,-1,1, -1,1,1,-1, 1,-1,-1,-1, 1,1,1,-1];
  v_type text;
  v_existing_event text;
  v_existing_answers jsonb;
  v_inserted integer;
begin
  if p_submission_id is null or p_event_code is null
     or p_event_code !~ '^[a-zA-Z0-9_-]{1,64}$' then
    raise exception '제출 ID 또는 이벤트 코드가 올바르지 않습니다.' using errcode='22023';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception '응답은 숫자 배열이어야 합니다.' using errcode='22023';
  end if;
  if jsonb_array_length(p_answers) <> 20 then
    raise exception '정확히 20개 답변을 제출해야 합니다.' using errcode='22023';
  end if;

  -- 같은 제출 ID로 재시도하면 중복 저장하지 않음
  select event_code,answers into v_existing_event,v_existing_answers
    from public.rvt_submissions where id=p_submission_id;
  if found then
    if v_existing_event=p_event_code and v_existing_answers=p_answers then
      return p_submission_id;
    end if;
    raise exception '제출 ID가 이미 다른 답변에 사용되었습니다.' using errcode='22023';
  end if;

  if not exists (select 1 from public.rvt_events
                 where code=p_event_code and is_open=true) then
    raise exception '검사가 종료되었거나 유효하지 않은 발표 세션입니다.' using errcode='22023';
  end if;

  for v_i in 0..19 loop
    if (p_answers->v_i) not in ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb) then
      raise exception '답변은 1~5 사이의 숫자여야 합니다.' using errcode='22023';
    end if;
    v_answer := (p_answers->>v_i)::integer;
    v_index := mod(v_i,4)+1;
    v_score[v_index] := v_score[v_index]+(v_answer-3)*v_directions[v_i+1];
  end loop;

  v_type := (case when v_score[1]>=0 then 'F' else 'B' end)
         || (case when v_score[2]>=0 then 'O' else 'D' end)
         || (case when v_score[3]>=0 then 'I' else 'C' end)
         || (case when v_score[4]>=0 then 'S' else 'P' end);

  insert into public.rvt_submissions(
    id,event_code,questionnaire_version,answers,type_code,axis_scores
  ) values (
    p_submission_id,p_event_code,'RVT-fixed20-v1',p_answers,v_type,
    jsonb_build_object('F',v_score[1],'O',v_score[2],'I',v_score[3],'S',v_score[4])
  ) on conflict(id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted=0 then
    select event_code,answers into v_existing_event,v_existing_answers
      from public.rvt_submissions where id=p_submission_id;
    if v_existing_event is distinct from p_event_code
       or v_existing_answers is distinct from p_answers then
      raise exception '제출 ID 중복 충돌입니다.' using errcode='22023';
    end if;
  end if;
  return p_submission_id;
end;
$$;

-- 관리자가 발표 중에 QR 테스트 접수를 열고 닫는 기능
create or replace function public.rvt_set_event_open(
  p_event_code text,
  p_is_open boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.rvt_is_admin() then
    raise exception '관리자만 이벤트를 변경할 수 있습니다.' using errcode='42501';
  end if;
  if p_is_open is null then
    raise exception 'is_open 값이 필요합니다.' using errcode='22023';
  end if;
  update public.rvt_events set is_open=p_is_open where code=p_event_code;
  if not found then
    raise exception '이벤트가 존재하지 않습니다.' using errcode='22023';
  end if;
  return p_is_open;
end;
$$;

-- Supabase 함수는 기본으로 PUBLIC 실행 권한이 있을 수 있으므로 명시적으로 제한.
revoke all on function public.rvt_is_admin() from public,anon,authenticated;
revoke all on function public.rvt_submit_answers(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.rvt_set_event_open(text,boolean) from public,anon,authenticated;

grant execute on function public.rvt_is_admin() to authenticated;
grant execute on function public.rvt_submit_answers(text,jsonb,uuid) to anon,authenticated;
grant execute on function public.rvt_set_event_open(text,boolean) to authenticated;

-- 중요: SQL Editor에서 관리자를 직접 등록하세요. 아래 UUID는 예시이므로 실행하지 마세요.
-- insert into public.rvt_admins(user_id) values ('관리자_계정_UUID');
