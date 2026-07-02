import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SITE_NAME,
  SITE_LOGO_URL,
  GROUP_NAME,
  GROUP_NAME_KR,
  GROUP_LOGO_URL,
  FORMER_MEMBERS,
  GROUP_DOC_SLUG,
  BRAND_COLOR,
  IMAGE_BUCKET,
} from "./config.js";

// 세션을 sessionStorage에 저장 -> 탭/창을 닫으면 세션이 사라져서 자동 로그아웃됩니다.
// (localStorage를 쓰면 브라우저를 껐다 켜도 로그인이 유지되는데, 공용 계정 특성상 원치 않는 동작)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

const root = document.getElementById("app");

// ============================================
// 전역 상태
// ============================================
let isAdmin = false;
let formerMembersOpen = false; // 로고박스의 "전 멤버" 목록이 펼쳐져 있는지 여부
let editingSectionId = null;
let sectionPreviewOpen = false; // 문단 편집기에서 미리보기가 켜져 있는지 여부
let sectionEditDraft = null; // 미리보기 토글 시 textarea의 입력 내용이 날아가지 않도록 임시 보관
let editingInfobox = false; // 인포박스(기본 정보) 편집 중 여부
let editingInfoboxFootnotes = []; // 현재 편집 중인 인포박스의 각주 목록 { id(null이면 신규), number, content }
let editingFootnotes = []; // 현재 편집 중인 문단의 각주 목록 { id(null이면 신규), number, content }
let sectionMenuOpenId = null; // 문단 관리(⋮) 드롭다운이 열려 있는 문단 id
let textModalResolve = null; // 공용 텍스트 모달의 결과를 기다리는 Promise resolve 함수
let currentPageData = null; // 마지막으로 불러온 문서 데이터 캐시 (편집 상태 토글 시 재조회 없이 재렌더링용)
let imageUploadInput = null; // 이미지 삽입용 숨김 file input (1개를 만들어 재사용)
let pendingImageTextarea = null; // 이미지 버튼을 누른 시점의 대상 textarea
let pendingImageCursorPos = null; // 이미지 버튼을 누른 시점의 커서 위치 (파일 선택창 열리는 동안 유지하기 위해 미리 저장)
let pendingImageButton = null; // 이미지 버튼을 누른 시점의 트리거 버튼 (업로드 중 라벨 표시용)
let profileImageUploadInput = null; // 프로필 이미지 업로드용 숨김 file input
let pendingProfileImageInput = null; // 프로필 이미지 업로드 버튼을 누른 시점의 대상 URL input
let pendingProfileImageButton = null; // 프로필 이미지 업로드 버튼 (업로드 중 라벨 표시용)

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ============================================
// 색상 유틸 (인포박스 테마 색상용)
// ============================================
function hexToRgb(hex) {
  const clean = (hex || "#333333").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r, g, b) {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// 배경색 밝기에 따라 검정/흰색 글자 중 더 잘 보이는 쪽을 고름
function getContrastTextColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#222222" : "#ffffff";
}

// 흰색 쪽으로 섞어서 더 옅은 톤 생성 (인포박스 항목명 칸 배경용)
function lightenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const lr = r + (255 - r) * amount;
  const lg = g + (255 - g) * amount;
  const lb = b + (255 - b) * amount;
  return rgbToHex(lr, lg, lb);
}

// 검정 쪽으로 섞어서 더 어두운 톤 생성 (group-nav 배경용)
function darkenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const dr = r * (1 - amount);
  const dg = g * (1 - amount);
  const db = b * (1 - amount);
  return rgbToHex(dr, dg, db);
}

// config.js의 BRAND_COLOR를 CSS 변수로 주입 (site-header / group-nav 등에서 사용)
function applyBrandColor() {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--brand-color", BRAND_COLOR);
  rootStyle.setProperty("--brand-color-dark", darkenColor(BRAND_COLOR, 0.15));
  rootStyle.setProperty("--brand-color-text", getContrastTextColor(BRAND_COLOR));
  rootStyle.setProperty("--brand-color-pale", lightenColor(BRAND_COLOR, 0.85));
}

// config.js의 SITE_NAME / SITE_LOGO_URL을 상단 헤더에 반영
function applySiteBrand() {
  const brandEl = document.querySelector(".site-header .brand");
  if (!brandEl) return;

  const logoImg = brandEl.querySelector(".site-logo");
  if (logoImg) {
    if (SITE_LOGO_URL) {
      logoImg.src = SITE_LOGO_URL;
      logoImg.hidden = false;
    } else {
      logoImg.hidden = true;
    }
  }

  const textEl = brandEl.querySelector(".site-logo-text");
  if (textEl) {
    textEl.textContent = SITE_NAME;
  } else {
    brandEl.textContent = SITE_NAME;
  }

  document.title = SITE_NAME;
}

// ============================================
// 관리자 로그인 / 세션 관리 (Supabase Auth)
// ============================================
function updateAdminStatusUI(loggedIn) {
  const loginBtn = document.getElementById("admin-login-btn");
  const statusBar = document.getElementById("admin-status");

  if (loginBtn) loginBtn.hidden = loggedIn;
  if (statusBar) statusBar.hidden = !loggedIn;
  document.body.classList.toggle("is-admin", loggedIn);
}

// 로그인 상태가 바뀔 때마다 호출: 상태바 갱신 + (문서를 보고 있었다면) 편집 버튼 노출 여부까지 다시 반영
function refreshAdminState(session) {
  isAdmin = Boolean(session);
  updateAdminStatusUI(isAdmin);
  if (currentPageData) {
    if (!isAdmin) {
      editingSectionId = null; // 로그아웃되면 편집 중이던 것도 강제 종료
      editingInfobox = false;
      editingInfoboxFootnotes = [];
    }
    renderPage();
  }
}

function openLoginModal() {
  const popover = document.getElementById("admin-login-popover");
  const errorEl = document.getElementById("admin-login-error");
  const form = document.getElementById("admin-login-form");
  if (!popover) return;

  form.reset();
  errorEl.hidden = true;
  popover.hidden = false;
  document.getElementById("admin-login-email").focus();
}

function closeLoginModal() {
  const popover = document.getElementById("admin-login-popover");
  if (popover) popover.hidden = true;
}

async function handleLoginSubmit(e) {
  e.preventDefault();

  const email = document.getElementById("admin-login-email").value.trim();
  const password = document.getElementById("admin-login-password").value;
  const errorEl = document.getElementById("admin-login-error");
  const submitBtn = document.getElementById("admin-login-submit");

  errorEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "확인 중...";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  submitBtn.disabled = false;
  submitBtn.textContent = "로그인";

  if (error) {
    errorEl.textContent = "이메일 또는 비밀번호가 올바르지 않습니다.";
    errorEl.hidden = false;
    return;
  }

  closeLoginModal();
}

async function handleLogout() {
  await supabase.auth.signOut();
}

function setupAdminAuthUI() {
  const loginBtn = document.getElementById("admin-login-btn");
  const logoutBtn = document.getElementById("admin-logout-btn");
  const cancelBtn = document.getElementById("admin-login-cancel");
  const popover = document.getElementById("admin-login-popover");
  const form = document.getElementById("admin-login-form");

  loginBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    openLoginModal();
  });
  logoutBtn?.addEventListener("click", handleLogout);
  cancelBtn?.addEventListener("click", closeLoginModal);
  form?.addEventListener("submit", handleLoginSubmit);

  document.addEventListener("click", (e) => {
    if (popover && !popover.hidden && !e.target.closest(".admin-area")) {
      closeLoginModal();
    }
  });

  popover?.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && popover && !popover.hidden) closeLoginModal();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    refreshAdminState(session);
  });

  supabase.auth.getSession().then(({ data: { session } }) => {
    refreshAdminState(session);
  });
}

