"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* ═══════════════════════════════════════════════════
 * 建筑主题加载动画组件库（团队融合版）
 * 用法：<Loading type="crane" label="正在加载..." />
 * 场景映射：crane=页面级 / helmet=表格 / bricks=表单提交
 *          level=数据同步 / mixer=导入导出 / tape=路由 / badge=状态
 * ═══════════════════════════════════════════════════ */

export type LoadingType = "crane" | "tape" | "badge" | "bricks" | "level" | "mixer" | "helmet"

const LOADING_KF = `
@keyframes bl-crane-swing{0%,100%{transform:rotate(0)}50%{transform:rotate(-3deg)}}
@keyframes bl-crane-lift{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
@keyframes bl-crane-load{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
@keyframes bl-tape-slide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
@keyframes bl-badge-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.12);opacity:.85}}
@keyframes bl-brick-drop{0%{transform:translateY(-18px);opacity:0}60%{transform:translateY(0);opacity:1}80%{transform:translateY(-4px)}100%{transform:translateY(0)}}
@keyframes bl-brick-check{0%{transform:scale(0)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes bl-level-scan{0%,100%{transform:translateX(-14px)}50%{transform:translateX(14px)}}
@keyframes bl-mixer-rock{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes bl-mixer-drop{0%{transform:translateY(-8px);opacity:0}70%{opacity:1}100%{transform:translateY(3px);opacity:0}}
@keyframes bl-helmet-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes bl-bar-fill{0%{width:0}100%{width:100%}}
@keyframes bl-spin{to{transform:rotate(360deg)}}
`

const STYLE_ID = "bl-loading-styles"

function ensureStyles() {
  if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = LOADING_KF
    document.head.appendChild(style)
  }
}

/* ── 通用进度条（混凝土纹理） ── */
function ProgressBar({ className, accent = "#E67E22" }: { className?: string; accent?: string }) {
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: "55%",
          background: `repeating-linear-gradient(45deg, ${accent} 0 6px, rgba(255,255,255,.35) 6px 9px)`,
          animation: "bl-bar-fill 2.4s ease-in-out infinite",
        }}
      />
    </div>
  )
}

/* ── 1. 塔吊吊装（页面级） ── */
function CraneLoading({ label }: { label?: string }) {
  return (
    <div className="flex w-full max-w-[260px] flex-col items-center gap-4">
      <div className="relative flex h-20 w-44 items-end justify-center" style={{ animation: "bl-crane-swing 2.8s ease-in-out infinite", transformOrigin: "50% 100%" }}>
        {/* 塔身 */}
        <div className="h-16 w-1.5 bg-primary" style={{ position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%)" }} />
        {/* 吊臂 */}
        <div className="h-1.5 w-36 rounded-full bg-primary" style={{ position: "absolute", left: "50%", top: "10px", transform: "translateX(-50%)" }} />
        {/* 斜拉线 */}
        <div className="w-px bg-primary/50" style={{ position: "absolute", left: "50%", top: "12px", transform: "translateX(26px) rotate(38deg)", height: 34 }} />
        {/* 吊绳 + 吊物 */}
        <div className="w-px bg-slate-400" style={{ position: "absolute", right: "26px", top: "12px", height: 22, animation: "bl-crane-lift 2.8s ease-in-out infinite" }} />
        <div
          className="h-3.5 w-3.5 rounded-sm"
          style={{ position: "absolute", right: "19.5px", top: "34px", background: "#FF7D00", animation: "bl-crane-load 2.8s ease-in-out infinite" }}
        />
        {/* 底座 */}
        <div className="h-1 w-24 rounded-full bg-primary/70" style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)" }} />
      </div>
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
      <ProgressBar className="w-44" />
    </div>
  )
}

/* ── 2. 警戒带进度条（路由/表格） ── */
function TapeLoading({ label }: { label?: string }) {
  return (
    <div className="flex w-full max-w-[260px] flex-col items-center gap-3">
      <div
        className="h-2.5 w-52 overflow-hidden rounded-full border border-border"
        style={{ background: "repeating-linear-gradient(45deg, #F2B33D 0 10px, #2B2B2B 10px 20px)" }}
      >
        <div className="h-full w-1/3 rounded-full bg-white/80" style={{ animation: "bl-tape-slide 1.6s ease-in-out infinite" }} />
      </div>
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
    </div>
  )
}

