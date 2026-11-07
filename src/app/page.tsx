// The home page. For now it says what the app is. Later it sends people to the case list.
export default function HomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Prequal Tracker</h1>
      <p className="mt-2 text-slate-600">
        Subcontractor prequalification with AI response triage.
      </p>
    </div>
  );
}