// ============================================
// 공용 텍스트 모달 (각주 내용 입력 / 문단 제목 입력 등에서 재사용)
// ============================================
function openTextModal({ title, label, initialValue = "", multiline = false, confirmLabel = "확인" }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("text-modal");
    const titleEl = document.getElementById("text-modal-title");
    const labelEl = document.getElementById("text-modal-label");
    const inputEl = document.getElementById("text-modal-input");
    const textareaEl = document.getElementById("text-modal-textarea");
    const confirmBtn = document.getElementById("text-modal-confirm");
    if (!overlay) {
      resolve(null);
      return;
    }

    titleEl.textContent = title;
    labelEl.textContent = label;
    confirmBtn.textContent = confirmLabel;

    if (multiline) {
      textareaEl.hidden = false;
      inputEl.hidden = true;
      textareaEl.value = initialValue;
    } else {
      inputEl.hidden = false;
      textareaEl.hidden = true;
      inputEl.value = initialValue;
    }

    overlay.hidden = false;
    (multiline ? textareaEl : inputEl).focus();

    textModalResolve = (value) => {
      overlay.hidden = true;
      textModalResolve = null;
      resolve(value);
    };
  });
}

function setupTextModal() {
  const overlay = document.getElementById("text-modal");
  const inputEl = document.getElementById("text-modal-input");
  const textareaEl = document.getElementById("text-modal-textarea");
  const confirmBtn = document.getElementById("text-modal-confirm");
  const cancelBtn = document.getElementById("text-modal-cancel");
  if (!overlay) return;

  confirmBtn.addEventListener("click", () => {
    if (!textModalResolve) return;
    const raw = textareaEl.hidden ? inputEl.value : textareaEl.value;
    const value = raw.trim();
    textModalResolve(value || null);
  });

  cancelBtn.addEventListener("click", () => {
    if (textModalResolve) textModalResolve(null);
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && textModalResolve) textModalResolve(null);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden && textModalResolve) textModalResolve(null);
  });
}

function formatDateTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

// ============================================
// 트리 구조
// ============================================
function buildTree(sections) {
  const byId = new Map(sections.map((s) => [s.id, { ...s, children: [] }]));
  const roots = [];
  for (const s of byId.values()) {
    if (s.parent_id && byId.has(s.parent_id)) {
      byId.get(s.parent_id).children.push(s);
    } else {
      roots.push(s);
    }
  }
  const sortByOrder = (list) => {
    list.sort((a, b) => a.order_index - b.order_index);
    list.forEach((n) => sortByOrder(n.children));
  };
  sortByOrder(roots);
  return roots;
}

function flattenTree(nodes, out = []) {
  for (const n of nodes) {
    out.push(n);
    flattenTree(n.children, out);
  }
  return out;
}

// 어떤 텍스트 안에서 [n] 마커들이 실제로 등장하는 순서를 돌려준다 (첫 등장 기준, 중복 제거)
// 마커가 텍스트에 없는 각주(예: 실수로 지워졌거나 아직 반영 전)는 맨 뒤로, 그 안에서는 저장된 번호순으로
function getAppearanceOrderMap(text) {
  const order = new Map();
  let idx = 0;
  for (const m of String(text ?? "").matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (!order.has(n)) order.set(n, idx++);
  }
  return order;
}

function sortFootnotesByAppearance(footnotes, appearanceOrder) {
  return footnotes.slice().sort((a, b) => {
    const ai = appearanceOrder.has(a.number) ? appearanceOrder.get(a.number) : Infinity;
    const bi = appearanceOrder.has(b.number) ? appearanceOrder.get(b.number) : Infinity;
    if (ai !== bi) return ai - bi;
    return a.number - b.number;
  });
}

// ============================================
// 각주 전역 번호 매기기 (인포박스 → 문단 순서, 각 범위 안에서는 "본문에 실제 등장하는 순서" 기준)
// ============================================
function assignGlobalFootnoteNumbers(doc, infoboxFootnotes, orderedSections, footnotesBySection) {
  const globalNumberMap = new Map();
  const footnoteList = [];
  let counter = 0;

  const infoboxItems = Array.isArray(doc?.infobox) ? doc.infobox : [];
  const infoboxCombinedText = infoboxItems.map((item) => item.value).join("\n");
  const infoboxAppearanceOrder = getAppearanceOrderMap(infoboxCombinedText);
  const sortedInfobox = sortFootnotesByAppearance(infoboxFootnotes, infoboxAppearanceOrder);
  for (const fn of sortedInfobox) {
    counter += 1;
    globalNumberMap.set(`infobox:${fn.document_id}:${fn.number}`, counter);
    footnoteList.push({ globalNumber: counter, content: fn.content, id: fn.id });
  }

  for (const section of orderedSections) {
    const localFootnotes = footnotesBySection.get(section.id) || [];
    const appearanceOrder = getAppearanceOrderMap(section.content);
    const sorted = sortFootnotesByAppearance(localFootnotes, appearanceOrder);
    for (const fn of sorted) {
      counter += 1;
      globalNumberMap.set(`section:${section.id}:${fn.number}`, counter);
      footnoteList.push({ globalNumber: counter, content: fn.content, id: fn.id });
    }
  }

  return { globalNumberMap, footnoteList };
}

// ============================================
// 알려진 SNS/서비스 도메인이면 링크 앞에 작은 아이콘을 붙여준다 (이모지 사용, 브랜드 로고 아님)
// ============================================
const LINK_ICON_RULES = [
  { test: /instagram\.com/i, slug: "instagram" },
  { test: /(twitter\.com|x\.com)/i, slug: "x" },
  { test: /(youtube\.com|youtu\.be)/i, slug: "youtube" },
  { test: /facebook\.com/i, slug: "facebook" },
  { test: /threads\.net/i, slug: "threads" },
  { test: /weibo\.com/i, slug: "sinaweibo" },
  { test: /(open\.kakao\.com|pf\.kakao\.com|kakao\.com)/i, slug: "kakaotalk" },
  { test: /tiktok\.com/i, slug: "tiktok" },
  { test: /blog\.naver\.com/i, slug: "naver-blog" },
  { test: /cafe\.naver\.com/i, slug: "naver" },
  { test: /discord\.(gg|com)/i, slug: "discord" },
];

// 실제 브랜드 로고는 Simple Icons CDN(공개 SVG 아이콘 서비스)에서 불러온다
// 등록되지 않은 도메인은 기본 🔗 아이콘으로 대체 (링크 텍스트를 항상 숨기므로 클릭할 대상이 안 보이지 않게)
function getLinkIcon(url) {
  const rule = LINK_ICON_RULES.find((r) => r.test.test(url));
  if (rule && rule.slug === "naver-blog") {
    return `<span class="wiki-link-icon wiki-link-icon-blog" aria-hidden="true">B</span>`;
  }
  if (rule) {
    return `<img class="wiki-link-icon" src="https://cdn.simpleicons.org/${rule.slug}?viewbox=auto" alt="" loading="lazy">`;
  }
  return `<span class="wiki-link-icon wiki-link-icon-generic" aria-hidden="true">🔗</span>`;
}

