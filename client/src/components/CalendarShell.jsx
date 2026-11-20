export default function CalendarShell({ className, children }) {
  return <div className={className ? `tf-calendar ${className}` : "tf-calendar"}>{children}</div>;
}
