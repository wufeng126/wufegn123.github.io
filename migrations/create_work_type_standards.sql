-- 标准工序清单表（主数据）
CREATE TABLE IF NOT EXISTS work_type_standards (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL UNIQUE,
  unit VARCHAR(20),
  category VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 默认标准工序数据（常用建筑劳务工序）
INSERT INTO work_type_standards (name, unit, category, sort_order) VALUES
  ('模板安装', 'm²', '模板工程', 1),
  ('模板拆除', 'm²', '模板工程', 2),
  ('钢筋制安', 't', '钢筋工程', 3),
  ('钢筋加工', 't', '钢筋工程', 4),
  ('混凝土浇筑', 'm³', '混凝土工程', 5),
  ('混凝土养护', 'm³', '混凝土工程', 6),
  ('砌体砌筑', 'm³', '砌体工程', 7),
  ('抹灰（一般）', 'm²', '装饰工程', 8),
  ('抹灰（外墙）', 'm²', '装饰工程', 9),
  ('地面找平', 'm²', '装饰工程', 10),
  ('墙面贴砖', 'm²', '装饰工程', 11),
  ('地面贴砖', 'm²', '装饰工程', 12),
  ('脚手架搭设', 'm²', '脚手架工程', 13),
  ('脚手架拆除', 'm²', '脚手架工程', 14),
  ('防水施工', 'm²', '防水工程', 15),
  ('保温施工', 'm²', '保温工程', 16),
  ('水电预埋', 'm²', '安装工程', 17),
  ('水电安装', 'm²', '安装工程', 18),
  ('消防管道安装', 'm', '安装工程', 19),
  ('通风管道安装', 'm²', '安装工程', 20)
ON CONFLICT (name) DO NOTHING;
