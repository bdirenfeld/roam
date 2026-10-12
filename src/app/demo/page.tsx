import { Suspense } from 'react';
import DemoClient from './DemoClient';
export default function DemoPage({ searchParams }: { searchParams: { view?: string; day?: string; card?: string; training?: string } }) {
  return <Suspense fallback={<p>Opening your sample journey…</p>}><DemoClient initialView={searchParams.view} initialDay={searchParams.day} initialCard={searchParams.card} initialTraining={searchParams.training === 'true'} /></Suspense>;
}
