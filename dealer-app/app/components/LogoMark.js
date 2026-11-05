// Don't Sign Yet: a pen stopped just above the signature line of a contract,
// with the gold "highlighter" bar shared with Insurance in English.
export default function LogoMark({ small }) {
  const s = small ? 22 : 32;
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <rect width="32" height="32" rx="8" fill="#1f7a6d" />
      <rect x="5" y="5" width="16" height="22" rx="2" fill="#fff" />
      <rect x="7.5" y="8.5" width="10" height="2" rx="1" fill="#c9d6d3" />
      <rect x="7" y="12.5" width="11" height="3.2" rx="1" fill="#ffc65a" />
      <path d="M7.5 23.5h11" stroke="#1f7a6d" strokeWidth="1.4" strokeLinecap="round" />
      <g transform="translate(-1 6) rotate(45 22.5 11)">
        <rect x="20.5" y="1.5" width="4" height="14" rx="1.2" fill="#fff" stroke="#1f7a6d" strokeWidth="1.2" />
        <path d="M20.5 15.5h4l-2 4z" fill="#ffc65a" stroke="#1f7a6d" strokeWidth="1" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
