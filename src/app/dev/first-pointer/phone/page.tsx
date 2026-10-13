import { notFound } from 'next/navigation';
import { devPreviewAllowed } from '../../phone/devOnly';

export default function PhoneReview() {
  if (!devPreviewAllowed()) notFound();
  return <main className="min-h-screen bg-[#E8E7E3] px-3 py-6 text-[#1A1A2E]">
    <div className="mx-auto mb-4 max-w-[390px]">
      <h1 className="text-lg font-medium">Phone preview</h1>
      <p className="mt-1 text-sm text-gray-600">Try the mobile walkthrough here, using your mouse.</p>
      <a className="mt-2 inline-block text-sm underline" href="/dev/first-pointer">Back to desktop preview</a>
    </div>
    <iframe title="Roam mobile walkthrough" src="/dev/first-pointer" className="mx-auto block rounded-[24px] border-[6px] border-[#1A1A2E] bg-white shadow-xl" style={{ width: 402, maxWidth: '100%', height: 'min(856px, calc(100dvh - 154px))', minHeight: 420 }} />
  </main>;
}