// ============================================
// 유튜브 링크 -> 썸네일 카드
// ============================================
// 유튜브 URL에서 영상 ID를 뽑아낸다 (watch?v=, youtu.be/, shorts/, embed/ 형태 모두 지원)
function getYoutubeId(url) {
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/i,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/i,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/i,
    /[?&]v=([a-zA-Z0-9_-]{6,})/i,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// 썸네일 이미지 + 재생 버튼을 보여주고, 클릭하면 유튜브로 이동하는 카드
function renderYoutubeCard(url, videoId) {
  return `<a class="wiki-youtube-card" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span class="wiki-youtube-thumb"><img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="" loading="lazy"><span class="wiki-youtube-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></span></a>`;
}

// ============================================
// 글머리 목록 (연속된 '- ' 줄을 하나의 목록으로 묶어서 표시, 번호 없는 동그라미만)
// ============================================
function renderBulletList(items, scopeKey, ctx) {
  const itemsHtml = items
    .map((item) => `<li>${renderWikiTextLine(item, scopeKey, ctx)}</li>`)
    .join("");
  return `<ul class="wiki-list">${itemsHtml}</ul>`;
}

// ============================================
// 소제목 박스 (목차에는 안 뜨는, 회색 박스 형태의 본문 내 소제목)
// ============================================
function renderLabelBox(text, scopeKey, ctx) {
  return `<div class="wiki-label-box">${renderWikiTextLine(text.trim(), scopeKey, ctx)}</div>`;
}

// ============================================
// 인용/어록 카드 (연속된 '>' 줄을 하나의 카드로 묶어서 표시)
// ============================================
function renderQuoteCard(rawLines, scopeKey, ctx) {
  const themeColor = ctx.themeColor || "#333333";
  const linesHtml = rawLines
    .map((line) => `<div class="wiki-quote-line">${renderWikiTextLine(line, scopeKey, ctx)}</div>`)
    .join("");
  return `<div class="wiki-quote-card" style="border-left-color:${esc(themeColor)};">${linesHtml}</div>`;
}

// ============================================
// 위키 문법 렌더링 (각주 마커 / 굵은 글씨 / 문서 링크)
// ============================================
function renderWikiText(content, scopeKey, ctx) {
  // 줄 단위로 처리하되, '>'로 시작하는 연속된 줄은 어록 카드로, '- '로 시작하는 연속된 줄은 목록으로 묶는다
  // 빈 줄이 연속으로 여러 개 있어도(엔터를 여러 번 눌러도) 항상 1개 분량으로 눌러서
  // 불필요하게 큰 여백이 생기지 않도록 한다.
  const normalizedContent = String(content ?? "").replace(/\n{3,}/g, "\n\n");
  const lines = normalizedContent.split("\n");
  // { html, block } 형태로 모아둔다. block=true 인 항목(카드/목록/소제목박스) 앞뒤에는
  // .section-body 의 white-space:pre-wrap 때문에 "\n"이 그대로 빈 줄로 보이는 걸 막기 위해
  // 개행 문자를 넣지 않는다 (일반 텍스트 줄끼리만 "\n"으로 이어붙인다).
  const output = [];
  let quoteBuffer = null;
  let listBuffer = null;

  const flushQuote = () => {
    if (quoteBuffer) {
      output.push({ html: renderQuoteCard(quoteBuffer, scopeKey, ctx), block: true });
      quoteBuffer = null;
    }
  };

  const flushList = () => {
    if (listBuffer) {
      output.push({ html: renderBulletList(listBuffer, scopeKey, ctx), block: true });
      listBuffer = null;
    }
  };

  for (const line of lines) {
    const labelMatch = line.match(/^##\s+(.+)$/);
    const quoteMatch = line.match(/^>\s?(.*)$/);
    const listMatch = line.match(/^-\s(.*)$/);
    if (labelMatch) {
      flushQuote();
      flushList();
      output.push({ html: renderLabelBox(labelMatch[1], scopeKey, ctx), block: true });
    } else if (quoteMatch) {
      flushList();
      if (!quoteBuffer) quoteBuffer = [];
      quoteBuffer.push(quoteMatch[1]);
    } else if (listMatch) {
      flushQuote();
      if (!listBuffer) listBuffer = [];
      listBuffer.push(listMatch[1]);
    } else {
      flushQuote();
      flushList();
      output.push({ html: renderWikiTextLine(line, scopeKey, ctx), block: false });
    }
  }
  flushQuote();
  flushList();

  let result = "";
  for (let i = 0; i < output.length; i++) {
    if (i > 0 && !output[i - 1].block && !output[i].block) {
      result += "\n";
    }
    result += output[i].html;
  }
  return result;
}

function renderWikiTextLine(content, scopeKey, ctx) {
  // 0. 유튜브 링크 하나만 단독으로 붙여넣은 줄이면 아이콘 대신 썸네일 카드로 표시
  const soloUrl = content.trim().match(/^(https?:\/\/[^\s]+)$/i);
  if (soloUrl) {
    const videoId = getYoutubeId(soloUrl[1]);
    if (videoId) {
      return renderYoutubeCard(soloUrl[1], videoId);
    }
  }

  let html = esc(content);

  // 1. 각주 마커 [1]
  html = html.replace(/\[(\d+)\]/g, (match, localNum) => {
    const globalNum = ctx.globalNumberMap.get(`${scopeKey}:${localNum}`);
    if (!globalNum) return match;
    const fnContent = ctx.footnoteContentMap?.get(globalNum) || "";
    return `<a class="footnote-ref" id="ref-${globalNum}" href="#fn-${globalNum}" data-tooltip="${esc(
      fnContent
    )}">[${globalNum}]</a>`;
  });

// 2. 아이콘 [icon:URL]
html = html.replace(/\[icon:(https?:\/\/[^\s\]]+)\]/g, (match, url) => {
  return `<img class="wiki-inline-icon" src="${url}" alt="" loading="lazy">`;
});

// 3. 이미지 [img:URL]
html = html.replace(/\[img:(https?:\/\/[^\s\]]+)\]/g, (match, url) => {
  return `<img class="wiki-inline-image" src="${url}" alt="" loading="lazy">`;
});

  // 3. 취소선 ~~내용~~
  html = html.replace(/~~(.+?)~~/g, '<span class="wiki-strike">$1</span>');

  // 4. 굵은 글씨 '''내용'''
  html = html.replace(/'''(.+?)'''/g, "<strong>$1</strong>");

  // 5. 내부 문서 링크 [[이름]]
  html = html.replace(/\[\[(.+?)\]\]/g, (match, rawName) => {
    const name = rawName.trim();
    const slug = ctx.nameToSlugMap.get(name);
    if (slug) {
      return `<a class="wiki-link" href="person.html?id=${encodeURIComponent(slug)}">${name}</a>`;
    }
    return `<span class="wiki-link missing" title="존재하지 않는 문서입니다">${name}</span>`;
  });

  // 6. 외부 링크 [https://url 표시할 텍스트] (텍스트 생략 가능) - 링크 글자는 항상 숨기고 아이콘만 표시
  html = html.replace(/\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]+))?\]/g, (match, url) => {
    return `<a class="wiki-link wiki-link-ext" href="${url}" target="_blank" rel="noopener noreferrer" title="${esc(
      url
    )}">${getLinkIcon(url)}</a>`;
  });

  // 7. 위 문법 없이 그냥 붙여넣은 URL도 자동으로 링크 처리 (유튜브/인스타 등) - 마찬가지로 아이콘만 표시
  html = html.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, (match, prefix, url) => {
    return `${prefix}<a class="wiki-link wiki-link-ext" href="${url}" target="_blank" rel="noopener noreferrer" title="${esc(
      url
    )}">${getLinkIcon(url)}</a>`;
  });

  return html;
}

// ============================================
// 렌더링
// ============================================
function renderGroupNav(documentsList, currentSlug) {
  const items = (documentsList || [])
    .filter((d) => d.slug !== GROUP_DOC_SLUG)
    .map(
      (d) => `<a href="person.html?id=${encodeURIComponent(d.slug)}"
        class="group-member-link ${d.slug === currentSlug ? "active" : ""}">${esc(d.name)}</a>`
    )
    .join("");

  const formerItems = (FORMER_MEMBERS || [])
    .map((name) => `<span class="group-member-former">${esc(name)}</span>`)
    .join("");

  return `
    <nav class="group-nav">
      <a class="group-nav-header" href="index.html">
        ${GROUP_LOGO_URL ? `<img class="group-nav-logo" src="${esc(GROUP_LOGO_URL)}" alt="">` : ""}
        ${GROUP_LOGO_URL ? `<div class="group-nav-divider-v"></div>` : ""}
        <div class="group-nav-titles">
          <div class="group-nav-name-en">${esc(GROUP_NAME)}</div>
          <div class="group-nav-name-kr">${esc(GROUP_NAME_KR)}</div>
        </div>
      </a>

      <div class="group-member-grid">
        ${items || '<span class="friend-list-empty">등록된 문서가 없습니다</span>'}
      </div>

      ${
        formerItems
          ? `
      <div class="group-nav-divider"></div>
      <div class="group-former-row">
        <button type="button" class="group-former-toggle">전 멤버 ${formerMembersOpen ? "숨기기 ▲" : "보기 ▼"}</button>
        ${
          formerMembersOpen
            ? `<div class="group-member-grid group-member-grid-former">${formerItems}</div>`
            : ""
        }
      </div>`
          : ""
      }
    </nav>
  `;
}

