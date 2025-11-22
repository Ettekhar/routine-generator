// components/Navbar.tsx
export default function Navbar() {
  return (
    <header className="border-b bg-white p-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <h1 className="text-lg font-semibold">Routine Generator - Admin</h1>
        <div>Signed in as <strong>Admin</strong></div>
      </div>
    </header>
  );
}
