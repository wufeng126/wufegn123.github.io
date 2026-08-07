"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* ═══════════════════════════════════════════════════
 * 精装渐变图标组件库（v2 定稿精确移植版）
 * 来源：outputs/图标精装版v2.html —— path 与渐变配色与原稿完全一致
 * 渐变体系：gb 深蓝 / gb-l 浅蓝 / gb-xl 极浅蓝 / go 橙 / go-l 浅橙
 *          gg 绿 / gg-l 浅绿 / gr 红 / gy 黄 / gv 紫 / gmeta 灰
 * 用法：<BrandIcon name="crane" size={24} className="..." />
 * ═══════════════════════════════════════════════════ */

export type BrandIconName =
  | "crane"        // 塔吊（施工/主 Logo）
  | "hardhat"      // 安全帽（人力）
  | "building"     // 建筑楼（项目）
  | "chart"        // 柱状图（经营分析）
  | "calculator"   // 计算器（预算/测算）
  | "book"         // 知识书（知识库）
  | "worker"       // 工人（班组）
  | "wrench"       // 扳手（供应商/维修）
  | "doc"          // 文档（报表/签证）
  | "alert"        // 警告（预警）
  | "trend"        // 趋势（经营增长）
  | "money"        // 钱币（工资/回款/付款）

const G = {
  gb: ["#4D8DFF", "#0E42A8"],
  gbl: ["#7FA8FF", "#4080FF"],
  gbxl: ["#D6E4FF", "#A8C6FF"],
  go: ["#FFA940", "#F77234"],
  gol: ["#FFC46B", "#FF9A2E"],
  gg: ["#36CF5A", "#009A2E"],
  ggl: ["#7BE29B", "#36CF5A"],
  gr: ["#FF6B6B", "#E0381E"],
  gy: ["#FFD666", "#F5A300"],
  gv: ["#9254DE", "#5B21B6"],
  gm: ["#9AA7B8", "#5A6675"],
} as const

interface BrandIconProps extends React.SVGProps<SVGSVGElement> {
  name: BrandIconName
  size?: number
}

/* 容器风格：浅色底 + 同色描边 + 彩色光晕（v2 原稿同款） */
const CONTAINER_TONE: Record<BrandIconName, string> = {
  crane:      "bg-blue-50 ring-blue-200/50 shadow-blue-300/30",
  building:   "bg-blue-50 ring-blue-200/50 shadow-blue-300/30",
  calculator: "bg-blue-50 ring-blue-200/50 shadow-blue-300/30",
  worker:     "bg-blue-50 ring-blue-200/50 shadow-blue-300/30",
  chart:      "bg-green-50 ring-green-200/50 shadow-green-300/30",
  trend:      "bg-green-50 ring-green-200/50 shadow-green-300/30",
  hardhat:    "bg-amber-50 ring-amber-200/50 shadow-amber-300/30",
  wrench:     "bg-orange-50 ring-orange-200/50 shadow-orange-300/30",
  book:       "bg-violet-50 ring-violet-200/50 shadow-violet-300/30",
  doc:        "bg-violet-50 ring-violet-200/50 shadow-violet-300/30",
  alert:      "bg-rose-50 ring-rose-200/50 shadow-rose-300/30",
  money:      "bg-green-50 ring-green-200/50 shadow-green-300/30",
}