// 인포박스 값 렌더링: 엔터 한 번 = 그냥 줄바꿈, 엔터 두 번(빈 줄) = 구분선으로 나뉜 블록
function renderInfoboxValue(raw, scopeKey, ctx) {
  const blocks = (raw ?? "").split(/\n{2,}/);
  const renderBlockLines = (block) => {
    const lines = block.split("\n");
    return lines.length > 1
      ? lines.map((line) => `<div class="infobox-value-line">${renderWikiText(line, scopeKey, ctx)}</div>`).join("")
      : renderWikiText(block, scopeKey, ctx);
  };
  return blocks.length > 1
    ? blocks.map((block) => `<div class="infobox-value-block">${renderBlockLines(block)}</div>`).join("")
    : renderBlockLines(blocks[0]);
}

function renderInfobox(doc, ctx) {
  const themeColor = doc.theme_color || "#333333";
  const titleTextColor = getContrastTextColor(themeColor);

  if (ctx.editingInfobox) {
    return renderInfoboxEditor(doc, themeColor, titleTextColor);
  }

  const items = Array.isArray(doc.infobox) ? doc.infobox : [];
  const thBg = lightenColor(themeColor, 0.55);
  const thTextColor = getContrastTextColor(thBg);
  const scopeKey = `infobox:${doc.id}`;

  const rows = items
    .map((item) => {
      const valueHtml = renderInfoboxValue(item.value, scopeKey, ctx);
      return `
      <tr>
        <th style="background:${thBg};color:${thTextColor};">${esc(item.key)}</th>
        <td>${valueHtml}</td>
      </tr>`;
    })
    .join("");

  const editBtn = ctx.isAdmin
    ? `<button class="infobox-edit-btn" type="button" aria-label="기본 정보 편집">✏</button>`
    : "";

  return `
    <aside class="infobox" style="border-color:${themeColor};">
      <div class="infobox-title" style="background:${themeColor};color:${titleTextColor};">
        <div class="infobox-title-text">
          <div class="infobox-title-name">${esc(doc.name)}</div>
          ${doc.subtitle ? `<div class="infobox-title-subtitle">${esc(doc.subtitle)}</div>` : ""}
        </div>
        ${editBtn}
      </div>
      ${
        doc.profile_image_url
          ? `<img class="infobox-image" src="${esc(doc.profile_image_url)}" alt="${esc(doc.name)}">`
          : ""
      }
      <table class="infobox-table">${rows}</table>
    </aside>
  `;
}

// 인포박스(기본 정보) 편집 UI: 이미지 URL / 테마 색상 / 항목(키-값) 목록을 자유롭게 추가·삭제
function renderInfoboxEditor(doc, themeColor, titleTextColor) {
  const items = Array.isArray(doc.infobox) ? doc.infobox : [];

  const rowsHtml = items
    .map(
      (item) => `
      <div class="infobox-row-editor">
        <input type="text" class="infobox-key-input" value="${esc(item.key)}" placeholder="항목명">
        <div class="infobox-value-col">
          <textarea class="infobox-value-input" rows="2" placeholder="내용 (Enter로 줄바꿈)">${esc(item.value)}</textarea>
          <div class="infobox-row-toolbar">
            <button type="button" class="infobox-footnote-btn" title="각주 추가">[각주]</button>
            <button type="button" class="infobox-image-btn" title="이미지 삽입">🖼</button>
          </div>
        </div>
        <button type="button" class="infobox-row-delete-btn" aria-label="항목 삭제">✕</button>
      </div>`
    )
    .join("");

  return `
    <aside class="infobox is-editing" style="border-color:${themeColor};">
      <div class="infobox-title" style="background:${themeColor};color:${titleTextColor};">
        <span class="infobox-title-text">${esc(doc.name)} (편집 중)</span>
      </div>
      <div class="infobox-editor">
        <label class="modal-field">
          <span>이름</span>
          <input type="text" class="infobox-name-input" value="${esc(doc.name)}" placeholder="예: 김예린">
        </label>
        <label class="modal-field">
          <span>부제 (영문 이름 / 한자 등, 선택)</span>
          <input type="text" class="infobox-subtitle-input" value="${esc(doc.subtitle || "")}" placeholder="예: Kim Yerin">
        </label>
        <label class="modal-field">
          <span>프로필 이미지 URL</span>
          <div class="infobox-image-url-row">
            <input type="text" class="infobox-image-input" value="${esc(doc.profile_image_url || "")}" placeholder="https://... 또는 아래 버튼으로 업로드">
            <button type="button" class="infobox-profile-image-upload-btn" title="이미지 업로드">🖼 업로드</button>
          </div>
        </label>
        <label class="modal-field">
          <span>테마 색상</span>
          <input type="color" class="infobox-color-input" value="${themeColor}">
        </label>
        <div class="infobox-rows-editor">${rowsHtml}</div>
        <p class="editor-hint">각 항목 내용에서 Enter를 누르면 줄이 나뉘어 표시됩니다. 각주는 인포박스 각주가 문단보다 먼저 번호가 매겨집니다.</p>
        <p class="editor-hint">⚠ 이름을 바꾸면 다른 문서에서 [[${esc(doc.name)}]]로 걸어둔 링크는 새 이름으로 다시 걸어줘야 연결됩니다.</p>
        <button type="button" class="add-infobox-row-btn">+ 항목 추가</button>
        <div class="editor-actions">
          <button type="button" class="modal-btn modal-btn-secondary infobox-cancel-btn">취소</button>
          <button type="button" class="modal-btn modal-btn-primary infobox-save-btn">저장</button>
        </div>
      </div>
    </aside>
  `;
}

function renderTocList(nodes, isRoot = true) {
  return `
    <ul class="${isRoot ? "toc-list" : "toc-sublist"}">
      ${nodes
        .map(
          (n) => `
        <li>
          <a href="#sec-${n.id}">${
            n.number ? `<span class="toc-num">${esc(n.number)}.</span> ` : ""
          }${esc(n.title)}</a>
          ${n.children.length ? renderTocList(n.children, false) : ""}
        </li>`
        )
        .join("")}
    </ul>
  `;
}

