// Inline SVG icons (Lucide-style, thin stroke 1.5)
const Icon = ({ name, size = 18, className = "", style = {} }) => {
  const s = { width: size, height: size, ...style };
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "phone":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>);
    case "mic":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>);
    case "phone-off":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67"/><path d="M5 5a14 14 0 0 0 .82 4.32"/><line x1="2" y1="2" x2="22" y2="22"/></svg>);
    case "copy":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>);
    case "check":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><polyline points="20 6 9 17 4 12"/></svg>);
    case "x":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>);
    case "lock":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>);
    case "shield":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>);
    case "sparkles":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 14l.7 1.7L21.5 16.5l-1.8.8L19 19l-.7-1.7L16.5 16.5l1.8-.8z"/></svg>);
    case "chevron-right":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><polyline points="9 18 15 12 9 6"/></svg>);
    case "chevron-left":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><polyline points="15 18 9 12 15 6"/></svg>);
    case "user":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
    case "users":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
    case "edit":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>);
    case "moon":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>);
    case "sun":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>);
    case "settings":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
    case "logout":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);
    case "search":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>);
    case "trending-up":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>);
    case "alert":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>);
    case "clipboard":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>);
    case "mail":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/></svg>);
    case "key":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>);
    case "info":
      return (<svg viewBox="0 0 24 24" style={s} className={className} {...stroke}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>);
    default:
      return null;
  }
};

window.Icon = Icon;
