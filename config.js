export const SUPABASE_URL = "https://nygnetxkaxlufuqwlorc.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_YZ1vpAO1YJUFohb5tnHvhg_njxKAmdZ";

// 사이트 기본 설정 (나중에 DB로 옮길 수도 있지만 지금은 여기서 관리)
export const SITE_NAME = "키위위키";      // 상단 헤더 좌측에 표시될 사이트 이름 (탭 제목 기본값으로도 사용)
export const SITE_LOGO_URL = "site-logo.png";         // 상단 헤더 사이트 이름 왼쪽에 표시할 작은 로고 (투명배경 PNG 권장). 비워두면 로고 없이 이름만 표시됨. 예: "site-logo.png"
export const BRAND_COLOR = "#a171ee";       // 상단바 / 모임 nav bar 포인트 색상
export const GROUP_NAME = "LSUNG";       // 모임 nav bar 상단에 표시될 영문 이름
export const GROUP_NAME_KR = "엘성";     // 모임 nav bar 상단에 표시될 한글 이름
export const GROUP_LOGO_URL = "group-logo.png";        // 모임 로고 이미지 경로 (투명배경 PNG 권장). 비워두면 로고 없이 이름만 표시됨. 
export const FORMER_MEMBERS = ["김지원"]; // 전 멤버 이름 목록 (별도 문서 없이 회색으로 표시만 됨)
export const GROUP_DOC_SLUG = "group";   // 그룹(엘성) 전체를 소개하는 문서의 slug. index.html은 id 파라미터 없이 이 문서를 불러오고, 로고박스 멤버 목록에서는 이 문서 자신은 제외됨
export const IMAGE_BUCKET = "wiki-images";  // 본문 삽입 이미지를 저장할 Supabase Storage 버킷 이름 (Public 버킷으로 미리 생성 필요)