/* ── 3. 施工徽章脉动（状态） ── */
function BadgeLoading({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25"
        style={{ animation: "bl-badge-pulse 1.4s ease-in-out infinite" }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 19 5.6v5.3c0 4.6-2.9 8-7 9.6-4.1-1.6-7-5-7-9.6V5.6L12 3Z" />
        </svg>
      </div>
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
    </div>
  )
}

/* ── 4. 砖块堆叠（表单提交） ── */
function BricksLoading({ label }: { label?: string }) {
  const bricks = [0, 1, 2, 3]
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex h-20 w-16 flex-col items-center justify-end gap-1">
        {bricks.map((i) => (
          <div
            key={i}
            className="h-3.5 w-14 rounded-sm"
            style={{
              background: "linear-gradient(90deg,#E8734A,#C94A2B)",
              border: "1px solid rgba(0,0,0,.15)",
              animation: `bl-brick-drop .7s cubic-bezier(.34,1.4,.64,1) ${i * 0.28}s forwards`,
              opacity: 0,
            }}
          />
        ))}
        <div className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500" style={{ animation: "bl-brick-check .5s 1.2s ease-out forwards", transform: "scale(0)" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
      </div>
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
    </div>
  )
}

/* ── 5. 水平仪校准（数据同步） ── */
function LevelLoading({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-4 w-44 rounded-full border border-border bg-muted">
        <div
          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,.6)]"
          style={{ left: "50%", animation: "bl-level-scan 1.8s ease-in-out infinite" }}
        />
      </div>
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
    </div>
  )
}

/* ── 6. 搅拌罐摇摆（导入导出） ── */
function MixerLoading({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-16 w-16" style={{ animation: "bl-mixer-rock 1.2s ease-in-out infinite", transformOrigin: "50% 100%" }}>
        <div className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-slate-300">
          <div className="h-6 w-6 rounded-full bg-slate-200" style={{ background: "repeating-conic-gradient(#CBD5E1 0 15%, #94A3B8 15% 30%)" }} />
        </div>
        <div className="absolute left-1/2 top-0 h-3 w-2 -translate-x-1/2 rounded-t bg-slate-400" />
      </div>
      <div className="flex h-4 items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "#FF7D00", animation: `bl-mixer-drop .9s ease-in ${i * 0.22}s infinite` }}
          />
        ))}
      </div>
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
    </div>
  )
}

/* ── 7. 安全帽浇筑（表格加载） ── */
function HelmetLoading({ label }: { label?: string }) {
  return (
    <div className="flex w-full max-w-[240px] flex-col items-center gap-3">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 ring-2 ring-amber-300"
        style={{ animation: "bl-helmet-float 1.3s ease-in-out infinite" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#F2A71B" stroke="#C96F00" strokeWidth="1.2">
          <path d="M4.5 15.5h15v2.2a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-2.2Z" />
          <path d="M5 15.5c0-4 2.6-7.2 7-7.2s7 3.2 7 7.2" />
        </svg>
      </div>
      <ProgressBar accent="#F2A71B" className="w-40" />
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
    </div>
  )
}

const COMPONENTS: Record<LoadingType, (props: { label?: string }) => React.ReactElement> = {
  crane: CraneLoading,
  tape: TapeLoading,
  badge: BadgeLoading,
  bricks: BricksLoading,
  level: LevelLoading,
  mixer: MixerLoading,
  helmet: HelmetLoading,
}

export interface LoadingProps {
  type?: LoadingType
  label?: string
  /** 容器内联模式（用于按钮/小块），默认居中整块 */
  inline?: boolean
  className?: string
}

export function Loading({ type = "crane", label, inline, className }: LoadingProps) {
  React.useEffect(() => {
    ensureStyles()
  }, [])

  const Comp = COMPONENTS[type]
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center",
        inline ? "" : "min-h-[160px]",
        className
      )}
    >
      <Comp label={label} />
    </div>
  )
}

/** 页面级全屏加载（根 loading.tsx 使用） */
export function FullPageLoading({ label = "正在加载..." }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <Loading type="crane" label={label} />
    </div>
  )
}

export default Loading