function renderSectionEditor(node, ctx, scopeKey) {
  const draftContent = sectionEditDraft ?? node.content;

  if (sectionPreviewOpen) {
    return `
      <div class="section-editor" data-section-id="${node.id}">
        <div class="editor-toolbar">
          <button type="button" class="editor-tool-btn section-preview-toggle-btn" data-preview="off">✏ 편집으로 돌아가기</button>
        </div>
        <div class="section-body section-preview-body">${renderWikiText(draftContent, scopeKey, ctx)}</div>
        <div class="editor-actions">
          <button type="button" class="modal-btn modal-btn-secondary section-cancel-btn" data-section-id="${node.id}">취소</button>
          <button type="button" class="modal-btn modal-btn-primary section-save-btn" data-section-id="${node.id}">저장</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="section-editor" data-section-id="${node.id}">
      <div class="editor-toolbar">
        <button type="button" class="editor-tool-btn" data-tool="bold" title="굵게">B</button>
        <button type="button" class="editor-tool-btn" data-tool="strike" title="취소선">S</button>
        <button type="button" class="editor-tool-btn" data-tool="quote" title="어록 카드">" 어록카드</button>
        <button type="button" class="editor-tool-btn" data-tool="label" title="소제목 박스">▭ 소제목박스</button>
        <button type="button" class="editor-tool-btn" data-tool="list" title="글머리 목록">• 목록</button>
        <button type="button" class="editor-tool-btn" data-tool="link" title="위키 문서 링크">🔗 위키링크</button>
        <button type="button" class="editor-tool-btn" data-tool="footnote" title="각주 추가">[각주]</button>
        <button type="button" class="editor-tool-btn" data-tool="image" title="이미지 삽입">🖼 이미지</button>
        <button type="button" class="editor-tool-btn section-preview-toggle-btn" data-preview="on">👁 미리보기</button>
      </div>
      <p class="editor-hint">커서를 놓은 위치에 이미지가 삽입됩니다. 외부 링크(유튜브/인스타 등)는 URL을 그냥 붙여넣으면 자동으로 링크가 됩니다.</p>
      <textarea class="editor-textarea" rows="7">${esc(draftContent)}</textarea>
      <div class="editor-actions">
        <button type="button" class="modal-btn modal-btn-secondary section-cancel-btn" data-section-id="${node.id}">취소</button>
        <button type="button" class="modal-btn modal-btn-primary section-save-btn" data-section-id="${node.id}">저장</button>
      </div>
    </div>
  `;
}

function renderSection(node, depth, ctx) {
  const childrenHtml = node.children.map((c) => renderSection(c, depth + 1, ctx)).join("");
  const scopeKey = `section:${node.id}`;
  const isEditing = ctx.editingSectionId === node.id;
  const isMenuOpen = ctx.sectionMenuOpenId === node.id;

  const editBtn = ctx.isAdmin
    ? `<button class="section-edit-btn" type="button" data-section-id="${node.id}" aria-label="문단 편집">✏</button>`
    : "";

  const menuBtn = ctx.isAdmin
    ? `<button class="section-menu-btn" type="button" data-section-id="${node.id}" aria-label="문단 관리">⋮</button>`
    : "";

  const menuDropdown =
    ctx.isAdmin && isMenuOpen
      ? `
    <div class="section-menu-dropdown">
      <button type="button" class="section-menu-item" data-action="add-sub" data-section-id="${node.id}">하위 문단 추가</button>
      <button type="button" class="section-menu-item" data-action="rename" data-section-id="${node.id}" data-current-title="${esc(node.title)}">문단 이름 변경</button>
      <button type="button" class="section-menu-item" data-action="move-up" data-section-id="${node.id}">위로 이동</button>
      <button type="button" class="section-menu-item" data-action="move-down" data-section-id="${node.id}">아래로 이동</button>
      <button type="button" class="section-menu-item danger" data-action="delete" data-section-id="${node.id}">문단 삭제</button>
    </div>`
      : "";

  const addSubBtn = ctx.isAdmin
    ? `<button type="button" class="add-subsection-btn" data-parent-id="${node.id}">+ 하위 문단 추가</button>`
    : "";

  const bodyHtml = isEditing
    ? renderSectionEditor(node, ctx, scopeKey)
    : `<div class="section-body">${renderWikiText(node.content, scopeKey, ctx)}</div>`;

  return `
    <div class="section${isEditing ? " is-editing" : ""}" id="sec-${node.id}" data-depth="${depth}">
      <div class="section-title-row">
        <button class="section-toggle" type="button" aria-expanded="true" aria-label="문단 접기/펼치기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="section-title">${node.number ? esc(node.number) + ". " : ""}${esc(node.title)}</div>
        ${editBtn}
        <div class="section-menu-wrap">
          ${menuBtn}
          ${menuDropdown}
        </div>
      </div>
      <div class="section-content">
        ${bodyHtml}
        ${childrenHtml}
        ${addSubBtn}
      </div>
    </div>
  `;
}

function attachSectionToggleHandlers() {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".section-toggle");
    if (!btn) return;
    const section = btn.closest(".section");
    if (!section) return;
    const collapsed = section.classList.toggle("collapsed");
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });
}

// ============================================
// 문단 편집 (이벤트 위임 + 위키 문법 툴바)
// ============================================
function insertWikiSyntax(textarea, tool) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);

  let insertText = "";
  let cursorOffset = 0;

  if (tool === "bold") {
    if (selected) {
      insertText = `'''${selected}'''`;
      cursorOffset = insertText.length;
    } else {
      insertText = `''''''`;
      cursorOffset = 3;
    }
  } else if (tool === "strike") {
    if (selected) {
      insertText = `~~${selected}~~`;
      cursorOffset = insertText.length;
    } else {
      insertText = `~~~~`;
      cursorOffset = 2;
    }
  } else if (tool === "link") {
    if (selected) {
      insertText = `[[${selected}]]`;
      cursorOffset = insertText.length;
    } else {
      insertText = `[[]]`;
      cursorOffset = 2;
    }
  } else if (tool === "quote") {
    if (selected) {
      insertText = selected
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      cursorOffset = insertText.length;
    } else {
      insertText = "> ";
      cursorOffset = insertText.length;
    }
  } else if (tool === "label") {
    if (selected) {
      insertText = `## ${selected}`;
      cursorOffset = insertText.length;
    } else {
      insertText = "## ";
      cursorOffset = insertText.length;
    }
  } else if (tool === "list") {
    if (selected) {
      insertText = selected
        .split("\n")
        .map((line) => `- ${line}`)
        .join("\n");
      cursorOffset = insertText.length;
    } else {
      insertText = "- ";
      cursorOffset = insertText.length;
    }
  } else {
    return;
  }

  textarea.value = value.slice(0, start) + insertText + value.slice(end);
  const newCursor = start + cursorOffset;
  textarea.focus();
  textarea.setSelectionRange(newCursor, newCursor);
}

function setupProfileImageUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;
  document.body.appendChild(input);
  profileImageUploadInput = input;

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    const targetInput = pendingProfileImageInput;
    const button = pendingProfileImageButton;
    pendingProfileImageInput = null;
    pendingProfileImageButton = null;
    if (!file || !targetInput) return;

    const originalLabel = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = "업로드 중...";
    }

    const { url, error } = await uploadImageToStorage(file, "profiles");

    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }

    if (error || !url) {
      alert("이미지 업로드 중 오류가 발생했습니다: " + (error?.message || "알 수 없는 오류"));
      return;
    }

    targetInput.value = url;
  });
}

function handleProfileImageButtonClick(inputEl, triggerBtn) {
  if (!inputEl || !profileImageUploadInput) return;
  pendingProfileImageInput = inputEl;
  pendingProfileImageButton = triggerBtn || null;
  profileImageUploadInput.click();
}

// ============================================
// 본문 이미지 삽입 (커서 위치에 삽입, Supabase Storage 업로드)
// ============================================
function setupImageUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;
  document.body.appendChild(input);
  imageUploadInput = input;

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = ""; // 같은 파일을 다시 선택해도 change 이벤트가 발생하도록 초기화
    const textarea = pendingImageTextarea;
    const cursorPos = pendingImageCursorPos;
    const button = pendingImageButton;
    pendingImageTextarea = null;
    pendingImageCursorPos = null;
    pendingImageButton = null;
    if (!file || !textarea) return;
    await uploadAndInsertImage(file, textarea, cursorPos, button);
  });
}

// 이미지 버튼 클릭 시점의 textarea/커서 위치를 미리 저장해둔다 (파일 선택창이 열리는 동안 focus가 빠지기 때문)
// textarea: 삽입 대상 (문단 본문 textarea 또는 인포박스 항목 textarea), triggerBtn: 업로드 중 라벨을 바꿔줄 버튼
function handleImageButtonClick(textarea, triggerBtn) {
  if (!textarea || !imageUploadInput) return;
  pendingImageTextarea = textarea;
  pendingImageCursorPos = { start: textarea.selectionStart, end: textarea.selectionEnd };
  pendingImageButton = triggerBtn || null;
  imageUploadInput.click();
}

// Supabase Storage에 이미지 파일을 업로드하고 공개 URL을 반환하는 공용 함수
async function uploadImageToStorage(file, folder = "sections") {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadError) {
    return { url: null, error: uploadError };
  }

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return { url: data?.publicUrl || null, error: data?.publicUrl ? null : new Error("URL 조회 실패") };
}

async function uploadAndInsertImage(file, textarea, cursorPos, imageBtn) {
  const originalLabel = imageBtn?.textContent;
  if (imageBtn) {
    imageBtn.disabled = true;
    imageBtn.textContent = "업로드 중...";
  }

  const { url, error } = await uploadImageToStorage(file, "sections");

  if (imageBtn) {
    imageBtn.disabled = false;
    imageBtn.textContent = originalLabel;
  }

  if (error || !url) {
    alert("이미지 업로드 중 오류가 발생했습니다: " + (error?.message || "알 수 없는 오류"));
    return;
  }

  const marker = `[img:${url}]`;
  const start = cursorPos?.start ?? textarea.value.length;
  const end = cursorPos?.end ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + marker + textarea.value.slice(end);
  const newCursor = start + marker.length;
  textarea.focus();
  textarea.setSelectionRange(newCursor, newCursor);
}


