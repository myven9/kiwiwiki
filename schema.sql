-- ============================================
-- 개인 위키 프로젝트 - Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에서 전체 실행
-- ============================================

-- 1. 문서 (친구 한 명 = 문서 한 개)
create table documents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,              -- URL id: person.html?id=friend01
  name text not null,                     -- 문서 제목 (친구 이름)
  infobox jsonb not null default '[]',    -- [{"key":"이름","value":"홍길동"}, ...]
  profile_image_url text,                 -- Supabase Storage 경로
  subtitle text,                          -- 이름 밑에 작게 표시할 부제 (영문 이름/한자 등, 선택)
  theme_color text not null default '#333333',  -- 인포박스 테마 색상 (사람마다 다르게)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. 문단 (계층 구조, 자기참조)
create table sections (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  parent_id uuid references sections(id) on delete cascade,  -- null이면 최상위 문단
  order_index int not null default 0,     -- 같은 부모 내 순서
  title text not null,                    -- "유아기 (0~4세)"
  number text,                            -- "2.1" 표시용 (재계산 시 갱신)
  content text not null default '',       -- 위키 문법 + 각주 마커([1]) 섞인 본문
  updated_at timestamptz not null default now()
);

-- 3. 각주 (문단 또는 인포박스 중 하나에 종속)
create table footnotes (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references sections(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,  -- 인포박스에 다는 각주는 이쪽
  number int not null,                    -- 소속 범위(문단 또는 인포박스) 내 표시 번호
  content text not null,
  constraint footnotes_owner_check check (
    (section_id is not null and document_id is null) or
    (section_id is null and document_id is not null)
  )
);

-- 4. 관리자 계정 (공용 계정 1행만 사용, 클라이언트에서 직접 조회 불가)
create table admin_credentials (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null             -- bcrypt 등으로 해시, 평문 저장 금지
);

-- ============================================
-- 인덱스
-- ============================================
create index idx_sections_document_id on sections(document_id);
create index idx_sections_parent_id on sections(parent_id);
create index idx_footnotes_section_id on footnotes(section_id);
create index idx_footnotes_document_id on footnotes(document_id);
create index idx_documents_slug on documents(slug);

-- ============================================
-- updated_at 자동 갱신
-- ============================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_documents_updated_at
  before update on documents
  for each row execute function set_updated_at();

create trigger trg_sections_updated_at
  before update on sections
  for each row execute function set_updated_at();

-- ============================================
-- RLS (Row Level Security)
-- ============================================
alter table documents enable row level security;
alter table sections enable row level security;
alter table footnotes enable row level security;
alter table admin_credentials enable row level security;

-- 읽기는 누구나 가능 (2단계 읽기 전용 템플릿에서 사용)
create policy "public read documents" on documents for select using (true);
create policy "public read sections" on sections for select using (true);
create policy "public read footnotes" on footnotes for select using (true);

-- 쓰기(insert/update/delete)는 로그인한 사용자(관리자)만 가능
-- 공용 관리자 계정 하나만 로그인 가능하므로, "로그인 되어 있다 = 관리자다" 로 취급한다
create policy "admin write documents" on documents for all
  to authenticated using (true) with check (true);
create policy "admin write sections" on sections for all
  to authenticated using (true) with check (true);
create policy "admin write footnotes" on footnotes for all
  to authenticated using (true) with check (true);

-- admin_credentials 는 정책을 만들지 않음 = 클라이언트에서 조회 자체가 불가능
-- (참고: 관리자 인증은 Supabase Auth의 공용 계정으로 처리하므로 이 테이블은 현재 미사용 상태)

-- ============================================
-- 테스트용 샘플 데이터 (원하면 실행, 아니면 건너뛰어도 됨)
-- ============================================
insert into documents (slug, name, infobox, theme_color) values (
  'friend01',
  '홍길동',
  '[
    {"key": "이름", "value": "홍길동"},
    {"key": "국적", "value": "대한민국"},
    {"key": "MBTI", "value": "INFP"}
  ]'::jsonb,
  '#c6daf0'
);

-- 위 insert 후 documents.id 를 복사해서 아래 document_id 자리에 넣고 실행
-- select id from documents where slug = 'friend01';

-- insert into sections (document_id, parent_id, order_index, title, number, content) values
--   ('<documents.id 붙여넣기>', null, 1, '개요', '1', '홍길동은 대한민국 국적의 인물이다.[1]'),
--   ('<documents.id 붙여넣기>', null, 2, '생애', '2', '');

-- insert into footnotes (section_id, number, content) values
--   ('<위 개요 section.id>', 1, '2026년 기준');

-- ============================================
-- Storage: 본문 삽입 이미지 (관리자 모드 이미지 삽입 기능용)
-- ============================================
-- 1) Supabase 대시보드 > Storage 에서 버킷을 먼저 생성해야 합니다.
--    버킷 이름: wiki-images
--    Public bucket: 켜기 (읽기는 누구나 가능해야 이미지가 문서에 표시됨)
--
-- 2) 버킷 생성 후 아래 정책을 SQL Editor 에서 실행 (업로드/수정/삭제는 로그인한 관리자만 가능)

create policy "public read wiki-images"
  on storage.objects for select
  using (bucket_id = 'wiki-images');

create policy "admin insert wiki-images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'wiki-images');

create policy "admin update wiki-images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'wiki-images');

create policy "admin delete wiki-images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'wiki-images');
