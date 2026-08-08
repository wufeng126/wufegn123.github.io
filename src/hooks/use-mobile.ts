import * as React from "react"

const MOBILE_BREAKPOINT = 768
const DINGTALK_MOBILE_BREAKPOINT = 900

function isDingTalkClient() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes("dingtalk") || ua.includes("ddclient")
}

function getIsMobileViewport() {
  if (typeof window === "undefined") return false
  return window.innerWidth < MOBILE_BREAKPOINT || (isDingTalkClient() && window.innerWidth < DINGTALK_MOBILE_BREAKPOINT)
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(() => {
    if (typeof window === "undefined") return undefined
    return getIsMobileViewport()
  })

  React.useEffect(() => {
    const onChange = () => {
      setIsMobile(getIsMobileViewport())
    }
    const mql = window.matchMedia(`(max-width: ${DINGTALK_MOBILE_BREAKPOINT - 1}px)`)
    onChange()
    mql.addEventListener("change", onChange)
    window.addEventListener("resize", onChange)
    return () => {
      mql.removeEventListener("change", onChange)
      window.removeEventListener("resize", onChange)
    }
  }, [])

  return !!isMobile
}