async function fetchSectionFootnotes(sectionId) {
  const { data, error } = await supabase
    .from("footnotes")
    .select("*")
    .eq("section_id", sectionId)
    .order("number");
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

// 인포박스(기본 정보)에 달린 각주 목록 (document_id 기준)
async function fetchDocumentFootnotes(documentId) {
  const { data, error } = await supabase
    .from("footnotes")
    .select("*")
    .eq("document_id", documentId)
    .order("number");
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

// 각주 버튼 클릭 -> 팝업으로 내용 입력받고, 번호를 자동 채번해서 커서 위치에 [n] 마커 삽입
async function handleFootnoteButtonClick(sectionId) {
  const content = await openTextModal({
    title: "각주 추가",
    label: "각주 내용을 입력하세요",
    multiline: true,
    confirmLabel: "확인",
  });
  if (!content) return;

  const nextNumber = editingFootnotes.reduce((max, f) => Math.max(max, f.number), 0) + 1;
  editingFootnotes.push({ id: null, number: nextNumber, content });

  const textarea = root.querySelector(`#sec-${sectionId} .editor-textarea`);
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const marker = `[${nextNumber}]`;
  textarea.value = textarea.value.slice(0, start) + marker + textarea.value.slice(end);
  const newCursor = start + marker.length;
  textarea.focus();
  textarea.setSelectionRange(newCursor, newCursor);
}

// ============================================
// 문단 구조 관리 (추가 / 이름변경 / 삭제 / 순서변경) + 번호 재계산
// ============================================
function renumberTree(nodes, prefix = "") {
  nodes.forEach((n, idx) => {
    n.number = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
    n.order_index = idx;
    renumberTree(n.children, n.number);
  });
}

async function persistTree(tree) {
  const flat = flattenTree(tree);
  await Promise.all(
    flat.map((n) =>
      supabase.from("sections").update({ number: n.number, order_index: n.order_index }).eq("id", n.id)
    )
  );
}

async function renumberAndPersist() {
  const tree = currentPageData?.tree;
  if (!tree) return;
  renumberTree(tree);
  await persistTree(tree);
}

function findNodeAndSiblings(tree, id) {
  const search = (nodes) => {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx !== -1) return { siblings: nodes, index: idx };
    for (const n of nodes) {
      const found = search(n.children);
      if (found) return found;
    }
    return null;
  };
  return search(tree);
}

async function handleAddSubsection(parentId) {
  const documentId = currentPageData?.doc?.id;
  if (!documentId) return;

  const title = await openTextModal({
    title: parentId ? "하위 문단 추가" : "새 최상위 문단 추가",
    label: "문단 제목",
    multiline: false,
    confirmLabel: "생성",
  });
  if (!title) return;

  const { error } = await supabase.from("sections").insert({
    document_id: documentId,
    parent_id: parentId,
    order_index: 9999, // 아래에서 renumberAndPersist가 실제 순서로 재계산함
    title,
    content: "",
  });

  if (error) {
    alert("문단을 추가하는 중 오류가 발생했습니다: " + error.message);
    return;
  }

  await loadDocument();
  await renumberAndPersist();
  await loadDocument();
}

async function handleRenameSection(sectionId, currentTitle) {
  const title = await openTextModal({
    title: "문단 이름 변경",
    label: "새 제목",
    initialValue: currentTitle,
    multiline: false,
    confirmLabel: "변경",
  });
  if (!title || title === currentTitle) return;

  const { error } = await supabase.from("sections").update({ title }).eq("id", sectionId);
  if (error) {
    alert("이름 변경 중 오류가 발생했습니다: " + error.message);
    return;
  }
  await loadDocument();
}

async function handleDeleteSection(sectionId) {
  if (!confirm("이 문단을 삭제하시겠습니까?\n삭제된 문단은 복구할 수 없습니다.")) return;

  const { error } = await supabase.from("sections").delete().eq("id", sectionId);
  if (error) {
    alert("삭제 중 오류가 발생했습니다: " + error.message);
    return;
  }

  await loadDocument();
  await renumberAndPersist();
  await loadDocument();
}

async function handleMoveSection(sectionId, direction) {
  const tree = currentPageData?.tree;
  if (!tree) return;

  const found = findNodeAndSiblings(tree, sectionId);
  if (!found) return;

  const { siblings, index } = found;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= siblings.length) return;

  [siblings[index], siblings[targetIndex]] = [siblings[targetIndex], siblings[index]];

  await renumberAndPersist();
  await loadDocument();
}

