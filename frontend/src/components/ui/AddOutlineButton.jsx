import { COLORS, BORDER_RADIUS } from '../../constants/uiConstants.js';

/** Bootstrap ~btn-sm btn-outline-primary sizing (compact create / add actions). */
const baseStyle = {
  padding: '6px 12px',
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 1.5,
  color: COLORS.PRIMARY,
  background: 'transparent',
  border: `1px solid ${COLORS.PRIMARY}`,
  borderRadius: BORDER_RADIUS.MD,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
  flexShrink: 0,
  fontFamily: 'inherit',
};

/** Bootstrap bi-plus-circle, 16×16 */
function PlusCircleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      fill="currentColor"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
      <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z" />
    </svg>
  );
}

function AddOutlineButton({ children, onClick, disabled = false, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...baseStyle,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = `${COLORS.PRIMARY}12`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      {...rest}
    >
      <PlusCircleIcon />
      {children}
    </button>
  );
}

export default AddOutlineButton;
