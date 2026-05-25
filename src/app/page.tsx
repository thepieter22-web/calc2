import MatSimulator from "@/components/MatSimulator/MatSimulator";

export default function Page() {
  return (
    <main className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Logomat Simulator</h1>
        <p className="text-neutral-600 mt-1">
          Kies type mat, plaatsing, oriëntatie, rand, maat (mm), kleur en upload je logo.
          Sleep/zoom/rotateer het logo en exporteer je preview.
        </p>
      </div>

      <MatSimulator />
    </main>
  );
}
