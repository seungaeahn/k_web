# 뜨개 다이어리

뜨개 작품, 실, 도안, 단수를 한곳에서 기록하는 개인용 웹앱이에요.
태블릿·폰 브라우저에서 열고 **홈 화면에 추가**하면 앱처럼 쓸 수 있어요(PWA). 서버 없이 기기 안에 데이터를 저장해요.

**바로 쓰기:** https://seungaeahn.github.io/k_web/

## 주요 기능

### Projects
- 작품을 **CO Waiting List → WIP → FO** 단계로 관리해요.
  - CO Waiting List: 코를 잡기 전, 뜰 예정인 작품
  - WIP: 뜨고 있는 작품 (Cast On 하면 시작일이 기록돼요)
  - FO: 완성한 작품 (Archive로 모여요)
- 작품 상세: 대표 사진, 진행 기간, 연결한 도안·실, 메모, 진행 사진
- WIP 작품은 **Open Pattern**으로 바로 도안을 열 수 있어요.
- FO 작품에는 인스타그램 게시글 링크를 붙여 앱 안에서 같이 볼 수 있어요.

### Patterns
- **Library**: 이미지·PDF 도안을 올려두고 앱 안 뷰어로 봐요.
  - 하이라이트 줄로 지금 뜨는 단을 표시 (색 5가지, 두께 조절)
  - **단수 카운터**를 추가하면 +1 할 때마다 하이라이트 줄이 한 칸 위로 올라가요
- **Favorites**: Ravelry에서 찜한 도안
- **Search**: Ravelry 도안 검색 → 하트로 찜, **Start Project**로 바로 작품 시작
- 도안에서 작품을 시작하면 이름·바늘이 채워지고 도안이 자동으로 연결돼요.

### Yarn
- 실 보관함: 색상, 굵기(Lace ~ Super Bulky), 권장 바늘, 소재, 보유량
- 보유량 단위는 **볼** 또는 **g(콘사)** 중에 골라요.
- 작품에 실을 연결할 때는 보유량이 줄지 않고, **FO로 바꿀 때 실제로 쓴 양을 기록**해요.
  - g 단위 실은 남은 무게를 저울에 재서 적으면 쓴 양을 계산해요.
- Ravelry에서 실 정보를 불러와 굵기·소재·권장 바늘을 채울 수 있어요.
- "이 실로 뜰 도안 찾기"로 Ravelry 도안을 추천받아요.

### Tools
- **Gauge Calculator**: 스와치 게이지로 필요한 코·단 수 계산
- **Abbreviations**: 뜨개 약어 사전
- **Backup**: 데이터 내보내기·가져오기 (도안 파일, Favorites 포함)
- **Ravelry**: Ravelry API 연동 설정

## 아이패드·폰에서 앱처럼 쓰기

1. **Safari**에서 https://seungaeahn.github.io/k_web/ 을 열어요. (아이패드·아이폰은 꼭 Safari)
2. 공유 버튼 → **홈 화면에 추가** → 추가
3. 이후에는 홈 화면 아이콘으로 열어요. 주소창 없이 전체 화면으로 열리고, 인터넷이 없어도 열려요.

> 안드로이드는 Chrome 메뉴 → **앱 설치** (또는 홈 화면에 추가)

## 데이터와 백업

- 모든 데이터는 **그 기기의 브라우저 안**에만 저장돼요 (localStorage, 도안 파일은 IndexedDB). 다른 기기와 자동으로 맞춰지지 않아요.
- Safari 탭과 홈 화면 앱은 데이터를 **따로** 저장해요. 홈 화면 앱으로 쓰는 걸 추천해요.
  - iOS Safari는 오래 방문하지 않은 웹사이트의 데이터를 지울 수 있는데, 홈 화면 앱은 예외예요.
  - 앱은 시작할 때 브라우저에 지속 저장소를 요청해요. 상태는 Tools > Backup에서 확인할 수 있어요.
- **Tools > Backup**에서 가끔 백업 파일을 내보내 iCloud Drive나 구글 드라이브에 보관해 두세요.
  - 백업에는 작품, 실, 도안(파일 포함 선택), Favorites, 약어, 설정이 들어가요.
  - Ravelry API 키는 백업에 넣지 않아요.
  - 가져오기는 지금 데이터를 백업 내용으로 **덮어써요.**

## Ravelry 연동

Ravelry 실·도안 검색을 쓰려면 개인용 API 키가 필요해요.

1. [Ravelry 개발자 페이지](https://www.ravelry.com/pro/developer)에서 **읽기 전용(read-only)** 개인 키를 발급받아요.
2. 앱의 **Tools > Ravelry**에 API 액세스 키와 API 시크릿을 넣고 **Test Connection**으로 확인해요.

키와 시크릿은 그 기기에만 저장되고 Ravelry API 호출에만 쓰여요.
이 앱은 Ravelry에서 만들거나 제휴·보증한 앱이 아니에요.

## 개발

빌드 도구 없이 순수 HTML·CSS·JavaScript로 만들었어요.

```bash
# 로컬에서 실행 (Node.js 필요)
node scripts/serve.js 8080
# → http://localhost:8080
```

- `master` 브랜치에 푸시하면 GitHub Pages에 자동으로 배포돼요.
- 코드를 바꾸면 `sw.js`의 `CACHE_NAME` 버전을 올려야 설치된 앱에도 새 버전이 반영돼요.

### 폴더 구조

```
index.html            앱 화면 틀, 하단 탭
manifest.webmanifest  홈 화면 앱 설정 (이름, 아이콘, 색)
sw.js                 서비스 워커 (오프라인 캐시)
css/style.css         디자인 토큰과 전체 스타일
css/MUNMAK_DALBANCHE.ttf  영어 제목·버튼용 글꼴
js/app.js             화면(라우터, 각 화면 그리기, 이벤트)
js/storage.js         데이터 저장·백업 (localStorage)
js/filestore.js       도안 파일 저장 (IndexedDB)
js/ravelry.js         Ravelry API
js/icons.js           실루엣 아이콘, 십자수 그림·숫자
js/modal.js           팝업, 고르기 창
js/utils.js           날짜·문자열 도우미
vendor/pdfjs/         PDF 도안 표시 (pdf.js 3.11.174)
scripts/              로컬 서버, 아이콘 생성
```

### 디자인

- 버터 바탕, 실타래 갈색, 슬레이트 블루 십자수 색을 쓰는 "모눈종이" 디자인 시스템 (`css/style.css` 맨 위 토큰)
- 본문: [Pretendard](https://github.com/orioncactus/pretendard)
- 영어 제목·버튼: 문막 달반체
- 빈 화면·썸네일의 십자수 그림은 `js/icons.js`의 칸 배열(`STITCHES`)로 그려요.
