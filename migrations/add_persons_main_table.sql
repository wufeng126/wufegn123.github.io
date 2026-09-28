-- ============================================================
-- 方案A：工人身份主档分离（persons / workers.person_id）
-- 背景：原 workers 表把"人"与"项目任职"绑定在同一行（project_id + (project_id,id_card) 唯一），
--       导致一人多项目时产生多条 worker 记录、多个 worker_id，工资/发放/考勤按不同 id 记录对不上。
-- 目标：persons = 全局唯一的人（身份证唯一）；workers = 某人在某项目的任职。personId 归并。
-- 幂等：可重复执行。
-- ============================================================

-- 1. persons 主档表
CREATE TABLE IF NOT EXISTS persons (
  id serial PRIMARY KEY,
  name varchar(100) NOT NULL,
  id_card varchar(18),
  phone varchar(20),
  bank_card varchar(30),
  gender varchar(10),
  age integer,
  is_blacklist boolean DEFAULT false,
  remark text,
  source_worker_id integer,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS persons_id_card_unique_idx ON persons(id_card) WHERE id_card IS NOT NULL AND id_card <> '';
CREATE INDEX IF NOT EXISTS persons_name_idx ON persons(name);

-- 2. 回填 persons：有身份证的每证一条
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM persons) THEN
    INSERT INTO persons (name, id_card, phone, bank_card, gender, age, is_blacklist, remark, source_worker_id, created_at, updated_at)
    SELECT DISTINCT ON (w.id_card) w.name, w.id_card, w.phone, w.bank_card, w.gender, w.age, w.is_blacklist, w.remark, w.id, w.created_at, now()
    FROM workers w
    WHERE w.id_card IS NOT NULL AND w.id_card <> ''
    ORDER BY w.id_card, w.id;
  END IF;
END $$;

-- 3. 回填 persons：无身份证的按（项目+姓名）归并
DO $$
BEGIN
  INSERT INTO persons (name, id_card, phone, bank_card, is_blacklist, source_worker_id, created_at, updated_at)
  SELECT DISTINCT ON (w.project_id, w.name) w.name, NULL, w.phone, w.bank_card, w.is_blacklist, w.id, w.created_at, now()
  FROM workers w
  WHERE (w.id_card IS NULL OR w.id_card = '')
    AND NOT EXISTS (
      SELECT 1 FROM persons p WHERE p.id_card IS NULL AND p.name = w.name AND p.source_worker_id = w.id
    )
  ORDER BY w.project_id, w.name, w.id;
END $$;

-- 4. workers 增加 person_id 列 + 回填关联
ALTER TABLE workers ADD COLUMN IF NOT EXISTS person_id integer;

DO $$
BEGIN
  UPDATE workers w SET person_id = p.id
  FROM persons p
  WHERE w.id_card IS NOT NULL AND w.id_card <> '' AND p.id_card = w.id_card;
END $$;

DO $$
BEGIN
  UPDATE workers w SET person_id = p.id
  FROM persons p
  WHERE (w.id_card IS NULL OR w.id_card = '')
    AND w.project_id IS NOT NULL
    AND w.person_id IS NULL
    AND p.id_card IS NULL
    AND p.name = w.name;
END $$;

-- 5. person_id 外键约束（保证重复执行不报错）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='workers'::regclass AND conname='workers_person_id_fkey') THEN
    ALTER TABLE workers ADD CONSTRAINT workers_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS workers_person_id_idx ON workers(person_id);

NOTIFY pgrst, 'reload schema';