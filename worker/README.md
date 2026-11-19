# CiT 썰매 순위표 API

재고관리 Cloudflare 자원과 분리해 사용하는 전용 Worker/D1 구성이다.

## 전용 자원

- Worker: `cit-sled-api`
- D1: `cit-sled-db`
- Turnstile 위젯: 썰매 페이지 전용

기존 `pb-order-app`, `lucky-paper-33a1`, `dayframe`의 코드·바인딩·데이터베이스·환경변수는 변경하지 않는다.

## 커밋하면 안 되는 값

- `TURNSTILE_SECRET_KEY`
- `IP_HASH_SALT` (32자 이상의 무작위 값)
- Cloudflare API 토큰
- `.dev.vars`

두 런타임 비밀값은 배포 시 `wrangler secret put`으로 Worker에만 저장한다. 브라우저 코드나 Git 저장소에는 넣지 않는다.

## 배포 전 확인 순서

1. 새 D1 `cit-sled-db`를 만든다.
2. `wrangler.jsonc`의 `database_id`만 새 D1 ID로 바꾼다.
3. `schema.sql`을 새 D1에만 적용한다.
4. 썰매 페이지 도메인만 Turnstile 허용 호스트로 등록한다.
5. `TURNSTILE_SECRET_KEY`, `IP_HASH_SALT`를 `cit-sled-api` Worker 비밀값으로 등록한다.
6. 테스트 후 Worker를 배포한다.
7. 기존 점수를 새 D1로 복사하고 건수를 대조한다.
8. 게임의 Supabase 직접 호출을 Worker 호출로 교체한다.
9. 읽기·등록·차단 동작을 확인한 다음에만 기존 Supabase 삭제 여부를 결정한다.

## 남는 한계

게임 계산이 브라우저에서 실행되므로 Turnstile, 일회용 세션, 시간 검증, 속도 제한만으로 고의적인 점수 조작을 완전히 증명할 수는 없다. 완전한 검증이 필요하면 입력 리플레이를 서버에서 재실행하거나 게임 자체를 서버 권위 방식으로 바꿔야 한다.