async function handleSectionSave(sectionId) {
  const textarea = root.querySelector(`#sec-${sectionId} .editor-textarea`);
  if (!textarea) return;
  const newContent = textarea.value;

  if (!confirm("변경사항을 저장하시겠습니까?")) return;
  if (!confirm("저장 후에는 페이지 내용이 즉시 변경됩니다.\n계속하시겠습니까?")) return;

  const saveBtn = root.querySelector(`.section-save-btn[data-section-id="${sectionId}"]`);
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "저장 중...";
  }

  const { error } = await supabase.from("sections").update({ content: newContent }).eq("id", sectionId);

  if (error) {
    console.error(error);
    alert("저장 중 오류가 발생했습니다: " + error.message);
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "저장";
    }
    return;
  }

  // 각주 동기화: 최종 본문에 남아있는 [n] 마커를 기준으로 footnotes 테이블을 맞춰준다
  // (각주 버튼으로 새로 추가한 것 -> insert / 마커를 지워서 더 이상 안 쓰는 기존 각주 -> delete)
  const usedNumbers = new Set([...newContent.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const toInsert = editingFootnotes.filter((f) => !f.id && usedNumbers.has(f.number));
  const toDelete = editingFootnotes.filter((f) => f.id && !usedNumbers.has(f.number));

  if (toInsert.length) {
    const { error: insertError } = await supabase
      .from("footnotes")
      .insert(toInsert.map((f) => ({ section_id: sectionId, number: f.number, content: f.content })));
    if (insertError) console.error("각주 추가 오류:", insertError);
  }
  if (toDelete.length) {
    const { error: deleteError } = await supabase
      .from("footnotes")
      .delete()
      .in("id", toDelete.map((f) => f.id));
    if (deleteError) console.error("각주 삭제 오류:", deleteError);
  }

  editingSectionId = null;
  editingFootnotes = [];
  await loadDocument();
  alert("✅ 저장되었습니다.");
}

// ============================================
// 인포박스(기본 정보) 저장
// ============================================
async function handleInfoboxSave() {
  const editorEl = root.querySelector(".infobox-editor");
  if (!editorEl) return;

  const nameInput = editorEl.querySelector(".infobox-name-input")?.value.trim() || "";
  const subtitle = editorEl.querySelector(".infobox-subtitle-input")?.value.trim() || null;
  const imageUrl = editorEl.querySelector(".infobox-image-input")?.value.trim() || null;
  const themeColor = editorEl.querySelector(".infobox-color-input")?.value || "#333333";

  if (!nameInput) {
    alert("이름은 비워둘 수 없습니다.");
    return;
  }

  const items = [...editorEl.querySelectorAll(".infobox-row-editor")]
    .map((row) => ({
      key: row.querySelector(".infobox-key-input")?.value.trim() || "",
      value: row.querySelector(".infobox-value-input")?.value ?? "",
    }))
    .filter((item) => item.key || item.value.trim());

  if (!confirm("변경사항을 저장하시겠습니까?")) return;
  if (!confirm("저장 후에는 페이지 내용이 즉시 변경됩니다.\n계속하시겠습니까?")) return;

  const saveBtn = root.querySelector(".infobox-save-btn");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "저장 중...";
  }

  const documentId = currentPageData?.doc?.id;
  const { error } = await supabase
    .from("documents")
    .update({ name: nameInput, subtitle, infobox: items, profile_image_url: imageUrl, theme_color: themeColor })
    .eq("id", documentId);

  if (error) {
    console.error(error);
    alert("저장 중 오류가 발생했습니다: " + error.message);
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "저장";
    }
    return;
  }

  // 각주 동기화: 문단 저장과 동일한 방식으로, 최종 값들에 남아있는 [n] 마커 기준으로 footnotes 테이블을 맞춘다
  const combinedText = items.map((item) => item.value).join("\n");
  const usedNumbers = new Set([...combinedText.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const toInsert = editingInfoboxFootnotes.filter((f) => !f.id && usedNumbers.has(f.number));
  const toDelete = editingInfoboxFootnotes.filter((f) => f.id && !usedNumbers.has(f.number));

  if (toInsert.length) {
    const { error: insertError } = await supabase
      .from("footnotes")
      .insert(toInsert.map((f) => ({ document_id: documentId, number: f.number, content: f.content })));
    if (insertError) console.error("인포박스 각주 추가 오류:", insertError);
  }
  if (toDelete.length) {
    const { error: deleteError } = await supabase
      .from("footnotes")
      .delete()
      .in("id", toDelete.map((f) => f.id));
    if (deleteError) console.error("인포박스 각주 삭제 오류:", deleteError);
  }

  editingInfobox = false;
  editingInfoboxFootnotes = [];
  await loadDocument();
  alert("✅ 저장되었습니다.");
}

// 인포박스 항목의 각주 버튼 클릭 -> 팝업으로 내용 입력받고, 번호를 자동 채번해서 커서 위치에 [n] 마커 삽입
// (인포박스 각주는 문단보다 먼저 전역 번호가 매겨짐 - assignGlobalFootnoteNumbers 참고)
async function handleInfoboxFootnoteButtonClick(rowEl) {
  const content = await openTextModal({
    title: "각주 추가",
    label: "각주 내용을 입력하세요",
    multiline: true,
    confirmLabel: "확인",
  });
  if (!content) return;

  const nextNumber = editingInfoboxFootnotes.reduce((max, f) => Math.max(max, f.number), 0) + 1;
  editingInfoboxFootnotes.push({ id: null, number: nextNumber, content });

  const textarea = rowEl?.querySelector(".infobox-value-input");
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const marker = `[${nextNumber}]`;
  textarea.value = textarea.value.slice(0, start) + marker + textarea.value.slice(end);
  const newCursor = start + marker.length;
  textarea.focus();
  textarea.setSelectionRange(newCursor, newCursor);
}

// 각주 목록 하단에서 기존 각주 내용을 직접 수정 (번호/마커는 그대로 두고 content만 갱신)
async function handleFootnoteEditClick(footnoteId) {
  const existing = (currentPageData?.footnoteList || []).find((f) => String(f.id) === String(footnoteId));
  if (!existing) return;

  const newContent = await openTextModal({
    title: "각주 수정",
    label: "각주 내용을 수정하세요",
    initialValue: existing.content,
    multiline: true,
    confirmLabel: "저장",
  });
  if (newContent === null || newContent === existing.content) return;

  const { error } = await supabase.from("footnotes").update({ content: newContent }).eq("id", footnoteId);
  if (error) {
    alert("각주 수정 중 오류가 발생했습니다: " + error.message);
    return;
  }

  await loadDocument();
}

function attachEditingHandlers() {
  root.addEventListener("click", async (e) => {
    // ------- 인포박스(기본 정보) 편집 -------
    const infoboxEditBtn = e.target.closest(".infobox-edit-btn");
    if (infoboxEditBtn) {
      editingInfobox = true;
      editingInfoboxFootnotes = await fetchDocumentFootnotes(currentPageData?.doc?.id);
      renderPage();
      root.querySelector(".infobox-key-input")?.focus();
      return;
    }

    const infoboxCancelBtn = e.target.closest(".infobox-cancel-btn");
    if (infoboxCancelBtn) {
      if (confirm("변경사항을 버리고 종료하시겠습니까?")) {
        editingInfobox = false;
        editingInfoboxFootnotes = [];
        renderPage();
      }
      return;
    }

    const infoboxSaveBtn = e.target.closest(".infobox-save-btn");
    if (infoboxSaveBtn) {
      await handleInfoboxSave();
      return;
    }

    const infoboxFootnoteBtn = e.target.closest(".infobox-footnote-btn");
    if (infoboxFootnoteBtn) {
      const rowEl = infoboxFootnoteBtn.closest(".infobox-row-editor");
      await handleInfoboxFootnoteButtonClick(rowEl);
      return;
    }

    const infoboxImageBtn = e.target.closest(".infobox-image-btn");
    if (infoboxImageBtn) {
      const rowEl = infoboxImageBtn.closest(".infobox-row-editor");
      const textarea = rowEl?.querySelector(".infobox-value-input");
      handleImageButtonClick(textarea, infoboxImageBtn);
      return;
    }

    const profileImageUploadBtn = e.target.closest(".infobox-profile-image-upload-btn");
    if (profileImageUploadBtn) {
      const urlInput = profileImageUploadBtn.closest(".infobox-image-url-row")?.querySelector(".infobox-image-input");
      handleProfileImageButtonClick(urlInput, profileImageUploadBtn);
      return;
    }

    const addInfoboxRowBtn = e.target.closest(".add-infobox-row-btn");
    if (addInfoboxRowBtn) {
      // 전체 리렌더를 하면 다른 행에 입력 중이던 값이 날아가므로, DOM에 행만 직접 추가한다
      const container = root.querySelector(".infobox-rows-editor");
      if (container) {
        const row = document.createElement("div");
        row.className = "infobox-row-editor";
        row.innerHTML = `
          <input type="text" class="infobox-key-input" placeholder="항목명">
          <div class="infobox-value-col">
            <textarea class="infobox-value-input" rows="2" placeholder="내용 (Enter로 줄바꿈)"></textarea>
            <div class="infobox-row-toolbar">
              <button type="button" class="infobox-footnote-btn" title="각주 추가">[각주]</button>
              <button type="button" class="infobox-image-btn" title="이미지 삽입">🖼</button>
            </div>
          </div>
          <button type="button" class="infobox-row-delete-btn" aria-label="항목 삭제">✕</button>
        `;
        container.appendChild(row);
        row.querySelector(".infobox-key-input")?.focus();
      }
      return;
    }

    const infoboxRowDeleteBtn = e.target.closest(".infobox-row-delete-btn");
    if (infoboxRowDeleteBtn) {
      infoboxRowDeleteBtn.closest(".infobox-row-editor")?.remove();
      return;
    }

    const footnoteEditBtn = e.target.closest(".footnote-edit-btn");
    if (footnoteEditBtn) {
      await handleFootnoteEditClick(footnoteEditBtn.dataset.footnoteId);
      return;
    }

    const editBtn = e.target.closest(".section-edit-btn");
    if (editBtn) {
      const sectionId = editBtn.dataset.sectionId;
      editingSectionId = sectionId;
      editingFootnotes = await fetchSectionFootnotes(sectionId);
      sectionPreviewOpen = false;
      sectionEditDraft = null;
      renderPage();
      root.querySelector(`#sec-${sectionId} .editor-textarea`)?.focus();
      return;
    }

    const cancelBtn = e.target.closest(".section-cancel-btn");
    if (cancelBtn) {
      if (confirm("변경사항을 버리고 종료하시겠습니까?")) {
        editingSectionId = null;
        editingFootnotes = [];
        sectionPreviewOpen = false;
        sectionEditDraft = null;
        renderPage();
      }
      return;
    }

    const saveBtn = e.target.closest(".section-save-btn");
    if (saveBtn) {
      handleSectionSave(saveBtn.dataset.sectionId);
      return;
    }

    const previewToggleBtn = e.target.closest(".section-preview-toggle-btn");
    if (previewToggleBtn) {
      const editorEl = previewToggleBtn.closest(".section-editor");
      if (previewToggleBtn.dataset.preview === "on") {
        // 편집 -> 미리보기: 현재 textarea 입력값을 잃지 않도록 임시 저장
        const textarea = editorEl?.querySelector(".editor-textarea");
        sectionEditDraft = textarea ? textarea.value : sectionEditDraft;
        sectionPreviewOpen = true;
      } else {
        sectionPreviewOpen = false;
      }
      renderPage();
      return;
    }

    const toolBtn = e.target.closest(".editor-tool-btn");
    if (toolBtn) {
      const editorEl = toolBtn.closest(".section-editor");
      const tool = toolBtn.dataset.tool;
      if (tool === "footnote") {
        handleFootnoteButtonClick(editorEl?.dataset.sectionId);
      } else if (tool === "image") {
        handleImageButtonClick(editorEl?.querySelector(".editor-textarea"), toolBtn);
      } else {
        const textarea = editorEl?.querySelector(".editor-textarea");
        if (textarea) insertWikiSyntax(textarea, tool);
      }
      return;
    }

    // ------- 문단 관리 (⋮) 메뉴 -------
    const menuBtn = e.target.closest(".section-menu-btn");
    if (menuBtn) {
      const id = menuBtn.dataset.sectionId;
      sectionMenuOpenId = sectionMenuOpenId === id ? null : id;
      renderPage();
      return;
    }

    const menuItem = e.target.closest(".section-menu-item");
    if (menuItem) {
      const action = menuItem.dataset.action;
      const sectionId = menuItem.dataset.sectionId;
      sectionMenuOpenId = null;
      renderPage();

      if (action === "add-sub") await handleAddSubsection(sectionId);
      else if (action === "rename") await handleRenameSection(sectionId, menuItem.dataset.currentTitle);
      else if (action === "move-up") await handleMoveSection(sectionId, "up");
      else if (action === "move-down") await handleMoveSection(sectionId, "down");
      else if (action === "delete") await handleDeleteSection(sectionId);
      else renderPage();
      return;
    }

    // ------- 하위 문단 / 최상위 문단 추가 -------
    const addSubBtn = e.target.closest(".add-subsection-btn");
    if (addSubBtn) {
      await handleAddSubsection(addSubBtn.dataset.parentId);
      return;
    }

    const addTopBtn = e.target.closest(".add-top-section-btn");
    if (addTopBtn) {
      await handleAddSubsection(null);
      return;
    }
  });

  // 메뉴가 열려 있는 상태에서 바깥을 클릭하면 닫기
  document.addEventListener("click", (e) => {
    if (sectionMenuOpenId && !e.target.closest(".section-menu-wrap")) {
      sectionMenuOpenId = null;
      renderPage();
    }
  });
}

function setupGroupNavToggle() {
  document.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest(".group-former-toggle");
    if (!toggleBtn) return;
    formerMembersOpen = !formerMembersOpen;
    if (currentPageData) renderPage();
  });
}

