export default function LogoMark({ small }) {
  const s = small ? 22 : 32;
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <rect width="32" height="32" rx="8" fill="#1f7a6d" />
      <rect x="9" y="7" width="14" height="18" rx="2" fill="#fff" />
      <rect x="11.5" y="11" width="9" height="2" rx="1" fill="#c9d6d3" />
      <rect x="11" y="15" width="10" height="3.2" rx="1" fill="#ffc65a" />
      <rect x="11.5" y="20" width="6" height="2" rx="1" fill="#c9d6d3" />
    </svg>
  );
}
