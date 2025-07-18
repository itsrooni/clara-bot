import dynamic from 'next/dynamic';
const ClaraChatbot = dynamic(() => import('../components/ClaraChatbot'), { ssr: false });

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <h1 className="text-3xl font-bold">Welcome to Nestzone</h1>
      <ClaraChatbot />
    </main>
  );
}
