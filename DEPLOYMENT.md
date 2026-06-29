# 하루톡톡 배포 체크리스트

## 권장 배포 방식

현재 하루톡톡은 로컬 JSON 저장소를 사용합니다. 과제 제출용 무료 배포에서는 Render Free 플랜의 `/tmp/harutoktok-data`에 데모데이터를 자동 생성하도록 설정합니다.

주의: Render Free 플랜의 `/tmp` 저장소는 서비스 재시작 시 초기화될 수 있습니다. 제출 시연용 데모데이터는 첫 실행 때 다시 생성되지만, 실제 운영 서비스로 확장할 때는 Supabase/Postgres 같은 외부 DB로 교체하는 것이 좋습니다.

## Render 배포 순서

1. GitHub에 이 프로젝트를 올립니다.
2. 아래 Render 배포 링크를 엽니다.
   - https://render.com/deploy?repo=https://github.com/wxxwls/harutoktok-agent
3. Render 화면에서 Blueprint 내용을 확인하고 승인합니다.
4. `render.yaml`을 감지하면 `harutoktok-agent` 서비스를 생성합니다.
5. 배포가 끝나면 Render가 제공하는 공개 URL로 접속합니다.

## 제출 전 확인

- 공개 URL이 시크릿 창에서 접속되는지 확인
- 본인 PC가 아닌 환경 또는 휴대폰 LTE/5G에서 접속 확인
- `/api/health`가 `ok: true`를 반환하는지 확인
- AI 대화창에서 일정 추가가 되는지 확인
- 새로고침 후에도 일정 데이터가 유지되는지 확인
- 일정 클릭 후 기록/요약 기능이 동작하는지 확인

## 배포 환경변수

`render.yaml`에 무료 배포용 기본값이 포함되어 있습니다.

- `HARUTOKTOK_STORE_DIR=/tmp/harutoktok-data`
- `HARUTOKTOK_SEED_DEMO=true`

`HARUTOKTOK_SEED_DEMO`는 첫 배포 시 데모데이터를 자동으로 넣기 위한 값입니다. 이미 데이터가 생성된 뒤에는 기존 저장 파일을 유지합니다.
