import React from 'react'

// The tab strip. Each tab shows its widget count, or, when `badges[tab.id]` is above zero,
// that number as a badge instead: something waiting to be acted on (the open PO
// questions). `titles` maps a widget id to its title, for the tooltip listing a tab's widgets.
export default function TabBar({ tabs, activeId, onShow, badges = {}, titles = {} }) {
  return (
    <nav className="tabbar" role="tablist">
      {tabs.map((t) => (
        <div key={t.id} className={'tab' + (t.id === activeId ? ' active' : '')}>
          <button
            className="tab-name"
            role="tab"
            aria-selected={t.id === activeId}
            onClick={() => onShow(t.id)}
            title={t.ids.map((i) => titles[i] ?? i).join(' · ')}
          >
            {t.name}{' '}
            {badges[t.id] > 0
              ? <span className="tab-badge" aria-label={`${badges[t.id]} open`}>{badges[t.id]}</span>
              : <span className="tab-n">{t.ids.length}</span>}
          </button>
        </div>
      ))}
    </nav>
  )
}
