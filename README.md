# RVT — 20문항 고정 + Supabase DB 연동

연애 가치관 테스트 발표용 정적 사이트입니다. **GitHub Pages**로 배포하고 **Supabase**에 검사자의 응답을 저장합니다.
참여자는 `index.html`에 접속해 20문항을 1~5점으로 응답합니다. 발표자는 `admin.html`에서 집계 결과를 확인하고 PNG/CSV로 내려받습니다.

## 1. 설치 파일 구성

| 파일 | 용도 |
|---|---|
| `index.html` | 참여자 검사 사이트 |
| `admin.html` | 발표자 로그인/통계 대시보드 |
| `questions.js` | 모든 참가자에게 고정된 20개 상황형 질문 |
| `shared.js` | 공통 채점·16유형 이름·DB 클라이언트 |
| `script.js` | 질문 응답·점수 계산·Supabase 제출 |
| `admin.js` | 관리자 로그인·실시간 통계·PNG/CSV·QR 저장 |
| `style.css` | 모바일 반응형 스타일 |
| `config.js` | 공개용 Supabase 설정 (아래에서 수정) |
| `supabase/setup.sql` | 필요한 DB 테이블/보안 정책/함수 생성 |

## 2. Supabase 프로젝트 만들기

1. [Supabase](https://supabase.com/dashboard)에서 프로젝트를 생성합니다.
2. 왼쪽 **SQL Editor → New query**로 들어갑니다.
3. `supabase/setup.sql`의 **전체 내용**을 붙여 넣고 **Run**합니다.
4. 실행되면 `rvt_events`(발표 세션), `rvt_submissions`(익명 응답), `rvt_admins`(관리자 목록) 테이블 및 제출/권한 함수가 생성됩니다.
5. 기본 발표 세션 코드는 `main`이고, 처음에는 **접수 중** 상태로 생성됩니다.

### 관리자 계정 만들기

1. Supabase **Authentication → Users**에서 **Add user**로 관리자 이메일/비밀번호 계정을 만듭니다. 계정 이메일이 확인된 상태인지 점검합니다.
2. 생성된 사용자의 **User UID(UUID)**를 복사합니다.
3. SQL Editor에서 아래 쿼리를 실행합니다. 반드시 실제 UID로 바꿉니다.

```sql
insert into public.rvt_admins(user_id)
values ('여기에_관리자_User_UID')
on conflict (user_id) do nothing;
```

> **주의:** 로그인 계정을 생성했다고 자동으로 관리자 권한이 생기는 것은 아닙니다. 반드시 `rvt_admins`에 추가해야 합니다. 관리자 비밀번호를 GitHub에 올리면 안 됩니다.

## 3. 웹사이트와 Supabase 연결하기

Supabase **Project Settings → API Keys**에서 프로젝트 URL과 `publishable` 키를 확인합니다. 구형 프로젝트의 `anon` 키도 지원합니다.

`config.js`의 아래 세 항목을 수정합니다.

```javascript
window.RVT_CONFIG = Object.freeze({
  supabaseUrl: 'https://실제프로젝트ref.supabase.co',
  supabasePublishableKey: 'sb_publishable_실제공개용키',
  eventCode: 'main'
});
```

**절대로** `secret`, `service_role` 키나 관리자 비밀번호를 `config.js`에 적지 마세요. 공개용 키는 원래 브라우저에서 사용하는 키이며, `setup.sql`의 RLS(행 수준 보안) 및 함수를 통해 접근 권한을 제한합니다.

## 4. GitHub Pages로 배포하기

1. GitHub에서 Public 저장소(예: `rvt-test`)를 생성합니다.
2. 이 폴더 안의 파일과 `supabase` 폴더를 저장소 **루트**에 업로드하고 커밋합니다. ZIP 압축파일을 그대로 업로드하면 사이트가 동작하지 않습니다.
3. 저장소 **Settings → Pages → Build and deployment**에서 `Deploy from a branch`를 선택합니다.
4. `main` 브랜치, `/(root)` 폴더를 선택하고 저장합니다.
5. 배포 후 다음 URL로 접속합니다.
   - 참여자: `https://깃허브아이디.github.io/rvt-test/`
   - 발표자: `https://깃허브아이디.github.io/rvt-test/admin.html`

기존 RVT 저장소를 사용하고 있다면 **새로 업로드한 웹 파일로 교체**한 뒤 설정을 커밋하면 됩니다. GitHub Pages는 정적 사이트이므로 별도 Node 서버가 필요하지 않습니다.

## 5. DB 연동 시험하기

1. 휴대폰이나 PC의 참여자 사이트에 접속합니다.
2. 통계 수집 동의에 체크한 다음 20개 문항에 답합니다.
3. 결과 페이지에 **`제출 완료! 답변이 발표 통계에 저장되었습니다.`**라는 표시가 나오는지 확인합니다.
4. `admin.html`에서 등록한 관리자 계정으로 로그인합니다.
5. 응답 인원 증가, 16유형/4성향/문항별 분포가 보이는지 확인합니다.
6. `문항 통계 CSV`, `유형 분포 PNG`, `선택한 질문 PNG`를 다운로드해 PPT에 넣을 수 있습니다.
7. `QR코드 PNG 다운로드`로 PPT 참여 안내용 QR 이미지를 받을 수 있습니다.

오류가 나면 참여자 페이지의 오류 메시지와 Supabase SQL 실행 여부, `config.js`의 URL/키, `rvt_admins` 등록 상태를 먼저 확인하세요.

## 6. 실제 발표 시 진행법

- 사전에 관리자 대시보드에서 발표 링크/QR코드를 내려받아 PPT에 넣습니다.
- 발표 시작 전, 테스트 응답과 실제 응답이 섞이지 않도록 **별도 이벤트 코드**로 바꾸는 것을 추천합니다.
- 발표 중 QR을 띄운 후 청중이 검사합니다. **관리자 대시보드는 10초마다 갱신**됩니다.
- 결과를 PPT에 바로 넣을 수는 없으므로, 발표 중에는 대시보드를 별도 브라우저 탭에서 보여주거나 발표 직후 PNG로 저장해 PPT에 삽입하세요.
- 마감할 때 `검사 접수 마감` 버튼을 누르면 새로운 응답 제출이 차단됩니다. 이미 저장된 응답은 그대로 남습니다.

### 발표 세션 분리하기

사전 테스트 데이터와 본 발표 데이터가 섞이지 않게, SQL Editor에서 새 발표 세션을 만듭니다.

```sql
insert into public.rvt_events(code,title,is_open)
values ('class2026', '2026년 수업 발표', true);
```

그 다음 `config.js`의 `eventCode`를 `'class2026'`으로 바꾸어 다시 GitHub에 배포하세요. 관리자/참가자 모두 같은 이벤트 코드를 사용합니다. 기존 `main`의 응답은 유지되고, 대시보드에는 `class2026` 응답만 나타납니다.

### 사전 테스트 데이터 삭제가 필요하다면

```sql
-- 삭제한 데이터는 복구되지 않을 수 있습니다. 실행 전에 확인하세요.
delete from public.rvt_submissions where event_code='main';
```

## 7. 데이터와 개인정보/보안

- 수집 항목: 제출 ID(무작위 UUID), 제출 시각, 발표 세션 코드, 고정 20문항의 1~5점 응답, 서버에서 산출한 4가지 성향 점수 및 유형.
- 이름, 학번, 전화번호, 이메일은 **참여자에게 입력받지 않습니다**. (발표자 로그인 이메일은 별도입니다.)
- 익명 참여자의 원본 응답 조회를 막고, Supabase Auth에 로그인한 `rvt_admins` 등록 계정만 조회할 수 있게 RLS 정책을 설정합니다.
- 클라이언트는 DB 테이블에 직접 INSERT하지 않습니다. 제한된 `rvt_submit_answers` RPC를 호출합니다.
- 서버에서는 20문항의 값·범위를 검증하고 점수/유형을 직접 계산합니다. 제출 UUID가 같으면 중복 입력하지 않습니다.
- **제출 ID는 동일한 검사 제출의 중복을 방지할 뿐, 한 사람이 새 검사를 반복하는 것을 완전히 막지는 못합니다.** 공개적이고 큰 규모의 수집에는 별도의 rate limit/CAPTCHA/Edge Function 보호가 필요할 수 있습니다.
- 개인 식별 정보를 받지 않더라도 Supabase 등 운영 서비스에는 접속 로그가 남을 수 있습니다. 발표 후 필요 없는 응답은 삭제하고 통계 목적을 참가자에게 안내하세요.
- 제출 시 네트워크 오류가 발생하면 결과 화면에서 **다시 저장 시도**를 누를 수 있습니다. 완료 표시가 없으면 서버 저장이 확인된 것이 아닙니다.

## 8. 고정 문항 변경 주의

문항은 4차원×5문항 총 20개이며, 모두 같은 순서로 표시됩니다. **16번은 선의의 거짓말**에 대한 판단 질문입니다.

`questions.js`의 문항 순서나 `pole`을 변경하면 반드시 `supabase/setup.sql`의 `v_directions`도 같은 순서로 변경하고, `shared.js` 및 `setup.sql`의 검사 버전도 올려야 합니다. 그렇지 않으면 브라우저와 서버의 채점 결과가 어긋납니다.

RVT는 수업 발표용으로 자체 제작된 가치관 탐색 도구입니다. 문항 신뢰도/타당도 검증을 거치지 않았으므로 심리학적 진단, 성격 확률, 연애 궁합의 객관적 근거로 사용하면 안 됩니다.
