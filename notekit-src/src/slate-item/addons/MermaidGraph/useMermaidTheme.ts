import React from 'react'

export function useMermaidTheme() {
  const [night, setNight] = React.useState(() => document.body.classList.contains('night-mode'))
  React.useEffect(() => {
    const observer = new MutationObserver(() => setNight(document.body.classList.contains('night-mode')))
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return night
}
