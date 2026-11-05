// A contract page with a highlighted line and a car underneath it.
export default function LogoMark({ small }) {
  const s = small ? 22 : 32;
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <rect width="32" height="32" rx="8" fill="#1f7a6d" />
      <rect x="9" y="5" width="14" height="16" rx="2" fill="#fff" />
      <rect x="11.5" y="8.5" width="9" height="2" rx="1" fill="#c9d6d3" />
      <rect x="11" y="12.5" width="10" height="3.2" rx="1" fill="#ffc65a" />
      <rect x="11.5" y="17" width="6" height="2" rx="1" fill="#c9d6d3" />
      <path d="M7 27v-2.2l1.6-3h14.8l1.6 3V27z" fill="#fff" />
      <circle cx="11" cy="27" r="1.6" fill="#1f7a6d" stroke="#fff" strokeWidth="1" />
      <circle cx="21" cy="27" r="1.6" fill="#1f7a6d" stroke="#fff" strokeWidth="1" />
    </svg>
  );
}
