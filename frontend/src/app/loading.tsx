export default function Loading() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-void overflow-hidden">
      <div className="h-full bg-gradient-brand animate-loader-slide"></div>
    </div>
  );
}
