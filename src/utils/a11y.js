/**
 * Accessibility helper: makes a non-interactive element (div, span, tr)
 * behave like a button for keyboard and screen reader users.
 */
export const clickableProps = (onClick) => ({
  role: "button",
  tabIndex: 0,
  onClick,
  onKeyDown: (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(e);
    }
  },
});