function setupBackToTop() {
  if (document.querySelector(".back-to-top")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "back-to-top";
  btn.setAttribute("aria-label", "맨 위로");
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  `;
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.body.appendChild(btn);

  window.addEventListener("scroll", () => {
    btn.classList.toggle("visible", window.scrollY > 400);
  });
}

function renderFootnoteList(footnoteList, isAdmin) {
  if (!footnoteList.length) return "";
  return `
    <ul class="footnotes-box">
      ${footnoteList
        .map(
          (f) => `<li id="fn-${f.globalNumber}">
            <a class="footnote-back-ref" href="#ref-${f.globalNumber}">[${f.globalNumber}]</a> <span class="footnote-text">${esc(f.content)}</span>
            ${
              isAdmin
                ? `<button type="button" class="footnote-edit-btn" data-footnote-id="${f.id}" aria-label="각주 수정">✏</button>`
                : ""
            }
          </li>`
        )
        .join("")}
    </ul>
  `;
}

// ============================================
// 페이지 렌더링 (캐시된 데이터로부터, 재조회 없이)
// ============================================
function renderPage() {
  if (!currentPageData) return;
  const { doc, tree, globalNumberMap, footnoteList, allDocs, slug, nameToSlugMap } = currentPageData;
  const footnoteContentMap = new Map(footnoteList.map((f) => [f.globalNumber, f.content]));
  const ctx = {
    globalNumberMap,
    footnoteContentMap,
    nameToSlugMap,
    isAdmin,
    editingSectionId,
    editingInfobox,
    sectionMenuOpenId,
    documentId: doc.id,
    themeColor: doc.theme_color || "#333333",
  };

  document.title = doc.name;

  root.innerHTML = `
    ${renderGroupNav(allDocs || [], slug)}
    <div class="doc-header">
      <h1 class="doc-title">${esc(doc.name)}</h1>
      <div class="updated-at">최근 수정 시각: ${formatDateTime(doc.updated_at)}</div>
    </div>
<div class="layout">

  <div class="layout-top">
    <div class="main-col">
      <div class="toc-box">
        <div class="toc-title">목차</div>
        ${renderTocList(tree)}
      </div>
    </div>

    ${renderInfobox(doc, ctx)}
  </div>

  <div class="layout-body">
    ${tree.map((n) => renderSection(n, 0, ctx)).join("")}
    ${isAdmin ? `<button type="button" class="add-top-section-btn">+ 새 최상위 문단 추가</button>` : ""}
    ${renderFootnoteList(footnoteList, isAdmin)}
  </div>

</div>
  `;
}

// ============================================
// 데이터 로드 (개별 문서 / id 없으면 그룹 전체 문서)
// ============================================
async function loadDocument() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("id") || GROUP_DOC_SLUG;

  root.innerHTML = `<div class="state-msg">불러오는 중...</div>`;

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("slug", slug)
    .single();

  if (docError || !doc) {
    currentPageData = null;
    root.innerHTML = `<div class="state-msg">'${esc(slug)}' 문서를 찾을 수 없습니다.</div>`;
    return;
  }

  const [{ data: sections, error: sectionsError }, { data: infoboxFootnotes }, { data: allDocs }] =
    await Promise.all([
      supabase.from("sections").select("*").eq("document_id", doc.id).order("order_index"),
      supabase.from("footnotes").select("*").eq("document_id", doc.id),
      supabase.from("documents").select("slug, name").order("created_at"),
    ]);

  if (sectionsError) {
    currentPageData = null;
    root.innerHTML = `<div class="state-msg">문단을 불러오는 중 오류가 발생했습니다.</div>`;
    return;
  }

  const sectionIds = (sections || []).map((s) => s.id);
  const { data: sectionFootnotes } = await supabase
    .from("footnotes")
    .select("*")
    .in("section_id", sectionIds.length ? sectionIds : ["00000000-0000-0000-0000-000000000000"]);

  const footnotesBySection = new Map();
  for (const f of sectionFootnotes || []) {
    if (!footnotesBySection.has(f.section_id)) footnotesBySection.set(f.section_id, []);
    footnotesBySection.get(f.section_id).push(f);
  }

  const tree = buildTree(sections || []);
  const orderedSections = flattenTree(tree);
  const { globalNumberMap, footnoteList } = assignGlobalFootnoteNumbers(
    doc,
    infoboxFootnotes || [],
    orderedSections,
    footnotesBySection
  );

  const nameToSlugMap = new Map((allDocs || []).map((d) => [d.name, d.slug]));

  currentPageData = { doc, tree, globalNumberMap, footnoteList, allDocs, slug, nameToSlugMap };
  editingSectionId = null;
  editingInfobox = false;
  editingInfoboxFootnotes = [];
  renderPage();
}

// ============================================
// 저장하지 않은 변경사항이 있는 상태에서 페이지 이탈(새로고침 / 뒤로가기 / 다른 문서 클릭 등) 방지
// ============================================
function hasUnsavedEdits() {
  return Boolean(editingSectionId) || editingInfobox;
}

function setupUnloadWarning() {
  window.addEventListener("beforeunload", (e) => {
    if (!hasUnsavedEdits()) return;
    e.preventDefault();
    e.returnValue = ""; // 크롬 등 최신 브라우저는 커스텀 문구를 지원하지 않고 기본 경고 문구만 표시함
  });
}

applyBrandColor();
applySiteBrand();
attachSectionToggleHandlers();
attachEditingHandlers();
setupBackToTop();
setupGroupNavToggle();
setupAdminAuthUI();
setupTextModal();
setupImageUpload();
setupProfileImageUpload();
setupUnloadWarning();
loadDocument();
