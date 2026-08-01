/**
 * Responsive page container shared across parent, driver, and admin screens.
 * Mobile-first with room to grow on tablet/desktop; leaves space for bottom nav.
 *
 * @param {'sm' | 'md' | 'lg' | 'xl' | 'full'} [props.width]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
const WIDTH = {
  sm: 'max-w-md',
  md: 'max-w-lg md:max-w-2xl',
  lg: 'max-w-lg md:max-w-3xl lg:max-w-5xl',
  xl: 'max-w-lg md:max-w-4xl lg:max-w-6xl',
  full: 'max-w-7xl',
};

export default function PageShell({
  children,
  width = 'md',
  className = '',
  as: Tag = 'div',
}) {
  const max = WIDTH[width] || WIDTH.md;
  return (
    <Tag
      className={`mx-auto w-full ${max} px-4 py-6 sm:px-6 pb-28 md:pb-32 lg:pb-12 ${className}`}
    >
      {children}
    </Tag>
  );
}