export function BrandIcon({ name, size = 24, className, ...rest }: BrandIconProps) {
  // 顶层单次 useId（遵守 hooks 规则），渐变 id 统一带此前缀防冲突
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "")
  const gradId = (key: keyof typeof G) => `bi-${uid}-${key}`

  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    className: cn("inline-block shrink-0", className),
    "aria-hidden": true as const,
    ...rest,
  }

  const renderDefs = (keys: Array<keyof typeof G>) => (
    <defs>
      {keys.map((key) => (
        <linearGradient key={key} id={gradId(key)} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={G[key][0]} />
          <stop offset="1" stopColor={G[key][1]} />
        </linearGradient>
      ))}
    </defs>
  )

  /* ── 塔吊（v2 原稿） ── */
  if (name === "crane") {
    return (
      <svg {...common}>
        {renderDefs(["gb", "gbl", "go"])}
        <path d="M3 21h18" stroke="#C9CDD4" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="7.5" y="4.5" width="5" height="16.5" rx="1.2" fill={`url(#${gradId("gb")})`} />
        <rect x="11" y="3" width="10.5" height="2.2" rx="1.1" fill={`url(#${gradId("gb")})`} />
        <rect x="2.5" y="3" width="8.5" height="2.2" rx="1.1" fill={`url(#${gradId("gbl")})`} />
        <path d="M12 5l9.5 3.6M12 5l-8 3.6" stroke="#7FA8FF" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M19.7 8.6v4.6" stroke="#0E42A8" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="17.9" y="13.2" width="3.6" height="3.6" rx="1" fill={`url(#${gradId("go")})`} />
        <path d="M17 16.8l5.5 4" stroke="#C9CDD4" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }

  /* ── 安全帽（v2 原稿） ── */
  if (name === "hardhat") {
    return (
      <svg {...common}>
        {renderDefs(["gy"])}
        <path d="M4.5 15.5h15a1.5 1.5 0 0 1 1.5 1.5v1.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V17a1.5 1.5 0 0 1 1.5-1.5Z" fill={`url(#${gradId("gy")})`} />
        <path d="M9 9.5V6a2.5 2.5 0 0 1 2.5-2.5h1A2.5 2.5 0 0 1 15 6v3.5" fill="none" stroke={`url(#${gradId("gy")})`} strokeWidth="2" strokeLinecap="round" />
        <path d="M4.5 15.5v-2a7.5 7.5 0 0 1 15 0v2" fill="none" stroke={`url(#${gradId("gy")})`} strokeWidth="2" strokeLinecap="round" />
        <path d="M10 6.2a2 2 0 0 1 4 0" fill="none" stroke="#FFF6DC" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }

  /* ── 建筑楼（v2 原稿：主楼+配楼） ── */
  if (name === "building") {
    return (
      <svg {...common}>
        {renderDefs(["gb", "gbl", "gbxl"])}
        <rect x="7" y="3" width="10" height="18" rx="1.4" fill={`url(#${gradId("gbl")})`} opacity=".35" />
        <rect x="7" y="3" width="10" height="18" rx="1.4" fill="none" stroke={`url(#${gradId("gb")})`} strokeWidth="1.8" />
        <rect x="9.6" y="5.5" width="2.2" height="2.2" rx=".5" fill={`url(#${gradId("gb")})`} />
        <rect x="12.8" y="5.5" width="2.2" height="2.2" rx=".5" fill={`url(#${gradId("gbl")})`} />
        <rect x="9.6" y="9.2" width="2.2" height="2.2" rx=".5" fill={`url(#${gradId("gb")})`} />
        <rect x="12.8" y="9.2" width="2.2" height="2.2" rx=".5" fill={`url(#${gradId("gbl")})`} />
        <rect x="9.6" y="12.9" width="2.2" height="2.2" rx=".5" fill={`url(#${gradId("gb")})`} />
        <rect x="12.8" y="12.9" width="2.2" height="2.2" rx=".5" fill={`url(#${gradId("gbl")})`} />
        <rect x="2.5" y="13.5" width="4.5" height="7.5" rx="1" fill={`url(#${gradId("gbxl")})`} stroke={`url(#${gradId("gbl")})`} strokeWidth="1.4" />
        <path d="M3 21h21" stroke="#C9CDD4" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  /* ── 柱状图（v2 原稿） ── */
  if (name === "chart") {
    return (
      <svg {...common}>
        {renderDefs(["gg", "ggl", "go"])}
        <rect x="3" y="12" width="4.6" height="9" rx="1.2" fill={`url(#${gradId("ggl")})`} />
        <rect x="9.7" y="4" width="4.6" height="17" rx="1.2" fill={`url(#${gradId("gg")})`} />
        <rect x="16.4" y="8" width="4.6" height="13" rx="1.2" fill={`url(#${gradId("go")})`} />
        <path d="M3 21h19" stroke="#C9CDD4" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  /* ── 计算器（v2 原稿） ── */
  if (name === "calculator") {
    return (
      <svg {...common}>
        {renderDefs(["gb", "gbl"])}
        <rect x="4.5" y="2.5" width="15" height="19" rx="2.5" fill={`url(#${gradId("gb")})`} />
        <rect x="6.8" y="4.8" width="10.4" height="5" rx="1.4" fill="#fff" opacity=".95" />
        <circle cx="8.6" cy="13.2" r="1.1" fill="#fff" opacity=".9" />
        <circle cx="12" cy="13.2" r="1.1" fill="#fff" opacity=".9" />
        <circle cx="15.4" cy="13.2" r="1.1" fill="#fff" opacity=".9" />
        <circle cx="8.6" cy="16.8" r="1.1" fill="#fff" opacity=".7" />
        <circle cx="12" cy="16.8" r="1.1" fill="#fff" opacity=".7" />
        <rect x="13.9" y="15.8" width="3.6" height="3" rx=".8" fill="#fff" opacity=".85" />
        <rect x="8.1" y="18.4" width="8" height="1.7" rx=".85" fill={`url(#${gradId("gbl")})`} opacity=".9" />
      </svg>
    )
  }

  /* ── 知识书（v2 原稿） ── */
  if (name === "book") {
    return (
      <svg {...common}>
        {renderDefs(["gv"])}
        <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2H9a4 4 0 0 1 3 1.3A4 4 0 0 1 15 2h3.5A2.5 2.5 0 0 1 21 4.5V17a2.5 2.5 0 0 1-2.5 2.5H15a3 3 0 0 0-3 3 3 3 0 0 0-3-3H5.5A2.5 2.5 0 0 1 3 17Z" fill={`url(#${gradId("gv")})`} opacity=".28" />
        <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2H9a4 4 0 0 1 3 1.3A4 4 0 0 1 15 2h3.5A2.5 2.5 0 0 1 21 4.5V17a2.5 2.5 0 0 1-2.5 2.5H15a3 3 0 0 0-3 3 3 3 0 0 0-3-3H5.5A2.5 2.5 0 0 1 3 17Z" fill="none" stroke={`url(#${gradId("gv")})`} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 4v17.5" stroke={`url(#${gradId("gv")})`} strokeWidth="1.5" />
        <path d="M8 7h3M8 10h3M8 13h3" stroke={`url(#${gradId("gv")})`} strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
        <path d="M13.5 7.5h2.5M13.5 10.5h2.5" stroke={`url(#${gradId("gv")})`} strokeWidth="1.4" strokeLinecap="round" opacity=".5" />
      </svg>
    )
  }

  /* ── 工人（v2 原稿） ── */
  if (name === "worker") {
    return (
      <svg {...common}>
        {renderDefs(["gb", "gbl"])}
        <circle cx="9" cy="7.5" r="3.2" fill={`url(#${gradId("gb")})`} />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0" fill={`url(#${gradId("gbl")})`} />
        <circle cx="17" cy="8" r="2.4" fill={`url(#${gradId("gbl")})`} opacity=".9" />
        <path d="M15.5 14.8a4.5 4.5 0 0 1 5 5.2" fill="none" stroke={`url(#${gradId("gbl")})`} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  /* ── 扳手（v2 原稿） ── */
  if (name === "wrench") {
    return (
      <svg {...common}>
        {renderDefs(["gm", "go"])}
        <path d="M14.9 6.4a1 1 0 0 0 0 1.4l1.4 1.4a1 1 0 0 0 1.4 0l3.3-3.3a5.2 5.2 0 0 1-6.9 6.9L8 18.4a1.9 1.9 0 0 1-2.7-2.7l6.2-6.1a5.2 5.2 0 0 1 6.9-6.9l-3.3 3.3a1 1 0 0 1-.2.4Z" fill={`url(#${gradId("gm")})`} opacity=".9" />
        <path d="M8 18.4 5.6 20.8a1.9 1.9 0 0 1-2.7-2.7l2.4-2.4" fill="none" stroke={`url(#${gradId("go")})`} strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }

  /* ── 文档（v2 原稿） ── */
  if (name === "doc") {
    return (
      <svg {...common}>
        {renderDefs(["gv", "gg"])}
        <path d="M6 21.5h12a2 2 0 0 0 2-2V8l-5-5H6a2 2 0 0 0-2 2v14.5a2 2 0 0 0 2 2Z" fill="#fff" stroke={`url(#${gradId("gv")})`} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M15 3v5h5" fill="none" stroke={`url(#${gradId("gv")})`} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="m9.5 13 1.8 1.8 3.6-3.8" fill="none" stroke={`url(#${gradId("gg")})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  /* ── 警告（v2 原稿） ── */
  if (name === "alert") {
    return (
      <svg {...common}>
        {renderDefs(["gr"])}
        <path d="m21.5 18-8.2-14.2a1.6 1.6 0 0 0-2.7 0L2.5 18a1.6 1.6 0 0 0 1.4 2.5h16.2a1.6 1.6 0 0 0 1.4-2.5Z" fill={`url(#${gradId("gr")})`} />
        <rect x="11" y="9" width="2" height="5.2" rx="1" fill="#fff" />
        <circle cx="12" cy="17.2" r="1.1" fill="#fff" />
      </svg>
    )
  }

  /* ── 趋势（v2 原稿：上升柱+星） ── */
  if (name === "trend") {
    return (
      <svg {...common}>
        {renderDefs(["gg", "ggl"])}
        <rect x="3" y="13" width="4.4" height="8" rx="1.2" fill={`url(#${gradId("ggl")})`} />
        <rect x="9.8" y="8.5" width="4.4" height="12.5" rx="1.2" fill={`url(#${gradId("gg")})`} />
        <rect x="16.6" y="4" width="4.4" height="17" rx="1.2" fill={`url(#${gradId("gg")})`} opacity=".55" />
        <path d="M21 2.5 20.2 5 17.7 5.8 20.2 6.6 21 9.1 21.8 6.6 24.3 5.8 21.8 5Z" fill={`url(#${gradId("gg")})`} transform="translate(-3 -1.6)" />
      </svg>
    )
  }

  /* ── 钱币（v2 风格：绿渐变硬币 + ¥） ── */
  if (name === "money") {
    return (
      <svg {...common}>
        {renderDefs(["gg", "ggl"])}
        <circle cx="12" cy="12" r="9" fill={`url(#${gradId("ggl")})`} />
        <circle cx="12" cy="12" r="6.4" fill={`url(#${gradId("gg")})`} />
        <path d="M10.7 15.4c.4.9 1.6 1.5 2.8 1.5 1.6 0 2.8-.9 2.8-2.1 0-2.8-5.6-1.6-5.6-4.3 0-1.3 1.2-2.1 2.7-2.1 1.2 0 2.2.4 2.5 1.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </svg>
    )
  }

  /* 兜底：塔吊 */
  return (
    <svg {...common}>
      {renderDefs(["gb", "gbl", "go"])}
      <path d="M3 21h18" stroke="#C9CDD4" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="7.5" y="4.5" width="5" height="16.5" rx="1.2" fill={`url(#${gradId("gb")})`} />
      <rect x="11" y="3" width="10.5" height="2.2" rx="1.1" fill={`url(#${gradId("gb")})`} />
      <rect x="2.5" y="3" width="8.5" height="2.2" rx="1.1" fill={`url(#${gradId("gbl")})`} />
      <path d="M12 5l9.5 3.6M12 5l-8 3.6" stroke="#7FA8FF" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M19.7 8.6v4.6" stroke="#0E42A8" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="17.9" y="13.2" width="3.6" height="3.6" rx="1" fill={`url(#${gradId("go")})`} />
      <path d="M17 16.8l5.5 4" stroke="#C9CDD4" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export default BrandIcon

/* ═══════════════════════════════════════════════════
 * 容器版：圆角渐变浅色底 + 同色描边 + 彩色光晕（v2 原稿同款）
 * 用法：<BrandIconContainer name="crane" size={28} />  // 适合卡片/品牌区
 * ═══════════════════════════════════════════════════ */
export interface BrandIconContainerProps {
  name: BrandIconName
  size?: number
  className?: string
}

export function BrandIconContainer({ name, size = 28, className }: BrandIconContainerProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-2xl p-3 ring-1 shadow-lg",
        CONTAINER_TONE[name],
        className
      )}
    >
      <BrandIcon name={name} size={size} />
    </span>
  )
}
