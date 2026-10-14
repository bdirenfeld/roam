'use client';
import { useEffect, useRef, useState } from 'react';
import { lessons, type LessonId } from './lessonState';

export default function LessonReview() {
  const [lesson, setLesson] = useState<LessonId>('bookings');
  const [phone, setPhone] = useState(false);
  const [status, setStatus] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(1100);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(entries => setAvailableWidth(entries[0].contentRect.width));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const frameWidth = phone ? 402 : Math.max(1100, availableWidth);
  const scale = Math.min(1, availableWidth / frameWidth);
  const command = (action: string) => {
    frame.current?.contentWindow?.postMessage({ type: 'roam-lesson-review', action }, location.origin);
    setStatus(action === 'resume' ? 'Guidance resumed. Completed lessons stay complete; use Start again to replay.' : 'Lesson restarted.');
  };
  return <main className="min-h-screen bg-[#F5F4F1] p-4 text-[#1A1A2E] md:p-6">
    <header className="mx-auto mb-4 max-w-[1440px]">
      <p className="text-[11px] uppercase tracking-[.16em] text-[#B0541F]">Local design review · not live</p>
      <h1 className="mt-1 text-2xl">A little help, right where you need it.</h1>
      <p className="mt-2 text-sm text-gray-500">Real app screens with disposable data. Booking uploads and invitations are simulated.</p>
      <a href="/dev/lessons/app" className="mt-2 inline-block text-sm text-activity underline underline-offset-4">Try the app’s Walkthrough menu</a>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Choose a lesson">
        {(Object.keys(lessons) as LessonId[]).map(id => <button key={id} aria-pressed={lesson === id} onClick={() => { setLesson(id); setStatus(''); }} className={`min-h-11 rounded-full border px-4 text-sm ${lesson === id ? 'bg-[#1A1A2E] text-white' : 'border-black/15'}`}>{lessons[id].title}</button>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>{lessons[lesson].outcome}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button aria-pressed={!phone} onClick={() => setPhone(false)} className={!phone ? 'font-semibold underline underline-offset-4' : ''}>Desktop</button>
          <button aria-pressed={phone} onClick={() => setPhone(true)} className={phone ? 'font-semibold underline underline-offset-4' : ''}>Phone</button>
          <span className="text-black/20">|</span>
          <button onClick={() => command('resume')}>Continue lesson</button>
          <button onClick={() => command('restart')}>Start again</button>
        </div>
      </div>
      <p role="status" className="sr-only">{status}</p>
    </header>
    <div ref={stage} className="relative mx-auto max-w-[1440px]" style={{ height: (phone ? 844 : 860) * scale }}><iframe ref={frame} key={lesson} title={`${lessons[lesson].title} — native app preview`} src={`/dev/lessons/${lesson}`} className="absolute block origin-top-left bg-white" style={{ width: frameWidth, height: phone ? 844 : 860, left: Math.max(0, (availableWidth - frameWidth * scale) / 2), transform: `scale(${scale})`, border: phone ? '6px solid #1A1A2E' : '1px solid #d5d4d1', borderRadius: phone ? 28 : 12 }} /></div>
    <p className="mx-auto mt-3 max-w-[1440px] text-xs text-gray-500">These controls are only for this review. In the app, lessons use your current screen and device.</p>
  </main>;
}
