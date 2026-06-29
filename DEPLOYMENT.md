# 하루톡톡 배포 체크리스트

## 권장 배포 방식

현재 하루톡톡은 로컬 JSON 저장소를 사용합니다. 배포 후에도 일정, Agent 기억, 승인 작업, 하루 성장 보고서가 유지되어야 하므로 Render의 영구 디스크 배포를 권장합니다.

## Render 배포 순서

1. GitHub에 이 프로젝트를 올립니다.
2. Render에서 New > Blueprint를 선택합니다.
3. GitHub 저장소를 연결합니다.
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

`render.yaml`에 기본값이 포함되어 있습니다.

- `HARUTOKTOK_STORE_DIR=/var/data`
- `HARUTOKTOK_SEED_DEMO=true`

`HARUTOKTOK_SEED_DEMO`는 첫 배포 시 데모데이터를 자동으로 넣기 위한 값입니다. 이미 데이터가 생성된 뒤에는 기존 저장 파일을 유지합니다.
